/**
 * Flights repository — all Prisma queries for the flight booking domain.
 */

import { prisma } from '@/lib/prisma';
import type { FxLock } from '@/lib/payments/fxLock';

export class FlightsRepository {

    // ─── Booking sessions ──────────────────────────────────────────────────────

    async createBookingSession(data: {
        userId: string;
        provider: string;
        flight: any;
        passengers: any[];
        contact: any;
        idempotencyKey?: string;
        farePolicy?: any;
        policySource?: string | null;
        policyVersion?: string | null;
        isRefundable?: boolean | null;
        isChangeable?: boolean | null;
        refundPenaltyAmount?: number | null;
        refundPenaltyCurrency?: string | null;
        seatServiceIds?: string[];
        seatTotal?: number;
        bagServiceIds?: string[];
        bagTotal?: number;
        expiresAt: Date;
    }) {
        return prisma.booking_sessions.create({
            data: {
                user_id: data.userId,
                provider: data.provider,
                flight: data.flight,
                passengers: data.passengers,
                contact: data.contact,
                idempotency_key: data.idempotencyKey ?? null,
                fare_policy: data.farePolicy ?? null,
                policy_source: data.policySource ?? null,
                policy_version: data.policyVersion ?? null,
                is_refundable: data.isRefundable ?? null,
                is_changeable: data.isChangeable ?? null,
                refund_penalty_amount: data.refundPenaltyAmount ?? null,
                refund_penalty_currency: data.refundPenaltyCurrency ?? null,
                policy_locked: true,
                status: 'initiated',
                expires_at: data.expiresAt,
                seat_service_ids: data.seatServiceIds ?? [],
                seat_total: data.seatTotal ?? 0,
                bag_service_ids: data.bagServiceIds ?? [],
                bag_total: data.bagTotal ?? 0,
            },
            select: { id: true },
        });
    }

    async updateBookingSessionPayment(sessionId: string, paymentIntentId: string) {
        return prisma.booking_sessions.update({
            where: { id: sessionId },
            data: { payment_intent_id: paymentIntentId, status: 'payment_initiated' },
        });
    }

    async updateBookingSessionAudit(sessionId: string, data: {
        currency?: string;
        originalPrice?: number;
        chargedPrice?: number;
        markupPct?: number;
        paymentCurrency?: string;
    }) {
        return prisma.booking_sessions.update({
            where: { id: sessionId },
            data: {
                currency: data.currency,
                original_price: data.originalPrice,
                charged_price: data.chargedPrice,
                markup_pct: data.markupPct,
            },
        }).catch(err => {
            console.warn('[Repository] Audit fields update failed (run migration):', err.message);
        });
    }

    async updateBookingSessionDuffelPreOrder(sessionId: string, data: {
        orderId: string;
        pnr: string;
        tickets: string[];
        isTicketed: boolean;
    }) {
        return prisma.booking_sessions.update({
            where: { id: sessionId },
            data: {
                duffel_pre_order_id: data.orderId,
                duffel_pre_order_pnr: data.pnr,
                duffel_pre_order_tickets: data.tickets,
                duffel_pre_order_ticketed: data.isTicketed,
            },
        });
    }

    async getBookingSession(sessionId: string) {
        return prisma.booking_sessions.findUnique({
            where: { id: sessionId },
        });
    }

    async getBookingSessionForCancelQuote(sessionId: string) {
        return prisma.booking_sessions.findUnique({
            where: { id: sessionId },
            select: { duffel_pre_order_id: true, payment_intent_id: true },
        });
    }

    // ─── Duplicate booking guard ───────────────────────────────────────────────

    /**
     * A user's recent booking sessions that bought a Duffel order — the candidates for reusing
     * one instead of buying the same trip twice. See preorderReuse.
     */
    async findRecentPreOrderSessions(userId: string, since: Date) {
        return prisma.booking_sessions.findMany({
            where: {
                user_id: userId,
                duffel_pre_order_id: { not: null },
                created_at: { gte: since },
            },
            orderBy: { created_at: 'desc' },
            take: 20,
            select: {
                id: true, status: true, duffel_pre_order_id: true, duffel_pre_order_pnr: true,
                duffel_pre_order_tickets: true, duffel_pre_order_ticketed: true,
                payment_intent_id: true, flight: true, created_at: true,
            },
        });
    }

    /** Retire a session whose order was superseded, so it stops presenting itself for reuse. */
    async expireSessionsForPreOrder(orderId: string) {
        await prisma.booking_sessions.updateMany({
            where: { duffel_pre_order_id: orderId },
            data:  { status: 'expired' },
        });
    }

    async getActiveBookingsForUser(userId: string): Promise<{ id: string }[]> {
        return prisma.flight_bookings.findMany({
            where: {
                user_id: userId,
                NOT: {
                    status: { in: ['cancelled', 'cancelled_provider_missing', 'refunded', 'cancel_failed', 'cancel_requested'] },
                },
            },
            select: { id: true },
        });
    }

