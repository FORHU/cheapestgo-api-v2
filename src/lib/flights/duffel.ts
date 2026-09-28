/**
 * Duffel API client.
 *
 * Wraps raw HTTP calls to https://api.duffel.com.
 * All callers import from here so the token and version header are managed
 * in one place. No SDK dependency — pure fetch.
 */

import { config } from '@/config';
import { FlightResult, FlightSearchParams } from '@/types/flights';

const DUFFEL_BASE = 'https://api.duffel.com';
const DUFFEL_VERSION = 'v2';
// Per attempt. Busy long-haul round-trips (e.g. FRA↔BKK, 2k+ offers) take ~12s at Duffel.
const SEARCH_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;

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
 * A search Duffel could not answer. Thrown rather than returning [] so the
 * aggregator can tell an outage apart from a route with no flights.
 * `invalidSearch` marks a 4xx validation error — the request itself was wrong.
 */
export class DuffelSearchError extends Error {
    constructor(message: string, public status: number, public invalidSearch = false) {
        super(message);
        this.name = 'DuffelSearchError';
    }
}

export async function searchDuffel(params: FlightSearchParams): Promise<FlightResult[]> {
    const token = config.DUFFEL_ACCESS_TOKEN;
    if (!token) {
        throw new DuffelSearchError('DUFFEL_ACCESS_TOKEN not configured', 0);
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

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(`${DUFFEL_BASE}/air/offer_requests`, {
                method: 'POST',
                headers: duffelHeaders(),
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
            });
            lastStatus = res.status;

            if (!res.ok) {
                const errData: any = await (res.json() as Promise<any>).catch(() => ({}));
                const errMsg = `Duffel ${res.status}: ${JSON.stringify(errData)}`;

                if (res.status === 429 && attempt < MAX_RETRIES) {
                    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
                    const waitMs = Math.min(retryAfter * 1000, 10_000);
                    console.warn(`[Duffel] Rate limited — waiting ${waitMs}ms`);
                    await sleep(waitMs);
                    continue;
                }
                if (res.status === 500 && attempt < MAX_RETRIES) {
                    await sleep(2000 * (attempt + 1));
                    continue;
                }

                console.error(`[Duffel] search error (${res.status}):`, errMsg);
                const first = errData?.errors?.[0];
                throw new DuffelSearchError(
                    first?.message ?? `Duffel search failed (${res.status})`,
                    res.status,
                    (res.status === 400 || res.status === 422) && first?.type === 'validation_error',
                );
            }

            const json: any = await res.json();
            const offers: any[] = json.data?.offers ?? [];
            const durationMs = Date.now() - startMs;
            console.log(`[Duffel] ${offers.length} offers in ${durationMs}ms`);
            return offers.map(o => parseDuffelOffer(o, params.cabinClass));

        } catch (err: any) {
            if (err instanceof DuffelSearchError) throw err;
            const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
            if (isTimeout && attempt < MAX_RETRIES) {
                await sleep(1500 * (attempt + 1));
                continue;
            }
            console.error('[Duffel] search failed after retries:', err.message);
            throw new DuffelSearchError(err.message, 0);
        }
    }

    console.error(`[Duffel] Giving up after ${MAX_RETRIES} retries. Last status: ${lastStatus}`);
    throw new DuffelSearchError(`Duffel search gave up after ${MAX_RETRIES} retries`, lastStatus);
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
    // Services only come back on a single-offer GET with this flag; there is no
    // /available_services sub-resource (it 404s), and search results never include them.
    const res = await fetch(
        `${DUFFEL_BASE}/air/offers/${encodeURIComponent(offerId)}?return_available_services=true`,
        { headers: duffelHeaders() },
    );
    if (!res.ok) {
        const err: any = await (res.json() as Promise<any>).catch(() => ({}));
        throw Object.assign(new Error(err?.errors?.[0]?.message ?? `Duffel services ${res.status}`), { status: res.status });
    }
    const json: any = await res.json();
    return json.data?.available_services ?? [];
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

/** Every seat service in a seat map — Duffel only ever quotes seats here, never on the offer. */
export function seatMapServices(seatMaps: any[]): any[] {
    return (seatMaps ?? []).flatMap((m: any) => (m.cabins ?? [])
        .flatMap((c: any) => c.rows ?? [])
        .flatMap((r: any) => r.sections ?? [])
        .flatMap((s: any) => s.elements ?? [])
        .flatMap((e: any) => e.available_services ?? []));
}

