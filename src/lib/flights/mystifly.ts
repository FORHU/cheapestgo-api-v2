/**
 * Mystifly API client — V2 direct Node.js calls.
 *
 * Session is cached in module memory (per-process), reducing auth overhead.
 * The session TTL is 55 minutes (Mystifly invalidates after 60).
 */

import { config } from '@/config';
import { FlightResult, FlightSearchParams } from '@/types/flights';

// ─── Config ───────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 55 * 60 * 1000;
const FETCH_TIMEOUT_MS = 9_000;
const MAX_RETRIES = 2;

// ─── Session cache ────────────────────────────────────────────────────────────

interface SessionCache { sessionId: string; createdAt: number; }
let sessionCache: SessionCache | null = null;

async function createSession(): Promise<string> {
    if (sessionCache && Date.now() - sessionCache.createdAt < SESSION_TTL_MS) {
        return sessionCache.sessionId;
    }

    const baseUrl = getMystiflyBaseUrl();
    const res = await fetchWithTimeout(`${baseUrl}/api/CreateSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            UserName: config.MYSTIFLY_USERNAME,
            Password: config.MYSTIFLY_PASSWORD,
            AccountNumber: config.MYSTIFLY_ACCOUNT_NUMBER,
        }),
    });

    if (!res.ok) throw new Error(`Mystifly CreateSession failed: HTTP ${res.status}`);

    const data: any = await res.json();
    if (!data.Success || !data.Data?.SessionId) {
        throw new Error(`Mystifly CreateSession failed: ${data.Message ?? 'No SessionId'}`);
    }

    sessionCache = { sessionId: data.Data.SessionId, createdAt: Date.now() };
    console.log('[Mystifly] Session acquired:', sessionCache.sessionId.slice(0, 8) + '…');
    return sessionCache.sessionId;
}

function clearSessionCache() { sessionCache = null; }

function getMystiflyBaseUrl(): string {
    return (config as any).MYSTIFLY_BASE_URL || 'https://restapidemo.myfarebox.com';
}

function getMystiflyTarget(): 'Production' | 'Test' {
    return ((config as any).MYSTIFLY_ENV || '').toLowerCase() === 'test' ? 'Test' : 'Production';
}

// ─── Core request ─────────────────────────────────────────────────────────────

export async function mystiflyRequest<T = any>(
    endpoint: string,
    body: Record<string, any>,
): Promise<T> {
    const baseUrl = getMystiflyBaseUrl();
    const target = body.Target ?? getMystiflyTarget();
    const conversationId = crypto.randomUUID();

    let sid = await createSession();

    const finalBody = { ...body, Target: target, ConversationId: conversationId };

    const buildInit = (s: string): RequestInit => ({
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${s}`,
            'ConversationId': conversationId,
        },
        body: JSON.stringify(finalBody),
    });

    let res = await fetchWithRetry(`${baseUrl}${endpoint}`, buildInit(sid));

    if (res.status === 401) {
        console.warn('[Mystifly] 401 — refreshing session');
        clearSessionCache();
        sid = await createSession();
        res = await fetchWithRetry(`${baseUrl}${endpoint}`, buildInit(sid));
    }

    const text = await res.text();
    let json: any;
    try {
        json = JSON.parse(text);
    } catch {
        throw new Error(`Mystifly ${endpoint} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    if (!res.ok) throw new Error(`Mystifly ${endpoint} → ${res.status}: ${json?.Message ?? text.slice(0, 200)}`);

    return json as T;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export const CABIN_MAP: Record<string, string> = {
    economy: 'Y', premium_economy: 'S', business: 'C', first: 'F',
};

export const TRIP_TYPE_MAP: Record<string, string> = {
    'one-way': 'OneWay', 'round-trip': 'Return', 'multi-city': 'MultiCity',
};

export async function searchMystiflyV2(params: FlightSearchParams): Promise<FlightResult[]> {
    if (!config.MYSTIFLY_USERNAME || !config.MYSTIFLY_PASSWORD || !config.MYSTIFLY_ACCOUNT_NUMBER) {
        return [];
    }

    console.log('[MystiflyV2] Searching:', params.origin, '->', params.destination);

    try {
        const tripType = params.returnDate ? 'round-trip' : 'one-way';
        const segments = [
            { origin: params.origin.toUpperCase(), destination: params.destination.toUpperCase(), departureDate: params.departureDate },
        ];
        if (params.returnDate) {
            segments.push({ origin: params.destination.toUpperCase(), destination: params.origin.toUpperCase(), departureDate: params.returnDate });
        }

        const cabinCode = CABIN_MAP[params.cabinClass ?? 'economy'] ?? 'Y';
        const airTripType = TRIP_TYPE_MAP[tripType] ?? 'OneWay';
        const nationality = (config as any).MYSTIFLY_NATIONALITY || 'US';
        const pricingSourceType = (config as any).MYSTIFLY_PRICING_SOURCE_TYPE || 'Public';

        const passengerTypes: { Code: string; Quantity: number }[] = [];
        if (params.adults > 0) passengerTypes.push({ Code: 'ADT', Quantity: params.adults });
        if (params.children && params.children > 0) passengerTypes.push({ Code: 'CHD', Quantity: params.children });
        if (params.infants && params.infants > 0) passengerTypes.push({ Code: 'INF', Quantity: params.infants });

        const body = {
            OriginDestinationInformations: segments.map(s => ({
                DepartureDateTime: `${s.departureDate}T00:00:00`,
                OriginLocationCode: s.origin,
                DestinationLocationCode: s.destination,
            })),
            PassengerTypeQuantities: passengerTypes,
            PricingSourceType: pricingSourceType,
            Nationalities: [nationality],
            Nationality: nationality,
            NearByAirports: true,
            CurrencyCode: 'USD',
            TravelPreferences: {
                AirTripType: airTripType,
                CabinPreference: cabinCode,
                MaxStopsQuantity: 'All',
                PreferenceLevel: 'Preferred',
                Preferences: {
                    CabinClassPreference: { CabinType: cabinCode, PreferenceLevel: 'Preferred' },
                },
                VendorPreferenceCodes: null,
                VendorExcludeCodes: null,
            },
            RequestOptions: 'TwoHundred',
        };

        const raw = await mystiflyRequest('/api/v2/Search/Flight', body);

        if (!raw.Success) {
            const msg: string = raw.Message ?? '';
            const isEmpty = msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('no flights') || msg.toLowerCase().includes('no result');
            if (isEmpty) return [];
            throw new Error(`Mystifly V2 search failed: ${msg}`);
        }

        const results = normalizeMystiflyV2Results(raw, 200) as FlightResult[];

        const searchIdentifier: string =
            raw.SearchIdentifier ?? raw.Data?.SearchIdentifier ?? raw.Data?.TraceId ?? raw.Data?.ConversationId ?? '';
        const v2ConversationId: string = raw.Data?.ConversationId ?? '';

        if (!searchIdentifier) {
            console.warn('[MystiflyV2] No SearchIdentifier in response — returning 0 results');
            return [];
        }

        results.forEach((r: any) => {
            if (r.traceId) r.traceId = `${r.traceId}|${v2ConversationId}||${searchIdentifier}`;
        });

        console.log(`[MystiflyV2] ${results.length} results`);
        return results;
    } catch (err: any) {
        console.error('[MystiflyV2] Search failed:', err.message);
        return [];
    }
}

// ─── Normalization ────────────────────────────────────────────────────────────

export function normalizeMystiflyV2Results(raw: any, maxOffers = 50): any[] {
    const data = raw.Data ?? raw;
    const itinList: any[] = data.PricedItineraries ?? data.FareItineraries ?? data.ItineraryList ?? data.FlightItineraries ?? [];
    const results: any[] = [];

    for (const itin of itinList.slice(0, maxOffers)) {
        try {
            const fareSourceCode: string = itin.FareSourceCode ?? '';
            const fare = data.FlightFaresList?.find((f: any) => f.FareRef === itin.FareRef);
            if (!fare && !fareSourceCode) continue;

            const currency: string = fare?.Currency ?? 'USD';
            let totalPrice = 0;
            let totalBase = 0;
            let pricePerAdult = 0;

            for (const pf of (fare?.PassengerFare ?? [])) {
                const paxTotal = parseFloat(pf.TotalFare) || 0;
                const paxBase = parseFloat(pf.BaseFare) || 0;
                const qty = Number(pf.Quantity) || 1;
                totalPrice += paxTotal * qty;
                totalBase += paxBase * qty;
                if (pf.PaxType === 'ADT') pricePerAdult = paxTotal;
            }
            if (pricePerAdult === 0) pricePerAdult = totalPrice;
            const taxes = Math.max(0, totalPrice - totalBase);

            const segments: any[] = [];
            let totalDurationMin = 0;
            let brandName: string | undefined;
            let checkedBags = 0;
            const seenItineraryRefs: string[] = [];
            let outboundDurationMin = 0;
            let outboundSegCount = 0;

            for (const odo of (itin.OriginDestinations ?? [])) {
                const seg = data.FlightSegmentList?.find((s: any) => s.SegmentRef === odo.SegmentRef);
                if (!seg) continue;

                const itinRef = odo.ItineraryRef ?? '';
                if (!seenItineraryRefs.includes(itinRef)) seenItineraryRefs.push(itinRef);
                const itineraryIndex = seenItineraryRefs.indexOf(itinRef);
                const isOutbound = itineraryIndex === 0;

                const airlineCode = seg.OperatingCarrierCode ?? seg.MarketingCarriercode ?? '';
                const flightNum = seg.OperatingFlightNumber ?? seg.MarketingFlightNumber ?? '';
                const depTime = seg.DepartureDateTime ?? '';
                const arrTime = seg.ArrivalDateTime ?? '';
                const duration = Number(seg.JourneyDuration) || calculateDuration(depTime, arrTime);
                totalDurationMin += duration;

                if (isOutbound) { outboundDurationMin += duration; outboundSegCount++; }

                const iref = data.ItineraryReferenceList?.find((i: any) => i.ItineraryRef === odo.ItineraryRef);
                if (iref?.FareFamily && !brandName) brandName = iref.FareFamily;
                const chkBags = iref?.CheckinBaggage?.find((b: any) => b.Type === 'ADT')?.Value || '';
                if (chkBags) {
                    const m = chkBags.match(/(\d+)/);
                    if (m) checkedBags = Math.max(checkedBags, parseInt(m[1], 10));
                }

                segments.push({
                    airline: airlineCode,
                    airlineName: getMystiflyAirlineName(airlineCode),
                    flightNumber: `${airlineCode}${flightNum}`,
                    origin: seg.DepartureAirportLocationCode ?? '',
                    destination: seg.ArrivalAirportLocationCode ?? '',
                    departureTime: depTime,
                    arrivalTime: arrTime,
                    duration,
                    cabinClass: mapCabinClass(iref?.CabinClassCode ?? seg.CabinClassCode ?? 'Y'),
                    terminal: seg.DepartureTerminal,
                    arrivalTerminal: seg.ArrivalTerminal,
                    aircraft: seg.Equipment,
                    itineraryIndex,
                });
            }

            if (!segments.length) continue;

            const displayStops = outboundSegCount > 0 ? outboundSegCount - 1 : 0;
            const displayDuration = outboundDurationMin || totalDurationMin;
            const outboundSegs = segments.filter(s => (s.itineraryIndex ?? 0) === 0);
            const firstSeg = segments[0];
            const lastSeg = outboundSegs[outboundSegs.length - 1] ?? segments[segments.length - 1];
            const isRefundable = fare?.IsRefundable === true || fare?.FareType?.toLowerCase().includes('refund');

            results.push({
                provider: 'mystifly_v2',
                offer_id: fareSourceCode,
                price: totalPrice,
                currency,
                baseFare: totalBase,
                taxes,
                pricePerAdult,
                airline: firstSeg.airline,
                airlineName: firstSeg.airlineName,
                departure_time: firstSeg.departureTime,
                arrival_time: lastSeg.arrivalTime,
                duration: displayDuration,
                durationMinutes: displayDuration,
                stops: displayStops,
                remaining_seats: null,
                checkedBags: checkedBags || undefined,
                refundable: isRefundable,
                brandName,
                traceId: fareSourceCode,
                segments,
                raw: itin,
            });
        } catch (err: any) {
            console.error('[Mystifly] V2 normalization error:', err.message);
        }
    }

    return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AIRLINE_NAMES: Record<string, string> = {
    KE: 'Korean Air', OZ: 'Asiana Airlines', '7C': 'Jeju Air', TW: "T'way Air",
    LJ: 'Jin Air', ZE: 'Eastar Jet', BX: 'Air Busan', RS: 'Air Seoul',
    PR: 'Philippine Airlines', '5J': 'Cebu Pacific', Z2: 'AirAsia Philippines',
    JL: 'Japan Airlines', NH: 'ANA', MM: 'Peach Aviation',
    SQ: 'Singapore Airlines', TR: 'Scoot', MH: 'Malaysia Airlines', AK: 'AirAsia',
    TG: 'Thai Airways', FD: 'Thai AirAsia', VN: 'Vietnam Airlines', VJ: 'VietJet Air',
    GA: 'Garuda Indonesia', QZ: 'Indonesia AirAsia', SL: 'Thai Lion Air',
    D7: 'AirAsia X', XJ: 'Thai AirAsia X', CX: 'Cathay Pacific', HX: 'Hong Kong Airlines',
    CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern',
    CI: 'China Airlines', BR: 'EVA Air', MI: 'SilkAir', JQ: 'Jetstar', GK: 'Jetstar Japan',
    YP: 'Air Premia', EK: 'Emirates', EY: 'Etihad Airways', QR: 'Qatar Airways',
    SV: 'Saudia', GF: 'Gulf Air', WY: 'Oman Air',
    AA: 'American Airlines', DL: 'Delta Air Lines', UA: 'United Airlines',
    WN: 'Southwest Airlines', B6: 'JetBlue', AS: 'Alaska Airlines',
    AC: 'Air Canada', WS: 'WestJet', LA: 'LATAM Airlines',
    AV: 'Avianca', CM: 'Copa Airlines', AM: 'Aeromexico',
    BA: 'British Airways', LH: 'Lufthansa', AF: 'Air France', KL: 'KLM',
    IB: 'Iberia', LX: 'SWISS', OS: 'Austrian Airlines',
    SK: 'SAS', AY: 'Finnair', TP: 'TAP Portugal', TK: 'Turkish Airlines',
    FR: 'Ryanair', U2: 'easyJet', W6: 'Wizz Air',
    ET: 'Ethiopian Airlines', SA: 'South African Airways', KQ: 'Kenya Airways',
    AI: 'Air India', '6E': 'IndiGo',
};

function getMystiflyAirlineName(code: string): string {
    return AIRLINE_NAMES[code] || code;
}

function mapCabinClass(code: string): string {
    const map: Record<string, string> = {
        Y: 'economy', W: 'premium_economy', C: 'business', F: 'first',
        S: 'premium_economy', J: 'business', P: 'first',
    };
    return map[code?.toUpperCase()] || 'economy';
}

function calculateDuration(dep: string, arr: string): number {
    try {
        const d = new Date(dep).getTime();
        const a = new Date(arr).getTime();
        if (isNaN(d) || isNaN(a)) return 0;
        return Math.round((a - d) / 60000);
    } catch { return 0; }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(id);
    }
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetchWithTimeout(url, init);
            if (res.status >= 500 && attempt < MAX_RETRIES) {
                await sleep(attempt * 500);
                continue;
            }
            return res;
        } catch (err: any) {
            lastErr = err;
            if (attempt < MAX_RETRIES) await sleep(attempt * 500);
        }
    }
    throw lastErr ?? new Error('Mystifly request failed after retries');
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
