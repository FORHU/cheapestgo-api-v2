import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import { fromStripeAmount } from '@/lib/pricing';
import { AppError } from '@/middleware/error.middleware';

/**
 * The money screen: what Stripe holds, what it has taken, and what has been given back
 * (C5, ported from v1's /api/admin/stripe).
 *
 * Read straight from Stripe rather than from our own tables on purpose. This screen exists to
 * answer "what does the processor think happened", which is the question worth asking when our
 * records and the bank disagree — and reading our own copy back would answer a different one.
 */

/** Enough to see today's activity at a glance, few enough to render in one response. */
const RECENT_PAYMENTS = 20;
const RECENT_REFUNDS = 10;
const RECENT_DISPUTES = 10;
const RECENT_PAYOUTS = 5;

export class AdminStripeService {
    async overview() {
        const stripe = getStripe();

        const [balance, payments, refunds, disputes, payouts] = await Promise.all([
            stripe.balance.retrieve(),
            stripe.paymentIntents.list({ limit: RECENT_PAYMENTS, expand: ['data.latest_charge'] }),
            stripe.refunds.list({ limit: RECENT_REFUNDS }),
            stripe.disputes.list({ limit: RECENT_DISPUTES }),
            stripe.payouts.list({ limit: RECENT_PAYOUTS }),
        ]);

        const readBalance = (entries: { amount: number; currency: string }[]) =>
            entries.map(entry => ({
                amount:   fromStripeAmount(entry.amount, entry.currency),
                currency: entry.currency.toUpperCase(),
            }));

        return {
            balance: {
                available: readBalance(balance.available),
                pending:   readBalance(balance.pending),
            },
            payments: payments.data.map(intent => {
                const charge = intent.latest_charge as { refunded?: boolean; captured?: boolean; billing_details?: { email?: string; name?: string }; description?: string } | null;
                return {
                    id:          intent.id,
                    amount:      fromStripeAmount(intent.amount, intent.currency),
                    currency:    intent.currency.toUpperCase(),
                    status:      intent.status,
                    description: intent.description ?? charge?.description ?? null,
                    customer:    charge?.billing_details?.email ?? charge?.billing_details?.name ?? null,
                    created:     intent.created * 1000,
                    metadata:    intent.metadata,
                    refunded:    charge?.refunded ?? false,
                    captured:    charge?.captured ?? intent.status === 'succeeded',
                };
            }),
            refunds: refunds.data.map(refund => ({
                id:       refund.id,
                amount:   fromStripeAmount(refund.amount, refund.currency),
                currency: refund.currency.toUpperCase(),
                status:   refund.status,
                reason:   refund.reason ?? null,
                created:  refund.created * 1000,
                chargeId: typeof refund.charge === 'string' ? refund.charge : null,
            })),
            disputes: disputes.data.map(dispute => ({
                id:       dispute.id,
                amount:   fromStripeAmount(dispute.amount, dispute.currency),
                currency: dispute.currency.toUpperCase(),
                status:   dispute.status,
                reason:   dispute.reason,
                created:  dispute.created * 1000,
            })),
            payouts: payouts.data.map(payout => ({
                id:          payout.id,
                amount:      fromStripeAmount(payout.amount, payout.currency),
                currency:    payout.currency.toUpperCase(),
                status:      payout.status,
                arrivalDate: payout.arrival_date * 1000,
            })),
        };
    }

    /**
     * Refund a booking's payment, in full.
     *
     * Two things make this safe to expose to an admin screen. The booking is looked up first, so
     * a typo refunds nothing rather than something; and an already-refunded charge is reported as
     * such instead of refunded twice — Stripe would happily issue a second one.
     *
     * When our row has no payment intent, Stripe is searched by the booking reference it was
     * created with, and the id is written back: a booking whose payment we cannot name is the
     * state that turns a refund request into an afternoon in the dashboard.
     */
    async refundBooking(bookingId: string, reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' = 'requested_by_customer') {
        if (!bookingId) throw new AppError(400, 'bookingId is required', 'VALIDATION_ERROR');

        const stripe = getStripe();
        const booking = await prisma.bookings.findFirst({
            where:  { booking_id: bookingId },
            select: { payment_intent_id: true, status: true, total_price: true, currency: true, holder_email: true },
        });
        if (!booking) throw new AppError(404, `Booking ${bookingId} not found`, 'NOT_FOUND');

        let paymentIntentId = booking.payment_intent_id;
        if (!paymentIntentId) {
            const found = await stripe.paymentIntents.search({
                query: `metadata['bookingId']:'${bookingId}'`,
                limit: 1,
            });
            paymentIntentId = found.data[0]?.id ?? null;
            if (paymentIntentId) {
                await prisma.bookings.updateMany({
                    where: { booking_id: bookingId },
                    data:  { payment_intent_id: paymentIntentId },
                });
            }
        }

        if (!paymentIntentId) {
            throw new AppError(
                404,
                `No Stripe payment intent found for booking ${bookingId}. Check the Stripe dashboard.`,
                'NOT_FOUND',
            );
        }

        const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
        const charge = intent.latest_charge as { id?: string; refunded?: boolean } | null;

        if (charge?.refunded) {
            return { alreadyRefunded: true, paymentIntentId, bookingId };
        }

        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason,
            metadata: { bookingId },
        });

        return {
            alreadyRefunded: false,
            bookingId,
            paymentIntentId,
            refundId: refund.id,
            amount:   fromStripeAmount(refund.amount, refund.currency),
            currency: refund.currency.toUpperCase(),
            status:   refund.status,
        };
    }
}

export const adminStripeService = new AdminStripeService();
