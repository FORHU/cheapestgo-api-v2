import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));

import { placeDuffelOrder } from '@/lib/flights/duffel';

/**
 * When the offer the traveller chose has expired, `placeDuffelOrder` looks the same flight up
 * again and orders from the fresh offer, re-quoting each passenger's id from it. An adult's
 * `infant_passenger_id` names a passenger of the OLD offer; left alone it points at nobody on
 * the new one and Duffel refuses the order.
 */

const segment = {
    marketing_carrier: { iata_code: 'ZZ' }, marketing_carrier_flight_number: '2200',
    origin: { iata_code: 'MNL' }, destination: { iata_code: 'NRT' },
    departing_at: '2026-12-01T13:56:00',
};
const slice = { origin: { iata_code: 'MNL' }, destination: { iata_code: 'NRT' }, segments: [segment] };

const oldOffer = {
    id: 'off_old', total_amount: '100.00', total_currency: 'USD', slices: [slice],
    passengers: [{ id: 'pas_old_adult', type: 'adult' }, { id: 'pas_old_infant', type: 'infant_without_seat' }],
};
const freshOffer = {
    id: 'off_new', total_amount: '100.00', total_currency: 'USD', slices: [slice],
    passengers: [{ id: 'pas_new_adult', type: 'adult' }, { id: 'pas_new_infant', type: 'infant_without_seat' }],
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

let orderBodies: any[];

beforeEach(() => {
    orderBodies = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/air/orders')) {
            orderBodies.push(JSON.parse(String(init?.body)).data);
            // The first order finds the offer gone; the retry against the fresh one is accepted.
            return orderBodies.length === 1
                ? json(422, { errors: [{ code: 'offer_no_longer_available' }] })
                : json(201, { data: { id: 'ord_1' } });
        }
        if (url.includes('/air/offer_requests')) return json(201, { data: { id: 'orq_1', offers: [freshOffer] } });
        throw new Error(`unexpected fetch ${url}`);
    }));
});

afterEach(() => vi.unstubAllGlobals());

describe('placeDuffelOrder after the chosen offer has expired', () => {
    it('re-points an adult\'s infant_passenger_id at the fresh offer\'s infant', async () => {
        const result = await placeDuffelOrder({
            rawOffer: oldOffer,
            passengers: [
                { id: 'pas_old_adult', given_name: 'Juan', infant_passenger_id: 'pas_old_infant' },
                { id: 'pas_old_infant', given_name: 'Leo' },
            ],
            total: '100.00', currency: 'USD', priceTolerance: 1, idempotencyKey: 'flight-order-sess-1',
        });

        expect(result.kind).toBe('success');
        const retried = orderBodies[1];
        expect(retried.selected_offers).toEqual(['off_new']);
        expect(retried.passengers.map((p: any) => p.id)).toEqual(['pas_new_adult', 'pas_new_infant']);
        expect(retried.passengers[0].infant_passenger_id).toBe('pas_new_infant');
        expect(retried.passengers[1]).not.toHaveProperty('infant_passenger_id');
    });

    it('adds nothing to passengers who had no infant', async () => {
        await placeDuffelOrder({
            rawOffer: oldOffer,
            passengers: [{ id: 'pas_old_adult', given_name: 'Juan' }],
            total: '100.00', currency: 'USD', priceTolerance: 1, idempotencyKey: 'flight-order-sess-2',
        });

        expect(orderBodies[1].passengers[0]).not.toHaveProperty('infant_passenger_id');
    });
});
