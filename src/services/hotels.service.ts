import { HotelsRepository } from '@/repositories/hotels.repository';
import { runTgxSearch as searchHotels } from '@/lib/hotels/search';
import { quoteTgx, bookTgx, cancelTgx, fetchAmenitiesByDestination } from '@/lib/hotels/travelgatex';
import { groupByRoomName } from '@/lib/hotels/property';
import { ensureEtgContent } from '@/lib/hotels/etgContent';
import { buildRoomContent, buildPolicySections, buildAdditionalInfo } from '@/lib/hotels/roomContent';
import { otvCodeToLabel } from '@/lib/hotels/amenityCodes';
import { stripe } from '@/lib/stripe';
import { AppError } from '@/middleware/error.middleware';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';

// ─── ETG hotel/info helpers ───────────────────────────────────────────────────

function getEtgToken(): string {
    const keyId  = process.env.ETG_KEY_ID  ?? '';
    const apiKey = process.env.ETG_API_KEY ?? '';
    return Buffer.from(`${keyId}:${apiKey}`).toString('base64');
}

async function fetchEtgByHid(hid: number): Promise<{ id: string; amenities: string[] } | null> {
    try {
        const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
            method:  'POST',
            headers: { 'Authorization': `Basic ${getEtgToken()}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ hid, language: 'en' }),
            signal:  AbortSignal.timeout(8_000),
        });
        if (!res.ok) return null;
        const json: any = await res.json();
        const d = json?.data;
        if (!d) return null;
        const amenities: string[] = (d.amenity_groups ?? [])
            .flatMap((g: any) => g.amenities ?? [])
            .filter((a: any) => typeof a === 'string' && a.length > 0);
        return { id: d.id ?? '', amenities };
    } catch { return null; }
}

async function fetchEtgBySlugs(slugs: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (!slugs.length) return map;
    try {
        const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
            method:  'POST',
            headers: { 'Authorization': `Basic ${getEtgToken()}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ ids: slugs, language: 'en' }),
            signal:  AbortSignal.timeout(12_000),
        });
        if (!res.ok) return map;
        const json: any   = await res.json();
        const hotels: any[] = json?.data?.hotels ?? [];
        for (const h of hotels) {
            const amenities: string[] = (h.amenity_groups ?? [])
                .flatMap((g: any) => g.amenities ?? [])
                .filter((a: any) => typeof a === 'string' && a.length > 0);
            if (h.id && amenities.length) map.set(h.id, amenities);
        }
    } catch { /* non-fatal */ }
    return map;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
    return Promise.race([
        p,
        new Promise<null>((resolve) => {
            const t = setTimeout(() => resolve(null), ms);
            t.unref?.();
        }),
    ]).catch(() => null);
}

export class HotelsService {
    private repo = new HotelsRepository();

    // ── Search ────────────────────────────────────────────────────────────────

    async search(params: {
        destination:  string;
        checkIn:      string;
        checkOut:     string;
        adults:       number;
        children?:    number;
        rooms?:       number;
        lat?:         number;
        lng?:         number;
        countryCode?: string;
        currency?:    string;
        occupancies?: any[];
        filters?:     any;
    }) {
        const results = await searchHotels({
            cityName:    params.destination,
            checkin:     params.checkIn,
            checkout:    params.checkOut,
            adults:      params.adults,
            children:    params.children,
            countryCode: params.countryCode,
            currency:    params.currency,
            rooms:       params.rooms,
        } as any);
        await this.repo.recordSearchDemand(
            params.destination.toLowerCase().replace(/\s+/g, '-'),
            params.countryCode ?? 'XX',
        ).catch(() => {});
        return results;
    }

    // ── Amenities ─────────────────────────────────────────────────────────────

    async getAmenitiesByDestination(destinationCode: string) {
        const hotels = await fetchAmenitiesByDestination(destinationCode);
        return hotels.map(h => ({
            hotelId:   h.hotelId,
            hotelName: h.hotelName,
            amenities: h.amenities.map(otvCodeToLabel).filter(Boolean),
            rawCodes:  h.amenities,
        }));
    }

