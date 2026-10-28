/**
 * One nearby place, resolved through Google Places — v1's /api/poi-photo, ported.
 *
 * The property page's nearby strip draws cards from two sources: Google's nearby search, which
 * gives a place id, and Mapbox's category search, which gives only a name and a point. Both come
 * here for a photo, opening hours, phone, website and reviews.
 *
 * "Nothing found" is an answer and is cached; a Google error is not, so a passing outage does not
 * stick to a place for a day.
 *
 * Redis holds what Google said (`CachedPoi`) and nothing that depends on the moment or the caller:
 * `open_now`, the caller's label and the "Open 24 hours" default are applied when an answer is
 * handed out (`present`).
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
    author_url?: string;
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

interface Period {
    open: { day: number; time: string };
    close?: { day: number; time: string };
}

interface GooglePlace {
    place_id?: string;
    name?: string;
    types?: string[];
    vicinity?: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    reviews?: Partial<PoiReview>[];
    formatted_phone_number?: string;
    website?: string;
    utc_offset?: number;
    opening_hours?: { weekday_text?: string[]; periods?: Period[] };
    photos?: { photo_reference?: string }[];
}

/** What goes into Redis: Google's answer, free of anything tied to the caller or the clock. */
interface CachedPoi {
    nameEn: string | null;
    placeId: string | null;
    types: string[];
    vicinity: string | null;
    rating: number | null;
    userRatingsTotal: number | null;
    reviews: PoiReview[];
    phone: string | null;
    website: string | null;
    hours: { weekday_text?: string[]; periods?: Period[]; utcOffsetMinutes?: number } | null;
    photoReference: string | null;
    source: 'google' | 'none';
}

const GOOGLE = 'https://maps.googleapis.com/maps/api/place';
const TTL_SECONDS = 86_400;
const MAX_REVIEWS = 5;
const CANDIDATES = 3;
const CALL_TIMEOUT_MS = 6000;
const LOOKUP_TIMEOUT_MS = 10_000;
const DETAILS_FIELDS = [
    'place_id', 'name', 'types', 'vicinity', 'formatted_address', 'rating', 'user_ratings_total',
    'reviews', 'formatted_phone_number', 'website', 'opening_hours', 'utc_offset', 'photos',
].join(',');

/** Statuses meaning "there is nothing here", as opposed to "something went wrong". */
const DETAILS_EMPTY = new Set(['ZERO_RESULTS', 'NOT_FOUND']);
/** INVALID_REQUEST is never "empty": callers only send ids and parameters Google issued, so it is our bug. */
const SEARCH_EMPTY = new Set(['ZERO_RESULTS']);

/** Place types that are never shut, used only when Google sends no hours. Exact matches only. */
const ALWAYS_OPEN = new Set([
    'park', 'national_park', 'transit', 'train_station', 'subway_station', 'bus_station', 'transit_station', 'light_rail_station',
]);

const MINUTES_PER_WEEK = 7 * 1440;

const inFlight = new Map<string, Promise<CachedPoi>>();

const idKey = (placeId: string) => `poi:v1|${placeId}`;

export function poiCacheKey(q: PoiLookup): string {
    return q.placeId
        ? idKey(q.placeId)
        : `poi:v1|${q.name.toLowerCase()}|${q.lat.toFixed(4)}|${q.lng.toFixed(4)}`;
}

function apiKey(): string {
    const key = config.GOOGLE_PLACES_API_KEY;
    if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not configured');
    return key;
}

