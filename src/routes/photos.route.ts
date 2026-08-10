/**
 * Photo proxy routes
 *
 * GET /api/v2/photos/place?photo_reference=<ref>&maxwidth=400   — Google Places photo
 * GET /api/v2/photos/poi?photo_reference=<ref>&maxwidth=400     — same, POI alias
 * GET /api/v2/photos/destination?iata=SIN                       — destination photo by IATA
 */

import { Router, Request, Response, NextFunction } from 'express';
import { config } from '@/config';
import { AppError } from '@/middleware/error.middleware';

const router = Router();

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

router.get('/place', proxyGooglePhoto);
router.get('/poi',   proxyGooglePhoto);

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
    const iata = (req.query.iata as string)?.toUpperCase() ?? '';

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
