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
import { duffelHeaders } from '@/lib/flights/duffel';
import { sendFlightConfirmationEmail } from '@/lib/email/flightConfirmation';

const router = Router();

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

                // Ticket issued — Duffel confirms all documents are ready
                case 'order.updated':
                case 'order.fulfilled': {
                    const orderId: string = event?.data?.id ?? event?.data?.object?.id;
                    if (!orderId) break;

                    // Re-fetch from Duffel to get latest status + documents
                    const duffelRes = await fetch(
                        `https://api.duffel.com/air/orders/${orderId}`,
                        { headers: duffelHeaders(config.DUFFEL_ACCESS_TOKEN!) }
                    );
                    if (!duffelRes.ok) {
                        logger.warn('[webhooks/duffel] Could not re-fetch order', { orderId, status: duffelRes.status });
                        break;
                    }

                    const { data: order } = await duffelRes.json() as any;
                    // An e-ticket is a document whose number is `unique_identifier`; this read
                    // `document_number`, which Duffel does not send, so an order with documents
                    // was marked ticketed with `[null]` recorded against it.
                    const tickets = ticketNumbersFrom(order);
                    const newStatus = tickets.length > 0 ? 'ticketed' : 'confirmed';
                    const ticketNumbers = tickets.length > 0 ? JSON.stringify(tickets) : null;

                    await prisma.$executeRaw`
                        UPDATE flight_bookings
                        SET
                            status         = ${newStatus},
                            ticket_numbers = ${ticketNumbers}::jsonb,
                            updated_at     = NOW()
                        WHERE provider_order_id = ${orderId}
                          AND status NOT IN ('cancelled', 'refunded')
                    `;

                    logger.info('[webhooks/duffel] Order status synced', { orderId, newStatus });

                    // The first email told the traveller the ticket was on its way. This is
                    // where it arrives — without this, that promise was never kept, and a
                    // traveller holding an 'awaiting ticket' message had no way to learn
                    // their e-ticket numbers short of opening the site. Suppressed by
                    // email_logs if this booking was already ticketed when it was made.
                    if (newStatus === 'ticketed') {
                        const ticketedBooking = await prisma.flight_bookings.findFirst({
                            where:  { provider_order_id: orderId },
                            select: { id: true },
                        }).catch(() => null);
                        if (ticketedBooking) {
                            await sendFlightConfirmationEmail(ticketedBooking.id)
                                .catch((err: any) => logger.error('[webhooks/duffel] Ticket email failed', { orderId, error: err?.message }));
                        }
                    }
                    break;
                }

                // Cancellation confirmed — mark cancelled + trigger Stripe refund if needed
                case 'order_cancellation.confirmed': {
                    const cancellation = event?.data ?? event?.data?.object;
                    const orderId: string = cancellation?.order_id ?? cancellation?.order?.id;
                    if (!orderId) break;

                    // Find the booking
                    const rows: any[] = await prisma.$queryRaw`
                        SELECT fb.id, fb.status, b.payment_intent_id
                        FROM flight_bookings fb
                        JOIN bookings b ON b.id = fb.booking_id
                        WHERE fb.provider_order_id = ${orderId}
                        LIMIT 1
                    `;
                    if (!rows.length) break;

                    const booking = rows[0];

                    await prisma.$executeRaw`
                        UPDATE flight_bookings
                        SET status = 'cancelled', updated_at = NOW()
                        WHERE provider_order_id = ${orderId}
                    `;

                    // Issue Stripe refund only if booking hasn't already been refunded
                    if (booking.payment_intent_id && booking.status !== 'refunded') {
                        try {
                            await (stripe as Stripe).refunds.create({
                                payment_intent: booking.payment_intent_id,
                                reason: 'requested_by_customer',
                            });
                            await prisma.$executeRaw`
                                UPDATE bookings SET status = 'refunded', updated_at = NOW()
                                WHERE payment_intent_id = ${booking.payment_intent_id}
                            `;
                            logger.info('[webhooks/duffel] Refund issued', { orderId, pi: booking.payment_intent_id });
                        } catch (refundErr: any) {
                            logger.error('[webhooks/duffel] Stripe refund failed', { orderId, error: refundErr.message });
                        }
                    }

                    logger.info('[webhooks/duffel] Order cancelled', { orderId });
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
                data: { event_id: event.id, event_type: event.type },
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
