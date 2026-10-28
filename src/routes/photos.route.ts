/**
 * Photo proxy routes
 *
 * GET /api/v2/photos/place?photo_reference=<ref>&maxwidth=400   — Google Places photo
 * GET /api/v2/photos/poi?name=&lat=&lng=[&full=true]                  — nearby place photo / details
 * GET /api/v2/photos/destination?iata=SIN                       — destination photo by IATA
 */

import { Router, Request, Response, NextFunction } from 'express';
import { config } from '@/config';
import { AppError } from '@/middleware/error.middleware';
import { photosRateLimit } from '@/middleware/rate-limit.middleware';
import { lookupPoiDetails, fetchPlacePhoto, placeholderSvg } from '@/lib/google/poi-details';
import { logger } from '@/lib/logger';

const router: Router = Router();

// These photos are public and loaded as <img> from the web app's origin; helmet's default
// same-origin policy would make the browser block them.
router.use((_req, res, next) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});

/** The message only: library errors never carry the API key, and nothing else is logged. */
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function proxyGooglePhoto(req: Request, res: Response, next: NextFunction) {
    try {
        const photoReference = req.query.photo_reference as string;
        const maxWidth       = (req.query.maxwidth as string) || '400';

        if (!photoReference) {
            throw new AppError(400, 'Missing photo_reference', 'VALIDATION_ERROR');
        }

        if (!config.GOOGLE_PLACES_API_KEY) {
            throw new AppError(500, 'Google API key not configured', 'CONFIG_ERROR');
        }

        const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${encodeURIComponent(photoReference)}&key=${config.GOOGLE_PLACES_API_KEY}`;

        const upstream = await fetch(googleUrl, { signal: AbortSignal.timeout(8000) });

        if (!upstream.ok) {
            throw new AppError(upstream.status, 'Failed to fetch photo from Google', 'UPSTREAM_ERROR');
        }

        const buffer      = Buffer.from(await upstream.arrayBuffer());
        const contentType = upstream.headers.get('content-type') || 'image/jpeg';

        res.set({
            'Content-Type':  contentType,
            'Cache-Control': 'public, max-age=86400',
        });
        res.send(buffer);
    } catch (err) {
        next(err);
    }
}

/** A query value as a finite number, or null. An empty string is missing, not zero. */
function coordinate(value: unknown): number | null {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function sendPlaceholder(res: Response, name: string, category: string | undefined, cacheControl: string) {
    res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': cacheControl });
    return res.send(placeholderSvg(name, category ?? ''));
}

/**
 * GET /api/v2/photos/poi — a nearby place's photo, or with `full=true` its details.
 *
 *   ?photo_reference=                                 → that photo, proxied
 *   ?name=&lat=&lng=[&placeId=&category=]             → the resolved place's photo, else an SVG card
 *   ?name=&lat=&lng=[&placeId=&category=]&full=true   → PoiDetails JSON
 *
 * v1 answered all three at /api/poi-photo. v2 only had the first, so every card without a photo
 * reference 400'd and the nearby strip's details step never ran.
 */
export async function poiPhotoOrDetails(req: Request, res: Response, next: NextFunction) {
    const full = req.query.full === 'true';
    const photoReference = typeof req.query.photo_reference === 'string' ? req.query.photo_reference : '';
    if (photoReference && !full) return proxyGooglePhoto(req, res, next);

    try {
        const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
        if (!name) throw new AppError(400, 'Missing name', 'VALIDATION_ERROR');
        if (name.length > 200) throw new AppError(400, 'name is too long', 'VALIDATION_ERROR');
        const lat = coordinate(req.query.lat);
        const lng = coordinate(req.query.lng);
        if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new AppError(400, 'Missing or invalid lat/lng', 'VALIDATION_ERROR');
        const placeId = typeof req.query.placeId === 'string' && req.query.placeId ? req.query.placeId : undefined;
        if (placeId && placeId.length > 300) throw new AppError(400, 'placeId is too long', 'VALIDATION_ERROR');

        const category = typeof req.query.category === 'string' && req.query.category ? req.query.category : undefined;
        if (category && category.length > 100) throw new AppError(400, 'category is too long', 'VALIDATION_ERROR');

        const lookup = { name, lat, lng, placeId, category };

        if (full) {
            try {
                return res.json(await lookupPoiDetails(lookup));
            } catch (err) {
                logger.warn('[photos/poi] details lookup failed', { err: errorMessage(err), name });
                throw new AppError(502, 'Place details unavailable', 'UPSTREAM_ERROR');
            }
        }

        // Image mode always answers with a picture — the card has to show something — but one
        // drawn because something failed must not be kept by the browser.
        let photoReferenceFound: string | null;
        try {
            photoReferenceFound = (await lookupPoiDetails(lookup)).photoReference;
        } catch (err) {
            logger.warn('[photos/poi] lookup failed', { err: errorMessage(err), name });
            return sendPlaceholder(res, name, lookup.category, 'no-store');
        }
        if (!photoReferenceFound) return sendPlaceholder(res, name, lookup.category, 'public, max-age=86400');

        try {
            const photo = await fetchPlacePhoto(photoReferenceFound);
            res.set({ 'Content-Type': photo.contentType, 'Cache-Control': 'public, max-age=86400' });
            return res.send(photo.body);
        } catch (err) {
            logger.warn('[photos/poi] photo fetch failed', { err: errorMessage(err), name });
            return sendPlaceholder(res, name, lookup.category, 'no-store');
        }
    } catch (err) {
        next(err);
    }
}

router.get('/place', proxyGooglePhoto);
router.get('/poi',   photosRateLimit, poiPhotoOrDetails);

// ── Destination photo proxy ───────────────────────────────────────────────────
// GET /api/v2/photos/destination?iata=SIN
// Resolves a destination photo by IATA code. Falls through:
//   1. Google Places textsearch → photo reference → proxy bytes
//   2. Wikimedia search → thumbnail URL → proxy bytes
//   3. Placeholder SVG

const PLACE_QUERIES: Record<string, string> = {
    HKG: 'Hong Kong Victoria Harbour skyline',
    SIN: 'Singapore Marina Bay Sands skyline',
    ICN: 'Seoul Gyeongbokgung Palace South Korea',
    GMP: 'Seoul South Korea cityscape',
    KIX: 'Osaka Castle Japan',
    NRT: 'Tokyo Japan Shinjuku skyline',
    HND: 'Tokyo Japan cityscape',
    BKK: 'Bangkok Wat Phra Kaew Thailand',
    DMK: 'Bangkok Thailand landmark',
    KUL: 'Kuala Lumpur Petronas Towers Malaysia',
    MNL: 'Manila Philippines skyline',
    CEB: 'Cebu City Philippines',
    CRK: 'Clark Pampanga Philippines',
    DVO: 'Davao City Philippines',
    ILO: 'Iloilo City Philippines',
    KLO: 'Boracay Philippines beach',
    PPS: 'Puerto Princesa Palawan Philippines',
    DXB: 'Dubai Burj Khalifa skyline UAE',
    AUH: 'Abu Dhabi Sheikh Zayed Grand Mosque UAE',
    DOH: 'Doha Qatar Museum of Islamic Art',
    SYD: 'Sydney Opera House Australia',
    MEL: 'Melbourne Australia skyline',
    LHR: 'London Big Ben United Kingdom',
    CDG: 'Paris Eiffel Tower France',
    FRA: 'Frankfurt Germany skyline',
    AMS: 'Amsterdam Netherlands canal',
    JFK: 'New York Times Square USA',
    LAX: 'Los Angeles California USA',
    SFO: 'San Francisco Golden Gate Bridge',
    ORD: 'Chicago Illinois skyline USA',
    YYZ: 'Toronto Canada skyline',
    YVR: 'Vancouver Canada mountains',
    GUM: 'Guam beach tropical island',
    TPE: 'Taipei 101 Taiwan',
    PEK: 'Beijing Forbidden City China',
    PVG: 'Shanghai China Pudong skyline',
    CGK: 'Jakarta Indonesia skyline',
    SGN: 'Ho Chi Minh City Vietnam',
    HAN: 'Hanoi Vietnam Old Quarter',
    DEL: 'New Delhi India Red Fort',
    BOM: 'Mumbai India Gateway of India',
    CMB: 'Colombo Sri Lanka',
    NAN: 'Fiji island tropical beach',
    BCN: 'Barcelona Sagrada Familia Spain',
    MAD: 'Madrid Spain Royal Palace',
    FCO: 'Rome Colosseum Italy',
    IST: 'Istanbul Hagia Sophia Turkey',
    MFM: 'Macau Ruins of St Pauls',
    MEX: 'Mexico City Zocalo',
    GRU: 'São Paulo Brazil skyline',
    EZE: 'Buenos Aires Argentina',
    NBO: 'Nairobi Kenya skyline',
};

type DestCacheEntry = { url: string; expires: number };
const destCache = new Map<string, DestCacheEntry>();

async function fetchGoogleDestPhoto(query: string): Promise<string | null> {
    const key = config.GOOGLE_PLACES_API_KEY;
    if (!key) return null;
    try {
        const searchRes = await fetch(
            `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`,
            { signal: AbortSignal.timeout(8000) },
        );
        if (!searchRes.ok) return null;
        const data = await searchRes.json() as any;
        if (data.status !== 'OK') return null;
        const photoRef: string | undefined = data.results?.[0]?.photos?.[0]?.photo_reference;
        if (!photoRef) return null;
        return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(photoRef)}&key=${key}`;
    } catch { return null; }
}

