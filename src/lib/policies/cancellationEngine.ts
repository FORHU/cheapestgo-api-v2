/**
 * Decide what a cancellation actually returns to the customer.
 *
 * The supplier's penalty schedule is recorded when the booking is confirmed, and this
 * reads it back to work out whether cancelling now is free, partly refunded, or not
 * refunded at all. Ported from v1's `src/lib/server/cancellation-engine.ts`.
 *
 * api-v2 had none of this: `cancelBooking` refunded `pi.amount` outright, so a
 * non-refundable stay cancelled the day before check-in was returned in full while the
 * supplier still charged us for it. See ADR-0023.
 *
 * Kept free of Prisma and Stripe — it takes a policy and a clock and returns a
 * decision, so the money rules can be tested without a database.
 */

export type BookingPolicyType = 'free_cancellation' | 'non_refundable' | 'partial_refund' | 'tiered';

export interface PolicyTier {
    /** When this tier stops applying. Penalties escalate as check-in approaches. */
    cancelDeadline: string | Date;
    penaltyAmount: number;
    /** 'fixed' — an amount in `currency`; 'percent' — a share of the booking total. */
    penaltyType: string;
    currency?: string | null;
    tierOrder: number;
}

export interface CancellationPolicyInput {
    policyType: BookingPolicyType;
    freeCancelDeadline?: string | Date | null;
    tiers: PolicyTier[];
}

export interface CancellationInput {
    totalPrice: number;
    currency: string;
    checkIn: string | Date;
    policy: CancellationPolicyInput | null;
}

export interface CancellationResult {
    refundable: boolean;
    refundAmount: number;
    penaltyAmount: number;
    currency: string;
    refundType: 'full_refund' | 'partial_refund' | 'no_refund';
    message: string;
    appliedTier: PolicyTier | null;
    policyUsed: 'standard' | 'non_refundable' | 'free_cancellation';
    /** Share of the charge to return, for restating against the Stripe amount. */
    refundRatio: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function penaltyFor(tier: PolicyTier, totalPrice: number): number {
    const amount = Number(tier.penaltyAmount) || 0;
    if (tier.penaltyType === 'percent' || tier.penaltyType === 'percentage') {
        return round2((totalPrice * amount) / 100);
    }
    return round2(amount);
}

/**
 * The tier in force right now: the first whose deadline has not yet passed. Tiers are
 * ordered cheapest-to-dearest by `tierOrder`, so the earliest surviving deadline is the
 * one the customer still qualifies for. Once every deadline has passed the last tier
 * stands, which is the full penalty.
 */
function tierInForce(tiers: PolicyTier[], now: number): PolicyTier | null {
    if (!tiers.length) return null;

    const ordered = [...tiers].sort((a, b) => a.tierOrder - b.tierOrder);
    const upcoming = ordered.find(t => new Date(t.cancelDeadline).getTime() > now);

    return upcoming ?? ordered[ordered.length - 1];
}

export function calculateCancellation(
    input: CancellationInput,
    now: number = Date.now(),
): CancellationResult {
    const { totalPrice, currency, policy } = input;

    const noRefund = (message: string, policyUsed: CancellationResult['policyUsed']): CancellationResult => ({
        refundable: false,
        refundAmount: 0,
        penaltyAmount: round2(totalPrice),
        currency,
        refundType: 'no_refund',
        message,
        appliedTier: null,
        policyUsed,
        refundRatio: 0,
    });

    // A price we cannot read is not a price we can refund a share of. Without this the
    // arithmetic below runs on NaN and reports a partial refund of an unknown amount.
    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
        return {
            refundable: false,
            refundAmount: 0,
            penaltyAmount: 0,
            currency,
            refundType: 'no_refund',
            message: 'The amount paid for this booking could not be read. Contact support to cancel.',
            appliedTier: null,
            policyUsed: 'non_refundable',
            refundRatio: 0,
        };
    }

    // No policy recorded is not permission to refund. A booking whose terms we cannot
    // read is one we cannot prove is refundable, and the supplier will still charge.
    if (!policy) {
        return noRefund(
            'No cancellation policy was recorded for this booking. Contact support to cancel.',
            'non_refundable',
        );
    }

    if (policy.policyType === 'non_refundable') {
        return noRefund('This rate is non-refundable. Cancelling does not return the amount paid.', 'non_refundable');
    }

    // Free cancellation, and the deadline is still ahead.
    const deadline = policy.freeCancelDeadline ? new Date(policy.freeCancelDeadline).getTime() : null;
    if (policy.policyType === 'free_cancellation') {
        if (deadline === null || deadline > now) {
            return {
                refundable: true,
                refundAmount: round2(totalPrice),
                penaltyAmount: 0,
                currency,
                refundType: 'full_refund',
                message: 'Free cancellation — the full amount is refunded.',
                appliedTier: null,
                policyUsed: 'free_cancellation',
                refundRatio: 1,
            };
        }
        // Past the free window with no tier to fall back on, the rate is now firm.
        if (!policy.tiers.length) {
            return noRefund('The free cancellation period for this booking has passed.', 'free_cancellation');
        }
    }

    const tier = tierInForce(policy.tiers, now);
    if (!tier) {
        // Tiered or partial-refund policy with no tiers is incoherent; refuse rather
        // than guess in the customer's favour and absorb a supplier penalty.
        return noRefund(
            'This booking\'s cancellation terms could not be read. Contact support to cancel.',
            'standard',
        );
    }

    const penalty = Math.min(penaltyFor(tier, totalPrice), round2(totalPrice));
    const refund = round2(totalPrice - penalty);

    if (refund <= 0) {
        return {
            ...noRefund('Cancelling now incurs the full charge, so no amount is refunded.', 'standard'),
            appliedTier: tier,
        };
    }

    if (penalty <= 0) {
        return {
            refundable: true,
            refundAmount: round2(totalPrice),
            penaltyAmount: 0,
            currency,
            refundType: 'full_refund',
            message: 'Cancelling now carries no penalty — the full amount is refunded.',
            appliedTier: tier,
            policyUsed: 'standard',
            refundRatio: 1,
        };
    }

    return {
        refundable: true,
        refundAmount: refund,
        penaltyAmount: penalty,
        currency,
        refundType: 'partial_refund',
        message: `Cancelling now incurs a penalty of ${penalty} ${currency}; ${refund} ${currency} is refunded.`,
        appliedTier: tier,
        policyUsed: 'standard',
        // Expressed as a ratio so the caller can apply it to the Stripe charge, which
        // may be in a different currency than the supplier quoted.
        refundRatio: totalPrice > 0 ? refund / totalPrice : 0,
    };
}
