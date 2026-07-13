import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { mystiflyRequest } from '../lib/flights/mystifly';

const internalRouter = Router();

function requireInternalAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const expected = `Bearer ${process.env.INTERNAL_SECRET}`;

    if (!process.env.INTERNAL_SECRET) {
        return res.status(500).json({ error: 'Server misconfigured' });
    }
    if (!authHeader || authHeader !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

internalRouter.post('/create-booking', requireInternalAuth, async (req: Request, res: Response) => {
    const { sessionId } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const sessions = await tx.$queryRaw<any[]>`
                SELECT * FROM booking_sessions
                WHERE id = ${sessionId}::uuid
                FOR UPDATE
            `;

            const session = sessions[0];

            if (!session) {
                throw { code: 'NOT_FOUND' };
            }

            if (session.completed_at != null) {
                throw { code: 'ALREADY_COMPLETED' };
            }

            let pnr: string;
            let extraFields: Record<string, any> = {};

            if (session.provider === 'mystifly' || session.provider === 'mystifly_v2') {
                const mystiflyResult = await mystiflyRequest('AirBook', {
                    flight: session.flight,
                    passengers: session.passengers,
                    contact: session.contact,
                });

                pnr = mystiflyResult?.Data?.PNR ?? mystiflyResult?.data?.pnr;

                if (!pnr) {
                    throw { code: 'MISSING_PNR' };
                }
            } else if (session.provider === 'duffel') {
                pnr = session.duffel_pre_order_pnr;

                if (!pnr) {
                    throw { code: 'MISSING_PNR' };
                }

                extraFields = {
                    provider_order_id: session.duffel_pre_order_id ?? null,
                    duffel_order_id: session.duffel_pre_order_id ?? null,
                };
            } else {
                throw { code: 'UNKNOWN_PROVIDER', provider: session.provider };
            }

            const flightBooking = await tx.flight_bookings.create({
                data: {
                    user_id: session.user_id,
                    pnr,
                    provider: session.provider,
                    total_price: session.charged_price ?? session.original_price ?? 0,
                    currency: session.currency ?? 'USD',
                    status: 'booked',
                    session_id: session.id,
                    payment_intent_id: session.payment_intent_id,
                    fare_policy: session.fare_policy ?? undefined,
                    charged_price: session.charged_price ?? undefined,
                    markup_pct: session.markup_pct ?? undefined,
                    ...extraFields,
                },
            });

            await tx.booking_sessions.update({
                where: { id: session.id },
                data: { status: 'completed', completed_at: new Date() },
            });

            return flightBooking;
        });

        return res.status(200).json({
            success: true,
            bookingId: result.id,
            pnr: result.pnr,
            status: result.status,
        });

    } catch (err: any) {
        if (err?.code === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Booking session not found' });
        }
        if (err?.code === 'ALREADY_COMPLETED') {
            return res.status(409).json({ error: 'Booking already created for this session' });
        }
        if (err?.code === 'MISSING_PNR') {
            return res.status(500).json({ error: 'Supplier did not return a PNR' });
        }
        if (err?.code === 'UNKNOWN_PROVIDER') {
            return res.status(400).json({ error: `Unsupported provider: ${err.provider}` });
        }
        console.error('create-booking failed:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default internalRouter;
