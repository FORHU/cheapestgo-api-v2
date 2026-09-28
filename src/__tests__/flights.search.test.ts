import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));
vi.mock('@/lib/prisma', () => ({
    prisma: {
        flight_searches:      { create: vi.fn().mockResolvedValue({ id: 'search-1' }), findFirst: vi.fn() },
        flight_results_cache: { createMany: vi.fn().mockResolvedValue({}), findMany: vi.fn() },
        $executeRaw:          vi.fn().mockResolvedValue(0),
    },
}));

import { searchFlights } from '@/lib/flights/search';
import { AppError } from '@/middleware/error.middleware';
import oneWayConnecting from './fixtures/duffel-offer-one-way-connecting.json';

const departureDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const params = {
    origin: 'LHR', destination: 'JFK', departureDate,
    adults: 1, children: 0, infants: 0, cabinClass: 'economy' as const,
};

function duffelResponds(status: number, body: unknown) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

async function searchError(): Promise<AppError> {
    const err = await searchFlights(params).then(() => null, e => e);
    expect(err).toBeInstanceOf(AppError);
    return err;
}

describe('searchFlights — provider outcomes', () => {
    beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('returns offers when Duffel answers with offers', async () => {
        duffelResponds(200, { data: { offers: [oneWayConnecting] } });
        const offers = await searchFlights(params);
        expect(offers).toHaveLength(1);
        expect(offers[0].segments).toHaveLength(2);
    });

    it('returns an empty list when Duffel genuinely has no offers', async () => {
        duffelResponds(200, { data: { offers: [] } });
        await expect(searchFlights(params)).resolves.toEqual([]);
    });

    it('fails with 502 — not "no flights" — when Duffel rejects the token', async () => {
        duffelResponds(401, { errors: [{ code: 'access_token_not_found', message: 'The access token you have used is not a valid API access token' }] });
        const err = await searchError();
        expect(err.statusCode).toBe(502);
        expect(err.code).toBe('FLIGHT_SEARCH_UNAVAILABLE');
    });

    it('fails with 502 when Duffel cannot be reached', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
        const err = await searchError();
        expect(err.statusCode).toBe(502);
    });

    it('keeps a slow Duffel answer — busy long-haul searches take 12s+ at Duffel', async () => {
        vi.useFakeTimers();
        try {
            vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => setTimeout(
                () => resolve(new Response(JSON.stringify({ data: { offers: [oneWayConnecting] } }), { status: 200 })),
                14_000,
            ))));
            const result = expect(searchFlights(params)).resolves.toHaveLength(1);
            await vi.advanceTimersByTimeAsync(14_000);
            await result;
        } finally {
            vi.useRealTimers();
        }
    });

    it('rejects a departure date in the past instead of reporting no flights', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const err = await searchFlights({ ...params, departureDate: '2020-01-01' }).then(() => null, e => e);

        expect(err).toBeInstanceOf(AppError);
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVALID_FLIGHT_SEARCH');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a return date before the departure date', async () => {
        vi.stubGlobal('fetch', vi.fn());
        const returnDate = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);

        const err = await searchFlights({ ...params, returnDate }).then(() => null, e => e);

        expect(err).toBeInstanceOf(AppError);
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVALID_FLIGHT_SEARCH');
    });

    it('fails with 400 and Duffel\'s reason when the search itself is invalid', async () => {
        duffelResponds(422, { errors: [{ code: 'invalid_iata_code', type: 'validation_error', message: "Field 'origin' is invalid. Expected a valid IATA code." }] });
        const err = await searchError();
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVALID_FLIGHT_SEARCH');
        expect(err.message).toBe("Field 'origin' is invalid. Expected a valid IATA code.");
    });
});
