import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/middleware/error.middleware';
import { createNotification } from '@/lib/admin/notify';
import { STAYS_MAINTENANCE_KEY } from '@/lib/maintenance';
import {
    tgxGraphQL, getTgxConfig, getTgxSettings, resolveTgxDestinationCode,
} from '@/lib/hotels/travelgatex';

/**
 * Settings, the audit trail, back-office search and the supplier health check (C5, ported from
 * v1's /api/admin/{settings,search,tgx-health}).
 *
 * Grouped because they are the back office acting on itself rather than on customer data: what
 * it is configured with, what it has done, and whether the supplier behind it is answering.
 */

export interface AdminSearchResult {
    id:       string;
    type:     'booking' | 'customer' | 'user';
    title:    string;
    subtitle: string;
    href:     string;
}

/** Short enough that the box stays a shortcut rather than a results page. */
const SEARCH_LIMIT = 5;

/** Below this a search matches half the database and helps nobody. */
const MIN_QUERY = 2;

export class AdminSettingsService {
    // ─── Settings ─────────────────────────────────────────────────────────────

    async getSettings(): Promise<Record<string, unknown>> {
        const rows = await prisma.admin_settings.findMany({ select: { key: true, value: true } });
        return Object.fromEntries(rows.map(row => [row.key, row.value]));
    }

    /**
     * Save whatever keys were sent, leaving the rest alone.
     *
     * A partial write on purpose: the settings screen submits the section being edited, and
     * replacing the whole table with one section's keys would quietly unset the others.
     */
    async saveSettings(settings: unknown): Promise<{ saved: number }> {
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            throw new AppError(400, 'Missing settings object', 'VALIDATION_ERROR');
        }

