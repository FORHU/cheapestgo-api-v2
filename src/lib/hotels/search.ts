/**
 * TravelgateX hotel search — core logic ported from the Next.js monolith.
 * Handles caching, OTV portfolio queries, ETG fallback, and result normalization.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
    tgxGraphQL, getTgxSettings, getTgxConfig, getTgxFilterSearch, buildOccupancies,
    normalizeOption, resolveTgxDestinationCode, fetchAmenitiesByHotelCodes, toRefundableTag,
    type TgxOption,
} from './travelgatex';
import { otvCodeToLabel } from './amenityCodes';
import { fetchEtgHotelContent, parseEtgHotel, type EtgHotelContent } from './etg';
import { HotelsRepository } from '@/repositories/hotels.repository';
import { isConfirmedOutOfCountry } from '@/lib/geo/countryBoxes';
import { hotelLocationNames } from '@/lib/geo/hotelLocation';
import { hotelCountry, isTerritory } from '@/lib/geo/territories';
import type { HotelSearchParams, HotelSearchResult } from '@/types/hotels';

// ─── Country name → ISO lookup (shared by stream route and ETG fallback) ──────

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
    // Asia Pacific
    'indonesia': 'ID', 'japan': 'JP', 'thailand': 'TH', 'philippines': 'PH',
    'south korea': 'KR', 'korea': 'KR', 'vietnam': 'VN', 'cambodia': 'KH',
    'singapore': 'SG', 'malaysia': 'MY', 'india': 'IN', 'china': 'CN',
    'hong kong': 'HK', 'taiwan': 'TW', 'myanmar': 'MM', 'burma': 'MM',
    'laos': 'LA', 'maldives': 'MV', 'sri lanka': 'LK', 'nepal': 'NP',
    'australia': 'AU', 'new zealand': 'NZ',
    // Middle East & Gulf
    'united arab emirates': 'AE', 'uae': 'AE', 'saudi arabia': 'SA', 'ksa': 'SA',
    'qatar': 'QA', 'kuwait': 'KW', 'bahrain': 'BH', 'jordan': 'JO',
    'turkey': 'TR', 'türkiye': 'TR',
    // Europe
    'france': 'FR', 'italy': 'IT', 'spain': 'ES', 'germany': 'DE', 'greece': 'GR',
    'united kingdom': 'GB', 'uk': 'GB', 'britain': 'GB', 'england': 'GB',
    'ireland': 'IE', 'portugal': 'PT', 'netherlands': 'NL', 'holland': 'NL',
    'switzerland': 'CH', 'austria': 'AT', 'norway': 'NO', 'sweden': 'SE',
    'denmark': 'DK', 'iceland': 'IS',
    // Africa
    'egypt': 'EG', 'morocco': 'MA', 'south africa': 'ZA', 'kenya': 'KE', 'tanzania': 'TZ',
    // Americas
    'united states': 'US', 'usa': 'US', 'canada': 'CA',
    'mexico': 'MX', 'brazil': 'BR', 'argentina': 'AR', 'peru': 'PE',
};

function resolveIsoCode(raw?: string): string | null {
    if (!raw) return null;
    if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
    return COUNTRY_NAME_TO_ISO[raw.toLowerCase()] ?? null;
}

// Haversine distance in km between two lat/lng points.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R  = 6371;
    const dL = ((lat2 - lat1) * Math.PI) / 180;
    const dG = ((lng2 - lng1) * Math.PI) / 180;
    const a  = Math.sin(dL / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dG / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Instant hotel catalog from hotel_content ─────────────────────────────────

/**
 * Hotels OTV has stopped selling.
 *
 * The portfolio sync marks a row rather than deleting it, because the hotel may come back and
 * because a booking already made against it still has to render. Every query that *chooses*
 * hotels — the pins on the map, and the codes the supplier is asked to price — excludes them;
 * a lookup by id does not, or a past booking would lose its name and pictures.
 *
 * 30,298 rows carry this on the current catalog. Shown, they are hotels a traveller can see,
 * click and never book.
 */
const NOT_DELISTED = { delisted_at: null } as const;

/**
 * The catalog's spellings of a city, matched ignoring spaces, case and punctuation.
 *
 * A typed destination is not the catalog's spelling of it. "Danang" drew no pins at all while
 * 1,705 hotels sat under "Da Nang", because the name branch asks for the string it was given;
 * a picked destination escapes this only because it arrives with coordinates.
 *
 * Only asked when the plain match found nothing, and always inside a country, so the scan it
 * costs is over one country's cities rather than the whole catalog.
 */
async function catalogSpellingsOf(cityName: string, countryCodes: string[] | null): Promise<string[]> {
    const key = cityName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key.length < 3) return [];

    const rows = await prisma.$queryRaw<{ city: string }[]>`
        SELECT DISTINCT city FROM hotel_content
         WHERE regexp_replace(lower(city), '[^a-z0-9]', '', 'g') = ${key}
           ${countryCodes
               ? Prisma.sql`AND lower(country) IN (${Prisma.join(countryCodes.map(c => c.toLowerCase()))})`
               : Prisma.empty}
         LIMIT 5`;
    return rows.map(r => r.city).filter(Boolean);
}

/**
 * The extent to bound a search by, or null to leave it unbounded.
 *
 * Only a sub-area bounds. A plain city keeps the radius for the reason in `areaRung`, and a
 * search with no picked extent has nothing to bound by.
 */
export function subAreaBbox(p: { areaRung?: string; bbox?: [number, number, number, number] }):
    [number, number, number, number] | null {
    return p.areaRung && p.areaRung !== 'city' && Array.isArray(p.bbox) && p.bbox.length === 4
        ? p.bbox
        : null;
}

export async function getInstantHotelCatalog(body: HotelSearchParams): Promise<any[]> {
    const cityName: string = body.cityName ?? '';
    const countryCode: string = body.countryCode ?? '';
    if (!cityName && !(body.lat && body.lng)) return [];

    try {
        let where: any;

        const areaBbox = subAreaBbox(body);

        if (areaBbox) {
            // The traveller picked an area with real boundaries, so those are the boundaries —
            // a 50km circle around Camden Town is the whole of Greater London, and the borough
            // they asked for is nowhere in it.
            const [west, south, east, north] = areaBbox;
            where = {
                lat: { gte: south, lte: north },
                lng: { gte: west,  lte: east  },
                images: { isEmpty: false },
                ...NOT_DELISTED,
            };
        } else if (body.lat && body.lng) {
            // Prefer radius search — works correctly across admin boundaries (e.g. Jeju/Seogwipo,
            // London/Greater London, etc.) without any hardcoding.
            const RADIUS_KM = 50;
            const DEG = RADIUS_KM / 111;
            where = {
                lat: { gte: body.lat - DEG, lte: body.lat + DEG },
                lng: { gte: body.lng - DEG, lte: body.lng + DEG },
                images: { isEmpty: false },
                ...NOT_DELISTED,
            };
        } else {
            // Fallback: city-string match when no coordinates available.
            const normalized = cityName.split(',')[0].trim().replace(/-(si|do|gu|gun|eup)$/i, '').trim();
            const isoCode    = resolveIsoCode(countryCode);
            const { cityNames, countryCodes } = hotelLocationNames(normalized, isoCode || countryCode);
            where = {
                OR: cityNames.map(n => ({ city: { contains: n, mode: 'insensitive' } })),
                images: { isEmpty: false },
                ...NOT_DELISTED,
            };
            if (countryCodes) where.country = { in: countryCodes, mode: 'insensitive' };
        }

        let rows = await prisma.hotel_content.findMany({
            where,
            orderBy: { review_count: { sort: 'desc', nulls: 'last' } },
            take: body.lat && body.lng ? 1000 : 300,
            // `description` and `amenities` are not read from a catalog card. app-v2's
            // consumed shape is `MappableProperty` (features/search/utils/search.utils.ts),
            // and neither field is on it — they were selected, normalised and streamed for
            // nothing. Note this differs from v1's trim: v1 also dropped `location`, which
            // app-v2 *does* read, so that one stays. v2 owns its own design (ADR-0016), so
            // what v1 measured as unread does not transfer.
            select: {
                hotel_id: true, name: true, images: true, star_rating: true,
                lat: true, lng: true, address: true, city: true, country: true,
                review_rating: true, review_count: true,
            },
        });

        // A typed spelling the catalog does not use finds nothing by name. Ask again for the
        // spellings it does use, which is a second query only on a search that already failed.
        if (rows.length === 0 && !areaBbox && !(body.lat && body.lng) && cityName) {
            const normalized = cityName.split(',')[0].trim().replace(/-(si|do|gu|gun|eup)$/i, '').trim();
            const isoCode    = resolveIsoCode(countryCode);
            const { countryCodes } = hotelLocationNames(normalized, isoCode || countryCode);
            const spellings = await catalogSpellingsOf(normalized, countryCodes);
            if (spellings.length > 0) {
                console.log(`[catalog] "${normalized}" is filed as ${spellings.map(x => JSON.stringify(x)).join(', ')}`);
                rows = await prisma.hotel_content.findMany({
                    where: {
                        OR: spellings.map(n => ({ city: { equals: n, mode: 'insensitive' as const } })),
                        images: { isEmpty: false },
                        ...NOT_DELISTED,
                        ...(countryCodes ? { country: { in: countryCodes, mode: 'insensitive' as const } } : {}),
                    },
                    orderBy: { review_count: { sort: 'desc' as const, nulls: 'last' as const } },
                    take: 300,
                    select: {
                        hotel_id: true, name: true, images: true, star_rating: true,
                        lat: true, lng: true, address: true, city: true, country: true,
                        review_rating: true, review_count: true,
                    },
                });
            }
        }

        // When using radius search, cull to true circle (bounding box is rectangular).
        let filtered = body.lat && body.lng
            ? rows.filter((r: any) => haversineKm(body.lat!, body.lng!, Number(r.lat), Number(r.lng)) <= 50)
            : rows;

        // A territory's border is a customs line, and it has to be enforced however the rows
        // were found. 50km from central Hong Kong is all of Shenzhen plus Dongguan and Zhuhai:
        // in v1 a "Hong Kong" search returned 601 Shenzhen hotels out of 1,287 (QA BG-8), and
        // Jersey's circle reaches Guernsey. A territory keeps to its own side, judged by the
        // territory-corrected country. Deliberately not every country: across an ordinary land
        // border the circle is the point.
        //
        // This used to be gated on the search carrying coordinates, alongside the circle it was
        // written for — but the caller never sends any, so the cull never ran and the name
        // branch let Shenzhen through under "North District", which is a district of both
        // cities. The border decides, not the name, and not whether a circle was drawn.
        if (isTerritory(countryCode)) {
            const own = countryCode.toUpperCase();
            filtered = filtered.filter((r: any) =>
                hotelCountry(r.country, r.city, r.lat, r.lng).toUpperCase() === own);
        }

        return filtered.map((r: any) => ({
            hotelId:      r.hotel_id,
            id:           r.hotel_id,
            name:         r.name || r.hotel_id,
            price:        0,
            currency:     'USD',
            // Only the first image is ever rendered on a card, and `toMappable` reads
            // `images[0]` before falling back to `image`. Streaming the whole array cost
            // bytes for URLs nothing displays.
            images:       (r.images as string[] | null)?.length ? [(r.images as string[])[0]] : [],
            image:        (r.images as string[] | null)?.[0] ?? '',
            starRating:   r.star_rating ?? 0,
            reviewRating: Number(r.review_rating ?? 0),
            rating:       Number(r.review_rating ?? 0),
            reviewCount:  Number(r.review_count ?? 0),
            reviews:      Number(r.review_count ?? 0),
            lat:          Number(r.lat ?? 0),
            lng:          Number(r.lng ?? 0),
            coordinates:  { lat: Number(r.lat ?? 0), lng: Number(r.lng ?? 0) },
            // `location` is what app-v2's card reads; `address` echoed it with no reader.
            location:     r.address ?? '',
            city:         r.city ?? cityName,
            // A territory's hotels arrive filed under its parent's code, so a Hong Kong
            // card read "Hong Kong, CN".
            country:      hotelCountry(r.country, r.city, r.lat, r.lng),
            provider:     'travelgatex',
            priceLoading: true,
        }));
    } catch (e: any) {
        console.error('[instant-catalog] query failed:', e.message);
        return [];
    }
}

