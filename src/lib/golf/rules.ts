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

/**
 * How long a party takes over 18 holes, in minutes, by its size: the low end of what courses quote, from
 * a solo player's 2.5 to 3 hours up to a foursome's 4 to 4.5.
 */
const ROUND_MINUTES: Record<number, number> = { 1: 150, 2: 180, 3: 210, 4: 240 };

/** How long this party takes to play this course. Past 18 holes a round is still 18; a nine takes half. */
export function roundMinutes(players: number, holes: number): number {
    return ROUND_MINUTES[players] * (Math.min(holes, 18) / 18);
}

/**
 * The tee times a party is offered out of a day's, earliest first: the first of the day, then each next
 * one at least a round later. Walk the whole day, taken or not, so what a party sees stays put as other
 * people book: the same walk decides what is listed and what may be booked.
 */
export function spacedForParty<T extends { startsAt: Date }>(day: T[], players: number, holes: number): T[] {
    const gap = roundMinutes(players, holes) * 60_000;
    const offered: T[] = [];
    for (const teeTime of day) {
        const last = offered[offered.length - 1];
        if (!last || teeTime.startsAt.getTime() - last.startsAt.getTime() >= gap) offered.push(teeTime);
    }
    return offered;
}

/** How long a customer has to pay once checkout has taken their spots. Unpaid, the spots go back. */
export const HOLD_MINUTES = 15;
/** How long the team has to confirm a request with the course, at most… */
export const DECIDE_WITHIN_HOURS = 48;
/** …and never later than this before the tee time, so nobody arrives to an unconfirmed booking. */
export const DECIDE_BEFORE_TEE_HOURS = 2;

/** How long before a tee time a customer may cancel for free, unless the course sets its own. */
export const DEFAULT_FREE_CANCEL_HOURS = 48;
export const MAX_FREE_CANCEL_HOURS = 720;

/** A request still unanswered this close to its deadline is raised with the team again, once. */
export const REMIND_BEFORE_DEADLINE_HOURS = 6;

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

/** When free cancellation ends for a tee time: written on the booking when it is made. */
export function freeCancelUntil(startsAt: Date, freeCancelHours: number): Date {
    return new Date(startsAt.getTime() - freeCancelHours * HOUR);
}

export type CustomerCancellation =
    | { allowed: false; reason: 'not_cancellable' | 'free_cancellation_ended' }
    | { allowed: true; refund: number; charged: boolean };

/**
 * What a customer's cancellation does now. A request was never charged, so cancelling it only releases
 * the card, whatever the time. A confirmed booking is refunded in full, fee included, until free
 * cancellation ends; after that it cannot be cancelled online and the customer talks to support.
 */
export function cancellationFor(
    booking: { status: string; total: number; freeCancelUntil: Date },
    now: Date,
): CustomerCancellation {
    if (booking.status === 'requested') return { allowed: true, refund: 0, charged: false };
    if (booking.status !== 'confirmed') return { allowed: false, reason: 'not_cancellable' };
    if (now.getTime() >= booking.freeCancelUntil.getTime()) return { allowed: false, reason: 'free_cancellation_ended' };
    return { allowed: true, refund: booking.total, charged: true };
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