        const entries = Object.entries(settings as Record<string, unknown>);
        for (const [key, value] of entries) {
            await prisma.admin_settings.upsert({
                where:  { key },
                update: { value: value as Prisma.InputJsonValue, updated_at: new Date() },
                create: { key, value: value as Prisma.InputJsonValue },
            });
        }
        return { saved: entries.length };
    }

    // ─── Audit ────────────────────────────────────────────────────────────────

    /**
     * Record what an admin did. Never throws: an action that succeeded must not be reported as
     * failed because its audit row could not be written.
     */
    async logAction(entry: { action: string; adminId?: string; adminEmail?: string; targetId?: string; details?: unknown }) {
        try {
            await prisma.admin_audit_log.create({
                data: {
                    action:      entry.action,
                    admin_id:    entry.adminId ?? null,
                    admin_email: entry.adminEmail ?? null,
                    target_id:   entry.targetId ?? null,
                    details:     (entry.details ?? {}) as Prisma.InputJsonValue,
                },
            });
        } catch (err) {
            console.warn('[admin/audit] could not record action:', (err as Error).message?.slice(0, 80));
        }
    }

    // ─── Back-office search ───────────────────────────────────────────────────

    /**
     * The one box at the top of the back office: a booking reference, a customer's email, a
     * staff account. Each source is capped, because this is a shortcut to a record and not a
     * report — an Agent who needs a list opens the list.
     */
    async search(rawQuery: string): Promise<{ bookings: AdminSearchResult[]; customers: AdminSearchResult[]; users: AdminSearchResult[] }> {
        const query = rawQuery.trim();
        if (query.length < MIN_QUERY) return { bookings: [], customers: [], users: [] };

        const like = { contains: query, mode: 'insensitive' as const };

        const [bookings, users] = await Promise.all([
            prisma.bookings.findMany({
                where: {
                    OR: [
                        { booking_id:        like },
                        { holder_email:      like },
                        { holder_first_name: like },
                        { holder_last_name:  like },
                    ],
                },
                orderBy: { created_at: 'desc' },
                take: SEARCH_LIMIT,
                select: {
                    id: true, booking_id: true, status: true, total_price: true, currency: true,
                    holder_first_name: true, holder_last_name: true, holder_email: true,
                },
            }),
            prisma.users.findMany({
                where: {
                    OR: [
                        { email:      like },
                        { first_name: like },
                        { last_name:  like },
                    ],
                },
                orderBy: { created_at: 'desc' },
                take: SEARCH_LIMIT,
                select: { id: true, email: true, first_name: true, last_name: true, role: true },
            }),
        ]);

        return {
            bookings: bookings.map(b => ({
                id:       b.id,
                type:     'booking' as const,
                title:    b.booking_id ?? b.id,
                subtitle: [`${b.holder_first_name ?? ''} ${b.holder_last_name ?? ''}`.trim(), b.status].filter(Boolean).join(' · '),
                href:     `/admin/bookings/${b.id}`,
            })),
            // A customer is a user with bookings; v1 lists them separately because its customers
            // screen is separate. The same rows serve both until that screen exists here.
            customers: users
                .filter(u => u.role !== 'admin')
                .map(u => ({
                    id:       u.id,
                    type:     'customer' as const,
                    title:    `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email,
                    subtitle: u.email,
                    href:     `/admin/customers/${u.id}`,
                })),
            users: users.map(u => ({
                id:       u.id,
                type:     'user' as const,
                title:    u.email,
                subtitle: u.role,
                href:     `/admin/users/${u.id}`,
            })),
        };
    }

    // ─── Supplier health ──────────────────────────────────────────────────────

    /**
     * Whether TravelgateX answers, asked after the page has rendered rather than before.
     *
     * Deliberately not a search: a health check that books nothing and costs nothing is the
     * only kind that can run on an admin page load.
     *
     * `otvStatus` therefore means *the gateway is reachable and our key is accepted* — and
     * nothing more. On 2026-10-26 it would have read `ok` without interruption while every
     * hotel search in both v1 and v2 returned zero, because TGX was answering perfectly and
     * the supplier behind it had stopped selling. Reachability and sellability are different
     * questions and only the second one loses money.
     *
     * So `availability` is returned beside it: the last verdict from the canary search run by
     * `/cron/supplier-health`, which asks the second question. A caller that shows only
     * `otvStatus` is showing the half that stays green during an outage.
     */
    async travelgateHealth(): Promise<{
        otvStatus: 'ok' | 'down' | 'unknown';
        detail?: string;
        availability: { status: string; detail: string | null; checkedAt: string | null };
    }> {
        const settings = await this.getSettings().catch(() => ({} as Record<string, unknown>));
        const availability = {
            status:    (settings.stays_health_status as string) ?? 'never-checked',
            detail:    (settings.stays_health_detail as string) ?? null,
            checkedAt: (settings.stays_health_checked_at as string) ?? null,
        };

        return { ...(await this.gatewayReachable()), availability };
    }

    /**
     * Ask the supplier for rooms in a city that is never empty, and act on the answer.
     *
     * The canary is the whole idea. A visitor's empty search is ambiguous — "Seoul has no
     * rooms for those dates" and "this account is being served nothing" come back identical,
     * a success status with an empty list and no error. London three weeks out removes the
     * ambiguity, because it is never legitimately sold out.
     *
     * Lives here rather than in the route because two callers need it with different auth:
     * the scheduled job holds the cron secret, the admin screen's "Check now" holds a session.
     */
    async runSupplierHealthCheck(): Promise<{
        ok: boolean;
        status: 'healthy' | 'down' | 'unknown';
        streak?: number;
        detail: string;
        checkedAt: string;
        maintenance: boolean;
        switched: 'on' | 'off' | null;
    }> {
        /** Never legitimately sold out. GB so a Londons-elsewhere row can be rejected. */
        const CANARY = { city: 'London', country: 'GB' };
        /** Consecutive verdicts required before the public site is changed either way. */
        const FAILS_TO_ENGAGE = 3;
        const PASSES_TO_CLEAR = 2;
        /** Computed, never a literal — a hardcoded date slips into the past and then reports
         *  a permanent outage from its own staleness. */
        const isoDaysOut = (days: number) =>
            new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

        const checkin  = isoDaysOut(21);
        const checkout = isoDaysOut(23);
        const checkedAt = new Date().toISOString();

        let options = 0;
        let detail = '';
        let probeFailed = false;

        try {
            const code = await resolveTgxDestinationCode(CANARY.city, prisma, CANARY.country);
            if (!code) {
                probeFailed = true;
                detail = `no destination code for ${CANARY.city}`;
            } else {
                const cfg = getTgxConfig();
                const result = await tgxGraphQL(
                    'query Health($criteria:HotelCriteriaSearchInput!,$settings:HotelSettingsInput){hotelX{search(criteria:$criteria,settings:$settings){options{hotelCode paymentType status}errors{code description}}}}',
                    {
                        criteria: {
                            checkIn:      checkin,
                            checkOut:     checkout,
                            occupancies:  [{ paxes: [{ age: 30 }, { age: 30 }] }],
                            nationality:  'GB',
                            currency:     'USD',
                            destinations: [code],
                        },
                        settings: getTgxSettings(cfg, 18_000, true),
                    },
                    25_000,
                );
                const opts: any[] = result?.data?.hotelX?.search?.options ?? [];
                options = opts.filter(o => o.paymentType === 'MERCHANT').length;
                detail  = `${CANARY.city} (${code}) ${checkin}→${checkout}: ${options} merchant options`;
            }
        } catch (err: any) {
            // A thrown probe says our call failed, not that the supplier is empty. Those are
            // different facts and only the second should ever darken the site.
            probeFailed = true;
            detail = `probe error: ${String(err?.message ?? err).slice(0, 200)}`;
        }

        const before = await this.getSettings();
        const maintenanceOn = before[STAYS_MAINTENANCE_KEY] === true || before[STAYS_MAINTENANCE_KEY] === 'true';

        if (probeFailed) {
            await this.saveSettings({
                stays_health_status:     'unknown',
                stays_health_detail:     detail,
                stays_health_checked_at: checkedAt,
            });
            console.warn('[supplier-health]', detail);
            return { ok: false, status: 'unknown', detail, checkedAt, maintenance: maintenanceOn, switched: null };
        }

        const status: 'healthy' | 'down' = options > 0 ? 'healthy' : 'down';
        const streak = before.stays_health_status === status ? (Number(before.stays_health_streak) || 0) + 1 : 1;

        const next: Record<string, unknown> = {
            stays_health_status:     status,
            stays_health_streak:     streak,
            stays_health_detail:     detail,
            stays_health_checked_at: checkedAt,
        };

        let switched: 'on' | 'off' | null = null;

        if (status === 'down' && !maintenanceOn && streak >= FAILS_TO_ENGAGE) {
            next[STAYS_MAINTENANCE_KEY] = true;
            switched = 'on';
            await createNotification(
                'Stays maintenance switched ON automatically',
                `The hotel supplier returned no availability for ${CANARY.city} on ${streak} consecutive checks (${detail}). `
                + 'Hotel search and booking now show a maintenance notice. Flights are unaffected.',
                'alert',
            );
        } else if (status === 'healthy' && maintenanceOn && streak >= PASSES_TO_CLEAR) {
            next[STAYS_MAINTENANCE_KEY] = false;
            switched = 'off';
            await createNotification(
                'Stays maintenance switched OFF automatically',
                `The hotel supplier returned availability on ${streak} consecutive checks (${detail}). Hotel search and booking are live again.`,
                'system',
            );
        }

        await this.saveSettings(next);
        console.log(`[supplier-health] ${status} streak=${streak} ${detail}${switched ? ` — maintenance ${switched}` : ''}`);

        return {
            ok: true,
            status,
            streak,
            detail,
            checkedAt,
            maintenance: switched ? switched === 'on' : maintenanceOn,
            switched,
        };
    }

    /** The reachability ping on its own — see `travelgateHealth` for why that is not enough. */
    private async gatewayReachable(): Promise<{ otvStatus: 'ok' | 'down' | 'unknown'; detail?: string }> {
        const apiKey = process.env.TRAVELGATEX_API_KEY ?? process.env.TRAVELGATE_API_KEY;
        if (!apiKey) return { otvStatus: 'unknown', detail: 'No API key configured' };

        const endpoint = process.env.TRAVELGATEX_ENDPOINT_URL ?? process.env.TRAVELGATE_ENDPOINT_URL ?? 'https://api.travelgate.com';

        try {
            const res = await fetch(endpoint, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${apiKey}` },
                body:    JSON.stringify({ query: '{ __typename }' }),
                signal:  AbortSignal.timeout(8_000),
            });
            return res.ok ? { otvStatus: 'ok' } : { otvStatus: 'down', detail: `HTTP ${res.status}` };
        } catch (err) {
            return { otvStatus: 'down', detail: (err as Error).message?.slice(0, 120) };
        }
    }
}

export const adminSettingsService = new AdminSettingsService();
