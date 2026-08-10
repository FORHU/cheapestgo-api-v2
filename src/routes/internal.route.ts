/**
 * POST /api/internal/create-booking
 *
 * Unified handler for both Duffel and Mystifly providers.
 * Mirrors V1's architecture: single state machine with provider dispatch.
 *
 *   - Mystifly: calls AirBook → captures or cancels Stripe PaymentIntent
 *   - Duffel:   reads the pre-created order from the session (created in /flights/book)
 *               and persists it as a flight_booking
 *
 * Auth: Authorization: Bearer <FUNCTIONS_SECRET>
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { mystiflyRequest } from '../lib/flights/mystifly';
import { stripe } from '../lib/stripe';

const internalRouter = Router();

// ── Auth ─────────────────────────────────────────────────────────────────────

function requireInternalAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const expected = `Bearer ${process.env.FUNCTIONS_SECRET}`;

    if (!process.env.FUNCTIONS_SECRET) {
        return res.status(500).json({ error: 'Server misconfigured' });
    }
    if (!authHeader || authHeader !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ── POST /create-booking ─────────────────────────────────────────────────────

internalRouter.post('/create-booking', requireInternalAuth, async (req: Request, res: Response) => {
    const { sessionId } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    try {
        // Step 1: Atomically lock the session
        const locked = await prisma.$queryRaw<any[]>`
            UPDATE booking_sessions
            SET status = 'processing'
            WHERE id = ${sessionId}::uuid
              AND status IN ('pending', 'initiated', 'payment_initiated', 'payment_authorized')
            RETURNING
                id, user_id, provider, flight, passengers, contact,
                payment_intent_id, fare_policy,
                duffel_pre_order_id, duffel_pre_order_pnr,
                duffel_pre_order_tickets, duffel_pre_order_ticketed,
                currency, original_price, charged_price
        `;

        if (locked.length === 0) {
            // Check if already booked (idempotent)
            const existing = await prisma.flight_bookings.findFirst({
                where: { session_id: sessionId },
                select: { id: true, pnr: true, status: true },
            });

            if (existing) {
                return res.status(200).json({
                    success: true,
                    alreadyBooked: true,
                    bookingId: existing.id,
                    pnr: existing.pnr,
                    status: existing.status,
                });
            }

            return res.status(404).json({ error: 'Booking session not found or already processed' });
        }

        const session = locked[0] as any;
        const provider: string = session.provider ?? '';
        const paymentIntentId: string = session.payment_intent_id ?? '';

        console.log(`[create-booking] Processing session ${sessionId} provider=${provider}`);

        // Step 2: Dispatch by provider
        if (provider === 'mystifly' || provider === 'mystifly_v2') {
            return await handleMystifly(res, session, sessionId, provider, paymentIntentId);
        }

        if (provider === 'duffel') {
            return await handleDuffel(res, session, sessionId, paymentIntentId);
        }

        // Unknown provider
        await prisma.$executeRaw`UPDATE booking_sessions SET status = 'failed' WHERE id = ${sessionId}::uuid`;
        return res.status(400).json({ error: `Unknown provider: ${provider}` });

    } catch (err: any) {
        console.error('[create-booking] Unhandled error:', err);
        try {
            await prisma.$executeRaw`UPDATE booking_sessions SET status = 'failed' WHERE id = ${sessionId}::uuid`;
        } catch { /* best-effort */ }
        return res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
});

// ── Duffel handler ───────────────────────────────────────────────────────────
// Duffel pre-order was created synchronously in /flights/book.
// The order data is stored in the session columns — no API call needed.

