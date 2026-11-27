import { describe, it, expect, vi, beforeEach } from 'vitest';

const db    = vi.hoisted(() => ({ findMany: vi.fn() }));
const store = vi.hoisted(() => ({ get: vi.fn(), setex: vi.fn() }));
const geo   = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: { hotel_content: { findMany: db.findMany } } }));
vi.mock('@/lib/redis',  () => ({ redis: { get: store.get, setex: store.setex } }));
vi.mock('@/config',     () => ({ config: { MAPBOX_TOKEN: 'test-token' } }));
vi.mock('@/repositories/destinations.repository', () => ({
    DestinationsRepository: class {
        findCityCoverage = vi.fn().mockResolvedValue([]);
        areaHasHotels    = vi.fn().mockResolvedValue(false);
        citiesWithHotels = vi.fn().mockResolvedValue([]);
    },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { DestinationsService } from '@/services/destinations.service';

/**
 * What the suggestion cache is for.
 *
 * It was a `Map` in one process, cleared wholesale at 501 entries. That is a cache for whoever
 * warmed it and nobody else: a second container, or the same container after a deploy, paid
 * full price — and while `findCityCoverage` was a sequential scan, full price was seventeen
 * seconds. What is asserted here is the three things that changed, because each one is
 * invisible from the outside and each one silently stops working if someone rewrites this.
 */

/** A Mapbox feature, enough of one for the mapper to keep it. */
const feature = (name: string) => ({
    id: `place.${name}`, place_type: ['place'], text_en: name, place_name: `${name}, Testland`,
    center: [10, 20], context: [{ id: 'country.1', short_code: 'tl' }],
});

function mapbox(names: string[]) {
    geo.fetch.mockImplementation(async (url: string) => ({
        ok: true,
        // The forward geocoder (`limit=1`) is a different question; only the search matters.
        json: async () => ({ features: String(url).includes('limit=1') ? [] : names.map(feature) }),
    }));
    vi.stubGlobal('fetch', geo.fetch);
}

beforeEach(() => {
    vi.clearAllMocks();
    db.findMany.mockResolvedValue([]);
    store.get.mockResolvedValue(null);
    store.setex.mockResolvedValue('OK');
    mapbox(['Testville']);
});

describe('the suggestion cache', () => {
    /**
     * The shared tier. One traveller's lookup has to answer the next one, on whichever
     * container they land on — otherwise the cache only ever helps the person who paid.
     */
    it('writes what it found somewhere every container can read', async () => {
        await new DestinationsService().autocomplete('sharedwrite');

        expect(store.setex).toHaveBeenCalledTimes(1);
        const [key, ttl, body] = store.setex.mock.calls[0];
        expect(key).toContain('sharedwrite');
        expect(ttl).toBe(300);
        expect(JSON.parse(body)[0].title).toBe('Testville');
    });

    it('answers from the shared tier without asking the geocoder again', async () => {
        store.get.mockResolvedValue(JSON.stringify([
            { type: 'city', rung: 'city', title: 'Remembered', subtitle: 'from Redis', countryCode: 'TL' },
        ]));

        const out = await new DestinationsService().autocomplete('sharedread');

        expect(out[0].title).toBe('Remembered');
        expect(geo.fetch).not.toHaveBeenCalled();
    });

    /**
     * Keystrokes arrive together and a debounce only thins them. Without this, everyone
     * typing the same thing at the same moment starts their own geocode.
     */
    it('asks once when the same question arrives several times at once', async () => {
        const svc = new DestinationsService();

        const [a, b, c] = await Promise.all([
            svc.autocomplete('atonce'), svc.autocomplete('atonce'), svc.autocomplete('atonce'),
        ]);

        expect(store.setex).toHaveBeenCalledTimes(1);
        expect(a).toEqual(b);
        expect(b).toEqual(c);
    });

    /** "new  york" and "new york" are one question, so they are one entry. */
    it('treats a difference in spacing as the same question', async () => {
        const svc = new DestinationsService();

        await svc.autocomplete('spaced  out');
        store.get.mockClear();
        geo.fetch.mockClear();
        await svc.autocomplete('spaced out');

        // The second one never left the process: the first warmed L1 under the same key.
        expect(store.get).not.toHaveBeenCalled();
        expect(geo.fetch).not.toHaveBeenCalled();
    });

    /**
     * Nothing-matched and the-geocoder-was-unreachable are the same empty array here. Five
     * minutes of "no such place" bought from one failed call is the more expensive mistake,
     * so emptiness is always re-asked.
     */
    it('does not remember an empty answer', async () => {
        mapbox([]);

        const out = await new DestinationsService().autocomplete('zzqqxxvv');

        expect(out).toEqual([]);
        expect(store.setex).not.toHaveBeenCalled();
    });

    /**
     * A Redis that is down costs a lookup, never an answer. `setex` absent rather than
     * failing is the shape a stubbed or half-initialised client takes, and it throws where
     * a rejected promise would not.
     */
    it('still answers when the shared tier is not there at all', async () => {
        store.get.mockRejectedValue(new Error('ECONNREFUSED'));
        store.setex.mockImplementation(() => { throw new TypeError('setex is not a function'); });

        const out = await new DestinationsService().autocomplete('noredis');

        expect(out[0].title).toBe('Testville');
    });
});
