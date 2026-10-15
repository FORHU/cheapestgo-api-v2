// src/lib/hotels/providers/types.ts
/**
 * The contract between the booking flow and a hotel supplier.
 *
 * Everything above `src/lib/hotels/providers/` speaks these types and nothing else. A supplier's
 * vocabulary — TravelgateX option tokens, ETG hashes, whatever the next one calls a rate — stops
 * at its adapter, which is what makes "add a provider" one class and one line in the factory
 * rather than an edit to the booking flow (ADR-0025).
 *
 * Search and rate results deliberately keep the existing listing shapes from `@/types/hotels`:
 * they were already supplier-neutral, they are the wire format the web and mobile clients read,
 * and changing them is a contract decision, not a refactor.
 */

import type { HotelSearchParams, HotelSearchResult, RoomType } from '@/types/hotels';

export type { HotelSearchParams, HotelSearchResult, RoomType };

export type ProviderId = 'travelgatex' | 'mock';

/** What a supplier can do beyond the core flow. Callers branch on these, never on the id. */
export interface ProviderCapabilities {
    /** Can read a reservation back from the supplier. TravelgateX cannot (ADR-0026). */
    bookingRead: boolean;
    /**
     * The provider is the authority on hotel content and on which hotels exist. When true the
     * database catalog and ETG enrichment are skipped: mixing a mock's hotels with real catalog
     * rows would show properties it can never price.
     */
    providesContent: boolean;
}

/** The price of the whole stay, as a supplier quotes it. */
export type StayTotal = number;
/** A stay total divided by its nights — what a search card advertises (ADR-0020). */
export type NightlyRate = number;

export interface StayQuery {
    /** YYYY-MM-DD */
    checkIn:      string;
    /** YYYY-MM-DD */
    checkOut:     string;
    adults:       number;
    children:     number;
    /** The currency to quote in, where the supplier can convert. */
    currency?:    string;
    /** ISO 3166 alpha-2 of the guest; suppliers use it to choose rates. */
    nationality?: string;
}

export interface SupplierPrice {
    net:      StayTotal;
    gross:    StayTotal;
    currency: string;
}

export interface Surcharge {
    chargeType: string;
    mandatory:  boolean;
    price:      SupplierPrice;
}

export interface QuotedRoom {
    code:           string;
    description:    string;
    occupancyRefId: number;
}

export interface CancellationPenalty {
    /** The penalty applies from this instant (ISO-8601). */
    deadline:     string;
    /** The supplier's own penalty kind, passed through ('AMOUNT', 'PERCENT', 'Importe', …). */
    type:         string;
    value:        number;
    currency:     string;
    hoursBefore?: number;
}

export interface CancellationTerms {
    refundable: boolean;
    penalties:  CancellationPenalty[];
}

export interface HotelContent {
    hotelId:      string;
    name:         string;
    address:      string;
    city:         string;
    country:      string;
    lat:          number;
    lng:          number;
    starRating:   number;
    description:  string;
    images:       string[];
    amenities:    string[];
    checkInTime:  string | null;
    checkOutTime: string | null;
}

export interface PrebookInput {
    /** An offer id taken from a listing or a rate. Opaque. */
    offerId:   string;
    /** The room the traveller picked, so the same one is preferred when rates are re-read. */
    roomName?: string;
    adults:    number;
    children:  number;
    currency:  string;
}

export interface PrebookResult {
    /** What `book` takes. Opaque, and only valid for this provider. */
    prebookRef:      string;
    checkIn:         string;
    checkOut:        string;
    /** The room actually quoted, which may not be the one asked for. */
    roomName:        string;
    roomSubstituted: boolean;
    price:           SupplierPrice;
    surcharges:      Surcharge[];
    cancellation:    CancellationTerms | null;
    boardCode:       string;
    rooms:           QuotedRoom[];
}

export interface BookGuest {
    firstName: string;
    lastName:  string;
    age:       number;
    type:      'adult' | 'child';
}

export interface BookInput {
    prebookRef: string;
    /** Our reference. The supplier files the reservation under it, and a cancel quotes it. */
    clientRef:  string;
    holder:     { firstName: string; lastName: string; email: string };
    guests:     BookGuest[];
    /** Needed by a supplier that must re-quote when its option has expired. */
    stay:       { adults: number; children: number; currency: string };
}

