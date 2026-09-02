import { describe, it, expect, vi } from 'vitest';

// `travelgatex` imports the validated env config, which calls process.exit when the
// TGX credentials are absent. These two functions are pure and touch none of it, and
// the config is only read inside other functions, so a bare stub is enough to import
// the real module rather than mocking the thing under test.
vi.mock('@/config', () => ({ config: {} }));

import { toRefundableTag, normalizeOption, toClientCancelPolicy } from '@/lib/hotels/travelgatex';

/**
 * The supplier boundary emitted `REFUNDABLE`/`NON_REFUNDABLE` while every consumer
 * tested `'RFN'` — the policy normaliser in two places, and the free-cancellation
 * filter. A test that never matches does not error; the filter just returns nothing,
 * which on screen is indistinguishable from a search with no results.
 */

describe('toRefundableTag', () => {
    it('converts the supplier boolean to the one spelling downstream tests', () => {
        expect(toRefundableTag(true)).toBe('RFN');
        expect(toRefundableTag(false)).toBe('NRFN');
    });

    it('treats absent refundability as non-refundable, never as unknown', () => {
        // A missing flag must not read as free cancellation — that would promise a
        // refund the supplier never offered.
        expect(toRefundableTag(null)).toBe('NRFN');
        expect(toRefundableTag(undefined)).toBe('NRFN');
    });
});

describe('normalizeOption refundability', () => {
    const option = (refundable: boolean | undefined) => ({
        id: 'opt-1',
        token: 'tok-1',
        boardCode: 'RO',
        price: { net: 100, gross: 120, currency: 'PHP' },
        rooms: [{ code: 'R1', description: 'Standard Double room' }],
        ...(refundable === undefined ? {} : { cancelPolicy: { refundable } }),
    }) as any;

    it('emits RFN/NRFN on both the option and its rate, not REFUNDABLE', () => {
        const refundable = normalizeOption(option(true));
        expect(refundable.refundableTag).toBe('RFN');
        expect(refundable.rates[0].refundableTag).toBe('RFN');

        const nonRefundable = normalizeOption(option(false));
        expect(nonRefundable.refundableTag).toBe('NRFN');
        expect(nonRefundable.rates[0].refundableTag).toBe('NRFN');
    });

    it('falls back to non-refundable when the supplier sends no policy', () => {
        expect(normalizeOption(option(undefined)).refundableTag).toBe('NRFN');
    });
});

/**
 * The property payload carried `refundableTag` but not the terms behind it, so a guest
 * could be told "refundable" and not by when, or for what fee. app-v2's `RoomOption`
 * had declared `cancelPolicy` all along — only the sending was missing.
 */
describe('toClientCancelPolicy', () => {
    it('renames the supplier figure to the one the client declares', () => {
        // TGX calls it `value`; the client's shape calls it `amount`.
        expect(toClientCancelPolicy({
            refundable: true,
            cancelPenalties: [
                { deadline: '2026-10-01T00:00:00Z', hoursBefore: 48, penaltyType: 'IMPORT', currency: 'USD', value: 25 },
            ],
        })).toEqual({
            refundable: true,
            cancelPenalties: [
                { deadline: '2026-10-01T00:00:00Z', amount: 25, currency: 'USD', penaltyType: 'IMPORT' },
            ],
        });
    });

    it('keeps penaltyType, without which a percentage and a fixed fee are one number', () => {
        const out = toClientCancelPolicy({
            refundable: true,
            cancelPenalties: [
                { deadline: '2026-10-01T00:00:00Z', hoursBefore: 24, penaltyType: 'PERCENT', currency: 'USD', value: 20 },
            ],
        });
        expect(out?.cancelPenalties[0].penaltyType).toBe('PERCENT');
        expect(out?.cancelPenalties[0].amount).toBe(20);
    });

    it('handles a refundable policy the supplier sent no penalties for', () => {
        expect(toClientCancelPolicy({ refundable: true }))
            .toEqual({ refundable: true, cancelPenalties: [] });
    });

    it('returns undefined when there is no policy, so the field is simply absent', () => {
        expect(toClientCancelPolicy(null)).toBeUndefined();
        expect(toClientCancelPolicy(undefined)).toBeUndefined();
    });
});
