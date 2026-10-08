import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/config', () => ({ config: { GOOGLE_PLACES_API_KEY: 'test-key' } }));
vi.mock('@/lib/google/poi-details', () => ({
    lookupPoiDetails: vi.fn(),
    fetchPlacePhoto:  vi.fn(),
    placeholderSvg:   vi.fn(() => '<svg>placeholder</svg>'),
}));

import { poiPhotoOrDetails } from '@/routes/photos.route';
import { lookupPoiDetails, fetchPlacePhoto, type PoiDetails } from '@/lib/google/poi-details';
import { AppError } from '@/middleware/error.middleware';

const DETAILS: PoiDetails = {
    name: 'Cafe Onion', nameEn: 'Cafe Onion', placeId: 'g-cafe', category: 'cafe', vicinity: null,
    rating: 4.6, userRatingsTotal: 10, reviews: [], phone: null, website: null, openingHours: null,
    photoReference: 'ref-cafe', source: 'google',
};

function fakeRes() {
    return {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: undefined as unknown,
        status(code: number) { this.statusCode = code; return this; },
        set(h: Record<string, string>) { Object.assign(this.headers, h); return this; },
        json(b: unknown) { this.body = b; return this; },
        send(b: unknown) { this.body = b; return this; },
    };
}

async function call(query: Record<string, string>) {
    const res = fakeRes();
    const next = vi.fn();
    await poiPhotoOrDetails({ query } as never, res as never, next);
    return { res, next };
}

const PLACE = { name: 'Cafe Onion', lat: '37.5', lng: '127' };

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('GET /photos/poi', () => {
    it('answers full=true with the place details', async () => {
        vi.mocked(lookupPoiDetails).mockResolvedValue(DETAILS);

        const { res, next } = await call({ ...PLACE, placeId: 'g-cafe', full: 'true' });

        expect(next).not.toHaveBeenCalled();
        expect(res.body).toEqual(DETAILS);
        expect(lookupPoiDetails).toHaveBeenCalledWith({ name: 'Cafe Onion', lat: 37.5, lng: 127, placeId: 'g-cafe', category: undefined });
    });

    it('passes a failed details lookup on as an error, not as an empty place', async () => {
        const failure = new Error('Google Places status OVER_QUERY_LIMIT');
        vi.mocked(lookupPoiDetails).mockRejectedValue(failure);

        const { res, next } = await call({ ...PLACE, full: 'true' });

        expect(next).toHaveBeenCalledWith(failure);
        expect(res.body).toBeUndefined();
    });

    it('streams the resolved photo', async () => {
        vi.mocked(lookupPoiDetails).mockResolvedValue(DETAILS);
        vi.mocked(fetchPlacePhoto).mockResolvedValue({ body: Buffer.from('jpg'), contentType: 'image/jpeg' });

        const { res } = await call(PLACE);

        expect(fetchPlacePhoto).toHaveBeenCalledWith('ref-cafe');
        expect(res.headers['Content-Type']).toBe('image/jpeg');
        expect(res.body).toEqual(Buffer.from('jpg'));
    });

    it('draws a cacheable placeholder for a place with no photo', async () => {
        vi.mocked(lookupPoiDetails).mockResolvedValue({ ...DETAILS, photoReference: null });

        const { res } = await call({ ...PLACE, category: 'cafe' });

        expect(res.headers['Content-Type']).toBe('image/svg+xml');
        expect(res.headers['Cache-Control']).toBe('public, max-age=86400');
        expect(res.body).toBe('<svg>placeholder</svg>');
    });

    it('draws an uncached placeholder when the lookup fails', async () => {
        vi.mocked(lookupPoiDetails).mockRejectedValue(new Error('down'));

        const { res, next } = await call(PLACE);

        expect(next).not.toHaveBeenCalled();
        expect(res.headers['Content-Type']).toBe('image/svg+xml');
        expect(res.headers['Cache-Control']).toBe('no-store');
    });

    it('rejects a lookup with no name', async () => {
        const { next } = await call({ lat: '37.5', lng: '127', full: 'true' });

        expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
        expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it('rejects a lookup with no coordinates', async () => {
        const { next } = await call({ name: 'Cafe Onion' });

        expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it('rejects a name longer than 200 characters', async () => {
        const { next, res } = await call({ ...PLACE, name: 'x'.repeat(201) });

        expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
        expect(next.mock.calls[0][0].statusCode).toBe(400);
        expect(res.body).toBeUndefined();
        expect(lookupPoiDetails).not.toHaveBeenCalled();
    });

    it('rejects a placeId longer than 300 characters', async () => {
        const { next } = await call({ ...PLACE, placeId: 'p'.repeat(301), full: 'true' });

        expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
        expect(next.mock.calls[0][0].statusCode).toBe(400);
        expect(lookupPoiDetails).not.toHaveBeenCalled();
    });

    it('still proxies a bare photo_reference', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('img'), { headers: { 'content-type': 'image/jpeg' } })));

        const { res } = await call({ photo_reference: 'ref-x' });

        expect(lookupPoiDetails).not.toHaveBeenCalled();
        expect(res.body).toEqual(Buffer.from('img'));
    });
});
