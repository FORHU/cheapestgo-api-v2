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
 * When the figure above stops being true: **the next deadline still ahead.**
 *
 * A tier's deadline is when its penalty starts, so the tier in force has by definition already
 * begun and its own date is in the past. What the guest needs is the next escalation — before any
 * penalty has started that is the end of the free window, and inside a penalty step it is when
 * the next step begins. This used to return the applied tier's own deadline, which under the
 * corrected reading is always behind us and so always resolved to null.
 *
 * Only offered while something is still refundable. A rate that returns nothing has no window
 * left to wait out, and naming a date would imply there is.
 */
function deadlineOf(
    decision: CancellationResult,
    policy: CancellationPolicyInput | null,
    now: number,
): string | null {
    if (!decision.refundable) return null;

    const nextTier = (policy?.tiers ?? [])
        .map(t => new Date(t.cancelDeadline).getTime())
        .filter(t => Number.isFinite(t) && t > now)
        .sort((a, b) => a - b)[0];
    if (nextTier !== undefined) return new Date(nextTier).toISOString();

    const free = policy?.freeCancelDeadline ? new Date(policy.freeCancelDeadline).getTime() : null;
    return free !== null && Number.isFinite(free) && free > now ? new Date(free).toISOString() : null;
}