    async getAmenitiesByHotelIds(hotelIds: string[]) {
        if (!hotelIds.length) return [];

        // 1. Load whatever is already cached in hotel_content
        const rows = await prisma.hotel_content.findMany({
            where:  { hotel_id: { in: hotelIds } },
            select: { hotel_id: true, name: true, amenities: true, ratehawk_hid: true },
        });
        const dbMap = new Map(rows.map(r => [r.hotel_id, r]));

        const result = new Map<string, { hotelId: string; hotelName: string | null; amenities: string[] }>();

        // Seed with what we already have
        for (const row of rows) {
            const existing = Array.isArray(row.amenities) ? row.amenities as string[] : [];
            result.set(row.hotel_id, { hotelId: row.hotel_id, hotelName: row.name, amenities: existing });
        }

        // 2. Split hotels into those needing enrichment
        const hasSlugs:      Array<{ hotel_id: string; slug: string }> = [];
        const needsHidLookup: string[] = [];

        for (const id of hotelIds) {
            const row = dbMap.get(id);
            const amenities = row ? (Array.isArray(row.amenities) ? row.amenities as string[] : []) : [];
            if (amenities.length) continue; // already cached
            if (row?.ratehawk_hid) {
                hasSlugs.push({ hotel_id: id, slug: row.ratehawk_hid });
            } else {
                needsHidLookup.push(id);
            }
        }

        const dbUpdates: Array<{ hotel_id: string; amenities: string[]; slug?: string }> = [];

        // 3. Batch call for hotels with known slugs
        if (hasSlugs.length) {
            const slugs    = hasSlugs.map(h => h.slug);
            const slugMap  = await fetchEtgBySlugs(slugs);
            const slugById = new Map(hasSlugs.map(h => [h.slug, h.hotel_id]));
            for (const [slug, amenities] of slugMap) {
                const hotelId = slugById.get(slug);
                if (!hotelId) continue;
                result.set(hotelId, { hotelId, hotelName: dbMap.get(hotelId)?.name ?? null, amenities });
                dbUpdates.push({ hotel_id: hotelId, amenities });
            }
        }

        // 4. Individual hid calls for hotels with no slug yet (capped at 25 to respect rate limit)
        const toFetch = needsHidLookup.slice(0, 25);
        await Promise.all(toFetch.map(async id => {
            const hid = parseInt(id, 10);
            if (isNaN(hid)) return;
            const data = await fetchEtgByHid(hid);
            if (!data) return;
            result.set(id, { hotelId: id, hotelName: dbMap.get(id)?.name ?? null, amenities: data.amenities });
            dbUpdates.push({ hotel_id: id, amenities: data.amenities, slug: data.id || undefined });
        }));

        // 5. Persist amenities (and slug if resolved) back to hotel_content
        if (dbUpdates.length) {
            await Promise.allSettled(dbUpdates.map(u =>
                prisma.hotel_content.upsert({
                    where:  { hotel_id: u.hotel_id },
                    create: {
                        hotel_id:     u.hotel_id,
                        amenities:    u.amenities,
                        ratehawk_hid: u.slug ?? null,
                        images:       [],
                        content_source: 'etg',
                        fetched_at:   new Date(),
                    },
                    update: {
                        amenities:    u.amenities,
                        fetched_at:   new Date(),
                        ...(u.slug ? { ratehawk_hid: u.slug } : {}),
                    },
                })
            ));
        }

        // 6. Return all requested hotels (missing from DB get empty amenities)
        return hotelIds.map(id => {
            const r = result.get(id);
            return {
                hotelId:   id,
                hotelName: r?.hotelName ?? null,
                amenities: r?.amenities ?? [],
            };
        });
    }

    // ── Property detail ───────────────────────────────────────────────────────

    async getProperty(hotelId: string, stay: { checkIn: string; checkOut: string; adults?: number; children?: number }) {
        const [content, reviews, reviewItems, tgxResult] = await Promise.all([
            this.repo.findHotelContent(hotelId),
            this.repo.findHotelReviews(hotelId),
            this.repo.findHotelReviewItems(hotelId, 20),
            searchHotels({
                hotelCode:         hotelId,
                checkin:           stay.checkIn,
                checkout:          stay.checkOut,
                adults:            stay.adults ?? 2,
                children:          stay.children ?? 0,
                currency:          'USD',
                guest_nationality: 'US',
            }).catch(() => null),
        ]);
        if (!content) throw new AppError(404, 'Property not found', 'NOT_FOUND');

        const rawTypes = tgxResult?.data?.[0]?.roomTypes ?? [];
        let rooms = groupByRoomName(rawTypes);

        const etg = await withTimeout(ensureEtgContent(hotelId, content), 8_000);
        if (etg) {
            rooms = rooms.map((room) => ({ ...room, content: buildRoomContent(room.name, etg) }));
        }

        // The property response is client-facing: drop the raw ETG blobs and the
        // internal bookkeeping columns `findHotelContent` returns. The FE reads
        // only the plain hotel facts plus the three derived fields below.
        const {
            room_groups, amenity_groups, metapolicy_struct, metapolicy_extra_info,
            important_information, ratehawk_hid, content_source, last_attempt_at,
            ...publicContent
        } = content;
        void room_groups; void amenity_groups; void metapolicy_struct; void metapolicy_extra_info;
        void important_information; void ratehawk_hid; void content_source; void last_attempt_at;

        const outContent = etg
            ? {
                  ...publicContent,
                  amenityGroups:      etg.amenityGroups,
                  roomPolicySections: buildPolicySections(etg.metapolicy),
                  additionalInfo:     buildAdditionalInfo(
                      etg.importantInformation,
                      etg.metapolicy,
                      etg.metapolicyExtraInfo,
                  ),
              }
            : publicContent;

        return { content: outContent, reviews, reviewItems, rooms };
    }

