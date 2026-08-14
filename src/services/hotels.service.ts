import { HotelsRepository } from '@/repositories/hotels.repository';
import { runTgxSearch as searchHotels } from '@/lib/hotels/search';
import { quoteTgx, bookTgx, cancelTgx, fetchAmenitiesByDestination } from '@/lib/hotels/travelgatex';
import { otvCodeToLabel } from '@/lib/hotels/amenityCodes';
import { stripe } from '@/lib/stripe';
import { AppError } from '@/middleware/error.middleware';
import { prisma } from '@/lib/prisma';
import { applyMarkup, toStripeAmount, HOTEL_MARKUP, BUNDLE_MARKUP } from '@/lib/pricing';
import { createHash } from 'crypto';

// ─── TGX prebook helpers ─────────────────────────────────────────────────────

function parseTgxOptionToken(token: string): { hotelCode: string | null; checkIn: string | null; checkOut: string | null; nationality: string } {
    const segs: Record<string, string> = {};
    const separator = token.includes('!~|') ? '!~|' : '[';
    for (const seg of token.split(separator)) {
        if (seg.length > 1) segs[seg[0]] = seg.slice(1);
    }
    const parseYYMMDD = (v?: string): string | null => {
        if (!v || v.length !== 6) return null;
        return `20${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4, 6)}`;
    };
    return { hotelCode: segs['d'] || null, checkIn: parseYYMMDD(segs['b']), checkOut: parseYYMMDD(segs['c']), nationality: segs['h'] || 'US' };
}

function roomNamesMatch(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const na = normalize(a); const nb = normalize(b);
    if (!na || !nb) return false;
    if (na === nb || na.includes(nb) || nb.includes(na)) return true;
    const stopWords = new Set(['room', 'type', 'bed', 'with', 'and', 'the', 'for']);
    const wordsA = na.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const wordsB = new Set(nb.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)));
    return wordsA.filter(w => wordsB.has(w)).length >= 2;
}

function normalizeTgxCancelPolicy(tgxPolicy: any): object {
    if (!tgxPolicy) return {};
    const penalties: any[] = tgxPolicy.cancelPenalties || [];
    const refundable: boolean = tgxPolicy.refundable ?? false;
    const cancelPolicyInfos: object[] = [];
    if (refundable && penalties.length > 0) {
        cancelPolicyInfos.push({ cancelTime: penalties[0].deadline, amount: 0, currency: penalties[0].currency || 'USD', type: 'AMOUNT' });
    }
    for (const p of penalties) {
        cancelPolicyInfos.push({ cancelTime: p.deadline, amount: p.value ?? 0, currency: p.currency || 'USD', type: p.penaltyType || 'AMOUNT' });
    }
    return { refundableTag: refundable ? 'RFN' : 'NRFN', cancelPolicyInfos };
}

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

// ─── Google Places rating enrichment ─────────────────────────────────────────
// Fetches guest rating + review count from Google Places and caches it in
// hotel_content so we only pay for one API call per hotel per 30 days.

