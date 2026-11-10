import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The supplier page's data.
 *
 * app-v2 has had a `/admin/travelgatex` page since the port, calling `GET /admin/travelgatex` — a
 * route nobody ever wrote. The page answered Not Found from the day it shipped, and no test
 * anywhere named the contract between them, which is exactly why it went unnoticed.
 *
 * What it reports is **our own record** of what we sold through OTV. TravelgateX exposes no
 * booking-read, so these counts cannot be confirmed against the supplier — they are what we
 * believe, which is the honest claim and the one worth watching for divergence.
 */

const db = vi.hoisted(() => ({ groupBy: vi.fn(), findMany: vi.fn(), logsFindMany: vi.fn() }));
const health = vi.hoisted(() => ({ travelgateHealth: vi.fn() }));
const cfg = vi.hoisted(() => ({ TRAVELGATEX_API_KEY: undefined as string | undefined, TRAVELGATEX_CODE: undefined as string | undefined }));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        bookings: { groupBy: db.groupBy, findMany: db.findMany },
        api_logs: { findMany: db.logsFindMany },
    },
}));
vi.mock('@/config', () => ({ config: cfg }));
vi.mock('@/services/adminSettings.service', () => ({ adminSettingsService: health }));

import { AdminTravelgatexService } from '@/services/adminTravelgatex.service';

const service = new AdminTravelgatexService();

const group = (status: string, n: number, sum: number) =>
    ({ status, _count: { _all: n }, _sum: { total_price: sum } });

beforeEach(() => {
    vi.clearAllMocks();
    cfg.TRAVELGATEX_API_KEY = undefined;
    cfg.TRAVELGATEX_CODE = undefined;
    db.groupBy.mockResolvedValue([]);
    db.findMany.mockResolvedValue([]);
    db.logsFindMany.mockResolvedValue([]);
    health.travelgateHealth.mockResolvedValue({ otvStatus: 'unknown', detail: 'No API key configured' });
});

describe('when no supplier key is configured', () => {
    /**
     * The correct shape for local development and for the dev host running the mock — not an
     * error, and not something to show as one.
     */
    it('reports not_configured rather than failing', async () => {
        const data = await service.overview();

        expect(data.status).toBe('not_configured');
        expect(data.apiKeyConfigured).toBe(false);
    });

    /** Identifiers are only meaningful alongside a key that uses them. */
    it('withholds the identifiers the supplier knows us by', async () => {
        const data = await service.overview();

        expect(data.clientName).toBeNull();
        expect(data.supplierCode).toBeNull();
        expect(data.contextCode).toBeNull();
    });
});

describe('when the supplier is configured', () => {
    beforeEach(() => {
        cfg.TRAVELGATEX_API_KEY = 'secret-key';
        cfg.TRAVELGATEX_CODE = '38327';
        health.travelgateHealth.mockResolvedValue({ otvStatus: 'active', detail: null });
    });

    it('reports healthy, with the access code but never the key', async () => {
        const data = await service.overview();

        expect(data.status).toBe('healthy');
        expect(data.accessCode).toBe('38327');
        expect(JSON.stringify(data)).not.toContain('secret-key');
    });

    /** One health check feeding both pages, so /tgx-health and this cannot disagree. */
    it('takes the supplier state from the same health check the other page uses', async () => {
        const data = await service.overview();

        expect(health.travelgateHealth).toHaveBeenCalled();
        expect(data.otvStatus).toBe('active');
    });

    /** The supplier being down must not blank the page: our own record is still true. */
    it('still reports our bookings when the health check throws', async () => {
        health.travelgateHealth.mockRejectedValue(new Error('OTV unreachable'));
        db.groupBy.mockResolvedValue([group('confirmed', 3, 300)]);

        const data = await service.overview();

        expect(data.otvStatus).toBe('unknown');
        expect(data.totalBookings).toBe(3);
    });
});