async function handleDuffel(
    res: Response,
    session: any,
    sessionId: string,
    paymentIntentId: string,
) {
    const flight: any = session.flight ?? {};
    const passengers: any[] = session.passengers ?? [];

    const preOrderId: string = session.duffel_pre_order_id ?? '';
    const preOrderPnr: string = session.duffel_pre_order_pnr ?? '';
    const preOrderTickets: string[] = session.duffel_pre_order_tickets ?? [];
    const preOrderTicketed: boolean = session.duffel_pre_order_ticketed === true;

    if (!preOrderId) {
        console.error(`[create-booking] Duffel session ${sessionId} has no pre-order`);
        await prisma.$executeRaw`UPDATE booking_sessions SET status = 'failed' WHERE id = ${sessionId}::uuid`;
        return res.status(400).json({ error: 'Duffel pre-order missing from session' });
    }

    console.log(`[create-booking] Duffel pre-order: orderId=${preOrderId} pnr=${preOrderPnr} tickets=${preOrderTickets.length}`);

    // Resolve confirmed price from Stripe PI
    let confirmedPrice = Number(session.charged_price ?? session.original_price ?? 0);
    let confirmedCurrency = (session.currency ?? 'usd').toUpperCase();
    if (paymentIntentId) {
        try {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
            confirmedPrice = pi.amount / 100;
            confirmedCurrency = (pi.currency ?? 'usd').toUpperCase();
        } catch { /* non-critical */ }
    }

    const farePolicy: any = session.fare_policy ?? null;
    const tripType: string = flight.tripType ?? flight.trip_type ?? 'one-way';
    const bookingStatus = preOrderTicketed ? 'ticketed' : 'awaiting_ticket';

    // Insert flight_bookings
    const booking = await prisma.flight_bookings.create({
        data: {
            user_id: session.user_id,
            session_id: sessionId,
            provider: 'duffel',
            pnr: preOrderPnr,
            status: bookingStatus,
            total_price: confirmedPrice,
            currency: confirmedCurrency,
            payment_intent_id: paymentIntentId || null,
            confirmed_price: confirmedPrice,
            confirmed_currency: confirmedCurrency,
            charged_price: confirmedPrice,
            supplier_cost: Number(session.original_price ?? confirmedPrice),
            provider_order_id: preOrderId,
            duffel_order_id: preOrderId,
            ticket_numbers: preOrderTickets.length > 0 ? preOrderTickets : [],
            fare_policy: farePolicy ?? undefined,
            trip_type: tripType,
        },
    });

    const bookingId = booking.id;

    // Insert flight_segments
    await insertFlightSegments(bookingId, flight);

    // Insert passengers
    await insertPassengers(bookingId, passengers, preOrderTickets);

    // Update session to completed
    await prisma.$executeRaw`
        UPDATE booking_sessions SET status = 'completed', completed_at = NOW()
        WHERE id = ${sessionId}::uuid
    `;

    console.log(`[create-booking] Duffel done. bookingId=${bookingId} pnr=${preOrderPnr} status=${bookingStatus}`);

    return res.status(200).json({
        success: true,
        bookingId,
        pnr: preOrderPnr,
        status: bookingStatus,
        confirmedPrice,
        confirmedCurrency,
    });
}

// ── Mystifly handler ─────────────────────────────────────────────────────────

