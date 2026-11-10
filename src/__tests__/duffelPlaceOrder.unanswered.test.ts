import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));

import { placeDuffelOrder } from '@/lib/flights/duffel';

/**
 * An order request that got no answer may still have become an order. `placeDuffelOrder` has to
 * say so — `timedOut` — so the lifecycle looks for the order and keeps the hold, rather than
 * reading the silence as a refusal and releasing the money, or ordering the flight again.
 *
 * The order requests it makes after the first — the re-priced one after `price_changed`, and the
 * one against a freshly searched offer after `offer_no_longer_available` — are as able to land
 * unanswered as the first.
 */

const segment = {
    marketing_carrier: { iata_code: 'PR' }, marketing_carrier_flight_number: '468',
    origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' },
    departing_at: '2026-12-01T08:00:00',
};
const slice = { origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' }, departure_date: '2026-12-01', segments: [segment] };
const offer = {
    id: 'off_1', total_amount: '100.00', total_currency: 'USD', slices: [slice],
    passengers: [{ id: 'pas_1', type: 'adult' }],
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

/** A request that reaches Duffel and never answers before our timeout aborts it. */
const hangs = (init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })));
});
/** A connection that drops after the request went out. */
const drops = () => Promise.reject(new TypeError('fetch failed'));

let orderPosts: number;
let offerSearches: number;

function duffel(first: 'price_changed' | 'offer_gone', second: 'hangs' | 'drops') {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/air/orders')) {
            orderPosts++;
            if (orderPosts === 1) {
                return first === 'price_changed'
                    ? json(422, { errors: [{ code: 'price_changed', source: { offer_id: 'off_1' } }] })
                    : json(422, { errors: [{ code: 'offer_no_longer_available' }] });
            }
            if (orderPosts === 2) return second === 'hangs' ? hangs(init) : drops();
            return json(201, { data: { id: `ord_${orderPosts}`, booking_reference: 'XYZ123', documents: [] } });
        }
        if (url.includes('/actions/price')) return json(200, { data: { ...offer, total_amount: '100.50' } });
        if (url.includes('/air/offer_requests')) {
            offerSearches++;
            // The same flight, still on sale under a new offer id.
            return json(201, { data: { id: 'orq_2', offers: [{ ...offer, id: 'off_2' }] } });
        }
        throw new Error(`unexpected fetch ${url}`);
    }));
}

const place = () => placeDuffelOrder({
    rawOffer: offer, passengers: [{ id: 'pas_1', given_name: 'Juan' }],
    total: '100.00', currency: 'USD', confirmedPrice: 100, priceTolerance: 1,
    idempotencyKey: 'flight-order-sess-1', orderTimeoutMs: 20,
});

beforeEach(() => {
    orderPosts = 0;
    offerSearches = 0;
});

afterEach(() => vi.unstubAllGlobals());

describe('placeDuffelOrder when the re-priced order after price_changed gets no answer', () => {
    it('reports it unanswered when it times out, and orders nothing more', async () => {
        duffel('price_changed', 'hangs');

        const result = await place();

        expect(result).toMatchObject({ kind: 'error', timedOut: true });
        expect((result as any).status).toBeGreaterThanOrEqual(500);
        expect(orderPosts).toBe(2);
        expect(offerSearches).toBe(0);
    });

    it('reports it unanswered when the connection drops, and orders nothing more', async () => {
        duffel('price_changed', 'drops');

        const result = await place();

        expect(result).toMatchObject({ kind: 'error', timedOut: true });
        expect(orderPosts).toBe(2);
        expect(offerSearches).toBe(0);
    });
});

describe('placeDuffelOrder when the order against a freshly searched offer gets no answer', () => {
    it('reports it unanswered when the connection drops, not as an expired offer', async () => {
        duffel('offer_gone', 'drops');

        const result = await place();

        expect(result).toMatchObject({ kind: 'error', timedOut: true });
        expect((result as any).status).toBeGreaterThanOrEqual(500);
        expect(orderPosts).toBe(2);
    });

    it('reports it unanswered when it times out', async () => {
        duffel('offer_gone', 'hangs');

        const result = await place();

        expect(result).toMatchObject({ kind: 'error', timedOut: true });
        expect(orderPosts).toBe(2);
    });
});
