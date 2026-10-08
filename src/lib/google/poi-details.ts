/**
 * One nearby place, resolved through Google Places — v1's /api/poi-photo, ported.
 *
 * The property page's nearby strip draws cards from two sources: Google's nearby search, which
 * gives a place id, and Mapbox's category search, which gives only a name and a point. Both come
 * here for a photo, opening hours, phone, website and reviews.
 *
 * "Nothing found" is an answer and is cached; a Google error is not, so a passing outage does not
 * stick to a place for a day.
 */

import { config } from '@/config';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

export interface PoiReview {
    author_name: string;
    rating: number;
    text: string;
    relative_time_description?: string;
    profile_photo_url?: string;
}

export interface PoiOpeningHours {
    open_now?: boolean;
    weekday_text?: string[];
}

export interface PoiDetails {
    name: string;
    nameEn: string | null;
    placeId: string | null;
    category: string | null;
    vicinity: string | null;
    rating: number | null;
    userRatingsTotal: number | null;
    reviews: PoiReview[];
    phone: string | null;
    website: string | null;
    openingHours: PoiOpeningHours | null;
    photoReference: string | null;
    source: 'google' | 'none';
}

export interface PoiLookup {
    name: string;
    lat: number;
    lng: number;
    /** Google's id when the caller has one. A Mapbox id is tolerated: it falls back to a name search. */
    placeId?: string;
    category?: string;
}

interface GooglePlace {
    place_id?: string;
    name?: string;
    types?: string[];
    vicinity?: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    reviews?: PoiReview[];
    formatted_phone_number?: string;
    website?: string;
    opening_hours?: PoiOpeningHours;
    photos?: { photo_reference?: string }[];
}

const GOOGLE = 'https://maps.googleapis.com/maps/api/place';
const TTL_SECONDS = 86_400;
const MAX_REVIEWS = 5;
const CANDIDATES = 3;
const DETAILS_FIELDS = [
    'place_id', 'name', 'types', 'vicinity', 'formatted_address', 'rating', 'user_ratings_total',
    'reviews', 'formatted_phone_number', 'website', 'opening_hours', 'photos',
].join(',');

/** Statuses meaning "there is nothing here", as opposed to "something went wrong". */
const EMPTY_STATUSES = new Set(['ZERO_RESULTS', 'NOT_FOUND', 'INVALID_REQUEST']);

/** Places that are never shut, when Google sends no hours for them. Word-bounded so "parking" is not a park. */
const ALWAYS_OPEN = /\b(transit|station|park|nature)\b/;

const inFlight = new Map<string, Promise<PoiDetails>>();

export function poiCacheKey(q: PoiLookup): string {
    return q.placeId
        ? `poi|${q.placeId}`
        : `poi|${q.name.toLowerCase()}|${q.lat.toFixed(4)}|${q.lng.toFixed(4)}`;
}

function apiKey(): string {
    const key = config.GOOGLE_PLACES_API_KEY;
    if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not configured');
    return key;
}

