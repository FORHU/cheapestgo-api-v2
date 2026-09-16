import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * The rows the back office lists and edits: destinations, reviews, saved trips, price alerts,
 * notifications and settings (C5, ported from v1's /api/admin/*).
 *
 * One repository rather than six because every one of them is the same shape — a filtered,
 * paginated read and a small set of writes — and six files of twenty lines each would hide
 * that. Anything larger than a list (bookings, customers, Stripe) keeps its own home.
 */

export interface PageRequest {
    page:     number;
    pageSize: number;
    query?:   string;
}

export interface Page<T> {
    data:       T[];
    total:      number;
    page:       number;
    pageSize:   number;
    totalPages: number;
}

function paged<T>(data: T[], total: number, request: PageRequest): Page<T> {
    return {
        data,
        total,
        page:       request.page,
        pageSize:   request.pageSize,
        totalPages: Math.max(1, Math.ceil(total / request.pageSize)),
    };
}

export class AdminContentRepository {
    // ─── Popular destinations ─────────────────────────────────────────────────

    async listDestinations(request: PageRequest) {
        const where: Prisma.popular_destinationsWhereInput = request.query
            ? {
                OR: [
                    { city:    { contains: request.query, mode: 'insensitive' } },
                    { country: { contains: request.query, mode: 'insensitive' } },
                ],
            }
            : {};

        const [data, total] = await Promise.all([
            prisma.popular_destinations.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (request.page - 1) * request.pageSize,
                take: request.pageSize,
            }),
            prisma.popular_destinations.count({ where }),
        ]);
        return paged(data, total, request);
    }

    async createDestination(data: { city: string; country: string; imageUrl?: string | null; averagePrice?: number | null }) {
        return prisma.popular_destinations.create({
            data: {
                city:          data.city,
                country:       data.country,
                image_url:     data.imageUrl ?? null,
                average_price: data.averagePrice ?? null,
            },
        });
    }

    async updateDestination(id: string, data: { city?: string; country?: string; imageUrl?: string | null; averagePrice?: number | null }) {
        return prisma.popular_destinations.update({
            where: { id },
            data: {
                ...(data.city !== undefined && { city: data.city }),
                ...(data.country !== undefined && { country: data.country }),
                ...(data.imageUrl !== undefined && { image_url: data.imageUrl }),
                ...(data.averagePrice !== undefined && { average_price: data.averagePrice }),
            },
        });
    }

    async deleteDestinations(ids: string[]) {
        return prisma.popular_destinations.deleteMany({ where: { id: { in: ids } } });
    }

    // ─── Hotel reviews: not portable yet ──────────────────────────────────────
    //
    // v1's admin screen lists individual reviews — reviewer name, text, a row per review — but
    // v2's `hotel_reviews` is a per-hotel summary: one row of rating and count, synced from ETG.
    // There is nothing here to list or delete, so the endpoint is left absent rather than
    // answering with a shape the screen cannot use. Recorded in docs/port-status.md under C5.

    // ─── Saved trips ──────────────────────────────────────────────────────────

    async listSavedTrips(request: PageRequest & { type?: 'flight' | 'hotel' }) {
        const where: Prisma.saved_tripsWhereInput = {
            ...(request.type ? { type: request.type as Prisma.Enumtrip_typeFilter['equals'] } : {}),
            ...(request.query
                ? {
                    OR: [
                        { title:    { contains: request.query, mode: 'insensitive' } },
                        { subtitle: { contains: request.query, mode: 'insensitive' } },
                    ],
                }
                : {}),
        };

        const [data, total, flights, hotels] = await Promise.all([
            prisma.saved_trips.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (request.page - 1) * request.pageSize,
                take: request.pageSize,
            }),
            prisma.saved_trips.count({ where }),
            prisma.saved_trips.count({ where: { type: 'flight' } }),
            prisma.saved_trips.count({ where: { type: 'hotel' } }),
        ]);

        return { ...paged(data, total, request), counts: { flights, hotels, all: flights + hotels } };
    }

    async deleteSavedTrips(ids: string[]) {
        return prisma.saved_trips.deleteMany({ where: { id: { in: ids } } });
    }

    // ─── Price alerts ─────────────────────────────────────────────────────────

    async listPriceAlerts(request: PageRequest & { status?: 'active' | 'inactive' }) {
        const where: Prisma.price_alertsWhereInput = {
            ...(request.status ? { is_active: request.status === 'active' } : {}),
            ...(request.query
                ? {
                    OR: [
                        { origin:      { contains: request.query, mode: 'insensitive' } },
                        { destination: { contains: request.query, mode: 'insensitive' } },
                        { email:       { contains: request.query, mode: 'insensitive' } },
                    ],
                }
                : {}),
        };

        const [data, total] = await Promise.all([
            prisma.price_alerts.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (request.page - 1) * request.pageSize,
                take: request.pageSize,
            }),
            prisma.price_alerts.count({ where }),
        ]);
        return paged(data, total, request);
    }

    async setPriceAlertsActive(ids: string[], isActive: boolean) {
        return prisma.price_alerts.updateMany({ where: { id: { in: ids } }, data: { is_active: isActive } });
    }

    async deletePriceAlerts(ids: string[]) {
        return prisma.price_alerts.deleteMany({ where: { id: { in: ids } } });
    }

    // ─── Notifications ────────────────────────────────────────────────────────

    /** Newest first, capped: the bell shows recent alerts, not an archive. */
    async listNotifications(limit = 50) {
        return prisma.notifications.findMany({ orderBy: { created_at: 'desc' }, take: limit });
    }

    async markNotificationRead(id: string) {
        await prisma.notifications.updateMany({ where: { id }, data: { read: true } });
    }

    async markAllNotificationsRead() {
        await prisma.notifications.updateMany({ where: { read: false }, data: { read: true } });
    }
}

export const adminContentRepository = new AdminContentRepository();