async function callGoogle<T>(
    url: string,
    overall: AbortSignal,
    emptyStatuses: ReadonlySet<string>,
): Promise<{ status: string; body: T }> {
    const signal = AbortSignal.any([AbortSignal.timeout(CALL_TIMEOUT_MS), overall]);
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Google Places HTTP ${res.status}`);
    const body = await res.json() as T & { status: string; error_message?: string };
    if (body.status === 'REQUEST_DENIED') {
        logger.error('[poi-details] Google REQUEST_DENIED — check the Places API key and billing', {
            status: body.status,
            error_message: body.error_message,
        });
    }
    if (body.status === 'INVALID_REQUEST') {
        logger.warn('[poi-details] Google INVALID_REQUEST — a parameter we sent is wrong', {
            status: body.status,
            error_message: body.error_message,
        });
    }
    if (body.status !== 'OK' && !emptyStatuses.has(body.status)) {
        throw new Error(`Google Places status ${body.status}`);
    }
    return { status: body.status, body };
}

async function placeDetails(placeId: string, key: string, overall: AbortSignal): Promise<GooglePlace | null> {
    const { status, body } = await callGoogle<{ result?: GooglePlace }>(
        `${GOOGLE}/details/json?place_id=${encodeURIComponent(placeId)}&fields=${DETAILS_FIELDS}&language=en&key=${key}`,
        overall,
        DETAILS_EMPTY,
    );
    return status === 'OK' ? body.result ?? null : null;
}

async function candidatesNear(q: PoiLookup, key: string, overall: AbortSignal): Promise<GooglePlace[]> {
    const { status, body } = await callGoogle<{ results?: GooglePlace[] }>(
        `${GOOGLE}/nearbysearch/json?location=${q.lat},${q.lng}&radius=500&keyword=${encodeURIComponent(q.name)}&language=en&key=${key}`,
        overall,
        SEARCH_EMPTY,
    );
    return status === 'OK' ? (body.results ?? []).slice(0, CANDIDATES) : [];
}

function emptyCached(): CachedPoi {
    return {
        nameEn: null, placeId: null, types: [], vicinity: null, rating: null, userRatingsTotal: null,
        reviews: [], phone: null, website: null, hours: null, photoReference: null, source: 'none',
    };
}

function toCached(p: GooglePlace): CachedPoi {
    return {
        nameEn: p.name ?? null,
        placeId: p.place_id ?? null,
        types: p.types ?? [],
        vicinity: p.vicinity ?? p.formatted_address ?? null,
        rating: typeof p.rating === 'number' ? p.rating : null,
        userRatingsTotal: typeof p.user_ratings_total === 'number' ? p.user_ratings_total : null,
        reviews: (p.reviews ?? []).slice(0, MAX_REVIEWS).map((r) => ({
            author_name: r.author_name ?? '',
            rating: r.rating ?? 0,
            text: r.text ?? '',
            relative_time_description: r.relative_time_description,
            profile_photo_url: r.profile_photo_url,
            author_url: r.author_url,
        })),
        phone: p.formatted_phone_number ?? null,
        website: p.website ?? null,
        hours: p.opening_hours
            ? {
                weekday_text: p.opening_hours.weekday_text,
                periods: p.opening_hours.periods,
                utcOffsetMinutes: p.utc_offset,
            }
            : null,
        photoReference: p.photos?.[0]?.photo_reference ?? null,
        source: 'google',
    };
}

const weekMinute = (t: { day: number; time: string }) =>
    t.day * 1440 + Number(t.time.slice(0, 2)) * 60 + Number(t.time.slice(2, 4));

/** Whether the place is open at `now`, from its weekly periods; undefined when that cannot be told. */
function isOpenNow(periods: Period[] | undefined, utcOffsetMinutes: number | undefined, now: number): boolean | undefined {
    if (!periods?.length || typeof utcOffsetMinutes !== 'number') return undefined;
    if (periods.some((p) => p.open && !p.close)) return true;

    const local = new Date(now + utcOffsetMinutes * 60_000);
    const t = local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();
    return periods.some((p) => {
        if (!p.open || !p.close) return false;
        const open = weekMinute(p.open);
        let close = weekMinute(p.close);
        if (close <= open) close += MINUTES_PER_WEEK;
        return (t >= open && t < close) || (t + MINUTES_PER_WEEK >= open && t + MINUTES_PER_WEEK < close);
    });
}

function isAlwaysOpen(c: CachedPoi, q: PoiLookup): boolean {
    const category = q.category?.toLowerCase().replace(/\s+/g, '_');
    return [...c.types, ...(category ? [category] : [])].some((t) => ALWAYS_OPEN.has(t));
}

/** Turns what Redis (or Google) gave into the answer for this caller at this moment. */
function present(c: CachedPoi, q: PoiLookup, now = Date.now()): PoiDetails {
    let openingHours: PoiOpeningHours | null = null;
    if (c.hours) {
        const hours: PoiOpeningHours = {};
        const open = isOpenNow(c.hours.periods, c.hours.utcOffsetMinutes, now);
        if (open !== undefined) hours.open_now = open;
        if (c.hours.weekday_text) hours.weekday_text = c.hours.weekday_text;
        // An empty object would show an empty "hours" section in the popup.
        if (Object.keys(hours).length > 0) openingHours = hours;
    } else if (isAlwaysOpen(c, q)) {
        openingHours = { open_now: true, weekday_text: ['Open 24 hours'] };
    }
    return {
        name: q.name,
        nameEn: c.nameEn,
        placeId: c.placeId,
        category: c.types[0]?.replace(/_/g, ' ') ?? null,
        vicinity: c.vicinity,
        rating: c.rating,
        userRatingsTotal: c.userRatingsTotal,
        reviews: c.reviews,
        phone: c.phone,
        website: c.website,
        openingHours,
        photoReference: c.photoReference,
        source: c.source,
    };
}

async function readCache(cacheKey: string): Promise<CachedPoi | null> {
    try {
        const raw = await redis.get(cacheKey);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        const valid = parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as CachedPoi).types);
        return valid ? parsed as CachedPoi : null;
    } catch {
        return null; // Redis down or a corrupt entry: look it up again
    }
}

async function writeCache(cacheKey: string, value: CachedPoi): Promise<void> {
    try {
        await redis.setex(cacheKey, TTL_SECONDS, JSON.stringify(value));
    } catch {
        // a cache that cannot be written only costs the next caller a lookup
    }
}

/** First name-search candidate with a photo or reviews wins, so a good match costs one Details call. */
async function resolveByName(q: PoiLookup, key: string, overall: AbortSignal): Promise<CachedPoi> {
    for (const candidate of await candidatesNear(q, key, overall)) {
        if (!candidate.place_id) continue;
        const place = await placeDetails(candidate.place_id, key, overall);
        if (place && (place.photos?.length || place.reviews?.length)) return toCached(place);
    }
    return emptyCached();
}

function resolveCached(q: PoiLookup): Promise<CachedPoi> {
    const cacheKey = poiCacheKey(q);
    const pending = inFlight.get(cacheKey);
    if (pending) return pending;

    const lookup = (async () => {
        const cached = await readCache(cacheKey);
        if (cached) return cached;

        const key = apiKey();
        const overall = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);

        if (q.placeId) {
            const place = await placeDetails(q.placeId, key, overall);
            if (place) {
                const fromId = toCached(place);
                await writeCache(cacheKey, fromId);
                return fromId;
            }
            // Not a Google id (a Mapbox one, or a stale one): the id key only ever holds Details
            // answers for that id, so the name search is cached under the name.
            return resolveCached({ ...q, placeId: undefined });
        }

        const found = await resolveByName(q, key, overall);
        await writeCache(cacheKey, found);
        if (found.placeId) await writeCache(idKey(found.placeId), found);
        return found;
    })().finally(() => inFlight.delete(cacheKey));

    inFlight.set(cacheKey, lookup);
    return lookup;
}

export async function lookupPoiDetails(q: PoiLookup): Promise<PoiDetails> {
    return present(await resolveCached(q), q);
}

export async function fetchPlacePhoto(photoReference: string, maxWidth = 800): Promise<{ body: Buffer; contentType: string }> {
    const key = apiKey();
    const res = await fetch(
        `${GOOGLE}/photo?maxwidth=${maxWidth}&photo_reference=${encodeURIComponent(photoReference)}&key=${key}`,
        { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`Google photo HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
        throw new Error(`Google photo was not an image (content-type: ${contentType || 'none'})`);
    }
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
