import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { resolveHotelDbCities } from '@/lib/cityAliases';
import type { EtgHotelContent } from '@/lib/hotels/etg';

export class HotelsRepository {
    /**
     * How many catalogued hotels a city has. Drives the search bar's result-count hint.
     *
     * Counts every spelling the catalog files the city under, not just the one the
     * visitor typed: Seoul is stored as both "Seoul" and "Seúl", so counting one
     * name reported roughly half the city.
     */
    async countHotelContentByCity(cityName: string, countryCode?: string) {
        const cityOnly = cityName.split(',')[0].trim();
        const isoCode  = countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? countryCode : null;
        const spellings = resolveHotelDbCities(cityOnly, isoCode ?? '');

        const where: any = {
            OR: spellings.map(n => ({ city: { equals: n, mode: 'insensitive' } })),
        };
        if (isoCode) where.country = { equals: isoCode, mode: 'insensitive' };

        return prisma.hotel_content.count({ where });
    }

    /**
     * Persist ETG-sourced name, description and amenities.
     *
     * api-v2 fetched this content on every request and threw it away; this is
     * what makes the second request cheap. Each field is written only when the
     * existing row has nothing better, so a richer TGX name or description is
     * never overwritten by an ETG one:
     *
     *   name        — replaced only when missing, or when it is just the id
     *   description — replaced only when null or empty
     *   amenities   — replaced only when absent or an empty array
     *
     * Rows are written one at a time on purpose. A batch that fails loses every
     * hotel in it, and enrichment is worth having partially.
     */
    async upsertEtgContent(content: Map<string, EtgHotelContent>): Promise<number> {
        if (!content.size) return 0;

        let saved = 0;
        for (const [hotelId, c] of content) {
            try {
                await prisma.$executeRaw(Prisma.sql`
                    INSERT INTO hotel_content (hotel_id, name, images, description, amenities, content_source, fetched_at)
                    VALUES (
                        ${hotelId}, ${c.name ?? null}, '{}',
                        ${c.description ?? null},
                        ${JSON.stringify(c.amenities ?? [])}::jsonb,
                        'etg', now()
                    )
                    ON CONFLICT (hotel_id) DO UPDATE SET
                        name        = CASE WHEN hotel_content.name IS NULL OR hotel_content.name = hotel_content.hotel_id
                                      THEN COALESCE(EXCLUDED.name, hotel_content.name) ELSE hotel_content.name END,
                        description = CASE WHEN (hotel_content.description IS NULL OR hotel_content.description = '')
                                           AND EXCLUDED.description IS NOT NULL
                                      THEN EXCLUDED.description ELSE hotel_content.description END,
                        amenities   = CASE WHEN (hotel_content.amenities IS NULL
                                                 OR jsonb_typeof(hotel_content.amenities) <> 'array'
                                                 OR jsonb_array_length(hotel_content.amenities) = 0)
                                           AND jsonb_typeof(EXCLUDED.amenities) = 'array'
                                           AND jsonb_array_length(EXCLUDED.amenities) > 0
                                      THEN EXCLUDED.amenities ELSE hotel_content.amenities END,
                        fetched_at  = now()
                `);
                saved++;
            } catch { /* one hotel failing must not cost the rest of the batch */ }
        }

        if (saved) console.log(`[etg-content] upserted ${saved} hotels into hotel_content`);
        return saved;
    }

    // ─── Room groups ──────────────────────────────────────────────────────────

    /**
     * The stored room catalog for a hotel, plus the RateHawk slug needed to seed
     * it from ETG when it is missing.
     *
     * `room_groups` holds one of two shapes by history: the ETG-seeded array of
     * named groups, or an older TGX map keyed by room code. Callers have to
     * handle both, so the raw value is returned rather than a guess.
     */
    async findRoomGroups(hotelId: string): Promise<{
        roomGroups:  unknown;
        ratehawkHid: string | null;
        /** Null means never seeded. The column defaults to `[]`, so an empty
         *  value on its own cannot tell "we asked and there is nothing" apart
         *  from "we have never asked". */
        seededAt:    Date | null;
    } | null> {
        const row = await prisma.hotel_content.findUnique({
            where:  { hotel_id: hotelId },
            select: { room_groups: true, ratehawk_hid: true, room_groups_seeded_at: true },
        });
        if (!row) return null;
        return {
            roomGroups:  row.room_groups,
            ratehawkHid: row.ratehawk_hid ?? null,
            seededAt:    row.room_groups_seeded_at ?? null,
        };
    }

