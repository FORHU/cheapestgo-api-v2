import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { hotel_content: { findMany: db.findMany } } }));
vi.mock('@/config', () => ({ config: { MAPBOX_TOKEN: 'pk.test', TRAVELGATEX_API_KEY: '' } }));
vi.mock('@/lib/hotels/travelgatex', () => ({
    tgxGraphQL: vi.fn().mockResolvedValue({}),
    getTgxConfig: vi.fn().mockReturnValue(null),
}));
vi.mock('@/middleware/rate-limit.middleware', () => ({
    searchRateLimit: (_req: any, _res: any, next: any) => next(),
}));

import router from '@/routes/autocomplete.route';

/**
 * What a traveller can pick, and therefore what they can search.
 *
 * The search accepts five anchors — a place, a country, a property, a point, a map area — but
 * a traveller can only use the ones this list offers. While every result was typed `city`, a
 * hotel name and an airport were unreachable however well the search handled them.
 *
 * Mapbox is stubbed: what matters here is the classification and the order, not the geocoder.
 */
const MAPBOX_FEATURES = {
    features: [
        {
            id: 'place.1', text_en: 'Tokyo', place_name: 'Tokyo, Japan',
            place_type: ['place'], center: [139.69, 35.68],
            context: [{ id: 'country.1', short_code: 'jp' }],
        },
        {
            id: 'poi.1', text_en: 'Narita International Airport',
            place_name: 'Narita International Airport, Chiba, Japan',
            place_type: ['poi'], center: [140.386, 35.772],
            context: [{ id: 'country.1', short_code: 'jp' }],
        },
    ],
};

/**
 * The route's own handler, called directly.
 *
 * No server: the handler reaches Mapbox with `fetch`, which the tests stub, and driving it
 * over HTTP would mean the stub swallowed the test's own request too.
 */
const handler = (() => {
    const layer = (router as any).stack.find(
        (l: any) => l.route?.path === '/' && l.route?.methods?.post,
    );
    const chain = layer.route.stack;
    return chain[chain.length - 1].handle;
})();

async function ask(query: string): Promise<{ success: boolean; data: any[] }> {
    let payload: any;
    const res = { json: (b: any) => { payload = b; return res; } };
    await handler({ body: { query } }, res, (err: unknown) => { throw err; });
    return payload;
}

beforeEach(() => {
    vi.clearAllMocks();
    db.findMany.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MAPBOX_FEATURES,
    }));
});

describe('what the picker can offer', () => {
    it('an airport is a point, not a city', async () => {
        const body = await ask('narita');

        const airport = body.data.find((r: any) => r.title.includes('Narita'));
        expect(airport.type).toBe('poi');
        expect(airport.rung).toBe('poi');
        // Coordinates are the whole reason a POI is pickable: the search anchors on them.
        expect(airport.lat).toBeCloseTo(35.772, 2);
        expect(airport.lng).toBeCloseTo(140.386, 2);
    });

    it('a place is still a city', async () => {
        const body = await ask('tokyo');

        const city = body.data.find((r: any) => r.title === 'Tokyo');
        expect(city.type).toBe('city');
        expect(city.countryCode).toBe('JP');
    });

    it('a property carries the code the search anchors on', async () => {
        db.findMany.mockResolvedValue([
            { hotel_id: 'h-99', name: 'Hilton Tokyo', city: 'Tokyo', country: 'JP', lat: 35.69, lng: 139.69 },
        ]);

        const body = await ask('hilton tokyo');

        const hotel = body.data.find((r: any) => r.type === 'hotel');
        expect(hotel.hotelCode).toBe('h-99');
        expect(hotel.title).toBe('Hilton Tokyo');
        expect(hotel.subtitle).toBe('Tokyo, JP');
    });

    /**
     * Typing a hotel's name is the least ambiguous thing a traveller can do. Ranked under the
     * city it stands in, the answer sits below the 4,590-hotel alternative.
     */
    it('a named property outranks the city it stands in', async () => {
        db.findMany.mockResolvedValue([
            { hotel_id: 'h-99', name: 'Hilton Tokyo', city: 'Tokyo', country: 'JP', lat: 35.69, lng: 139.69 },
        ]);

        const body = await ask('hilton tokyo');

        expect(body.data[0].type).toBe('hotel');
        expect(body.data.findIndex((r: any) => r.type === 'hotel'))
            .toBeLessThan(body.data.findIndex((r: any) => r.type === 'city'));
    });

    it('two letters are not a hotel search', async () => {
        await ask('to');
        expect(db.findMany).not.toHaveBeenCalled();
    });

    /**
     * The catalogue and the geocoder fail independently. Someone typing a city must still get
     * cities when the hotel lookup is down, which is the failure the silent catch exists for.
     */
    it('a catalogue failure does not take the places with it', async () => {
        db.findMany.mockRejectedValue(new Error('connection terminated'));

        const body = await ask('tokyo');

        expect(body.success).toBe(true);
        expect(body.data.some((r: any) => r.type === 'city')).toBe(true);
    });
});
