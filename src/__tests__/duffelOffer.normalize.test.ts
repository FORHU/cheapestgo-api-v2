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
});
