/**
 * The lifecycle of one flight booking attempt, as a pure transition table.
 *
 * `booking_sessions` is the attempt: it holds the passengers, the price charged and the
 * PaymentIntent. Its free-form `status` could not say whether a card was authorised, whether the
 * airline had been asked, or what to do about a request that timed out. This is the workflow the
 * attempt moves through, so "where is this booking, and how did it get there" has one answer.
 *
 *   PAYMENT_PENDING ─► PAYMENT_AUTHORIZED ─► SUPPLIER_BOOKING ─► CONFIRMED
 *          │                   │                    │    │
 *          ▼                   ▼                    │    └─► NEEDS_REVIEW ─► CONFIRMED | FAILED
 *       FAILED /            FAILED /                └─► FAILED
 *       EXPIRED             EXPIRED
 *
 * Money moves in a fixed order — authorise, then ask the airline, then capture — so the only
 * states that hold a card authorisation are the ones between the first and the last.
 *
 * No cancel or refund states: cancellation is not part of this lifecycle yet, and a confirmed
 * flight is terminal here. Mirrors src/lib/hotels/lifecycle/stateMachine.ts.
 *
 * No I/O in this file. The repository applies a transition atomically; this decides whether it
 * is allowed.
 */

import type { LifecycleActor } from '@/lib/hotels/lifecycle/stateMachine';

export type { LifecycleActor };

export const FLIGHT_BOOKING_STATUSES = [
    'PAYMENT_PENDING',
    'PAYMENT_AUTHORIZED',
    'SUPPLIER_BOOKING',
    'CONFIRMED',
    'FAILED',
    'EXPIRED',
    'NEEDS_REVIEW',
] as const;

export type FlightBookingStatus = (typeof FLIGHT_BOOKING_STATUSES)[number];

const TRANSITIONS: Readonly<Record<FlightBookingStatus, readonly FlightBookingStatus[]>> = {
    PAYMENT_PENDING:    ['PAYMENT_AUTHORIZED', 'FAILED', 'EXPIRED'],
    // A void is free, so an authorisation nobody completed ends here either as a failure the
    // airline caused or as an abandonment the sweeper cleaned up.
    PAYMENT_AUTHORIZED: ['SUPPLIER_BOOKING', 'FAILED', 'EXPIRED'],
    // The one state a person has to look at when it is not left promptly: the airline may or
    // may not hold an order. There is no way from here to EXPIRED — once asked, abandonment is
    // not an answer.
    SUPPLIER_BOOKING:   ['CONFIRMED', 'FAILED', 'NEEDS_REVIEW'],
    NEEDS_REVIEW:       ['CONFIRMED', 'FAILED'],
    CONFIRMED:          [],
    FAILED:             [],
    EXPIRED:            [],
};

export class InvalidTransitionError extends Error {
    constructor(public readonly from: FlightBookingStatus, public readonly to: FlightBookingStatus) {
        super(`Illegal flight booking transition ${from} → ${to}`);
        this.name = 'InvalidTransitionError';
    }
}

export function isFlightBookingStatus(value: unknown): value is FlightBookingStatus {
    return typeof value === 'string' && (FLIGHT_BOOKING_STATUSES as readonly string[]).includes(value);
}

export function allowedTransitions(from: FlightBookingStatus): readonly FlightBookingStatus[] {
    return TRANSITIONS[from];
}

export function canTransition(from: FlightBookingStatus, to: FlightBookingStatus): boolean {
    return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: FlightBookingStatus, to: FlightBookingStatus): void {
    if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Nothing further happens to a booking in one of these. */
export function isTerminal(status: FlightBookingStatus): boolean {
    return TRANSITIONS[status].length === 0;
}

/** States in which a payment authorisation is held and nothing has been captured or voided yet. */
export function holdsAuthorisation(status: FlightBookingStatus): boolean {
    return status === 'PAYMENT_AUTHORIZED' || status === 'SUPPLIER_BOOKING' || status === 'NEEDS_REVIEW';
}
