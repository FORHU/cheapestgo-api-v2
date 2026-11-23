/**
 * Flight offers into `NormalizedFlight` — one mapper per supplier (#53).
 *
 * Both read the supplier's own response rather than the older `FlightResult`/`FlightOffer`
 * shapes, which carry `raw`, `_rawOffer`, `traceId` and a mix of both suppliers' segment fields.
 * Reading the source directly is also what lets these say "unknown" where the older shapes said
 * "no": a Duffel fare with no published refund condition was reported as non-refundable.
 *
 * See `src/types/normalized.ts` for which supplier fills which field.
 */

import { getAirlineName } from '@/types/flights';
import type {
    BagAllowance,
    Cabin,
    Money,
    NormalizedAirportStop,
    NormalizedFlight,
    NormalizedFlightSegment,
} from '@/types/normalized';

// ─── Duffel ───────────────────────────────────────────────────────────────────

/** One Duffel offer, as `/air/offer_requests` or `/air/offers/:id` returns it. */
export function duffelFlight(offer: any): NormalizedFlight {
    const slices: any[] = offer?.slices ?? [];

    const segments: NormalizedFlightSegment[] = slices.flatMap((slice, leg) =>
        (slice?.segments ?? []).map((seg: any): NormalizedFlightSegment => {
            const marketing = seg?.marketing_carrier ?? {};
            const operating = seg?.operating_carrier ?? marketing;
            return {
                leg,
                airline:         { code: operating.iata_code ?? '', name: operating.name || getAirlineName(operating.iata_code) },
                flightNumber:    `${marketing.iata_code ?? ''}${seg?.marketing_carrier_flight_number ?? ''}`,
                from:            duffelStop(seg?.origin, seg?.origin_terminal, seg?.departing_at),
                to:              duffelStop(seg?.destination, seg?.destination_terminal, seg?.arriving_at),
                durationMinutes: isoMinutes(seg?.duration),
                cabin:           cabin(seg?.passengers?.[0]?.cabin_class),
                aircraft:        text(seg?.aircraft?.name),
            };
        }),
    );

    const travellers = Math.max(1, (offer?.passengers ?? []).length);
    const total: Money = { amount: num(offer?.total_amount) ?? 0, currency: offer?.total_currency ?? '' };

    // Offer-level conditions are the fare's; a slice can carry its own change condition when the
    // two directions are priced differently, which the offer-level one then summarises.
    const refund = offer?.conditions?.refund_before_departure;
    const change = offer?.conditions?.change_before_departure;

    return {
        id:                offer?.id ?? '',
        supplier:          'duffel',
        tripType:          tripType(segments),
        segments,
        totalPrice:        total,
        pricePerTraveller: { amount: round2(total.amount / travellers), currency: total.currency },
        travellers,
        seatsRemaining:    num(offer?.available_seats),
        baggage: {
            cabin:   leastAcross(slices, 'carry_on'),
            checked: leastAcross(slices, 'checked'),
        },
        fareRules: {
            changeable:    condition(change),
            changePenalty: penaltyOf(change),
            brand:         text(slices[0]?.fare_brand_name),
        },
        cancellation: {
            refundable:    condition(refund),
            refundPenalty: penaltyOf(refund),
        },
    };
}

function duffelStop(place: any, terminal: unknown, at: unknown): NormalizedAirportStop {
    return {
        airport:  place?.iata_code ?? '',
        name:     text(place?.name),
        city:     text(place?.city_name ?? place?.city?.name),
        terminal: text(terminal),
        at:       String(at ?? ''),
    };
}

/** Allowed, not allowed, or — when Duffel publishes no condition — not known. */
function condition(c: any): boolean | null {
    return typeof c?.allowed === 'boolean' ? c.allowed : null;
}

function penaltyOf(c: any): Money | null {
    const amount = num(c?.penalty_amount);
    return c?.allowed === true && amount !== null && c?.penalty_currency
        ? { amount, currency: c.penalty_currency }
        : null;
}

/**
 * The bags the first traveller has on every segment — the least generous segment wins, since a
 * checked bag allowed out but not back is not one the traveller has. Null when no segment says.
 */