async function fetchWikimediaPhoto(query: string): Promise<string | null> {
    try {
        const params = new URLSearchParams({
            action: 'query', generator: 'search', gsrsearch: query,
            gsrlimit: '1', prop: 'pageimages', pithumbsize: '800',
            format: 'json', origin: '*',
        });
        const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
            headers: { 'User-Agent': 'cheapestgo-api/2.0 (travel booking)' },
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return null;
        const data = await res.json() as any;
        const pages = data.query?.pages;
        if (!pages) return null;
        const page = Object.values(pages as Record<string, any>)[0] as any;
        return (page?.thumbnail?.source as string | undefined) ?? null;
    } catch { return null; }
}

async function proxyImageBytes(url: string): Promise<{ buf: Buffer; ct: string } | null> {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
        if (!res.ok) return null;
        const ct = res.headers.get('content-type') ?? 'image/jpeg';
        if (!ct.startsWith('image/')) return null;
        return { buf: Buffer.from(await res.arrayBuffer()), ct };
    } catch { return null; }
}

const PLACEHOLDER_SVG = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#1e293b"/>
  <rect x="320" y="220" width="160" height="120" rx="12" fill="#334155"/>
  <circle cx="400" cy="200" r="40" fill="#334155"/>
</svg>`,
);

router.get('/destination', async (req: Request, res: Response) => {
    const iata  = (req.query.iata as string)?.toUpperCase() ?? '';
    const cityQ = (req.query.q as string)?.trim() ?? '';

    // City / freetext query — used by trending-destinations
    if (cityQ && !iata) {
        const cacheKey = `q:${cityQ}`;
        const cached = destCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
            if (cached.url) {
                const fetched = await proxyImageBytes(cached.url);
                if (fetched) {
                    res.set({ 'Content-Type': fetched.ct, 'Cache-Control': 'public, max-age=86400' });
                    return res.send(fetched.buf);
                }
            }
            res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' });
            return res.send(PLACEHOLDER_SVG);
        }
        let photoUrl = await fetchGoogleDestPhoto(cityQ);
        if (!photoUrl) photoUrl = await fetchWikimediaPhoto(cityQ);
        destCache.set(cacheKey, { url: photoUrl ?? '', expires: Date.now() + (photoUrl ? 86_400_000 : 5 * 60_000) });
        if (photoUrl) {
            const fetched = await proxyImageBytes(photoUrl);
            if (fetched) {
                res.set({ 'Content-Type': fetched.ct, 'Cache-Control': 'public, max-age=86400' });
                return res.send(fetched.buf);
            }
        }
        res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' });
        return res.send(PLACEHOLDER_SVG);
    }

    const query = PLACE_QUERIES[iata];
    if (!query) {
        res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' });
        return res.send(PLACEHOLDER_SVG);
    }

    const cached = destCache.get(iata);
    if (cached && cached.expires > Date.now()) {
        if (cached.url) {
            const fetched = await proxyImageBytes(cached.url);
            if (fetched) {
                res.set({ 'Content-Type': fetched.ct, 'Cache-Control': 'public, max-age=86400' });
                return res.send(fetched.buf);
            }
        }
        res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' });
        return res.send(PLACEHOLDER_SVG);
    }

    let photoUrl = await fetchGoogleDestPhoto(query);
    if (!photoUrl) photoUrl = await fetchWikimediaPhoto(query);

    destCache.set(iata, { url: photoUrl ?? '', expires: Date.now() + (photoUrl ? 86_400_000 : 5 * 60_000) });

    if (photoUrl) {
        const fetched = await proxyImageBytes(photoUrl);
        if (fetched) {
            res.set({ 'Content-Type': fetched.ct, 'Cache-Control': 'public, max-age=86400' });
            return res.send(fetched.buf);
        }
    }

    res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' });
    return res.send(PLACEHOLDER_SVG);
});

export default router;