// ─── Search demand tracking ───────────────────────────────────────────────────

export async function recordHotelSearchDemand(cityName: string, countryCode: string): Promise<void> {
    if (!cityName) return;
    try {
        const key = cityName.toLowerCase().trim();
        await prisma.hotel_search_stats.upsert({
            where:  { city_key: key },
            create: { city_key: key, country_code: countryCode.toUpperCase(), search_count: 1 },
            update: {
                search_count:     { increment: 1 },
                last_searched_at: new Date(),
                country_code: countryCode
                    ? { set: countryCode.toUpperCase() }
                    : undefined,
            },
        });
    } catch (e: any) {
        console.error('[hotel-stats] Failed to record demand:', e.message);
    }
}

// ─── Search identity ──────────────────────────────────────────────────────────

/**
 * What makes two searches the same search — used only to let identical searches that are
 * in flight at the same moment share one supplier call.
 *
 * There is deliberately no result cache behind this. Search results used to be kept in
 * `hotel_search_cache` for two hours (six for popular cities) and then served *stale* for
 * as long again while refreshing in the background — so the first search after expiry
 * showed rates up to twelve hours old, and the next showed the refreshed ones. A hotel's
 * Nightly Rate is its cheapest room, and cheap rooms are what sell, so a replayed rate is
 * often a room already gone: customers searched, searched again, and watched every price
 * rise. Measured on v1's live data 2026-09-11: Tokyo 7.7h old, Paris 7.1h, Manila 3.8h;
 * against a live search of the same Manila stay, two hotels were 45% and 47% higher.
 * See CONTEXT.md, "Nightly Rate": always live.
 */
function buildSearchKey(p: HotelSearchParams): string {
    const location = p.hotelCode
        ? `hotel:${p.hotelCode}`
        : p.destinationCode
        ? `dest:${p.destinationCode}`
        : `city:${(p.cityName ?? '').toLowerCase().trim()}`;
    return [
        location,
        p.checkin,
        p.checkout,
        String(p.adults ?? 2),
        String(p.children ?? 0),
        p.guest_nationality ?? 'KR',
    ].join('|');
}

// ─── GraphQL search queries ───────────────────────────────────────────────────

const CITY_SEARCH_QUERY = `
query TgxCitySearch($criteria: HotelCriteriaSearchInput!, $settings: HotelSettingsInput!, $filterSearch: HotelXFilterSearchInput) {
  hotelX {
    search(criteria: $criteria, settings: $settings, filterSearch: $filterSearch) {
      options {
        id hotelCode boardCode paymentType status
        price { currency net gross }
        token
        rooms { description }
        cancelPolicy { refundable }
      }
      errors { code type description }
      warnings { code type description }
    }
  }
}`;

const HOTEL_SEARCH_QUERY = `
query TgxHotelSearch($criteria: HotelCriteriaSearchInput!, $settings: HotelSettingsInput!, $filterSearch: HotelXFilterSearchInput) {
  hotelX {
    search(criteria: $criteria, settings: $settings, filterSearch: $filterSearch) {
      options {
        id hotelCode boardCode paymentType status
        price { currency net gross }
        token
        rooms { occupancyRefId code description }
        cancelPolicy {
          refundable
          cancelPenalties { deadline hoursBefore penaltyType currency value }
        }
      }
      errors { code type description }
      warnings { code type description }
    }
  }
}`;

// ─── DB enrichment ────────────────────────────────────────────────────────────

/**
 * @param slim  Select only what a search card renders. `description` and `amenities` are
 *   large TOASTed columns that a city search never shows — on a 300-hotel result they were
 *   the bulk of both the payload and the query's cost — and a card shows one image. The
 *   property page reads the same function and must keep the full row, so this defaults to
 *   full: a new caller cannot silently lose fields.
 */
async function fetchHotelContent(hotelCodes: string[], slim = false) {
    if (!hotelCodes.length) return new Map<string, any>();
    const rows = await prisma.hotel_content.findMany({
        where: { hotel_id: { in: hotelCodes } },
        select: slim ? {
            hotel_id: true, name: true, images: true, star_rating: true,
            lat: true, lng: true, address: true, city: true, country: true,
            review_rating: true, review_count: true,
        } : {
            hotel_id: true, name: true, images: true, star_rating: true,
            lat: true, lng: true, address: true, city: true, country: true,
            description: true, amenities: true, review_rating: true, review_count: true,
            check_in_time: true, check_out_time: true, ratehawk_hid: true,
        },
    });
    const map = new Map<string, any>();
    for (const row of rows) map.set(row.hotel_id, row);
    return map;
}

async function fetchHotelReviews(hotelCodes: string[]) {
    if (!hotelCodes.length) return new Map<string, any>();
    const rows = await prisma.hotel_reviews.findMany({
        where: { hotel_id: { in: hotelCodes } },
        select: { hotel_id: true, rating: true, reviews_count: true },
    });
    const map = new Map<string, any>();
    for (const row of rows) map.set(row.hotel_id, row);
    return map;
}

async function fetchHotelCodesByLocation(cityName: string, countryCode?: string, lat?: number, lng?: number): Promise<string[]> {
    if (lat && lng) {
        // Radius-based search — correctly covers cities that straddle admin boundaries.
        const RADIUS_KM = 50;
        const DEG = RADIUS_KM / 111;
        const rows = await prisma.hotel_content.findMany({
            where: {
                lat: { gte: lat - DEG, lte: lat + DEG },
                lng: { gte: lng - DEG, lte: lng + DEG },
                ...NOT_DELISTED,
            },
            take: 2000,
            select: { hotel_id: true, lat: true, lng: true },
        });
        return rows
            .filter((r: any) => haversineKm(lat, lng, Number(r.lat), Number(r.lng)) <= RADIUS_KM)
            .map((r: any) => r.hotel_id);
    }

    // Fallback: city-string match when no coordinates available.
    const normalized = cityName.split(',')[0].trim().replace(/-(si|do|gu|gun|eup)$/i, '').trim();
    const { cityNames, countryCodes } = hotelLocationNames(normalized, countryCode);

    const where: any = {
        OR: cityNames.map(n => ({ city: { contains: n, mode: 'insensitive' } })),
        ...NOT_DELISTED,
    };
    if (countryCodes) where.country = { in: countryCodes, mode: 'insensitive' };

    const rows = await prisma.hotel_content.findMany({
        where,
        take: 1000,
        select: { hotel_id: true },
    });
    return rows.map((r: any) => r.hotel_id);
}

// ─── ETG B2B helpers (fallback name enrichment) ───────────────────────────────

