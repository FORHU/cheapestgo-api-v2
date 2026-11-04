import { addDays, localDate } from '@/lib/golf/time';

/**
 * When a tee time may be shown, and how long each step of a booking may take (CONTEXT.md, "Golf
 * Course", "Golf Booking"). Pure, so the listing, the generation, the bookings and their tests read
 * the same numbers.
 */

/** The team needs time to check with the course, so tee times sooner than this are not offered. */
export const MIN_LEAD_HOURS = 24;
/** A course's booking window unless it sets its own: how far ahead tee times are generated. */
export const DEFAULT_BOOKING_WINDOW_DAYS = 60;
export const MAX_BOOKING_WINDOW_DAYS = 90;
/** The party a price is quoted for until the visitor says otherwise (v1 ADR-0047). */
export const DEFAULT_PLAYERS = 2;

const HOUR = 3_600_000;

/** Far enough ahead for the team to check, and inside the course's window (plus a day for zone edges). */
export function isListableStart(startsAt: Date, now: Date, windowDays: number): boolean {
    const lead = startsAt.getTime() - now.getTime();
    return lead >= MIN_LEAD_HOURS * HOUR && lead <= (windowDays + 1) * 24 * HOUR;
}

/** How long a customer has to pay once checkout has taken their spots. Unpaid, the spots go back. */
export const HOLD_MINUTES = 15;
/** How long the team has to confirm a request with the course, at most… */
export const DECIDE_WITHIN_HOURS = 48;
/** …and never later than this before the tee time, so nobody arrives to an unconfirmed booking. */
export const DECIDE_BEFORE_TEE_HOURS = 2;

/** When a hold started now runs out. */
export function holdExpiry(now: Date): Date {
    return new Date(now.getTime() + HOLD_MINUTES * 60_000);
}

/**
 * The team's deadline for a request: the earlier of `DECIDE_WITHIN_HOURS` after it was made and
 * `DECIDE_BEFORE_TEE_HOURS` before the tee time. A card authorisation lasts about seven days, so
 * either way the capture happens well inside it.
 */
export function decideBy(requestedAt: Date, startsAt: Date): Date {
    return new Date(Math.min(
        requestedAt.getTime() + DECIDE_WITHIN_HOURS * HOUR,
        startsAt.getTime() - DECIDE_BEFORE_TEE_HOURS * HOUR,
    ));
}

/**
 * The course-local dates a visitor can pick: from the first date past the lead time to the last date
 * the window generates (today plus `windowDays - 1`, as generation runs from today).
 */
export function listingRange(now: Date, tz: string, windowDays: number): { firstDate: string; lastDate: string } {
    return {
        firstDate: localDate(new Date(now.getTime() + MIN_LEAD_HOURS * HOUR), tz),
        lastDate:  addDays(localDate(now, tz), windowDays - 1),
    };
}
