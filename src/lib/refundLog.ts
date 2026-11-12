// src/lib/refundLog.ts
/**
 * The one place a refund is written down.
 *
 * Stripe is the authority on whether money moved; this table is the authority on who asked for
 * it, under which policy, and what was refused — the things Stripe cannot know. Until now only a
 * customer's hotel cancellation wrote here. Flights kept a JSON blob on the booking row, golf kept
 * nothing, and the admin route kept nothing, so three of the four ways money leaves the business
 * were invisible to the back office that exists to find them (ADR-0004).
 *
 * Lifted out of `HotelsRepository` unchanged in behaviour so the other three can call it without
 * depending on the hotel repository. That repository still exposes `openRefund`/`closeRefund`;
 * they now delegate here.
 *
 * Every function swallows its own errors. A refund that cannot be logged is still a refund the
 * customer is owed, and refusing to issue it because the audit trail is unavailable would be the
 * wrong trade — but the failure is logged loudly, because a silent gap here is what ADR-0004 is
 * about.
 */

import { prisma } from '@/lib/prisma';

/** Which product the refund belongs to, so a reader knows which table `bookingId` points into. */
export type RefundProduct = 'hotel' | 'flight' | 'golf';

export interface OpenRefundInput {
    /** The booking reference. `bookings.booking_id` for hotels, the booking id for flights/golf. */
    bookingId:       string;
    userId:          string;
    product:         RefundProduct;
    /** `full_refund` | `partial_refund` | `no_refund` from the policy engine, or `admin_override`. */
    refundType:      string;
    requestedAmount: number;
    penaltyAmount:   number;
    currency:        string;
    reason:          string;
    /** Set when a human in the admin asked for this, not the customer. Their email. */
    requestedBy?:    string | null;
}

export type CloseRefundOutcome =
    | { issued: true;  approvedAmount: number; externalRef: string }
    | { issued: false; reason: string };

/**
 * Open a refund before any money moves.
 *
 * Written first so that a crash between Stripe issuing the refund and the booking being updated
 * still leaves a row saying a refund of this amount was on its way for this booking — the
 * difference between a trace and an afternoon in the Stripe dashboard.
 *
 * Returns null rather than throwing: the caller decides what a missing log costs.
 */
export async function openRefund(input: OpenRefundInput): Promise<string | null> {
    try {
        // Hotels are the only product with a policy snapshot to point at. For the others the
        // column stays null, which is honest — there was no recorded term to judge against.
        const snapshot = input.product === 'hotel'
            ? await prisma.booking_policy_snapshots.findUnique({
                where:  { booking_id: input.bookingId },
                select: { id: true },
            })
            : null;

        const row = await prisma.refund_logs.create({
            data: {
                booking_id:         input.bookingId,
                user_id:            input.userId,
                policy_snapshot_id: snapshot?.id ?? null,
                refund_type:        input.refundType,
                requested_amount:   input.requestedAmount,
                penalty_amount:     input.penaltyAmount,
                currency:           input.currency,
                status:             'pending',
                // The product is carried in the reason rather than a new column: this table is
                // shared with v1 and adding one would mean a migration on a table v1 also writes.
                status_reason:      `[${input.product}] ${input.reason}`.slice(0, 500),
                // Null for a customer's own cancellation. A name here means a human decided.
                processed_by:       input.requestedBy ?? null,
            },
            select: { id: true },
        });
        return row.id;
    } catch (err: any) {
        console.error('[refund_logs] could not open a refund:', err?.message);
        return null;
    }
}

/**
 * Close a refund with what actually happened.
 *
 * **`failed` when no refund was issued.** v1's `processRefund` marked the row `processed`, with
 * the full amount approved, whether or not Stripe had refunded anything — its caller then set the
 * booking to `cancelled_refund_failed`, so the booking and the log disagreed about the one fact
 * the log exists to record.
 */
export async function closeRefund(refundLogId: string, outcome: CloseRefundOutcome): Promise<void> {
    await prisma.refund_logs.update({
        where: { id: refundLogId },
        data: outcome.issued
            ? {
                status:          'processed',
                approved_amount: outcome.approvedAmount,
                external_ref:    outcome.externalRef,
                processed_at:    new Date(),
            }
            : {
                status:        'failed',
                status_reason: outcome.reason.slice(0, 500),
                processed_at:  new Date(),
            },
    }).catch((err: any) => {
        // Stripe has already done whatever it did; a log that failed to close does not undo it,
        // and the pending row is still there to say so.
        console.error(`[refund_logs] could not close ${refundLogId}:`, err?.message);
    });
}

/**
 * Open and close in one call, for a refund that is already decided when it is recorded.
 *
 * The two-step form exists so a crash mid-refund leaves a `pending` row. Where the caller only
 * learns the outcome and the amount together — a provider-missing full refund, an admin acting on
 * a booking whose money has already moved — there is no window to protect and one call is honest.
 */
export async function recordRefund(
    input: OpenRefundInput,
    outcome: CloseRefundOutcome,
): Promise<string | null> {
    const id = await openRefund(input);
    if (id) await closeRefund(id, outcome);
    return id;
}