async function fetchEtgHotelNames(hotelIds: string[]): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();
    if (!hotelIds.length) return nameMap;
    const keyId  = process.env.ETG_KEY_ID;
    const apiKey = process.env.ETG_API_KEY;
    if (!keyId || !apiKey) return nameMap;
    const token = Buffer.from(`${keyId}:${apiKey}`).toString('base64');
    const BATCH = 500;
    for (let i = 0; i < hotelIds.length; i += BATCH) {
        const batch = hotelIds.slice(i, i + BATCH);
        try {
            const abort   = new AbortController();
            const timeout = setTimeout(() => abort.abort(), 5_000);
            const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
                method:  'POST',
                headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ ids: batch, language: 'en' }),
                signal:  abort.signal,
            });
            clearTimeout(timeout);
            if (!res.ok) { console.warn(`[tgx-search] ETG hotel/info ${res.status}`); continue; }
            const json: any   = await res.json();
            const hotels: any[] = json?.data?.hotels ?? json?.hotels ?? [];
            for (const h of hotels) {
                const id   = String(h.id ?? h.hotel_id ?? '');
                const name = (h.name ?? h.title ?? '') as string;
                if (id && name) nameMap.set(id, name);
            }
        } catch (e: any) {
            if (e?.name !== 'AbortError') console.warn('[tgx-search] ETG batch failed:', e.message);
        }
    }
    console.log(`[tgx-search] ETG hotel/info returned ${nameMap.size}/${hotelIds.length} names`);
    return nameMap;
}

// Fetch content for numeric RateHawk hids via ETG hotel/info (hid field).
// Returns the parsed content per hotel plus the resolved slug, so callers can
// persist it to ratehawk_hid for future batch calls.
//
// Every hotel_id in the catalog is numeric, so this — not the slug batch — is the
// path that actually runs. It previously read only `amenity_groups` from the
// response and discarded the description arriving alongside it, which is why
// 96.9% of the catalog has no description despite ETG returning one.
async function fetchEtgAmenitiesByHids(
    hotelIds: string[],
): Promise<Map<string, { content: EtgHotelContent; amenities: string[]; slug: string }>> {
    const result = new Map<string, { content: EtgHotelContent; amenities: string[]; slug: string }>();
    if (!hotelIds.length) return result;
    const keyId  = process.env.ETG_KEY_ID;
    const apiKey = process.env.ETG_API_KEY;
    if (!keyId || !apiKey) return result;
    const token = Buffer.from(`${keyId}:${apiKey}`).toString('base64');

    // ETG only supports single-hid lookup — run concurrently, cap at 10 in-flight
    const CONCURRENCY = 10;
    for (let i = 0; i < hotelIds.length; i += CONCURRENCY) {
        await Promise.all(hotelIds.slice(i, i + CONCURRENCY).map(async id => {
            const hid = parseInt(id, 10);
            if (isNaN(hid)) return;
            try {
                const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
                    method:  'POST',
                    headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ hid, language: 'en' }),
                    signal:  AbortSignal.timeout(8_000),
                });
                if (!res.ok) return;
                const json: any = await res.json();
                const d = json?.data;
                if (!d) return;
                // Same response, parsed for everything it carries rather than
                // amenities alone.
                const content = parseEtgHotel(d);
                if (Object.keys(content).length || d.id) {
                    result.set(id, { content, amenities: content.amenities ?? [], slug: d.id ?? '' });
                }
            } catch { /* non-fatal */ }
        }));
    }
    return result;
}

async function updateHotelAmenitiesInDb(amenityMap: Map<string, string[]>): Promise<void> {
    if (!amenityMap.size) return;
    let saved = 0;
    for (const [hotelId, amenities] of amenityMap) {
        if (!amenities.length) continue;
        try {
            await prisma.hotel_content.upsert({
                where:  { hotel_id: hotelId },
                create: { hotel_id: hotelId, amenities, images: [], content_source: 'etg', fetched_at: new Date() },
                update: { amenities, fetched_at: new Date() },
            });
            saved++;
        } catch { /* skip */ }
    }
    if (saved) console.log(`[tgx-search] Updated amenities for ${saved} hotels from ETG`);
}

async function updateHotelNamesInDb(nameMap: Map<string, string>): Promise<void> {
    if (!nameMap.size) return;
    let saved = 0;
    for (const [hotelId, name] of nameMap) {
        try {
            await prisma.hotel_content.upsert({
                where:  { hotel_id: hotelId },
                create: { hotel_id: hotelId, name, images: [], content_source: 'etg', fetched_at: new Date() },
                update: { name, fetched_at: new Date() },
            });
            saved++;
        } catch { /* skip individual failures */ }
    }
    if (saved) console.log(`[tgx-search] Upserted ${saved} ETG hotel names`);
}

// ─── OTV portfolio ────────────────────────────────────────────────────────────

function parseOtvEdges(edges: any[], cityName: string): Map<string, any> {
    const map = new Map<string, any>();
    for (const e of edges) {
        const d = e?.node?.hotelData;
        if (!d?.code) continue;

        const images: string[] = (d.medias ?? [])
            .map((m: any) => m.url as string)
            .filter(Boolean)
            .slice(0, 10);

        let description: string | null = null;
        for (const desc of (d.descriptions ?? [])) {
            const en = (desc.texts ?? []).find((t: any) => t.language?.toLowerCase().startsWith('en'));
            if (en?.text) { description = en.text; break; }
        }
        if (!description) description = d.descriptions?.[0]?.texts?.[0]?.text ?? null;

        const catCode   = d.categoryCode ?? '';
        const starMatch = catCode.match(/(\d)/);

        map.set(String(d.code), {
            hotel_id:    String(d.code),
            name:        (d.hotelName as string | null) ?? null,
            images,
            lat:         Number(d.location?.coordinates?.latitude  ?? 0),
            lng:         Number(d.location?.coordinates?.longitude ?? 0),
            address:     (d.location?.address as string | null) ?? null,
            city:        cityName,
            country:     null,
            description,
            star_rating: starMatch ? parseInt(starMatch[1], 10) : 0,
            amenities:   (d.amenities ?? []).map((a: any) => otvCodeToLabel(a.code)).filter(Boolean),
        });
    }
    return map;
}

async function fetchOtvHotelCodesByCity(cityName: string, destinationCode?: string, countryCode?: string): Promise<{ codes: string[]; contentMap: Map<string, any> }> {
    try {
        const cfg      = getTgxConfig();
        const criteria: Record<string, unknown> = { access: cfg.accessCode, maxSize: 200 };
        if (destinationCode) criteria.destinationCodes = [destinationCode];

        const result = await tgxGraphQL(
            `query OtvHotelPortfolio($criteria: HotelXHotelListInput!) {
               hotelX {
                 hotels(criteria: $criteria) {
                   edges {
                     node {
                       hotelData {
                         code hotelName categoryCode
                         descriptions { type texts { language text } }
                         medias { url type }
                         location { coordinates { latitude longitude } address }
                         amenities { code }
                       }
                     }
                   }
                 }
               }
             }`,
            { criteria }
        );

        const edges      = result?.data?.hotelX?.hotels?.edges ?? [];
        const contentMap = parseOtvEdges(edges, cityName);
        const codes      = [...contentMap.keys()];
        console.log(`[tgx-search] OTV portfolio: ${codes.length} hotel codes for "${cityName}"`);

        if (codes.length > 0) {
            // Drop hotels confirmed to be in another country before persisting: a TGX
            // destination code sometimes answers with a same-named city elsewhere, and a
            // row written here is what every later search reads back.
            const backfillMap = countryCode
                ? new Map([...contentMap].filter(([, c]) => !isConfirmedOutOfCountry(c, countryCode)))
                : contentMap;
            backfillHotelContent(backfillMap).catch((err: any) =>
                console.warn('[tgx-search] hotel_content backfill failed:', err.message)
            );
            const nullNameCodes = codes.filter(c => !contentMap.get(c)?.name);
            if (nullNameCodes.length > 0) {
                fetchEtgHotelNames(nullNameCodes)
                    .then(etgNames => {
                        if (etgNames.size > 0) {
                            for (const [id, name] of etgNames) {
                                const row = contentMap.get(id);
                                if (row) row.name = name;
                            }
                            updateHotelNamesInDb(etgNames).catch(() => {});
                        }
                    })
                    .catch(() => {});
            }
        }

        return { codes, contentMap };
    } catch (e: any) {
        console.warn('[tgx-search] OTV portfolio query failed:', e.message);
        return { codes: [], contentMap: new Map() };
    }
}

async function backfillHotelContent(contentMap: Map<string, any>): Promise<void> {
    let saved = 0;
    for (const r of contentMap.values()) {
        try {
            await prisma.hotel_content.upsert({
                where:  { hotel_id: r.hotel_id },
                create: {
                    hotel_id:       r.hotel_id,
                    name:           r.name,
                    images:         r.images ?? [],
                    lat:            r.lat ?? 0,
                    lng:            r.lng ?? 0,
                    address:        r.address,
                    city:           r.city,
                    country:        r.country,
                    description:    r.description,
                    star_rating:    r.star_rating ?? 0,
                    amenities:      Array.isArray(r.amenities) ? r.amenities : [],
                    content_source: 'tgx',
                    fetched_at:     new Date(),
                },
                update: {
                    fetched_at: new Date(),
                    content_source: 'tgx',
                    ...(Array.isArray(r.amenities) && r.amenities.length > 0 ? { amenities: r.amenities } : {}),
                },
            });
            saved++;
        } catch { /* skip */ }
    }
    console.log(`[tgx-search] hotel_content backfilled ${saved} hotels`);
}

// ─── ETG direct city search (last-resort fallback) ────────────────────────────

function getEtgToken(): string {
    const keyId  = process.env.ETG_KEY_ID  ?? '';
    const apiKey = process.env.ETG_API_KEY ?? '';
    return Buffer.from(`${keyId}:${apiKey}`).toString('base64');
}

