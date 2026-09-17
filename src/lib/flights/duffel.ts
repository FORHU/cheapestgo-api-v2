/**
 * Duffel API client.
 *
 * Wraps raw HTTP calls to https://api.duffel.com.
 * All callers import from here so the token and version header are managed
 * in one place. No SDK dependency — pure fetch.
 */

import { config } from '@/config';
import { FlightResult, FlightSearchParams } from '@/types/flights';
import { PROVIDER_ATTEMPT_TIMEOUT_MS, PROVIDER_RETRY_BACKOFF_MS } from '@/lib/flights/searchBudget';
import { sameItineraryOffers } from '@/lib/flights/offerItineraryMatch';

const DUFFEL_BASE = 'https://api.duffel.com';
const DUFFEL_VERSION = 'v2';
// The ladder is sized in searchBudget so the orchestrator ceiling and the browser abort are
// derived from it rather than guessed alongside it. One retry, not two: a second only starts
// after 26 seconds have already gone, and nothing it returns arrives while anyone is watching.
const MAX_RETRIES = PROVIDER_RETRY_BACKOFF_MS.length;

// ─── Header factory ───────────────────────────────────────────────────────────

export function duffelHeaders(idempotencyKey?: string): Record<string, string> {
    const token = config.DUFFEL_ACCESS_TOKEN;
    if (!token) throw new Error('DUFFEL_ACCESS_TOKEN not configured');
    const h: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Duffel-Version': DUFFEL_VERSION,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    if (idempotencyKey) h['Idempotency-Key'] = idempotencyKey;
    return h;
}

export function getDuffelToken(): string {
    const token = config.DUFFEL_ACCESS_TOKEN;
    if (!token) throw new Error('DUFFEL_ACCESS_TOKEN not configured');
    return token;
}

// ─── Offer search ─────────────────────────────────────────────────────────────

/**
 * The provider tried and could not answer — a 429, a 5xx, a timeout, an unreachable host.
 * Distinct from an empty offer list, which is a real answer about the route. The
 * orchestrator turns this into a named `failedProviders` entry so the results page can
 * offer a retry instead of telling the traveller "No flights found" over an outage.
 */
export class DuffelSearchError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = 'DuffelSearchError';
    }
}

export async function searchDuffel(params: FlightSearchParams): Promise<FlightResult[]> {
    const token = config.DUFFEL_ACCESS_TOKEN;
    if (!token) {
        console.warn('[Duffel] DUFFEL_ACCESS_TOKEN missing — skipping');
        return [];
    }

    // Reject past dates before hitting Duffel (prevents 422)
    const todayUTC = new Date().toISOString().slice(0, 10);
    if (params.departureDate < todayUTC) {
        console.warn(`[Duffel] Skipping — departure_date ${params.departureDate} is in the past`);
        return [];
    }
    if (params.returnDate && params.returnDate < params.departureDate) {
        console.warn(`[Duffel] Skipping — returnDate before departureDate`);
        return [];
    }

    const passengers = [
        ...Array(params.adults).fill({ type: 'adult' }),
        ...Array(params.children).fill({ type: 'child' }),
        ...Array(params.infants).fill({ type: 'infant_without_seat' }),
    ];

    const slices: { origin: string; destination: string; departure_date: string }[] = [
        { origin: params.origin, destination: params.destination, departure_date: params.departureDate },
    ];
    if (params.returnDate) {
        slices.push({ origin: params.destination, destination: params.origin, departure_date: params.returnDate });
    }

    const body = {
        data: {
            slices,
            passengers,
            cabin_class: params.cabinClass === 'premium_economy' ? 'premium_economy'
                : params.cabinClass === 'business' ? 'business'
                    : params.cabinClass === 'first' ? 'first'
                        : 'economy',
            return_offers: true,
        },
    };

    const startMs = Date.now();
    let lastStatus = 0;
    let lastErrMsg = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(`${DUFFEL_BASE}/air/offer_requests`, {
                method: 'POST',
                headers: duffelHeaders(),
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(PROVIDER_ATTEMPT_TIMEOUT_MS),
            });
            lastStatus = res.status;

            if (!res.ok) {
                const errData: any = await (res.json() as Promise<any>).catch(() => ({}));
                const errMsg = `Duffel ${res.status}: ${JSON.stringify(errData)}`;

                lastErrMsg = errMsg;

                // 429 is an account-level rate limit; retrying immediately just generates
                // more of them, so it never retries. Any other 5xx gets the ladder.
                if (res.status >= 500 && attempt < MAX_RETRIES) {
                    await sleep(PROVIDER_RETRY_BACKOFF_MS[attempt]);
                    continue;
                }

                if (res.status === 429) {
                    console.warn(`[Duffel] Rate limited (429). Retry-After: ${res.headers.get('Retry-After') ?? 'unknown'}s — not attempted further.`);
                } else {
                    console.error(`[Duffel] search error (${res.status}):`, errMsg);
                }
                break;
            }

            const json: any = await res.json();
            const offers: any[] = json.data?.offers ?? [];
            const durationMs = Date.now() - startMs;
            console.log(`[Duffel] ${offers.length} offers in ${durationMs}ms`);
            return offers.map(o => parseDuffelOffer(o, params.cabinClass));

        } catch (err: any) {
            lastErrMsg = err.message;
            const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
            if (isTimeout && attempt < MAX_RETRIES) {
                await sleep(PROVIDER_RETRY_BACKOFF_MS[attempt]);
                continue;
            }
            console.error('[Duffel] search failed:', err.message);
            break;
        }
    }

    // Reached only when every attempt failed. Throwing — rather than returning [] — is what
    // lets the orchestrator name Duffel in `failedProviders`, so the page offers a retry
    // instead of telling the traveller there are no flights on the route.
    console.error(`[Duffel] Giving up after ${MAX_RETRIES} retr${MAX_RETRIES === 1 ? 'y' : 'ies'}. Last status: ${lastStatus}`);
    throw new DuffelSearchError(
        `Duffel search failed${lastStatus ? ` (HTTP ${lastStatus})` : ''}: ${lastErrMsg || 'no response'}`,
        lastStatus || undefined,
    );
}

