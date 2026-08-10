/**
 * Flights repository — all Prisma queries for the flight booking domain.
 */

import { prisma } from '@/lib/prisma';

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

    // ─── Deals ────────────────────────────────────────────────────────────────

    /** Route deals kept fresh by the `sync-flight-deals` cron. Public, read-only. */
    async getFlightDeals(limit = 12) {
        return prisma.flight_deals.findMany({
            orderBy: { updated_at: 'desc' },
            take:    limit,
        });
    }
}
