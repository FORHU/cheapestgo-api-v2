import { Router, Request, Response } from 'express';
import { HotelsController } from '@/controllers/hotels.controller';
import { requireAuth } from '@/middleware/auth.middleware';
import { prisma } from '@/lib/prisma';
import { tgxGraphQL, getTgxConfig } from '@/lib/hotels/travelgatex';
import { CITY_ALIASES } from '@/lib/cityAliases';

const router = Router();
const ctrl   = new HotelsController();

// ── Hotel photo proxy ─────────────────────────────────────────────────────────
// GET /api/v2/hotels/photo?hotelCode=xxx
// Fetches & caches hotel images server-side so provider URLs + API keys never
// reach the client. Falls back through: DB → ETG → TGX → placeholder.

type CachedPhoto = { body: Buffer | null; contentType: string; expires: number };
const photoCache = new Map<string, CachedPhoto>();
let cacheBytes   = 0;
const MAX_CACHE_BYTES = 64 * 1024 * 1024; // 64 MB
const PHOTO_TTL_MS    = 86_400_000;       // 24 h
const MISS_TTL_MS     = 5 * 60 * 1000;   // 5 min (failed lookups)

// 1. DB lookup
async function photoFromDb(hotelCode: string): Promise<string | null> {
    try {
        const row = await prisma.hotel_content.findUnique({
            where:  { hotel_id: hotelCode },
            select: { images: true },
        });
        const url = row?.images?.[0];
        return url ? url.replace('{size}', '640x400') : null;
    } catch { return null; }
}

// 2. ETG / RateHawk API
async function photoFromEtg(hotelCode: string): Promise<string | null> {
    const { ETG_KEY_ID, ETG_API_KEY } = process.env;
    if (!ETG_KEY_ID || !ETG_API_KEY) return null;
    const token = Buffer.from(`${ETG_KEY_ID}:${ETG_API_KEY}`).toString('base64');
    try {
        const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
            method:  'POST',
            headers: { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id: hotelCode, language: 'en' }),
            signal:  AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const json = await res.json() as any;
        const images: string[] = (json?.data?.images ?? [])
            .map((u: string) => typeof u === 'string' ? u.replace('{size}', '640x400') : '')
            .filter(Boolean);
        if (!images[0]) return null;
        backfillDb(hotelCode, images).catch(() => {});
        return images[0];
    } catch { return null; }
}

// 3. TGX GraphQL hotel list
async function photoFromTgx(hotelCode: string): Promise<string | null> {
    try {
        const cfg    = getTgxConfig();
        const result = await tgxGraphQL(
            `query HotelPhoto($criteria: HotelXHotelListInput!) {
               hotelX { hotels(criteria: $criteria) { edges { node { hotelData { medias { url } } } } } }
             }`,
            { criteria: { access: cfg.accessCode, hotelCodes: [hotelCode] } },
        ) as any;
        const edges: any[] = result?.data?.hotelX?.hotels?.edges ?? [];
        for (const e of edges) {
            const url = e?.node?.hotelData?.medias?.[0]?.url as string | undefined;
            if (url) { backfillDb(hotelCode, [url]).catch(() => {}); return url; }
        }
        return null;
    } catch { return null; }
}

async function backfillDb(hotelCode: string, images: string[]): Promise<void> {
    try {
        await prisma.hotel_content.upsert({
            where:  { hotel_id: hotelCode },
            update: { images, fetched_at: new Date() },
            create: { hotel_id: hotelCode, images, fetched_at: new Date() },
        });
    } catch { /* non-fatal — cache miss */ }
}

async function fetchBytes(url: string): Promise<{ body: Buffer; contentType: string } | null> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const ct = res.headers.get('content-type') ?? 'image/jpeg';
        if (!ct.startsWith('image/')) return null;
        return { body: Buffer.from(await res.arrayBuffer()), contentType: ct };
    } catch { return null; }
}

function storePhoto(hotelCode: string, fetched: { body: Buffer; contentType: string } | null): void {
    const prev = photoCache.get(hotelCode);
    if (prev?.body) cacheBytes -= prev.body.byteLength;
    if (fetched)    cacheBytes += fetched.body.byteLength;
    photoCache.set(hotelCode, {
        body:        fetched?.body ?? null,
        contentType: fetched?.contentType ?? '',
        expires:     Date.now() + (fetched ? PHOTO_TTL_MS : MISS_TTL_MS),
    });
    // Evict oldest when over budget
    for (const key of photoCache.keys()) {
        if (cacheBytes <= MAX_CACHE_BYTES) break;
        if (key === hotelCode) continue;
        cacheBytes -= photoCache.get(key)?.body?.byteLength ?? 0;
        photoCache.delete(key);
    }
}

// Tiny 1x1 grey PNG used when no image is found
const PLACEHOLDER = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
);