    /**
     * Store the room catalog. Writing an empty result is deliberate: it records
     * that the supplier has no room-level content for this hotel, so the next
     * visit falls back to the hotel gallery instead of paying for the lookup again.
     */
    async saveRoomGroups(hotelId: string, groups: unknown): Promise<void> {
        await prisma.hotel_content.updateMany({
            where: { hotel_id: hotelId },
            data:  { room_groups: groups as any, room_groups_seeded_at: new Date() },
        });
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

    /**
     * Record what the supplier quoted at prebook, so checkout charges from this row
     * rather than from the browser's payload.
     *
     * Upserted on `prebook_id`: re-quoting the same book token replaces the figure
     * instead of leaving a stale one that checkout might charge from.
     */
    async savePrebookQuote(quote: {
        prebookId: string;
        net:       number;
        gross:     number;
        currency:  string;
        roomName:  string | null;
        checkIn:   string | null;
        checkOut:  string | null;
        expiresAt: Date;
    }) {
        const row = {
            net:        new Prisma.Decimal(quote.net),
            gross:      new Prisma.Decimal(quote.gross),
            currency:   quote.currency.toUpperCase(),
            room_name:  quote.roomName,
            check_in:   quote.checkIn,
            check_out:  quote.checkOut,
            expires_at: quote.expiresAt,
        };

        return prisma.hotel_prebook_quotes.upsert({
            where:  { prebook_id: quote.prebookId },
            create: { prebook_id: quote.prebookId, ...row },
            update: row,
        });
    }

    /**
     * Record the supplier's cancellation terms as they stood when the booking was
     * taken, with one tier row per penalty step.
     *
     * The terms are evidence, like the FX rate: a cancellation weeks later is judged
     * against what the guest agreed to, not against whatever the supplier is quoting
     * that day. `booking_id` is unique, so a retry replaces rather than duplicates.
     */
    async savePolicySnapshot(input: {
        bookingId:          string;
        policyType:         'free_cancellation' | 'non_refundable' | 'partial_refund' | 'tiered';
        summary:            string;
        refundableTag:      string;
        freeCancelDeadline: Date | null;
        rawResponse:        unknown;
        tiers: Array<{
            cancelDeadline: Date;
            penaltyAmount:  number;
            penaltyType:    string;
            currency:       string;
        }>;
    }) {
        return prisma.$transaction(async (tx) => {
            const snapshot = await tx.booking_policy_snapshots.upsert({
                where:  { booking_id: input.bookingId },
                create: {
                    booking_id:           input.bookingId,
                    policy_type:          input.policyType,
                    summary:              input.summary,
                    refundable_tag:       input.refundableTag,
                    free_cancel_deadline: input.freeCancelDeadline,
                    raw_provider_response: input.rawResponse as never,
                },
                update: {
                    policy_type:          input.policyType,
                    summary:              input.summary,
                    refundable_tag:       input.refundableTag,
                    free_cancel_deadline: input.freeCancelDeadline,
                    raw_provider_response: input.rawResponse as never,
                },
            });

            // Rewritten wholesale so a replaced snapshot cannot keep stale tiers that
            // would then be read as the booking's terms.
            await tx.policy_tiers.deleteMany({ where: { snapshot_id: snapshot.id } });

            for (const [i, t] of input.tiers.entries()) {
                await tx.policy_tiers.create({
                    data: {
                        snapshot_id:     snapshot.id,
                        cancel_deadline: t.cancelDeadline,
                        penalty_amount:  new Prisma.Decimal(t.penaltyAmount),
                        penalty_type:    t.penaltyType,
                        currency:        t.currency,
                        tier_order:      i,
                    },
                });
            }

            await tx.bookings.update({
                where: { booking_id: input.bookingId },
                data:  { policy_snapshot_id: snapshot.id },
            });

            return snapshot;
        });
    }

    /** The recorded terms a cancellation must be judged against, tiers included. */
    async findPolicySnapshot(bookingId: string) {
        const snapshot = await prisma.booking_policy_snapshots.findUnique({
            where:   { booking_id: bookingId },
            include: { policy_tiers: { orderBy: { tier_order: 'asc' } } },
        });
        if (!snapshot) return null;

        return {
            policyType:         snapshot.policy_type,
            freeCancelDeadline: snapshot.free_cancel_deadline,
            tiers: snapshot.policy_tiers.map((t) => ({
                cancelDeadline: t.cancel_deadline,
                penaltyAmount:  t.penalty_amount.toNumber(),
                penaltyType:    t.penalty_type,
                currency:       t.currency,
                tierOrder:      t.tier_order,
            })),
        };
    }

    /**
     * The quote a checkout must charge from. Returns null when prebook never recorded
     * one — checkout rejects that rather than falling back to the client's figure.
     */
    async findPrebookQuote(prebookId: string): Promise<{
        gross:      number;
        currency:   string;
        expires_at: Date;
    } | null> {
        const row = await prisma.hotel_prebook_quotes.findUnique({
            where:  { prebook_id: prebookId },
            select: { gross: true, currency: true, expires_at: true },
        });
        if (!row) return null;

        // Prisma hands back a Decimal; the charge rule works in plain numbers, and
        // converting here keeps Prisma's types at the repository boundary.
        return { gross: row.gross.toNumber(), currency: row.currency, expires_at: row.expires_at };
    }
}