function leastAcross(slices: any[], type: 'carry_on' | 'checked'): BagAllowance | null {
    const counts: number[] = [];
    for (const slice of slices) {
        for (const seg of slice?.segments ?? []) {
            const bags = seg?.passengers?.[0]?.baggages;
            if (!Array.isArray(bags)) continue;
            counts.push(bags.filter((b: any) => b?.type === type)
                .reduce((n: number, b: any) => n + (Number(b?.quantity) || 0), 0));
        }
    }
    return counts.length ? { pieces: Math.min(...counts), weightKg: null } : null;
}

// ─── Mystifly ─────────────────────────────────────────────────────────────────

/**
 * Every fare in one Mystifly v2 `Search/Flight` response.
 *
 * Mystifly answers by reference: an itinerary names its segments, fare, penalties and fare details
 * (`ItineraryRef`, which is *not* the direction — every segment of a fare can share ref 0) by
 * index into lists beside it. The direction is `LegIndicator`.
 */
export function mystiflyFlights(response: any): NormalizedFlight[] {
    const data = response?.Data ?? response ?? {};
    const byRef = <T>(list: T[] | undefined, key: string) =>
        new Map((list ?? []).map((item: any) => [item?.[key], item as T]));

    const segmentsByRef  = byRef<any>(data.FlightSegmentList, 'SegmentRef');
    const faresByRef     = byRef<any>(data.FlightFaresList, 'FareRef');
    const penaltiesByRef = byRef<any>(data.PenaltiesInfoList, 'PenaltiesInfoRef');
    const detailsByRef   = byRef<any>(data.ItineraryReferenceList, 'ItineraryRef');

    const out: NormalizedFlight[] = [];
    for (const itin of data.PricedItineraries ?? []) {
        const flight = mystiflyFlight(itin, segmentsByRef, faresByRef, penaltiesByRef, detailsByRef);
        if (flight) out.push(flight);
    }
    return out;
}

function mystiflyFlight(
    itin: any,
    segmentsByRef: Map<unknown, any>,
    faresByRef: Map<unknown, any>,
    penaltiesByRef: Map<unknown, any>,
    detailsByRef: Map<unknown, any>,
): NormalizedFlight | null {
    const fare = faresByRef.get(itin?.FareRef);
    if (!fare || !itin?.FareSourceCode) return null;

    const segments: NormalizedFlightSegment[] = [];
    const details: any[] = [];
    for (const odo of itin.OriginDestinations ?? []) {
        const seg = segmentsByRef.get(odo?.SegmentRef);
        if (!seg) continue;
        const detail = detailsByRef.get(odo?.ItineraryRef);
        if (detail) details.push(detail);

        const code = seg.MarketingCarriercode ?? seg.OperatingCarrierCode ?? '';
        const operating = seg.OperatingCarrierCode ?? code;
        segments.push({
            leg:             Number(odo?.LegIndicator ?? 0) || 0,
            airline:         { code: operating, name: getAirlineName(operating) },
            flightNumber:    `${code}${seg.MarketingFlightNumber ?? seg.OperatingFlightNumber ?? ''}`,
            from:            mystiflyStop(seg.DepartureAirportLocationCode, seg.DepartureTerminal, seg.DepartureDateTime),
            to:              mystiflyStop(seg.ArrivalAirportLocationCode, seg.ArrivalTerminal, seg.ArrivalDateTime),
            durationMinutes: num(seg.JourneyDuration),
            cabin:           cabin(detail?.CabinClassCode ?? seg.CabinClassCode),
            aircraft:        text(seg.Equipment),
        });
    }
    if (!segments.length) return null;

    // The fare is per passenger type, times how many of each.
    let total = 0;
    let travellers = 0;
    for (const pf of fare.PassengerFare ?? []) {
        const qty = Number(pf?.Quantity) || 1;
        total += (num(pf?.TotalFare) ?? 0) * qty;
        travellers += qty;
    }
    travellers = Math.max(1, travellers);
    const currency = fare.Currency ?? '';

    // The adult's terms stand for the party, as the fare is sold.
    const penalties = (penaltiesByRef.get(itin.PenaltiesInfoRef)?.Penaltydetails ?? []) as any[];
    const adult = penalties.find((p) => p?.PaxType === 'ADT') ?? penalties[0];

    const seats = details.map((d) => num(d?.SeatsRemaining)).filter((n): n is number => n !== null);

    return {
        id:                itin.FareSourceCode,
        supplier:          'mystifly',
        tripType:          tripType(segments),
        segments,
        totalPrice:        { amount: round2(total), currency },
        pricePerTraveller: { amount: round2(total / travellers), currency },
        travellers,
        seatsRemaining:    seats.length ? Math.min(...seats) : null,
        baggage: {
            cabin:   leastAllowance(details.map((d) => adultBag(d?.CabinBaggage))),
            checked: leastAllowance(details.map((d) => adultBag(d?.CheckinBaggage))),
        },
        fareRules: {
            changeable:    typeof adult?.ChangeAllowed === 'boolean' ? adult.ChangeAllowed : null,
            changePenalty: adult?.ChangeAllowed === true ? money(adult.ChangePenaltyAmount, adult.Currency) : null,
            brand:         text(details.find((d) => text(d?.FareFamily))?.FareFamily),
        },
        cancellation: {
            refundable:    typeof adult?.RefundAllowed === 'boolean' ? adult.RefundAllowed : null,
            refundPenalty: adult?.RefundAllowed === true ? money(adult.RefundPenaltyAmount, adult.Currency) : null,
        },
    };
}

