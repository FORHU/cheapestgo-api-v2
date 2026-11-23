/**
 * The shapes the travel assistant sees hotels and flights in (#53).
 *
 * One shape per thing, whatever supplier it came from. Nothing here is named for a supplier, and
 * no field carries a supplier's own vocabulary: TravelgateX's `IMPORT` penalty, ETG's `nomeal`,
 * Mystifly's `15KG`, Duffel's `PT3H50M` all stop at the mappers in `src/lib/normalized/`. The AI
 * tools (#57, #58) are given these and nothing else.
 *
 * Two rules every mapper keeps:
 *
 *   - **Unknown is null, never a guess.** A hotel with no reviews has `guestRating: null`, not 0,
 *     and a fare whose supplier said nothing about refunds has `refundable: null`, not false. The
 *     assistant tells a traveller what is true; it cannot do that if "we don't know" and "no" are
 *     the same value.
 *   - **Ids are opaque.** `id` on a hotel, room or flight is passed back unchanged to book or to
 *     look something up. Its contents are the supplier's business and are never read.
 *
 * ## What each supplier can and cannot fill
 *
 * Hotels — `travelgatex` is TravelgateX (OTV, i.e. RateHawk inventory) priced live with content
 * from our catalog; `etg` is ETG region search, used for province and country searches; `mock`
 * is the development supplier. ONDA has a catalog table (`onda_properties`) but no client yet, so
 * there is nothing to map from; it gets a mapper when it gets a client.
 *
 * | Field                         | travelgatex          | etg                  | mock      | Fallback |
 * |-------------------------------|----------------------|----------------------|-----------|----------|
 * | starRating                    | catalog              | catalog / ETG        | yes       | null when 0 or absent |
 * | guestRating, reviewCount      | catalog reviews      | catalog              | yes       | null when 0 (no reviews known) |
 * | amenities                     | catalog              | catalog / ETG groups | yes       | [] |
 * | location.neighborhood         | —                    | —                    | —         | null; no supplier sends one |
 * | location.distanceToCenterKm   | —                    | —                    | —         | null; ranking (#59) computes it |
 * | location.distanceToMetroKm    | —                    | —                    | —         | null; no supplier sends one |
 * | checkInTime, checkOutTime     | catalog              | —                    | yes       | null |
 * | rooms                         | yes                  | — (priced per hotel) | yes       | [] |
 * | room cancellation penalties   | rates call only      | —                    | yes       | `refundable` alone; penalties [] |
 * | refundable                    | yes                  | —                    | yes       | null |
 *
 * Flights — `duffel` is live; `mystifly` is wired but switched off in search.
 *
 * | Field                         | duffel               | mystifly             | Fallback |
 * |-------------------------------|----------------------|----------------------|----------|
 * | airport / city names          | yes                  | —                    | null |
 * | terminals                     | yes                  | yes                  | null |
 * | baggage pieces                | yes                  | when given as "1PC"  | null |
 * | baggage weight                | —                    | when given as "15KG" | null |
 * | refundable, refund penalty    | when Duffel says     | yes                  | null |
 * | changeable, change penalty    | when Duffel says     | yes                  | null |
 * | fare brand                    | yes                  | when not blank       | null |
 * | seats remaining               | yes                  | yes                  | null |
 */

// ─── Shared ───────────────────────────────────────────────────────────────────

export interface Money {
    amount:   number;
    currency: string;
}

// ─── Hotels ───────────────────────────────────────────────────────────────────

export type HotelSupplier = 'travelgatex' | 'etg' | 'mock';

/** What is included with the room. Null when the supplier's word for it is not one we know. */
export type BoardBasis = 'room_only' | 'breakfast' | 'half_board' | 'full_board' | 'all_inclusive';

