import { describe, it, expect, vi } from 'vitest';

/**
 * The route-table audit #106's own "done when" asks for: a route added without a permission
 * fails a test rather than defaulting to open (#139).
 *
 * `EXEMPT` is the honest, current inventory of what #139 still has to convert — not a way
 * around this test, but what makes it meaningful before that conversion is finished. Two
 * failure directions on purpose: a route that is neither tagged nor exempted (someone added a
 * route and forgot permissions entirely), and an exemption that no longer matches a real,
 * still-unconverted route (someone converted a route and forgot to shrink this list, which
 * would otherwise let the list rot into meaninglessness).
 *
 * Only loads the module graph to read the registered route table — no handler here is ever
 * invoked, so the mocks below exist only to let `admin.route.ts` import cleanly.
 */

vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
    },
}));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(async () => null) } }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/adminContent.service',   () => ({ adminContentService: {} }));
vi.mock('@/services/adminSettings.service',  () => ({ adminSettingsService: {} }));
vi.mock('@/services/adminStripe.service',    () => ({ adminStripeService: {} }));
vi.mock('@/services/adminRevenue.service',   () => ({ adminRevenueService: {} }));
vi.mock('@/services/adminMobile.service',    () => ({ adminMobileService: {} }));
vi.mock('@/services/adminTravelgatex.service', () => ({ adminTravelgatexService: {} }));
vi.mock('@/services/adminPayments.service',  () => ({ adminPaymentsService: {} }));
vi.mock('@/services/paymentEvidence.service', () => ({ paymentEvidenceService: {} }));
vi.mock('@/services/hotels.service',         () => ({ HotelsService: class {} }));
vi.mock('@/services/flights.service',        () => ({ FlightsService: class {} }));
vi.mock('@/services/bookingRebuild.service', () => ({ bookingRebuildService: {}, REBUILD_STATUSES: [] }));
vi.mock('@/lib/admin/reconciliation',        () => ({ findUnrecordedReservations: vi.fn(), findBookingsMissingBrand: vi.fn() }));
vi.mock('@/lib/admin/audit',                 () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/admin/notify',                () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/auth/permissions',            () => ({ hasPermission: vi.fn() }));
vi.mock('@/lib/auth/permissionLog',          () => ({ logPermissionRefusal: vi.fn() }));
vi.mock('@/repositories/paymentEvidenceExport.repository', () => ({ saveEvidenceExport: vi.fn(), findEvidenceExport: vi.fn() }));
vi.mock('@/components/EvidencePdfDocument',  () => ({ EvidencePdfDocument: () => null }));
vi.mock('@react-pdf/renderer',               () => ({ renderToBuffer: vi.fn() }));

import adminRouter from '@/routes/admin.route';

interface RouteInfo { key: string; hasPermission: boolean }

/** Express's own route table — every `router.METHOD(path, ...)` registration, in order. */
function routeTable(router: unknown): RouteInfo[] {
    const stack = (router as { stack: any[] }).stack;
    const out: RouteInfo[] = [];
    for (const layer of stack) {
        if (!layer.route) continue; // a `router.use(...)` middleware layer, not a route
        const path = layer.route.path as string;
        for (const method of Object.keys(layer.route.methods)) {
            const hasPermission = (layer.route.stack as any[])
                .some((l) => typeof l.handle.__permission === 'string');
            out.push({ key: `${method.toUpperCase()} ${path}`, hasPermission });
        }
    }
    return out;
}

/**
 * Routes #139 hasn't converted yet, as of this test. Each needs a permission name decided
 * (catalogue/content, supplier settings, or system) before it can come off this list — see
 * #139. Shrink this list as routes are converted; do not grow it to make a new route pass.
 */
const EXEMPT = new Set([
    'GET /deals', 'POST /deals',
    'POST /communication/send',
    'GET /destinations', 'POST /destinations',
    'GET /saved-trips', 'POST /saved-trips',
    'GET /price-alerts', 'POST /price-alerts',
    'GET /notifications', 'POST /notifications',
    'GET /settings', 'POST /settings',
    'GET /search',
    'GET /tgx-health',
    'GET /travelgatex',
    'GET /supplier-health',
    'POST /brand',
    'GET /mobile', 'POST /mobile',
    'GET /reconciliation',
    'GET /reconciliation/:paymentIntentId/rebuild',
    'POST /reconciliation/:paymentIntentId/rebuild',
]);

describe('admin.route.ts — every route names a permission or is a known gap (#106/#139)', () => {
    const table = routeTable(adminRouter);

    it('found routes to check at all — a false pass here would hide everything below', () => {
        expect(table.length).toBeGreaterThan(30);
    });

    it.each(table)('$key', ({ key, hasPermission }) => {
        if (EXEMPT.has(key)) {
            // Exempted *because* it has no permission yet. The moment it gets one, this
            // assertion starts failing — which is the signal to shrink EXEMPT above.
            expect(hasPermission).toBe(false);
        } else {
            expect(hasPermission).toBe(true);
        }
    });

    it('exempts nothing that was already converted — the list only shrinks', () => {
        const converted = new Set(table.filter(r => r.hasPermission).map(r => r.key));
        const staleExemptions = [...EXEMPT].filter(k => converted.has(k));
        expect(staleExemptions).toEqual([]);
    });

    it('exempts nothing that no longer exists as a route — the list tracks real routes', () => {
        const real = new Set(table.map(r => r.key));
        const phantomExemptions = [...EXEMPT].filter(k => !real.has(k));
        expect(phantomExemptions).toEqual([]);
    });
});
