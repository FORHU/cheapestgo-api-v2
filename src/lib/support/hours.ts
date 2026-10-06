/**
 * When a human is available to take an escalated conversation.
 *
 * The escalation button is gated on this rather than queueing at 3am and promising a
 * reply nobody is there to give. The AI keeps answering outside these hours; what it
 * stops doing is offering a person.
 *
 * The schedule lives in `admin_settings` under `support_hours`, so hours change without
 * a redeploy. One schedule covers both brands.
 */

export interface SupportWindow {
    /** "HH:MM", 24-hour, in the schedule's timezone. */
    open: string;
    /** "HH:MM". Equal to `open` means closed. Earlier than `open` wraps past midnight. */
    close: string;
}

export type SupportDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface SupportHours {
    /** IANA zone. Hours are a promise made in one place's local time. */
    timezone: string;
    /** A missing or null day is closed. */
    days: Partial<Record<SupportDay, SupportWindow | null>>;
}

/** Sunday-first, matching `Date.getDay()` and `Intl`'s `weekday: 'short'` ordering. */
const DAY_ORDER: readonly SupportDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Manila office hours. The company operates from the Philippines and most traffic is
 * Philippine, so this is the schedule that is right until someone edits it in /admin.
 */
export const DEFAULT_SUPPORT_HOURS: SupportHours = {
    timezone: 'Asia/Manila',
    days: {
        mon: { open: '09:00', close: '18:00' },
        tue: { open: '09:00', close: '18:00' },
        wed: { open: '09:00', close: '18:00' },
        thu: { open: '09:00', close: '18:00' },
        fri: { open: '09:00', close: '18:00' },
        sat: null,
        sun: null,
    },
};

/**
 * "HH:MM" to minutes since midnight, or null if it is not a time.
 *
 * "24:00" is accepted and means end-of-day, which is how a day that is open around the
 * clock is written. Without it, 24/7 has to be spelled "00:00"–"23:59" and the desk
 * silently shuts for the last minute of every day.
 */
export function parseClock(value: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (minutes > 59) return null;
    if (hours === 24) return minutes === 0 ? 1440 : null;
    if (hours > 23) return null;

    return hours * 60 + minutes;
}

interface LocalTime {
    day: SupportDay;
    minutes: number;
}

/**
 * What day and time it is at `at`, as read in `timezone`.
 *
 * Goes through `Intl` rather than an offset arithmetic of our own so that DST is the
 * platform's problem. A wrong offset here would show "we're open" to a customer at
 * midnight, which is the failure this whole module exists to prevent.
 */
function localTime(at: Date, timezone: string): LocalTime | null {
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(at);
    } catch {
        // An unknown IANA zone. Treated as "we cannot tell", handled by the caller.
        return null;
    }

    const lookup = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find(part => part.type === type)?.value ?? '';

    const day = DAY_ORDER.find(d => d === lookup('weekday').toLowerCase());
    if (!day) return null;

    // `hour12: false` yields "24" for midnight in some ICU versions; it means hour 0.
    const hour = Number(lookup('hour')) % 24;
    const minute = Number(lookup('minute'));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

    return { day, minutes: hour * 60 + minute };
}

function windowFor(hours: SupportHours, day: SupportDay): SupportWindow | null {
    return hours.days[day] ?? null;
}

function previousDay(day: SupportDay): SupportDay {
    const index = DAY_ORDER.indexOf(day);
    return DAY_ORDER[(index + DAY_ORDER.length - 1) % DAY_ORDER.length];
}

/**
 * Is a human available at `at`?
 *
 * A window whose close is at or before its open is not a mistake to be rejected: equal
 * means the day is closed, and earlier means the desk works past midnight, in which case
 * the small hours belong to the *previous* day's window. Checking only today's row would
 * report a Tuesday-01:00 caller as out of hours on a desk that is open Monday 22:00–02:00.
 */
export function isWithinSupportHours(hours: SupportHours, at: Date): boolean {
    const now = localTime(at, hours.timezone);
    if (!now) return false;

    const today = windowFor(hours, now.day);
    if (today) {
        const open = parseClock(today.open);
        const close = parseClock(today.close);
        if (open !== null && close !== null) {
            if (close > open && now.minutes >= open && now.minutes < close) return true;
            // Wraps past midnight: open until end of day.
            if (close < open && now.minutes >= open) return true;
        }
    }

    // Yesterday's window, if it wrapped into today.
    const yesterday = windowFor(hours, previousDay(now.day));
    if (yesterday) {
        const open = parseClock(yesterday.open);
        const close = parseClock(yesterday.close);
        if (open !== null && close !== null && close < open && now.minutes < close) return true;
    }

    return false;
}

export interface SupportOpening {
    /** The day the desk next opens, in the schedule's own week. */
    day: SupportDay;
    /** "HH:MM" in `timezone`. */
    open: string;
    timezone: string;
    /** True when that is later today rather than on a following day. */
    today: boolean;
}

/**
 * When the desk next opens, expressed in its own local calendar.
 *
 * Deliberately a day and a wall-clock time rather than an instant. Converting "09:00 on
 * Monday in Asia/Manila" back into a UTC timestamp means doing reverse timezone
 * arithmetic by hand, which is where DST bugs live — and it buys nothing, because what
 * the customer is told is "back at 9:00 Manila time", not a timestamp.
 *
 * Returns null when the schedule never opens, which is a real state: every day null is a
 * valid way to say the desk is closed indefinitely.
 */
