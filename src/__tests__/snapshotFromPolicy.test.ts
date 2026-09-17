import { describe, it, expect } from 'vitest';
import { snapshotFromPolicy } from '@/lib/policies/snapshotFromPolicy';

/**
 * The terms a booking is held to. Confirm and the backfill both derive them here, so a booking
 * backfilled today is judged by the same rule as one confirmed today.
 */

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

describe('snapshotFromPolicy', () => {
    it('reads a refundable rate with no penalty steps as free cancellation', () => {
        const t = snapshotFromPolicy({ refundableTag: 'RFN', cancelPolicyInfos: [] }, 'PHP');
        expect(t.policyType).toBe('free_cancellation');
        expect(t.refundableTag).toBe('RFN');
        expect(t.freeCancelDeadline).toBeNull();
    });

    it('reads a refundable rate with steps as tiered, never free', () => {
        // Collapsing this to free cancellation is what refunded in full past the free window.
        const t = snapshotFromPolicy({
            refundableTag: 'REFUNDABLE',
            cancelPolicyInfos: [{ cancelTime: inDays(5), amount: 30, currency: 'USD', type: 'PERCENT' }],
        }, 'PHP');
        expect(t.policyType).toBe('tiered');
        expect(t.tiers).toHaveLength(1);
        expect(t.tiers[0]).toMatchObject({ penaltyAmount: 30, penaltyType: 'percent', currency: 'USD' });
    });

    it('orders steps earliest deadline first and dates the end of the free window from the first', () => {
        const t = snapshotFromPolicy({
            refundableTag: 'RFN',
            cancelPolicyInfos: [
                { cancelTime: inDays(20), amount: 50,  type: 'PERCENT' },
                { cancelTime: inDays(10), amount: 100, type: 'PERCENT' },
            ],
        }, 'PHP');
        expect(t.tiers.map(s => s.penaltyAmount)).toEqual([100, 50]);
        expect(t.freeCancelDeadline?.getTime()).toBe(t.tiers[0].cancelDeadline.getTime());
    });

    it('reads anything not tagged refundable as non-refundable', () => {
        expect(snapshotFromPolicy({ refundableTag: 'NRFN' }, 'PHP').policyType).toBe('non_refundable');
        expect(snapshotFromPolicy({}, 'PHP').policyType).toBe('non_refundable');
        expect(snapshotFromPolicy(null, 'PHP').policyType).toBe('non_refundable');
    });

    it('drops a step whose deadline cannot be read rather than guessing one', () => {
        const t = snapshotFromPolicy({
            refundableTag: 'RFN',
            cancelPolicyInfos: [{ cancelTime: 'not a date', amount: 10 }, { amount: 5 }],
        }, 'PHP');
        expect(t.tiers).toHaveLength(0);
        expect(t.policyType).toBe('free_cancellation');
    });

    it('fills a step with no currency from the booking', () => {
        const t = snapshotFromPolicy({ refundableTag: 'RFN', cancelPolicyInfos: [{ cancelTime: inDays(3), amount: 500 }] }, 'KRW');
        expect(t.tiers[0]).toMatchObject({ currency: 'KRW', penaltyType: 'fixed' });
    });
});
