import { prisma } from '@/lib/prisma';

export class BookingsRepository {

    async listForUser(userId: string, tripType?: 'flight' | 'hotel') {
        const results: any[] = [];

        // Query hotel bookings when type is unspecified or 'hotel'
        if (!tripType || tripType === 'hotel') {
            const hotelRows = await prisma.bookings.findMany({
                where:   { user_id: userId },
                orderBy: { created_at: 'desc' },
            });
            for (const row of hotelRows) {
                results.push({ ...row, type: 'hotel' });
            }
        }

        // Query flight bookings when type is unspecified or 'flight'
        if (!tripType || tripType === 'flight') {
            const flightRows = await prisma.flight_bookings.findMany({
                where:   { user_id: userId },
                orderBy: { created_at: 'desc' },
                include: {
                    flight_segments: { orderBy: { segment_index: 'asc' } },
                    passengers:      true,
                },
            });
            for (const row of flightRows) {
                results.push({ ...row, type: 'flight' });
            }
        }

        // Sort merged results by created_at descending
        results.sort((a, b) => {
            const da = a.created_at ? new Date(a.created_at).getTime() : 0;
            const db = b.created_at ? new Date(b.created_at).getTime() : 0;
            return db - da;
        });

        return results;
    }

    async findById(bookingId: string) {
        return prisma.bookings.findFirst({ where: { booking_id: bookingId } });
    }

    async findByIdForUser(bookingId: string, userId: string) {
        return prisma.bookings.findFirst({ where: { booking_id: bookingId, user_id: userId } });
    }

    async findByProviderRef(providerRef: string) {
        return prisma.bookings.findFirst({ where: { provider_ref: providerRef } as any });
    }

    async create(data: {
        userId:       string;
        tripType:     'flight' | 'hotel';
        provider:     string;
        providerRef?: string;
        status:       string;
        totalPrice:   number;
        currency:     string;
        details:      any;
        checkIn?:     Date;
        checkOut?:    Date;
        sessionId?:   string;
    }) {
        return prisma.bookings.create({
            data: {
                user_id:      data.userId,
                trip_type:    data.tripType as any,
                provider:     data.provider,
                provider_ref: data.providerRef ?? null,
                status:       data.status,
                total_price:  data.totalPrice,
                currency:     data.currency,
                details:      data.details,
                check_in:     data.checkIn  ?? undefined,
                check_out:    data.checkOut ?? undefined,
                session_id:   data.sessionId ?? null,
            } as any,
        });
    }

    async updateStatus(bookingId: string, status: string, extra?: Record<string, any>) {
        return prisma.bookings.updateMany({
            where: { booking_id: bookingId },
            data:  { status, ...(extra ?? {}), updated_at: new Date() },
        });
    }

    async findBookingSession(sessionId: string) {
        return prisma.booking_sessions.findUnique({ where: { id: sessionId } });
    }

    async createBookingSession(data: {
        userId:     string;
        provider:   string;
        hotelId:    string;
        details:    any;
        expiresAt:  Date;
    }) {
        return prisma.booking_sessions.create({
            data: {
                user_id:    data.userId,
                provider:   data.provider,
                hotel_id:   data.hotelId,
                details:    data.details,
                expires_at: data.expiresAt,
                status:     'pending',
            } as any,
        });
    }

    async updateBookingSessionStatus(sessionId: string, status: string, extra?: Record<string, any>) {
        return prisma.booking_sessions.update({
            where: { id: sessionId },
            data:  { status, ...(extra ?? {}), updated_at: new Date() },
        });
    }

    async getSavedTrips(userId: string) {
        return prisma.saved_trips.findMany({
            where:   { user_id: userId },
            orderBy: { created_at: 'desc' },
        });
    }

    async saveTrip(data: { userId: string; hotelId: string; hotelName?: string; details?: any }) {
        return prisma.saved_trips.create({
            data: {
                user_id:    data.userId,
                hotel_id:   data.hotelId,
                hotel_name: data.hotelName ?? null,
                details:    data.details ?? {},
            } as any,
        });
    }

    async deleteSavedTrip(id: string, userId: string) {
        return prisma.saved_trips.deleteMany({ where: { id, user_id: userId } });
    }

    async getPriceAlerts(userId: string) {
        return prisma.price_alerts.findMany({
            where:   { user_id: userId, active: true } as any,
            orderBy: { created_at: 'desc' },
        });
    }

    async createPriceAlert(data: {
        userId:      string;
        origin?:     string;
        destination: string;
        targetPrice: number;
        currency:    string;
        tripType:    string;
        details?:    any;
    }) {
        return prisma.price_alerts.create({
            data: {
                user_id:      data.userId,
                origin:       data.origin ?? undefined,
                destination:  data.destination,
                target_price: data.targetPrice,
                currency:     data.currency,
                trip_type:    data.tripType as any,
                details:      data.details ?? {},
                active:       true,
            } as any,
        });
    }

    async deletePriceAlert(id: string, userId: string) {
        return prisma.price_alerts.updateMany({
            where: { id, user_id: userId },
            data:  { active: false } as any,
        });
    }
}
