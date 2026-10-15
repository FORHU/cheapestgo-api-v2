/**
 * The lifecycle of one hotel booking attempt, as a pure transition table.
 *
 * `bookings` records a *sale* and is only written once money has moved and the supplier has
 * confirmed. Everything before that — and everything that goes wrong on the way — used to be
 * a free-form status string or nothing at all. This is the workflow the attempt moves through,
 * so "where is this booking, and how did it get there" has one answer.
 *
 *   DRAFT ─► PREBOOKED ─► PAYMENT_PENDING ─► PAYMENT_AUTHORIZED ─► SUPPLIER_BOOKING ─► CONFIRMED
 *                │               │                    │                    │              │
 *                ▼               ▼                    ▼                    ├─► FAILED     ├─► CANCEL_REQUESTED
 *             FAILED          EXPIRED          FAILED / EXPIRED            └─► NEEDS_REVIEW  ├─► CANCELLED
 *                                               (voided)                                    └─► REFUND_PENDING ─► REFUNDED | REFUND_FAILED
 *
 * No I/O in this file. The repository applies a transition atomically; this decides whether it
 * is allowed.
 */

export const HOTEL_BOOKING_STATUSES = [
    'DRAFT',
    'PREBOOKED',
    'PAYMENT_PENDING',
    'PAYMENT_AUTHORIZED',
    'SUPPLIER_BOOKING',
    'CONFIRMED',
    'CANCEL_REQUESTED',
    'CANCELLED',
    'REFUND_PENDING',
    'REFUNDED',
    'REFUND_FAILED',
    'FAILED',
    'EXPIRED',
    'NEEDS_REVIEW',
] as const;

export type HotelBookingStatus = (typeof HOTEL_BOOKING_STATUSES)[number];

/** Who moved the booking. Recorded on every event, so a surprising state can be explained. */
export type LifecycleActor = 'browser' | 'webhook' | 'sweeper' | 'admin';

const TRANSITIONS: Readonly<Record<HotelBookingStatus, readonly HotelBookingStatus[]>> = {
    DRAFT:              ['PREBOOKED', 'FAILED'],
    PREBOOKED:          ['PAYMENT_PENDING', 'FAILED', 'EXPIRED'],
    PAYMENT_PENDING:    ['PAYMENT_AUTHORIZED', 'FAILED', 'EXPIRED'],
    // A void is free, so an authorisation nobody completed ends here either as a failure the
    // supplier caused or as an abandonment the sweeper cleaned up.
    PAYMENT_AUTHORIZED: ['SUPPLIER_BOOKING', 'FAILED', 'EXPIRED'],
    // The one state a person has to look at when it is not left promptly: the supplier may or
    // may not hold a reservation.
    SUPPLIER_BOOKING:   ['CONFIRMED', 'FAILED', 'NEEDS_REVIEW'],
    NEEDS_REVIEW:       ['CONFIRMED', 'FAILED'],
    CONFIRMED:          ['CANCEL_REQUESTED'],
    // A refused cancellation puts the booking back; an unanswered one needs a person.
    CANCEL_REQUESTED:   ['CANCELLED', 'REFUND_PENDING', 'CONFIRMED', 'NEEDS_REVIEW'],
    CANCELLED:          ['REFUND_PENDING'],
    REFUND_PENDING:     ['REFUNDED', 'REFUND_FAILED'],
    // Retried, which is what `cancelled_refund_failed` already meant to the cancel endpoint.
    REFUND_FAILED:      ['REFUND_PENDING'],
    REFUNDED:           [],
    FAILED:             [],
    EXPIRED:            [],
};

export class InvalidTransitionError extends Error {
    constructor(public readonly from: HotelBookingStatus, public readonly to: HotelBookingStatus) {
        super(`Illegal hotel booking transition ${from} → ${to}`);
        this.name = 'InvalidTransitionError';
    }
}

export function isHotelBookingStatus(value: unknown): value is HotelBookingStatus {
    return typeof value === 'string' && (HOTEL_BOOKING_STATUSES as readonly string[]).includes(value);
}

export function allowedTransitions(from: HotelBookingStatus): readonly HotelBookingStatus[] {
    return TRANSITIONS[from];
}

export function canTransition(from: HotelBookingStatus, to: HotelBookingStatus): boolean {
    return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: HotelBookingStatus, to: HotelBookingStatus): void {
    if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Nothing further happens to a booking in one of these. */
export function isTerminal(status: HotelBookingStatus): boolean {
    return TRANSITIONS[status].length === 0;
}

/** States in which a payment authorisation is held and nothing has been booked or voided yet. */
export function holdsAuthorisation(status: HotelBookingStatus): boolean {
    return status === 'PAYMENT_AUTHORIZED' || status === 'SUPPLIER_BOOKING' || status === 'NEEDS_REVIEW';
}

/**
 * What `bookings.status` should read for a lifecycle state, so trips, invoices, admin and the
 * mobile app keep working off the one column they know.
 *
 * `null` means "no `bookings` row": an attempt that has not been paid for and booked is not a
 * trip, and must not appear as one or trip the duplicate-booking guard. NEEDS_REVIEW is among
 * them on purpose — the sale is not established until the supplier and the capture agree.
 */
export function projectLegacyStatus(status: HotelBookingStatus): string | null {
    switch (status) {
        case 'CONFIRMED':
        // Still a live booking until the supplier has agreed to cancel it.
        case 'CANCEL_REQUESTED':
            return 'confirmed';
        case 'CANCELLED':
        // The legacy column has no "refund in flight"; it reads cancelled until it resolves.
        case 'REFUND_PENDING':
            return 'cancelled';
        case 'REFUNDED':
            return 'cancelled_refunded';
        case 'REFUND_FAILED':
            return 'cancelled_refund_failed';
        default:
            return null;
    }
}