    // ── Pre-book (validate + hold) ────────────────────────────────────────────

    async preBook(params: {
        optionRefId: string;
        checkIn:     string;
        checkOut:    string;
        adults:      number;
        children?:   number;
        rooms?:      number;
        occupancies?: any[];
        hotelId:     string;
        rateKey:     string;
        currency?:   string;
    }) {
        const result = await quoteTgx(params.rateKey);
        return result;
    }

    // ── Get quote / booking price ─────────────────────────────────────────────

    async createPayment(params: {
        userId:      string;
        hotelId:     string;
        optionRefId: string;
        rateKey:     string;
        totalPrice:  number;
        currency:    string;
        checkIn:     string;
        checkOut:    string;
        guestName:   string;
        guestEmail:  string;
        details:     any;
    }) {
        const lockKey = `hotel-book-lock:${params.userId}:${params.hotelId}:${params.checkIn}`;
        const locked  = await redis.set(lockKey, '1', 'EX', 300, 'NX');
        if (!locked) throw new AppError(409, 'A booking for this property is already in progress.', 'BOOKING_IN_PROGRESS');

        try {
            const zeroDecimal = ['jpy', 'krw', 'clp', 'pyg', 'ugx', 'vnd'];
            const stripeAmount = zeroDecimal.includes(params.currency.toLowerCase())
                ? Math.round(params.totalPrice)
                : Math.round(params.totalPrice * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount:   stripeAmount,
                currency: params.currency.toLowerCase(),
                capture_method: 'manual',
                metadata: {
                    userId:    params.userId,
                    hotelId:   params.hotelId,
                    rateKey:   params.rateKey,
                    checkIn:   params.checkIn,
                    checkOut:  params.checkOut,
                    guestName: params.guestName,
                    type:      'hotel',
                },
            });

            return {
                clientSecret:    paymentIntent.client_secret!,
                paymentIntentId: paymentIntent.id,
            };
        } finally {
            await redis.del(lockKey).catch(() => {});
        }
    }

    // ── Confirm booking ───────────────────────────────────────────────────────

    async confirmBooking(params: {
        paymentIntentId: string;
        userId:          string;
        optionRefId:     string;
        rateKey:         string;
        guestName:       string;
        guestEmail:      string;
        guestPhone?:     string;
        checkIn:         string;
        checkOut:        string;
        hotelId:         string;
        currency?:       string;
        occupancies?:    any[];
    }) {
        const pi = await stripe.paymentIntents.retrieve(params.paymentIntentId);
        if (pi.metadata.userId !== params.userId) throw new AppError(403, 'Payment mismatch', 'FORBIDDEN');
        if (pi.status !== 'requires_capture') throw new AppError(402, 'Payment not authorized', 'PAYMENT_REQUIRED');

        const nameParts = params.guestName.split(' ');
        const bookingResult = await bookTgx({
            quoteToken:      params.optionRefId,
            clientReference: `CG-${params.userId}-${Date.now()}`,
            holder: {
                firstName: nameParts[0] ?? params.guestName,
                lastName:  (nameParts.slice(1).join(' ') || nameParts[0]) ?? '',
                email:     params.guestEmail,
            },
            rooms: (params.occupancies ?? [{ occupancyRefId: 1, paxes: [{ name: nameParts[0] ?? '', surname: nameParts[1] ?? '', age: 30 }] }]),
        } as any);

        await stripe.paymentIntents.capture(params.paymentIntentId);

        return {
            bookingRef: (bookingResult as any).clientRef ?? (bookingResult as any).supplierRef,
            status:     bookingResult.status,
            details:    bookingResult,
        };
    }

    // ── Cancel booking ────────────────────────────────────────────────────────

    async cancelBooking(params: {
        bookingRef: string;
        userId:     string;
        paymentIntentId?: string;
    }) {
        const cancelled = await cancelTgx({ clientReference: params.bookingRef });

        if (params.paymentIntentId) {
            try {
                const pi = await stripe.paymentIntents.retrieve(params.paymentIntentId);
                if (pi.status === 'requires_capture') {
                    await stripe.paymentIntents.cancel(params.paymentIntentId, { cancellation_reason: 'requested_by_customer' });
                } else if (pi.status === 'succeeded') {
                    await stripe.refunds.create({
                        payment_intent: params.paymentIntentId,
                        reason:         'requested_by_customer',
                    }, { idempotencyKey: `hotel-refund-${params.bookingRef}` });
                }
            } catch (stripeErr: any) {
                console.error('[hotels.cancelBooking] Stripe refund failed:', stripeErr.message);
            }
        }

        return { status: 'cancelled', cancelled };
    }

    // ── Deals ─────────────────────────────────────────────────────────────────

    async getDeals(limit = 12) {
        return this.repo.getHotelDeals(limit);
    }
}