async function handleMystifly(
    res: Response,
    session: any,
    sessionId: string,
    provider: string,
    paymentIntentId: string,
) {
    const flight: any = session.flight ?? {};
    const passengers: any[] = session.passengers ?? [];
    const contact: any = session.contact ?? {};

    // Extract FareSourceCode from traceId (format: FSC|convId||SearchId)
    const traceId: string = flight.traceId ?? flight.offer_id ?? '';
    const parts = traceId.split('|');
    const fareSourceCode = parts[0] ?? traceId;
    const conversationId = parts[1] ?? '';
    const searchIdentifier = parts[3] ?? '';

    if (!fareSourceCode) {
        await markFailed(sessionId, paymentIntentId, 'No FareSourceCode in flight data');
        return res.status(400).json({ error: 'No FareSourceCode in flight data' });
    }

    const bookBody: Record<string, any> = {
        FareSourceCode: fareSourceCode,
        PassengerDetails: buildMystiflyPassengers(passengers),
    };

    if (conversationId) bookBody.ConversationId = conversationId;
    if (searchIdentifier) bookBody.SearchIdentifier = searchIdentifier;

    console.log(`[create-booking] Calling Mystifly AirBook FSC=${fareSourceCode.slice(0, 16)}…`);

    let bookData: any;
    try {
        bookData = await mystiflyRequest('AirBook', bookBody);
    } catch (err: any) {
        console.error('[create-booking] Mystifly AirBook threw:', err.message);
        await markFailed(sessionId, paymentIntentId, err.message);
        return res.status(502).json({ error: `Mystifly booking failed: ${err.message}` });
    }

    const pnr: string = bookData?.Data?.PNR ?? bookData?.Data?.UniqueID ?? bookData?.UniqueID ?? '';
    const bookingSuccess = bookData?.Success === true && pnr;

    if (!bookingSuccess) {
        const errMsg = bookData?.Message ?? 'Mystifly booking failed';
        console.error('[create-booking] Mystifly AirBook failed:', errMsg);
        await markFailed(sessionId, paymentIntentId, errMsg);
        return res.status(400).json({ error: errMsg });
    }

    // Capture Stripe PaymentIntent (Mystifly uses manual capture)
    if (paymentIntentId) {
        try {
            await stripe.paymentIntents.capture(paymentIntentId);
            console.log(`[create-booking] Stripe capture OK: ${paymentIntentId}`);
        } catch (stripeErr: any) {
            console.error('[create-booking] Stripe capture failed:', stripeErr.message);
            // Don't abort — PNR exists; surface error in response
        }
    }

    // Resolve confirmed price from PI amount
    let confirmedPrice = Number(session.charged_price ?? session.original_price ?? 0);
    let confirmedCurrency = (session.currency ?? 'usd').toUpperCase();
    if (paymentIntentId) {
        try {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
            confirmedPrice = pi.amount / 100;
            confirmedCurrency = (pi.currency ?? 'usd').toUpperCase();
        } catch { /* non-critical */ }
    }

    // Insert flight_bookings
    const booking = await prisma.flight_bookings.create({
        data: {
            user_id: session.user_id,
            session_id: sessionId,
            provider: 'mystifly',
            pnr,
            status: 'pnr_created',
            total_price: confirmedPrice,
            currency: confirmedCurrency,
            payment_intent_id: paymentIntentId || null,
            confirmed_price: confirmedPrice,
            confirmed_currency: confirmedCurrency,
        },
    });

    const bookingId = booking.id;

    // Insert flight_segments
    await insertFlightSegments(bookingId, flight);

    // Insert passengers
    await insertPassengers(bookingId, passengers);

    // Update session to completed
    await prisma.$executeRaw`
        UPDATE booking_sessions SET status = 'completed', completed_at = NOW()
        WHERE id = ${sessionId}::uuid
    `;

    console.log(`[create-booking] Mystifly done. bookingId=${bookingId} pnr=${pnr}`);

    return res.status(200).json({
        success: true,
        bookingId,
        pnr,
        status: 'pnr_created',
        confirmedPrice,
        confirmedCurrency,
    });
}

// ── Shared helpers ───────────────────────────────────────────────────────────

async function markFailed(sessionId: string, paymentIntentId: string, reason: string) {
    console.error(`[create-booking] Marking session ${sessionId} failed: ${reason}`);

    await prisma.$executeRaw`UPDATE booking_sessions SET status = 'failed' WHERE id = ${sessionId}::uuid`;

    if (paymentIntentId) {
        try {
            await stripe.paymentIntents.cancel(paymentIntentId);
            console.log(`[create-booking] Stripe PI cancelled: ${paymentIntentId}`);
        } catch (err: any) {
            console.error(`[create-booking] Failed to cancel PI ${paymentIntentId}:`, err.message);
        }
    }

    // Insert a failed booking row so confirm/webhook can surface a clear error
    try {
        await prisma.$executeRaw`
            INSERT INTO flight_bookings (session_id, provider, status, payment_intent_id)
            SELECT bs.id, bs.provider, 'failed', ${paymentIntentId || null}::text
            FROM booking_sessions bs
            WHERE bs.id = ${sessionId}::uuid
            ON CONFLICT DO NOTHING
        `;
    } catch { /* best-effort */ }
}