// ─── Balance check ────────────────────────────────────────────────────────────

interface BalanceEntry { currency: string; available: number; }
let _balanceCache: { balances: BalanceEntry[]; fetchedAt: number } | null = null;
const BALANCE_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getDuffelBalances(token: string, forceRefresh = false): Promise<BalanceEntry[]> {
    const now = Date.now();
    if (!forceRefresh && _balanceCache && now - _balanceCache.fetchedAt < BALANCE_CACHE_TTL_MS) {
        return _balanceCache.balances;
    }
    const res = await fetch(`${DUFFEL_BASE}/air/payments/balances`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Duffel-Version': DUFFEL_VERSION },
    });
    if (!res.ok) throw new Error(`Duffel balance fetch failed: ${res.status}`);
    const json: any = await res.json();
    const balances: BalanceEntry[] = (json.data ?? []).map((b: any) => ({
        currency: b.currency as string,
        available: parseFloat(b.available),
    }));
    _balanceCache = { balances, fetchedAt: now };
    return balances;
}

export function getAvailableBalance(balances: BalanceEntry[], currency: string): number {
    return balances.find(b => b.currency.toUpperCase() === currency.toUpperCase())?.available ?? 0;
}

// ─── Available services (bags) ────────────────────────────────────────────────

export async function getDuffelAvailableServices(offerId: string): Promise<any[]> {
    const res = await fetch(
        `${DUFFEL_BASE}/air/offers/${encodeURIComponent(offerId)}/available_services`,
        { headers: duffelHeaders() },
    );
    if (!res.ok) {
        const err: any = await (res.json() as Promise<any>).catch(() => ({}));
        throw Object.assign(new Error(err?.errors?.[0]?.message ?? `Duffel services ${res.status}`), { status: res.status });
    }
    const json: any = await res.json();
    return json.data ?? [];
}

// ─── Seat maps ────────────────────────────────────────────────────────────────

export async function getDuffelSeatMaps(offerId: string): Promise<any[]> {
    const res = await fetch(
        `${DUFFEL_BASE}/air/seat_maps?offer_id=${encodeURIComponent(offerId)}`,
        { headers: duffelHeaders() },
    );
    if (!res.ok) {
        const err: any = await (res.json() as Promise<any>).catch(() => ({}));
        throw Object.assign(
            new Error(err?.errors?.[0]?.message ?? `Duffel seat map ${res.status}`),
            { status: res.status },
        );
    }
    const json: any = await res.json();
    return json.data ?? [];
}

