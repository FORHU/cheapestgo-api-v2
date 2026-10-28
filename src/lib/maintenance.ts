import { prisma } from '@/lib/prisma';

/** The one admin_settings key that decides whether stays are sellable. */
export const STAYS_MAINTENANCE_KEY = 'stays_maintenance';

/**
 * Is hotel search and booking switched off?
 *
 * Set by hand from the admin settings screen, or by the supplier-health probe when the
 * canary comes back empty often enough. Never inferred from a single empty search: an
 * account that has stopped being served availability and a city with genuinely no rooms
 * answer identically, and reading that ambiguity wrongly is how v1 blacklisted nineteen
 * destination codes for a week.
 *
 * Hotels only — flights are a different supplier and keep selling.
 *
 * A primary-key lookup rather than `adminSettingsService.getSettings()`, because this sits
 * on the search path and that one reads the whole table.
 */
export async function staysUnderMaintenance(): Promise<boolean> {
    try {
        const row = await prisma.admin_settings.findUnique({
            where:  { key: STAYS_MAINTENANCE_KEY },
            select: { value: true },
        });
        // `'true'` is accepted as well as `true`. Prisma round-trips a real JSON boolean, but
        // v1 stored this same flag as the string "true" and `=== true` quietly never matched,
        // so an admin toggled maintenance on and the site kept selling. Cheaper to accept both
        // than to debug that twice. Only these two mean on — anything else, including a
        // missing row, leaves stays sellable.
        return row?.value === true || row?.value === 'true';
    } catch {
        // A settings read that fails must not take stays down on its own.
        return false;
    }
}