function mystiflyStop(airport: unknown, terminal: unknown, at: unknown): NormalizedAirportStop {
    return { airport: String(airport ?? ''), name: null, city: null, terminal: text(terminal), at: String(at ?? '') };
}

function adultBag(list: any): string | null {
    if (!Array.isArray(list)) return null;
    return text((list.find((b) => b?.Type === 'ADT') ?? list[0])?.Value);
}

/**
 * Mystifly's allowance strings: `1PC`, `2 PCS`, `15KG`, `20K`, `0PC`. A weight is a weight —
 * reading `15KG` as fifteen bags is what the older normaliser did.
 */
export function bagAllowance(value: string | null | undefined): BagAllowance | null {
    const v = String(value ?? '').trim().toUpperCase();
    if (!v) return null;
    const pieces = v.match(/(\d+)\s*(?:PC|PCS|P|PIECE|PIECES)\b/);
    if (pieces) return { pieces: Number(pieces[1]), weightKg: null };
    const kg = v.match(/(\d+(?:\.\d+)?)\s*(?:KG|KGS|K)\b/);
    if (kg) return { pieces: null, weightKg: Number(kg[1]) };
    return null;
}

/** The least generous allowance across segments; null when any segment says nothing. */
function leastAllowance(values: Array<string | null>): BagAllowance | null {
    if (!values.length) return null;
    const parsed = values.map(bagAllowance);
    if (parsed.some((p) => p === null)) return null;
    const all = parsed as BagAllowance[];
    const least = (key: keyof BagAllowance) => {
        const ns = all.map((a) => a[key]);
        return ns.every((n) => n !== null) ? Math.min(...(ns as number[])) : null;
    };
    return { pieces: least('pieces'), weightKg: least('weightKg') };
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function tripType(segments: NormalizedFlightSegment[]): NormalizedFlight['tripType'] {
    const legs = [...new Set(segments.map((s) => s.leg))].sort((a, b) => a - b);
    if (legs.length <= 1) return 'one-way';
    if (legs.length === 2) {
        const out = segments.filter((s) => s.leg === legs[0]);
        const back = segments.filter((s) => s.leg === legs[1]);
        if (out[0]?.from.airport === back[back.length - 1]?.to.airport
            && out[out.length - 1]?.to.airport === back[0]?.from.airport) {
            return 'round-trip';
        }
    }
    return 'multi-city';
}

/** Duffel's and Mystifly's cabin words and codes, into ours. */
function cabin(value: unknown): Cabin | null {
    const v = String(value ?? '').trim().toLowerCase();
    if (!v) return null;
    if (['economy', 'y', 'm'].includes(v)) return 'economy';
    if (['premium_economy', 'premium economy', 'w', 's'].includes(v)) return 'premium_economy';
    if (['business', 'c', 'j'].includes(v)) return 'business';
    if (['first', 'f', 'p'].includes(v)) return 'first';
    return null;
}

/** ISO-8601 durations as Duffel sends them: `PT3H50M`, `P1DT2H`. */
export function isoMinutes(value: unknown): number | null {
    const m = String(value ?? '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
    if (!m || (!m[1] && !m[2] && !m[3])) return null;
    return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function money(amount: unknown, currency: unknown): Money | null {
    const n = num(amount);
    return n === null || !currency ? null : { amount: n, currency: String(currency) };
}

function num(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function text(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t ? t : null;
}
