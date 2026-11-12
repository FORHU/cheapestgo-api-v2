import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';
import { fromStripeAmount } from '@/lib/pricing';
import { AppError } from '@/middleware/error.middleware';
import { openRefund, closeRefund } from '@/lib/refundLog';

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

        // Summed in minor units and converted once, never by adding converted figures: a float
        // sum of currency is how a reconciliation ends up a cent out.
        const succeeded = payments.data.filter(i => i.status === 'succeeded');
        const volumeMinor = succeeded.reduce((sum, i) => sum + i.amount_received, 0);
        const refundedMinor = refunds.data
            .filter(r => r.status === 'succeeded')
            .reduce((sum, r) => sum + r.amount, 0);
        // Needs a response, as opposed to one already decided. A lost dispute is history; a
        // 'needs_response' one has a deadline attached to it.
        const openDisputes = disputes.data.filter(
            d => d.status === 'needs_response' || d.status === 'warning_needs_response',
        ).length;
        // The currency these totals are stated in. Mixed-currency accounts cannot be summed into
        // one figure at all, so the first balance currency is used and the UI labels it as such.
        const statsCurrency = balance.available[0]?.currency ?? payments.data[0]?.currency ?? 'usd';

        return {
            /**
             * Whether this is the live Stripe account or the sandbox.
             *
             * Read from Stripe's own answer rather than from the key's prefix, because the key is
             * not in scope here and a prefix is a claim rather than a fact. The admin shows it so
             * nobody reads sandbox figures as the business's money.
             */
            isLive: payments.data[0]?.livemode ?? disputes.data[0]?.livemode ?? false,

            /**
             * The headline figures. These describe **what this page shows** — the most recent
             * 20 payments and 10 refunds — not the account's lifetime totals, which would need
             * pagination through every object Stripe holds. The page labels them accordingly;
             * the figure to reconcile against is the balance above.
             */
            stats: {
                totalPayments: payments.data.length,
                succeeded:     succeeded.length,
                totalVolume:   fromStripeAmount(volumeMinor, statsCurrency),
                totalRefunded: fromStripeAmount(refundedMinor, statsCurrency),
                openDisputes,
            },
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
     * Refund a booking's payment, in full. **Not the path support uses.**
     *
     * ADR-0004 puts cancellation on one path, which the team travels alongside the customer:
     * policy honoured, supplier cancelled, lifecycle recorded. This route does none of that. It
     * moves money and nothing else, and it has no button anywhere in the admin. It is kept as a
     * manual lever for the case where the booking record itself is the thing that is broken and
     * the normal path cannot run.
     *
     * Three defects were fixed when that decision was taken, because an emergency lever that
     * lies is worse than none:
     *
     *  - It resolved the booking from `bookings` alone, so every flight booking returned 404 and
     *    always had. It now looks in `flight_bookings` too.
     *  - It passed no idempotency key, so a retried request could refund twice. It now keys on
     *    the booking and the amount, as the hotel and flight paths do.
     *  - It wrote no refund record, so money issued here was invisible to the back office that
     *    exists to find exactly that. It now writes one, naming the admin.
     *
     * What is deliberately still true: it does not cancel with the supplier and does not change
     * the booking's status. A refund here means the money came back, and nothing else did.
     */
    async refundBooking(
        bookingId: string,
        reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' = 'requested_by_customer',
        admin?: { id?: string; email?: string },
    ) {
        if (!bookingId) throw new AppError(400, 'bookingId is required', 'VALIDATION_ERROR');

        const stripe = getStripe();
        const booking = await this.findRefundable(bookingId);
        if (!booking) throw new AppError(404, `Booking ${bookingId} not found`, 'NOT_FOUND');

        let paymentIntentId = booking.payment_intent_id;
        if (!paymentIntentId) {
            const found = await stripe.paymentIntents.search({
                query: `metadata['bookingId']:'${bookingId}'`,
                limit: 1,
            });
            paymentIntentId = found.data[0]?.id ?? null;
            // Written back to whichever table owns it. This used to update `bookings` only, so a
            // flight found this way was looked up again from scratch on the next attempt.
            if (paymentIntentId && booking.product === 'hotel') {
                await prisma.bookings.updateMany({
                    where: { booking_id: bookingId },
                    data:  { payment_intent_id: paymentIntentId },
                });
            } else if (paymentIntentId) {
                await prisma.flight_bookings.updateMany({
                    where: { id: bookingId },
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

        // Opened before the money moves, so a crash between Stripe and this method returning
        // still leaves a row saying a refund was on its way (ADR-0004).
        const refundLogId = booking.userId
            ? await openRefund({
                bookingId,
                userId:          booking.userId,
                product:         booking.product,
                // Not a policy decision — nobody consulted the terms. The word says so.
                refundType:      'admin_override',
                requestedAmount: Number(booking.totalPrice ?? 0),
                penaltyAmount:   0,
                currency:        booking.currency ?? 'PHP',
                reason:          `refunded by hand via POST /admin/stripe (${reason}); the booking was not cancelled with the supplier`,
                requestedBy:     admin?.email ?? null,
            })
            : null;

        let refund;
        try {
            refund = await stripe.refunds.create({
                payment_intent: paymentIntentId,
                reason,
                metadata: { bookingId, issuedBy: admin?.email ?? 'admin', via: 'admin_stripe_route' },
            }, {
                // Keyed on the booking and the amount, as the product paths are. Without one, a
                // retried request after a lost response issued a second refund.
                idempotencyKey: `admin-refund-${bookingId}-${intent.amount}`,
            });
        } catch (err: any) {
            if (refundLogId) await closeRefund(refundLogId, { issued: false, reason: err?.message ?? 'Stripe refused the refund' });
            throw err;
        }

        if (refundLogId) {
            await closeRefund(refundLogId, {
                issued:         true,
                approvedAmount: fromStripeAmount(refund.amount, refund.currency),
                externalRef:    refund.id,
            });
        }

        return {
            alreadyRefunded: false,
            bookingId,
            paymentIntentId,
            refundId: refund.id,
            amount:   fromStripeAmount(refund.amount, refund.currency),
            currency: refund.currency.toUpperCase(),
            status:   refund.status,
            // Said plainly in the response, because the caller is a human with curl and the
            // booking still reads as live everywhere else.
            note: 'Money only. The supplier was not cancelled and the booking status is unchanged.',
        };
    }

    /**
     * The booking behind a reference, whichever product owns it.
     *
     * Hotels live in `bookings` and flights in `flight_bookings`; this route only ever looked in
     * the first, which is why refunding a flight by reference has always returned 404.
     */
    private async findRefundable(bookingId: string): Promise<{
        payment_intent_id: string | null;
        product: 'hotel' | 'flight';
        userId: string | null;
        totalPrice: unknown;
        currency: string | null;
    } | null> {
        const hotel = await prisma.bookings.findFirst({
            where:  { booking_id: bookingId },
            select: { payment_intent_id: true, user_id: true, total_price: true, currency: true },
        });
        if (hotel) {
            return {
                payment_intent_id: hotel.payment_intent_id,
                product:    'hotel',
                userId:     hotel.user_id,
                totalPrice: hotel.total_price,
                currency:   hotel.currency,
            };
        }

        const flight = await prisma.flight_bookings.findFirst({
            where:  { id: bookingId },
            select: { payment_intent_id: true, user_id: true, total_price: true, payment_currency: true },
        });
        if (flight) {
            return {
                payment_intent_id: flight.payment_intent_id,
                product:    'flight',
                userId:     flight.user_id,
                totalPrice: flight.total_price,
                currency:   flight.payment_currency,
            };
        }
        return null;
    }
}

export const adminStripeService = new AdminStripeService();
