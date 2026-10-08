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

import { fetchPlacePhoto, lookupPoiDetails, placeholderSvg, poiCacheKey } from '@/lib/google/poi-details';
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
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

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
        expect(store.has('poi:v1|g-cafe')).toBe(true);
    });

    it('falls back to a name search when the id is not a Google place id, caching only under the name', async () => {
        google([
            ['place_id=dXJuOm1ieHBvaQ', { status: 'INVALID_REQUEST' }],
            ['nearbysearch', { status: 'OK', results: [{ place_id: 'g-cafe' }] }],
            ['place_id=g-cafe', { status: 'OK', result: CAFE }],
        ]);

        const d = await lookupPoiDetails({ ...AT, placeId: 'dXJuOm1ieHBvaQ' });

        expect(d.placeId).toBe('g-cafe');
        expect(store.has('poi:v1|dXJuOm1ieHBvaQ')).toBe(false);
        expect(store.has(poiCacheKey(AT))).toBe(true);
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

    it('does not give an amusement park, or a cafe called "Station Cafe", the 24-hour default', async () => {
        google([
            ['place_id=g-fun', { status: 'OK', result: { place_id: 'g-fun', name: 'Fun', types: ['amusement_park'] } }],
            ['place_id=g-sc', { status: 'OK', result: { place_id: 'g-sc', name: 'Station Cafe', types: ['cafe'] } }],
        ]);

        expect((await lookupPoiDetails({ name: 'Fun', lat: 1, lng: 2, placeId: 'g-fun' })).openingHours).toBeNull();
        expect((await lookupPoiDetails({ name: 'Station Cafe', lat: 1, lng: 2, placeId: 'g-sc' })).openingHours).toBeNull();
    });

    it('gives a park the default from any of its Google types', async () => {
        google([['place_id=g-park', { status: 'OK', result: { place_id: 'g-park', name: 'Hill', types: ['tourist_attraction', 'park'] } }]]);

        const d = await lookupPoiDetails({ name: 'Hill', lat: 1, lng: 2, placeId: 'g-park' });

        expect(d.openingHours?.weekday_text).toEqual(['Open 24 hours']);
    });

    it('keeps only the declared review fields', async () => {
        google([['place_id=g-r', { status: 'OK', result: { place_id: 'g-r', name: 'R', reviews: [{ author_name: 'A', rating: 4, text: 't', author_url: 'https://u', language: 'en', time: 1 }] } }]]);

        const d = await lookupPoiDetails({ name: 'R', lat: 1, lng: 2, placeId: 'g-r' });

        expect(d.reviews).toEqual([{ author_name: 'A', rating: 4, text: 't', author_url: 'https://u' }]);
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

    it('returns an empty result, and caches it, when no candidate has a photo or reviews', async () => {
        google([
            ['nearbysearch', { status: 'OK', results: [{ place_id: 'g-bare' }] }],
            ['place_id=g-bare', { status: 'OK', result: { place_id: 'g-bare', name: 'Onion Annex' } }],
        ]);

        const d = await lookupPoiDetails(AT);

        expect(d).toMatchObject({ placeId: null, source: 'none' });
        expect(store.has(poiCacheKey(AT))).toBe(true);
    });

    it('answers from the cache without calling Google, applying the caller\'s own name', async () => {
        const cached = { nameEn: 'Cafe Onion', placeId: 'g-cafe', types: ['cafe'], vicinity: null, rating: 4.6, userRatingsTotal: 3, reviews: [], phone: null, website: null, hours: null, photoReference: null, source: 'google' };
        store.set(poiCacheKey({ ...AT, placeId: 'g-cafe' }), JSON.stringify(cached));
        const fetchMock = google([]);

        const d = await lookupPoiDetails({ ...AT, name: 'My label', placeId: 'g-cafe' });

        expect(d).toMatchObject({ name: 'My label', nameEn: 'Cafe Onion', placeId: 'g-cafe', category: 'cafe', rating: 4.6, openingHours: null });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('looks up afresh when the cached entry is corrupt', async () => {
        store.set(poiCacheKey({ ...AT, placeId: 'g-cafe' }), '{not json');
        const fetchMock = google([['place_id=g-cafe', { status: 'OK', result: CAFE }]]);

        const d = await lookupPoiDetails({ ...AT, placeId: 'g-cafe' });

        expect(d.placeId).toBe('g-cafe');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('still answers when Redis rejects', async () => {
        vi.mocked(redis.get).mockRejectedValueOnce(new Error('down'));
        vi.mocked(redis.setex).mockRejectedValueOnce(new Error('down'));
        google([['place_id=g-cafe', { status: 'OK', result: CAFE }]]);

        const d = await lookupPoiDetails({ ...AT, placeId: 'g-cafe' });

        expect(d.placeId).toBe('g-cafe');
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

    it('treats INVALID_REQUEST from a name search as our own bug, not "nothing here"', async () => {
        google([['nearbysearch', { status: 'INVALID_REQUEST' }]]);

        await expect(lookupPoiDetails(AT)).rejects.toThrow('INVALID_REQUEST');
        expect(redis.setex).not.toHaveBeenCalled();
    });

    it('logs a denied key loudly, with Google\'s reason and without the key', async () => {
        google([['nearbysearch', { status: 'REQUEST_DENIED', error_message: 'API key invalid' }]]);

        await expect(lookupPoiDetails(AT)).rejects.toThrow('REQUEST_DENIED');
        expect(logger.error).toHaveBeenCalled();
        const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
        expect(logged).toContain('API key invalid');
        expect(logged).not.toContain('test-key');
    });
});

describe('open_now', () => {
    // Monday 09:00-17:00 in a place at UTC+9.
    const MON = {
        status: 'OK',
        result: {
            place_id: 'g-mon', name: 'Shop', types: ['store'], utc_offset_minutes: 540,
            opening_hours: {
                open_now: false,
                weekday_text: ['Monday: 9-5'],
                periods: [{ open: { day: 1, time: '0900' }, close: { day: 1, time: '1700' } }],
            },
        },
    };
    const Q = { name: 'Shop', lat: 1, lng: 2, placeId: 'g-mon' };

    it('is worked out from the periods at the time of the request, not cached from Google', async () => {
        google([['place_id=g-mon', MON]]);
        vi.useFakeTimers();

        vi.setSystemTime(new Date('2026-10-05T01:00:00Z')); // Mon 10:00 local
        expect((await lookupPoiDetails(Q)).openingHours?.open_now).toBe(true);

        vi.setSystemTime(new Date('2026-10-05T09:00:00Z')); // Mon 18:00 local, served from cache
        expect((await lookupPoiDetails(Q)).openingHours?.open_now).toBe(false);
    });

    it('treats a period with no close as always open', async () => {
        google([['place_id=g-mon', { status: 'OK', result: { ...MON.result, opening_hours: { periods: [{ open: { day: 0, time: '0000' } }] } } }]]);

        expect((await lookupPoiDetails(Q)).openingHours?.open_now).toBe(true);
    });

    it('handles a period that runs past midnight and wraps the week', async () => {
        google([['place_id=g-mon', { status: 'OK', result: { ...MON.result, opening_hours: { periods: [{ open: { day: 6, time: '2200' }, close: { day: 0, time: '0200' } }] } } }]]);
        vi.useFakeTimers();

        vi.setSystemTime(new Date('2026-10-03T16:00:00Z')); // Sun 01:00 local
        expect((await lookupPoiDetails(Q)).openingHours?.open_now).toBe(true);
    });

    it('is left out when Google gave no utc offset', async () => {
        google([['place_id=g-mon', { status: 'OK', result: { ...MON.result, utc_offset_minutes: undefined } }]]);

        const d = await lookupPoiDetails(Q);

        expect(d.openingHours).toEqual({ weekday_text: ['Monday: 9-5'] });
        expect(d.openingHours).not.toHaveProperty('open_now');
    });
});

describe('fetchPlacePhoto', () => {
    it('rejects a 200 that is not an image, naming the content type', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })));

        await expect(fetchPlacePhoto('ref')).rejects.toThrow('text/html');
    });
});

describe('placeholderSvg', () => {
    it('escapes the name and colours by category', () => {
        const svg = placeholderSvg('A & <B>', 'park');
        expect(svg).toContain('A &amp; &lt;B&gt;');
        expect(svg).toContain('#064e3b');
    });
});