export interface NormalizedHotelLocation {
    address:            string | null;
    city:               string | null;
    /** ISO 3166 alpha-2. */
    country:            string | null;
    lat:                number | null;
    lng:                number | null;
    neighborhood:       string | null;
    distanceToCenterKm: number | null;
    distanceToMetroKm:  number | null;
}

/** One step of a cancellation charge: from `from`, cancelling costs this much. */
export interface CancellationPenalty {
    /** ISO-8601 instant the charge starts. */
    from:     string;
    /** Exactly one of these three is set. */
    amount:   Money | null;
    percent:  number | null;
    nights:   number | null;
}

export interface NormalizedCancellation {
    /** Null when the supplier did not say. */
    refundable: boolean | null;
    /** Cancelling costs nothing until this instant. Null when there is no free window, or none is known. */
    freeUntil:  string | null;
    penalties:  CancellationPenalty[];
}

export interface NormalizedRoom {
    /** Opaque. What a booking is started with. */
    id:           string;
    name:         string;
    board:        BoardBasis | null;
    /** The whole stay, for the party searched. */
    total:        Money;
    cancellation: NormalizedCancellation;
}

export interface NormalizedHotel {
    /** Opaque. What hotel details and rates are asked for by. */
    id:           string;
    supplier:     HotelSupplier;
    name:         string;
    /** 1–5. */
    starRating:   number | null;
    /** Out of 10. */
    guestRating:  number | null;
    reviewCount:  number | null;
    amenities:    string[];
    location:     NormalizedHotelLocation;
    checkInTime:  string | null;
    checkOutTime: string | null;
    image:        string | null;
    /** The cheapest night, as a search card advertises it. Null when the hotel was not priced. */
    nightlyFrom:  Money | null;
    rooms:        NormalizedRoom[];
}

// ─── Flights ──────────────────────────────────────────────────────────────────

export type FlightSupplier = 'duffel' | 'mystifly';

export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first';

export interface NormalizedAirportStop {
    /** IATA code. */
    airport:  string;
    name:     string | null;
    city:     string | null;
    terminal: string | null;
    /** Local time at the airport, no offset: `2026-12-15T23:20:00`. */
    at:       string;
}

export interface NormalizedFlightSegment {
    /** Which direction this flies: 0 outbound, 1 return, and so on for multi-city. */
    leg:             number;
    airline:         { code: string; name: string };
    /** Marketing carrier and number, e.g. `7C2104`. */
    flightNumber:    string;
    from:            NormalizedAirportStop;
    to:              NormalizedAirportStop;
    durationMinutes: number | null;
    cabin:           Cabin | null;
    aircraft:        string | null;
}

/** An allowance per traveller. Either figure may be the only one the airline publishes. */
export interface BagAllowance {
    pieces:   number | null;
    weightKg: number | null;
}

export interface NormalizedBaggage {
    /** Null when the supplier said nothing — which is not the same as no bag. */
    cabin:   BagAllowance | null;
    checked: BagAllowance | null;
}

export interface NormalizedFareRules {
    changeable:    boolean | null;
    changePenalty: Money | null;
    /** The airline's name for the fare, e.g. "Economy Light". */
    brand:         string | null;
}

export interface NormalizedFlightCancellation {
    /** Refundable before departure. Null when the supplier did not say. */
    refundable:    boolean | null;
    refundPenalty: Money | null;
}

export interface NormalizedFlight {
    /** Opaque. What a fare is priced and booked by. */
    id:                string;
    supplier:          FlightSupplier;
    tripType:          'one-way' | 'round-trip' | 'multi-city';
    segments:          NormalizedFlightSegment[];
    /** For everyone travelling. */
    totalPrice:        Money;
    /** `totalPrice` shared evenly; the airline's own per-person split is not always published. */
    pricePerTraveller: Money;
    travellers:        number;
    seatsRemaining:    number | null;
    baggage:           NormalizedBaggage;
    fareRules:         NormalizedFareRules;
    cancellation:      NormalizedFlightCancellation;
}