router.get('/photo', async (req: Request, res: Response) => {
    const hotelCode = (req.query.hotelCode as string)?.trim() || '';
    if (!hotelCode) {
        res.set('Content-Type', 'image/png');
        return res.send(PLACEHOLDER);
    }

    const cached = photoCache.get(hotelCode);
    if (cached && cached.expires > Date.now()) {
        if (cached.body) {
            res.set({ 'Content-Type': cached.contentType, 'Cache-Control': 'public, max-age=86400' });
            return res.send(cached.body);
        }
        res.set('Content-Type', 'image/png');
        return res.send(PLACEHOLDER);
    }

    let photoUrl: string | null = await photoFromDb(hotelCode);
    if (!photoUrl) photoUrl     = await photoFromEtg(hotelCode);
    if (!photoUrl) photoUrl     = await photoFromTgx(hotelCode);

    const fetched = photoUrl ? await fetchBytes(photoUrl) : null;
    storePhoto(hotelCode, fetched);

    if (fetched) {
        res.set({ 'Content-Type': fetched.contentType, 'Cache-Control': 'public, max-age=86400' });
        return res.send(fetched.body);
    }
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' });
    return res.send(PLACEHOLDER);
});

// Public
router.post('/search',                  ctrl.search);
router.post('/search/stream',           ctrl.searchStream);
router.get( '/suggest',                 ctrl.suggest);
router.get( '/property/:id',            ctrl.property);
router.get( '/deals',                   ctrl.deals);
router.post('/autocomplete',            ctrl.autocomplete);
router.post('/autocomplete/resolve',    ctrl.resolveDestination);
router.get( '/place-details',           ctrl.placeDetails);
router.get( '/geocode',                 ctrl.geocode);
router.post('/prebook',                 ctrl.preBook);
router.get( '/amenities',               ctrl.amenitiesByDestination);
router.get( '/amenities/by-ids',        ctrl.amenitiesByHotelIds);
router.get( '/nearby',                  ctrl.nearbyPlaces);

// ── Trending destinations ─────────────────────────────────────────────────────
// GET /api/v2/hotels/trending
// Returns top 4 cities from hotel_search_stats (last 14 days), padded by
// popular_destinations when there aren't enough real signals.

function toTitleCase(str: string): string {
    return str.replace(/\b\w/g, c => c.toUpperCase());
}

function countryCodeToName(code: string): string {
    if (!code) return '';
    if (code.length === 2) {
        try {
            return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code;
        } catch {
            return code;
        }
    }
    // Already a full name stored in the DB — normalise casing
    return toTitleCase(code.toLowerCase());
}

router.get('/trending', async (_req: Request, res: Response) => {
    try {
        const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

        const rows = await prisma.hotel_search_stats.findMany({
            where:   { last_searched_at: { gt: cutoff } },
            orderBy: { search_count: 'desc' },
            take:    10, // fetch extra so we can filter bad rows and still get 4
            select:  { city_key: true, country_code: true },
        });

        const validRows = rows.filter(r => {
            const k = r.city_key?.toLowerCase().trim() ?? '';
            return k.length > 1 && !k.includes('unknown') && !k.startsWith('(');
        });

        // Apply aliases first, then deduplicate by resolved city name
        const resolved = validRows.map(r => {
            const rawCity = r.city_key.split(',')[0].trim();
            const cc      = r.country_code?.toUpperCase() ?? '';
            const city    = toTitleCase(CITY_ALIASES[cc]?.[rawCity.toLowerCase()] ?? rawCity);
            return { ...r, city };
        });

        const seenCities = new Set<string>();
        const dedupedRows = resolved.filter(r => {
            const key = r.city.toLowerCase();
            if (seenCities.has(key)) return false;
            seenCities.add(key);
            return true;
        });

        const trending = dedupedRows.slice(0, 4).map(r => {
            const countryName = countryCodeToName(r.country_code);
            return {
                city:        r.city,
                countryCode: r.country_code,
                countryName,
                imageUrl:    `/api/v2/photos/destination?q=${encodeURIComponent(`${r.city} ${countryName} landmark`)}`,
            };
        });

        if (trending.length < 4) {
            const existing = new Set(trending.map(t => t.city.toLowerCase()));
            const fallback = await prisma.popular_destinations.findMany({
                take:   (4 - trending.length) * 2,
                select: { city: true, country: true, image_url: true },
            });
            for (const d of fallback) {
                if (!d.city || existing.has(d.city.toLowerCase())) continue;
                existing.add(d.city.toLowerCase());
                trending.push({
                    city:        d.city,
                    countryCode: '',
                    countryName: d.country ?? '',
                    imageUrl:    d.image_url ?? `/api/v2/photos/destination?q=${encodeURIComponent(`${d.city} ${d.country ?? ''} landmark`)}`,
                });
                if (trending.length >= 4) break;
            }
        }

        return res.json({ success: true, data: trending.slice(0, 4) });
    } catch (err: any) {
        console.error('[trending]', err?.message);
        return res.json({ success: true, data: [] });
    }
});

// Auth-protected
router.post('/create-payment',  requireAuth, ctrl.createPayment);
router.post('/confirm',         requireAuth, ctrl.confirmBooking);
router.post('/cancel',          requireAuth, ctrl.cancelBooking);

export default router;
