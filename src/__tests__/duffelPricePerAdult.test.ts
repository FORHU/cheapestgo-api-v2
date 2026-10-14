import { describe, it, expect, vi } from 'vitest';

// duffel.ts reads @/config at import, and the real config exits the process when the
// environment is incomplete. The token is the only field this path touches.
vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'test-token' } }));
import { normalizedToFlightOffer } from '@/lib/flights/duffel';

/**
 * What a flight card means by "/person".
 *
 * Duffel prices an offer for the whole party and sends no per-passenger figure, so
 * `pricePerAdult` was filled from the party total — correct for one traveller and wrong by
 * the party size for everyone else. A search for three adults offered every MNL→ICN fare
 * at 337.50 a head when the fare is 112.50.
 *
 * The same shape as the hotel stay-total bug fixed the same day: a total under a per-unit
 * label, exactly right at a quantity of one, which is the only quantity anybody tried.
 */

const offer = (passengers: number, total: number) => normalizedToFlightOffer({
    offer_id:  'off_test',
    provider:  'duffel',
    price:     total,
    currency:  'USD',
    duration:  200,
    stops:     0,
    segments:  [],
    raw: {
        total_amount: String(total),
        base_amount:  String(total * 0.5),
        tax_amount:   String(total * 0.5),
        passengers:   Array.from({ length: passengers }, (_, i) => ({ id: `pas_${i}`, type: 'adult' })),
        slices:       [],
    },
} as any);

describe('normalizedToFlightOffer — pricePerAdult', () => {
    it('is the fare one traveller pays, not what the party pays', () => {
        expect(offer(3, 337.5).price.pricePerAdult).toBe(112.5);
    });

    it.each([
        [1, 112.5, 112.5],
        [2, 225,   112.5],
        [3, 337.5, 112.5],
    ])('%i passenger(s) at %d total → %d each', (pax, total, each) => {
        expect(offer(pax, total).price.pricePerAdult).toBe(each);
    });

    it('leaves the party total alone — that is the figure the booking is made at', () => {
        const o = offer(3, 337.5);
        expect(o.price.total).toBe(337.5);
    });

    it('falls back to the total when the offer names no passengers', () => {
        // Rather than dividing by zero and sending Infinity to a price label.
        const o = normalizedToFlightOffer({
            offer_id: 'off_x', provider: 'duffel', price: 99, currency: 'USD',
            duration: 100, stops: 0, segments: [], raw: { slices: [] },
        } as any);
        expect(o.price.pricePerAdult).toBe(99);
    });
});
