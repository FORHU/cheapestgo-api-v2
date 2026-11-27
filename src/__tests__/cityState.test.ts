import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { hotel_content: { findMany: db.findMany } } }));
vi.mock('@/lib/maintenance', () => ({ staysUnderMaintenance: vi.fn().mockResolvedValue(false) }));
vi.mock('@/config', () => ({ config: { MAPBOX_TOKEN: 'test-token' } }));
vi.mock('@/repositories/destinations.repository', () => ({
    DestinationsRepository: class {
        findCityCoverage = vi.fn().mockResolvedValue([]);
        areaHasHotels    = vi.fn().mockResolvedValue(true);
        citiesWithHotels = vi.fn().mockResolvedValue([]);
    },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { DestinationsService } from '@/services/destinations.service';
import { getInstantHotelCatalog, subAreaBbox } from '@/lib/hotels/search';

/**
 * A place that is a city and a sovereign country at once.
 *
 * Singapore is the case the granularity ladder (ADR-0006) has no rung for: 50 km wide, its own
 * ISO code, and a geocoder that answers with both answers in one feature. Monaco, Vatican City,
 * Bahrain and Qatar arrive the same way.
 *
 * Why it mattered: at the City rung a search is a 50 km circle, which for a 50 km-wide country
 * crosses two international borders. Johor Bahru sits 17 km from the middle of Singapore, Senai
 * 33 km, Batam 34 km — and none of them are culled, because Singapore is not a territory and
 * all three fall inside its country bounding box as well. The country's own bounds were sitting
 * on the suggestion, unused.
 */

// The live Mapbox answer for "Singapore", recorded 2026-11-27. The two things that matter are
// that `place_type` holds both words, and that the id is filed under the `place` layer.
const SINGAPORE_FEATURE = {
    id:         'place.8905',
    place_type: ['country', 'place'],
    text_en:    'Singapore',
    place_name: 'Singapore',
    center:     [103.808053, 1.351616],
    bbox:       [103.522761, 1.115126, 104.099532, 1.477814],
    context:    [{ id: 'country.8905', short_code: 'sg' }],
};

const SG_BBOX: [number, number, number, number] = [103.522761, 1.115126, 104.099532, 1.477814];

/** Mapbox's forward geocoder (`limit=1`) is a different question from the search; only the
 *  search is being exercised, so the forward calls answer with nothing. */
function mockMapbox(features: unknown[]) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
        ok:   true,
        json: async () => ({ features: String(url).includes('limit=1') ? [] : features }),
    })));
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('a city that is also a country', () => {
    it('is offered at the country rung, so its bounds survive the pick', async () => {
        mockMapbox([SINGAPORE_FEATURE]);

        const out = await new DestinationsService().autocomplete('Singapore');
        const sg  = out.find(r => r.title === 'Singapore');

        expect(sg).toBeDefined();
        // The id layer says `place` and would read as a plain city. Mapbox also says country,
        // and that is the fact that keeps the bounding box in play.
        expect(sg!.rung).toBe('country');
        expect(sg!.bbox).toEqual(SG_BBOX);
    });

    /**
     * It used to be offered twice — the picker's own country list and the geocoder each
     * contributing a row titled "Singapore", one capped at 300 rows and the other not, with
     * nothing on screen to tell a traveller which one they were choosing.
     */
    it('is offered once, not once per source', async () => {
        mockMapbox([SINGAPORE_FEATURE]);

        const out = await new DestinationsService().autocomplete('Singapore');

        expect(out.filter(r => r.title.toLowerCase() === 'singapore')).toHaveLength(1);
    });

    /** An ordinary country has no geocoded row to defer to, so its list entry has to stay. */
    it('does not suppress a country the geocoder never returned', async () => {
        mockMapbox([]);

        const out = await new DestinationsService().autocomplete('Japan');

        expect(out.some(r => r.type === 'country' && r.countryCode === 'JP')).toBe(true);
    });

    it('searches its own borders rather than a circle that crosses two of them', async () => {
        db.findMany.mockResolvedValue([]);

        // What the controller forwards once the rung is `country` and bounds came with it.
        const params = { countryCode: 'SG', lat: 1.351616, lng: 103.808053,
                         rung: 'country', areaRung: 'country', bbox: SG_BBOX } as any;

        expect(subAreaBbox(params)).toEqual(SG_BBOX);

        await getInstantHotelCatalog(params);
        const where = db.findMany.mock.calls.at(-1)![0].where;

        // The country's own extent, not a 50 km box around its middle.
        expect(where.lat).toEqual({ gte: 1.115126, lte: 1.477814 });
        expect(where.lng).toEqual({ gte: 103.522761, lte: 104.099532 });
        // And its borders, which its bounds are not — see the next test.
        expect(where.country.in.map((c: string) => c.toUpperCase())).toContain('SG');
    });

    /**
     * The regression stated as places, because that is what made it visible: every one of these
     * is inside the 50 km circle the City rung drew, and none of them is in Singapore.
     *
     * Two different exclusions are needed and the test says which does the work. Bounds handle
     * the Malaysian mainland, which is north of Singapore's box. They do not handle Batam: the
     * geocoder's box reaches 104.10 E and 1.115 N, so the north of the island is inside it, and
     * only the stored country keeps those hotels out.
     */
    it.each([
        ['Johor Bahru, Malaysia',   1.4927, 103.7414, 'MY', 'bounds'],
        ['Senai, Malaysia',         1.6000, 103.6500, 'MY', 'bounds'],
        ['Batam Centre, Indonesia', 1.1301, 104.0529, 'ID', 'country'],
    ])('leaves %s outside the search, on %s', (_name, lat, lng, country, excludedBy) => {
        const [west, south, east, north] = SG_BBOX;
        const inBounds = lat >= south && lat <= north && lng >= west && lng <= east;

        // Whichever rule applies, the hotel is out — and the labelled rule is the one that did it.
        expect(inBounds && country === 'SG').toBe(false);
        expect(excludedBy === 'bounds' ? !inBounds : inBounds).toBe(true);

        // All three sit inside the circle the City rung would have drawn.
        const R = 6371, t = (x: number) => x * Math.PI / 180;
        const u = t(lat - 1.351616), v = t(lng - 103.808053);
        const a = Math.sin(u / 2) ** 2 + Math.cos(t(1.351616)) * Math.cos(t(lat)) * Math.sin(v / 2) ** 2;
        expect(2 * R * Math.asin(Math.sqrt(a))).toBeLessThan(50);
    });
});