export function nextOpening(hours: SupportHours, at: Date): SupportOpening | null {
    const now = localTime(at, hours.timezone);
    if (!now) return null;

    // Later today, if today opens and we are not past the opening time yet.
    const today = windowFor(hours, now.day);
    if (today) {
        const open = parseClock(today.open);
        const close = parseClock(today.close);
        if (open !== null && close !== null && close !== open && now.minutes < open) {
            return { day: now.day, open: today.open, timezone: hours.timezone, today: true };
        }
    }

    // Otherwise the first of the following seven days that opens at all.
    const startIndex = DAY_ORDER.indexOf(now.day);
    for (let ahead = 1; ahead <= 7; ahead++) {
        const day = DAY_ORDER[(startIndex + ahead) % DAY_ORDER.length];
        const window = windowFor(hours, day);
        if (!window) continue;

        const open = parseClock(window.open);
        const close = parseClock(window.close);
        if (open === null || close === null || close === open) continue;

        return { day, open: window.open, timezone: hours.timezone, today: false };
    }

    return null;
}

export type ValidationResult =
    | { ok: true; hours: SupportHours }
    | { ok: false; error: string };

/**
 * Check a schedule on the way *in* — the opposite job from reading one.
 *
 * `parseSupportHours` forgives anything, because a typo in a settings row must not take
 * the widget down. Saving cannot forgive: quietly storing something other than what was
 * typed means an operator sets Saturday cover, sees it accepted, and finds out on Saturday
 * that it was dropped. Every problem is returned by name so the form can point at it.
 */
export function validateSupportHours(value: unknown): ValidationResult {
    if (!value || typeof value !== 'object') {
        return { ok: false, error: 'Support hours must be an object.' };
    }

    const raw = value as Record<string, unknown>;

    if (typeof raw.timezone !== 'string' || !raw.timezone.trim()) {
        return { ok: false, error: 'A timezone is required.' };
    }
    if (!localTime(new Date(), raw.timezone)) {
        return { ok: false, error: `"${raw.timezone}" is not a timezone this system knows.` };
    }
    if (!raw.days || typeof raw.days !== 'object') {
        return { ok: false, error: 'Support hours must list the days of the week.' };
    }

    const rawDays = raw.days as Record<string, unknown>;
    const days: Partial<Record<SupportDay, SupportWindow | null>> = {};

    for (const [name, window] of Object.entries(rawDays)) {
        if (!(DAY_ORDER as readonly string[]).includes(name)) {
            return { ok: false, error: `"${name}" is not a day. Use mon, tue, wed, thu, fri, sat or sun.` };
        }
        const day = name as SupportDay;

        // Explicitly closed. Distinct from a malformed window, and the only way to say it.
        if (window === null) {
            days[day] = null;
            continue;
        }
        if (!window || typeof window !== 'object') {
            return { ok: false, error: `${day}: expected opening and closing times, or null for closed.` };
        }

        const { open, close } = window as Record<string, unknown>;
        if (typeof open !== 'string' || parseClock(open) === null) {
            return { ok: false, error: `${day}: "${String(open)}" is not a time. Use HH:MM.` };
        }
        if (typeof close !== 'string' || parseClock(close) === null) {
            return { ok: false, error: `${day}: "${String(close)}" is not a time. Use HH:MM.` };
        }
        if (parseClock(open) === parseClock(close)) {
            return {
                ok: false,
                error: `${day}: opens and closes at the same time. Set it to closed instead.`,
            };
        }

        days[day] = { open, close };
    }

    return { ok: true, hours: { timezone: raw.timezone, days } };
}

/**
 * Narrow an unvalidated `admin_settings` value to a schedule.
 *
 * The value is operator-entered JSON, so it can be any shape at all. Anything
 * unrecognisable falls back to the default rather than throwing: a typo in a settings
 * field should not take the widget down.
 */
export function parseSupportHours(value: unknown): SupportHours {
    if (!value || typeof value !== 'object') return DEFAULT_SUPPORT_HOURS;

    const raw = value as Record<string, unknown>;
    if (typeof raw.timezone !== 'string' || !raw.days || typeof raw.days !== 'object') {
        return DEFAULT_SUPPORT_HOURS;
    }

    const rawDays = raw.days as Record<string, unknown>;
    const days: Partial<Record<SupportDay, SupportWindow | null>> = {};

    for (const day of DAY_ORDER) {
        const window = rawDays[day];
        if (!window || typeof window !== 'object') {
            days[day] = null;
            continue;
        }
        const { open, close } = window as Record<string, unknown>;
        if (typeof open !== 'string' || typeof close !== 'string') {
            days[day] = null;
            continue;
        }
        if (parseClock(open) === null || parseClock(close) === null) {
            days[day] = null;
            continue;
        }
        days[day] = { open, close };
    }

    // An unusable timezone would silently close the desk forever, so prove it works here
    // rather than at the first customer.
    if (!localTime(new Date(), raw.timezone)) return DEFAULT_SUPPORT_HOURS;

    return { timezone: raw.timezone, days };
}
