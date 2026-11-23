/**
 * What happens when Stripe fails a flight refund it had already accepted.
 *
 * `cancelBooking` writes `refunded` as soon as Stripe accepts the refund (`succeeded` or `pending`),
 * and the traveller is told so. Stripe can still fail it afterwards — a closed card, a bank that
 * sends it back — and says so only in a webhook (`refund.failed`, `charge.refund.updated`). Nothing
 * listened: the booking stayed `refunded`, the refund log said issued, and the traveller kept
 * paying for a flight that no longer exists (sandbox run 2026-11-11, BUG-1).
 *
 * The card cannot simply be refunded again — the same card will refuse it — so this does not try.
 * It makes the record true and puts the debt in front of a person: the booking goes back to
 * `refund_failed`, the refund log to `failed`, and the team is told once, by refund.
 *
 * Flights only. A payment no flight booking holds is left for its own product to settle.
 */

import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { createNotification } from '@/lib/admin/notify';
import { markRefundFailed } from '@/lib/refundLog';
import { fromStripeAmount } from '@/lib/pricing';

export const REFUND_FAILED_TITLE = 'Flight refund failed — traveller not repaid';

/** The states in which the booking believes the money went back. */
const BELIEVED_REFUNDED = ['refunded', 'refund_pending'];

export type FailedRefundOutcome =
    | { handled: true; bookingId: string; status: 'refund_failed' }
    | { handled: false; reason: 'not failed' | 'no payment' | 'no flight booking' };

export async function settleFailedFlightRefund(refund: Stripe.Refund): Promise<FailedRefundOutcome> {
    if (refund.status !== 'failed') return { handled: false, reason: 'not failed' };

    const paymentIntentId = typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;
    if (!paymentIntentId) return { handled: false, reason: 'no payment' };

    const booking = await prisma.flight_bookings.findFirst({
        where:  { payment_intent_id: paymentIntentId },
        select: { id: true, pnr: true, status: true, cancellation_log: true },
    });
    if (!booking) return { handled: false, reason: 'no flight booking' };

    const reason = refund.failure_reason ?? 'unknown';

    if (BELIEVED_REFUNDED.includes(booking.status ?? '')) {
        const log: any[] = Array.isArray(booking.cancellation_log) ? booking.cancellation_log : [];
        // Guarded on the status it read: a booking a person has settled since is not overwritten.
        await prisma.flight_bookings.updateMany({
            where: { id: booking.id, status: { in: BELIEVED_REFUNDED } },
            data: {
                status: 'refund_failed',
                cancellation_log: [...log, {
                    at: new Date().toISOString(),
                    oldStatus: booking.status, newStatus: 'refund_failed',
                    stripeRefundId: refund.id, failureReason: reason,
                    note: 'Stripe failed the refund after accepting it; the traveller has not been repaid',
                }] as any,
            },
        });
    }

    await markRefundFailed(booking.id, paymentIntentId, `Stripe failed refund ${refund.id} after accepting it: ${reason}`);

    // Once per refund, however many times Stripe tells us. The notification table is the ledger,
    // as the reconciler's is (ADR-0026): nothing new to store.
    const told = await prisma.notifications.findFirst({
        where:  { title: REFUND_FAILED_TITLE, description: { contains: refund.id } },
        select: { id: true },
    }).catch(() => null);
    if (!told) {
        // A zero-decimal currency (KRW, JPY) has no minor unit: one Stripe unit is one whole unit.
        const decimals = fromStripeAmount(1, refund.currency) === 1 ? 0 : 2;
        const amount = fromStripeAmount(refund.amount, refund.currency)
            .toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        await createNotification(
            REFUND_FAILED_TITLE,
            `Flight ${booking.pnr ?? booking.id}: the ${refund.currency.toUpperCase()} ${amount} refund (${refund.id}, `
            + `PaymentIntent ${paymentIntentId}) was failed by Stripe after it was accepted: ${reason}. `
            + 'The flight is cancelled and the traveller has NOT been repaid. The same card cannot take the '
            + 'refund again — contact the traveller and pay them another way, then settle the booking.',
        );
    }

    return { handled: true, bookingId: booking.id, status: 'refund_failed' };
}