async function getEtgRegionId(cityName: string, countryCode?: string): Promise<number | null> {
    try {
        const token = getEtgToken();
        const query = cityName.split(',')[0].trim();
        const abort = new AbortController();
        const t     = setTimeout(() => abort.abort(), 5_000);
        const res   = await fetch('https://api.worldota.net/api/b2b/v3/search/multicomplete/', {
            method:  'POST',
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ query, language: 'en' }),
            signal:  abort.signal,
        });
        clearTimeout(t);
        if (!res.ok) return null;
        const data: any    = await res.json();
        const regions = data?.data?.regions ?? [];
        const iso     = resolveIsoCode(countryCode);
        return (
            regions.find((r: any) =>
                r.type === 'City' &&
                r.name.toLowerCase().startsWith(query.toLowerCase()) &&
                (!iso || r.country_code === iso)
            ) ??
            regions.find((r: any) =>
                r.type === 'City' &&
                r.name.toLowerCase().startsWith(query.toLowerCase())
            )
        )?.id ?? null;
    } catch {
        return null;
    }
}

async function fetchEtgHotelInfo(id: string): Promise<any | null> {
    try {
        const token = getEtgToken();
        const abort = new AbortController();
        const t     = setTimeout(() => abort.abort(), 4_000);
        const res   = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
            method:  'POST',
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id, language: 'en' }),
            signal:  abort.signal,
        });
        clearTimeout(t);
        if (!res.ok) return null;
        const json: any = await res.json();
        const data = json?.data ?? null;
        if (process.env.NODE_ENV === 'development' && data) {
            console.log(`[etg-info] hotel ${id} amenity_groups:`, JSON.stringify(data.amenity_groups ?? 'MISSING').slice(0, 300));
        }
        return data;
    } catch {
        return null;
    }
}

async function searchEtgCity(
    cityName: string,
    params: HotelSearchParams,
): Promise<HotelSearchResult> {
    const empty: HotelSearchResult = { data: [], allMappable: [], totalCount: 0 };
    try {
        if (!process.env.ETG_KEY_ID || !process.env.ETG_API_KEY) return empty;
        const token = getEtgToken();

        const regionId = await getEtgRegionId(cityName, params.countryCode);
        if (!regionId) {
            console.warn(`[tgx-search] ETG: no region_id for "${cityName}"`);
            return empty;
        }
        console.log(`[tgx-search] ETG fallback: region ${regionId} for "${cityName}"`);

        const serpAbort   = new AbortController();
        const serpTimeout = setTimeout(() => serpAbort.abort(), 20_000);
        const serpRes     = await fetch('https://api.worldota.net/api/b2b/v3/search/serp/region/', {
            method:  'POST',
            headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region_id: regionId,
                checkin:   params.checkin,
                checkout:  params.checkout,
                guests:    [{ adults: Number(params.adults ?? 2) }],
                currency:  'USD',
                language:  'en',
                residency: 'us',
            }),
            signal: serpAbort.signal,
        });
        clearTimeout(serpTimeout);

        if (!serpRes.ok) { console.warn(`[tgx-search] ETG SERP ${serpRes.status}`); return empty; }

        const serpData: any  = await serpRes.json();
        const hotels: any[] = serpData?.data?.hotels ?? [];
        console.log(`[tgx-search] ETG SERP: ${hotels.length} hotels for "${cityName}"`);
        if (!hotels.length) return empty;

        hotels.sort((a: any, b: any) => {
            const pa = parseFloat(a.rates?.[0]?.payment_options?.payment_types?.[0]?.show_amount ?? '999999');
            const pb = parseFloat(b.rates?.[0]?.payment_options?.payment_types?.[0]?.show_amount ?? '999999');
            return pa - pb;
        });

        const TOP_N    = 20;
        const topHotels = hotels.slice(0, TOP_N);
        const topIds    = topHotels.map((h: any) => h.id as string);

        const existingContent = await fetchHotelContent(topIds);
        const needInfo        = topHotels.filter((h: any) => {
            const c = existingContent.get(h.id);
            return !c?.name || !c?.amenities?.length;
        });
        const toFetch         = needInfo.slice(0, 15);
        const infoResults     = toFetch.length > 0
            ? await Promise.allSettled(toFetch.map((h: any) => fetchEtgHotelInfo(h.id as string)))
            : [];

        const infoMap = new Map<string, any>();
        for (let i = 0; i < toFetch.length; i++) {
            const r = infoResults[i];
            if (r.status === 'fulfilled' && r.value) infoMap.set(toFetch[i].id as string, r.value);
        }

        if (infoMap.size > 0) {
            const amenityMap = new Map<string, string[]>();
            for (const [id, info] of infoMap) {
                const amenities: string[] = (info.amenity_groups ?? [])
                    .flatMap((g: any) => g.amenities ?? [])
                    .filter((a: any) => typeof a === 'string' && a.length > 0);
                if (amenities.length) amenityMap.set(id, amenities);
            }
            updateHotelAmenitiesInDb(amenityMap).catch(() => {});
        }

        const results = topHotels.map((h: any) => {
            const rate     = h.rates?.[0];
            const pt       = rate?.payment_options?.payment_types?.[0];
            const price    = parseFloat(pt?.show_amount    ?? '0');
            const currency = (pt?.show_currency_code ?? 'USD') as string;
            const dbContent = existingContent.get(h.id as string);
            const etgInfo   = infoMap.get(h.id as string);
            const src       = (dbContent?.name ? dbContent : null) ?? etgInfo;
            const rawImages: string[] = src?.images ?? [];
            const images = rawImages
                .map((url: string) => (typeof url === 'string' ? url.replace('{size}', '640x400') : ''))
                .filter(Boolean)
                .slice(0, 10);
            const lat = Number(src?.latitude ?? src?.lat ?? 0);
            const lng = Number(src?.longitude ?? src?.lng ?? 0);
            const amenities: string[] = dbContent?.amenities?.length
                ? dbContent.amenities
                : (etgInfo?.amenity_groups ?? [])
                    .flatMap((g: any) => g.amenities ?? [])
                    .filter((a: any) => typeof a === 'string' && a.length > 0);
            return {
                hotelId: h.id, id: h.id,
                name: dbContent?.name ?? etgInfo?.name ?? h.id,
                price, currency,
                offerId: `ETG:${h.id}:${rate?.match_hash ?? ''}`,
                refundableTag: 'UNKNOWN',
                starRating: Number(src?.star_rating ?? 0),
                images, image: images[0] ?? '',
                lat, lng, coordinates: { lat, lng },
                address: src?.address ?? '', location: src?.address ?? '',
                city: cityName, country: params.countryCode ?? '',
                description: '', amenities,
                reviewRating: Number(dbContent?.review_rating ?? 0),
                rating: Number(dbContent?.review_rating ?? 0),
                reviews: Number(dbContent?.review_count ?? 0),
                reviewCount: Number(dbContent?.review_count ?? 0),
                boardCode: rate?.meal ?? 'RO', roomTypes: [], provider: 'etg',
            };
        });

        const allMappable = results.filter(h => h.lat && h.lng);
        return { data: results, allMappable, totalCount: results.length };
    } catch (e: any) {
        console.warn('[tgx-search] ETG city search failed:', e.message);
        return empty;
    }
}

// ─── Error helpers ────────────────────────────────────────────────────────────

function hasEmptyHotelsError(errors: any[]): boolean {
    return errors.some(
        e => e.code === 'WRONG_FIELD' && e.description?.toLowerCase().includes('empty hotels')
    );
}

/**
 * Did the supplier run out of time, or did it answer and have nothing?
 *
 * ALL_PROCESSES_FAILED is returned for both, and its description is only ever "See warnings
 * for more information". The warnings tell them apart:
 *
 *     104  Connection timeout with supplier   OTV never answered — retrying can help
 *     204  No results found                   OTV answered: nothing here — retrying cannot
 *
 * Worth the distinction because the two are treated as opposites everywhere downstream. A
 * timeout means we have learned nothing about inventory; a 204 is a real, final answer.
 */
export function isSupplierTimeout(warnings: any[]): boolean {
    return warnings.some(
        w => String(w?.type) === '104' || w?.description?.toLowerCase().includes('timeout')
    );
}

// ─── Destination codes OTV cannot price in time ───────────────────────────────

/**
 * Cities whose destination search timed out, and how many times running.
 *
 * A destination search asks OTV to price a whole city at once, and for the largest cities
 * it cannot do that inside the 12 seconds they ask us to allow. The request still costs us:
 * measured 2026-09-21, a cold Osaka spent 17.3s on a destination call that came back with
 * eight "104 Connection timeout" warnings and no hotels, before falling back to the
 * hotel-code path that answered fine. Of a 26.9-second search, 17.3 seconds bought nothing,
 * and it would have bought nothing again tomorrow.
 *
 * Two strikes before we reroute, because once is weather and twice is climate: a single
 * timeout really is transient, and TGX documents it as worth retrying. An hour of memory,
 * because a city that OTV could not price at breakfast may well be priceable by lunch, and
 * nothing here should outlive the condition it describes.
 *
 * Only time clears an entry, and deliberately so. The obvious alternative — forget the moment
 * the city answers again — was tried and was worse than useless: the collecting pass reruns
 * the same search seconds later, by which point OTV has computed the city and answers happily,
 * so every strike was wiped by our own follow-up and the count never reached two. That second
 * answer is evidence the first request warmed the supplier, not evidence the next cold search
 * will be fine.
 *
 * Deliberately not stored. A restart forgets, and the first search for a big city then pays
 * the 17 seconds once more before the memory rebuilds. That is the whole cost, it is bounded
 * by the TTL either way, and it buys us no migration, no write on the search path, and no
 * state that can outlive its usefulness.
 * ponytail: in-process Map, one container learns nothing from another. Move it to Redis if
 * the repeated first-search cost after a deploy ever shows up in the numbers.
 */
