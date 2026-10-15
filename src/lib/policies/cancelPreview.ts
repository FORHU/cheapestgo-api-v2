/**
 * What cancelling a booking would return, shown before the guest commits to it.
 *
 * The cancel endpoint decides this on the spot from the terms recorded at booking time
 * (ADR-0023) and the guest only learns the figure after the supplier has been asked and the
 * money has moved. This is that same decision, asked early and answered without side effects.
 *
 * It is deliberately a thin layer over `calculateCancellation` and adds no rules of its own:
 * a preview that could disagree with the cancellation it previews is worse than none, because
 * it is a promise. The only thing added here is *when* the answer stops being true.
 */

import {
    calculateCancellation,
    type CancellationPolicyInput,
    type CancellationResult,
} from '@/lib/policies/cancellationEngine';

export interface CancelPreview {
    reference:   string;
    /** Whether the cancel endpoint would act on this booking at all. */
    cancellable: boolean;
    reason?:     'already_cancelled' | 'refund_retry' | 'not_cancellable';
    status:      string | null;
    /** What the guest paid, in the currency they paid in. */
    paid:        { amount: number; currency: string };
    refund:      { amount: number; currency: string; type: CancellationResult['refundType']; ratio: number };
    penalty:     { amount: number; currency: string };
    /**
     * When these terms stop applying and the next, worse ones begin (ISO-8601). Null when
     * there is nothing ahead to wait for: the rate never refunded, or the last window has
     * passed.
     */
    deadline:    string | null;
    policy:      CancellationResult['policyUsed'];
    /** In words, for showing as is. */
    message:     string;
}

const CANCELLED = new Set(['cancelled', 'cancelled_refunded']);
const LIVE      = new Set(['confirmed', 'pending']);

export function buildCancelPreview(input: {
    reference:  string;
    status:     string | null;
    totalPrice: number;
    currency:   string;
    checkIn:    string | Date;
    policy:     CancellationPolicyInput | null;
    /** Injectable so a preview and a cancellation can be compared at the same instant. */
    now?:       number;
}): CancelPreview {
    const now = input.now ?? Date.now();
    const decision = calculateCancellation(
        { totalPrice: input.totalPrice, currency: input.currency, checkIn: input.checkIn, policy: input.policy },
        now,
    );

    const status = input.status ?? null;
    let cancellable = true;
    let reason: CancelPreview['reason'];

    if (status !== null && CANCELLED.has(status)) {
        cancellable = false;
        reason = 'already_cancelled';
    } else if (status === 'cancelled_refund_failed') {
        // Cancelled already, with the money still owed: the cancel endpoint skips the supplier
        // and retries the refund, so it is cancellable in exactly that sense.
        reason = 'refund_retry';
    } else if (status === null || !LIVE.has(status)) {
        cancellable = false;
        reason = 'not_cancellable';
    }

    return {
        reference:   input.reference,
        cancellable,
        ...(reason ? { reason } : {}),
        status,
        paid:    { amount: Number.isFinite(input.totalPrice) ? input.totalPrice : 0, currency: decision.currency },
        refund:  {
            amount:   decision.refundAmount,
            currency: decision.currency,
            type:     decision.refundType,
            ratio:    decision.refundRatio,
        },
        penalty: { amount: decision.penaltyAmount, currency: decision.currency },
        deadline: deadlineOf(decision, input.policy, now),
        policy:   decision.policyUsed,
        message:  decision.message,
    };
}

/**
 * The end of the window the figure above is true for.
 *
 * For a tier, that is when the tier in force expires — and only if that is still ahead, because
 * once every deadline has passed the last tier is simply the permanent answer. For a plain
 * free-cancellation rate it is the free deadline. Anything that never refunded has nothing to
 * wait for.
 */
function deadlineOf(
    decision: CancellationResult,
    policy: CancellationPolicyInput | null,
    now: number,
): string | null {
    const ahead = (value: string | Date | null | undefined): string | null => {
        if (!value) return null;
        const t = new Date(value).getTime();
        return Number.isFinite(t) && t > now ? new Date(t).toISOString() : null;
    };

    if (decision.appliedTier) return ahead(decision.appliedTier.cancelDeadline);
    if (decision.policyUsed === 'free_cancellation' && decision.refundable) {
        return ahead(policy?.freeCancelDeadline);
    }
    return null;
}
