import { describe, it, expect } from 'vitest';
import { buildCancelPreview } from '@/lib/policies/cancelPreview';
import { calculateCancellation, type CancellationPolicyInput } from '@/lib/policies/cancellationEngine';

const NOW = Date.parse('2026-11-01T00:00:00Z');
const CHECK_IN = '2026-11-20';

const FREE_UNTIL_NOV_10: CancellationPolicyInput = {
    policyType: 'free_cancellation',
    freeCancelDeadline: '2026-11-10T10:00:00Z',
    tiers: [],
};

const TIERED: CancellationPolicyInput = {
    policyType: 'tiered',
    freeCancelDeadline: null,
    tiers: [
        { cancelDeadline: '2026-11-05T10:00:00Z', penaltyAmount: 50, penaltyType: 'percent', currency: 'USD', tierOrder: 1 },
        { cancelDeadline: '2026-11-18T10:00:00Z', penaltyAmount: 100, penaltyType: 'percent', currency: 'USD', tierOrder: 2 },
    ],
};

const base = { reference: 'CG-ABC123', status: 'confirmed', totalPrice: 264, currency: 'USD', checkIn: CHECK_IN, now: NOW };

describe('buildCancelPreview', () => {
    it('promises a full refund inside the free window, and says when that stops', () => {
        const p = buildCancelPreview({ ...base, policy: FREE_UNTIL_NOV_10 });

        expect(p).toMatchObject({
            cancellable: true,
            refund:  { amount: 264, currency: 'USD', type: 'full_refund' },
            penalty: { amount: 0,   currency: 'USD' },
            paid:    { amount: 264, currency: 'USD' },
            deadline: '2026-11-10T10:00:00.000Z',
            policy: 'free_cancellation',
        });
    });

    it('applies the tier in force and names the moment it escalates', () => {
        const p = buildCancelPreview({ ...base, policy: TIERED });

        expect(p.refund).toMatchObject({ amount: 132, type: 'partial_refund' });
        expect(p.penalty.amount).toBe(132);
        // 50% until the 5th, then the whole charge.
        expect(p.deadline).toBe('2026-11-05T10:00:00.000Z');
    });

    it('escalates as time passes, using the same clock the engine uses', () => {
        const later = Date.parse('2026-11-06T00:00:00Z');
        const p = buildCancelPreview({ ...base, policy: TIERED, now: later });

        expect(p.refund).toMatchObject({ amount: 0, type: 'no_refund' });
        expect(p.deadline).toBe('2026-11-18T10:00:00.000Z');
    });

    it('has no deadline once the last tier has passed', () => {
        const p = buildCancelPreview({ ...base, policy: TIERED, now: Date.parse('2026-11-19T00:00:00Z') });
        expect(p.refund.type).toBe('no_refund');
        expect(p.deadline).toBeNull();
    });

    it('says a non-refundable rate returns nothing, with no deadline to wait for', () => {
        const p = buildCancelPreview({ ...base, policy: { policyType: 'non_refundable', tiers: [] } });

        expect(p.refund).toMatchObject({ amount: 0, type: 'no_refund' });
        expect(p.penalty.amount).toBe(264);
        expect(p.deadline).toBeNull();
        expect(p.cancellable).toBe(true); // cancelling is allowed; it just pays nothing back
    });

    it('does not promise a refund when no terms were recorded', () => {
        const p = buildCancelPreview({ ...base, policy: null });

        expect(p.refund).toMatchObject({ amount: 0, type: 'no_refund' });
        expect(p.message).toMatch(/No cancellation policy was recorded/);
    });

    it('never disagrees with the engine that will actually decide the cancellation', () => {
        for (const policy of [FREE_UNTIL_NOV_10, TIERED, null, { policyType: 'non_refundable' as const, tiers: [] }]) {
            for (const now of [NOW, Date.parse('2026-11-06T00:00:00Z'), Date.parse('2026-11-12T00:00:00Z')]) {
                const real = calculateCancellation({ totalPrice: 264, currency: 'USD', checkIn: CHECK_IN, policy }, now);
                const shown = buildCancelPreview({ ...base, policy, now });
                expect(shown.refund.amount).toBe(real.refundAmount);
                expect(shown.penalty.amount).toBe(real.penaltyAmount);
                expect(shown.refund.type).toBe(real.refundType);
            }
        }
    });

    it.each(['cancelled', 'cancelled_refunded'])('is not cancellable again once %s', (status) => {
        const p = buildCancelPreview({ ...base, status, policy: FREE_UNTIL_NOV_10 });
        expect(p).toMatchObject({ cancellable: false, reason: 'already_cancelled' });
    });

    it('lets a refund that failed be retried, and says that is what it is', () => {
        const p = buildCancelPreview({ ...base, status: 'cancelled_refund_failed', policy: FREE_UNTIL_NOV_10 });
        expect(p).toMatchObject({ cancellable: true, reason: 'refund_retry' });
    });

    it.each(['payment_failed', 'refunded', null])('is not cancellable from status %s', (status) => {
        const p = buildCancelPreview({ ...base, status, policy: FREE_UNTIL_NOV_10 });
        expect(p).toMatchObject({ cancellable: false, reason: 'not_cancellable' });
    });

    it('cannot quote a price it cannot read', () => {
        const p = buildCancelPreview({ ...base, totalPrice: Number.NaN, policy: FREE_UNTIL_NOV_10 });
        expect(p.refund.amount).toBe(0);
        expect(p.message).toMatch(/could not be read/);
    });
});