export interface ProviderBooking {
    provider:      ProviderId;
    /** The supplier's own status word. */
    status:        string;
    clientRef?:    string;
    supplierRef?:  string;
    hotelRef?:     string;
    hotelCode?:    string;
    hotelName?:    string;
    price?:        { net?: number; gross?: number; currency?: string };
    cancellation?: CancellationTerms | null;
}

export interface ProviderBookingRef {
    clientRef?:   string;
    supplierRef?: string;
}

export interface CancelInput {
    clientRef?:   string;
    supplierRef?: string;
    hotelCode?:   string;
}

export interface ProviderCancellation {
    /** Always 'CANCELLED' on success; a failure is an error, not a status. */
    status:        'CANCELLED';
    supplierRef?:  string;
    clientRef?:    string;
    refundAmount?: number;
    currency?:     string;
}

export interface HotelProvider {
    readonly id:           ProviderId;
    /** For messages shown to people, e.g. "no reference returned from TravelgateX". */
    readonly displayName:  string;
    readonly capabilities: ProviderCapabilities;

    /** Is this offer or prebook reference one of this provider's? */
    ownsRef(ref: string): boolean;

    /** Listings priced per night (NightlyRate), one per hotel. */
    searchHotels(q: HotelSearchParams): Promise<HotelSearchResult>;
    /** Null when the provider holds no content of its own (the catalog tables do). */
    getHotelDetails(hotelId: string): Promise<HotelContent | null>;
    /** Flat rate options for one hotel, priced as a StayTotal. */
    getRates(hotelId: string, stay: StayQuery): Promise<RoomType[]>;
    /** Re-checks availability and price. Throws SOLD_OUT / PRICE_CHANGED / … */
    prebook(input: PrebookInput): Promise<PrebookResult>;
    /** Throws REJECTED / SOLD_OUT / UNKNOWN_OUTCOME / … — never returns a failed booking. */
    book(input: BookInput): Promise<ProviderBooking>;
    /** Present only when `capabilities.bookingRead`. */
    getBooking?(ref: ProviderBookingRef): Promise<ProviderBooking | null>;
    cancelBooking(input: CancelInput): Promise<ProviderCancellation>;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Why a supplier call failed, in the terms the booking flow decides on.
 *
 * The distinction that matters most is between a failure that is *definitive* — the supplier
 * said no, nothing was booked, release the money — and one that is *ambiguous* — the request may
 * have landed. Treating the second like the first is how a guest ends up holding a room we
 * refunded them for (ADR-0026, ADR-0013).
 */
export type HotelProviderErrorCode =
    /** The reference is not this provider's, or cannot be decoded. */
    | 'INVALID_RATE'
    /** The room or rate is gone. Definitive. */
    | 'SOLD_OUT'
    /** Re-priced beyond what was shown. Definitive; carries the new figure. */
    | 'PRICE_CHANGED'
    /** The supplier collects payment itself, so we cannot take it. Definitive. */
    | 'NOT_PAYABLE_ONLINE'
    /** The supplier refused. Definitive. */
    | 'REJECTED'
    /** A read or quote got no answer in time. Nothing changed; safe to retry. */
    | 'TIMEOUT'
    /** A booking or cancellation may have reached the supplier. Never void on this alone. */
    | 'UNKNOWN_OUTCOME'
    /** Transport or configuration failure before anything could have landed. */
    | 'UNAVAILABLE';

export interface HotelProviderErrorDetails {
    provider?:      ProviderId;
    previousTotal?: number;
    currentTotal?:  number;
    currency?:      string;
    cause?:         unknown;
}

export class HotelProviderError extends Error {
    constructor(
        public readonly code: HotelProviderErrorCode,
        message: string,
        public readonly details: HotelProviderErrorDetails = {},
    ) {
        super(message);
        this.name = 'HotelProviderError';
    }

    /** True when the supplier may have acted on the request. */
    get mutationMayHaveLanded(): boolean {
        return this.code === 'UNKNOWN_OUTCOME';
    }
}

export function isHotelProviderError(err: unknown): err is HotelProviderError {
    return err instanceof HotelProviderError;
}
