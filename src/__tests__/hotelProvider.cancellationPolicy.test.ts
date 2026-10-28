// src/__tests__/hotelProvider.cancellationPolicy.test.ts
import { describe, it, expect } from 'vitest';
import { toPrebookPolicyWire, toStoredPolicyWire } from '@/lib/hotels/providers/cancellationPolicy';
import type { CancellationTerms } from '@/lib/hotels/providers/types';

const REFUNDABLE: CancellationTerms = {
    refundable: true,
    penalties: [
        { deadline: '2026-11-07T10:00:00.000Z', type: 'AMOUNT',  value: 120, currency: 'USD', hoursBefore: 72 },
        { deadline: '2026-11-09T10:00:00.000Z', type: 'PERCENT', value: 100, currency: '',    hoursBefore: 24 },
    ],
};

describe('toPrebookPolicyWire', () => {
    it('is an empty object when the supplier sent no policy', () => {
        expect(toPrebookPolicyWire(null)).toEqual({});
        expect(toPrebookPolicyWire(undefined)).toEqual({});
    });

    it('leads a refundable rate with a zero-amount "free until" marker at the first deadline', () => {
        expect(toPrebookPolicyWire(REFUNDABLE)).toEqual({
            refundableTag: 'RFN',
            cancelPolicyInfos: [
                { cancelTime: '2026-11-07T10:00:00.000Z', amount: 0,   currency: 'USD', type: 'AMOUNT' },
                { cancelTime: '2026-11-07T10:00:00.000Z', amount: 120, currency: 'USD', type: 'AMOUNT' },
                // a missing currency falls back to USD on this path, as it always has
                { cancelTime: '2026-11-09T10:00:00.000Z', amount: 100, currency: 'USD', type: 'PERCENT' },
            ],
        });
    });

    it('has no marker for a non-refundable rate', () => {
        expect(toPrebookPolicyWire({ refundable: false, penalties: [] })).toEqual({
            refundableTag: 'NRFN',
            cancelPolicyInfos: [],
        });
    });

    it('defaults a penalty with no type to AMOUNT', () => {
        const wire = toPrebookPolicyWire({
            refundable: false,
            penalties: [{ deadline: '2026-11-01T00:00:00Z', type: '', value: 10, currency: 'USD' }],
        });
        expect(wire.cancelPolicyInfos?.[0].type).toBe('AMOUNT');
    });
});

describe('toStoredPolicyWire', () => {
    it('is null when the booking response carried no policy', () => {
        expect(toStoredPolicyWire(null, 'PHP')).toBeNull();
        expect(toStoredPolicyWire(undefined, 'PHP')).toBeNull();
    });

    it('has no leading marker and falls back to the currency the booking is stored in', () => {
        expect(toStoredPolicyWire(REFUNDABLE, 'PHP')).toEqual({
            refundableTag: 'RFN',
            cancelPolicyInfos: [
                { cancelTime: '2026-11-07T10:00:00.000Z', amount: 120, currency: 'USD', type: 'AMOUNT' },
                { cancelTime: '2026-11-09T10:00:00.000Z', amount: 100, currency: 'PHP', type: 'PERCENT' },
            ],
        });
    });

    it('tags a non-refundable policy NRFN', () => {
        expect(toStoredPolicyWire({ refundable: false, penalties: [] }, 'USD')?.refundableTag).toBe('NRFN');
    });
});
