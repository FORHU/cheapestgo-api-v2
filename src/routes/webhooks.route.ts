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

const router = Router();

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

        try {
            switch (event.type) {
                case 'payment_intent.succeeded': {
                    const pi = event.data.object as Stripe.PaymentIntent;
                    await (prisma as any).bookings.updateMany({
                        where: { payment_intent_id: pi.id },
                        data:  { status: 'confirmed', updated_at: new Date() },
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
                        data:  { status: 'payment_failed', updated_at: new Date() },
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
                            data:  { status: 'refunded', updated_at: new Date() },
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

            return res.json({ received: true });
        } catch (err: any) {
            logger.error('[webhooks/stripe] Handler error', { err });
            return res.status(500).json({ error: 'Internal handler error' });
        }
    }
);

export default router;