function buildMystiflyPassengers(passengers: any[]): any[] {
    return passengers.map((pax: any) => {
        const typeMap: Record<string, string> = {
            ADT: 'ADT', adult: 'ADT',
            CHD: 'CHD', child: 'CHD',
            INF: 'INF', infant: 'INF',
        };
        const paxType = typeMap[pax.type] ?? typeMap[pax.passengerType] ?? 'ADT';

        return {
            Title: pax.title ?? (pax.gender?.toUpperCase() === 'M' ? 'MR' : 'MS'),
            Gender: pax.gender?.toUpperCase() === 'M' ? 'M' : 'F',
            LeadPassenger: pax.isLead ?? false,
            PassengerType: paxType,
            FirstName: pax.firstName,
            LastName: pax.lastName,
            DateOfBirth: pax.birthDate ?? pax.dob ?? '',
            PassportDetails: pax.passport ? {
                PassportNumber: pax.passport.number ?? '',
                ExpiryDate: pax.passport.expiryDate ?? '',
                CountryOfIssue: pax.passport.countryOfIssue ?? '',
                Nationality: pax.nationality ?? pax.passport.nationality ?? '',
            } : undefined,
        };
    });
}

async function insertFlightSegments(bookingId: string, flight: any) {
    const segments: any[] = flight.segments ?? [];
    if (segments.length === 0) {
        console.warn(`[create-booking] No segments for booking ${bookingId}`);
        return;
    }

    for (const seg of segments) {
        try {
            const depTime = seg.departure?.time ?? seg.departing_at ?? seg.departureTime ?? null;
            const arrTime = seg.arrival?.time ?? seg.arriving_at ?? seg.arrivalTime ?? null;
            const origin = seg.origin?.iata_code ?? seg.origin?.airport ?? seg.origin ?? '';
            const destination = seg.destination?.iata_code ?? seg.destination?.airport ?? seg.destination ?? '';
            const airline =
                (typeof seg.airline === 'object'
                    ? seg.airline?.code ?? seg.airline?.iata_code
                    : seg.airline)
                ?? seg.airline_iata_code
                ?? '';

            await prisma.flight_segments.create({
                data: {
                    booking_id: bookingId,
                    airline,
                    flight_number: seg.flightNumber ?? seg.flight_number ?? '',
                    origin,
                    destination,
                    departure: depTime ? new Date(depTime) : new Date(),
                    arrival: arrTime ? new Date(arrTime) : new Date(),
                    cabin_class: seg.cabinClass ?? seg.cabin_class ?? 'economy',
                    itinerary_index: seg.itineraryIndex ?? 0,
                    segment_index: seg.segmentIndex ?? seg.itineraryIndex ?? 0,
                },
            });
        } catch (segErr: any) {
            console.error(`[create-booking] Failed to insert segment for booking ${bookingId}:`, segErr.message);
        }
    }
}

async function insertPassengers(bookingId: string, passengers: any[], ticketNumbers: string[] = []) {
    const normaliseType = (raw: string | undefined): 'ADT' | 'CHD' | 'INF' => {
        const map: Record<string, 'ADT' | 'CHD' | 'INF'> = {
            ADT: 'ADT', adult: 'ADT',
            CHD: 'CHD', child: 'CHD',
            INF: 'INF', infant: 'INF',
        };
        return map[raw ?? ''] ?? 'ADT';
    };

    for (let i = 0; i < passengers.length; i++) {
        const pax = passengers[i];
        try {
            await prisma.passengers.create({
                data: {
                    booking_id: bookingId,
                    first_name: pax.firstName ?? pax.first_name ?? '',
                    last_name: pax.lastName ?? pax.last_name ?? '',
                    type: normaliseType(pax.type ?? pax.passengerType),
                    ticket_number: ticketNumbers[i] ?? null,
                    passport: pax.passport?.number ?? pax.passportNumber ?? null,
                },
            });
        } catch (paxErr: any) {
            console.error(`[create-booking] Failed to insert passenger ${i} for booking ${bookingId}:`, paxErr.message);
        }
    }
}

// ── POST /issue-ticket ───────────────────────────────────────────────────────

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
                { headers: { Authorization: `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`, 'Duffel-Version': 'v2' } },
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/internal/auto-recover
// Schedule: every 10 minutes  (*/10 * * * *)
// Detects booking_sessions where Stripe payment succeeded but flight_bookings
// was never created, then retries via /api/internal/create-booking.
// Auth: Bearer <CRON_SECRET> or <FUNCTIONS_SECRET>
// ─────────────────────────────────────────────────────────────────────────────

