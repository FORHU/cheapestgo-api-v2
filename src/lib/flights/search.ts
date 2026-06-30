/**
 * Flight search aggregator.
 *
 * Implements cache-first lookup, parallel provider calls with timeouts,
 * background cache writes, and search analytics. Mirrors the logic from
 * the Next.js monolith's search-flights.ts but uses Prisma instead of the
 * Supabase JS client.
 */

import { prisma } from '@/lib/prisma';
import { FlightSearchParams, FlightResult, FlightOffer } from '@/types/flights';
import { searchDuffel, normalizedToFlightOffer } from './duffel';
// import { searchMystiflyV2 } from './mystifly'; // re-enable when live Mystifly key available

async function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`[Timeout] ${name} exceeded ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
    const TIMEOUT_MS = 12_000;
    // Cache TTL: 10 minutes in production, 0 (disabled) in development by default.
    // Override via env: FLIGHT_CACHE_TTL_MINUTES
    const TTL_MINUTES = parseInt(
        process.env.FLIGHT_CACHE_TTL_MINUTES ?? (process.env.NODE_ENV === 'production' ? '10' : '0'),
        10,
    );

    // 1. Check cache first
    const cachedResults = await getExistingCachedResults(params, TTL_MINUTES);
    if (cachedResults && cachedResults.length > 0) {
        // Strip inactive providers (Mystifly disabled at launch)
        const bookable = cachedResults.filter(r =>
            r.provider !== 'mystifly' && r.provider !== 'mystifly_v2',
        );
        console.log(`[Cache] Hit for ${params.origin}->${params.destination}: ${cachedResults.length} total, ${bookable.length} bookable`);
        if (bookable.length > 0) {
            return bookable.map(r => normalizedToFlightOffer(r as any, params.returnDate ? 'round-trip' : 'one-way'));
        }
    }

    // 2. Cache miss — create search record
    let searchId = params.searchId;
    if (!searchId) {
        const saved = await saveSearch(params).catch(() => null);
        searchId = saved?.id;
    }

    // 3. Fetch from providers in parallel
    const providers = [
        { name: 'Duffel', call: searchDuffel(params) },
        // { name: 'MystiflyV2', call: searchMystiflyV2(params) },
    ];

    const settlement = await Promise.allSettled(
        providers.map(p => withTimeout(p.call, TIMEOUT_MS, p.name)),
    );

    const allResults: FlightResult[] = settlement
        .filter((r): r is PromiseFulfilledResult<FlightResult[]> => r.status === 'fulfilled')
        .flatMap(r => r.value);

    settlement.forEach((r, i) => {
        if (r.status === 'rejected') {
            console.error(`[Search] ${providers[i].name} failed:`, r.reason?.message ?? r.reason);
        }
    });

    // 4. Cache results (fire-and-forget)
    if (allResults.length > 0 && searchId) {
        cacheResults(searchId, allResults).catch(err =>
            console.error('[Cache] Background cache write failed:', err.message),
        );
        logSearchAnalytics(params, allResults).catch(err =>
            console.error('[Analytics] Logging failed:', err.message),
        );
    }

    return allResults.map(r => normalizedToFlightOffer(r as any, params.returnDate ? 'round-trip' : 'one-way'));
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function getExistingCachedResults(params: FlightSearchParams, ttlMinutes: number): Promise<any[] | null> {
    if (ttlMinutes === 0) return null;

    const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);

    const recentSearch = await prisma.flight_searches.findFirst({
        where: {
            origin: params.origin,
            destination: params.destination,
            departure_date: new Date(params.departureDate),
            cabin_class: params.cabinClass,
            adults: params.adults,
            children: params.children,
            infants: params.infants,
            return_date: params.returnDate ? new Date(params.returnDate) : null,
            created_at: { gte: cutoff },
        },
        orderBy: { created_at: 'desc' },
    });

    if (!recentSearch) return null;

    const results = await prisma.flight_results_cache.findMany({
        where: { search_id: recentSearch.id },
    });

    if (!results.length) return null;

    return results.map(r => ({
        provider: r.provider,
        offer_id: r.offer_id,
        price: Number(r.price),
        currency: r.currency,
        airline: r.airline,
        departure_time: r.departure_time.toISOString(),
        arrival_time: r.arrival_time.toISOString(),
        duration: r.duration,
        stops: r.stops,
        remaining_seats: r.remaining_seats,
        refundable: r.refundable,
        raw: r.raw,
    }));
}

export async function saveSearch(params: FlightSearchParams) {
    return prisma.flight_searches.create({
        data: {
            origin: params.origin,
            destination: params.destination,
            departure_date: new Date(params.departureDate),
            return_date: params.returnDate ? new Date(params.returnDate) : null,
            adults: params.adults,
            children: params.children,
            infants: params.infants,
            cabin_class: params.cabinClass,
        },
    });
}

export async function cacheResults(searchId: string, results: FlightResult[]): Promise<void> {
    const CHUNK_SIZE = 50;
    const rows = results.map(r => ({
        id: crypto.randomUUID(),
        search_id: searchId,
        provider: r.provider,
        offer_id: r.offer_id,
        price: r.price,
        currency: r.currency,
        airline: r.airline,
        departure_time: new Date(r.departure_time),
        arrival_time: new Date(r.arrival_time),
        duration: r.duration,
        stops: r.stops ?? 0,
        remaining_seats: r.remaining_seats ?? null,
        refundable: (r as any).refundable ?? false,
        raw: r.raw as any,
    }));

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        try {
            await prisma.flight_results_cache.createMany({ data: rows.slice(i, i + CHUNK_SIZE) });
        } catch (err: any) {
            console.error(`[Cache] Failed to cache chunk ${Math.floor(i / CHUNK_SIZE) + 1}:`, err.message);
        }
    }
}

async function logSearchAnalytics(params: FlightSearchParams, results: FlightResult[]): Promise<void> {
    if (!results.length) return;
    const prices = results.map(r => r.price);
    const minPrice = Math.min(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    await prisma.$executeRaw`
        SELECT increment_search_stats(
            ${params.origin}::text,
            ${params.destination}::text,
            ${minPrice}::numeric,
            ${avgPrice}::numeric
        )
    `.catch(() => {
        // RPC may not exist yet — non-fatal
    });
}

// ─── Server-side filter/sort ──────────────────────────────────────────────────

export interface ServerFilters {
    sortBy?: 'price' | 'duration' | 'departure';
    maxStops?: number | null;
    selectedAirlines?: string[];
}

export function applyServerFilters(offers: FlightOffer[], filters?: ServerFilters): FlightOffer[] {
    if (!filters) return offers;
    let results = [...offers];

    if (filters.maxStops != null) {
        results = results.filter(o => o.totalStops <= filters.maxStops!);
    }

    if (filters.selectedAirlines && filters.selectedAirlines.length > 0) {
        const set = new Set(filters.selectedAirlines);
        results = results.filter(o => {
            const name = (o.segments?.[0] as any)?.airline?.name
                || (o.segments?.[0] as any)?.airline?.code
                || o.provider;
            return set.has(name);
        });
    }

    switch (filters.sortBy ?? 'price') {
        case 'duration':
            results.sort((a, b) => (a.totalDuration ?? 0) - (b.totalDuration ?? 0));
            break;
        case 'departure':
            results.sort((a, b) =>
                (a.segments?.[0]?.departure?.time ?? '').localeCompare(b.segments?.[0]?.departure?.time ?? ''),
            );
            break;
        default:
            results.sort((a, b) => (a.price?.total ?? 0) - (b.price?.total ?? 0));
    }

    return results;
}
