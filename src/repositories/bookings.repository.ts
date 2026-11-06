import { prisma } from '@/lib/prisma';

export class BookingsRepository {

    async listForUser(userId: string, tripType?: 'flight' | 'hotel' | 'golf') {
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

            // Include V2 hotel_bookings deduplicated against legacy rows
            try {
                const v2HotelRows = await prisma.hotel_bookings.findMany({
                    where:   { user_id: userId },
                    orderBy: { created_at: 'desc' },
                    include: {
                        hotel_booking_guests: true,
                    },
                });
                const existingRefs = new Set(hotelRows.map((r: any) => r.booking_id || r.id));
                for (const row of v2HotelRows) {
                    if (!existingRefs.has(row.booking_reference) && !existingRefs.has(row.id)) {
                        const holder = row.hotel_booking_guests.find((g: any) => g.kind === 'holder') || row.hotel_booking_guests[0];
                        results.push({
                            id:                 row.id,
                            booking_id:         row.booking_reference,
                            type:               'hotel',
                            user_id:            row.user_id,
                            status:             row.status.toLowerCase(),
                            provider:           row.provider,
                            property_name:      row.property_name,
                            room_name:          row.room_name,
                            check_in:           row.check_in,
                            check_out:          row.check_out,
                            currency:           row.currency,
                            total_price:        Number(row.amount_minor) / 100,
                            holder_first_name:  holder?.first_name ?? null,
                            holder_last_name:   holder?.last_name ?? null,
                            holder_email:       holder?.email ?? null,
                            created_at:         row.created_at,
                            updated_at:         row.updated_at,
                            supplier_reference: row.supplier_reference,
                        });
                    }
                }
            } catch {
                // Table unreachable or offline; continue with available results
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

        // Query golf bookings when type is unspecified or 'golf'
        if (!tripType || tripType === 'golf') {
            try {
                const golfRows = await prisma.golf_bookings.findMany({
                    where:   { user_id: userId, status: { not: 'expired' } },
                    orderBy: { created_at: 'desc' },
                    include: {
                        golf_courses:   true,
                        golf_tee_times: true,
                    },
                });
                for (const row of golfRows) {
                    results.push({
                        id:                row.id,
                        booking_id:        row.reference,
                        type:              'golf',
                        user_id:           row.user_id,
                        status:            row.status,
                        provider:          'golf',
                        property_name:     row.golf_courses.name,
                        room_name:         `${row.players} Player${row.players > 1 ? 's' : ''} · Tee time`,
                        check_in:          row.golf_tee_times.starts_at,
                        check_out:         null,
                        currency:          row.currency.trim(),
                        total_price:       Number(row.total),
                        holder_first_name: row.lead_name,
                        holder_email:      row.contact_email,
                        created_at:        row.created_at,
                        updated_at:        row.updated_at,
                    });
                }
            } catch {
                // Table unreachable or offline; continue with available results
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

    /** The fields an amendment can change, as they stand before it — for the email's diff. */
    async findAmendable(bookingId: string) {
        return prisma.bookings.findFirst({
            where:  { booking_id: bookingId },
            select: {
                id: true, user_id: true, property_name: true, property_image: true, room_name: true,
                check_in: true, check_out: true, guests_adults: true, guests_children: true,
                holder_first_name: true, holder_last_name: true, holder_email: true, special_requests: true,
            },
        });
    }

    async amendContact(bookingId: string, change: {
        firstName: string; lastName: string; email: string; remarks: string | null;
    }) {
        await prisma.bookings.updateMany({
            where: { booking_id: bookingId },
            data: {
                holder_first_name: change.firstName,
                holder_last_name:  change.lastName,
                holder_email:      change.email,
                special_requests:  change.remarks,
                updated_at:        new Date(),
            },
        });
    }

    /** A line in the admin notifications, so support can see a booking's contact changed. */
    async notifyAdmins(title: string, description: string) {
        await prisma.notifications.create({ data: { title, description, type: 'booking', user_id: null } }).catch(() => {});
    }

    async findById(bookingId: string) {
        return prisma.bookings.findFirst({ where: { booking_id: bookingId } });
    }

    async findByIdForUser(bookingId: string, userId: string) {
        const legacy = await prisma.bookings.findFirst({ where: { booking_id: bookingId, user_id: userId } });
        if (legacy) return legacy;

        try {
            const hb = await prisma.hotel_bookings.findFirst({
                where: {
                    user_id: userId,
                    OR: [{ booking_reference: bookingId }, { id: bookingId }],
                },
                include: { hotel_booking_guests: true },
            });
            if (hb) {
                const holder = hb.hotel_booking_guests.find((g: any) => g.kind === 'holder') || hb.hotel_booking_guests[0];
                return {
                    id:                  hb.id,
                    booking_id:          hb.booking_reference,
                    user_id:             hb.user_id,
                    status:              hb.status.toLowerCase(),
                    provider:            hb.provider,
                    property_name:       hb.property_name,
                    property_image:      null,
                    room_name:           hb.room_name,
                    check_in:            hb.check_in,
                    check_out:           hb.check_out,
                    guests_adults:       hb.hotel_booking_guests.filter(g => g.kind === 'adult' || g.kind === 'holder').length || 1,
                    guests_children:     hb.hotel_booking_guests.filter(g => g.kind === 'child').length || 0,
                    total_price:         Number(hb.amount_minor) / 100,
                    currency:            hb.currency,
                    holder_first_name:   holder?.first_name ?? '',
                    holder_last_name:    holder?.last_name ?? '',
                    holder_email:        holder?.email ?? '',
                    special_requests:    null,
                    policy_type:         'free_cancellation',
                    cancellation_policy: null,
                    created_at:          hb.created_at,
                } as any;
            }
        } catch {
            // Fall through if table is unavailable
        }

        return null;
    }

    /** By row id rather than booking_id — the self-service links address the UUID. */
    async findByRowIdForUser(id: string, userId: string) {
        return prisma.bookings.findFirst({ where: { id, user_id: userId } });
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
