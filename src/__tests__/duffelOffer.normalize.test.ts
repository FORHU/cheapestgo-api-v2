import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));

import { parseDuffelOffer, normalizedToFlightOffer } from '@/lib/flights/duffel';
import roundTrip from './fixtures/duffel-offer-round-trip.json';
import oneWayConnecting from './fixtures/duffel-offer-one-way-connecting.json';

// Fixtures are real Duffel sandbox offers (LHR↔JFK), trimmed of available_services.
//   round-trip:          2 adults + 1 child, one codeshare segment per slice (AY marketed, AA/BA operated)
//   one-way-connecting:  1 adult, LHR→LIS→JFK on TAP

describe('Duffel offer → FlightOffer', () => {
    it('carries every segment with the FlightSegmentDetail shape', () => {
        const offer = normalizedToFlightOffer(parseDuffelOffer(oneWayConnecting, 'economy'), 'one-way');

        expect(offer.segments).toHaveLength(2);
        expect(offer.segments[0]).toMatchObject({
            segmentIndex: 0,
            airline: { code: 'TP', name: 'TAP Air Portugal' },
            origin: 'LHR',
            destination: 'LIS',
            flightNumber: 'TP1367',
            departure: { airport: 'LHR', time: '2026-10-25T12:25:00' },
            arrival: { airport: 'LIS', time: '2026-10-25T15:10:00' },
            duration: 165,
            aircraft: 'Airbus A321neo',
            cabinClass: 'economy',
        });
        expect(offer.segments[1]).toMatchObject({ segmentIndex: 0, origin: 'LIS', destination: 'JFK', flightNumber: 'TP0209' });
        expect(offer.totalStops).toBe(1);
    });

    it('groups segments by slice and names the marketing carrier on a codeshare', () => {
        const offer = normalizedToFlightOffer(parseDuffelOffer(roundTrip, 'economy'), 'round-trip');

        expect(offer.segments.map((s: any) => [s.segmentIndex, s.origin, s.destination])).toEqual([
            [0, 'LHR', 'JFK'],
            [1, 'JFK', 'LHR'],
        ]);
        // Flight number is AY3777, so the airline shown beside it must be Finnair, not the operator.
        expect(offer.segments[0].airline).toEqual({ code: 'AY', name: 'Finnair' });
        expect(offer.segments[0].flightNumber).toBe('AY3777');
    });

    it('splits the price into base + taxes and per-adult', () => {
        const offer = normalizedToFlightOffer(parseDuffelOffer(roundTrip, 'economy'), 'round-trip');

        expect(offer.price).toEqual({
            total: 3988.69,
            base: 1746,
            taxes: 2242.69,
            currency: 'USD',
            pricePerAdult: Math.round(3988.69 / 2),
        });
    });

    it('builds the search-time fare policy from Duffel conditions', () => {
        const offer = normalizedToFlightOffer(parseDuffelOffer(roundTrip, 'economy'), 'round-trip');

        expect(offer.farePolicy).toEqual({
            isRefundable: false,
            isChangeable: false,
            refundPenaltyAmount: null,
            refundPenaltyCurrency: null,
            changePenaltyAmount: null,
            changePenaltyCurrency: null,
            policyVersion: 'search',
            policySource: 'duffel',
        });
    });

    it('rebuilds the same offer from a cache row that only kept the raw Duffel payload', () => {
        const fresh = normalizedToFlightOffer(parseDuffelOffer(roundTrip, 'economy'), 'round-trip');
        // Shape returned by getExistingCachedResults in lib/flights/search.ts
        const cacheRow = {
            provider: 'duffel', offer_id: roundTrip.id, price: 3988.69, currency: 'USD', airline: 'Finnair',
            departure_time: '2026-10-25T15:35:00.000Z', arrival_time: '2026-11-02T11:10:00.000Z',
            duration: 890, stops: 0, remaining_seats: null, refundable: false, raw: roundTrip,
        };
        const cached = normalizedToFlightOffer(cacheRow as any, 'round-trip');

        expect(cached.segments).toEqual(fresh.segments);
        expect(cached.price).toEqual(fresh.price);
        expect(cached.farePolicy).toEqual(fresh.farePolicy);
    });
});
