import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));

import { parseDuffelOffer, normalizedToFlightOffer } from '@/lib/flights/duffel';
import roundTrip from './fixtures/duffel-offer-round-trip.json';

// The fixture is a real Duffel sandbox offer (LHR↔JFK), trimmed of available_services:
// 2 adults + 1 child, one codeshare segment per slice (AY marketed, AA/BA operated).

describe('Duffel offer → FlightOffer', () => {

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

    it('names each airport and city, as Duffel sends them', () => {
        const offer = normalizedToFlightOffer(parseDuffelOffer(roundTrip, 'economy'), 'round-trip');
        const [out, back] = offer.segments;

        expect(out.departure).toMatchObject({ airport: 'LHR', airportName: 'Heathrow Airport', city: 'London' });
        expect(out.arrival).toMatchObject({ airport: 'JFK', airportName: 'John F. Kennedy International Airport', city: 'New York' });
        expect(back.departure).toMatchObject({ airport: 'JFK', city: 'New York' });
    });

    it('carries the bag allowance Duffel publishes for the traveller', () => {
        // The fixture's fare: one carry-on, nothing in the hold.
        const offer = normalizedToFlightOffer(parseDuffelOffer(roundTrip, 'economy'), 'round-trip');
        expect(offer.baggage).toEqual({ cabinBag: true, checkedBags: 0 });
    });

    it('gives the least generous allowance across the trip — a bag allowed out but not back is not allowed', () => {
        const withBags = (out: number, back: number) => {
            const copy = JSON.parse(JSON.stringify(roundTrip));
            const bags = (n: number) => [{ type: 'carry_on', quantity: 1 }, ...(n ? [{ type: 'checked', quantity: n }] : [])];
            copy.slices[0].segments.forEach((s: any) => s.passengers.forEach((p: any) => { p.baggages = bags(out); }));
            copy.slices[1].segments.forEach((s: any) => s.passengers.forEach((p: any) => { p.baggages = bags(back); }));
            return normalizedToFlightOffer(parseDuffelOffer(copy, 'economy'), 'round-trip').baggage;
        };
        expect(withBags(1, 1)).toEqual({ cabinBag: true, checkedBags: 1 });
        expect(withBags(2, 1)).toEqual({ cabinBag: true, checkedBags: 1 });
    });

    it('says nothing about bags when Duffel says nothing', () => {
        const copy = JSON.parse(JSON.stringify(roundTrip));
        copy.slices.forEach((sl: any) => sl.segments.forEach((s: any) => s.passengers.forEach((p: any) => { delete p.baggages; })));
        expect(normalizedToFlightOffer(parseDuffelOffer(copy, 'economy'), 'round-trip').baggage).toBeUndefined();
    });

    it("gives each direction its own run time — the outbound's is not the return's", () => {
        const offer = normalizedToFlightOffer(parseDuffelOffer(roundTrip, 'economy'), 'round-trip');
        expect(offer.sliceDurations).toEqual([480, 410]);
        expect(offer.totalDuration).toBe(890);
    });
});