/** Duffel's current prices for the chosen extras: bags from the offer, seats from the seat map. */
export async function quoteDuffelServices(offerId: string, seatServiceIds?: string[], bagServiceIds?: string[]): Promise<any[]> {
    const wantSeats = (seatServiceIds?.length ?? 0) > 0;
    const wantBags = (bagServiceIds?.length ?? 0) > 0;
    if (!wantSeats && !wantBags) return [];
    const [bags, seatMaps] = await Promise.all([
        wantBags ? getDuffelAvailableServices(offerId) : [],
        wantSeats ? getDuffelSeatMaps(offerId) : [],
    ]);
    return [...bags, ...seatMapServices(seatMaps)];
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
    | { kind: 'error'; status: number; data: any };

export async function placeDuffelOrder(params: PlaceDuffelOrderParams): Promise<PlaceDuffelOrderResult> {
    const {
        rawOffer, seatServiceIds, bagServiceIds, confirmedPrice,
        priceTolerance, idempotencyKey, refreshPoolSize = 3,
        orderTimeoutMs = 45_000,
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
                const synRes = new Response(null, { status: 504 });
                return { isPriceChangedError: false, isOfferUnavailable: false, res: synRes, data: { errors: [{ code: 'timeout', message: 'Airline booking system timed out. Please try again.' }] }, finalTotal: currentTotal, finalCurrency: currentCurrency };
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
            // The price action returns no services at all (not even bags), so extras
            // priced from it came to zero and Duffel refused the retried payment.
            let availableSvcs: any[];
            try {
                availableSvcs = includeServices ? await quoteDuffelServices(pricedOffer.id, seatServiceIds, bagServiceIds) : [];
            } catch (e: any) {
                console.error(`[Duffel] could not re-price services on ${pricedOffer.id}: ${e.message}`);
                break;
            }
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
        return { kind: 'error', status: attempt1.res.status, data: attempt1.data };
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

        const targetCarrier = rawOffer.validating_carrier_iata_code
            ?? rawOffer.slices?.[0]?.segments?.[0]?.operating_carrier?.iata_code
            ?? rawOffer.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code;
        const targetTotal = parseFloat(rawOffer.total_amount ?? '0');

        const matchingOffers = targetCarrier
            ? offers.filter((o: any) => {
                const carrier = o.validating_carrier_iata_code
                    ?? o.slices?.[0]?.segments?.[0]?.operating_carrier?.iata_code
                    ?? o.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code;
                return carrier === targetCarrier;
            })
            : offers;

        const sortedPool = (matchingOffers.length > 0 ? matchingOffers : offers).sort((a: any, b: any) =>
            Math.abs(parseFloat(a.total_amount) - targetTotal) - Math.abs(parseFloat(b.total_amount) - targetTotal),
        );

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
                // Marketing carrier: it's the brand the seat was sold under and the one the
                // flight number below belongs to. Reading the operating carrier here put the
                // wrong airline's name beside the flight number on every codeshare.
                airline: seg.marketing_carrier?.iata_code || seg.operating_carrier?.iata_code,
                airlineName: seg.marketing_carrier?.name || seg.operating_carrier?.name,
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

    const totalAmount = parseFloat(offer.total_amount);
    // total_amount covers every passenger; divide by adults for the per-person figure.
    const numAdults = (offer.passengers ?? []).filter((p: any) => p.type === 'adult').length || 1;
    const pricePerAdult = numAdults > 1 ? Math.round(totalAmount / numAdults) : totalAmount;

    // Keep the base/tax split only when it reconciles with the total — a breakdown
    // that doesn't add up is worse than none.
    const baseAmount = offer.base_amount != null ? parseFloat(offer.base_amount) : NaN;
    const taxAmount = offer.tax_amount != null ? parseFloat(offer.tax_amount) : NaN;
    const partsReconcile =
        Number.isFinite(baseAmount) && Number.isFinite(taxAmount) &&
        Math.abs(baseAmount + taxAmount - totalAmount) < 0.01;

    return {
        provider: 'duffel',
        offer_id: offer.id,
        price: totalAmount,
        pricePerAdult,
        ...(partsReconcile ? { baseFare: baseAmount, taxes: taxAmount } : {}),
        currency: offer.total_currency,
        airline: offer.owner.name,
        departure_time: firstSeg?.departure?.time,
        arrival_time: lastSeg?.arrival?.time,
        duration: offer.slices.reduce((acc: number, s: any) => acc + parseDuffelDuration(s.duration), 0),
        stops: offer.slices.reduce((acc: number, s: any) => acc + (s.segments.length - 1), 0),
        remaining_seats: offer.available_seats || null,
        segments: allSegments,
        refundable: isRefundable,
        farePolicy: {
            isRefundable,
            isChangeable,
            refundPenaltyAmount: refundPenalty,
            refundPenaltyCurrency: refundCond?.penalty_currency ?? null,
            changePenaltyAmount: changePenalty,
            changePenaltyCurrency: changeCond?.penalty_currency ?? null,
            policyVersion: 'search' as const,
            policySource: 'duffel' as const,
        },
        raw: offer,
    } as any;
}

export function normalizedToFlightOffer(result: FlightResult, tripType: 'one-way' | 'round-trip' | 'multi-city' = 'one-way'): any {
    const raw: any = result.raw;
    // A cache row keeps only the raw Duffel payload, so re-derive the parsed fields from it.
    const parsed: any = (result as any).segments || !raw?.slices ? result : parseDuffelOffer(raw);

    const price = typeof result.price === 'number' ? result.price : 0;

    const segments = (parsed.segments ?? []).map((seg: any) => ({
        segmentIndex: seg.segmentIndex,
        airline: { code: seg.airline ?? '', name: seg.airlineName ?? '' },
        origin: seg.origin,
        destination: seg.destination,
        flightNumber: seg.flightNumber,
        departure: seg.departure,
        arrival: seg.arrival,
        duration: seg.duration,
        stops: seg.stops,
        aircraft: seg.aircraft,
        cabinClass: seg.cabinClass,
    }));

    return {
        offerId: result.offer_id,
        provider: result.provider,
        price: {
            total: price,
            base: parsed.baseFare ?? price,
            taxes: parsed.taxes ?? 0,
            currency: result.currency,
            pricePerAdult: parsed.pricePerAdult ?? price,
        },
        segments,
        totalDuration: result.duration,
        totalStops: result.stops,
        refundable: (result as any).refundable ?? false,
        farePolicy: parsed.farePolicy ?? null,
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