async function callGoogle<T>(url: string): Promise<{ status: string; body: T }> {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Google Places HTTP ${res.status}`);
    const body = await res.json() as T & { status: string };
    if (body.status === 'REQUEST_DENIED') {
        logger.error('[poi-details] Google REQUEST_DENIED — check the Places API key and billing');
    }
    if (body.status !== 'OK' && !EMPTY_STATUSES.has(body.status)) {
        throw new Error(`Google Places status ${body.status}`);
    }
    return { status: body.status, body };
}

async function placeDetails(placeId: string, key: string): Promise<GooglePlace | null> {
    const { status, body } = await callGoogle<{ result?: GooglePlace }>(
        `${GOOGLE}/details/json?place_id=${encodeURIComponent(placeId)}&fields=${DETAILS_FIELDS}&language=en&key=${key}`,
    );
    return status === 'OK' ? body.result ?? null : null;
}

async function candidatesNear(q: PoiLookup, key: string): Promise<GooglePlace[]> {
    const { status, body } = await callGoogle<{ results?: GooglePlace[] }>(
        `${GOOGLE}/nearbysearch/json?location=${q.lat},${q.lng}&radius=500&keyword=${encodeURIComponent(q.name)}&language=en&key=${key}`,
    );
    return status === 'OK' ? (body.results ?? []).slice(0, CANDIDATES) : [];
}

function emptyDetails(q: PoiLookup): PoiDetails {
    return {
        name: q.name, nameEn: null, placeId: null, category: null, vicinity: null, rating: null,
        userRatingsTotal: null, reviews: [], phone: null, website: null, openingHours: null,
        photoReference: null, source: 'none',
    };
}

function withDefaultHours(d: PoiDetails, q: PoiLookup): PoiDetails {
    if (d.openingHours) return d;
    const category = `${q.category ?? ''} ${d.category ?? ''}`.replace(/_/g, ' ').toLowerCase();
    const alwaysOpen = ALWAYS_OPEN.test(category) || /\bstation\b/i.test(q.name);
    return alwaysOpen ? { ...d, openingHours: { open_now: true, weekday_text: ['Open 24 hours'] } } : d;
}

function toDetails(p: GooglePlace, q: PoiLookup): PoiDetails {
    return withDefaultHours({
        name: q.name,
        nameEn: p.name ?? null,
        placeId: p.place_id ?? null,
        category: p.types?.[0]?.replace(/_/g, ' ') ?? null,
        vicinity: p.vicinity ?? p.formatted_address ?? null,
        rating: typeof p.rating === 'number' ? p.rating : null,
        userRatingsTotal: typeof p.user_ratings_total === 'number' ? p.user_ratings_total : null,
        reviews: (p.reviews ?? []).slice(0, MAX_REVIEWS),
        phone: p.formatted_phone_number ?? null,
        website: p.website ?? null,
        openingHours: p.opening_hours
            ? { open_now: p.opening_hours.open_now, weekday_text: p.opening_hours.weekday_text }
            : null,
        photoReference: p.photos?.[0]?.photo_reference ?? null,
        source: 'google',
    }, q);
}

async function resolve(q: PoiLookup): Promise<PoiDetails> {
    const key = apiKey();
    if (q.placeId) {
        const place = await placeDetails(q.placeId, key);
        if (place) return toDetails(place, q);
    }
    // One candidate at a time: the first with a photo or reviews wins, so a good match costs one
    // Details call rather than three fired in parallel and two thrown away.
    for (const candidate of await candidatesNear(q, key)) {
        if (!candidate.place_id) continue;
        const place = await placeDetails(candidate.place_id, key);
        if (place && (place.photos?.length || place.reviews?.length)) return toDetails(place, q);
    }
    return withDefaultHours(emptyDetails(q), q);
}

export function lookupPoiDetails(q: PoiLookup): Promise<PoiDetails> {
    const cacheKey = poiCacheKey(q);
    const pending = inFlight.get(cacheKey);
    if (pending) return pending;

    const lookup = (async () => {
        const cached = await redis.get(cacheKey).catch(() => null);
        if (cached) {
            try { return JSON.parse(cached) as PoiDetails; } catch { /* corrupt entry: look it up again */ }
        }
        const details = await resolve(q);
        const value = JSON.stringify(details);
        await redis.setex(cacheKey, TTL_SECONDS, value).catch(() => {});
        if (details.placeId && details.placeId !== q.placeId) {
            await redis.setex(`poi|${details.placeId}`, TTL_SECONDS, value).catch(() => {});
        }
        return details;
    })().finally(() => inFlight.delete(cacheKey));

    inFlight.set(cacheKey, lookup);
    return lookup;
}

export async function fetchPlacePhoto(photoReference: string, maxWidth = 800): Promise<{ body: Buffer; contentType: string }> {
    const key = apiKey();
    const res = await fetch(
        `${GOOGLE}/photo?maxwidth=${maxWidth}&photo_reference=${encodeURIComponent(photoReference)}&key=${key}`,
        { signal: AbortSignal.timeout(8000) },
    );
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !contentType.startsWith('image/')) throw new Error(`Google photo HTTP ${res.status}`);
    return { body: Buffer.from(await res.arrayBuffer()), contentType };
}

/** The card a place without a photo gets: its name on a category colour. */
export function placeholderSvg(name: string, category: string): string {
    const cat = category.toLowerCase();
    const lowerName = name.toLowerCase();
    let bg = '#1e293b';
    if (cat.includes('park') || cat.includes('nature') || lowerName.includes('park') || lowerName.includes('garden')) bg = '#064e3b';
    else if (cat.includes('restaurant') || cat.includes('food') || cat.includes('cafe')) bg = '#7c2d12';
    else if (cat.includes('museum') || cat.includes('landmark') || cat.includes('attraction') || cat.includes('tourism') || cat.includes('tourist')) bg = '#3730a3';
    else if (cat.includes('shop') || cat.includes('market')) bg = '#831843';
    else if (cat.includes('transit') || cat.includes('station')) bg = '#334155';
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const label = escape(name.length > 24 ? `${name.slice(0, 22)}…` : name);
    const sub = escape(cat.replace(/_/g, ' ') || 'point of interest');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="${bg}"/><text x="300" y="185" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="600" fill="rgba(255,255,255,0.9)">${label}</text><text x="300" y="220" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="rgba(255,255,255,0.5)">${sub}</text></svg>`;
}
