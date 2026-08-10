import { Router, Request, Response } from 'express';
import { HotelsController } from '@/controllers/hotels.controller';
import { requireAuth } from '@/middleware/auth.middleware';
import { prisma } from '@/lib/prisma';
import { tgxGraphQL, getTgxConfig } from '@/lib/hotels/travelgatex';

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

// Auth-protected
router.post('/create-payment',  requireAuth, ctrl.createPayment);
router.post('/confirm',         requireAuth, ctrl.confirmBooking);
router.post('/cancel',          requireAuth, ctrl.cancelBooking);

export default router;
