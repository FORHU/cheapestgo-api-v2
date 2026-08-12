/**
 * TravelgateX hotel search — core logic ported from the Next.js monolith.
 * Handles caching, OTV portfolio queries, ETG fallback, and result normalization.
 */

import { prisma } from '@/lib/prisma';
import {
    tgxGraphQL, getTgxSettings, getTgxConfig, getTgxFilterSearch, buildOccupancies,
    normalizeOption, resolveTgxDestinationCode, fetchAmenitiesByHotelCodes,
    type TgxOption,
} from './travelgatex';
import { otvCodeToLabel } from './amenityCodes';
import { resolveHotelDbCity } from '@/lib/cityAliases';
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

// ─── Instant hotel catalog from hotel_content ─────────────────────────────────

export async function getInstantHotelCatalog(body: HotelSearchParams): Promise<any[]> {
    const cityName: string = body.cityName ?? '';
    const countryCode: string = body.countryCode ?? '';
    if (!cityName) return [];

    try {
        const cityOnly   = cityName.split(',')[0].trim();
        const normalized = cityOnly.replace(/-(si|do|gu|gun|eup)$/i, '').trim();
        const isoCode    = resolveIsoCode(countryCode);
        const dbCity     = resolveHotelDbCity(normalized, isoCode || countryCode);

        const where: any = {
            city: { contains: dbCity, mode: 'insensitive' },
            images: { isEmpty: false },
        };
        if (isoCode) {
            where.country = { equals: isoCode, mode: 'insensitive' };
        }

        const rows = await prisma.hotel_content.findMany({
            where,
            orderBy: { review_count: { sort: 'desc', nulls: 'last' } },
            take: 300,
            select: {
                hotel_id: true, name: true, images: true, star_rating: true,
                lat: true, lng: true, address: true, city: true, country: true,
                description: true, amenities: true, review_rating: true, review_count: true,
            },
        });

        return rows.map((r: any) => ({
            hotelId:      r.hotel_id,
            id:           r.hotel_id,
            name:         r.name || r.hotel_id,
            price:        0,
            currency:     'USD',
            images:       r.images ?? [],
            image:        (r.images as string[] | null)?.[0] ?? '',
            starRating:   r.star_rating ?? 0,
            reviewRating: Number(r.review_rating ?? 0),
            rating:       Number(r.review_rating ?? 0),
            reviewCount:  Number(r.review_count ?? 0),
            reviews:      Number(r.review_count ?? 0),
            lat:          Number(r.lat ?? 0),
            lng:          Number(r.lng ?? 0),
            coordinates:  { lat: Number(r.lat ?? 0), lng: Number(r.lng ?? 0) },
            address:      r.address ?? '',
            location:     r.address ?? '',
            city:         r.city ?? cityName,
            country:      r.country ?? '',
            description:  r.description ?? '',
            amenities:    Array.isArray(r.amenities) ? r.amenities : [],
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

// ─── Cache helpers ────────────────────────────────────────────────────────────

export const POPULAR_CITIES = new Set([
    'tokyo', 'bangkok', 'seoul', 'singapore', 'paris',
    'london', 'new york', 'dubai', 'barcelona', 'bali',
]);

export function isPopularCity(cityName: string): boolean {
    return POPULAR_CITIES.has(cityName.toLowerCase().trim());
}

export function getEffectiveTtl(cityName?: string): number {
    const standardTtl = parseInt(process.env.HOTEL_SEARCH_CACHE_TTL_MINUTES          ?? '120', 10);
    const popularTtl  = parseInt(process.env.HOTEL_SEARCH_CACHE_TTL_POPULAR_MINUTES   ?? '360', 10);
    return cityName && isPopularCity(cityName) ? popularTtl : standardTtl;
}

function buildHotelCacheKey(p: HotelSearchParams): string {
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

async function getHotelSearchCache(key: string, ttlMinutes: number): Promise<{ result: any; stale: boolean } | null> {
    try {
        const now        = new Date();
        const graceLimit = new Date(now.getTime() - ttlMinutes * 60 * 1000);
        const row = await prisma.hotel_search_cache.findFirst({
            where: {
                cache_key:  key,
                expires_at: { gt: graceLimit },
            },
        });
        if (!row) return null;
        return { result: row.result as any, stale: row.expires_at <= now };
    } catch {
        return null;
    }
}

async function setHotelSearchCache(key: string, result: any, ttlMinutes: number): Promise<void> {
    try {
        const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
        await prisma.hotel_search_cache.upsert({
            where:  { cache_key: key },
            create: { cache_key: key, result, expires_at: expiresAt, created_at: new Date() },
            update: { result, expires_at: expiresAt, created_at: new Date() },
        });
    } catch (e: any) {
        console.error('[hotel-cache] Write failed:', e.message);
    }
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
    }
  }
}`;

// ─── DB enrichment ────────────────────────────────────────────────────────────

async function fetchHotelContent(hotelCodes: string[]) {
    if (!hotelCodes.length) return new Map<string, any>();
    const rows = await prisma.hotel_content.findMany({
        where: { hotel_id: { in: hotelCodes } },
        select: {
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

async function fetchHotelCodesByCity(cityName: string, countryCode?: string): Promise<string[]> {
    const cityOnly   = cityName.split(',')[0].trim();
    const normalized = cityOnly.replace(/-(si|do|gu|gun|eup)$/i, '').trim();
    const isoCode    = countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? countryCode : null;

    const where: any = { city: { contains: normalized, mode: 'insensitive' } };
    if (isoCode) where.country = { equals: isoCode, mode: 'insensitive' };

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

async function fetchEtgAmenitiesBatch(hotelIds: string[]): Promise<Map<string, string[]>> {
    const amenityMap = new Map<string, string[]>();
    if (!hotelIds.length) return amenityMap;
    const keyId  = process.env.ETG_KEY_ID;
    const apiKey = process.env.ETG_API_KEY;
    if (!keyId || !apiKey) return amenityMap;
    const token = Buffer.from(`${keyId}:${apiKey}`).toString('base64');
    const BATCH = 50;
    for (let i = 0; i < hotelIds.length; i += BATCH) {
        const batch = hotelIds.slice(i, i + BATCH);
        try {
            const abort   = new AbortController();
            const timeout = setTimeout(() => abort.abort(), 8_000);
            const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
                method:  'POST',
                headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ ids: batch, language: 'en' }),
                signal:  abort.signal,
            });
            clearTimeout(timeout);
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                console.warn(`[amenity-enrich] ETG batch ${res.status}:`, body.slice(0, 300));
                continue;
            }
            const json: any    = await res.json();
            const hotels: any[] = json?.data?.hotels ?? json?.hotels ?? [];
            for (const h of hotels) {
                const id = String(h.id ?? h.hotel_id ?? '');
                if (!id) continue;
                const amenities: string[] = (h.amenity_groups ?? [])
                    .flatMap((g: any) => g.amenities ?? [])
                    .filter((a: any) => typeof a === 'string' && a.length > 0);
                if (amenities.length) amenityMap.set(id, amenities);
            }
        } catch (e: any) {
            if (e?.name !== 'AbortError') console.warn('[amenity-enrich] ETG batch failed:', e.message);
        }
    }
    return amenityMap;
}

// Fetch amenities for numeric RateHawk hids via ETG hotel/info (hid field).
// Returns Map<hotelId(string), amenities[]>. Also returns resolved slug per hotel
// so callers can persist it to ratehawk_hid for future batch calls.
async function fetchEtgAmenitiesByHids(
    hotelIds: string[],
): Promise<Map<string, { amenities: string[]; slug: string }>> {
    const result = new Map<string, { amenities: string[]; slug: string }>();
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
                const amenities: string[] = (d.amenity_groups ?? [])
                    .flatMap((g: any) => g.amenities ?? [])
                    .filter((a: any) => typeof a === 'string' && a.length > 0);
                if (amenities.length || d.id) {
                    result.set(id, { amenities, slug: d.id ?? '' });
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

async function fetchOtvHotelCodesByCity(cityName: string, destinationCode?: string): Promise<{ codes: string[]; contentMap: Map<string, any> }> {
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
            backfillHotelContent(contentMap).catch((err: any) =>
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

// ─── In-flight dedup ──────────────────────────────────────────────────────────

const _inflight           = new Map<string, Promise<any>>();
const _backgroundRefreshing = new Set<string>();

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

async function runCityFallback(
    cityName: string,
    countryCode: string | undefined,
    baseCriteria: Record<string, unknown>,
    settings: ReturnType<typeof getTgxSettings>,
    prefetchDestCode: Promise<string | undefined>,
    prefetchHotelCodes: Promise<string[]>,
    searchParams: HotelSearchParams,
): Promise<HotelSearchResult> {
    await loadFailedDestCodes();

    console.warn(`[tgx-search] OTV destination search empty for "${cityName}" — resolving TGX dest code`);
    const resolvedCode = await prefetchDestCode;
    if (resolvedCode) {
        console.log(`[tgx-search] Got TGX dest code "${resolvedCode}" for "${cityName}"`);
        if (_failedDestCodes.has(resolvedCode)) {
            console.log(`[tgx-search] Dest code "${resolvedCode}" is a known OTV miss — skipping`);
        } else {
            const __t0 = Date.now();
            const filterSearch = getTgxFilterSearch();
            const [destResult, otv] = await Promise.all([
                tgxGraphQL(CITY_SEARCH_QUERY, {
                    criteria: { ...baseCriteria, destinations: [resolvedCode] },
                    settings,
                    filterSearch,
                }),
                cityName
                    ? fetchOtvHotelCodesByCity(cityName, resolvedCode).catch(() => ({ codes: [] as string[], contentMap: new Map<string, any>() }))
                    : Promise.resolve({ codes: [] as string[], contentMap: new Map<string, any>() }),
            ]);
            console.log(`[tgx-search][TIMING] dest+portfolio round-trip took ${Date.now() - __t0}ms`);
            const destOptions: TgxOption[] = destResult?.data?.hotelX?.search?.options || [];
            const destErrors: any[]        = destResult?.data?.hotelX?.search?.errors  || [];
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
                return buildCityResults(destMerchant, cityName, countryCode, otv.contentMap);
            }
            // WRONG_FIELD/Empty hotels = TGX mapping gap (OTV was never called).
            // Don't blacklist — the city may have OTV coverage once TGX mapping syncs.
            if (!hasEmptyHotelsError(destErrors)) {
                persistFailedDestCode(resolvedCode, cityName);
                if (destErrors.length) {
                    console.warn(`[tgx-search] Dest code "${resolvedCode}" had errors — recorded as OTV miss`);
                } else {
                    console.warn(`[tgx-search] Dest code "${resolvedCode}" returned 0 options — recorded as OTV miss`);
                }
            } else {
                console.warn(`[tgx-search] Dest code "${resolvedCode}" has TGX mapping gap (Empty hotels) — not recorded as OTV miss`);
            }
        }
    }

    console.warn(`[tgx-search] Dest-code empty for "${cityName}" — trying hotel-code search`);
    let otvCodes      = await prefetchHotelCodes;
    let otvContentMap = new Map<string, any>();

    if (otvCodes.length === 0) {
        console.log(`[tgx-search] DB empty for "${cityName}" — querying OTV portfolio`);
        const otv   = await fetchOtvHotelCodesByCity(cityName, resolvedCode ?? undefined);
        otvCodes    = otv.codes;
        otvContentMap = otv.contentMap;
    } else {
        const sample        = otvCodes.slice(0, 20);
        const sampleContent = await fetchHotelContent(sample).catch(() => new Map<string, any>());
        const missingNames  = sample.filter(c => !sampleContent.get(c)?.name).length;
        if (missingNames > sample.length * 0.4) {
            console.log(`[tgx-search] ${missingNames}/${sample.length} hotels have no name — refreshing OTV portfolio`);
            const otv = await fetchOtvHotelCodesByCity(cityName, resolvedCode ?? undefined);
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

        const runChunks = async (chunkList: string[][]): Promise<{ options: TgxOption[]; errors: any[] }[]> => {
            const results: { options: TgxOption[]; errors: any[] }[] = [];
            for (let i = 0; i < chunkList.length; i += CONCURRENCY) {
                const batch = chunkList.slice(i, i + CONCURRENCY);
                const batchResults = await Promise.all(batch.map(async chunk => {
                    const r = await tgxGraphQL(CITY_SEARCH_QUERY, {
                        criteria: { ...baseCriteria, hotels: chunk },
                        settings,
                        filterSearch: getTgxFilterSearch(),
                    });
                    return {
                        options: (r?.data?.hotelX?.search?.options || []) as TgxOption[],
                        errors:  (r?.data?.hotelX?.search?.errors  || []) as any[],
                    };
                }));
                results.push(...batchResults);
            }
            return results;
        };

        try {
            let chunkResults    = await runChunks(chunks);
            let fallbackOptions: TgxOption[] = chunkResults.flatMap(r => r.options);
            const fallbackErrors: any[]      = chunkResults.flatMap(r => r.errors);
            const allProcessesFailed = fallbackErrors.some(e => e.code === 'ALL_PROCESSES_FAILED');

            if ((hasEmptyHotelsError(fallbackErrors) || allProcessesFailed) && fallbackOptions.length === 0) {
                const waitMs = allProcessesFailed ? 3000 : 1000;
                console.log(`[tgx-search] Hotel-code search failed — retrying in ${waitMs}ms`);
                await new Promise(r => setTimeout(r, waitMs));
                chunkResults    = await runChunks(chunks);
                fallbackOptions = chunkResults.flatMap(r => r.options);
            }

            const fallbackMerchant = fallbackOptions.filter(
                o => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK')
            );
            if (fallbackMerchant.length > 0) {
                return buildCityResults(fallbackMerchant, cityName, countryCode, otvContentMap);
            }
        } catch (tgxErr: any) {
            console.warn(`[tgx-search] Hotel-code search threw for "${cityName}" — falling through to ETG: ${tgxErr.message}`);
        }
    }

    // ETG B2B direct fallback
    console.warn(`[tgx-search] OTV yielded no results for "${cityName}" — trying ETG direct search`);
    const etgResult = await searchEtgCity(cityName, searchParams);
    if (etgResult.data.length > 0) {
        console.log(`[tgx-search] ETG fallback: ${etgResult.data.length} hotels for "${cityName}"`);
        return etgResult;
    }

    return buildCityResults([], cityName, countryCode);
}

// ─── Core runTgxSearch ────────────────────────────────────────────────────────

export async function runTgxSearch(params: HotelSearchParams): Promise<HotelSearchResult> {
    const key = buildHotelCacheKey(params);
    const ttl = getEffectiveTtl(params.cityName);

    if (ttl > 0) {
        const cached = await getHotelSearchCache(key, ttl);
        if (cached !== null) {
            if (!cached.stale) {
                console.log(`[hotel-cache] HIT ${key}`);
                return cached.result;
            }
            console.log(`[hotel-cache] STALE ${key} — serving stale, refreshing in background`);
            if (!_inflight.has(key) && !_backgroundRefreshing.has(key)) {
                _backgroundRefreshing.add(key);
                _runTgxSearch(params)
                    .then(result => {
                        if (Array.isArray(result?.data) && result.data.length > 0) {
                            setHotelSearchCache(key, result, ttl).catch(() => {});
                        }
                    })
                    .catch((e: any) => console.error('[hotel-cache] Background refresh failed:', e.message))
                    .finally(() => _backgroundRefreshing.delete(key));
            }
            return cached.result;
        }
    }

    const existing = _inflight.get(key);
    if (existing) {
        console.log(`[hotel-cache] INFLIGHT ${key} — waiting for in-progress search`);
        return existing;
    }

    const promise = _runTgxSearch(params)
        .then(result => {
            if (ttl > 0 && Array.isArray(result?.data) && result.data.length > 0) {
                setHotelSearchCache(key, result, ttl).catch(() => {});
            }
            return result;
        })
        .finally(() => { _inflight.delete(key); });

    _inflight.set(key, promise);
    return promise;
}

async function _runTgxSearch(params: HotelSearchParams): Promise<HotelSearchResult> {
    const {
        checkin, checkout,
        adults = 2, children = 0, childrenAges,
        destinationCode, cityName, countryCode, hotelCode,
        guest_nationality = 'KR',
        rung, bbox,
    } = params;

    const currency    = 'USD';
    const settings    = getTgxSettings();
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
            cityName, countryCode, baseCriteria, settings,
            resolveTgxDestinationCode(cityName, prisma).catch(() => undefined),
            fetchHotelCodesByCity(cityName, countryCode).catch(() => []),
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
    const gqlResult = await tgxGraphQL(gqlQuery, { criteria, settings, filterSearch: getTgxFilterSearch() });

    const options: TgxOption[] = gqlResult?.data?.hotelX?.search?.options || [];
    const gqlErrors            = gqlResult?.data?.hotelX?.search?.errors  || [];

    if (hasEmptyHotelsError(gqlErrors) && !hotelCode && cityName) {
        const baseCriteria = { checkIn: checkin, checkOut: checkout, occupancies, nationality: guest_nationality, currency };
        return runCityFallback(
            cityName, countryCode, baseCriteria, settings,
            Promise.resolve(undefined),
            fetchHotelCodesByCity(cityName, countryCode).catch(() => []),
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

    // Apply bbox filter when caller provides a bounding box (e.g. province/island searches).
    if (bbox && cityResult.data.length > 0) {
        const [west, south, east, north] = bbox;
        const inBox = (h: any) => !h.lat || !h.lng || (h.lng >= west && h.lng <= east && h.lat >= south && h.lat <= north);
        cityResult.data        = cityResult.data.filter(inBox);
        cityResult.allMappable = cityResult.allMappable.filter(inBox);
        cityResult.totalCount  = cityResult.data.length;
    }

    return cityResult;
}

async function buildCityResults(
    merchantOptions: TgxOption[],
    cityName?: string,
    countryCode?: string,
    preloadedContent: Map<string, any> = new Map(),
): Promise<HotelSearchResult> {
    const byHotel = new Map<string, TgxOption>();
    for (const opt of merchantOptions) {
        const existing = byHotel.get(opt.hotelCode);
        const price    = opt.price.gross || opt.price.net;
        if (!existing || price < (existing.price.gross || existing.price.net)) {
            byHotel.set(opt.hotelCode, opt);
        }
    }

    const hotelCodes = Array.from(byHotel.entries())
        .sort(([, a], [, b]) => (a.price.gross || a.price.net) - (b.price.gross || b.price.net))
        .slice(0, 300)
        .map(([code]) => code);

    const [contentMap, reviewMap] = await Promise.all([
        fetchHotelContent(hotelCodes).catch(() => new Map<string, any>()),
        fetchHotelReviews(hotelCodes).catch(() => new Map<string, any>()),
    ]);

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
        const noAmenityCodes = hotelCodes.filter(c => {
            const a = contentMap.get(c)?.amenities ?? preloadedContent.get(c)?.amenities;
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
                        const etgResults = await fetchEtgAmenitiesByHids(noAmenityCodes);
                        const slugUpdates = new Map<string, string>();
                        for (const [id, { amenities, slug }] of etgResults) {
                            if (amenities.length) amenityMap.set(id, amenities);
                            if (slug) slugUpdates.set(id, slug);
                        }
                        if (slugUpdates.size > 0) {
                            for (const [hotelId, slug] of slugUpdates) {
                                prisma.hotel_content.updateMany({
                                    where: { hotel_id: hotelId },
                                    data:  { ratehawk_hid: slug },
                                }).catch(() => {});
                            }
                        }
                        console.log(`[amenity-enrich] ETG hid lookup returned amenities for ${amenityMap.size}/${noAmenityCodes.length} hotels`);
                    } else {
                        const etgResult = await fetchEtgAmenitiesBatch(noAmenityCodes);
                        for (const [id, amenities] of etgResult) amenityMap.set(id, amenities);
                        console.log(`[amenity-enrich] ETG returned amenities for ${amenityMap.size} hotels`);
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
        const imageList: string[] = content?.images ?? [];
        return {
            hotelId:      code,
            id:           code,
            name:         content?.name || preloadedContent.get(code)?.name || code,
            price:        opt.price.gross || opt.price.net,
            currency:     opt.price.currency,
            offerId:      `TGX:${tokenId}`,
            refundableTag: opt.cancelPolicy?.refundable ? 'REFUNDABLE' : 'NON_REFUNDABLE',
            starRating:   content?.star_rating ?? 0,
            images:       imageList,
            image:        imageList[0] ?? '',
            lat:          Number(content?.lat ?? 0),
            lng:          Number(content?.lng ?? 0),
            coordinates:  { lat: Number(content?.lat ?? 0), lng: Number(content?.lng ?? 0) },
            address:      content?.address ?? '',
            location:     content?.address ?? '',
            city:         content?.city ?? cityName ?? '',
            country:      content?.country ?? countryCode ?? '',
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
    return { data: deduped, allMappable, totalCount: deduped.length };
}
