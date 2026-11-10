// src/services/adminTravelgatex.service.ts
/**
 * The supplier page's data (C5, ported from v1's `lib/server/admin/providers.ts`).
 *
 * app-v2 has had a `/admin/travelgatex` page since the port, calling `GET /admin/travelgatex` —
 * a route that was never written. The page answered "Not Found" and had done since it shipped.
 * `/admin/tgx-health` exists and is a different, smaller thing: it says whether OTV is answering,
 * not what we have sold through them.
 *
 * What it reports is **our own record of supplier activity**, read from `bookings` and
 * `api_logs`. It is not read back from TravelgateX, because TravelgateX exposes no booking-read
 * (ADR-0003's limitation): search, quote, book and cancel only. So these counts are what we
 * believe we sold, which is the honest claim and the one worth watching for divergence.
 */

import { prisma } from '@/lib/prisma';
import { config } from '@/config';
import { adminSettingsService } from '@/services/adminSettings.service';

/** The rows this page shows, few enough to render in one response. */
const RECENT_BOOKINGS = 10;
const RECENT_API_LOGS = 15;

/**
 * Identifiers the supplier knows us by.
 *
 * Defaults match v1's, which are the values OTV actually has on file for this agency. They are
 * identifiers rather than credentials — the key is the secret, and it is never returned.
 */
const CLIENT_NAME   = process.env.TRAVELGATEX_CLIENT   || 'forhuinc';
const SUPPLIER_CODE = process.env.TRAVELGATEX_SUPPLIER || 'OTV';
const CONTEXT_CODE  = process.env.TRAVELGATEX_CONTEXT  || 'OTV';

export class AdminTravelgatexService {
    async overview() {
        const apiKeyConfigured = Boolean(config.TRAVELGATEX_API_KEY);
        const accessCode = config.TRAVELGATEX_CODE ?? null;

        // Asked for even without a key: it is the one field that reports the supplier's own
        // state rather than ours, and "no key configured" is itself the answer worth showing.
        const health = await adminSettingsService.travelgateHealth().catch(() => null);

        const [counts, recent, logs] = await Promise.all([
            prisma.bookings.groupBy({
                by:     ['status'],
                where:  { provider: 'travelgatex' },
                _count: { _all: true },
                _sum:   { total_price: true },
            }).catch(() => []),
            prisma.bookings.findMany({
                where:   { provider: 'travelgatex' },
                select:  {
                    booking_id: true, property_name: true, status: true,
                    total_price: true, currency: true, created_at: true,
                },
                orderBy: { created_at: 'desc' },
                take:    RECENT_BOOKINGS,
            }).catch(() => []),
            prisma.api_logs.findMany({
                where:   { provider: { in: ['travelgatex', 'tgx'] } },
                select:  {
                    id: true, endpoint: true, response_status: true,
                    duration_ms: true, error_message: true, created_at: true,
                },
                orderBy: { created_at: 'desc' },
                take:    RECENT_API_LOGS,
            }).catch(() => []),
        ]);

        // Summed from the grouped rows rather than by listing every booking: the page shows ten,
        // the totals are over all of them, and loading them all to count would not scale.
        const tally = (match: (status: string) => boolean) =>
            counts.filter(c => match(String(c.status ?? ''))).reduce((n, c) => n + c._count._all, 0);

        const totalBookings = counts.reduce((n, c) => n + c._count._all, 0);
        const totalRevenue  = counts.reduce((sum, c) => sum + Number(c._sum.total_price ?? 0), 0);

        return {
            // `not_configured` is a state, not a failure: a deployment with no supplier key is
            // the correct shape for local development and for the dev host running the mock.
            status: apiKeyConfigured ? 'healthy' : 'not_configured',
            apiKeyConfigured,
            accessCode,
            clientName:   apiKeyConfigured ? CLIENT_NAME   : null,
            supplierCode: apiKeyConfigured ? SUPPLIER_CODE : null,
            contextCode:  apiKeyConfigured ? CONTEXT_CODE  : null,

            // From `/tgx-health`, so the two pages cannot disagree about whether OTV is up.
            otvStatus:    (health?.otvStatus as 'active' | 'no_rates' | 'unknown') ?? 'unknown',
            errorMessage: health?.detail ?? undefined,

            totalBookings,
            // Anything cancelled, however it ended — `cancelled`, `cancelled_refunded`,
            // `cancelled_refund_failed` are three outcomes of one event and the count is of the
            // event. The refund's own fate belongs on the payments page, not here.
            confirmedBookings: tally(s => s === 'confirmed' || s === 'completed'),
            cancelledBookings: tally(s => s.startsWith('cancelled')),
            totalRevenue:      Math.round(totalRevenue * 100) / 100,
            revenueCurrency:   recent[0]?.currency ?? 'USD',

            recentBookings: recent.map(b => ({
                id:        b.booking_id,
                reference: b.booking_id,
                hotelName: b.property_name,
                status:    String(b.status ?? '').startsWith('cancelled') ? 'cancelled'
                    : b.status === 'confirmed' ? 'confirmed' : 'pending',
                amount:    Number(b.total_price) || 0,
                currency:  b.currency ?? 'USD',
                createdAt: b.created_at?.toISOString() ?? null,
            })),

            recentApiLogs: logs.map(l => ({
                id:             l.id,
                endpoint:       l.endpoint,
                responseStatus: l.response_status,
                durationMs:     l.duration_ms,
                errorMessage:   l.error_message,
                createdAt:      l.created_at?.toISOString() ?? null,
            })),
        };
    }
}

export const adminTravelgatexService = new AdminTravelgatexService();