// ─── Offer refresh ────────────────────────────────────────────────────────────

export async function refreshDuffelOffer(rawOffer: any): Promise<any[]> {
    const slices = (rawOffer.slices ?? []).map((slice: any) => {
        const firstSeg = slice.segments[0];
        return {
            origin: firstSeg.origin.iata_code,
            destination: slice.segments[slice.segments.length - 1].destination.iata_code,
            departure_date: firstSeg.departing_at.slice(0, 10),
        };
    });

    const passengers = (rawOffer.passengers ?? []).map((p: any) => ({ type: p.type ?? 'adult' }));
    if (passengers.length === 0) passengers.push({ type: 'adult' });

    const cabinClass: string = rawOffer.slices[0]?.segments[0]?.passengers?.[0]?.cabin_class ?? 'economy';

    const res = await fetch(`${DUFFEL_BASE}/air/offer_requests`, {
        method: 'POST',
        headers: duffelHeaders(),
        body: JSON.stringify({ data: { slices, passengers, cabin_class: cabinClass, return_offers: true } }),
        signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
        const err: any = await (res.json() as Promise<any>).catch(() => ({}));
        throw new Error(err?.errors?.[0]?.message ?? `offer_request failed ${res.status}`);
    }

    const json: any = await res.json();
    return json.data?.offers ?? [];
}

// ─── Order placement ──────────────────────────────────────────────────────────

/**
 * How long to wait on POST /air/orders before giving up.
 *
 * 130s is Duffel's documented client-timeout floor for order creation, not a generous
 * margin. **Aborting does not cancel the order** — Duffel completes the airline booking
 * regardless — so a shorter bound does not save the traveller from a slow airline, it just
 * hides a real, paid PNR from this system: the traveller is told the booking failed, the
 * balance is debited, and nothing links the two. This was 45s.
 */
export const ORDER_CREATE_TIMEOUT_MS = 130_000;

export interface PlaceDuffelOrderParams {
    rawOffer: any;
    passengers: any[];
    total: string;
    currency: string;
    seatServiceIds?: string[];
    bagServiceIds?: string[];
    confirmedPrice?: number;
    priceTolerance: number;
    idempotencyKey: string;
    refreshPoolSize?: number;
    orderTimeoutMs?: number;
}

export type PlaceDuffelOrderResult =
    | { kind: 'success'; order: any; finalTotal: string; finalCurrency: string; usedOffer: any }
    | { kind: 'price_changed'; oldPrice: number; newPrice: number; currency: string }
    | { kind: 'offer_replaced'; newOfferId: string; newOffer: any }
    | { kind: 'error'; status: number; data: any; timedOut?: boolean };

export async function placeDuffelOrder(params: PlaceDuffelOrderParams): Promise<PlaceDuffelOrderResult> {
    const {
        rawOffer, seatServiceIds, bagServiceIds, confirmedPrice,
        priceTolerance, idempotencyKey, refreshPoolSize = 3,
        orderTimeoutMs = ORDER_CREATE_TIMEOUT_MS,
    } = params;

    const token = getDuffelToken();
    const isSandbox = token.startsWith('duffel_test_');

    const getHdrs = (key: string) => ({
        'Authorization': `Bearer ${token}`,
        'Duffel-Version': DUFFEL_VERSION,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
    });

    const buildOrderBody = (offerId: string, paxList: any[], total: string, currency: string, includeServices: boolean) => ({
        type: 'instant',
        selected_offers: [offerId],
        passengers: paxList,
        payments: [{ type: 'balance', amount: total, currency }],
        ...(includeServices && (seatServiceIds?.length || bagServiceIds?.length)
            ? { services: [...(seatServiceIds ?? []), ...(bagServiceIds ?? [])].map(id => ({ id, quantity: 1 })) }
            : {}),
    });

    interface TryResult {
        isPriceChangedError: boolean; isOfferUnavailable: boolean;
        /** The request was aborted; the order may still exist at Duffel. */
        timedOut?: boolean;
        oldPrice?: number; newPrice?: number; newCurrency?: string;
        res?: Response; data?: any; finalTotal?: string; finalCurrency?: string;
    }

    const tryPlaceOrder = async (
        offerId: string, paxList: any[], total: string, currency: string,
        includeServices: boolean, key: string,
    ): Promise<TryResult> => {
        let currentTotal = total;
        let currentCurrency = currency;

        const ctrl = new AbortController();
        const tmo = setTimeout(() => ctrl.abort(), orderTimeoutMs);

        let res: Response;
        let data: any;
        try {
            res = await fetch(`${DUFFEL_BASE}/air/orders`, {
                method: 'POST',
                headers: getHdrs(key),
                body: JSON.stringify({ data: buildOrderBody(offerId, paxList, currentTotal, currentCurrency, includeServices) }),
                signal: ctrl.signal,
            });
            data = await res.json();
        } catch (fetchErr: any) {
            clearTimeout(tmo);
            if (fetchErr?.name === 'AbortError') {
                // The request is gone; the order may well not be. Whoever handles this result
                // has to look for it — see findOrderFromTimedOutAttempt.
                const synRes = new Response(null, { status: 504 });
                return { isPriceChangedError: false, isOfferUnavailable: false, timedOut: true, res: synRes, data: { errors: [{ code: 'timeout', message: 'Airline booking system timed out. Please try again.' }] }, finalTotal: currentTotal, finalCurrency: currentCurrency };
            }
            throw fetchErr;
        }
        clearTimeout(tmo);

        if (res.status === 422 && data?.errors?.[0]?.code === 'offer_no_longer_available') {
            return { isPriceChangedError: false, isOfferUnavailable: true };
        }

        let internalAttempts = 0;
        while (res.status === 422 && data?.errors?.[0]?.code === 'price_changed' && internalAttempts < 2) {
            internalAttempts++;
            const currentId = data?.errors?.[0]?.source?.offer_id ?? offerId;
            console.warn(`[Duffel] 422 price_changed on ${currentId} (attempt ${internalAttempts}) — Price Action`);

            const pricCtrl = new AbortController();
            const pricTmo = setTimeout(() => pricCtrl.abort(), 10_000);
            let liveRes: Response;
            let liveData: any;
            try {
                liveRes = await fetch(`${DUFFEL_BASE}/air/offers/${currentId}/actions/price`, {
                    method: 'POST',
                    headers: getHdrs(crypto.randomUUID()),
                    body: JSON.stringify({ data: {} }),
                    signal: pricCtrl.signal,
                });
                liveData = await liveRes.json();
            } catch (e: any) {
                clearTimeout(pricTmo);
                console.error(`[Duffel] Price Action failed: ${e.message}`);
                break;
            }
            clearTimeout(pricTmo);

            if (!liveRes.ok || !liveData?.data) break;

            const pricedOffer = liveData.data;
            const availableSvcs: any[] = pricedOffer.available_services ?? [];
            let newSeatExtra = 0;
            let newBagExtra = 0;
            if (includeServices) {
                for (const id of (seatServiceIds ?? [])) {
                    const svc = availableSvcs.find((s: any) => s.id === id);
                    if (svc) newSeatExtra += parseFloat(svc.total_amount ?? '0');
                }
                for (const id of (bagServiceIds ?? [])) {
                    const svc = availableSvcs.find((s: any) => s.id === id);
                    if (svc) newBagExtra += parseFloat(svc.total_amount ?? '0');
                }
            }

            const freshBase = parseFloat(pricedOffer.total_amount ?? '0');
            const newTotalNum = freshBase + newSeatExtra + newBagExtra;
            const oldTotalNum = parseFloat(currentTotal);
            const priceDelta = Math.abs(newTotalNum - oldTotalNum);
            const priceAlreadyConfirmed = confirmedPrice !== undefined && newTotalNum <= confirmedPrice + priceTolerance;
            currentCurrency = pricedOffer.total_currency ?? currentCurrency;

            if (priceDelta > priceTolerance && !priceAlreadyConfirmed) {
                return { isPriceChangedError: true, isOfferUnavailable: false, oldPrice: oldTotalNum, newPrice: newTotalNum, newCurrency: currentCurrency };
            }

            currentTotal = newTotalNum.toFixed(2);
            const retCtrl = new AbortController();
            const retTmo = setTimeout(() => retCtrl.abort(), orderTimeoutMs);
            try {
                res = await fetch(`${DUFFEL_BASE}/air/orders`, {
                    method: 'POST',
                    headers: getHdrs(crypto.randomUUID()),
                    body: JSON.stringify({ data: buildOrderBody(pricedOffer.id, paxList, currentTotal, currentCurrency, includeServices) }),
                    signal: retCtrl.signal,
                });
                data = await res.json();
            } catch (e: any) {
                clearTimeout(retTmo);
                console.error(`[Duffel] price_changed retry failed: ${e.message}`);
                break;
            }
            clearTimeout(retTmo);
            if (res.ok) break;
        }

        return { isPriceChangedError: false, isOfferUnavailable: false, res, data, finalTotal: currentTotal, finalCurrency: currentCurrency };
    };

    // Attempt 1
    const attempt1 = await tryPlaceOrder(rawOffer.id, params.passengers, params.total, params.currency, true, idempotencyKey);
    if (attempt1.isPriceChangedError) {
        return { kind: 'price_changed', oldPrice: attempt1.oldPrice!, newPrice: attempt1.newPrice!, currency: attempt1.newCurrency ?? params.currency };
    }
    if (!attempt1.isOfferUnavailable && attempt1.res?.ok) {
        return { kind: 'success', order: attempt1.data.data, finalTotal: attempt1.finalTotal!, finalCurrency: attempt1.finalCurrency!, usedOffer: rawOffer };
    }
    if (!attempt1.isOfferUnavailable && attempt1.res && attempt1.res.status !== 422) {
        // `timedOut` travels with the failure because aborting the request does not cancel
        // the order: the caller has to go looking for it before telling anyone it failed.
        return { kind: 'error', status: attempt1.res.status, data: attempt1.data, timedOut: attempt1.timedOut };
    }

    // Auto-refresh: offer expired
    console.warn('[Duffel] offer expired — rebuilding offer_request');
    try {
        const slices: any[] = (rawOffer.slices ?? []).map((sl: any) => {
            const origin = sl.origin?.iata_code ?? sl.segments?.[0]?.origin?.iata_code;
            const destination = sl.destination?.iata_code ?? sl.segments?.[sl.segments.length - 1]?.destination?.iata_code;
            const departure_date = sl.departure_date ?? sl.segments?.[0]?.departing_at?.slice(0, 10);
            return { origin, destination, departure_date };
        }).filter((s: any) => s.origin && s.destination && s.departure_date);

        if (slices.length === 0) return { kind: 'error', status: 422, data: attempt1.data };

        const paxTypes: any[] = (rawOffer.passengers ?? []).map((p: any) => ({ type: p.type ?? 'adult' }));
        const cabinClass: string = rawOffer.cabin_class
            ?? rawOffer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class_marketing_name?.toLowerCase()
            ?? 'economy';

        const orRes = await fetch(`${DUFFEL_BASE}/air/offer_requests?return_offers=true`, {
            method: 'POST',
            headers: getHdrs(crypto.randomUUID()),
            body: JSON.stringify({ data: { slices, passengers: paxTypes, cabin_class: cabinClass } }),
        });
        const orData: any = await orRes.json();
        if (!orRes.ok) return { kind: 'error', status: 422, data: attempt1.data };

        let offers: any[] = orData.data?.offers ?? [];
        if (offers.length === 0 && orData.data?.id) {
            const offersRes = await fetch(`${DUFFEL_BASE}/air/offers?offer_request_id=${orData.data.id}&limit=50`, { headers: getHdrs(crypto.randomUUID()) });
            const offersData: any = await offersRes.json();
            offers = offersData.data ?? [];
        }
        if (offers.length === 0) return { kind: 'error', status: 422, data: attempt1.data };

        const targetTotal = parseFloat(rawOffer.total_amount ?? '0');

        // Only offers for the SAME journey — marketing carrier, flight number and departure
        // instant, segment by segment. This used to take the validating carrier's offers (or,
        // failing that, every offer on the route) and sort them by how close the price was.
        // Price proximity is not identity: a 06:00 and a 22:00 departure on one airline at one
        // fare are interchangeable to that sort, so a traveller could be ticketed sixteen hours
        // from the flight they chose without being asked — and flight_segments would still
        // record the one they picked. Cheapest first within the true matches, which are by
        // definition the same product.
        const sortedPool = sameItineraryOffers(rawOffer, offers);
        console.warn(`[Duffel] refresh pool: ${offers.length} offer(s), ${sortedPool.length} match the selected itinerary exactly`);

        // Nothing that is actually this flight. Substituting a different one is not a
        // recovery; report it unavailable and let the traveller choose.
        if (sortedPool.length === 0) return { kind: 'error', status: 422, data: attempt1.data };

        const hadAncillaries = (seatServiceIds?.length ?? 0) > 0 || (bagServiceIds?.length ?? 0) > 0;
        const maxAttempts = Math.min(sortedPool.length, refreshPoolSize);

        for (let i = 0; i < maxAttempts; i++) {
            const freshOffer = sortedPool[i];
            const freshBaseTotal = parseFloat(freshOffer.total_amount ?? '0');
            const priceDelta = Math.abs(freshBaseTotal - targetTotal);
            const priceAlreadyConfirmed = confirmedPrice !== undefined && freshBaseTotal <= confirmedPrice + priceTolerance;

            if (priceDelta > priceTolerance && !priceAlreadyConfirmed) {
                return { kind: 'price_changed', oldPrice: targetTotal, newPrice: freshBaseTotal, currency: freshOffer.total_currency ?? params.currency };
            }

            if (hadAncillaries) {
                return { kind: 'offer_replaced', newOfferId: freshOffer.id, newOffer: freshOffer };
            }

            const freshPaxTemplates: any[] = freshOffer.passengers ?? [];
            const refreshedPassengers = params.passengers.map((pax: any, idx: number) => ({
                ...pax,
                id: freshPaxTemplates[idx]?.id ?? pax.id,
            }));

            const attempt2 = await tryPlaceOrder(freshOffer.id, refreshedPassengers, freshBaseTotal.toFixed(2), freshOffer.total_currency, false, crypto.randomUUID());

            if (attempt2.res?.status && attempt2.res.status >= 500) return { kind: 'error', status: attempt2.res.status, data: attempt2.data };
            if (attempt2.isOfferUnavailable) continue;
            if (attempt2.isPriceChangedError) return { kind: 'price_changed', oldPrice: attempt2.oldPrice!, newPrice: attempt2.newPrice!, currency: attempt2.newCurrency ?? params.currency };
            if (attempt2.res?.ok) return { kind: 'success', order: attempt2.data.data, finalTotal: attempt2.finalTotal!, finalCurrency: attempt2.finalCurrency!, usedOffer: freshOffer };
            return { kind: 'error', status: attempt2.res?.status ?? 422, data: attempt2.data };
        }

        return { kind: 'error', status: 422, data: attempt1.data };
    } catch (err: any) {
        console.error('[Duffel] auto-refresh failed:', err.message);
        return { kind: 'error', status: 422, data: attempt1.data };
    }
}

// ─── Cancellation ─────────────────────────────────────────────────────────────

export async function createDuffelCancellationQuote(orderId: string): Promise<any> {
    const res = await fetch(`${DUFFEL_BASE}/air/order_cancellations`, {
        method: 'POST',
        headers: duffelHeaders(),
        body: JSON.stringify({ data: { order_id: orderId } }),
        signal: AbortSignal.timeout(12_000),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data?.errors?.[0]?.message ?? `Duffel cancellation quote failed ${res.status}`);
    return data.data;
}

export async function confirmDuffelCancellation(cancellationId: string): Promise<any> {
    const res = await fetch(`${DUFFEL_BASE}/air/order_cancellations/${cancellationId}/actions/confirm`, {
        method: 'POST',
        headers: duffelHeaders(),
        signal: AbortSignal.timeout(12_000),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data?.errors?.[0]?.message ?? `Duffel cancellation confirm failed ${res.status}`);
    return data.data;
}

export async function getDuffelOrder(orderId: string): Promise<any> {
    const res = await fetch(`${DUFFEL_BASE}/air/orders/${orderId}`, {
        headers: duffelHeaders(),
        signal: AbortSignal.timeout(12_000),
    });
    const data: any = await res.json();
    if (!res.ok) throw Object.assign(new Error(data?.errors?.[0]?.message ?? `Duffel order fetch failed ${res.status}`), { status: res.status });
    return data.data;
}

export function mapDuffelStatus(order: any): string {
    if (order?.cancelled_at) {
        return 'cancelled';
    }

    const documents: any[] = order?.documents ?? [];
    const hasTicket = documents.some((doc: any) => doc.type === 'electronic_ticket');
    if (hasTicket) {
        return 'ticketed';
    }

    if (order?.payment_status?.awaiting_payment) {
        return 'awaiting_payment';
    }

    return 'confirmed';
}

// ─── Offer normalization ──────────────────────────────────────────────────────

export function parseDuffelOffer(offer: any, cabinClassFallback?: string): FlightResult {
    const allSegments: any[] = [];

    offer.slices.forEach((slice: any, sliceIdx: number) => {
        slice.segments.forEach((seg: any) => {
            allSegments.push({
                segmentIndex: sliceIdx,
                airline: seg.operating_carrier?.iata_code || seg.marketing_carrier?.iata_code,
                airlineName: seg.operating_carrier?.name || seg.marketing_carrier?.name,
                origin: seg.origin.iata_code,
                destination: seg.destination.iata_code,
                flightNumber: `${seg.marketing_carrier.iata_code}${seg.marketing_carrier_flight_number}`,
                departure: { airport: seg.origin.iata_code, terminal: seg.origin_terminal, time: seg.departing_at },
                arrival: { airport: seg.destination.iata_code, terminal: seg.destination_terminal, time: seg.arriving_at },
                duration: parseDuffelDuration(seg.duration),
                stops: 0,
                aircraft: seg.aircraft?.name,
                cabinClass: seg.passengers?.[0]?.cabin_class || cabinClassFallback,
            });
        });
    });

    const firstSeg = allSegments[0];
    const lastSeg = allSegments[allSegments.length - 1];

    const refundCond = offer.conditions?.refund_before_departure;
    const changeCond = offer.conditions?.change_before_departure;
    const isRefundable = refundCond?.allowed === true;
    const isChangeable = changeCond?.allowed === true;
    const refundPenalty = refundCond?.penalty_amount != null ? parseFloat(refundCond.penalty_amount) : null;
    const changePenalty = changeCond?.penalty_amount != null ? parseFloat(changeCond.penalty_amount) : null;

    return {
        provider: 'duffel',
        offer_id: offer.id,
        price: parseFloat(offer.total_amount),
        currency: offer.total_currency,
        airline: offer.owner.name,
        departure_time: firstSeg?.departure?.time,
        arrival_time: lastSeg?.arrival?.time,
        duration: offer.slices.reduce((acc: number, s: any) => acc + parseDuffelDuration(s.duration), 0),
        stops: offer.slices.reduce((acc: number, s: any) => acc + (s.segments.length - 1), 0),
        remaining_seats: offer.available_seats || null,
        segments: allSegments,
        refundable: isRefundable,
        raw: offer,
    } as any;
}

export function normalizedToFlightOffer(result: FlightResult, tripType: 'one-way' | 'round-trip' | 'multi-city' = 'one-way'): any {
    const raw: any = result.raw;
    const allSegments: any[] = (result as any).segments ?? (raw?.slices ? parseDuffelOffer(raw).segments : []);

    const price = typeof result.price === 'number' ? result.price : 0;

    return {
        offerId: result.offer_id,
        provider: result.provider,
        price: {
            total: price,
            base: (raw as any).baseFare ?? price,
            taxes: (raw as any).taxes ?? 0,
            currency: result.currency,
            pricePerAdult: (raw as any).pricePerAdult ?? price,
        },
        segments: allSegments,
        totalDuration: result.duration,
        totalStops: result.stops,
        refundable: (result as any).refundable ?? false,
        farePolicy: (raw as any).farePolicy ?? null,
        seatsRemaining: result.remaining_seats ?? undefined,
        tripType,
        traceId: result.traceId,
        _rawOffer: raw,
        normalizedPriceUsd: price,
        bestScore: 0,
        physicalFlightId: result.offer_id,
    };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function parseDuffelDuration(duration: string): number {
    const matches = duration?.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/);
    if (!matches) return 0;
    const days = parseInt(matches[1] || '0');
    const hours = parseInt(matches[2] || '0');
    const minutes = parseInt(matches[3] || '0');
    return days * 24 * 60 + hours * 60 + minutes;
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
