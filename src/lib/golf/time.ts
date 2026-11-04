/**
 * Course-local time without a date library (CONTEXT.md, "Golf Course"). A tee time is set on the
 * course's own clock ("07:30 in Manila") and stored as an instant, so every conversion goes through
 * the course's IANA time zone. Ported from v1's `src/lib/golf/time.ts`; built on `Intl` alone.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function isValidTimeZone(tz: string): boolean {
    if (!tz) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

/** A real calendar date written "YYYY-MM-DD". */
export function isIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(instant: number, tz: string) {
    let format = formatters.get(tz);
    if (!format) {
        format = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        formatters.set(tz, format);
    }
    const fields: Record<string, number> = {};
    for (const part of format.formatToParts(new Date(instant))) {
        if (part.type !== 'literal') fields[part.type] = Number(part.value);
    }
    return fields as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Milliseconds the clock in `tz` is ahead of UTC at `instant`. */
function offsetMs(instant: number, tz: string): number {
    const w = wallClock(instant, tz);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant at which the clock in `tz` reads `date` `time` ("2026-11-15", "07:30"). A time skipped
 * by a daylight-saving jump lands just after the jump; a time that happens twice resolves to its
 * first occurrence.
 */
export function zonedTimeToUtc(date: string, time: string, tz: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const wall = Date.UTC(y, m - 1, d, hh, mm);
    const first = wall - offsetMs(wall, tz);
    const second = wall - offsetMs(first, tz);
    // Agreeing offsets mean `second` really reads `time`. Disagreeing ones mean the time falls in a
    // gap, and the later candidate is the instant just after the clocks jumped.
    return new Date(offsetMs(second, tz) === offsetMs(first, tz) ? second : Math.max(first, second));
}

/** The course-local calendar date ("2026-11-15") of `instant`. */
export function localDate(instant: Date, tz: string): string {
    const w = wallClock(instant.getTime(), tz);
    return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** "07:30" on the course's clock. */
export function localTime(instant: Date, tz: string): string {
    const w = wallClock(instant.getTime(), tz);
    return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** Calendar arithmetic on "YYYY-MM-DD"; no zone involved. */
export function addDays(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