const _destTimeouts = new Map<string, { consecutive: number; at: number }>();

const DEST_TIMEOUT_TTL_MS  = 60 * 60 * 1000;
const DEST_TIMEOUT_STRIKES = 2;

/** Has this code timed out often enough, and recently enough, to stop asking? */
export function destCodeTimesOut(code: string): boolean {
    const seen = _destTimeouts.get(code);
    if (!seen) return false;
    if (Date.now() - seen.at > DEST_TIMEOUT_TTL_MS) { _destTimeouts.delete(code); return false; }
    return seen.consecutive >= DEST_TIMEOUT_STRIKES;
}

export function recordDestTimeout(code: string): void {
    const seen = _destTimeouts.get(code);
    // A timeout an hour after the last one starts the count again rather than continuing it.
    const fresh = seen && Date.now() - seen.at <= DEST_TIMEOUT_TTL_MS;
    const consecutive = fresh ? seen!.consecutive + 1 : 1;
    _destTimeouts.set(code, { consecutive, at: Date.now() });
    console.warn(`[tgx-search] Dest code "${code}" timed out (${consecutive} in a row)`);
}


// ─── Failed dest code cache ───────────────────────────────────────────────────

const _failedDestCodes     = new Set<string>();
let _failedDestCodesLoaded = false;

async function loadFailedDestCodes(): Promise<void> {
    if (_failedDestCodesLoaded) return;
    _failedDestCodesLoaded = true;
    try {
        const rows = await prisma.$queryRaw<{ dest_code: string }[]>`SELECT dest_code FROM tgx_failed_dest_codes`;
        for (const r of rows) _failedDestCodes.add(r.dest_code);
        if (rows.length) console.log(`[tgx-search] Loaded ${rows.length} known-bad dest codes`);
    } catch (e: any) {
        console.warn('[tgx-search] Could not load tgx_failed_dest_codes:', e.message);
    }
}

function persistFailedDestCode(destCode: string, cityName = ''): void {
    _failedDestCodes.add(destCode);
    prisma.$executeRaw`
        INSERT INTO tgx_failed_dest_codes (dest_code, city_key)
        VALUES (${destCode}, ${cityName})
        ON CONFLICT (dest_code) DO NOTHING
    `.catch((e: any) => console.warn('[tgx-search] Could not persist failed dest code:', e.message));
}

// ─── Supplier budgets ─────────────────────────────────────────────────────────

/**
 * How long TGX lets OTV work before returning whatever has answered. OTV's stated Search
 * limit is 12s, which is the default here; TGX caps Search at 25s.
 *
 * **This number decides how complete a search is, and — counter-intuitively — how fast.**
 * Measured on the same Phuket query, 2026-09-18:
 *
 *     12s budget:   50 hotels in 12s     124 hotels in 12s
 *     24s budget:  230 hotels in 5-8s    244 hotels in 4-7s
 *
 * More budget is faster because 12s is not enough for OTV to finish a destination search.
 * Cut off early, we discard the partial answer and fall into the hotel-code batches and
 * their retry, which is where the 12-20 seconds actually goes. Given 24s, OTV answers in
 * 5-8s on its own and none of that machinery runs.
 *
 * Left at 12s because that is the figure OTV gave us, and raising it is their call rather
 * than ours: it asks their processes to hold a request open twice as long. Overridable
 * without a code change so the answer can be acted on the day it arrives.
 */
const SUPPLIER_SEARCH_TIMEOUT_MS = Number(process.env.TGX_SEARCH_TIMEOUT_MS ?? 12_000);

/** HTTP aborts. Larger than the supplier budget because they also cover the response
 *  transfer: a destination search returns hundreds of hotels, a single hotel one. */
const ABORT_CITY_MS  = 22_000;
const ABORT_HOTEL_MS = 13_000;

// ─── In-flight dedup ──────────────────────────────────────────────────────────

// When two identical searches arrive while the first is still running, the second waits
// for that promise instead of firing a second TGX call that OTV will throttle. Both still
// get a live answer — this shares a call, it stores nothing.
const _inflight = new Map<string, Promise<any>>();

// ─── Hotel name deduplication ─────────────────────────────────────────────────

