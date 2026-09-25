// ─── Hotel search types ───────────────────────────────────────────────────────

export type DestinationRung = 'city' | 'district' | 'poi' | 'province' | 'country';

export interface HotelSearchParams {
    checkin: string;
    checkout: string;
    adults?: number;
    children?: number;
    childrenAges?: number[];
    currency?: string;
    guest_nationality?: string;
    destinationCode?: string;
    cityName?: string;
    countryCode?: string;
    hotelCode?: string;
    rooms?: number;
    rung?: DestinationRung;
    lat?: number;
    lng?: number;
    bbox?: [number, number, number, number];
    /**
     * The rung the traveller actually picked, kept after `rung` is downgraded to 'city'.
     *
     * A sub-area — a London borough, a Paris arrondissement, a Tokyo ku — has to be *searched*
     * as its parent city, because OTV serves only the City rung (ADR-0006). Without a second
     * field the downgrade erases the fact that the traveller asked for somewhere smaller, and
     * the answer comes back as the whole city. 'city' is never a sub-area: a city's own box is
     * tighter than its real hotel spread (Jeju's excludes Seogwipo, 27km out), which is what
     * the radius is for.
     */
    areaRung?: DestinationRung;
}

export interface HotelSearchResult {
    data: any[];
    allMappable: any[];
    totalCount: number;
    /**
     * The supplier did not finish: it timed out mid-answer, or some of the hotel-code
     * batches never came back. The results are real but incomplete, and asking again may
     * collect the rest.
     *
     * Absent or false means the answer is whole. A slow answer is not a truncated one —
     * a destination search that takes 17s and returns 264 hotels finished, and re-asking it
     * returns the same 264 for a second round of supplier requests.
     */
    truncated?: boolean;
}

export interface HotelListing {
    hotelId: string;
    id: string;
    name: string;
    price: number;
    currency: string;
    offerId?: string;
    refundableTag?: string;
    starRating: number;
    images: string[];
    image: string;
    lat: number;
    lng: number;
    coordinates: { lat: number; lng: number };
    address: string;
    location?: string;
    city: string;
    country: string;
    description: string;
    amenities: string[];
    reviewRating: number;
    rating: number;
    reviews: number;
    reviewCount: number;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    boardCode?: string;
    roomTypes?: RoomType[];
    priceLoading?: boolean;
    provider?: string;
    _tgxToken?: string;
}

export interface RoomType {
    offerId: string;
    roomName: string;
    roomCode?: string;
    boardCode: string;
    price: number;
    net: number;
    gross: number;
    currency: string;
    refundable: boolean;
    refundableTag: string;
    cancelPolicy?: TgxCancelPolicy;
    rates?: RoomRate[];
}

export interface RoomRate {
    retailRate: {
        total: Array<{ amount: number; currency: string }>;
        currency: string;
    };
    refundableTag: string;
    cancellationPolicies: TgxCancelPenalty[];
    _tgx?: {
        token: string;
        id: string;
        boardCode: string;
        paymentType: string;
        cancelPolicy?: TgxCancelPolicy;
    };
}

export interface TgxCancelPolicy {
    refundable: boolean;
    cancelPenalties?: TgxCancelPenalty[];
}

export interface TgxCancelPenalty {
    deadline: string;
    hoursBefore: number;
    penaltyType: string;
    currency: string;
    value?: number;
}

// ─── Booking types ────────────────────────────────────────────────────────────

export type BookingPolicyType = 'free_cancellation' | 'non_refundable' | 'partial_refund' | 'tiered';

export interface PolicyTier {
    id: string;
    cancelDeadline: string;
    penaltyAmount: number;
    penaltyType: 'fixed' | 'percent' | 'nights';
    currency: string;
    tierOrder: number;
}

export interface BookingPolicySnapshot {
    id: string;
    bookingId: string;
    policyType: BookingPolicyType;
    summary: string | null;
    refundableTag: string | null;
    hotelRemarks: string[];
    noShowPenalty: number;
    earlyDepartureFee: number;
    freeCancelDeadline: string | null;
    tiers: PolicyTier[];
    // The row also has `raw_liteapi_response`, a second audit blob left behind by the
    // retired LiteAPI supplier. We write `raw_provider_response` and read neither — a
    // cancellation is computed from the tiers, never from the blob. See CONTEXT.md.
    capturedAt: string;
}

export interface CancellationPolicy {
    refundableTag?: 'RFN' | 'NRFN' | string;
    cancelPolicyInfos?: CancelPolicyInfo[];
}

export interface CancelPolicyInfo {
    cancelTime: string;
    amount: number;
    currency: string;
    type: string;
}

export interface HolderInput {
    firstName: string;
    lastName: string;
    email: string;
}

export interface GuestInput {
    firstName: string;
    lastName: string;
    age?: number;
}

export interface TgxConfirmInput {
    quoteToken: string;
    holder: HolderInput;
    guests: GuestInput[];
    propertyName: string;
    propertyImage?: string;
    roomName: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
    currency: string;
    specialRequests?: string;
    paymentIntentId?: string;
    voucherCode?: string;
    discountAmount?: number;
    cancellationPolicies?: any;
}

export interface ConfirmAndSaveResult {
    success: boolean;
    providerConfirmed?: boolean;
    data?: {
        bookingId: string;
        status: string;
        policyType: string;
        policySummary: string;
        totalPrice?: number;
        currency?: string;
    };
    error?: string;
}

export interface CancellationResult {
    isCancellable: boolean;
    refundable: boolean;
    refundAmount: number;
    penaltyAmount: number;
    currency: string;
    refundType: 'full_refund' | 'partial_refund' | 'no_refund';
    message: string;
    appliedTier: PolicyTier | null;
    policyUsed: 'standard' | 'non_refundable' | 'free_cancellation';
    debug?: {
        now: string;
        checkIn: string;
        tiersChecked: number;
    };
}

// ─── Autocomplete types ───────────────────────────────────────────────────────

export interface AutocompleteResult {
    type: 'city' | 'country';
    title: string;
    subtitle: string;
    countryCode: string;
    id?: string;
    code?: string;
}

// Pricing lives in @/lib/pricing, not here.
//
// This file used to carry a second HOTEL_MARKUP, BUNDLE_MARKUP, applyMarkup and
// toStripeAmount — all unimported, both rates hardcoded to 0 as "disabled", and a
// zero-decimal currency list that disagreed with the real one. Nothing read them, so
// nothing was broken; what they were was a trap for whoever reached for a markup helper
// and found this one first.
