import { describe, it, expect, vi } from 'vitest';
import { lockFx } from '@/lib/payments/fxLock';
import type { RatesResult } from '@/services/exchange-rates.service';

/**
 * C2b. ADR-0008: revenue is reported in USD at the rate in force when the payment was
 * taken, so the rate is stored with the booking as evidence rather than looked up
 * later. This runs after Stripe has taken the money, so the rule that matters most is
 * that it never throws — a booking recorded unconverted beats a booking lost.
 */

const ratesResult = (rates: Record<string, number>): RatesResult => ({
    rates,
    source:    'live',
    provider:  'er-api',
    fetchedAt: Date.now(),
    missing:   [],
});

const stub = (value: RatesResult | null) => ({ getLiveRates: vi.fn().mockResolvedValue(value) });

describe('lockFx', () => {
    it('restates the amount in USD at the live rate', async () => {
        const fx = await lockFx(1000, 'PHP', stub(ratesResult({ USD: 1, PHP: 0.0162 })));
        expect(fx.usd_amount).toBeCloseTo(16.2, 6);
        expect(fx.fx_rate).toBe(0.0162);
        expect(fx.fx_source).toBe('live');
        expect(fx.fx_captured_at).toBeInstanceOf(Date);
    });

    it('needs no rate and no provider call for a USD booking', async () => {
        const rates = stub(null);
        const fx = await lockFx(250, 'USD', rates);

        expect(fx).toMatchObject({ usd_amount: 250, fx_rate: 1, fx_source: 'identity' });
        expect(rates.getLiveRates).not.toHaveBeenCalled();
    });

    it('records the booking unconverted when the currency has no rate', async () => {
        const fx = await lockFx(1000, 'PHP', stub(ratesResult({ USD: 1 })));
        expect(fx).toMatchObject({ usd_amount: null, fx_rate: null, fx_source: null });
    });

    it('records the booking unconverted when rates are unavailable entirely', async () => {
        const fx = await lockFx(1000, 'PHP', stub(null));
        expect(fx.usd_amount).toBeNull();
        expect(fx.fx_source).toBeNull();
    });

    it('never throws when the rates provider does', async () => {
        // The money has already moved — this must not be able to fail the write.
        const exploding = { getLiveRates: vi.fn().mockRejectedValue(new Error('upstream down')) };
        await expect(lockFx(1000, 'PHP', exploding)).resolves.toMatchObject({ usd_amount: null });
    });

    it('rejects a non-positive or absent rate rather than trusting it', async () => {
        for (const bad of [0, -1, Number.NaN]) {
            const fx = await lockFx(1000, 'PHP', stub(ratesResult({ USD: 1, PHP: bad })));
            expect(fx.fx_rate).toBeNull();
        }
    });

    it('returns empty for an unusable amount or a missing currency', async () => {
        const rates = stub(ratesResult({ USD: 1, PHP: 0.0162 }));
        expect((await lockFx(null, 'PHP', rates)).fx_source).toBeNull();
        expect((await lockFx(Number.NaN, 'PHP', rates)).fx_source).toBeNull();
        expect((await lockFx(100, null, rates)).fx_source).toBeNull();
        expect((await lockFx(100, '', rates)).fx_source).toBeNull();
    });

    it('treats the currency case-insensitively', async () => {
        const fx = await lockFx(1000, 'php', stub(ratesResult({ USD: 1, PHP: 0.0162 })));
        expect(fx.fx_rate).toBe(0.0162);
    });
});