function normalizeHotelName(name: string): string {
    return name
        .toLowerCase()
        .replace(/'/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\b(hotel|the|a|an|london|paris|tokyo|city|of|in|at|by|for|uk|england)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── City search fallback ─────────────────────────────────────────────────────

/**
 * A search that ended without the supplier ever giving a usable answer — a TGX timeout,
 * a `513` handler overload, a destination code that never resolved, or an empty catalog
 * to fall back on.
 *
 * Distinct from a No-Availability result, where the supplier *did* answer and reported no
 * inventory: that is a real answer and the Phase 1 catalog is correctly pruned. An
 * Unanswered Search has learned nothing about availability, so the catalog must stay on
 * screen and the user is told prices could not be loaded.
 *
 * Thrown rather than returned so no caller can mistake it for a real empty result.
 */
export class UnansweredSearchError extends Error {
    readonly cityName: string;
    constructor(cityName: string, detail: string) {
        super(`Unanswered search for "${cityName}": ${detail}`);
        this.name = 'UnansweredSearchError';
        this.cityName = cityName;
    }
}

async function runCityFallback(
    cityName: string,
    countryCode: string | undefined,
    baseCriteria: Record<string, unknown>,
    /** For the destination-code attempt. Carries the translation plugins. */
    destSettings: ReturnType<typeof getTgxSettings>,
    /** For the hotel-code batches, which address hotels directly. */
    settings: ReturnType<typeof getTgxSettings>,
    prefetchDestCode: Promise<string | undefined>,
    prefetchHotelCodes: Promise<string[]>,
    searchParams: HotelSearchParams,
): Promise<HotelSearchResult> {
    await loadFailedDestCodes();

    // Records every path that failed to complete rather than answering. If we reach the
    // end with no results AND something in here, the search is Unanswered, not empty.
    // A path that answered cleanly with zero options never lands here, so a genuine
    // No-Availability result still returns normally and is still cached.
    const unansweredReasons: string[] = [];

    // Set when the supplier demonstrably stopped mid-answer rather than finishing. Only a
    // real cut-off justifies a second pass: measured 2026-09-21, two cold cities whose first
    // pass merely ran long (16.8s -> 263 hotels, 17.3s -> 158) returned byte-identical sets
    // on the second, so re-asking bought nothing and doubled what OTV saw.
    let supplierCutShort = false;

    // Pre-declare so the dest-code block can populate it and fall through to hotel-code search.
    let otvCodes: string[]              = [];
    let otvContentMap = new Map<string, any>();

    console.warn(`[tgx-search] OTV destination search empty for "${cityName}" — resolving TGX dest code`);
    const resolvedCode = await prefetchDestCode;
    if (resolvedCode) {
        console.log(`[tgx-search] Got TGX dest code "${resolvedCode}" for "${cityName}"`);
        if (_failedDestCodes.has(resolvedCode)) {
            console.log(`[tgx-search] Dest code "${resolvedCode}" is a known OTV miss — skipping`);
        } else if (destCodeTimesOut(resolvedCode)) {
            // Straight to the hotel-code path, which is where this search was going to end up
            // anyway, without the seventeen seconds of waiting to be told so. Falls through
            // with otvCodes empty, exactly as a failed destination search would.
            console.log(`[tgx-search] Dest code "${resolvedCode}" has been timing out — going straight to hotel codes`);
        } else {
            const __t0 = Date.now();
            const filterSearch = getTgxFilterSearch();

            // The destination call goes to OTV on its own.
            //
            // It used to share a Promise.all with the portfolio fetch, which put two
            // concurrent requests on OTV for every search. OTV answered often enough to look
            // like it worked and failed often enough to be unexplainable: the same Phuket
            // search returned 249 hotels, then 24, then 20, because ALL_PROCESSES_FAILED
            // sent it down the hotel-code fallback on the runs that lost the race. v1 has
            // always asked once and only fetched the portfolio when the destination attempt
            // came back empty, which is why it answers 300 every time.
            //
            // Halving the concurrent load also matters beyond this function: OTV watches how
            // we call them, and a search that quietly doubled its own request count is the
            // kind of thing that gets an access code throttled.
            const destResult = await tgxGraphQL(CITY_SEARCH_QUERY, {
                criteria: { ...baseCriteria, destinations: [resolvedCode] },
                // The destination variant: without search_by_destination this call comes
                // back WRONG_FIELD/empty every time and the slow fallback below runs.
                settings: destSettings,
                filterSearch,
            }, ABORT_CITY_MS).catch((destErr: any) => {
                console.warn(`[tgx-search] Dest code "${resolvedCode}" threw (${destErr?.message?.slice(0, 80)}) — falling back to hotel codes`);
                unansweredReasons.push(`dest-code ${resolvedCode} threw (${String(destErr?.message).slice(0, 60)})`);
                return null;
            });
            console.log(`[tgx-search][TIMING] dest-code round-trip took ${Date.now() - __t0}ms`);

            // Only now, and only if it is actually needed: the portfolio is what the
            // hotel-code fallback runs on, so fetching it ahead of time spent an OTV call on
            // every successful search that never used the answer.
            const otv = { codes: [] as string[], contentMap: new Map<string, any>() };
            const destOptions: TgxOption[] = destResult?.data?.hotelX?.search?.options || [];
            const destErrors: any[]        = destResult?.data?.hotelX?.search?.errors  || [];
            const destWarnings: any[]      = destResult?.data?.hotelX?.search?.warnings || [];

            // Measured 2026-09-21, Phuket cold: 54 options returned alongside
            // "104 Connection timeout with supplier" after 14.9s. The hotels are real; the
            // list is not the whole list.
            if (isSupplierTimeout(destWarnings)) supplierCutShort = true;

            // A timeout that returned nothing is the one worth remembering. A partial answer
            // still answered, and rerouting away from it would cost us the hotels it did find.
            if (isSupplierTimeout(destWarnings) && destOptions.length === 0) {
                recordDestTimeout(resolvedCode);
            }
            const destMerchant = destOptions.filter(
                o => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
            );
            if (destMerchant.length > 0) {
                console.log(`[tgx-search] Dest-code search returned ${destMerchant.length} options, OTV portfolio ${otv.codes.length} hotels`);
                if (otv.codes.length > 0) {
                    const nullNames = otv.codes.filter(c => !otv.contentMap.get(c)?.name);
                    if (nullNames.length > 0) {
                        fetchEtgHotelNames(nullNames)
                            .then(etgNames => updateHotelNamesInDb(etgNames))
                            .catch(() => {});
                    }
                }
                // A destination answer is the answer. It is returned as it stands.
                //
                // This used to compare the answer against how many codes we hold for the city
                // and, where the catalogue was twice the size, throw the answer away and search
                // every code instead — on the grounds that a small result meant TGX's
                // destination zone was missing outer districts, and that v1 did the same.
                //
                // v1 does not do the same. It returns the destination results and seeds the
                // catalogue in the background for next time, which is a job nobody waits on.
                // What was ported was a blocking second supplier search on the traveller's
                // critical path, and it fired on every cold search, because OTV answers with
                // *availability* while our catalogue holds *every hotel that exists*. The
                // second is always larger, and a city where most rooms are taken makes it
                // larger still, so the rule never stopped firing.
                //
                // Measured 2026-09-21, Fukuoka cold: the destination search answered in 8.3s
                // with 54 hotels and no errors or warnings. The rule then spent 3.7s searching
                // all 762 catalogue codes and arrived at the same 54. Twelve seconds for an
                // answer that was complete at eight.
                //
                // Nothing is lost by trusting it. A destination search that came back short
                // *and* cut off is a different case, and still reaches the hotel-code path
                // through supplierCutShort and the collecting pass that follows it.
                return buildCityResults(destMerchant, cityName, countryCode, otv.contentMap, supplierCutShort);
            }
            if (otvCodes.length === 0) {
                // WRONG_FIELD/Empty hotels = TGX mapping gap (OTV was never called), and
                // the city may gain coverage once TGX mapping syncs. ALL_PROCESSES_FAILED
                // = every OTV connection failed to respond, which TGX documents as
                // transient and worth retrying. Blacklisting on either permanently skips
                // a destination code that is still valid, so neither is recorded.
                const isTransient = hasEmptyHotelsError(destErrors) ||
                    destErrors.some((e: any) => e.code === 'ALL_PROCESSES_FAILED');
                if (isTransient) {
                    const cause = destErrors[0]?.code ?? 'empty hotels';
                    console.warn(`[tgx-search] Dest code "${resolvedCode}" transient failure (${cause}) — not recorded as OTV miss`);
                    // The reasoning that keeps this out of the blacklist keeps it out of a
                    // No-Availability verdict too: OTV either timed out or was never
                    // called, so nothing has been learned about inventory.
                    //
                    // Unless the warnings say OTV answered. ALL_PROCESSES_FAILED covers "204 No
                    // results found" as well as a timeout, and a 204 is a real answer about a
                    // real city: calling it unanswered shows the traveller a supplier outage
                    // where the honest result is that nobody has a room.
                    const answered = destErrors.some((e: any) => e.code === 'ALL_PROCESSES_FAILED') &&
                        destWarnings.length > 0 && !isSupplierTimeout(destWarnings);
                    if (answered) {
                        console.warn(`[tgx-search] Dest code "${resolvedCode}" — OTV answered with no availability`);
                    } else {
                        unansweredReasons.push(`dest-code ${resolvedCode} transient (${cause})`);
                    }
                } else {
                    persistFailedDestCode(resolvedCode, cityName);
                    if (destErrors.length) {
                        console.warn(`[tgx-search] Dest code "${resolvedCode}" had errors — recorded as OTV miss`);
                    } else {
                        console.warn(`[tgx-search] Dest code "${resolvedCode}" returned 0 options — recorded as OTV miss`);
                    }
                }
            }
        }
    }

    console.warn(`[tgx-search] Dest-code empty for "${cityName}" — trying hotel-code search`);
    if (otvCodes.length === 0) otvCodes = await prefetchHotelCodes;

    if (otvCodes.length === 0) {
        console.log(`[tgx-search] DB empty for "${cityName}" — querying OTV portfolio`);
        const otv   = await fetchOtvHotelCodesByCity(cityName, resolvedCode ?? undefined, countryCode);
        otvCodes    = otv.codes;
        otvContentMap = otv.contentMap;
    } else {
        const sample        = otvCodes.slice(0, 20);
        const sampleContent = await fetchHotelContent(sample).catch(() => new Map<string, any>());
        const missingNames  = sample.filter(c => !sampleContent.get(c)?.name).length;
        if (missingNames > sample.length * 0.4) {
            console.log(`[tgx-search] ${missingNames}/${sample.length} hotels have no name — refreshing OTV portfolio`);
            const otv = await fetchOtvHotelCodesByCity(cityName, resolvedCode ?? undefined, countryCode);
            otvContentMap = otv.contentMap;
            if (otv.codes.length > 0) otvCodes = otv.codes;
        }
    }

    if (otvCodes.length > 0) {
        console.log(`[tgx-search] Searching TGX with ${otvCodes.length} OTV hotel codes for "${cityName}"`);

        const CHUNK       = 100;
        const CONCURRENCY = 4;
        const chunks: string[][] = [];
        for (let i = 0; i < otvCodes.length; i += CHUNK) chunks.push(otvCodes.slice(i, i + CHUNK));

        // One chunk failing must not discard the chunks that answered — a partial answer
        // is still a real answer for the hotels it covers. `Promise.all` rejected the
        // whole batch on a single timeout, which turned a partial result into an empty
        // one indistinguishable from a city with no availability.
        let unansweredChunks = 0;
        const runChunks = async (chunkList: string[][]): Promise<{ options: TgxOption[]; errors: any[]; warnings: any[] }[]> => {
            unansweredChunks = 0;
            const results: { options: TgxOption[]; errors: any[]; warnings: any[] }[] = [];
            for (let i = 0; i < chunkList.length; i += CONCURRENCY) {
                const batch = chunkList.slice(i, i + CONCURRENCY);
                const settled = await Promise.allSettled(batch.map(async chunk => {
                    const r = await tgxGraphQL(CITY_SEARCH_QUERY, {
                        criteria: { ...baseCriteria, hotels: chunk },
                        settings,
                        filterSearch: getTgxFilterSearch(),
                    }, ABORT_CITY_MS);
                    return {
                        options:  (r?.data?.hotelX?.search?.options  || []) as TgxOption[],
                        errors:   (r?.data?.hotelX?.search?.errors   || []) as any[],
                        warnings: (r?.data?.hotelX?.search?.warnings || []) as any[],
                    };
                }));
                for (const s of settled) {
                    if (s.status === 'fulfilled') results.push(s.value);
                    else unansweredChunks++;
                }
            }
            return results;
        };

        try {
            let chunkResults    = await runChunks(chunks);
            let fallbackOptions: TgxOption[] = chunkResults.flatMap(r => r.options);
            const fallbackErrors: any[]      = chunkResults.flatMap(r => r.errors);
            const fallbackWarnings: any[]    = chunkResults.flatMap(r => r.warnings);
            const allProcessesFailed = fallbackErrors.some(e => e.code === 'ALL_PROCESSES_FAILED');

            // Only a timeout is worth asking again. ALL_PROCESSES_FAILED also covers "204 No
            // results found", which is OTV telling us it has nothing for these hotels on these
            // dates — a final answer. Re-asking cost a 3s wait and a second full round of
            // chunk requests to be told the same thing, on exactly the searches that were
            // already the slowest.
            const retryable = hasEmptyHotelsError(fallbackErrors) ||
                (allProcessesFailed && isSupplierTimeout(fallbackWarnings));

            if (retryable && fallbackOptions.length === 0) {
                const waitMs = allProcessesFailed ? 3000 : 1000;
                console.log(`[tgx-search] Hotel-code search timed out — retrying in ${waitMs}ms`);
                await new Promise(r => setTimeout(r, waitMs));
                chunkResults    = await runChunks(chunks);
                fallbackOptions = chunkResults.flatMap(r => r.options);
            }

            if (unansweredChunks > 0) {
                unansweredReasons.push(`${unansweredChunks}/${chunks.length} hotel-code batches did not answer`);
                supplierCutShort = true;
            }

            const fallbackMerchant = fallbackOptions.filter(
                o => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
            );
            if (fallbackMerchant.length > 0) {
                return buildCityResults(fallbackMerchant, cityName, countryCode, otvContentMap, supplierCutShort);
            }
        } catch (tgxErr: any) {
            console.warn(`[tgx-search] Hotel-code search threw for "${cityName}" — falling through to ETG: ${tgxErr.message}`);
            unansweredReasons.push(`hotel-code fallback errored (${tgxErr.message?.slice(0, 60)})`);
        }
    } else {
        // Nothing to ask about. The catalog is empty for this city and the OTV portfolio
        // query returned nothing either, so no hotel was ever put to the supplier.
        unansweredReasons.push('no catalog hotel codes to fall back on');
    }

    // ETG B2B direct fallback
    console.warn(`[tgx-search] OTV yielded no results for "${cityName}" — trying ETG direct search`);
    const etgResult = await searchEtgCity(cityName, searchParams);
    if (etgResult.data.length > 0) {
        console.log(`[tgx-search] ETG fallback: ${etgResult.data.length} hotels for "${cityName}"`);
        return etgResult;
    }

    // Nothing came back. Whether that is an answer or a silence decides what the user
    // sees: a No-Availability result prunes the Phase 1 catalog, an Unanswered Search
    // leaves it on screen and reports that prices could not be loaded.
    if (unansweredReasons.length > 0) {
        throw new UnansweredSearchError(cityName, unansweredReasons.join('; '));
    }

    return buildCityResults([], cityName, countryCode);
}

// ─── Core runTgxSearch ────────────────────────────────────────────────────────

/**
 * Search hotels, live, every time.
 *
 * Every caller — the search stream, the property page, a booking re-quote — gets the
 * supplier's answer as of now. Nothing is replayed from an earlier search; see
 * `buildSearchKey` for why the result cache was removed.
 *
 * The one sharing left: an identical search already in flight is joined rather than
 * duplicated, so a customer double-clicking, or two tabs opening together, cost one
 * supplier call and both get the same live answer.
 */
/**
 * Cut a supplier answer back to the extent the traveller asked for.
 *
 * A sub-area is searched as its parent city, because OTV serves only the City rung (ADR-0006),
 * so the answer is always the city's. Applied here, at the one exit every path leaves through:
 * the city-name fallback returns from three places of its own, and a filter sitting on one of
 * them bounded the pins while letting 305 hotels from the rest of London onto a Camden page.
 *
 * On a copy, never in place — the promise is shared between concurrent searches (below), and
 * two callers may be asking about different extents of the same city.
 */
function boundToSubArea(result: HotelSearchResult, params: HotelSearchParams): HotelSearchResult {
    const box = subAreaBbox(params);
    if (!box) return result;

    const [west, south, east, north] = box;
    // A hotel with no coordinates cannot be placed, so it is kept rather than discarded: the
    // catalog beside it knows where it is even when the supplier's record does not.
    const inBox = (h: any) => {
        const lat = Number(h.lat ?? h.coordinates?.lat);
        const lng = Number(h.lng ?? h.coordinates?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
        return lat >= south && lat <= north && lng >= west && lng <= east;
    };

    const data = (result.data ?? []).filter(inBox);
    if (data.length === (result.data ?? []).length) return result;

    console.log(`[tgx-search] sub-area bound: kept ${data.length} of ${(result.data ?? []).length} supplier hotels`);
    return {
        ...result,
        data,
        allMappable: (result.allMappable ?? []).filter(inBox),
        totalCount:  data.length,
    };
}

export async function runTgxSearch(params: HotelSearchParams): Promise<HotelSearchResult> {
    const key = buildSearchKey(params);

    const existing = _inflight.get(key);
    if (existing) {
        console.log(`[tgx-search] JOIN ${key} — sharing the live search already in flight`);
        return boundToSubArea(await existing, params);
    }

    // One line per supplier search, so volume is visible now that every search is one.
    console.log(`[tgx-search] LIVE ${key}`);

    const promise = _runTgxSearch(params).finally(() => {
        // Only if it is still ours: a later search for the same key must not be dropped.
        if (_inflight.get(key) === promise) _inflight.delete(key);
    });

    _inflight.set(key, promise);
    return boundToSubArea(await promise, params);
}

async function _runTgxSearch(params: HotelSearchParams): Promise<HotelSearchResult> {
    const {
        checkin, checkout,
        adults = 2, children = 0, childrenAges,
        destinationCode, cityName, countryCode, hotelCode,
        guest_nationality = 'KR',
        rung, bbox, areaRung,
    } = params;

    const currency    = 'USD';
    // OTV's stated Search limit is 12,000ms. Sending more than the supplier will ever use
    // just buys dead time on a call it was never going to answer — and runCityFallback can
    // chain a destination search with a hotel-code one, so that time is paid twice.
    //
    // Two blocks, because the plugins differ by what is being asked for: a destination code
    // has to be translated into hotel codes before OTV sees it, while a hotel-code search
    // already names them. Both convert currency. See getTgxSettings for what each plugin
    // does and what happens without it.
    const tgxCfg      = getTgxConfig();
    const destSettings  = getTgxSettings(tgxCfg, SUPPLIER_SEARCH_TIMEOUT_MS, true,  currency);
    const hotelSettings = getTgxSettings(tgxCfg, SUPPLIER_SEARCH_TIMEOUT_MS, false, currency);
    const settings      = hotelSettings;
    const occupancies = buildOccupancies(Number(adults), Number(children), childrenAges);

    // Province/country rungs: ETG region search handles these better than TGX city lookup.
    if ((rung === 'province' || rung === 'country') && cityName) {
        return searchEtgCity(cityName, params);
    }

    let destinations: string[] | undefined;
    let hotels: string[] | undefined;

    if (hotelCode) {
        hotels = [String(hotelCode)];
    } else if (destinationCode) {
        destinations = [String(destinationCode)];
    } else if (cityName) {
        const baseCriteria = { checkIn: checkin, checkOut: checkout, occupancies, nationality: guest_nationality, currency };
        return runCityFallback(
            cityName, countryCode, baseCriteria, destSettings, hotelSettings,
            resolveTgxDestinationCode(cityName, prisma, countryCode).catch(() => undefined),
            fetchHotelCodesByLocation(cityName, countryCode, params.lat, params.lng).catch(() => []),
            params,
        );
    } else {
        throw new Error('destinationCode, hotelCode, or cityName is required');
    }

    const criteria = {
        checkIn: checkin, checkOut: checkout, occupancies,
        nationality: guest_nationality, currency,
        ...(hotels ? { hotels } : { destinations }),
    };

    const gqlQuery  = hotelCode ? HOTEL_SEARCH_QUERY : CITY_SEARCH_QUERY;
    const gqlResult = await tgxGraphQL(gqlQuery, {
        criteria,
        // A destinations criteria needs translating; a hotels one does not.
        settings: hotels ? hotelSettings : destSettings,
        filterSearch: getTgxFilterSearch(),
    }, hotelCode ? ABORT_HOTEL_MS : ABORT_CITY_MS);

    const options: TgxOption[] = gqlResult?.data?.hotelX?.search?.options || [];
    const gqlErrors            = gqlResult?.data?.hotelX?.search?.errors  || [];

    if (hasEmptyHotelsError(gqlErrors) && !hotelCode && cityName) {
        const baseCriteria = { checkIn: checkin, checkOut: checkout, occupancies, nationality: guest_nationality, currency };
        return runCityFallback(
            cityName, countryCode, baseCriteria, destSettings, hotelSettings,
            Promise.resolve(undefined),
            fetchHotelCodesByLocation(cityName, countryCode, params.lat, params.lng).catch(() => []),
            params,
        );
    }

    if (gqlErrors.length) {
        console.warn('[tgx-search] GraphQL errors:', gqlErrors.map((e: any) => e.description || e.code).join(', '));
    }

    const merchantOptions = options.filter(
        o => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
    );

    // Single hotel mode
    if (hotelCode) {
        const roomTypes = merchantOptions
            .sort((a, b) => (a.price.gross || a.price.net) - (b.price.gross || b.price.net))
            .map(normalizeOption);

        const [contentMap, reviewMap] = await Promise.all([
            fetchHotelContent([String(hotelCode)]).catch(() => new Map<string, any>()),
            fetchHotelReviews([String(hotelCode)]).catch(() => new Map<string, any>()),
        ]);
        const content      = contentMap.get(String(hotelCode));
        const reviews      = reviewMap.get(String(hotelCode));
        const imageList    = content?.images ?? [];
        const reviewRating = Number(reviews?.rating ?? content?.review_rating ?? 0);

        return {
            data: [{
                roomTypes,
                hotelId:     String(hotelCode),
                id:          String(hotelCode),
                name:        content?.name || String(hotelCode),
                images:      imageList,
                image:       imageList[0] ?? '',
                lat:         Number(content?.lat ?? 0),
                lng:         Number(content?.lng ?? 0),
                coordinates: { lat: Number(content?.lat ?? 0), lng: Number(content?.lng ?? 0) },
                address:     content?.address ?? '',
                city:        content?.city ?? '',
                country:     content?.country ?? '',
                description: content?.description ?? '',
                amenities:   Array.isArray(content?.amenities) ? content.amenities : [],
                starRating:  content?.star_rating ?? 0,
                reviewRating,
                rating:      reviewRating,
                reviewCount: reviews?.reviews_count ?? content?.review_count ?? 0,
                reviews:     reviews?.reviews_count ?? content?.review_count ?? 0,
                price:       0,
                currency:    'USD',
                offerId:     '',
                location:    content?.address ?? '',
                boardCode:   '',
            }] as any[],
            allMappable: [],
            totalCount: roomTypes.length,
        };
    }

    const cityResult = await buildCityResults(merchantOptions, cityName, countryCode);

    // Bounding happens once, on the way out of runTgxSearch — this is only one of the four
    // places a city search can return from.
    return cityResult;
}

async function buildCityResults(
    merchantOptions: TgxOption[],
    cityName?: string,
    countryCode?: string,
    preloadedContent: Map<string, any> = new Map(),
    truncated = false,
): Promise<HotelSearchResult> {
    const byHotel = new Map<string, TgxOption>();
    for (const opt of merchantOptions) {
        const existing = byHotel.get(opt.hotelCode);
        const price    = opt.price.gross || opt.price.net;
        if (!existing || price < (existing.price.gross || existing.price.net)) {
            byHotel.set(opt.hotelCode, opt);
        }
    }

    // Cheapest first, and capped at 300 to protect the client's memory and render budget.
    //
    // The format filter comes before the cap, not after. OTV occasionally answers with codes
    // in neither of its own shapes — LiteAPI slugs, mostly — and TGX has no availability under
    // them, so each one becomes a card that can never be booked. Filtering after the slice
    // would be worse than not filtering at all: the bad codes would still consume places in
    // the 300, and real bookable hotels would be pushed out to make room for them.
    const rankedCodes = Array.from(byHotel.entries())
        .filter(([code]) => /^\d+$/.test(code) || /^[A-Z]{2}\d+$/.test(code))
        .sort(([, a], [, b]) => (a.price.gross || a.price.net) - (b.price.gross || b.price.net))
        .slice(0, 300)
        .map(([code]) => code);

    const [rankedContent, reviewMap] = await Promise.all([
        fetchHotelContent(rankedCodes, true).catch(() => new Map<string, any>()),  // search cards — see fetchHotelContent
        fetchHotelReviews(rankedCodes).catch(() => new Map<string, any>()),
    ]);

    // A TGX destination code for one city sometimes answers with another's hotels — the
    // code for Paris also returns Paris, Texas. A hotel is dropped only where its stored
    // country and its coordinates agree that it is somewhere else; anything uncatalogued,
    // or with no coordinates, is kept, because a hotel we have not catalogued yet may well
    // be a real one in the right place. See isConfirmedOutOfCountry.
    const hotelCodes = !countryCode ? rankedCodes : rankedCodes.filter(code => {
        const c = rankedContent.get(code) ?? preloadedContent.get(code);
        if (!c) return true;
        return !isConfirmedOutOfCountry(
            { country: c.country, city: c.city, lat: c.lat ?? c.latitude, lng: c.lng ?? c.longitude },
            countryCode,
        );
    });
    if (hotelCodes.length < rankedCodes.length) {
        console.warn(`[tgx-search] buildCityResults: dropped ${rankedCodes.length - hotelCodes.length} confirmed out-of-country hotels for "${cityName}" (${countryCode})`);
    }
    const contentMap = rankedContent;

    if (hotelCodes.length > 0) {
        const noNameCodes = hotelCodes.filter(c => !contentMap.get(c)?.name && !preloadedContent.get(c)?.name);
        if (noNameCodes.length >= hotelCodes.length * 0.3) {
            try {
                const etgNames = await fetchEtgHotelNames(noNameCodes);
                if (etgNames.size > 0) {
                    for (const [code, name] of etgNames) {
                        const row = contentMap.get(code);
                        if (row) { row.name = row.name || name; }
                        else { preloadedContent.set(code, { ...(preloadedContent.get(code) ?? {}), name }); }
                    }
                    updateHotelNamesInDb(etgNames).catch(() => {});
                }
            } catch (e: any) {
                console.warn('[tgx-search] ETG name enrichment skipped:', e.message);
            }
        }

        // Enrich amenities from ETG for hotels missing them.
        // Fire-and-forget — results are cached to DB so subsequent searches return them instantly.
        const stocked = new Set((await prisma.$queryRaw<{ hotel_id: string }[]>`
            SELECT hotel_id FROM hotel_content
            WHERE hotel_id = ANY(${hotelCodes})
              AND jsonb_typeof(amenities) = 'array'
              AND jsonb_array_length(amenities) > 0
        `.catch(() => [])).map(r => r.hotel_id));
        const noAmenityCodes = hotelCodes.filter(c => {
            if (stocked.has(c)) return false;
            const a = preloadedContent.get(c)?.amenities;
            return !Array.isArray(a) || a.length === 0;
        });
        console.log(`[amenity-enrich] ${noAmenityCodes.length}/${hotelCodes.length} hotels need amenities`);
        if (noAmenityCodes.length > 0) {
            const isNumeric = /^\d+$/.test(noAmenityCodes[0] ?? '');
            console.log(`[amenity-enrich] ID type: ${isNumeric ? 'numeric (TGX)' : 'slug (ETG)'}, total: ${noAmenityCodes.length}`);
            (async () => {
                try {
                    const amenityMap = new Map<string, string[]>();
                    if (isNumeric) {
                        const etgResults  = await fetchEtgAmenitiesByHids(noAmenityCodes);
                        const slugUpdates = new Map<string, string>();
                        const contentMapEtg = new Map<string, EtgHotelContent>();
                        for (const [id, { content, amenities, slug }] of etgResults) {
                            if (amenities.length) amenityMap.set(id, amenities);
                            if (slug) slugUpdates.set(id, slug);
                            if (Object.keys(content).length) contentMapEtg.set(id, content);
                        }
                        if (slugUpdates.size > 0) {
                            for (const [hotelId, slug] of slugUpdates) {
                                prisma.hotel_content.updateMany({
                                    where: { hotel_id: hotelId },
                                    data:  { ratehawk_hid: slug },
                                }).catch(() => {});
                            }
                        }
                        // Persist name and description as well as amenities. This is
                        // what stops the next request re-fetching the same hotel, and
                        // it is the only path that fills `description` for a catalog
                        // whose ids are all numeric.
                        if (contentMapEtg.size > 0) {
                            new HotelsRepository().upsertEtgContent(contentMapEtg).catch(() => {});
                        }
                        const withDesc = [...contentMapEtg.values()].filter(c => c.description).length;
                        console.log(`[amenity-enrich] ETG hid lookup: ${amenityMap.size} with amenities, ${withDesc} with description, of ${noAmenityCodes.length}`);
                    } else {
                        // One call for name, description and amenities rather than
                        // fetching amenities alone. Description is the reason: 96.9%
                        // of the catalog has none, so property pages render with no
                        // prose at all, and ETG returns it in the same response we
                        // were already paying for.
                        //
                        // Amenities here come from `serp_filters`, ETG's own facet
                        // vocabulary — smaller and cleaner than `amenity_groups`,
                        // and what v1 reads.
                        const etgContent = await fetchEtgHotelContent(noAmenityCodes);
                        for (const [id, c] of etgContent) {
                            if (c.amenities?.length) amenityMap.set(id, c.amenities);
                        }
                        console.log(`[amenity-enrich] ETG returned content for ${etgContent.size} hotels`);
                        // Persisted whole, so the next request for any of these
                        // hotels serves from the catalog instead of calling ETG again.
                        if (etgContent.size > 0) {
                            new HotelsRepository().upsertEtgContent(etgContent).catch(() => {});
                        }
                    }
                    if (amenityMap.size > 0) {
                        updateHotelAmenitiesInDb(amenityMap).catch(() => {});
                    }
                } catch { /* non-fatal */ }
            })();
        }
    }

    const hotels_result = hotelCodes.map(code => {
        const opt          = byHotel.get(code)!;
        const content      = contentMap.get(code) ?? preloadedContent.get(code);
        const reviews      = reviewMap.get(code);
        const tokenId      = opt.token || opt.id;
        const reviewRating = Number(reviews?.rating ?? content?.review_rating ?? 0);
        // One image, not the set. A card renders the first and there is no carousel on
        // it, so the rest are URLs nothing displays — the same trim the instant catalog
        // already makes. The property page fetches its own full row.
        const imageList: string[] = (content?.images ?? []).slice(0, 1);
        return {
            hotelId:      code,
            id:           code,
            name:         content?.name || preloadedContent.get(code)?.name || code,
            price:        opt.price.gross || opt.price.net,
            currency:     opt.price.currency,
            offerId:      `TGX:${tokenId}`,
            refundableTag: toRefundableTag(opt.cancelPolicy?.refundable),
            starRating:   content?.star_rating ?? 0,
            images:       imageList,
            image:        imageList[0] ?? '',
            lat:          Number(content?.lat ?? 0),
            lng:          Number(content?.lng ?? 0),
            coordinates:  { lat: Number(content?.lat ?? 0), lng: Number(content?.lng ?? 0) },
            address:      content?.address ?? '',
            location:     content?.address ?? '',
            city:         content?.city ?? cityName ?? '',
            country:      hotelCountry(content?.country, content?.city, content?.lat, content?.lng) || countryCode || '',
            description:  content?.description ?? '',
            amenities:    content?.amenities?.length ? content.amenities : (preloadedContent.get(code)?.amenities ?? []),
            reviewRating,
            rating:       reviewRating,
            reviews:      reviews?.reviews_count ?? content?.review_count ?? 0,
            reviewCount:  reviews?.reviews_count ?? content?.review_count ?? 0,
            checkInTime:  content?.check_in_time ?? null,
            checkOutTime: content?.check_out_time ?? null,
            boardCode:    opt.boardCode,
            roomTypes:    [normalizeOption(opt)],
            _tgxToken:    opt.token,
        };
    });

    const seenNames = new Set<string>();
    const deduped   = hotels_result.filter(h => {
        if (!h.name || h.name === h.hotelId) return true;
        const key = normalizeHotelName(h.name);
        if (seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
    });

    const allMappable = deduped.filter(h => h.lat && h.lng);
    return { data: deduped, allMappable, totalCount: deduped.length, truncated };
}
