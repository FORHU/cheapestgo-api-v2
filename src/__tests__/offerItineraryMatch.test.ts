import { describe, it, expect } from 'vitest';
import { isSameItinerary, sameItineraryOffers } from '@/lib/flights/offerItineraryMatch';

function seg(patch: Record<string, any> = {}) {
    return {
        marketing_carrier: { iata_code: 'BR' },
        marketing_carrier_flight_number: '271',
        operating_carrier: { iata_code: 'BR' },
        origin: { iata_code: 'CRK' },
        destination: { iata_code: 'NRT' },
        departing_at: '2026-09-14T06:05:00',
        ...patch,
    };
}

function offer(segments: any[][], total = '929.00') {
    return {
        id: `off_${Math.random().toString(36).slice(2)}`,
        total_amount: total,
        total_currency: 'USD',
        slices: segments.map(s => ({ segments: s })),
    };
}

const original = offer([[seg()]]);

describe('isSameItinerary', () => {
    it('accepts the same flight sold again at a different price', () => {
        expect(isSameItinerary(original, offer([[seg()]], '981.40'))).toBe(true);
    });

    it('rejects a different departure time on the same route and carrier', () => {
        // The bug this exists for: a 22:05 is not a 06:05, however close the fare.
        const later = offer([[seg({ departing_at: '2026-09-14T22:05:00' })]], '929.00');
        expect(isSameItinerary(original, later)).toBe(false);
    });

    it('rejects a different flight number at the same departure time', () => {
        const other = offer([[seg({ marketing_carrier_flight_number: '273' })]]);
        expect(isSameItinerary(original, other)).toBe(false);
    });

    it('rejects a different marketing carrier', () => {
        const other = offer([[seg({ marketing_carrier: { iata_code: 'PR' } })]]);
        expect(isSameItinerary(original, other)).toBe(false);
    });

    it('rejects a connection when a non-stop was selected', () => {
        const connecting = offer([[
            seg({ destination: { iata_code: 'MNL' } }),
            seg({ marketing_carrier_flight_number: '999', origin: { iata_code: 'MNL' }, departing_at: '2026-09-14T09:00:00' }),
        ]]);
        expect(isSameItinerary(original, connecting)).toBe(false);
    });

    it('rejects a round trip when a one-way was selected', () => {
        const roundTrip = offer([
            [seg()],
            [seg({ origin: { iata_code: 'NRT' }, destination: { iata_code: 'CRK' }, departing_at: '2026-09-20T10:00:00' })],
        ]);
        expect(isSameItinerary(original, roundTrip)).toBe(false);
    });

    it('matches a round trip leg for leg', () => {
        const legs = [
            [seg()],
            [seg({ marketing_carrier_flight_number: '272', origin: { iata_code: 'NRT' }, destination: { iata_code: 'CRK' }, departing_at: '2026-09-20T10:00:00' })],
        ];
        expect(isSameItinerary(offer(legs), offer(legs, '1400.00'))).toBe(true);
    });

    it('ignores a differing operating carrier — codeshares vary it legitimately', () => {
        const codeshare = offer([[seg({ operating_carrier: { iata_code: 'B7' } })]]);
        expect(isSameItinerary(original, codeshare)).toBe(true);
    });

    it('compares departure as an instant, not as a string', () => {
        const sameInstant = offer([[seg({ departing_at: '2026-09-14T06:05:00.000' })]]);
        expect(isSameItinerary(original, sameInstant)).toBe(true);
    });

    it('honours an explicit tolerance for a retimed flight', () => {
        const retimed = offer([[seg({ departing_at: '2026-09-14T06:06:00' })]]);
        expect(isSameItinerary(original, retimed)).toBe(false);
        expect(isSameItinerary(original, retimed, 120_000)).toBe(true);
    });

    it('rejects offers with no readable slices rather than matching loosely', () => {
        expect(isSameItinerary(original, { slices: [] })).toBe(false);
        expect(isSameItinerary(original, {})).toBe(false);
        expect(isSameItinerary({}, original)).toBe(false);
    });

    it('rejects a segment missing its flight number instead of treating blanks as equal', () => {
        const blank = offer([[seg({ marketing_carrier_flight_number: '' })]]);
        expect(isSameItinerary(blank, blank)).toBe(false);
    });
});

describe('sameItineraryOffers', () => {
    it('keeps only true matches and returns them cheapest first', () => {
        const cheap = offer([[seg()]], '899.00');
        const dear = offer([[seg()]], '1099.00');
        const wrongFlight = offer([[seg({ departing_at: '2026-09-14T22:05:00' })]], '905.00');

        const picked = sameItineraryOffers(original, [dear, wrongFlight, cheap]);

        expect(picked.map(o => o.total_amount)).toEqual(['899.00', '1099.00']);
    });

    it('returns nothing when the pool holds no match, so the caller cannot substitute', () => {
        const wrongFlight = offer([[seg({ marketing_carrier_flight_number: '273' })]], '900.00');
        expect(sameItineraryOffers(original, [wrongFlight])).toEqual([]);
    });

    it('tolerates an empty or missing pool', () => {
        expect(sameItineraryOffers(original, [])).toEqual([]);
        expect(sameItineraryOffers(original, undefined as any)).toEqual([]);
    });
});