const AUTO_RECOVER_MAX    = 10;
const MISMATCH_THRESHOLD  = 5 * 60 * 1000;   // sessions >5 min old
const MISMATCH_MAX_AGE    = 24 * 60 * 60 * 1000; // ignore sessions >24h old

function requireCronOrInternal(req: Request, res: Response, next: NextFunction) {
    const auth     = req.headers.authorization;
    const cronSec  = process.env.CRON_SECRET;
    const funcSec  = process.env.FUNCTIONS_SECRET;
    if ((cronSec && auth === `Bearer ${cronSec}`) || (funcSec && auth === `Bearer ${funcSec}`)) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
}

internalRouter.post('/auto-recover', requireCronOrInternal, async (_req: Request, res: Response) => {
    try {
        const cutoffRecent = new Date(Date.now() - MISMATCH_THRESHOLD).toISOString();
        const cutoffOld    = new Date(Date.now() - MISMATCH_MAX_AGE).toISOString();

        // Sessions with a payment_intent_id, not yet booked/expired, older than 5 min
        const stuckSessions = await prisma.$queryRaw<any[]>`
            SELECT id, provider, payment_intent_id, status, created_at
            FROM booking_sessions
            WHERE payment_intent_id IS NOT NULL
              AND status NOT IN ('booked', 'expired', 'completed', 'failed')
              AND created_at < ${cutoffRecent}::timestamptz
              AND created_at >= ${cutoffOld}::timestamptz
            ORDER BY created_at ASC
            LIMIT ${AUTO_RECOVER_MAX}
        `;

        if (!stuckSessions.length) {
            return res.json({ success: true, recovered: 0, message: 'No mismatches found' });
        }

        // Filter out sessions that already have a flight_booking
        const sessionIds = stuckSessions.map((s: any) => s.id);
        const existingBookings = await prisma.$queryRaw<{ session_id: string }[]>`
            SELECT session_id FROM flight_bookings WHERE session_id = ANY(${sessionIds}::uuid[])
        `;
        const bookedSet  = new Set(existingBookings.map(b => b.session_id));
        const mismatches = stuckSessions.filter((s: any) => !bookedSet.has(s.id));

        if (!mismatches.length) {
            return res.json({ success: true, recovered: 0, message: 'All sessions already have bookings' });
        }

        console.log(`[auto-recover] Found ${mismatches.length} mismatch(es) to recover`);

        let recovered = 0;
        let failed    = 0;

        for (const session of mismatches) {
            try {
                // For Duffel the order is pre-created before payment — only recover
                // if the PI actually succeeded; otherwise expire and move on.
                if (session.payment_intent_id) {
                    const pi = await stripe.paymentIntents.retrieve(session.payment_intent_id);
                    const shouldRecover = session.provider === 'duffel'
                        ? pi.status === 'succeeded'
                        : true; // Mystifly uses manual capture → requires_capture is valid

                    if (!shouldRecover) {
                        console.log(`[auto-recover] Expiring abandoned session ${session.id} (pi.status=${pi.status})`);
                        await prisma.$executeRaw`
                            UPDATE booking_sessions SET status = 'expired' WHERE id = ${session.id}::uuid
                        `;
                        continue;
                    }
                }

                const apiBase = process.env.INTERNAL_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}/api/v2`;
                const response = await fetch(`${apiBase}/internal/create-booking`, {
                    method:  'POST',
                    headers: {
                        'Content-Type':  'application/json',
                        'Authorization': `Bearer ${process.env.FUNCTIONS_SECRET}`,
                    },
                    body: JSON.stringify({ sessionId: session.id }),
                    signal: AbortSignal.timeout(60_000),
                });

                const data = await response.json() as any;
                if (data.success) {
                    recovered++;
                    console.log(JSON.stringify({ _event: 'admin_audit', action: 'auto_recover_booking', sessionId: session.id, provider: session.provider, result: 'success', triggeredBy: 'cron', timestamp: new Date().toISOString() }));
                } else {
                    failed++;
                    console.error(JSON.stringify({ _event: 'admin_audit', action: 'auto_recover_booking', sessionId: session.id, provider: session.provider, result: 'failed', error: data.error, triggeredBy: 'cron', timestamp: new Date().toISOString() }));
                    // Permanently-failing session — expire so it stops appearing in cron
                    await prisma.$executeRaw`
                        UPDATE booking_sessions SET status = 'expired' WHERE id = ${session.id}::uuid
                    `;
                }
            } catch (e: any) {
                failed++;
                console.error(`[auto-recover] Error for session ${session.id}:`, e.message);
            }
        }

        if (recovered > 0 || failed > 0) {
            await prisma.notifications.create({
                data: {
                    title:       'Auto-Recovery Complete',
                    description: `Recovered: ${recovered}, Failed: ${failed} (of ${mismatches.length} mismatches)`,
                    type:        'system',
                } as any,
            }).catch(() => {});
        }

        return res.json({ success: true, recovered, failed, total: mismatches.length });
    } catch (err: any) {
        console.error('[auto-recover] Fatal error:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/internal/retry-emails
// Schedule: every 15 minutes  (*/15 * * * *)
// Re-sends failed/queued emails by reading the stored htmlBody from
// email_logs.metadata and re-submitting via Resend.
// Auth: Bearer <CRON_SECRET> or <FUNCTIONS_SECRET>
// ─────────────────────────────────────────────────────────────────────────────

const RETRY_EMAILS_MAX    = 20;
const RETRY_EMAILS_MAX_AGE = 48 * 60 * 60 * 1000; // ignore logs older than 48h

internalRouter.post('/retry-emails', requireCronOrInternal, async (_req: Request, res: Response) => {
    try {
        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
            return res.status(503).json({ error: 'RESEND_API_KEY not configured' });
        }

        const cutoff = new Date(Date.now() - RETRY_EMAILS_MAX_AGE).toISOString();

        const logs = await prisma.email_logs.findMany({
            where:   { status: { in: ['failed', 'queued'] }, created_at: { gte: new Date(cutoff) } },
            orderBy: { created_at: 'asc' },
            take:    RETRY_EMAILS_MAX,
        });

        if (!logs.length) {
            return res.json({ success: true, retried: 0, message: 'No emails to retry' });
        }

        console.log(`[retry-emails] Found ${logs.length} email(s) to retry`);

        let succeeded = 0;
        let failed    = 0;
        let skipped   = 0;

        for (const log of logs) {
            const htmlBody = (log.metadata as any)?.htmlBody;
            if (!htmlBody) { skipped++; continue; }

            try {
                const resendRes = await fetch('https://api.resend.com/emails', {
                    method:  'POST',
                    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        from:    'CheapestGo <no-reply@mail.cheapestgo.com>',
                        to:      [log.recipient],
                        subject: log.subject,
                        html:    htmlBody,
                    }),
                });

                if (resendRes.ok) {
                    const cleanMeta = { ...(log.metadata as any) };
                    delete cleanMeta.htmlBody;
                    await prisma.email_logs.update({
                        where: { id: log.id },
                        data:  { status: 'sent', sent_at: new Date(), error_message: null, metadata: { ...cleanMeta, retriedAt: new Date().toISOString() } },
                    });
                    succeeded++;
                    console.log(`[retry-emails] Sent: ${log.id}`);
                } else {
                    const errText = await resendRes.text().catch(() => '');
                    await prisma.email_logs.update({
                        where: { id: log.id },
                        data:  { error_message: `Retry failed (${resendRes.status}): ${errText.slice(0, 200)}` },
                    });
                    failed++;
                    console.error(`[retry-emails] Failed: ${log.id} — ${resendRes.status}`);
                }
            } catch (e: any) {
                failed++;
                console.error(`[retry-emails] Error for ${log.id}:`, e.message);
            }
        }

        return res.json({ success: true, retried: succeeded, failed, skipped, total: logs.length });
    } catch (err: any) {
        console.error('[retry-emails] Fatal error:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default internalRouter;
