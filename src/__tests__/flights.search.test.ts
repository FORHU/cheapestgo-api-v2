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
import oneWayConnecting from './fixtures/duffel-offer-one-way-connecting.json';

const departureDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const params = {
    origin: 'LHR', destination: 'JFK', departureDate,
    adults: 1, children: 0, infants: 0, cabinClass: 'economy' as const,
};

function duffelResponds(status: number, body: unknown) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
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
});