describe('counting what we sold', () => {
    /**
     * `cancelled`, `cancelled_refunded` and `cancelled_refund_failed` are three outcomes of one
     * event. The count is of the event; where the money ended up is the payments page's question.
     */
    it('counts every way a booking was cancelled as one cancellation', async () => {
        db.groupBy.mockResolvedValue([
            group('confirmed', 4, 400),
            group('cancelled', 1, 100),
            group('cancelled_refunded', 2, 200),
            group('cancelled_refund_failed', 1, 100),
        ]);

        const data = await service.overview();

        expect(data.cancelledBookings).toBe(4);
        expect(data.confirmedBookings).toBe(4);
        expect(data.totalBookings).toBe(8);
    });

    it('counts a completed stay as confirmed, not as something else', async () => {
        db.groupBy.mockResolvedValue([group('confirmed', 2, 200), group('completed', 3, 300)]);

        await expect(service.overview()).resolves.toMatchObject({ confirmedBookings: 5 });
    });

    it('sums revenue across every status group', async () => {
        db.groupBy.mockResolvedValue([group('confirmed', 2, 240.5), group('cancelled', 1, 120.37)]);

        await expect(service.overview()).resolves.toMatchObject({ totalRevenue: 360.87 });
    });

    /** A pending booking is neither confirmed nor cancelled, and must not be quietly counted. */
    it('leaves a pending booking out of both tallies but inside the total', async () => {
        db.groupBy.mockResolvedValue([group('pending', 2, 200), group('confirmed', 1, 100)]);

        const data = await service.overview();

        expect(data.totalBookings).toBe(3);
        expect(data.confirmedBookings).toBe(1);
        expect(data.cancelledBookings).toBe(0);
    });
});

describe('the recent rows', () => {
    it('flattens a cancellation of any kind to one word for the page', async () => {
        db.findMany.mockResolvedValue([
            { booking_id: 'CG-1', property_name: 'A', status: 'cancelled_refunded', total_price: 120.37, currency: 'USD', created_at: new Date('2026-11-10T02:00:00Z') },
            { booking_id: 'CG-2', property_name: 'B', status: 'confirmed', total_price: 80, currency: 'USD', created_at: new Date('2026-11-09T02:00:00Z') },
            { booking_id: 'CG-3', property_name: 'C', status: 'payment_pending', total_price: 50, currency: 'USD', created_at: new Date('2026-11-08T02:00:00Z') },
        ]);

        const data = await service.overview();

        expect(data.recentBookings.map(b => b.status)).toEqual(['cancelled', 'confirmed', 'pending']);
    });

    it('takes the revenue currency from what was actually booked', async () => {
        db.findMany.mockResolvedValue([
            { booking_id: 'CG-1', property_name: 'A', status: 'confirmed', total_price: 1000, currency: 'PHP', created_at: new Date() },
        ]);

        await expect(service.overview()).resolves.toMatchObject({ revenueCurrency: 'PHP' });
    });

    it('carries the API log failures through, since that is what the page is for', async () => {
        db.logsFindMany.mockResolvedValue([
            { id: 'l1', endpoint: 'hotelX/search', response_status: 500, duration_ms: 2100, error_message: 'upstream timeout', created_at: new Date('2026-11-10T02:00:00Z') },
        ]);

        const data = await service.overview();

        expect(data.recentApiLogs[0]).toMatchObject({
            endpoint: 'hotelX/search', responseStatus: 500, durationMs: 2100, errorMessage: 'upstream timeout',
        });
    });

    /** A database that will not answer must still render a page, not a stack trace. */
    it('renders with empty lists when the queries fail', async () => {
        db.groupBy.mockRejectedValue(new Error('connection reset'));
        db.findMany.mockRejectedValue(new Error('connection reset'));
        db.logsFindMany.mockRejectedValue(new Error('connection reset'));

        const data = await service.overview();

        expect(data.totalBookings).toBe(0);
        expect(data.recentBookings).toEqual([]);
        expect(data.recentApiLogs).toEqual([]);
    });
});
