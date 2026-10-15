import { HotelsRepository } from '@/repositories/hotels.repository';
import { hotelCountry } from '@/lib/geo/territories';
import { fetchAmenitiesByDestination } from '@/lib/hotels/travelgatex';
import { getHotelProvider, getHotelProviderById, isKnownProviderId } from '@/lib/hotels/providers/factory';
import { toPrebookPolicyWire, toStoredPolicyWire } from '@/lib/hotels/providers/cancellationPolicy';
import type {
    BookGuest, HotelContent as ProviderHotelContent, HotelProvider, PrebookResult, ProviderBooking,
} from '@/lib/hotels/providers/types';
import { toAppError } from '@/services/hotelProviderErrors';
import { HotelBookingLifecycleService } from '@/services/hotelBookingLifecycle.service';
import { projectLegacyStatus, type LifecycleActor } from '@/lib/hotels/lifecycle/stateMachine';
import type { LifecycleGuest } from '@/repositories/hotelBookingLifecycle.repository';
import { groupByRoomName } from '@/lib/hotels/property';
import { ensureEtgContent } from '@/lib/hotels/etgContent';
import { buildRoomContent, buildPolicySections, buildAdditionalInfo } from '@/lib/hotels/roomContent';
import { otvCodeToLabel, normalizeAmenityList } from '@/lib/hotels/amenityCodes';
import { orderRoomPhotosByDistinctiveness } from '@/lib/hotels/roomMatch';
import { stripe } from '@/lib/stripe';
import { AppError } from '@/middleware/error.middleware';
import { prisma } from '@/lib/prisma';
import { toStripeAmount, fromStripeAmount, hotelServiceFee, PREBOOK_QUOTE_TTL_MS } from '@/lib/pricing';
import { resolveHotelChargeBase } from '@/lib/payments/chargeBase';
import { nightsBetween } from '@/lib/hotels/nights';
import { makeStrictConverter } from '@/lib/payments/convertStrict';
import { capAtDisplayedTotal } from '@/lib/payments/chargeBase';
import { snapshotFromPolicy } from '@/lib/policies/snapshotFromPolicy';
import { sendTransactionalEmail } from '@/lib/email/send';
import { buildHotelConfirmationHtml } from '@/lib/email/templates';
import { policyEmailText } from '@/lib/email/policyText';
import { bookingReferenceFromBytes, isBookingReference, mintBookingReference } from '@/lib/payments/bookingReference';
import { extractStripeFee, STRIPE_FEE_EXPAND } from '@/lib/payments/stripeFee';
import { canonicalBrandName } from '@/lib/brand';
import { lockFx } from '@/lib/payments/fxLock';
import { calculateCancellation } from '@/lib/policies/cancellationEngine';
import { ExchangeRatesService } from '@/services/exchange-rates.service';
import { createHash } from 'crypto';

// âââ ETG hotel/info helpers âââââââââââââââââââââââââââââââââââââââââââââââââââ

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

// âââ Google Places rating enrichment âââââââââââââââââââââââââââââââââââââââââ
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

        // Convert Google 1-5 scale â 0-10 to match our existing rating convention
        const rating        = Math.round(candidate.rating * 2 * 10) / 10;
        const reviews_count = candidate.user_ratings_total ?? 0;
        const placeId       = candidate.place_id ?? null;

        // Persist â one charge, reused for 30 days
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

/**
 * A provider's content in the shape a catalog row has, so the property response is built one way
 * whichever source the hotel came from. Only the fields the property page reads are filled.
 */
function toContentRow(c: ProviderHotelContent) {
    return {
        hotel_id:       c.hotelId,
        name:           c.name,
        address:        c.address,
        city:           c.city,
        country:        c.country,
        lat:            c.lat,
        lng:            c.lng,
        star_rating:    c.starRating,
        description:    c.description,
        images:         c.images,
        amenities:      c.amenities,
        check_in_time:  c.checkInTime,
        check_out_time: c.checkOutTime,
        room_groups: null, amenity_groups: null, metapolicy_struct: null, metapolicy_extra_info: null,
        important_information: null, ratehawk_hid: null, content_source: 'provider', last_attempt_at: null,
    } as any;
}

export class HotelsService {
    private repo = new HotelsRepository();

    /** Injected in tests; otherwise whichever provider the environment selects, resolved on use. */
    constructor(
        private readonly injectedProvider?: HotelProvider,
        private readonly lifecycle: HotelBookingLifecycleService = new HotelBookingLifecycleService(),
    ) {}

    private get provider(): HotelProvider {
        return this.injectedProvider ?? getHotelProvider();
    }

    /** The provider a booking was made through — which may not be the one configured now. */
    private providerFor(recorded: unknown): HotelProvider {
        if (this.injectedProvider) return this.injectedProvider;
        return isKnownProviderId(recorded) ? getHotelProviderById(recorded) : getHotelProvider();
    }

    /** The purchase options a confirmation needs that are not people. Undefined fields are left out. */
    private lifecycleDraft(p: {
        adults?: number; children?: number; propertyImage?: string; specialRequests?: string;
        voucherCode?: string; discountAmount?: number; cancellationPolicies?: unknown;
        quotedPrice?: number; board?: string;
    }): Record<string, unknown> {
        return Object.fromEntries(Object.entries({
            adults: p.adults, children: p.children, propertyImage: p.propertyImage,
            specialRequests: p.specialRequests, voucherCode: p.voucherCode,
            discountAmount: p.discountAmount, cancellationPolicies: p.cancellationPolicies,
            quotedPrice: p.quotedPrice, board: p.board,
        }).filter(([, v]) => v !== undefined));
    }