const GOOGLE_ENRICH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function enrichHotelRating(content: {
    hotel_id: string;
    name: string | null;
    lat: unknown;
    lng: unknown;
    google_enriched_at: Date | null;
}): Promise<{ rating: number; reviews_count: number } | null> {
    // Skip if enriched recently (TTL guard)
    if (content.google_enriched_at &&
        Date.now() - content.google_enriched_at.getTime() < GOOGLE_ENRICH_TTL_MS) {
        return null;
    }

    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key || !content.name) return null;

    try {
        const lat  = Number(content.lat);
        const lng  = Number(content.lng);
        const bias = lat && lng ? `&locationbias=point:${lat},${lng}` : '';
        const url  = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
            `?input=${encodeURIComponent(content.name)}&inputtype=textquery${bias}` +
            `&fields=place_id,rating,user_ratings_total&key=${key}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        const json = await res.json() as any;

        const candidate = json?.candidates?.[0];
        if (!candidate?.rating) return null;

        // Convert Google 1-5 scale → 0-10 to match our existing rating convention
        const rating        = Math.round(candidate.rating * 2 * 10) / 10;
        const reviews_count = candidate.user_ratings_total ?? 0;
        const placeId       = candidate.place_id ?? null;

        // Persist — one charge, reused for 30 days
        await prisma.hotel_content.update({
            where: { hotel_id: content.hotel_id },
            data: {
                review_rating:      rating,
                review_count:       reviews_count,
                google_place_id:    placeId,
                google_enriched_at: new Date(),
            },
        });

        return { rating, reviews_count };
    } catch (e) {
        console.warn('[enrichHotelRating] Google Places failed:', e instanceof Error ? e.message : e);
        return null;
    }
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

    async getProperty(hotelId: string, dates?: { checkIn?: string; checkOut?: string; adults?: number; children?: number }) {
        const [content, reviews, reviewItems] = await Promise.all([
            this.repo.findHotelContent(hotelId),
            this.repo.findHotelReviews(hotelId),
            this.repo.findHotelReviewItems(hotelId, 20),
        ]);
        if (!content) throw new AppError(404, 'Property not found', 'NOT_FOUND');

        // ── Rating enrichment from Google Places (cached in hotel_content) ──────
        let effectiveReviews: typeof reviews = reviews;
        if (!effectiveReviews) {
            const c = content as any;
            if (c.review_rating !== null && c.review_rating !== undefined) {
                // Already cached from a previous Google fetch — use it directly
                effectiveReviews = {
                    hotel_id:      hotelId,
                    rating:        c.review_rating,
                    reviews_count: c.review_count ?? 0,
                    synced_at:     c.google_enriched_at ?? new Date(),
                } as any;
            } else {
                // First time: call Google Places, save to DB so we're never charged twice
                const enriched = await enrichHotelRating(content as any);
                if (enriched) {
                    effectiveReviews = {
                        hotel_id:      hotelId,
                        rating:        enriched.rating,
                        reviews_count: enriched.reviews_count,
                        synced_at:     new Date(),
                    } as any;
                }
            }
        }

        let rooms: any[] = [];
        if (dates?.checkIn && dates?.checkOut && (content as any).hotel_id) {
            try {
                const tgxResult = await searchHotels({
                    hotelCode: (content as any).hotel_id,
                    checkin:   dates.checkIn,
                    checkout:  dates.checkOut,
                    adults:    dates.adults ?? 2,
                    children:  dates.children ?? 0,
                });
                const rawRooms: any[] = tgxResult.data?.[0]?.roomTypes ?? [];
                // Deduplicate: keep cheapest offer per (name, refundable, boardCode) bucket
                const seen = new Map<string, any>();
                for (const r of rawRooms) {
                    const key = `${r.roomName}|${r.refundable}|${r.boardCode}`;
                    if (!seen.has(key) || r.price < seen.get(key).price) {
                        seen.set(key, r);
                    }
                }
                rooms = Array.from(seen.values()).map((r: any) => ({
                    id:            r.offerId,
                    offerId:       r.offerId,
                    name:          r.roomName,
                    price:         r.price,
                    currency:      r.currency,
                    refundableTag: r.refundable ? 'RFN' : 'NRFN',
                    boardType:     r.boardCode,
                }));
            } catch (err) {
                console.warn('[property] TGX room fetch failed:', err instanceof Error ? err.message : err);
            }
        }

        return { content, reviews: effectiveReviews, reviewItems, rooms };
    }

    // ── Pre-book (validate + quote) ───────────────────────────────────────────

    async preBook(params: {
        offerId:   string;
        currency?: string;
        roomName?: string;
        adults?:   number;
        children?: number;
    }) {
        if (!params.offerId?.startsWith('TGX:')) {
            throw new AppError(400, 'This hotel is not available for instant online booking.', 'INVALID_OFFER');
        }

        const staleToken = params.offerId.slice(4);
        const adults   = params.adults   ?? 2;
        const children = params.children ?? 0;
        const currency = params.currency || 'USD';

        const { hotelCode, checkIn, checkOut, nationality } = parseTgxOptionToken(staleToken);
        if (!hotelCode || !checkIn || !checkOut) {
            throw new AppError(400, 'Invalid TGX offer ID — could not decode hotel details', 'INVALID_OFFER');
        }

        console.log(`[prebook/tgx] Fresh search: hotel=${hotelCode} ${checkIn}→${checkOut} adults=${adults}`);
        const freshResult = await searchHotels({
            hotelCode,
            checkin:  checkIn,
            checkout: checkOut,
            adults,
            children,
            currency,
            guest_nationality: nationality,
        });

        const freshRooms: any[] = freshResult?.data?.[0]?.roomTypes || [];
        if (!freshRooms.length) {
            throw new AppError(409, 'Room is no longer available for the selected dates', 'UNAVAILABLE');
        }

        const originalRoomName = params.roomName || '';
        const matchedRooms = originalRoomName
            ? freshRooms.filter(r => roomNamesMatch(r.roomName || r.roomType || '', originalRoomName))
            : [];
        const otherRooms = originalRoomName
            ? freshRooms.filter(r => !roomNamesMatch(r.roomName || r.roomType || '', originalRoomName))
            : freshRooms;
        const candidates = [...matchedRooms, ...otherRooms].slice(0, 5);

        if (!candidates.length) {
            throw new AppError(409, 'Room is no longer available for the selected dates', 'UNAVAILABLE');
        }

        // OTV needs a moment to propagate the freshly-searched option into its valuation cache.
        await new Promise(resolve => setTimeout(resolve, 3000));

        let optionQuote: any = null;
        let quotedToken = candidates[0]?.offerId?.slice(4) ?? staleToken;
        let successfulRoom = candidates[0];

        for (const room of candidates) {
            const rOfferId: string = room?.offerId || '';
            if (!rOfferId.startsWith('TGX:')) continue;
            const rOptionId    = rOfferId.slice(4);
            const rTgxId       = room?.rates?.[0]?._tgx?.id    || '';
            const rNativeToken = room?.rates?.[0]?._tgx?.token  || '';
            const tokensToTry  = [...new Set([rOptionId, rTgxId, rNativeToken].filter(Boolean))];

            for (const tok of tokensToTry) {
                console.log('[prebook/tgx] Quoting with token:', tok.substring(0, 80));
                try {
                    const q = await quoteTgx(tok);
                    optionQuote    = q;
                    quotedToken    = tok;
                    successfulRoom = room;
                    break;
                } catch (e: any) {
                    console.warn('[prebook/tgx] Quote failed:', tok.substring(0, 40), '—', e.message?.substring(0, 100));
                }
            }
            if (optionQuote) break;
        }

        if (!optionQuote) {
            throw new AppError(409, 'This room is currently unavailable for booking. Please try a different hotel or check back later.', 'UNAVAILABLE');
        }

        if (optionQuote.paymentType && optionQuote.paymentType !== 'MERCHANT') {
            throw new AppError(409, 'This room is not available for online payment. Please contact support.', 'NON_MERCHANT');
        }

        const bookToken       = optionQuote.optionRefId || quotedToken;
        const bookedRoomName  = successfulRoom?.roomName || successfulRoom?.roomType || '';
        const roomSubstituted = originalRoomName ? !roomNamesMatch(bookedRoomName, originalRoomName) : false;

        console.log(`[prebook/tgx] Success | book token: ${bookToken.substring(0, 60)} | room: ${bookedRoomName} | price: ${optionQuote.price?.gross || optionQuote.price?.net} ${optionQuote.price?.currency}`);

        return {
            success: true,
            data: {
                prebookId:  `TGX:${bookToken}`,
                provider:   'travelgatex',
                price: {
                    subtotal: optionQuote.price?.net  || 0,
                    taxes:    (optionQuote.price?.gross || 0) - (optionQuote.price?.net || 0),
                    total:    optionQuote.price?.gross || optionQuote.price?.net || 0,
                },
                surcharges:           optionQuote.surcharges || [],
                currency:             optionQuote.price?.currency || currency,
                cancellationPolicies: normalizeTgxCancelPolicy(optionQuote.cancelPolicy),
                boardCode:            optionQuote.boardCode || '',
                rooms:                optionQuote.rooms || [],
                ...(roomSubstituted && bookedRoomName && { roomSubstituted: true, substitutedRoomName: bookedRoomName }),
            },
        };
    }

    // ── Create Stripe Payment Intent ──────────────────────────────────────────

    async createPayment(params: {
        userId:          string;
        prebookId:       string;
        amount:          number;
        currency:        string;
        holderEmail?:    string;
        propertyName?:   string;
        roomName?:       string;
        checkIn?:        string;
        checkOut?:       string;
        bundleFlightId?: string;
    }) {
        const SUPPORTED_CURRENCIES = new Set([
            'usd', 'eur', 'gbp', 'aud', 'cad', 'sgd', 'hkd', 'jpy', 'krw',
            'thb', 'php', 'myr', 'idr', 'inr', 'aed', 'nzd', 'chf', 'sek',
            'nok', 'dkk', 'brl', 'mxn', 'zar', 'try', 'pln', 'czk', 'huf',
        ]);

        const MAX_AMOUNT_BY_CURRENCY: Record<string, number> = {
            usd: 100_000,     eur: 95_000,      gbp: 80_000,
            aud: 160_000,     cad: 140_000,     sgd: 140_000,
            hkd: 800_000,     chf: 92_000,      nzd: 170_000,
            aed: 370_000,     inr: 8_500_000,   thb: 3_600_000,
            php: 5_800_000,   myr: 480_000,     brl: 510_000,
            mxn: 1_700_000,   zar: 1_900_000,   try: 3_200_000,
            pln: 410_000,     czk: 2_300_000,   huf: 37_000_000,
            sek: 1_100_000,   nok: 1_100_000,   dkk: 700_000,
            jpy: 15_000_000,  krw: 140_000_000, idr: 1_600_000_000,
        };

        const currencyLower = params.currency?.toLowerCase();
        if (!SUPPORTED_CURRENCIES.has(currencyLower)) {
            throw new AppError(400, `Unsupported currency: ${params.currency}`, 'UNSUPPORTED_CURRENCY');
        }

        const maxAmount = MAX_AMOUNT_BY_CURRENCY[currencyLower] ?? 100_000;
        if (!params.amount || params.amount <= 0 || params.amount > maxAmount) {
            throw new AppError(400, `Valid amount is required (0 – ${maxAmount.toLocaleString()} ${params.currency.toUpperCase()})`, 'INVALID_AMOUNT');
        }

        // Duplicate booking guard
        if (params.propertyName && params.checkIn && params.checkOut) {
            const dup = await prisma.bookings.findFirst({
                where: {
                    user_id:      params.userId,
                    property_name: params.propertyName,
                    status:       { in: ['confirmed', 'pending', 'completed'] },
                    check_in:     { lt: new Date(params.checkOut) },
                    check_out:    { gt: new Date(params.checkIn) },
                },
                select: { booking_id: true, check_in: true, check_out: true },
            }).catch(() => null);

            if (dup) {
                throw Object.assign(
                    new AppError(409, `You already have an active booking at ${params.propertyName} for overlapping dates.`, 'DUPLICATE_BOOKING'),
                    { existingBookingId: dup.booking_id, existingCheckIn: dup.check_in, existingCheckOut: dup.check_out }
                );
            }
        }

        // Apply platform markup
        const markupRate = params.bundleFlightId ? BUNDLE_MARKUP : HOTEL_MARKUP;
        const pricing    = applyMarkup(params.amount, markupRate);
        const stripeAmount = toStripeAmount(pricing.chargedPrice, params.currency);

        console.log(`[create-payment] Hotel pricing: original=${pricing.originalPrice} ${params.currency}, charged=${pricing.chargedPrice}, markup=${(markupRate * 100).toFixed(0)}%${params.bundleFlightId ? ' (bundle)' : ' (standalone)'}`);

        // Idempotency key — scoped to prebookId + amount + currency so a prebook
        // refresh (different amount) produces a new PI rather than a Stripe rejection.
        const prebookHash = createHash('sha256')
            .update(`${params.prebookId}:${stripeAmount}:${currencyLower}`)
            .digest('hex')
            .slice(0, 40);
        const idempotencyKey = `hotel-pi-${params.userId}-${prebookHash}`;

        const paymentIntent = await stripe.paymentIntents.create({
            amount:         stripeAmount,
            currency:       currencyLower,
            capture_method: 'manual',
            metadata: {
                prebookId:     params.prebookId.slice(0, 490),
                userId:        params.userId,
                holderEmail:   params.holderEmail || '',
                type:          params.bundleFlightId ? 'hotel_bundle' : 'hotel',
                bundleFlightId: params.bundleFlightId || '',
                originalPrice: String(pricing.originalPrice),
                markupRate:    String(markupRate),
                markupAmount:  String(pricing.markupAmount),
            },
            description: `CG: ${params.propertyName || 'Hotel'} — ${params.roomName || 'Room'}`,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        }, { idempotencyKey });

        return {
            success: true,
            data: {
                clientSecret:    paymentIntent.client_secret!,
                paymentIntentId: paymentIntent.id,
            },
        };
    }

    // ── Confirm booking ───────────────────────────────────────────────────────

    async confirmBooking(params: {
        paymentIntentId:      string;
        userId:               string;
        prebookId:            string;
        holder:               { firstName: string; lastName: string; email: string };
        guests?:              Array<{ firstName: string; lastName: string; age?: number }>;
        propertyName?:        string;
        propertyImage?:       string;
        roomName?:            string;
        checkIn:              string;
        checkOut:             string;
        adults?:              number;
        children?:            number;
        currency?:            string;
        specialRequests?:     string;
        voucherCode?:         string;
        discountAmount?:      number;
        cancellationPolicies?: any;
        quotedPrice?:         number;
    }) {
        const pi = await stripe.paymentIntents.retrieve(params.paymentIntentId);
        if (pi.metadata.userId !== params.userId) throw new AppError(403, 'Payment does not belong to this user', 'FORBIDDEN');
        if (pi.status !== 'requires_capture') throw new AppError(402, `Payment not authorized (status: ${pi.status})`, 'PAYMENT_REQUIRED');

        // Idempotency: if booking already exists for this PI, return it
        const existing = await prisma.bookings.findFirst({
            where: { payment_intent_id: params.paymentIntentId },
            select: { booking_id: true, status: true, total_price: true, currency: true },
        }).catch(() => null);
        if (existing) {
            console.log(`[confirm] Idempotent return for PI ${params.paymentIntentId}: ${existing.booking_id}`);
            return { success: true, data: { bookingId: existing.booking_id, status: existing.status, policyType: 'standard', policySummary: '' } };
        }

        const quoteToken     = params.prebookId.startsWith('TGX:') ? params.prebookId.slice(4) : params.prebookId;
        const adults         = params.adults   ?? 2;
        const children       = params.children ?? 0;
        const currency       = params.currency || 'USD';
        const guests         = params.guests   || [];
        const clientReference = `FORHU-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

        const adultPaxes = Array(adults).fill(null).map((_, i) => ({
            name: guests[i]?.firstName || params.holder.firstName,
            surname: guests[i]?.lastName || params.holder.lastName,
            age: 30,
        }));
        const childPaxes = Array(children).fill(null).map((_, i) => ({
            name: guests[adults + i]?.firstName || `Child${i + 1}`,
            surname: guests[adults + i]?.lastName || params.holder.lastName,
            age: (guests[adults + i] as any)?.age || 10,
        }));

        let tgxResult: any;
        try {
            tgxResult = await bookTgx({
                quoteToken,
                clientReference,
                holder: params.holder,
                rooms: [{ occupancyRefId: 1, paxes: [...adultPaxes, ...childPaxes] }],
            } as any);
        } catch (firstErr: any) {
            const msg = firstErr?.message || '';
            const isExpired = /option not found|not found in|expired|unavailable|301|wrong_field/i.test(msg);
            if (!isExpired) {
                console.error('[confirm] TGX book failed:', msg);
                return { success: false, providerConfirmed: false, error: msg };
            }
            // Retry with fresh token
            console.log('[confirm] Token expired, retrying with fresh search...');
            const { hotelCode, checkIn, checkOut, nationality } = parseTgxOptionToken(quoteToken);
            if (!hotelCode || !checkIn || !checkOut) return { success: false, error: 'Room is no longer available for these dates' };
            const freshResult = await searchHotels({ hotelCode, checkin: checkIn, checkout: checkOut, adults, children, currency, guest_nationality: nationality }).catch(() => null);
            const freshRoom = freshResult?.data?.[0]?.roomTypes?.[0];
            const freshOfferId: string = freshRoom?.offerId || '';
            if (!freshOfferId.startsWith('TGX:')) return { success: false, error: 'Room is no longer available for these dates' };
            const freshOptionId  = freshOfferId.slice(4);
            const freshNative    = freshRoom?.rates?.[0]?._tgx?.token || freshOptionId;
            await new Promise(r => setTimeout(r, 1500));
            let freshToken: string | null = null;
            for (const tok of [...new Set([freshNative, freshOptionId])]) {
                try {
                    const q = await quoteTgx(tok);
                    freshToken = q.optionRefId || tok;
                    break;
                } catch { /* try next */ }
            }
            if (!freshToken) return { success: false, error: 'Room is no longer available for these dates' };
            try {
                tgxResult = await bookTgx({ quoteToken: freshToken, clientReference, holder: params.holder, rooms: [{ occupancyRefId: 1, paxes: [...adultPaxes, ...childPaxes] }] } as any);
            } catch (retryErr: any) {
                return { success: false, error: retryErr.message || 'TravelgateX booking failed after retry' };
            }
        }

        const booking     = tgxResult;
        const clientRef   = booking?.clientRef;
        if (!clientRef) return { success: false, error: 'Booking failed — no reference returned from TravelgateX' };

        const bookingId   = clientRef;
        const supplierRef = booking?.supplierRef;
        const hotelCode   = booking?.hotelCode   ?? null;
        const rawStatus   = (booking.status || 'confirmed').toLowerCase();
        const bookingStatus = (['confirmed', 'pending'].includes(rawStatus) ? rawStatus : 'confirmed') as string;

        const tgxPrice = booking.price?.gross || booking.price?.net || 0;

        // Price change guard (>5%)
        if (params.quotedPrice && params.quotedPrice > 0 && tgxPrice > 0) {
            if (tgxPrice > params.quotedPrice * 1.05) {
                console.warn(`[confirm] Price increased beyond threshold: quoted=${params.quotedPrice} booked=${tgxPrice}`);
                return { success: false, errorCode: 'price_changed', oldPrice: params.quotedPrice, newPrice: tgxPrice };
            }
        }

        // Prefer actual Stripe PI amount over TGX supplier price
        let totalPrice: number;
        let storedCurrency = currency;
        try {
            totalPrice = pi.amount / 100;
            storedCurrency = (pi.currency || 'usd').toUpperCase();
        } catch {
            totalPrice = params.quotedPrice ?? tgxPrice;
        }

        // Cancel policy: prefer prebook policy over book-time policy
        const prebookPolicy   = params.cancellationPolicies;
        const hasPrebookPolicy = prebookPolicy != null && typeof prebookPolicy === 'object' && Object.keys(prebookPolicy).length > 0;
        const isRefundable     = hasPrebookPolicy
            ? (prebookPolicy.refundableTag === 'RFN' || prebookPolicy.refundableTag === 'REFUNDABLE')
            : booking.cancelPolicy?.refundable === true;
        const policyType       = isRefundable ? 'free_cancellation' : 'non_refundable';
        const storedCancelPolicy = hasPrebookPolicy ? prebookPolicy : (booking.cancelPolicy ? {
            refundableTag: isRefundable ? 'RFN' : 'NRFN',
            cancelPolicyInfos: (booking.cancelPolicy.cancelPenalties || []).map((p: any) => ({
                cancelTime: p.deadline, amount: p.value ?? 0, currency: p.currency || storedCurrency, type: p.penaltyType || 'AMOUNT',
            })),
        } : null);

        // Capture Stripe payment
        await stripe.paymentIntents.capture(params.paymentIntentId);

        // Save booking to DB (non-fatal — provider already confirmed)
        const providerConfirmed = true;
        try {
            await prisma.bookings.create({
                data: {
                    booking_id:        bookingId,
                    user_id:           params.userId,
                    property_name:     params.propertyName || '',
                    property_image:    params.propertyImage ?? null,
                    room_name:         params.roomName || '',
                    check_in:          new Date(params.checkIn),
                    check_out:         new Date(params.checkOut),
                    guests_adults:     adults,
                    guests_children:   children,
                    total_price:       totalPrice,
                    currency:          storedCurrency,
                    holder_first_name: params.holder.firstName,
                    holder_last_name:  params.holder.lastName,
                    holder_email:      params.holder.email,
                    status:            bookingStatus,
                    special_requests:  params.specialRequests ?? null,
                    voucher_code:      params.voucherCode ?? null,
                    discount_amount:   params.discountAmount ?? 0,
                    policy_type:       policyType,
                    cancellation_policy: storedCancelPolicy ? storedCancelPolicy : undefined,
                    provider:          'travelgatex',
                    provider_metadata: { supplierRef, hotelCode, clientReference },
                    payment_intent_id: params.paymentIntentId,
                    supplier_cost:     tgxPrice,
                    charged_price:     totalPrice,
                },
            });

            // Update PI metadata with bookingId
            stripe.paymentIntents.update(params.paymentIntentId, { metadata: { bookingId } }).catch(() => {});
        } catch (dbErr: any) {
            console.error('[confirm] CRITICAL: DB save failed after TGX confirm:', dbErr.message);
            return { success: false, providerConfirmed, error: dbErr.message, data: { bookingId, status: bookingStatus, policyType, policySummary: '' } };
        }

        console.log(JSON.stringify({ _event: 'tgx_confirmed', bookingId, supplierRef, userId: params.userId, email: params.holder.email, checkIn: params.checkIn, checkOut: params.checkOut, timestamp: new Date().toISOString() }));

        return {
            success: true,
            data: {
                bookingId,
                status:       bookingStatus,
                policyType,
                policySummary: isRefundable ? 'Refundable rate' : 'Non-refundable rate',
                totalPrice,
                currency:     storedCurrency,
            },
        };
    }

    // ── Cancel booking ────────────────────────────────────────────────────────

    async cancelBooking(params: {
        bookingRef: string;
        userId:     string;
        paymentIntentId?: string;
    }) {
        const { bookingRef, userId } = params;

        // 1. Ownership check
        const booking = await prisma.bookings.findFirst({ where: { booking_id: bookingRef } });
        if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
        if (booking.user_id !== userId) throw new AppError(403, 'Not authorized to cancel this booking', 'FORBIDDEN');

        // 2. Resolve payment_intent_id — from params, then DB, then Stripe search
        let paymentIntentId = params.paymentIntentId || booking.payment_intent_id || null;
        if (!paymentIntentId) {
            try {
                const sr = await stripe.paymentIntents.search({
                    query: `metadata['bookingId']:'${bookingRef}'`,
                    limit: 1,
                });
                if (sr.data.length > 0) {
                    paymentIntentId = sr.data[0].id;
                    await prisma.bookings.update({ where: { booking_id: bookingRef }, data: { payment_intent_id: paymentIntentId } });
                }
            } catch { /* non-fatal */ }
        }

        // 3. TGX cancellation (skip on refund-failed retry to avoid duplicate cancel)
        const isRefundRetry = booking.status === 'cancelled_refund_failed';
        if (!isRefundRetry) {
            const meta = booking.provider_metadata as any;
            const cancelHotelCode: string | undefined = meta?.hotelCode ||
                (/^\d+$/.test(booking.property_name) ? booking.property_name : undefined);
            try {
                await cancelTgx({
                    clientReference:   bookingRef,
                    supplierReference: meta?.supplierRef,
                    hotelCode:         cancelHotelCode,
                });
            } catch (tgxErr: any) {
                console.warn('[hotels.cancelBooking] TGX cancel failed (proceeding):', tgxErr.message?.slice(0, 200));
            }
        }

        // 4. Stripe refund / void
        let stripeRefundId: string | undefined;
        let stripeError: string | undefined;

        if (paymentIntentId) {
            try {
                const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
                if (pi.status === 'requires_capture') {
                    await stripe.paymentIntents.cancel(paymentIntentId, { cancellation_reason: 'requested_by_customer' });
                    stripeRefundId = paymentIntentId; // void, not a refund ID — use PI id as marker
                } else if (pi.status === 'succeeded') {
                    const refund = await stripe.refunds.create({
                        payment_intent: paymentIntentId,
                        amount:         pi.amount,
                        reason:         'requested_by_customer',
                        metadata:       { bookingId: bookingRef, type: 'hotel_cancellation' },
                    }, { idempotencyKey: `hotel-refund-${bookingRef}` });
                    if (refund.status === 'failed') throw new Error(`Stripe refund created but failed: ${refund.id}`);
                    stripeRefundId = refund.id;
                }
            } catch (stripeErr: any) {
                stripeError = stripeErr.message;
                console.error('[hotels.cancelBooking] Stripe refund failed:', stripeError);
            }
        }

        // 5. Update booking status in DB
        const finalStatus = paymentIntentId
            ? (stripeRefundId ? 'cancelled_refunded' : (stripeError ? 'cancelled_refund_failed' : 'cancelled'))
            : 'cancelled';
        await prisma.bookings.update({
            where: { booking_id: bookingRef },
            data:  { status: finalStatus, updated_at: new Date() },
        });

        return {
            success: true,
            data: {
                bookingId: bookingRef,
                status:    finalStatus,
                message:   stripeRefundId
                    ? 'Booking cancelled and refund processed.'
                    : stripeError
                        ? `Booking cancelled. Refund failed: ${stripeError}`
                        : 'Booking cancelled. Non-refundable.',
            },
        };
    }

    // ── Deals ─────────────────────────────────────────────────────────────────

    async getDeals(limit = 12) {
        return this.repo.getHotelDeals(limit);
    }
}