    async findSegmentConflict(bookingIds: string[], origin: string, departureDateStart: Date, departureDateEnd: Date) {
        return prisma.flight_segments.findFirst({
            where: {
                booking_id: { in: bookingIds },
                origin,
                departure: { gte: departureDateStart, lt: departureDateEnd },
            },
            select: { booking_id: true },
        });
    }

    // ─── The sale: what a completed attempt is recorded as ─────────────────────

    /** The flight_bookings row for a Duffel order that has been placed and paid for. */
    async createDuffelFlightBooking(data: {
        userId:          string;
        sessionId:       string;
        pnr:             string;
        status:          string;
        /** What the traveller paid, in `currency`. */
        price:           number;
        currency:        string;
        paymentIntentId: string | null;
        /** What the airline charged us, before markup. */
        supplierCost:    number;
        orderId:         string;
        ticketNumbers:   string[];
        farePolicy:      any;
        tripType:        string;
        fx:              FxLock;
        sourceBrand:     string;
    }): Promise<{ id: string }> {
        return prisma.flight_bookings.create({
            data: {
                user_id: data.userId,
                session_id: data.sessionId,
                provider: 'duffel',
                pnr: data.pnr,
                status: data.status,
                total_price: data.price,
                currency: data.currency,
                payment_intent_id: data.paymentIntentId,
                confirmed_price: data.price,
                confirmed_currency: data.currency,
                charged_price: data.price,
                supplier_cost: data.supplierCost,
                provider_order_id: data.orderId,
                duffel_order_id: data.orderId,
                ticket_numbers: data.ticketNumbers,
                fare_policy: data.farePolicy ?? undefined,
                trip_type: data.tripType,
                usd_amount:     data.fx.usd_amount,
                fx_rate:        data.fx.fx_rate,
                fx_captured_at: data.fx.fx_captured_at,
                fx_source:      data.fx.fx_source,
                source_brand:   data.sourceBrand,
            },
        });
    }

    async insertFlightSegments(bookingId: string, flight: any) {
        const segments: any[] = flight.segments ?? [];
        if (segments.length === 0) {
            console.warn(`[flight-booking] No segments for booking ${bookingId}`);
            return;
        }

        for (const seg of segments) {
            try {
                const depTime = seg.departure?.time ?? seg.departing_at ?? seg.departureTime ?? null;
                const arrTime = seg.arrival?.time ?? seg.arriving_at ?? seg.arrivalTime ?? null;
                const origin = seg.origin?.iata_code ?? seg.origin?.airport ?? seg.origin ?? '';
                const destination = seg.destination?.iata_code ?? seg.destination?.airport ?? seg.destination ?? '';
                // `airline` may be a normalised object ({ code, name }), a raw carrier object, or a
                // plain IATA string — never insert the object itself, which coerces to the literal
                // "[object Object]" in this text column.
                const airline =
                    (typeof seg.airline === 'object'
                        ? seg.airline?.code ?? seg.airline?.iata_code
                        : seg.airline)
                    ?? seg.airline_iata_code
                    ?? seg.operating_carrier?.iata_code
                    ?? seg.marketing_carrier?.iata_code
                    ?? '';

                // A segment with no readable times is skipped, not dated to now. `new Date()` here
                // wrote today's date onto a leg of a future trip, which reads as a real departure
                // on every screen that shows it — a missing leg at least looks missing.
                if (!depTime || !arrTime) {
                    console.error(`[flight-booking] Segment for booking ${bookingId} has no departure/arrival time — skipped rather than dated to now`);
                    continue;
                }

                await prisma.flight_segments.create({
                    data: {
                        booking_id: bookingId,
                        airline,
                        flight_number: seg.flightNumber ?? seg.flight_number ?? '',
                        origin,
                        destination,
                        departure: new Date(depTime),
                        arrival: new Date(arrTime),
                        cabin_class: seg.cabinClass ?? seg.cabin_class ?? 'economy',
                        itinerary_index: seg.itineraryIndex ?? 0,
                        segment_index: seg.segmentIndex ?? seg.itineraryIndex ?? 0,
                    },
                });
            } catch (segErr: any) {
                console.error(`[flight-booking] Failed to insert segment for booking ${bookingId}:`, segErr.message);
            }
        }
    }