    /**
     * The holder, then the guests in the order the supplier was given them: the first `adults`
     * are adults and the rest children, which is how `confirmBooking` has always read them.
     */
    private lifecycleGuests(
        holder: { firstName: string; lastName: string; email: string },
        guests: Array<{ firstName: string; lastName: string; age?: number }> | undefined,
        adults: number,
    ): LifecycleGuest[] {
        const out: LifecycleGuest[] = [{ kind: 'holder', firstName: holder.firstName, lastName: holder.lastName, email: holder.email }];
        (guests ?? []).forEach((g, i) => out.push({
            kind: i < adults ? 'adult' : 'child', firstName: g.firstName, lastName: g.lastName, age: g.age ?? null,
        }));
        return out;
    }

    // ── Catalog counts ─────────────────────────────────────────

    /** Catalogued hotel count for a city. Zero is a legitimate answer, not an error. */
    async countByCity(cityName: string, countryCode?: string): Promise<number> {
        if (!cityName.trim()) return 0;
        return this.repo.countHotelContentByCity(cityName, countryCode);
    }

    // ââ Search ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
        const results = await this.provider.searchHotels({
            cityName:    params.destination,
            checkin:     params.checkIn,
            checkout:    params.checkOut,
            adults:      params.adults,
            children:    params.children,
            countryCode: params.countryCode,
            currency:    params.currency,
            rooms:       params.rooms,
        });
        await this.repo.recordSearchDemand(
            params.destination.toLowerCase().replace(/\s+/g, '-'),
            params.countryCode ?? 'XX',
        ).catch(() => {});
        return results;
    }

    // ââ Amenities âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

    // ââ Property detail âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

    async getProperty(hotelId: string, stay: { checkIn: string; checkOut: string; adults?: number; children?: number }) {
        const provider = this.provider;
        const providerOwnsContent = provider.capabilities.providesContent;

        const [dbContent, reviews, reviewItems, rawTypesOrNull] = await Promise.all([
            providerOwnsContent ? Promise.resolve(null) : this.repo.findHotelContent(hotelId),
            this.repo.findHotelReviews(hotelId),
            this.repo.findHotelReviewItems(hotelId, 20),
            provider.getRates(hotelId, {
                checkIn:     stay.checkIn,
                checkOut:    stay.checkOut,
                adults:      stay.adults ?? 2,
                children:    stay.children ?? 0,
                currency:    'USD',
                nationality: 'US',
            }).catch(() => null),
        ]);

        const providerContent = providerOwnsContent ? await provider.getHotelDetails(hotelId) : null;
        const content = dbContent ?? (providerContent ? toContentRow(providerContent) : null);
        if (!content) throw new AppError(404, 'Property not found', 'NOT_FOUND');

        // ââ Rating enrichment from Google Places (cached in hotel_content) ââââââ
        let effectiveReviews: typeof reviews = reviews;
        // Provider content has no Google enrichment cache to read or fill.
        if (!effectiveReviews && !providerContent) {
            const c = content as any;
            if (c.review_rating !== null && c.review_rating !== undefined) {
                // Already cached from a previous Google fetch â use it directly
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

        // Per night, matching the search stream and v1. TGX quotes the whole stay and
        // every room card prints "/ night" beside the figure, so the division belongs
        // on this side of the wire — app-v2's checkout multiplies it back up by the
        // nights, so a stay total sent here is billed nights times over.
        const nights   = nightsBetween(stay.checkIn, stay.checkOut);
        const rawTypes = rawTypesOrNull ?? [];
        let rooms = groupByRoomName(rawTypes).map((room) => ({
            ...room,
            price: room.price / nights,
            rates: room.rates.map((rate) => ({ ...rate, price: rate.price / nights })),
        }));

        const etg = providerContent ? null : await withTimeout(ensureEtgContent(hotelId, content), 8_000);
        if (etg) {
            rooms = rooms.map((room) => ({ ...room, content: buildRoomContent(room.name, etg) }));

            // Neighbouring rooms often match ETG groups that share most of their photos,
            // so two cards lead with the same shots and read as identical. Lead each
            // gallery with what is unique to it; nothing is discarded.
            const ordered = orderRoomPhotosByDistinctiveness(
                rooms.map((room) => ({ roomPhotos: room.content?.gallery })),
            );
            rooms = rooms.map((room, i) => (room.content
                ? { ...room, content: { ...room.content, gallery: ordered[i].roomPhotos ?? room.content.gallery } }
                : room));
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

        const row = publicContent as any;
        const normalizedContent = {
            ...publicContent,
            // A territory's hotels arrive filed under its parent's code, so the address
            // on a Hong Kong property page read "Hong Kong, CN" (QA BG-8).
            country:   hotelCountry(row.country, row.city, row.lat, row.lng),
            // `hotel_content.amenities` mixes prettified non-English supplier strings
            // with `{ code }` objects from TGX; returned raw, a Spanish or Russian
            // label reaches an English page.
            amenities: normalizeAmenityList(row.amenities),
        };

        const outContent = etg
            ? {
                  ...normalizedContent,
                  amenityGroups:      etg.amenityGroups,
                  roomPolicySections: buildPolicySections(etg.metapolicy),
                  additionalInfo:     buildAdditionalInfo(
                      etg.importantInformation,
                      etg.metapolicy,
                      etg.metapolicyExtraInfo,
                  ),
              }
            : normalizedContent;

        return { content: outContent, reviews: effectiveReviews, reviewItems, rooms };
    }

    // ââ Pre-book (validate + quote) âââââââââââââââââââââââââââââââââââââââââââ

    async preBook(params: {
        offerId:   string;
        currency?: string;
        roomName?: string;
        adults?:   number;
        children?: number;
    }) {
        const adults   = params.adults   ?? 2;
        const children = params.children ?? 0;
        const currency = params.currency || 'USD';

        let quote: PrebookResult;
        try {
            quote = await this.provider.prebook({
                offerId: params.offerId, roomName: params.roomName, adults, children, currency,
            });
        } catch (err) {
            throw toAppError(err);
        }

        // Record what the supplier quoted. createPayment charges from this row rather than from
        // the client's payload, so the Stripe base comes from the supplier instead of the
        // browser. Failing to record must not fail the prebook: checkout rejects a prebookId it
        // has no quote for, so the worst case is the customer retrying.
        const prebookId = quote.prebookRef;
        try {
            await this.repo.savePrebookQuote({
                prebookId,
                net:       quote.price.net,
                gross:     quote.price.gross,
                currency:  quote.price.currency,
                roomName:  quote.roomName || null,
                checkIn:   quote.checkIn,
                checkOut:  quote.checkOut,
                expiresAt: new Date(Date.now() + PREBOOK_QUOTE_TTL_MS),
            });
        } catch (persistErr) {
            console.error('[prebook] Failed to persist quote — checkout will reject this prebookId:', persistErr);
        }

        // What the customer is shown, produced here rather than in the browser (see ADR-0021).
        const quotedSubtotal  = quote.price.net;
        const quotedTotal     = quote.price.gross;
        const quotedTaxes     = quote.price.gross - quote.price.net;
        const quotedCurrency  = quote.price.currency.toUpperCase();
        const displayCurrency = String(params.currency || quotedCurrency).toUpperCase();

        let display: Record<string, unknown> | undefined;
        try {
            // Rates are needed to convert the room, and — because the fee's flat part is
            // quoted in USD — whenever the display currency is not USD at all.
            const needsRates = quotedCurrency !== displayCurrency || displayCurrency !== 'USD';
            const convert = makeStrictConverter(needsRates ? await new ExchangeRatesService().getLiveRates() : null);
            const to = (n: number) => Math.round(convert(n, quotedCurrency, displayCurrency) * 100) / 100;
            const total = to(quotedTotal);
            const fee   = hotelServiceFee(total, displayCurrency, convert);
            display = {
                currency:     displayCurrency,
                subtotal:     to(quotedSubtotal),
                taxes:        to(quotedTaxes),
                total,
                serviceFee:   fee.serviceFee,
                chargedTotal: fee.chargedTotal,
                converted:    quotedCurrency !== displayCurrency,
            };
        } catch (fxErr: any) {
            // Left absent: the checkout says prices are still being confirmed rather than
            // showing a total the charge might not match.
            console.warn('[prebook] display conversion unavailable:', fxErr?.message);
        }

        return {
            success: true,
            data: {
                prebookId,
                provider: this.provider.id,
                price: {
                    subtotal: quotedSubtotal,
                    taxes:    quotedTaxes,
                    total:    quotedTotal,
                },
                ...(display ? { display } : {}),
                surcharges:           quote.surcharges,
                currency:             quote.price.currency,
                cancellationPolicies: toPrebookPolicyWire(quote.cancellation),
                boardCode:            quote.boardCode,
                rooms:                quote.rooms,
                ...(quote.roomSubstituted && quote.roomName && { roomSubstituted: true, substitutedRoomName: quote.roomName }),
            },
        };
    }

    // ââ Create Stripe Payment Intent ââââââââââââââââââââââââââââââââââââââââââ

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
        /** The total the checkout showed, service fee included. Nothing is billed above it. */
        displayedTotal?: number;
        // Optional, and additive: what the confirmation will need. When the traveller has
        // already said who is staying, the booking can be completed from the payment event
        // alone if the browser never comes back.
        holder?:               { firstName: string; lastName: string; email: string };
        guests?:               Array<{ firstName: string; lastName: string; age?: number }>;
        adults?:               number;
        children?:             number;
        propertyImage?:        string;
        specialRequests?:      string;
        voucherCode?:          string;
        discountAmount?:       number;
        cancellationPolicies?: unknown;
        quotedPrice?:          number;
        board?:                string;
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
            throw new AppError(400, `Valid amount is required (0 â ${maxAmount.toLocaleString()} ${params.currency.toUpperCase()})`, 'INVALID_AMOUNT');
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
                throw new AppError(
                    409,
                    `You already have an active booking at ${params.propertyName} for overlapping dates.`,
                    'DUPLICATE_BOOKING',
                    { existingBookingId: dup.booking_id, existingCheckIn: dup.check_in, existingCheckOut: dup.check_out },
                );
            }
        }

        // ── Establish the trusted base price ──
        //
        // `params.amount` is what the browser says it displayed: client-controlled, and
        // computed with client-side FX. Charge from the supplier quote recorded at
        // prebook instead, converting it here (ADR-0021).
        const quote = await this.repo.findPrebookQuote(params.prebookId);

        // Rates are only needed when the quote is in another currency; fetching them
        // unconditionally would make a same-currency booking fail on an FX outage.
        const needsFx = !!quote && String(quote.currency).toUpperCase() !== params.currency.toUpperCase();
        const rates   = needsFx ? await new ExchangeRatesService().getLiveRates() : null;

        const resolved = resolveHotelChargeBase(
            quote,
            params.amount,
            params.currency,
            makeStrictConverter(rates),
        );

        if (!resolved.ok) {
            console.warn(
                `[create-payment] Rejected (${resolved.code}) prebookId=${params.prebookId.slice(0, 40)} `
                + `client=${params.amount} ${params.currency.toUpperCase()}`
                + (resolved.serverPrice !== undefined ? ` server=${resolved.serverPrice}` : '')
            );
            throw new AppError(
                resolved.code === 'FX_UNAVAILABLE' ? 503 : 409,
                resolved.message,
                resolved.code,
                resolved.serverPrice !== undefined
                    ? { serverPrice: resolved.serverPrice, currency: resolved.currency }
                    : undefined,
            );
        }

        // Platform markup on the server's figure, never the client's.
        //
        // One rate, bundled or not: bundling was never a discount line, only a swap to a
        // lower rate, and the gap it spent is now an earmarked provision against
        // TravelgateX's incoming connection fee (ADR-0036).
        //
        // Through hotelServiceFee, which is also what prebook's display block uses — the fee
        // shown and the fee charged are one function of one base. The flat $0.40 of
        // ADR-0036 is charged; this used to pass zero.
        const fee = hotelServiceFee(
            resolved.base,
            params.currency,
            // The flat part is quoted in USD, so it needs rates even when the room did not.
            makeStrictConverter(params.currency.toUpperCase() === 'USD' ? null : (rates ?? await new ExchangeRatesService().getLiveRates())),
        );

        // The customer is never billed above the total they were shown, fee included.
        const shown = capAtDisplayedTotal(fee.chargedTotal, params.displayedTotal, params.currency);
        if (!shown.ok) {
            console.warn(`[create-payment] Rejected (${shown.code}) prebookId=${params.prebookId.slice(0, 40)} shown=${params.displayedTotal} server=${shown.serverPrice} ${shown.currency}`);
            throw new AppError(409, shown.message, shown.code, {
                serverPrice: shown.serverPrice,
                currency:    shown.currency,
            });
        }

        const pricing = {
            originalPrice: resolved.base,
            chargedPrice:  shown.total,
            markupAmount:  Math.round((shown.total - resolved.base) * 100) / 100,
            markupRate:    fee.markupRate,
            capped:        fee.capped,
        };
        const stripeAmount = toStripeAmount(pricing.chargedPrice, params.currency);

        console.log(`[create-payment] Hotel pricing: original=${pricing.originalPrice} ${params.currency}, charged=${pricing.chargedPrice}, markup=${(pricing.markupRate * 100).toFixed(1)}%${pricing.capped ? ' (CAPPED)' : ''}${params.bundleFlightId ? ' (bundled with a flight — no longer discounted)' : ''}`);

        // Idempotency key â scoped to prebookId + amount + currency so a prebook
        // refresh (different amount) produces a new PI rather than a Stripe rejection.
        const prebookHash = createHash('sha256')
            .update(`${params.prebookId}:${stripeAmount}:${currencyLower}`)
            .digest('hex')
            .slice(0, 40);
        const idempotencyKey = `hotel-pi-${params.userId}-${prebookHash}`;

        // Minted here rather than at confirmation, so it exists before the charge does. A
        // charge whose booking later fails still took the customer's money and still has to
        // be attributable — those are the hardest rows to trace, and giving them no reference
        // leaves exactly the wrong gap.
        //
        // Derived from the idempotency key, never random: Stripe replays a key only when the
        // parameters are identical, and this request is replayed whenever a customer steps
        // back from payment and proceeds again. A random reference made every retry a
        // "different request" under the same key — a 500, and no way to pay (QA BG-19).
        const bookingReference = bookingReferenceFromBytes(
            createHash('sha256').update(idempotencyKey).digest(),
            canonicalBrandName(process.env.BRAND_NAME ?? process.env.NEXT_PUBLIC_BRAND_NAME),
        );

        const paymentIntent = await stripe.paymentIntents.create({
            amount:         stripeAmount,
            currency:       currencyLower,
            capture_method: 'manual',
            metadata: {
                prebookId:     params.prebookId.slice(0, 490),
                // FORHU settles several products into one Stripe account and one pooled daily
                // payout, so the bank line cannot be split per product. This is what makes a
                // charge attributable to this platform from inside Stripe.
                bookingReference,
                userId:        params.userId,
                holderEmail:   params.holderEmail || '',
                type:          params.bundleFlightId ? 'hotel_bundle' : 'hotel',
                bundleFlightId: params.bundleFlightId || '',
                originalPrice: String(pricing.originalPrice),
                // The effective rate, after the flat component and the cap — the only one
                // consistent with the amounts stored beside it.
                markupRate:    String(pricing.markupRate),
                markupAmount:  String(pricing.markupAmount),
            },
            description: `CG: ${params.propertyName || 'Hotel'} â ${params.roomName || 'Room'}`,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        }, { idempotencyKey });

        // The attempt, opened beside the sale it may become. Best-effort and never fatal:
        // the charge exists either way, and a missing record is a gap, not a failed payment.
        const attempt = await this.lifecycle.open({
            reference:       bookingReference,
            userId:          params.userId,
            provider:        this.provider.id,
            prebookRef:      params.prebookId,
            paymentIntentId: paymentIntent.id,
            currency:        params.currency,
            amountMinor:     stripeAmount,
            propertyName:    params.propertyName ?? null,
            roomName:        params.roomName ?? null,
            checkIn:         params.checkIn ?? null,
            checkOut:        params.checkOut ?? null,
            draft:           this.lifecycleDraft(params),
        });
        if (attempt && params.holder) {
            await this.lifecycle.saveInputs(
                bookingReference,
                this.lifecycleDraft(params),
                this.lifecycleGuests(params.holder, params.guests, params.adults ?? 2),
            );
        }

        return {
            success: true,
            data: {
                clientSecret:    paymentIntent.client_secret!,
                paymentIntentId: paymentIntent.id,
                // What the intent is for, so the payment step renders the figure it is about
                // to confirm rather than one the browser worked out.
                chargedTotal:    pricing.chargedPrice,
                serviceFee:      pricing.markupAmount,
                currency:        params.currency.toUpperCase(),
            },
        };
    }

    // ââ Confirm booking âââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
        /** The board the rate was quoted with, from prebook. Snapshotted: it is part of
         *  what was bought, not of what the property offers today. */
        board?:               string;
    }, opts: { actor?: LifecycleActor } = {}) {
        const pi = await stripe.paymentIntents.retrieve(params.paymentIntentId);
        if (pi.metadata.userId !== params.userId) throw new AppError(403, 'Payment does not belong to this user', 'FORBIDDEN');

        // Read off the PaymentIntent, never accepted from the request body: the client must
        // not get to choose the identifier a payment is filed under. Absent only for charges
        // taken before references existed.
        const paidReference = isBookingReference(pi.metadata?.bookingReference)
            ? pi.metadata.bookingReference
            : undefined;
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

        const adults         = params.adults   ?? 2;
        const children       = params.children ?? 0;
        const currency       = params.currency || 'USD';
        const guests         = params.guests   || [];
        // The reference the supplier files the reservation under, and the one a cancellation has
        // to quote. It comes from the PaymentIntent, so the booking and the charge carry the same
        // reference; a booking taken before references existed falls back to a fresh one.
        const clientReference = paidReference
            ?? mintBookingReference(canonicalBrandName(process.env.BRAND_NAME ?? process.env.NEXT_PUBLIC_BRAND_NAME));

        const adultGuests: BookGuest[] = Array(adults).fill(null).map((_, i) => ({
            firstName: guests[i]?.firstName || params.holder.firstName,
            lastName:  guests[i]?.lastName  || params.holder.lastName,
            age:       30,
            type:      'adult' as const,
        }));
        const childGuests: BookGuest[] = Array(children).fill(null).map((_, i) => ({
            firstName: guests[adults + i]?.firstName || `Child${i + 1}`,
            lastName:  guests[adults + i]?.lastName  || params.holder.lastName,
            age:       (guests[adults + i] as any)?.age || 10,
            type:      'child' as const,
        }));

        const actor: LifecycleActor = opts.actor ?? 'browser';

        // Who this confirmation is for is recorded first, so a payment event can finish the
        // booking if this request dies; then the right to ask the supplier is claimed. Of any
        // number of callers racing for one payment — a double submit, the browser and the
        // webhook — exactly one gets it, and a supplier is never asked twice.
        let claimed = false;
        if (paidReference) {
            await this.lifecycle.saveInputs(
                paidReference,
                this.lifecycleDraft({ ...params, adults, children }),
                this.lifecycleGuests(params.holder, params.guests, adults),
            );
            const claim = await this.lifecycle.claim(paidReference, params.paymentIntentId, actor);
            if (claim.result === 'lost') {
                const answer = await this.lifecycle.answerLostClaim(claim.record);
                // Never carry on from a lost claim: someone else holds the right to book.
                return answer ?? {
                    success: false as const, pending: true, reference: paidReference,
                    error: 'Your booking is already being processed. Please check your trips shortly.',
                };
            }
            claimed = claim.result === 'claimed';
        }

        let booking: ProviderBooking;
        try {
            booking = await this.provider.book({
                prebookRef: params.prebookId,
                clientRef:  clientReference,
                holder:     params.holder,
                guests:     [...adultGuests, ...childGuests],
                stay:       { adults, children, currency },
            });
        } catch (err: any) {
            console.error('[confirm] supplier booking failed:', err?.code ?? '', err?.message);
            // What this means for the money depends on whether the supplier may have booked.
            const handled = await this.lifecycle.onBookFailure({
                err, provider: this.provider, paymentIntentId: params.paymentIntentId,
                reference: paidReference, clientReference, claimed, actor,
            });
            if (handled.kind === 'failed') return handled.response;
            // The supplier did not answer but holds the reservation; carry on as if it had.
            booking = handled.booking;
        }

        const clientRef = booking.clientRef;
        if (!clientRef) {
            return { success: false, error: `Booking failed — no reference returned from ${this.provider.displayName}` };
        }

        const bookingId     = clientRef;
        const supplierRef   = booking.supplierRef;
        const hotelCode     = booking.hotelCode ?? null;
        const rawStatus     = (booking.status || 'confirmed').toLowerCase();
        const bookingStatus = (['confirmed', 'pending'].includes(rawStatus) ? rawStatus : 'confirmed') as string;

        const tgxPrice = booking.price?.gross || booking.price?.net || 0; // supplier cost

        // Price change guard (>5%)
        if (params.quotedPrice && params.quotedPrice > 0 && tgxPrice > 0) {
            if (tgxPrice > params.quotedPrice * 1.05) {
                console.warn(`[confirm] Price increased beyond threshold: quoted=${params.quotedPrice} booked=${tgxPrice}`);
                // The supplier has already booked, so this is not a clean "no": it needs a person.
                if (paidReference && claimed) {
                    await this.lifecycle.flagPriceMoved(paidReference, params.quotedPrice, tgxPrice, actor);
                }
                return { success: false, errorCode: 'price_changed', oldPrice: params.quotedPrice, newPrice: tgxPrice };
            }
        }

        // Prefer actual Stripe PI amount over TGX supplier price
        let totalPrice: number;
        let storedCurrency = currency;
        try {
            // Not `/ 100`: KRW has no minor unit, so dividing records a ₩1,200,000 booking
            // as ₩12,000. AirangGo is Korea-locked, which makes this a primary market rather
            // than an edge case.
            totalPrice = fromStripeAmount(pi.amount, pi.currency || 'usd');
            storedCurrency = (pi.currency || 'usd').toUpperCase();
        } catch {
            totalPrice = params.quotedPrice ?? tgxPrice;
        }

        // Cancel policy: prefer prebook policy over book-time policy
        const prebookPolicy   = params.cancellationPolicies;
        const hasPrebookPolicy = prebookPolicy != null && typeof prebookPolicy === 'object' && Object.keys(prebookPolicy).length > 0;
        const isRefundable     = hasPrebookPolicy
            ? (prebookPolicy.refundableTag === 'RFN' || prebookPolicy.refundableTag === 'REFUNDABLE')
            : booking.cancellation?.refundable === true;
        const storedCancelPolicy = hasPrebookPolicy
            ? prebookPolicy
            : toStoredPolicyWire(booking.cancellation, storedCurrency);

        // The terms this booking is held to. Derived by the same function the backfill uses
        // for bookings taken before snapshots existed, so a backfilled booking and one
        // confirmed today are judged by one rule.
        const terms = snapshotFromPolicy(storedCancelPolicy, storedCurrency);
        const { policyType } = terms;

        // Capture Stripe payment.
        //
        // Expanded on the way back so the fee Stripe really took can be recorded beside the
        // booking. `STRIPE_RATE` in pricing.ts has to be an estimate — the markup is computed
        // before a charge exists — but nothing ever checked it against anything, and it
        // carried Stripe's 2.9% headline while every live charge on this account settles at
        // 4.4%. The balance transaction says the exact figure, for free, and only exists once
        // the payment is captured. See ADR-0036.
        const capture = await this.lifecycle.capture(params.paymentIntentId, bookingId, STRIPE_FEE_EXPAND);
        if (!capture.ok) {
            console.error('[confirm] CRITICAL: supplier booked but capture failed:', bookingId, capture.error);
            if (paidReference && claimed) await this.lifecycle.flagCaptureFailure(paidReference, capture.error, actor);
            return {
                success: false as const, providerConfirmed: true, needsReview: true, reference: bookingId,
                error: 'Your room is booked but the payment could not be completed. Our team has been notified — please do not pay again.',
            };
        }
        const stripeFee = extractStripeFee(capture.intent);
        if (paidReference && claimed) {
            await this.lifecycle.confirmed(paidReference, params.paymentIntentId, supplierRef, actor);
        }

        // Save booking to DB (non-fatal â provider already confirmed)
        const providerConfirmed = true;
        let bookingRow: { id: string } | null = null;
        try {
            bookingRow = await prisma.bookings.create({
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
                    provider:          booking.provider,
                    // The recorded fee rides along rather than being threaded through a
                    // second write: a booking that exists must never be jeopardised by a
                    // reporting figure, and every field of it is optional for that reason.
                    provider_metadata: { supplierRef, hotelCode, clientReference, ...stripeFee, ...(params.board ? { board: params.board } : {}) },
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

        // The rate this booking was taken at, for USD reporting (ADR-0008). Deliberately
        // after the insert and in its own try: the money has moved and the booking is
        // already recorded, so a rates outage must leave the FX columns null for a
        // backfill to resolve — never cost us the row.
        try {
            const fx = await lockFx(totalPrice, storedCurrency);
            await prisma.bookings.update({
                where: { booking_id: bookingId },
                data: {
                    usd_amount:     fx.usd_amount,
                    fx_rate:        fx.fx_rate,
                    fx_captured_at: fx.fx_captured_at,
                    fx_source:      fx.fx_source,
                    source_brand:   process.env.BRAND_NAME ?? 'CheapestGo',
                },
            });
        } catch (fxErr) {
            console.error('[confirm] FX lock failed — booking recorded unconverted:', fxErr);
        }

        // The cancellation terms as they stood when the guest agreed to them. Written
        // after the booking row so a failure here cannot cost the booking; a snapshot
        // that is missing later makes the cancellation refuse rather than over-refund,
        // which is the safe direction (ADR-0023).
        try {
            await this.repo.savePolicySnapshot({
                bookingId,
                ...terms,
                rawResponse: storedCancelPolicy ?? {},
            });
        } catch (policyErr) {
            console.error('[confirm] Policy snapshot failed — cancellation will need support:', policyErr);
        }

        // The confirmation the guest is actually owed. Fire-and-forget on purpose: the
        // booking exists and the money has moved, so a mail outage must not turn a
        // successful booking into a failed response. A send that fails leaves a row in
        // email_logs for the retry job rather than disappearing.
        void sendTransactionalEmail({
            bookingId,
            to:        params.holder.email,
            subject:   `Booking Confirmed — ${params.propertyName || 'your stay'}`,
            emailType: 'confirmation',
            html: buildHotelConfirmationHtml({
                bookingRef:      bookingId,
                bookingDbId:     bookingRow?.id ?? null,
                guestName:       `${params.holder.firstName} ${params.holder.lastName}`.trim(),
                propertyName:    params.propertyName || '',
                propertyImage:   params.propertyImage ?? null,
                roomName:        params.roomName || '',
                checkIn:         params.checkIn,
                checkOut:        params.checkOut,
                nights:          Math.max(1, Math.round((new Date(params.checkOut).getTime() - new Date(params.checkIn).getTime()) / 86_400_000)),
                adults,
                children,
                totalPrice,
                currency:        storedCurrency,
                discountAmount:  params.discountAmount ?? 0,
                policyText:      policyEmailText(terms),
                specialRequests: params.specialRequests ?? null,
            }),
        }).catch((err) => console.error('[confirm] Confirmation email failed:', err?.message));

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

    // ââ Cancel booking ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

        // 1b. What the recorded terms say this cancellation returns. Decided before
        //     anything is cancelled, so the supplier call and the refund agree on the
        //     same answer, and computed from the snapshot taken at booking time rather
        //     than from whatever the supplier quotes today (ADR-0023).
        const policy = await this.repo.findPolicySnapshot(bookingRef);
        const cancellation = calculateCancellation({
            totalPrice: Number(booking.total_price),
            currency:   booking.currency ?? 'PHP',
            checkIn:    booking.check_in ?? new Date(),
            policy,
        });

        // 2. Resolve payment_intent_id â from params, then DB, then Stripe search
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

        await this.lifecycle.recordCancelStart(bookingRef, 'browser');

        // 3. TGX cancellation (skip on refund-failed retry to avoid duplicate cancel)
        const isRefundRetry = booking.status === 'cancelled_refund_failed';
        if (!isRefundRetry) {
            const meta = booking.provider_metadata as any;
            const cancelHotelCode: string | undefined = meta?.hotelCode ||
                (/^\d+$/.test(booking.property_name) ? booking.property_name : undefined);
            try {
                await this.providerFor(booking.provider).cancelBooking({
                    clientRef:   bookingRef,
                    supplierRef: meta?.supplierRef,
                    hotelCode:   cancelHotelCode,
                });
            } catch (tgxErr: any) {
                console.warn('[hotels.cancelBooking] TGX cancel failed (proceeding):', tgxErr.message?.slice(0, 200));
            }
        }

        // 4. Stripe refund / void
        let stripeRefundId: string | undefined;
        let stripeError: string | undefined;

        // Logged before any money moves, so a crash between Stripe and the update below
        // still leaves a trace of the refund that was on its way.
        const refundLogId = paymentIntentId && cancellation.refundable && cancellation.refundAmount > 0
            ? await this.repo.openRefund({
                bookingId:       bookingRef,
                userId,
                refundType:      cancellation.refundType,
                requestedAmount: cancellation.refundAmount,
                penaltyAmount:   cancellation.penaltyAmount,
                currency:        cancellation.currency,
                reason:          cancellation.message,
            })
            : null;

        if (paymentIntentId) {
            try {
                const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
                if (pi.status === 'requires_capture') {
                    await stripe.paymentIntents.cancel(paymentIntentId, { cancellation_reason: 'requested_by_customer' });
                    stripeRefundId = paymentIntentId; // void, not a refund ID â use PI id as marker
                } else if (pi.status === 'succeeded') {
                    // How much comes back is the policy's decision, not the charge's.
                    // This used to refund pi.amount outright, which returned the full
                    // price on a non-refundable stay while the supplier still billed us.
                    const refundAmountCents = Math.min(
                        Math.round(pi.amount * cancellation.refundRatio),
                        pi.amount,
                    );

                    console.log(
                        `[hotels.cancelBooking] policy=${cancellation.policyUsed} type=${cancellation.refundType} `
                        + `ratio=${cancellation.refundRatio.toFixed(4)} penalty=${cancellation.penaltyAmount} `
                        + `${cancellation.currency} -> refunding ${refundAmountCents} of ${pi.amount}`,
                    );

                    if (refundAmountCents > 0) {
                        const refund = await stripe.refunds.create({
                            payment_intent: paymentIntentId,
                            amount:         refundAmountCents,
                            reason:         'requested_by_customer',
                            metadata:       {
                                bookingId:  bookingRef,
                                type:       'hotel_cancellation',
                                refundType: cancellation.refundType,
                                penalty:    String(cancellation.penaltyAmount),
                            },
                        }, {
                            // Scoped to the amount so a corrected policy produces a new
                            // refund rather than silently reusing the previous figure.
                            idempotencyKey: `hotel-refund-${bookingRef}-${refundAmountCents}`,
                        });
                        if (refund.status === 'failed') throw new Error(`Stripe refund created but failed: ${refund.id}`);
                        stripeRefundId = refund.id;
                    }
                }
            } catch (stripeErr: any) {
                stripeError = stripeErr.message;
                console.error('[hotels.cancelBooking] Stripe refund failed:', stripeError);
            }
        }

        // 4b. Close the log with what actually happened.
        if (refundLogId) {
            await this.repo.closeRefund(refundLogId, stripeRefundId
                ? { issued: true, approvedAmount: cancellation.refundAmount, externalRef: stripeRefundId }
                : { issued: false, reason: stripeError ?? 'No refund was issued' });
        }

        // 5. Update booking status in DB
        const finalStatus = paymentIntentId
            ? (stripeRefundId ? 'cancelled_refunded' : (stripeError ? 'cancelled_refund_failed' : 'cancelled'))
            : 'cancelled';
        await prisma.bookings.update({
            where: { booking_id: bookingRef },
            data:  { status: finalStatus, updated_at: new Date() },
        });

        await this.lifecycle.recordCancelEnd(bookingRef, finalStatus, 'browser');

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

    // ââ Deals âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

    // ── Completion from a payment event ─────────────────────────────────────

    /**
     * Finishes a booking from Stripe's authorisation event, for a traveller whose browser
     * never made the confirm call.
     *
     * It goes through `confirmBooking`, so it is the same routine under the same claim: if the
     * browser is already booking, this loses the claim and returns the winner's answer. It
     * only acts when the traveller said who is staying at payment time — otherwise there is
     * nothing to book with, the authorisation is recorded, and the browser completes it as
     * it always did (or the sweeper releases the hold if it never comes).
     */
    async completeFromPayment(paymentIntentId: string): Promise<{
        handled: boolean; completed: boolean; reason?: string; reference?: string;
    }> {
        const record = await this.lifecycle.recordAuthorised(paymentIntentId);
        if (!record) return { handled: false, completed: false, reason: 'not a hotel booking attempt' };

        if (record.status !== 'PAYMENT_AUTHORIZED') {
            return { handled: true, completed: false, reason: `already ${record.status}`, reference: record.reference };
        }

        const params = await this.lifecycle.confirmParamsFor(record);
        if (!params) {
            return { handled: true, completed: false, reason: 'awaiting the traveller\'s details', reference: record.reference };
        }

        const result: any = await this.confirmBooking(params as any, { actor: 'webhook' });
        return {
            handled: true, completed: result?.success === true, reference: record.reference,
            ...(result?.success === true ? {} : { reason: result?.error ?? 'not completed' }),
        };
    }

    // ── Booking status ──────────────────────────────────────────────────────

    /**
     * Where a booking is, for polling and for a confirmation page that survives a refresh.
     * Read from the lifecycle when there is one; a booking made before it existed answers
     * from the sale itself.
     */
    async getBookingStatus(reference: string, userId: string) {
        const attempt = await this.lifecycle.repo.findByReference(reference);
        if (attempt) {
            if (attempt.userId !== userId) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
            const history = await this.lifecycle.repo.events(reference);
            return {
                success: true,
                data: {
                    reference,
                    status:        attempt.status,
                    bookingStatus: projectLegacyStatus(attempt.status),
                    provider:      attempt.provider,
                    currency:      attempt.currency,
                    failure:       attempt.failureCode
                        ? { code: attempt.failureCode, message: attempt.failureMessage }
                        : null,
                    updatedAt:     attempt.updatedAt,
                    history,
                },
            };
        }

        const row = await prisma.bookings.findFirst({
            where:  { booking_id: reference, user_id: userId },
            select: { booking_id: true, status: true, updated_at: true, provider: true, currency: true },
        }).catch(() => null);
        if (!row) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');

        const legacyToLifecycle: Record<string, string> = {
            confirmed: 'CONFIRMED', cancelled: 'CANCELLED',
            cancelled_refunded: 'REFUNDED', cancelled_refund_failed: 'REFUND_FAILED',
        };
        return {
            success: true,
            data: {
                reference,
                status:        legacyToLifecycle[row.status ?? ""] ?? null,
                bookingStatus: row.status,
                provider:      row.provider,
                currency:      row.currency,
                failure:       null,
                updatedAt:     row.updated_at,
                history:       [],
            },
        };
    }

    async getDeals(limit = 12) {
        return this.repo.getHotelDeals(limit);
    }
}
