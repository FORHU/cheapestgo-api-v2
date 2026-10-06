import { describe, it, expect } from 'vitest';
import { resolveHotelChargeBase, type StoredQuote } from '@/lib/payments/chargeBase';
import { makeStrictConverter, ExchangeRateError } from '@/lib/payments/convertStrict';
import type { RatesResult } from '@/services/exchange-rates.service';

/**
 * C2a. The browser sends the total it claims to have displayed; before this, that
 * number went straight to Stripe. These cover the rules that stop it: the charge
 * comes from the supplier quote recorded at prebook, and a payload that disagrees
 * with it is refused rather than billed.
 */

const NOW = Date.parse('2026-08-25T12:00:00Z');
const later = (mins: number) => new Date(NOW + mins * 60_000).toISOString();

const quote = (over: Partial<StoredQuote> = {}): StoredQuote => ({
    gross:      1000,
    currency:   'PHP',
    expires_at: later(20),
    ...over,
});

/** Same currency in, same amount out — never reached for a matching currency. */
const noConvert = () => { throw new Error('convert should not have been called'); };

describe('resolveHotelChargeBase', () => {
    it('charges the supplier quote, not the client payload', () => {
        // The classic tampering case: browser claims 1, quote says 1000.
        const r = resolveHotelChargeBase(quote(), 1, 'PHP', noConvert, NOW);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('PRICE_CHANGED');
    });

    it('reports the server figure so the customer sees the real total', () => {
        const r = resolveHotelChargeBase(quote(), 1, 'PHP', noConvert, NOW);
        if (r.ok) throw new Error('expected rejection');
        expect(r.serverPrice).toBe(1000);
        expect(r.currency).toBe('PHP');
    });

    it('refuses a prebookId that has no recorded quote', () => {
        const r = resolveHotelChargeBase(null, 1000, 'PHP', noConvert, NOW);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('QUOTE_NOT_FOUND');
    });

    it('refuses an expired quote rather than charging a stale price', () => {
        const r = resolveHotelChargeBase(quote({ expires_at: later(-1) }), 1000, 'PHP', noConvert, NOW);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('QUOTE_EXPIRED');
    });

    it('treats a zero or negative quote as unusable', () => {
        for (const gross of [0, -5, Number.NaN]) {
            const r = resolveHotelChargeBase(quote({ gross }), 1000, 'PHP', noConvert, NOW);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.code).toBe('QUOTE_NOT_FOUND');
        }
    });

    it('accepts a payload that matches the quote', () => {
        const r = resolveHotelChargeBase(quote(), 1000, 'PHP', noConvert, NOW);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.base).toBe(1000);
            expect(r.absorbed).toBe(0);
        }
    });

    it('never bills above what the customer was shown, absorbing the rounding', () => {
        // Server says 1000, browser displayed 999 — inside tolerance, so the
        // customer gets their figure and we absorb 1.
        const r = resolveHotelChargeBase(quote(), 999, 'PHP', noConvert, NOW);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.base).toBe(999);
            expect(r.absorbed).toBe(1);
        }
    });

    it('passes the lower price on when its own figure is higher', () => {
        const r = resolveHotelChargeBase(quote({ gross: 999 }), 1000, 'PHP', noConvert, NOW);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.base).toBe(999);
    });

    it('stops checkout when conversion is unavailable instead of guessing', () => {
        const broken = () => { throw new ExchangeRateError('no rates'); };
        const r = resolveHotelChargeBase(quote(), 17, 'USD', broken, NOW);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('FX_UNAVAILABLE');
    });

    it('converts the quote when the charge currency differs', () => {
        const convert = (a: number, from: string, to: string) => {
            expect([from, to]).toEqual(['PHP', 'USD']);
            return a * 0.0162;
        };
        const r = resolveHotelChargeBase(quote(), 16.2, 'USD', convert, NOW);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.quoteGross).toBe(1000);
            expect(r.quoteCurrency).toBe('PHP');
            expect(r.base).toBeCloseTo(16.2, 4);
        }
    });
});

describe('makeStrictConverter', () => {
    const rates = (over: Partial<RatesResult> = {}): RatesResult => ({
        rates:     { USD: 1, PHP: 0.0162, KRW: 0.00072 },
        source:    'live',
        provider:  'er-api',
        fetchedAt: NOW,
        missing:   [],
        ...over,
    });

    it('converts through USD', () => {
        const c = makeStrictConverter(rates(), undefined, () => NOW);
        expect(c(1000, 'PHP', 'USD')).toBeCloseTo(16.2, 6);
    });

    it('passes a same-currency amount through without needing rates', () => {
        const c = makeStrictConverter(null, undefined, () => NOW);
        expect(c(1000, 'PHP', 'PHP')).toBe(1000);
    });

    it('throws rather than returning the amount unconverted', () => {
        // The failure this exists to prevent: 5800 PHP silently billed as 5800 USD.
        const c = makeStrictConverter(null, undefined, () => NOW);
        expect(() => c(5800, 'PHP', 'USD')).toThrow(ExchangeRateError);
    });

    it('refuses a currency it has no rate for', () => {
        const c = makeStrictConverter(rates(), undefined, () => NOW);
        expect(() => c(100, 'PHP', 'VND')).toThrow(ExchangeRateError);
    });

    it('refuses rates too old to charge from', () => {
        const dayOld = makeStrictConverter(rates({ fetchedAt: NOW - 25 * 3_600_000 }), undefined, () => NOW);
        expect(() => dayOld(1000, 'PHP', 'USD')).toThrow(/old/);
    });

    it('refuses a non-finite amount', () => {
        const c = makeStrictConverter(rates(), undefined, () => NOW);
        expect(() => c(Number.NaN, 'PHP', 'USD')).toThrow(ExchangeRateError);
    });
});
