import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { mystiflyRequest } from '../lib/flights/mystifly';
import { duffelHeaders } from '../lib/flights/duffel';

const internalRouter = Router();

function requireInternalAuth(req: Request, res: Response, next: Function) {
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

            if (session.provider !== 'mystifly') {
                throw { code: 'WRONG_PROVIDER' };
            }

            const mystiflyResult = await mystiflyRequest('AirBook', {
                flight: session.flight,
                passengers: session.passengers,
                contact: session.contact,
            });

            const pnr = mystiflyResult?.Data?.PNR ?? mystiflyResult?.data?.pnr ?? undefined;

            if (!pnr) {
                throw { code: 'MISSING_PNR' };
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
            return res.status(404).json({ error: 'Booking session already completed' });
        }
        if (err?.code === 'WRONG_PROVIDER') {
            return res.status(404).json({ error: 'Booking session not found' });
        }
        if (err?.code === 'MISSING_PNR') {
            return res.status(500).json({ error: 'Supplier did not return a PNR' });
        }
        console.error('create-booking (mystifly) failed:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

internalRouter.post('/issue-ticket', requireInternalAuth, async (req: Request, res: Response) => {
    const { bookingId } = req.body;

    if (!bookingId || typeof bookingId !== 'string') {
        return res.status(400).json({ error: 'bookingId is required' });
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const bookings = await tx.$queryRaw<any[]>`
                SELECT * FROM flight_bookings
                WHERE id = ${bookingId}::uuid
                FOR UPDATE
            `;

            const booking = bookings[0];

            if (!booking) {
                throw { code: 'NOT_FOUND' };
            }

            if (booking.status === 'ticketed') {
                throw { code: 'ALREADY_TICKETED' };
            }

            const orderId = booking.provider_order_id ?? booking.duffel_order_id;
            if (!orderId) {
                throw { code: 'NO_ORDER_ID' };
            }

            const duffelRes = await fetch(
                `https://api.duffel.com/air/orders/${orderId}`,
                { headers: duffelHeaders() },
            );

            if (!duffelRes.ok) {
                throw { code: 'DUFFEL_API_ERROR', status: duffelRes.status };
            }

            const { data: order } = await duffelRes.json() as any;
            const documents: any[] = order?.documents ?? [];
            const ticketNumbers = documents
                .filter((d: any) => d.type === 'electronic_ticket')
                .map((d: any) => d.document_number);

            if (ticketNumbers.length === 0) {
                throw { code: 'NO_TICKETS' };
            }

            await tx.$executeRaw`
                UPDATE flight_bookings
                SET status         = 'ticketed',
                    ticketed_at    = NOW(),
                    ticket_numbers = ${JSON.stringify(ticketNumbers)}::jsonb
                WHERE id = ${bookingId}::uuid
            `;

            return { bookingId: booking.id, pnr: booking.pnr, ticketNumbers };
        });

        return res.status(200).json({
            success: true,
            bookingId: result.bookingId,
            pnr: result.pnr,
            ticketNumbers: result.ticketNumbers,
        });

    } catch (err: any) {
        if (err?.code === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Flight booking not found' });
        }
        if (err?.code === 'ALREADY_TICKETED') {
            return res.status(200).json({ success: true, message: 'Already ticketed' });
        }
        if (err?.code === 'NO_ORDER_ID') {
            return res.status(400).json({ error: 'No provider order ID on booking' });
        }
        if (err?.code === 'NO_TICKETS') {
            return res.status(409).json({ error: 'Order exists but no tickets issued yet' });
        }
        if (err?.code === 'DUFFEL_API_ERROR') {
            return res.status(502).json({ error: `Duffel API error (HTTP ${err.status})` });
        }
        console.error('issue-ticket failed:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default internalRouter;