    async insertPassengers(bookingId: string, passengers: any[], ticketNumbers: string[] = []) {
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
                console.error(`[flight-booking] Failed to insert passenger ${i} for booking ${bookingId}:`, paxErr.message);
            }
        }
    }

    async markSessionCompleted(sessionId: string) {
        await prisma.$executeRaw`
            UPDATE booking_sessions SET status = 'completed', completed_at = NOW()
            WHERE id = ${sessionId}::uuid
        `;
    }

    // ─── Flight bookings ───────────────────────────────────────────────────────

    async getFlightBookingBySession(sessionId: string) {
        return prisma.flight_bookings.findFirst({
            where: { session_id: sessionId },
            select: { id: true, pnr: true, status: true, payment_intent_id: true },
        });
    }

    async getFlightBookingById(bookingId: string) {
        return prisma.flight_bookings.findUnique({
            where: { id: bookingId },
            select: {
                id: true, user_id: true, status: true, provider: true, pnr: true,
                payment_intent_id: true, created_at: true, cancellation_log: true,
                session_id: true, total_price: true, charged_price: true,
                payment_currency: true, refund_amount: true, refund_penalty_amount: true,
                refund_currency: true, supplier_currency: true, provider_order_id: true,
                duffel_order_id: true,
            },
        });
    }

    async getFlightBookingBySessionForUser(sessionId: string, userId: string) {
        return prisma.flight_bookings.findFirst({
            where: { session_id: sessionId, user_id: userId },
            select: { id: true, pnr: true, status: true },
        });
    }

    async updateFlightBookingStatus(bookingId: string, status: string, extraData?: Record<string, any>) {
        return prisma.flight_bookings.update({
            where: { id: bookingId },
            data: { status, ...extraData },
        });
    }

    async updateFlightBookingCancellation(bookingId: string, data: {
        status: string;
        cancellationCompletedAt?: Date;
        refundAmount?: number;
        refundPenaltyAmount?: number;
        refundCurrency?: string;
        supplierCancellationId?: string | null;
        paymentCurrency?: string;
        supplierCurrency?: string;
        cancellationLog: any[];
    }) {
        return prisma.flight_bookings.update({
            where: { id: bookingId },
            data: {
                status: data.status,
                cancellation_completed_at: data.cancellationCompletedAt ?? null,
                refund_amount: data.refundAmount ?? null,
                refund_penalty_amount: data.refundPenaltyAmount ?? null,
                refund_currency: data.refundCurrency ?? null,
                supplier_cancellation_id: data.supplierCancellationId ?? null,
                payment_currency: data.paymentCurrency ?? null,
                supplier_currency: data.supplierCurrency ?? null,
                cancellation_log: data.cancellationLog as any,
            },
        });
    }

    async updateFlightBookingRefundedStatus(bookingId: string, data: {
        refundAmount: number;
        refundCurrency: string;
        cancellationLog: any[];
    }) {
        return prisma.flight_bookings.update({
            where: { id: bookingId },
            data: {
                status: 'refunded',
                refund_amount: data.refundAmount,
                refund_currency: data.refundCurrency,
                cancellation_log: data.cancellationLog as any,
            },
        });
    }

    async setFlightBookingCancelRequested(bookingId: string, eligibleStatuses: string[], logEntry: any, currentLog: any[]) {
        // We need to check status in the WHERE clause to prevent race conditions
        // Prisma doesn't support updateMany with returning, so we use a transaction
        const existing = await prisma.flight_bookings.findUnique({
            where: { id: bookingId },
            select: { status: true },
        });
        if (!existing || !eligibleStatuses.includes(existing.status)) return null;

        return prisma.flight_bookings.update({
            where: { id: bookingId },
            data: {
                status: 'cancel_requested',
                cancellation_requested_at: new Date(),
                cancellation_log: [...currentLog, logEntry] as any,
            },
            select: { id: true },
        });
    }

    async getFlightSegmentsByBooking(bookingId: string) {
        return prisma.flight_segments.findMany({
            where: { booking_id: bookingId },
        });
    }

    async updateFlightBookingPaymentIntentId(bookingId: string, paymentIntentId: string) {
        return prisma.flight_bookings.update({
            where: { id: bookingId },
            data: { payment_intent_id: paymentIntentId },
        });
    }

    // ─── Price calendar ────────────────────────────────────────────────────────

    async getPriceCalendarRaw(params: {
        origin: string;
        destination: string;
        startDate: string;
        endDate: string;
        adults: number;
        cabin: string;
        returnDate?: string | null;
        provider?: string | null;
    }): Promise<Array<{ departure_date: string; min_price: string; currency: string }> | null> {
        try {
            const rows = await prisma.$queryRaw<Array<{ departure_date: string; min_price: string; currency: string }>>`
                SELECT * FROM get_cheapest_prices_per_day(
                    ${params.origin},
                    ${params.destination},
                    ${params.startDate}::date,
                    ${params.endDate}::date,
                    ${params.adults},
                    ${params.cabin},
                    24,
                    ${params.returnDate ?? null},
                    ${params.provider ?? null}
                )
            `;
            return rows;
        } catch {
            return null; // RPC not available — caller falls back
        }
    }

    async getPriceCalendarFallback(params: {
        origin: string;
        destination: string;
        startDate: string;
        endDate: string;
        adults: number;
        cabin: string;
        returnDate?: string | null;
        provider?: string | null;
        cutoffDate: Date;
    }) {
        return prisma.flight_results_cache.findMany({
            where: {
                created_at: { gte: params.cutoffDate },
                ...(params.provider ? { provider: params.provider } : {}),
                flight_searches: {
                    origin: params.origin,
                    destination: params.destination,
                    adults: params.adults,
                    cabin_class: params.cabin,
                    departure_date: {
                        gte: new Date(params.startDate),
                        lte: new Date(params.endDate),
                    },
                    ...(params.returnDate
                        ? { return_date: new Date(params.returnDate) }
                        : { return_date: null }),
                },
            },
            include: {
                flight_searches: { select: { departure_date: true } },
            },
        });
    }
}
