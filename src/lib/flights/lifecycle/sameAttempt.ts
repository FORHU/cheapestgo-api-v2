/**
 * Whether a new `book` asks for exactly what an attempt the traveller already has open asks for —
 * the case in which `book` hands back that attempt instead of opening a second one.
 *
 * Everything the order and the hold depend on: who flies, the contact the airline is given, the
 * seats and bags, and what the card is held for. The earlier side is read back from the session
 * and its PaymentIntent, so objects are compared by their content, not by the order of their keys
 * (jsonb keeps an order of its own).
 *
 * No I/O in this file.
 */

export interface AttemptTerms {
    passengers:     unknown;
    contact:        unknown;
    seatServiceIds: string[];
    bagServiceIds:  string[];
    /** Stripe metadata has no null: an unbundled payment carries no key, or an empty one. */
    bundleHotelId?: string | null;
    /** What the card is held for, in Stripe's minor units, and the currency it is held in. */
    amountMinor:    number;
    currency:       string;
}

/** JSON with every object's keys in one order, so equal content gives equal text. */
function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, v) =>
        v && typeof v === 'object' && !Array.isArray(v)
            ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
            : v);
}

export function isSameAttempt(a: AttemptTerms, b: AttemptTerms): boolean {
    return a.amountMinor === b.amountMinor
        && a.currency.toLowerCase() === b.currency.toLowerCase()
        && (a.bundleHotelId || null) === (b.bundleHotelId || null)
        && canonical(a.seatServiceIds) === canonical(b.seatServiceIds)
        && canonical(a.bagServiceIds) === canonical(b.bagServiceIds)
        && canonical(a.contact) === canonical(b.contact)
        && canonical(a.passengers) === canonical(b.passengers);
}
