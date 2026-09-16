import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/middleware/error.middleware';

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
     */
    async travelgateHealth(): Promise<{ otvStatus: 'ok' | 'down' | 'unknown'; detail?: string }> {
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
