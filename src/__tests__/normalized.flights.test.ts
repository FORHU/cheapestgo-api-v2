import { describe, it, expect } from 'vitest';

import { bagAllowance, duffelFlight, isoMinutes, mystiflyFlights } from '@/lib/normalized/flights';
import duffelRoundTrip from './fixtures/duffel-offer-round-trip.json';
import duffelConnecting from './fixtures/duffel-offer-one-way-connecting.json';
import mystifly from './fixtures/mystifly-search-mnl-icn-return.json';
import { supplierLeaks } from './helpers/supplierLeaks';

/**
 * Flight offers into the one shape the assistant sees (#53).
 *
 * Duffel: the real sandbox offers already in fixtures/. Mystifly: a live capture from its Test
 * target (MNL⇄ICN, 15–22 Dec 2026, one adult), trimmed to three fares.
 */

describe('duffelFlight', () => {
    it('maps a connecting one-way offer', () => {
        const f = duffelFlight(duffelConnecting);

        expect(f).toMatchObject({
            id:                'off_0000BAkgeXDsQCYIRasma2',
            supplier:          'duffel',
            tripType:          'one-way',
            totalPrice:        { amount: 554.13, currency: 'USD' },
            pricePerTraveller: { amount: 554.13, currency: 'USD' },
            travellers:        1,
            seatsRemaining:    null,
        });
        expect(f.segments).toHaveLength(2);
        expect(f.segments[0]).toEqual({
            leg:             0,
            airline:         { code: 'TP', name: 'TAP Air Portugal' },
            flightNumber:    'TP1367',
            from:            { airport: 'LHR', name: 'Heathrow Airport', city: 'London', terminal: null, at: '2026-10-25T12:25:00' },
            to:              expect.objectContaining({ airport: 'LIS', name: 'Lisbon Humberto Delgado Airport', city: 'Lisbon' }),
            durationMinutes: 165,
            cabin:           'economy',
            aircraft:        'Airbus A321neo',
        });
        expect(f.segments[1]).toMatchObject({ leg: 0, flightNumber: 'TP0209', durationMinutes: 510 });
        expect(f.fareRules.brand).toBe('Discount');
    });

    it('a fare with no published conditions is unknown, not non-refundable', () => {
        const f = duffelFlight(duffelConnecting);
        expect(f.cancellation).toEqual({ refundable: null, refundPenalty: null });
        expect(f.fareRules.changeable).toBeNull();
    });

    it('counts bags per traveller: a carry-on, and no checked bag rather than an unknown one', () => {
        expect(duffelFlight(duffelConnecting).baggage).toEqual({
            cabin:   { pieces: 1, weightKg: null },
            checked: { pieces: 0, weightKg: null },
        });
    });

    it('maps a round trip for three, with the price shared between them', () => {
        const f = duffelFlight(duffelRoundTrip);
        expect(f.tripType).toBe('round-trip');
        expect(f.travellers).toBe(3);
        expect(f.totalPrice).toEqual({ amount: 3988.69, currency: 'USD' });
        expect(f.pricePerTraveller.amount).toBeCloseTo(3988.69 / 3, 2);
        expect(new Set(f.segments.map((s) => s.leg))).toEqual(new Set([0, 1]));
        expect(f.fareRules.brand).toBe('Economy Light');
    });

    it('reads published conditions, penalty included', () => {
        const f = duffelFlight({
            ...duffelConnecting,
            conditions: {
                refund_before_departure: { allowed: true, penalty_amount: '75.00', penalty_currency: 'GBP' },
                change_before_departure: { allowed: false, penalty_amount: null, penalty_currency: null },
            },
        });
        expect(f.cancellation).toEqual({ refundable: true, refundPenalty: { amount: 75, currency: 'GBP' } });
        expect(f.fareRules).toMatchObject({ changeable: false, changePenalty: null });
    });

    it('passes no supplier field through', () => {
        expect(supplierLeaks(duffelFlight(duffelRoundTrip))).toEqual([]);
        expect(supplierLeaks(duffelFlight(duffelConnecting))).toEqual([]);
    });
});

