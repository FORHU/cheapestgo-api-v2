import { prisma } from '@/lib/prisma';

export class HotelsRepository {
    /** How many catalogued hotels a city has. Drives the search bar's result-count hint. */
    async countHotelContentByCity(cityName: string, countryCode?: string) {
        const cityOnly = cityName.split(',')[0].trim();
        const isoCode  = countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? countryCode : null;

        const where: any = { city: { equals: cityOnly, mode: 'insensitive' } };
        if (isoCode) where.country = { equals: isoCode, mode: 'insensitive' };

        return prisma.hotel_content.count({ where });
    }

    // ─── Hotel content ────────────────────────────────────────────────────────

    async findHotelContent(hotelId: string) {
        return prisma.hotel_content.findUnique({ where: { hotel_id: hotelId } });
    }

    async findManyHotelContent(hotelIds: string[]) {
        if (!hotelIds.length) return [];
        return prisma.hotel_content.findMany({
            where: { hotel_id: { in: hotelIds } },
        });
    }

    async findHotelContentByCity(cityName: string, countryCode?: string, limit = 300) {
        const cityOnly   = cityName.split(',')[0].trim();
        const normalized = cityOnly.replace(/-(si|do|gu|gun|eup)$/i, '').trim();
        const isoCode    = countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? countryCode : null;

        const where: any = {
            city:   { contains: normalized, mode: 'insensitive' },
            images: { isEmpty: false },
        };
        if (isoCode) where.country = { equals: isoCode, mode: 'insensitive' };

        return prisma.hotel_content.findMany({
            where,
            orderBy: { review_count: { sort: 'desc', nulls: 'last' } },
            take: limit,
            select: {
                hotel_id: true, name: true, images: true, star_rating: true,
                lat: true, lng: true, address: true, city: true, country: true,
                description: true, amenities: true, review_rating: true, review_count: true,
            },
        });
    }

    async upsertHotelContent(data: {
        hotel_id: string;
        name?: string | null;
        images?: string[];
        lat?: number;
        lng?: number;
        address?: string | null;
        city?: string | null;
        country?: string | null;
        description?: string | null;
        star_rating?: number;
        amenities?: any;
        content_source?: string;
    }) {
        return prisma.hotel_content.upsert({
            where:  { hotel_id: data.hotel_id },
            create: {
                hotel_id:       data.hotel_id,
                name:           data.name ?? null,
                images:         data.images ?? [],
                lat:            data.lat ?? 0,
                lng:            data.lng ?? 0,
                address:        data.address ?? null,
                city:           data.city ?? null,
                country:        data.country ?? null,
                description:    data.description ?? null,
                star_rating:    data.star_rating ?? 0,
                amenities:      data.amenities ?? [],
                content_source: data.content_source ?? 'tgx',
                fetched_at:     new Date(),
            },
            update: {
                fetched_at:     new Date(),
                content_source: data.content_source ?? 'tgx',
            },
        });
    }

    // ─── Hotel reviews ────────────────────────────────────────────────────────

    async findHotelReviews(hotelId: string) {
        return prisma.hotel_reviews.findUnique({ where: { hotel_id: hotelId } });
    }

    async findManyHotelReviews(hotelIds: string[]) {
        if (!hotelIds.length) return [];
        return prisma.hotel_reviews.findMany({
            where: { hotel_id: { in: hotelIds } },
        });
    }

    async findHotelReviewItems(hotelId: string, limit = 20) {
        return prisma.hotel_review_items.findMany({
            where:   { hotel_id: hotelId },
            orderBy: { score: 'desc' },
            take:    limit,
        });
    }

    // ─── Search cache ─────────────────────────────────────────────────────────

    async getSearchCache(cacheKey: string, ttlMinutes: number): Promise<{ result: any; stale: boolean } | null> {
        try {
            const now        = new Date();
            const graceLimit = new Date(now.getTime() - ttlMinutes * 60 * 1000);
            const row        = await prisma.hotel_search_cache.findFirst({
                where: { cache_key: cacheKey, expires_at: { gt: graceLimit } },
            });
            if (!row) return null;
            return { result: row.result as any, stale: row.expires_at <= now };
        } catch {
            return null;
        }
    }

    async setSearchCache(cacheKey: string, result: any, ttlMinutes: number): Promise<void> {
        try {
            const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
            await prisma.hotel_search_cache.upsert({
                where:  { cache_key: cacheKey },
                create: { cache_key: cacheKey, result, expires_at: expiresAt, created_at: new Date() },
                update: { result, expires_at: expiresAt, created_at: new Date() },
            });
        } catch (e: any) {
            console.error('[hotel-cache] Write failed:', e.message);
        }
    }

    // ─── Search demand stats ──────────────────────────────────────────────────

    async recordSearchDemand(cityKey: string, countryCode: string): Promise<void> {
        try {
            await prisma.hotel_search_stats.upsert({
                where:  { city_key: cityKey },
                create: { city_key: cityKey, country_code: countryCode.toUpperCase(), search_count: 1 },
                update: {
                    search_count:     { increment: 1 },
                    last_searched_at: new Date(),
                },
            });
        } catch { /* non-fatal */ }
    }

    async getDemandCities(limit = 20): Promise<{ cityName: string; countryCode: string }[]> {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const rows   = await prisma.hotel_search_stats.findMany({
            where:   { last_searched_at: { gt: cutoff } },
            orderBy: [{ search_count: 'desc' }, { last_searched_at: 'desc' }],
            take:    limit,
        });
        return rows.map((r: any) => ({ cityName: r.city_key, countryCode: r.country_code }));
    }

    // ─── TGX destination cache ────────────────────────────────────────────────

    async getTgxDestinationCode(cityKey: string): Promise<string | null> {
        const row = await prisma.tgx_destination_cache.findUnique({ where: { city_key: cityKey } });
        return row?.destination_code ?? null;
    }

    async setTgxDestinationCode(cityKey: string, destinationCode: string): Promise<void> {
        await prisma.tgx_destination_cache.upsert({
            where:  { city_key: cityKey },
            create: { city_key: cityKey, destination_code: destinationCode },
            update: { destination_code: destinationCode },
        });
    }

    // ─── Place cache ──────────────────────────────────────────────────────────

    async getPlaceCache(placeId: string): Promise<{ data: any; cached_at: Date } | null> {
        return prisma.place_cache.findUnique({ where: { place_id: placeId } });
    }

    async setPlaceCache(placeId: string, data: any): Promise<void> {
        await prisma.place_cache.upsert({
            where:  { place_id: placeId },
            create: { place_id: placeId, data, cached_at: new Date() },
            update: { data, cached_at: new Date() },
        });
    }

    // ─── Deals ────────────────────────────────────────────────────────────────

    /**
     * `hotel_deals` has neither an `active` flag nor a `priority` column — both
     * were assumed here and hidden behind `as any`, so every call to this failed
     * at runtime with "Unknown argument `active`". v1 selects the table plainly
     * and discards rows it cannot link to a hotel, which is what this now does.
     * Most recently refreshed first, so the order is at least deterministic.
     */
    async getHotelDeals(limit = 12) {
        return prisma.hotel_deals.findMany({
            where:   { hotel_code: { not: null } },
            orderBy: [
                { last_refreshed_at: { sort: 'desc', nulls: 'last' } },
                { updated_at: 'desc' },
            ],
            take: limit,
        });
    }
}
