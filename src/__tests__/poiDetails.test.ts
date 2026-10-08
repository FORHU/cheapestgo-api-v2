import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('@/config', () => ({ config: { GOOGLE_PLACES_API_KEY: 'test-key' } }));
vi.mock('@/lib/redis', () => ({
    redis: {
        get:   vi.fn(async (k: string) => store.get(k) ?? null),
        setex: vi.fn(async (k: string, _ttl: number, v: string) => { store.set(k, v); return 'OK'; }),
    },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { lookupPoiDetails, placeholderSvg, poiCacheKey } from '@/lib/google/poi-details';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

type Reply = Record<string, unknown>;

/** Answers each Google URL with the first rule whose fragment it contains. */
function google(rules: Array<[string, Reply]>) {
    const fn = vi.fn(async (input: string | URL) => {
        const url = String(input);
        const rule = rules.find(([fragment]) => url.includes(fragment));
        if (!rule) throw new Error(`unexpected fetch ${url}`);
        return new Response(JSON.stringify(rule[1]), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

const CAFE = {
    place_id: 'g-cafe',
    name: 'Cafe Onion',
    types: ['cafe', 'food'],
    vicinity: '8 Achasan-ro',
    rating: 4.6,
    user_ratings_total: 1200,
    formatted_phone_number: '02-1234-5678',
    website: 'https://onion.example',
    opening_hours: { open_now: true, weekday_text: ['Monday: 8:00 AM – 10:00 PM'] },
    photos: [{ photo_reference: 'ref-cafe' }],
    reviews: [{ author_name: 'Min', rating: 5, text: 'Great bread' }],
};

const AT = { name: 'Cafe Onion', lat: 37.5, lng: 127.0 };

beforeEach(() => { store.clear(); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllGlobals());

describe('lookupPoiDetails', () => {
    it('uses Place Details directly when given a place id', async () => {
        const fetchMock = google([['details/json?place_id=g-cafe', { status: 'OK', result: CAFE }]]);

        const d = await lookupPoiDetails({ ...AT, placeId: 'g-cafe' });

        expect(d).toMatchObject({
            placeId: 'g-cafe', nameEn: 'Cafe Onion', category: 'cafe', vicinity: '8 Achasan-ro',
            rating: 4.6, userRatingsTotal: 1200, phone: '02-1234-5678', website: 'https://onion.example',
            photoReference: 'ref-cafe', source: 'google',
        });
        expect(d.reviews).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).not.toContain('nearbysearch');
    });

    it('tries name-search candidates in order and stops at the first with a photo or reviews', async () => {
        const fetchMock = google([
            ['nearbysearch', { status: 'OK', results: [{ place_id: 'g-bare' }, { place_id: 'g-cafe' }, { place_id: 'g-third' }] }],
            ['place_id=g-bare', { status: 'OK', result: { place_id: 'g-bare', name: 'Onion Annex' } }],
            ['place_id=g-cafe', { status: 'OK', result: CAFE }],
        ]);

        const d = await lookupPoiDetails(AT);

        expect(d.placeId).toBe('g-cafe');
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('also caches a name lookup under the place id it resolved to', async () => {
        google([
            ['nearbysearch', { status: 'OK', results: [{ place_id: 'g-cafe' }] }],
            ['place_id=g-cafe', { status: 'OK', result: CAFE }],
        ]);

        await lookupPoiDetails(AT);

        expect(store.has(poiCacheKey(AT))).toBe(true);
        expect(store.has('poi|g-cafe')).toBe(true);
    });

    it('falls back to a name search when the id is not a Google place id', async () => {
        google([
            ['place_id=dXJuOm1ieHBvaQ', { status: 'INVALID_REQUEST' }],
            ['nearbysearch', { status: 'OK', results: [{ place_id: 'g-cafe' }] }],
            ['place_id=g-cafe', { status: 'OK', result: CAFE }],
        ]);

        const d = await lookupPoiDetails({ ...AT, placeId: 'dXJuOm1ieHBvaQ' });

        expect(d.placeId).toBe('g-cafe');
    });

    it('gives a station with no hours "Open 24 hours"', async () => {
        google([['place_id=g-stn', { status: 'OK', result: { place_id: 'g-stn', name: 'Seoul Station', types: ['train_station'] } }]]);

        const d = await lookupPoiDetails({ name: 'Seoul Station', lat: 37.55, lng: 126.97, placeId: 'g-stn', category: 'train_station' });

        expect(d.openingHours).toEqual({ open_now: true, weekday_text: ['Open 24 hours'] });
    });

    it('does not treat a parking lot as a park', async () => {
        google([['place_id=g-lot', { status: 'OK', result: { place_id: 'g-lot', name: 'Lot 7', types: ['parking'] } }]]);

        const d = await lookupPoiDetails({ name: 'Lot 7', lat: 37.5, lng: 127, placeId: 'g-lot', category: 'parking' });

        expect(d.openingHours).toBeNull();
    });

    it('leaves a missing rating missing', async () => {
        google([['place_id=g-new', { status: 'OK', result: { place_id: 'g-new', name: 'New Spot', photos: [{ photo_reference: 'r' }] } }]]);

        const d = await lookupPoiDetails({ ...AT, placeId: 'g-new' });

        expect(d.rating).toBeNull();
        expect(d.userRatingsTotal).toBeNull();
    });

    it('returns an empty result, and caches it, when Google finds nothing', async () => {
        google([['nearbysearch', { status: 'ZERO_RESULTS', results: [] }]]);

        const d = await lookupPoiDetails(AT);

        expect(d).toMatchObject({ name: 'Cafe Onion', placeId: null, rating: null, reviews: [], source: 'none' });
        expect(redis.setex).toHaveBeenCalled();
    });

    it('answers from the cache without calling Google', async () => {
        const cached = { name: 'Cafe Onion', nameEn: 'Cafe Onion', placeId: 'g-cafe', category: 'cafe', vicinity: null, rating: 4.6, userRatingsTotal: 3, reviews: [], phone: null, website: null, openingHours: null, photoReference: null, source: 'google' };
        store.set(poiCacheKey({ ...AT, placeId: 'g-cafe' }), JSON.stringify(cached));
        const fetchMock = google([]);

        const d = await lookupPoiDetails({ ...AT, placeId: 'g-cafe' });

        expect(d).toEqual(cached);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('shares one Google call between concurrent identical lookups', async () => {
        const fetchMock = google([['place_id=g-cafe', { status: 'OK', result: CAFE }]]);

        const [a, b] = await Promise.all([
            lookupPoiDetails({ ...AT, placeId: 'g-cafe' }),
            lookupPoiDetails({ ...AT, placeId: 'g-cafe' }),
        ]);

        expect(a).toEqual(b);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not cache a failure, so the next request tries again', async () => {
        const fetchMock = google([['nearbysearch', { status: 'OVER_QUERY_LIMIT' }]]);

        await expect(lookupPoiDetails(AT)).rejects.toThrow('OVER_QUERY_LIMIT');
        expect(redis.setex).not.toHaveBeenCalled();

        await expect(lookupPoiDetails(AT)).rejects.toThrow('OVER_QUERY_LIMIT');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('logs a denied key loudly', async () => {
        google([['nearbysearch', { status: 'REQUEST_DENIED' }]]);

        await expect(lookupPoiDetails(AT)).rejects.toThrow('REQUEST_DENIED');
        expect(logger.error).toHaveBeenCalled();
    });
});

describe('placeholderSvg', () => {
    it('escapes the name and colours by category', () => {
        const svg = placeholderSvg('A & <B>', 'park');
        expect(svg).toContain('A &amp; &lt;B&gt;');
        expect(svg).toContain('#064e3b');
    });
});
