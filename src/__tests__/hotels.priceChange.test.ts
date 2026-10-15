import { describe, it, expect } from 'vitest';
import { computePriceChange } from '@/lib/hotels/priceChange';

describe('computePriceChange', () => {
    it('is absent when the client did not say what it expected', () => {
        expect(computePriceChange({ expected: undefined, current: 240, currency: 'USD' })).toBeUndefined();
        expect(computePriceChange({ expected: null, current: 240, currency: 'USD' })).toBeUndefined();
    });

    it('is absent when nothing moved', () => {
        expect(computePriceChange({ expected: 240, current: 240, currency: 'USD' })).toBeUndefined();
    });

    it('reports a rise with both figures and the direction', () => {
        expect(computePriceChange({ expected: 240, current: 259.2, currency: 'USD' })).toEqual({
            previous: 240, current: 259.2, direction: 'up', currency: 'USD', difference: 19.2,
        });
    });

    it('reports a drop', () => {
        expect(computePriceChange({ expected: 240, current: 228, currency: 'USD' })).toMatchObject({
            direction: 'down', difference: -12,
        });
    });

    it('ignores rounding noise below a tenth of a percent', () => {
        // 0.04% of 1000: a conversion's last cent, not a repricing.
        expect(computePriceChange({ expected: 1000, current: 1000.4, currency: 'USD' })).toBeUndefined();
    });

    it('still reports a one-cent move on a small total', () => {
        expect(computePriceChange({ expected: 10, current: 10.02, currency: 'USD' })).toMatchObject({ direction: 'up' });
    });

    it('works in a currency with no minor unit', () => {
        // ₩10,000 → ₩10,500: a 5% rise, whole won.
        expect(computePriceChange({ expected: 10_000, current: 10_500, currency: 'KRW' })).toEqual({
            previous: 10_000, current: 10_500, direction: 'up', currency: 'KRW', difference: 500,
        });
        // A single won on a six-figure stay is noise.
        expect(computePriceChange({ expected: 1_200_000, current: 1_200_001, currency: 'KRW' })).toBeUndefined();
    });

    it('cannot compare without a usable current figure', () => {
        expect(computePriceChange({ expected: 240, current: Number.NaN, currency: 'USD' })).toBeUndefined();
        expect(computePriceChange({ expected: 240, current: 0, currency: 'USD' })).toBeUndefined();
    });

    it('rounds the difference to the currency', () => {
        const out = computePriceChange({ expected: 100.1, current: 100.35, currency: 'USD' });
        expect(out?.difference).toBe(0.25);
    });
});
