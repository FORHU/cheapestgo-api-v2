import { describe, it, expect } from 'vitest';
import {
    calculateCancellation,
    type CancellationPolicyInput,
    type PolicyTier,
} from '@/lib/policies/cancellationEngine';

/**
 * C2c. Before this, cancelBooking refunded `pi.amount` outright — every cancellation
 * returned the full charge no matter what the guest had agreed to, while the supplier
 * still billed us for the non-refundable ones. These cover the rules that decide what
 * actually comes back.
 */

const NOW = Date.parse('2026-08-25T12:00:00Z');
const days = (n: number) => new Date(NOW + n * 86_400_000);

/**
 * A penalty step. `deadlineDays` is when the penalty **starts**, relative to now — so a negative
 * offset is a penalty already in force and a positive one has not begun.
 *
 * That direction is the whole subject of these tests. The engine used to read a deadline as a
 * date to cancel *before*, which charged the first future penalty to a guest still inside the
 * free window: on 2026-11-10 a booking reading "Free cancellation until November 23, 2026"
 * refunded 0.37 of 120.37 USD.
 */
const tier = (deadlineDays: number, amount: number, type = 'fixed', order = 0): PolicyTier => ({
    cancelDeadline: days(deadlineDays),
    penaltyAmount:  amount,
    penaltyType:    type,
    currency:       'PHP',
    tierOrder:      order,
});

const base = (over: Partial<CancellationPolicyInput> = {}): CancellationPolicyInput => ({
    policyType: 'tiered',
    freeCancelDeadline: days(7),
    tiers: [],
    ...over,
});

const run = (policy: CancellationPolicyInput | null, totalPrice = 1000) =>
    calculateCancellation({ totalPrice, currency: 'PHP', checkIn: days(30), policy }, NOW);

describe('calculateCancellation', () => {
    it('refunds nothing on a non-refundable rate', () => {
        const r = run(base({ policyType: 'non_refundable' }));
        expect(r.refundable).toBe(false);
        expect(r.refundAmount).toBe(0);
        expect(r.refundRatio).toBe(0);
        expect(r.penaltyAmount).toBe(1000);
    });

    it('refuses to refund when no policy was ever recorded', () => {
        // Silence is not permission: the supplier still charges for a stay whose
        // terms we cannot read.
        const r = run(null);
        expect(r.refundable).toBe(false);
        expect(r.refundRatio).toBe(0);
        expect(r.message).toMatch(/support/i);
    });

    it('refunds in full inside the free-cancellation window', () => {
        const r = run(base({ policyType: 'free_cancellation', freeCancelDeadline: days(3), tiers: [] }));
        expect(r.refundType).toBe('full_refund');
        expect(r.refundAmount).toBe(1000);
        expect(r.refundRatio).toBe(1);
    });

    it('stops refunding once the free window has passed', () => {
        const r = run(base({ policyType: 'free_cancellation', freeCancelDeadline: days(-1), tiers: [] }));
        expect(r.refundable).toBe(false);
        expect(r.refundRatio).toBe(0);
    });

    it('applies the penalty that has started most recently, not the harshest one', () => {
        // 300 began 2 days ago; 1000 does not begin for another 5. Today sits in the 300 step.
        const r = run(base({
            tiers: [tier(-9, 0, 'fixed', 0), tier(-2, 300, 'fixed', 1), tier(5, 1000, 'fixed', 2)],
        }));
        expect(r.refundType).toBe('partial_refund');
        expect(r.penaltyAmount).toBe(300);
        expect(r.refundAmount).toBe(700);
        expect(r.refundRatio).toBeCloseTo(0.7, 6);
    });

    /**
     * The bug this file exists to prevent coming back. Every penalty is still ahead, so the guest
     * is inside the free window the booking page promised them — and the engine charged them the
     * nearest one.
     */
    it('refunds in full while every penalty is still ahead', () => {
        const r = run(base({ tiers: [tier(13, 120, 'fixed', 0), tier(15, 120, 'fixed', 1)] }));
        expect(r.refundType).toBe('full_refund');
        expect(r.penaltyAmount).toBe(0);
        expect(r.refundAmount).toBe(1000);
        expect(r.refundRatio).toBe(1);
        expect(r.appliedTier).toBeNull();
    });

    /** The boundary: a penalty starting exactly now has started. */
    it('applies a penalty whose deadline is this very moment', () => {
        const r = run(base({ tiers: [tier(0, 300, 'fixed', 0)] }));
        expect(r.penaltyAmount).toBe(300);
    });

    /** Supplier step numbering is its own business; the question is which deadline passed last. */
    it('ignores tierOrder and reads the deadlines', () => {
        const r = run(base({ tiers: [tier(-1, 900, 'fixed', 9), tier(-8, 100, 'fixed', 0)] }));
        expect(r.penaltyAmount).toBe(900);
    });

    /** A deadline that cannot be read has not been shown to have started. */
    it('does not apply a penalty with an unreadable deadline', () => {
        const broken = { ...tier(-1, 900, 'fixed', 0), cancelDeadline: new Date('not-a-date') };
        const r = run(base({ tiers: [broken, tier(-8, 100, 'fixed', 1)] }));
        expect(r.penaltyAmount).toBe(100);
    });

    it('holds at the last penalty once every deadline has passed', () => {
        const r = run(base({ tiers: [tier(-10, 100, 'fixed', 0), tier(-2, 900, 'fixed', 1)] }));
        expect(r.penaltyAmount).toBe(900);
        expect(r.refundAmount).toBe(100);
    });

    it('reads a percentage penalty as a share of the total', () => {
        const r = run(base({ tiers: [tier(-5, 25, 'percent', 0)] }));
        expect(r.penaltyAmount).toBe(250);
        expect(r.refundAmount).toBe(750);
        expect(r.refundRatio).toBeCloseTo(0.75, 6);
    });

    it('never lets a penalty exceed the amount paid', () => {
        const r = run(base({ tiers: [tier(-5, 5000, 'fixed', 0)] }));
        expect(r.penaltyAmount).toBe(1000);
        expect(r.refundAmount).toBe(0);
        expect(r.refundRatio).toBe(0);
    });

    it('treats a zero penalty as a full refund', () => {
        const r = run(base({ tiers: [tier(-5, 0, 'fixed', 0)] }));
        expect(r.refundType).toBe('full_refund');
        expect(r.refundRatio).toBe(1);
    });

    it('refuses a tiered policy that carries no tiers rather than guess', () => {
        const r = run(base({ policyType: 'tiered', tiers: [] }));
        expect(r.refundable).toBe(false);
        expect(r.refundRatio).toBe(0);
    });

    it('reports the applied tier so the refund can be explained', () => {
        const r = run(base({ tiers: [tier(-5, 300, 'fixed', 0)] }));
        expect(r.appliedTier?.penaltyAmount).toBe(300);
        expect(r.message).toContain('300');
    });

    it('gives a ratio the Stripe amount can be scaled by', () => {
        // The charge may be in a different currency than the supplier quoted, so the
        // caller multiplies rather than passing the supplier figure straight through.
        const r = run(base({ tiers: [tier(-5, 400, 'fixed', 0)] }), 1600);
        expect(r.refundRatio).toBeCloseTo(0.75, 6);
        expect(Math.round(25_000 * r.refundRatio)).toBe(18_750);
    });
});
