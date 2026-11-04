import { addDays, localDate } from '@/lib/golf/time';

/**
 * When a tee time may be shown (CONTEXT.md, "Golf Course"). Pure, so the listing, the generation
 * and their tests read the same numbers. Piece 2b adds the booking rules beside these.
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
 * The course-local dates a visitor can pick: from the first date past the lead time to the last date
 * the window generates (today plus `windowDays - 1`, as generation runs from today).
 */
export function listingRange(now: Date, tz: string, windowDays: number): { firstDate: string; lastDate: string } {
    return {
        firstDate: localDate(new Date(now.getTime() + MIN_LEAD_HOURS * HOUR), tz),
        lastDate:  addDays(localDate(now, tz), windowDays - 1),
    };
}
