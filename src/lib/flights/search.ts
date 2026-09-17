/**
 * Flight search aggregator.
 *
 * Implements cache-first lookup, parallel provider calls with timeouts,
 * background cache writes, and search analytics. Mirrors the logic from
 * the Next.js monolith's search-flights.ts but uses Prisma instead of the
 * Supabase JS client.
 */

import { prisma } from '@/lib/prisma';
import { FlightSearchParams, FlightOffer, FlightResult } from '@/types/flights';
import { PROVIDER_CEILING_MS } from '@/lib/flights/searchBudget';
import { searchDuffel, normalizedToFlightOffer } from './duffel';
// import { searchMystiflyV2 } from './mystifly'; // re-enable when live Mystifly key available

async function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`[Timeout] ${name} exceeded ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FlightSearchOutcome {
    offers: FlightOffer[];
    /**
     * Providers that tried and could not answer. An empty `offers` with a name in here is
     * a broken search; an empty `offers` with nothing in here is a route nobody flies.
     * Presented identically, an outage reads to the traveller as "there are no flights",
     * with nothing to retry.
     */
    failedProviders: string[];
}

/**
 * Every search goes straight to the providers. Offers are never served from the database.
 *
 * A stored result carries the provider's offer id, and those ids are quotes with an expiry —
 * a Duffel offer dies roughly 20–30 minutes after it is issued. Replaying a stored row hands
 * the traveller a price whose offer no longer exists at the supplier: the booking gets as far
 * as order placement, fails with `offer_no_longer_available`, and the refresh re-quotes from
 * scratch onto a different price. A cache hit bought a faster search at the cost of an
 * unbookable one.
 *
 * `flight_results_cache` is still written below — the price calendar reads it as price
 * history — it just never answers a search.
 */
export async function searchFlights(params: FlightSearchParams): Promise<FlightOffer[]> {
    return (await searchFlightsWithStatus(params)).offers;
}

export async function searchFlightsWithStatus(params: FlightSearchParams): Promise<FlightSearchOutcome> {
    // A circuit breaker for an adapter that ignores its own deadline, derived from the retry
    // ladder so it can never again land ON one attempt's timeout and cut the retries off
    // before they can deliver — which is what made a slow first attempt read as no flights.
    const TIMEOUT_MS = PROVIDER_CEILING_MS;

    // Create the search record
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

    const failedProviders: string[] = [];
    settlement.forEach((r, i) => {
        if (r.status === 'rejected') {
            failedProviders.push(providers[i].name);
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

    return {
        offers: allResults.map(r => normalizedToFlightOffer(r as any, params.returnDate ? 'round-trip' : 'one-way')),
        failedProviders,
    };
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

// The cache *reader* was removed: `flight_results_cache` is written below for the price
// calendar's history and never answers a search — see searchFlightsWithStatus for why.

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
