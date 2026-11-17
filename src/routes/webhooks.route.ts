/**
 * Webhook routes
 *
 * POST /api/webhooks/stripe — receives Stripe events, verifies signature, updates bookings.
 *
 * IMPORTANT: This router uses express.raw() to preserve the raw request body that
 * Stripe needs for signature verification. It must be mounted in app.ts BEFORE
 * express.json() runs, OR (as done here) the route itself applies express.raw()
 * inline — which overrides the body parser for this specific path only when
 * mounted before the global JSON middleware.
 *
 * In the current app.ts the global express.json() is applied to the whole app
 * before the /api/v2 router. To make stripe signature verification work, mount
 * this router at the app level BEFORE express.json():
 *
 *   app.use('/api/v2/webhooks', webhookRoutes);   // ← BEFORE app.use(express.json())
 *   app.use(express.json());
 *   app.use('/api/v2', routes);
 *
 * If you cannot change mount order, set `verify` on the global json parser:
 *   app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } }))
 * and replace `req.body` below with `(req as any).rawBody`.
 */

import { Router } from 'express';
import express from 'express';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import { ticketNumbersFrom } from '@/lib/flights/duffelTickets';
import crypto from 'crypto';
import { getDuffelOrder } from '@/lib/flights/duffel';
import { sendFlightConfirmationEmail } from '@/lib/email/flightConfirmation';

const router: Router = Router();

function verifyDuffelSignature(rawBody: Buffer, sigHeader: string, secret: string): boolean {
    const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
    const { t: timestamp, v1: expectedSig } = parts;
    if (!timestamp || !expectedSig) return false;

    const payload = `${timestamp}.${rawBody.toString('utf8')}`;
    const computedSig = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(computedSig, 'hex'),
            Buffer.from(expectedSig, 'hex'),
        );
    } catch {
        return false; // length mismatch, malformed hex, etc.
    }
}

/** Settle a booking whose Duffel order was cancelled — loaded late, as the Stripe handlers load theirs. */
async function settleSupplierCancellation(orderId: string) {
    const { FlightsService } = await import('@/services/flights.service');
    return new FlightsService().syncSupplierCancellation(orderId);
}

