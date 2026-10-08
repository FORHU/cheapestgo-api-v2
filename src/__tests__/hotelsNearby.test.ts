import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cfg = vi.hoisted(() => ({ GOOGLE_PLACES_API_KEY: 'test-key' as string | undefined }));
vi.mock('@/config', () => ({ config: cfg }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/services/hotels.service', () => ({ HotelsService: class {} }));
vi.mock('@/services/destinations.service', () => ({ DestinationsService: class {} }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/hotels/contentPatches', () => ({ fetchHotelContentPatches: vi.fn() }));
vi.mock('@/lib/hotels/travelgatex', () => ({ resolveTgxDestinationCode: vi.fn() }));
vi.mock('@/lib/hotels/search', () => ({ getInstantHotelCatalog: vi.fn(), runTgxSearch: vi.fn() }));
vi.mock('@/lib/google/places', () => ({ getPlaceDetails: vi.fn(), geocode: vi.fn() }));

import { HotelsController } from '@/controllers/hotels.controller';
import { AppError } from '@/middleware/error.middleware';
import { logger } from '@/lib/logger';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const place = (id: string, rating = 4.5) => ({
    name: `P ${id}`, place_id: id, types: ['restaurant'], rating, user_ratings_total: 10, vicinity: 'x',
    geometry: { location: { lat: 1, lng: 2 } },
});

async function call() {
    const res = { json: vi.fn() };
    const next = vi.fn();
    const req = { query: { lat: '1', lng: '2', category: 'cafe' } };
    await new HotelsController().nearbyPlaces(req as any, res as any, next);
    return { res, next };
}

describe('GET /hotels/nearby failure reporting', () => {
    beforeEach(() => { cfg.GOOGLE_PLACES_API_KEY = 'test-key'; vi.clearAllMocks(); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('returns an empty list when Google says ZERO_RESULTS for every type', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ status: 'ZERO_RESULTS', results: [] })));
        const { res, next } = await call();
        expect(next).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ features: [] });
    });

    it('returns mapped features on the happy path', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ status: 'OK', results: [place('a'), place('b', 2)] })));
        const { res } = await call();
        const body = res.json.mock.calls[0][0];
        expect(body.features).toHaveLength(1);
        expect(body.features[0].properties.place_id).toBe('a');
    });

    it('answers 502 without Google text when one type is over quota', async () => {
        let n = 0;
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
            ++n === 1 ? json({ status: 'OVER_QUERY_LIMIT', error_message: 'secret quota text' }) : json({ status: 'OK', results: [place('a')] })));
        const { res, next } = await call();
        expect(res.json).not.toHaveBeenCalled();
        const err = next.mock.calls[0][0] as AppError;
        expect(err).toBeInstanceOf(AppError);
        expect(err.statusCode).toBe(502);
        expect(err.code).toBe('UPSTREAM_ERROR');
        expect(err.message).not.toMatch(/OVER_QUERY_LIMIT|secret|quota/i);
        expect(logger.warn).toHaveBeenCalled();
    });

    it('logs REQUEST_DENIED as an error and answers 502', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ status: 'REQUEST_DENIED', error_message: 'bad key' })));
        const { next } = await call();
        expect(logger.error).toHaveBeenCalledWith('[hotels/nearby] Google REQUEST_DENIED', { status: 'REQUEST_DENIED', error_message: 'bad key' });
        expect((next.mock.calls[0][0] as AppError).statusCode).toBe(502);
    });

    it('answers 502 when fetch itself fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
        const { next } = await call();
        expect((next.mock.calls[0][0] as AppError).statusCode).toBe(502);
    });

    it('answers 503 when the API key is missing', async () => {
        cfg.GOOGLE_PLACES_API_KEY = undefined;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const { res, next } = await call();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
        const err = next.mock.calls[0][0] as AppError;
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('UPSTREAM_UNAVAILABLE');
        expect(logger.error).toHaveBeenCalled();
    });
});
