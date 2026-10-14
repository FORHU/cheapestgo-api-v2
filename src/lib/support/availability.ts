import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
    DEFAULT_SUPPORT_HOURS,
    isWithinSupportHours,
    parseSupportHours,
    validateSupportHours,
    type SupportHours,
    type ValidationResult,
} from '@/lib/support/hours';

/**
 * Reading the support schedule out of `admin_settings`.
 *
 * Kept apart from `hours.ts` so the decision itself stays a pure function of a schedule and an
 * instant — that is the part worth testing, and it should not need a database to run. This
 * module is only the lookup.
 */

/** `admin_settings.key` holding the schedule. */
export const SUPPORT_HOURS_KEY = 'support_hours';

export async function getSupportHours(): Promise<SupportHours> {
    try {
        const row = await prisma.admin_settings.findUnique({
            where:  { key: SUPPORT_HOURS_KEY },
            select: { value: true },
        });
        if (row?.value === undefined || row?.value === null) return DEFAULT_SUPPORT_HOURS;

        // A jsonb column comes back already parsed, except where a value was stored as a JSON
        // *string*, which a careless write is capable of producing.
        const value = typeof row.value === 'string' ? safeParse(row.value) : row.value;
        return parseSupportHours(value);
    } catch (err) {
        // The schedule only gates a button. A database hiccup should not take the widget down
        // with it, so fall back to the published hours.
        logger.warn('[support/availability] falling back to default hours', { err: (err as Error).message });
        return DEFAULT_SUPPORT_HOURS;
    }
}

function safeParse(value: string): unknown {
    try { return JSON.parse(value); } catch { return null; }
}

/**
 * Store a schedule, after checking it.
 *
 * Rejects rather than coerces. Reading is forgiving because a bad row must not take the widget
 * down; writing is not, because an operator who sets Saturday cover and sees it accepted must
 * actually have Saturday cover.
 */
export async function saveSupportHours(value: unknown): Promise<ValidationResult> {
    const checked = validateSupportHours(value);
    if (!checked.ok) return checked;

    // The object itself, never `JSON.stringify` of it: a jsonb column handed a string stores a
    // JSON *string*, so `{"a":1}` becomes `"{\"a\":1}"`. The round trip still works, because
    // `getSupportHours` defensively parses a string — which is exactly what would make the
    // mistake survive unnoticed, while every other reader silently finds nothing.
    const stored = checked.hours as unknown as Prisma.InputJsonValue;
    await prisma.admin_settings.upsert({
        where:  { key: SUPPORT_HOURS_KEY },
        update: { value: stored, updated_at: new Date() },
        create: { key: SUPPORT_HOURS_KEY, value: stored },
    });

    return checked;
}

export interface SupportAvailability {
    humanAvailable: boolean;
    hours:          SupportHours;
}

export async function getSupportAvailability(at: Date = new Date()): Promise<SupportAvailability> {
    const hours = await getSupportHours();
    return { humanAvailable: isWithinSupportHours(hours, at), hours };
}
