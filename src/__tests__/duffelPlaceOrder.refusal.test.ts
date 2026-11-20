import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));

import { placeDuffelOrder, isOfferGoneError } from '@/lib/flights/duffel';

/**
 * A 422 from Duffel is not always "the offer is gone". A passenger, phone or document the airline
 * will not take is a 422 too, and used to be sent down the expired-offer path: the itinerary was
 * searched again and either reported as a price change or ordered a second time (sandbox run
 * 2026-11-11, BUG-2). Only an offer that is actually gone is worth searching for again.
 */

const segment = {
    marketing_carrier: { iata_code: 'PR' }, marketing_carrier_flight_number: '468',
    origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' },
    departing_at: '2026-12-01T08:00:00',
};
const slice = { origin: { iata_code: 'MNL' }, destination: { iata_code: 'ICN' }, departure_date: '2026-12-01', segments: [segment] };
const offer = { id: 'off_1', total_amount: '100.00', total_currency: 'USD', slices: [slice], passengers: [{ id: 'pas_1', type: 'adult' }] };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

let orderPosts: number;
let offerSearches: number;

/** Duffel refusing the first order with `firstError`, then (if asked again) ordering the fresh offer. */
function duffel(firstError: { code: string; message?: string }) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.endsWith('/air/orders')) {
            orderPosts++;
            if (orderPosts === 1) return json(422, { errors: [firstError] });
            return json(201, { data: { id: 'ord_2', booking_reference: 'XYZ123', documents: [] } });
        }
        if (url.includes('/air/offer_requests')) {
            offerSearches++;
            return json(201, { data: { id: 'orq_2', offers: [{ ...offer, id: 'off_2' }] } });
        }
        throw new Error(`unexpected fetch ${url}`);
    }));
}

const place = () => placeDuffelOrder({
    rawOffer: offer, passengers: [{ id: 'pas_1', given_name: 'Juan' }],
    total: '100.00', currency: 'USD', confirmedPrice: 100, priceTolerance: 1,
    idempotencyKey: 'flight-order-sess-1', orderTimeoutMs: 1000,
});

beforeEach(() => { orderPosts = 0; offerSearches = 0; });
afterEach(() => vi.unstubAllGlobals());

describe('placeDuffelOrder when the airline refuses the order', () => {
    it.each([
        ['a passenger the airline will not take', { code: 'validation_error', message: 'The passenger name is not accepted by the airline' }],
        ['a phone number Duffel rejects',         { code: 'validation_error', message: 'phone_number is invalid' }],
        ['an unknown refusal',                    { code: 'airline_error', message: 'The airline declined the booking' }],
    ])('hands back %s as a refusal, without searching again or ordering a second time', async (_label, error) => {
        duffel(error);

        const result = await place();

        expect(result).toEqual({ kind: 'error', status: 422, data: { errors: [error] } });
        expect(orderPosts).toBe(1);
        expect(offerSearches).toBe(0);
    });
});

describe('placeDuffelOrder when the offer is gone', () => {
    it('still searches the same flight again and orders it', async () => {
        duffel({ code: 'offer_no_longer_available', message: 'Please select another offer' });

        const result = await place();

        expect(result).toMatchObject({ kind: 'success', order: { id: 'ord_2' } });
        expect(offerSearches).toBe(1);
        expect(orderPosts).toBe(2);
    });
});

describe('isOfferGoneError', () => {
    it.each([
        [{ code: 'offer_no_longer_available' }, true],
        [{ code: 'validation_error', message: 'The offer has expired' }, true],
        [{ code: 'validation_error', message: 'Please select another offer' }, true],
        [{ code: 'validation_error', message: 'phone_number is invalid' }, false],
        [{ code: 'validation_error', message: 'given_name is invalid' }, false],
        [{ code: 'price_changed' }, false],
    ])('%j → %s', (error, gone) => {
        expect(isOfferGoneError({ errors: [error] })).toBe(gone);
    });
});