describe('mystiflyFlights', () => {
    const flights = mystiflyFlights(mystifly);

    it('maps every fare in the response', () => {
        expect(flights.map((f) => f.id)).toEqual(['mystifly-fare-1', 'mystifly-fare-2', 'mystifly-fare-3']);
        expect(flights.every((f) => f.supplier === 'mystifly' && f.tripType === 'round-trip')).toBe(true);
    });

    it('maps a direct round trip', () => {
        const [f] = flights;
        expect(f).toMatchObject({
            totalPrice:        { amount: 244.77, currency: 'USD' },
            pricePerTraveller: { amount: 244.77, currency: 'USD' },
            travellers:        1,
            seatsRemaining:    9,
        });
        expect(f.segments).toEqual([
            {
                leg: 0, airline: { code: '7C', name: 'Jeju Air' }, flightNumber: '7C2104',
                from: { airport: 'MNL', name: null, city: null, terminal: null, at: '2026-12-15T23:20:00' },
                to:   { airport: 'ICN', name: null, city: null, terminal: null, at: '2026-12-16T04:10:00' },
                durationMinutes: 230, cabin: 'economy', aircraft: '7M8',
            },
            expect.objectContaining({ leg: 1, flightNumber: '7C2103', durationMinutes: 285 }),
        ]);
    });

    it('takes the direction from LegIndicator, not ItineraryRef', () => {
        // Fare 1 puts both directions under ItineraryRef 0; fare 3 gives each its own ref.
        expect(flights[0].segments.map((s) => s.leg)).toEqual([0, 1]);
        expect(flights[2].segments.map((s) => [s.from.airport, s.to.airport, s.leg])).toEqual([
            ['MNL', 'HKG', 0], ['HKG', 'ICN', 0], ['ICN', 'HKG', 1], ['HKG', 'MNL', 1],
        ]);
    });

    it('names the operating airline and keeps the marketing flight number', () => {
        const codeshare = flights[2].segments[2];
        expect(codeshare.airline.code).toBe('UO');
        expect(codeshare.flightNumber).toBe('CX5615');
    });

    it('reads a weight allowance as a weight, and an unreadable one as unknown', () => {
        expect(flights[0].baggage).toEqual({
            cabin:   { pieces: null, weightKg: 7 },
            checked: { pieces: null, weightKg: 15 },
        });
        // Fare 3: one checked piece, and a cabin allowance given only as "SB".
        expect(flights[2].baggage).toEqual({ cabin: null, checked: { pieces: 1, weightKg: null } });
    });

    it('carries the fare rules and penalties, in the currency Mystifly states them in', () => {
        expect(flights[0].cancellation).toEqual({ refundable: true, refundPenalty: { amount: 9345, currency: 'INR' } });
        expect(flights[0].fareRules).toEqual({ changeable: true, changePenalty: { amount: 7480, currency: 'INR' }, brand: null });
        expect(flights[2].fareRules.brand).toBe('ECONOMY LIGHT');
    });

    it('skips an itinerary whose fare is missing rather than inventing a price', () => {
        const broken = structuredClone(mystifly);
        broken.Data.PricedItineraries[0].FareRef = 99;
        expect(mystiflyFlights(broken).map((f) => f.id)).toEqual(['mystifly-fare-2', 'mystifly-fare-3']);
    });

    it('passes no supplier field through', () => {
        for (const f of flights) expect(supplierLeaks(f)).toEqual([]);
    });
});

describe('helpers', () => {
    it.each([
        ['1PC', { pieces: 1, weightKg: null }], ['2 PCS', { pieces: 2, weightKg: null }],
        ['15KG', { pieces: null, weightKg: 15 }], ['20K', { pieces: null, weightKg: 20 }],
        ['0PC', { pieces: 0, weightKg: null }], ['SB', null], ['', null],
    ])('bag allowance %s', (value, expected) => {
        expect(bagAllowance(value)).toEqual(expected);
    });

    it.each([['PT3H50M', 230], ['PT45M', 45], ['P1DT2H', 1560], ['', null], ['3h', null]])('duration %s', (v, n) => {
        expect(isoMinutes(v)).toBe(n);
    });
});
