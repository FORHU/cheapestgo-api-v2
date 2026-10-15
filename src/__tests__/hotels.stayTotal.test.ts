import { describe, it, expect } from 'vitest';
import { attachStayTotals, stayTotalOf } from '@/lib/hotels/stayTotal';

describe('stayTotalOf', () => {
    it('is the nightly rate times the nights, to the cent', () => {
        expect(stayTotalOf({ price: 105.6 }, 2)).toBe(211.2);
        expect(stayTotalOf({ price: 33.333 }, 3)).toBe(100);
    });

    it('prefers the supplier\'s own total when it agrees with the card, so no cent is lost', () => {
        // 100.01 / 3 = 33.3367 nightly; ×3 gives 100.0101, the supplier's 100.01 is the truth.
        expect(stayTotalOf({ price: 33.3367, roomTypes: [{ gross: 100.01 }] }, 3)).toBe(100.01);
    });

    it('does not trust a rate that disagrees with the card', () => {
        // The cheapest rate shown is not the one the card was priced from.
        expect(stayTotalOf({ price: 100, roomTypes: [{ gross: 900 }] }, 2)).toBe(200);
    });

    it('is absent when there is no price to multiply', () => {
        expect(stayTotalOf({ price: 0 }, 2)).toBeUndefined();
        expect(stayTotalOf({}, 2)).toBeUndefined();
    });

    it('treats a missing night count as one, as everywhere else', () => {
        expect(stayTotalOf({ price: 80 }, 0)).toBe(80);
    });
});

describe('attachStayTotals', () => {
    it('adds the total and the nights without disturbing anything else', () => {
        const [a] = attachStayTotals([{ id: 'H1', price: 50, currency: 'USD' }], 3);
        expect(a).toEqual({ id: 'H1', price: 50, currency: 'USD', stayTotal: 150, nights: 3 });
    });

    it('leaves a listing with no price as it was, apart from the nights', () => {
        const [a] = attachStayTotals([{ id: 'catalog-only', price: 0 }], 2);
        expect(a).toEqual({ id: 'catalog-only', price: 0, nights: 2 });
        expect('stayTotal' in a).toBe(false);
    });

    it('does not mutate its input', () => {
        const input = [{ id: 'H1', price: 50 }];
        attachStayTotals(input, 2);
        expect(input[0]).toEqual({ id: 'H1', price: 50 });
    });
});