// ── Duffel Webhook ─────────────────────────────────────────────────────────
router.post(
    '/flight-supplier',
    express.raw({ type: '*/*' }), // raw body required for HMAC verification
    async (req, res) => {
        const sig = req.headers['x-duffel-signature'] as string;

        if (!config.DUFFEL_WEBHOOK_SECRET) {
            logger.error('[webhooks/flight-supplier] DUFFEL_WEBHOOK_SECRET is not set');
            return res.status(500).json({ error: 'Webhook secret not configured' });
        }

        if (!sig || !verifyDuffelSignature(req.body as Buffer, sig, config.DUFFEL_WEBHOOK_SECRET)) {
            logger.warn('[webhooks/flight-supplier] Signature verification failed');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Return 200 immediately — Duffel retries aggressively on non-200/timeout
        res.status(200).json({ received: true });

        let event: any;
        try {
            event = JSON.parse((req.body as Buffer).toString('utf8'));
        } catch (err) {
            logger.error('[webhooks/flight-supplier] Failed to parse body', { err });
            return;
        }

        logger.info('[webhooks/flight-supplier] Received event', { type: event.type, id: event.id });

        const eventType: string = event?.type ?? '';
        logger.info('[webhooks/duffel] Received event', { type: eventType, id: event?.id });

        try {
            switch (eventType) {

                // The order exists, or it has changed — re-read it and see whether documents
                // have appeared since, or whether it was cancelled. This branch was keyed on
                // 'order.updated' and 'order.fulfilled' for months and **Duffel sends neither**:
                // no flight ever reached 'ticketed' through it, no ticket numbers were stored,
                // and the e-ticket email below never went out. Nothing errored, because nothing
                // ran. The accepted set is whatever POST /air/webhooks takes — it answers 422 and
                // lists them for anything else (webhooks.duffelEvents.test.ts holds that list).
                case 'order.created':
                case 'air.order.changed': {
                    const orderId: string = event?.data?.object?.id ?? event?.data?.id;
                    if (!orderId) break;

                    // Re-fetch from Duffel to get latest status + documents
                    let order: any;
                    try {
                        order = await getDuffelOrder(orderId);
                    } catch (err: any) {
                        logger.warn('[webhooks/duffel] Could not re-fetch order', { orderId, status: err?.status, error: err?.message });
                        break;
                    }

                    // A cancelled order still carries its e-tickets, so read as tickets alone it
                    // went back to `ticketed` — undoing the cancellation on the traveller's page.
                    if (order?.cancelled_at) {
                        const out = await settleSupplierCancellation(orderId);
                        logger.info('[webhooks/duffel] Changed order is cancelled', { orderId, ...out });
                        break;
                    }

                    // An e-ticket is a document whose number is `unique_identifier`; this read
                    // `document_number`, which Duffel does not send, so an order with documents
                    // was marked ticketed with `[null]` recorded against it.
                    const tickets = ticketNumbersFrom(order);

                    // No ticket yet: nothing to record. This used to write `confirmed`, and
                    // `order.created` lands seconds after the sale is written as
                    // `awaiting_ticket` — which took the booking out of poll-pending-tickets
                    // (`awaiting_ticket`, `booked`), the one route that catches a ticket whose
                    // webhook never arrives.
                    if (tickets.length === 0) {
                        logger.info('[webhooks/duffel] Order has no ticket yet — booking left as it is', { orderId });
                        break;
                    }

                    // Only a flight still going ahead: one mid-cancel or cancelled here keeps
                    // that status, whatever the order says about its tickets.
                    await prisma.$executeRaw`
                        UPDATE flight_bookings
                        SET
                            status         = 'ticketed',
                            ticket_numbers = ${JSON.stringify(tickets)}::jsonb,
                            updated_at     = NOW()
                        WHERE provider_order_id = ${orderId}
                          AND status IN ('confirmed', 'ticketed', 'booked', 'pnr_created', 'awaiting_ticket')
                    `;

                    logger.info('[webhooks/duffel] Order ticketed', { orderId });

                    // The first email told the traveller the ticket was on its way. This is
                    // where it arrives — without this, that promise was never kept, and a
                    // traveller holding an 'awaiting ticket' message had no way to learn
                    // their e-ticket numbers short of opening the site. Suppressed by
                    // email_logs if this booking was already ticketed when it was made.
                    const ticketedBooking = await prisma.flight_bookings.findFirst({
                        where:  { provider_order_id: orderId },
                        select: { id: true },
                    }).catch(() => null);
                    if (ticketedBooking) {
                        await sendFlightConfirmationEmail(ticketedBooking.id)
                            .catch((err: any) => logger.error('[webhooks/duffel] Ticket email failed', { orderId, error: err?.message }));
                    }
                    break;
                }

                // Cancellation confirmed — from our booking page, the Duffel dashboard, or the
                // airline. The booking and the traveller's refund are settled the way the page
                // settles them; one our page is already settling is left to it.
                //
                // The cancellation is at `data.object`. This read `data.order_id`, so every
                // delivery stopped at "no order id" — and past that, joined `flight_bookings`
                // to `bookings` on a column it does not have.
                case 'order_cancellation.confirmed': {
                    const cancellation = event?.data?.object ?? event?.data;
                    const orderId: string | undefined = cancellation?.order_id;
                    if (!orderId) break;

                    const out = await settleSupplierCancellation(orderId);
                    logger.info('[webhooks/duffel] Order cancellation confirmed', { orderId, cancellationId: cancellation?.id, ...out });
                    break;
                }

                default:
                    logger.info('[webhooks/duffel] Unhandled event', { type: eventType });
            }
        } catch (err: any) {
            // Don't re-throw — 200 already sent; just log
            logger.error('[webhooks/duffel] Handler error', { eventType, error: err.message });
        }
    }
);

// ── Mystifly Callback ────────────────────────────────────────────────────────

router.post(
    '/mystifly-callback',
    express.urlencoded({ extended: true }),
    async (req, res) => {
        res.status(200).send('OK'); // ack first, Mystifly expects a quick response

        const { bookingRef, status } = req.body;
        if (!bookingRef || !status) {
            logger.warn('[webhooks/mystifly-callback] Missing bookingRef or status', { body: req.body });
            return;
        }

        const mappedStatus = status === 'TICKETED' ? 'ticketed' : 'cancelled';

        try {
            await (prisma as any).flight_bookings.updateMany({
                where: { supplier_ref: bookingRef },
                data: { status: mappedStatus, updated_at: new Date() },
            }).catch(() =>
                prisma.$executeRaw`
                    UPDATE flight_bookings
                    SET status = ${mappedStatus}, updated_at = NOW()
                    WHERE supplier_ref = ${bookingRef}
                `
            );
            logger.info('[webhooks/mystifly-callback] Booking updated', { bookingRef, status: mappedStatus });
        } catch (err: any) {
            logger.error('[webhooks/mystifly-callback] Update failed', { err });
        }
    }
);

// ── Stripe Webhook ────────────────────────────────────────────────────────────
router.post(
    '/stripe',
    // express.raw() overrides any body-parser already applied for this specific route
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        const sig = req.headers['stripe-signature'] as string;

        if (!config.STRIPE_WEBHOOK_SECRET) {
            logger.error('[webhooks/stripe] STRIPE_WEBHOOK_SECRET is not set');
            return res.status(500).json({ error: 'Webhook secret not configured' });
        }

        let event: Stripe.Event;
        try {
            event = (stripe as Stripe).webhooks.constructEvent(
                req.body,
                sig,
                config.STRIPE_WEBHOOK_SECRET,
            );
        } catch (err: any) {
            logger.warn('[webhooks/stripe] Signature verification failed', { message: err.message });
            return res.status(400).json({ error: `Webhook signature failed: ${err.message}` });
        }

        logger.info('[webhooks/stripe] Received event', { type: event.type, id: event.id });

        // ── Claim the event before handling it ────────────────────────────────────
        //
        // Stripe retries a delivery it did not get a 2xx for, and retries the same event
        // id. The claim is a row, so two deliveries racing each other cannot both win.
        //
        // A claim alone is not enough to skip on, though: an event claimed but never
        // completed is a delivery that died part-way, and skipping it would lose the work
        // entirely. Only a *completed* one is a duplicate.
        try {
            await prisma.stripe_processed_events.create({
                data: {
                    event_id: event.id,
                    event_type: event.type,
                    // Pulled off the object so the row can be found by what support has in front
                    // of them. Both optional — an event about neither still gets claimed.
                    payment_intent_id: eventPaymentIntentId(event),
                    booking_reference: eventBookingReference(event),
                    last_received_at: new Date(),
                },
            });
        } catch (err: any) {
            if (err?.code === 'P2002') {
                const prior = await prisma.stripe_processed_events.findUnique({
                    where:  { event_id: event.id },
                    select: { completed_at: true },
                }).catch(() => null);

                if (prior?.completed_at) {
                    logger.info('[webhooks/stripe] Duplicate event, already completed — skipping', { id: event.id });
                    return res.json({ received: true });
                }
                logger.warn('[webhooks/stripe] Event was claimed but never completed — reprocessing', { id: event.id });
                // Stripe retries the same id, so a count above one with no completion is the
                // signature of an event failing over and over. Best effort: the count is a
                // diagnosis, and losing it must not cost the event.
                await prisma.stripe_processed_events.updateMany({
                    where: { event_id: event.id },
                    data:  { delivery_count: { increment: 1 }, last_received_at: new Date() },
                }).catch(() => undefined);
            } else {
                // A dedup failure must not cost the event: handling it twice is recoverable,
                // dropping it is not.
                logger.warn('[webhooks/stripe] Could not claim event', { id: event.id, message: err?.message });
            }
        }

        /** Mark the claim finished, so later deliveries of this event are skipped. */
        const commitEvent = async () => {
            await prisma.stripe_processed_events.updateMany({
                where: { event_id: event.id },
                data:  { completed_at: new Date() },
            }).catch((err: any) =>
                logger.warn('[webhooks/stripe] Could not mark event complete', { id: event.id, message: err?.message }),
            );
        };

        try {
            switch (event.type) {
                case 'payment_intent.succeeded': {
                    const pi = event.data.object as Stripe.PaymentIntent;
                    await (prisma as any).bookings.updateMany({
                        where: { payment_intent_id: pi.id },
                        data: { status: 'confirmed', updated_at: new Date() },
                    }).catch(() =>
                        prisma.$executeRaw`
                            UPDATE bookings
                            SET status = 'confirmed', updated_at = NOW()
                            WHERE payment_intent_id = ${pi.id}
                        `
                    );
                    logger.info('[webhooks/stripe] Booking confirmed', { paymentIntentId: pi.id });
                    break;
                }

                // The authorisation landed. For a hotel booking whose traveller has already said who
                // is staying, or any flight, this is enough to finish it — the same routine, under the
                // same claim, as the browser's confirm call, so whichever arrives first wins and the
                // other is told.
                case 'payment_intent.amount_capturable_updated': {
                    const pi = event.data.object as Stripe.PaymentIntent;
                    // A bundle's flight and hotel are separate PaymentIntents, each completed on its
                    // own: `flight_bundle` is a flight, `hotel_bundle` a hotel.
                    if (pi.metadata?.type === 'flight' || pi.metadata?.type === 'flight_bundle') {
                        try {
                            const { FlightBookingLifecycleService } = await import('@/services/flightBookingLifecycle.service');
                            const out = await new FlightBookingLifecycleService().completeFromPayment(pi);
                            logger.info('[webhooks/stripe] Flight payment authorised', { paymentIntentId: pi.id, ...out });
                        } catch (err: any) {
                            // Not rethrown, as for hotels: the lifecycle and the browser both still
                            // stand, and a retry of this event would only repeat the same attempt.
                            logger.error('[webhooks/stripe] Could not complete flight booking from payment', {
                                paymentIntentId: pi.id, message: err?.message,
                            });
                        }
                        break;
                    }
                    // A golf booking is finished by a person, not here: the authorisation only turns
                    // it into a request for the team to answer.
                    if (pi.metadata?.type === 'golf') {
                        try {
                            const { GolfBookingsService } = await import('@/services/golfBookings.service');
                            const booking = await new GolfBookingsService().onAuthorised(pi.id);
                            logger.info('[webhooks/stripe] Golf payment authorised', {
                                paymentIntentId: pi.id, reference: booking?.reference, status: booking?.status,
                            });
                        } catch (err: any) {
                            // Not rethrown: the customer's page and the sweep both check Stripe again.
                            logger.error('[webhooks/stripe] Could not record golf authorisation', {
                                paymentIntentId: pi.id, message: err?.message,
                            });
                        }
                        break;
                    }
                    if (pi.metadata?.type !== 'hotel' && pi.metadata?.type !== 'hotel_bundle') break;
                    try {
                        const { HotelsService } = await import('@/services/hotels.service');
                        const out = await new HotelsService().completeFromPayment(pi.id);
                        logger.info('[webhooks/stripe] Hotel payment authorised', { paymentIntentId: pi.id, ...out });
                    } catch (err: any) {
                        // Not rethrown: the lifecycle and the browser both still stand, and a retry
                        // of this event would only repeat the same attempt.
                        logger.error('[webhooks/stripe] Could not complete hotel booking from payment', {
                            paymentIntentId: pi.id, message: err?.message,
                        });
                    }
                    break;
                }

                case 'payment_intent.payment_failed': {
                    const pi = event.data.object as Stripe.PaymentIntent;
                    await (prisma as any).bookings.updateMany({
                        where: { payment_intent_id: pi.id },
                        data: { status: 'payment_failed', updated_at: new Date() },
                    }).catch(() =>
                        prisma.$executeRaw`
                            UPDATE bookings
                            SET status = 'payment_failed', updated_at = NOW()
                            WHERE payment_intent_id = ${pi.id}
                        `
                    );
                    logger.info('[webhooks/stripe] Payment failed', { paymentIntentId: pi.id });
                    break;
                }

                // A refund Stripe accepted and then failed — a closed card, a bank that sent it
                // back. The booking was written `refunded` at acceptance; this puts it back to
                // `refund_failed` and tells the team (BUG-1, sandbox run 2026-11-11). Older API
                // versions send only `charge.refund.updated`, so a failed one there counts too.
                // Thrown errors are not swallowed: a 500 makes Stripe deliver it again.
                case 'refund.failed':
                case 'charge.refund.updated': {
                    const refund = event.data.object as Stripe.Refund;
                    if (refund.status === 'failed') {
                        const { settleFailedFlightRefund } = await import('@/services/flightRefundFailure');
                        const out = await settleFailedFlightRefund(refund);
                        logger.warn('[webhooks/stripe] Refund failed after it was accepted', { refundId: refund.id, ...out });
                    }
                    break;
                }

                case 'charge.refunded': {
                    const charge = event.data.object as Stripe.Charge;
                    if (charge.payment_intent) {
                        await (prisma as any).bookings.updateMany({
                            where: { payment_intent_id: charge.payment_intent as string },
                            data: { status: 'refunded', updated_at: new Date() },
                        }).catch(() =>
                            prisma.$executeRaw`
                                UPDATE bookings
                                SET status = 'refunded', updated_at = NOW()
                                WHERE payment_intent_id = ${charge.payment_intent as string}
                            `
                        );
                    }
                    logger.info('[webhooks/stripe] Charge refunded', { chargeId: charge.id });
                    break;
                }

                default:
                    // Acknowledge unhandled events without error
                    logger.info('[webhooks/stripe] Unhandled event type', { type: event.type });
            }

            // Completed, so a retry of this delivery is a duplicate rather than a
            // resumption. Not marked on the error path: Stripe will retry, and the claim
            // left open is what lets that retry run.
            await commitEvent();
            return res.json({ received: true });
        } catch (err: any) {
            logger.error('[webhooks/stripe] Handler error', { err });
            return res.status(500).json({ error: 'Internal handler error' });
        }
    }
);

export default router;

/**
 * The payment this event is about, where Stripe's object carries one.
 *
 * Read defensively: the shape differs per event type, and an event we cannot attribute is still
 * an event worth claiming. Returning null is a normal outcome, not a failure.
 */
function eventPaymentIntentId(event: { type: string; data?: { object?: any } }): string | null {
    const o = event.data?.object ?? {};
    if (typeof o.id === 'string' && o.id.startsWith('pi_')) return o.id;
    if (typeof o.payment_intent === 'string') return o.payment_intent;
    return null;
}

/** The booking reference, which this platform mints into PaymentIntent metadata at creation. */
function eventBookingReference(event: { data?: { object?: any } }): string | null {
    const o = event.data?.object ?? {};
    const ref = o.metadata?.bookingReference;
    return typeof ref === 'string' && ref ? ref : null;
}
