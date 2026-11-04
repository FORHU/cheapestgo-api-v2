import { describe, it, expect } from 'vitest';
import { GOLF_MARKUP_SPEC, HOTEL_MARKUP_SPEC, golfServiceFee, roundToCurrency } from '@/lib/pricing';
import { makeStrictConverter } from '@/lib/payments/convertStrict';
import { quoteGolf } from '@/lib/golf/quote';
import type { RatesResult } from '@/services/exchange-rates.service';

/**
 * The all-in price of golf (v1 ADR-0047): green fee plus the service fee, in the currency the visitor
 * chose. The picker shows it and piece 2b will charge it, so its parts must add up to the cent (or
 * the won) in that currency.
 */

const RATES: RatesResult = {
    rates: { USD: 1, KRW: 0.00075, PHP: 0.0175 }, source: 'live', provider: 'test', fetchedAt: Date.now(), missing: [],
};
const convert = makeStrictConverter(RATES);

describe('roundToCurrency', () => {
    it('rounds to whole units where a currency has no minor unit, and to cents elsewhere', () => {
        expect(roundToCurrency(1234.567, 'KRW')).toBe(1235);
        expect(roundToCurrency(1234.567, 'jpy')).toBe(1235);
        expect(roundToCurrency(1234.567, 'USD')).toBe(1234.57);
    });
});

describe('the golf service fee', () => {
    it('follows the hotel spec unless golf is given its own', () => {
        expect(GOLF_MARKUP_SPEC).toEqual(HOTEL_MARKUP_SPEC);
    });

    it('is the hotel calculation with golf\'s spec', () => {
        const fee = golfServiceFee(200, 'USD', convert);
        expect(fee.chargedTotal).toBe(Math.round((200 + 200 * GOLF_MARKUP_SPEC.rate + GOLF_MARKUP_SPEC.flat) * 100) / 100);
    });
});

describe('quoteGolf', () => {
    it("adds the fee to the green fee in the course's own currency when the visitor uses it", () => {
        const q = quoteGolf({ greenFeeTotal: 170, currency: 'USD', chargeCurrency: 'USD', convert });
        expect(q).toMatchObject({ currency: 'USD', rate: 1, greenFee: 170 });
        expect(q.total).toBe(golfServiceFee(170, 'USD', convert).chargedTotal);
        expect(q.greenFee + q.serviceFee).toBeCloseTo(q.total, 10);
    });

    it("converts into the visitor's currency, every part in whole won, adding up exactly", () => {
        const q = quoteGolf({ greenFeeTotal: 170, currency: 'USD', chargeCurrency: 'krw', convert });
        expect(q.currency).toBe('KRW');
        expect(q.greenFee).toBe(226667);                 // 170 / 0.00075, to the won
        expect(Number.isInteger(q.serviceFee)).toBe(true);
        expect(Number.isInteger(q.total)).toBe(true);
        expect(q.greenFee + q.serviceFee).toBe(q.total);
        expect(q.rate).toBeCloseTo(1 / 0.00075, 6);
    });

    it('puts the fee on green fee and extras together, and the parts add up', () => {
        const q = quoteGolf({ greenFeeTotal: 170, extraTotals: [30, 20], currency: 'USD', chargeCurrency: 'USD', convert });
        expect(q).toMatchObject({ greenFee: 170, extraTotals: [30, 20], extrasTotal: 50 });
        expect(q.total).toBe(golfServiceFee(220, 'USD', convert).chargedTotal);
        expect(q.greenFee + q.extrasTotal + q.serviceFee).toBeCloseTo(q.total, 10);
    });

    it('converts each extra on its own, every line in whole won, adding up exactly', () => {
        const q = quoteGolf({ greenFeeTotal: 170, extraTotals: [33.33, 21.11], currency: 'USD', chargeCurrency: 'KRW', convert });
        expect(q.extraTotals.every(Number.isInteger)).toBe(true);
        expect(q.extraTotals[0] + q.extraTotals[1]).toBe(q.extrasTotal);
        expect(q.greenFee + q.extrasTotal + q.serviceFee).toBe(q.total);
    });

    it('prices no extras as nothing', () => {
        expect(quoteGolf({ greenFeeTotal: 170, currency: 'USD', convert })).toMatchObject({ extraTotals: [], extrasTotal: 0 });
    });

    it('refuses to quote what it cannot convert', () => {
        expect(() => quoteGolf({ greenFeeTotal: 170, currency: 'USD', chargeCurrency: 'THB', convert })).toThrow();
    });
});
