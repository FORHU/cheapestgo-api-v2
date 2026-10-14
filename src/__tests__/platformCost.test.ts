import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({ prismaMock: { $queryRaw: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { reconcilePlatformCost, DUFFEL_PAID_ORDER_USD } from '@/lib/admin/platformCost';
import { STRIPE_RATE } from '@/lib/pricing';

/**
 * Whether a month's markup covered what the month cost to serve. This is the loop that was
 * missing when a 4% flight markup sat below a 4.017% break-even for months — the only thing
 * that surfaced it was an invoice screenshot arriving by chance.
 *
 * The arithmetic is what is checked here, not the SQL: the two queries are stubbed with the
 * shapes they return.
 */

const scoped = (over: Record<string, number> = {}) => ({
    orders: 30, cancelled: 6, staff_orders: 0,
    markup_retained_usd: 900, charged_usd: 12_000, supplier_usd: 11_000, charged_retained_usd: 9_600,
    ...over,
});

const fees = (over: Record<string, number> = {}) => ({
    recorded_count: 30, recorded_usd: 528, gross_usd: 12_000, non_usd: 0, ...over,
});

const stub = (s = scoped(), f = fees()) => {
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRaw.mockResolvedValueOnce([s]).mockResolvedValueOnce([f]);
};

beforeEach(() => vi.clearAllMocks());

describe('reconcilePlatformCost', () => {
    it('nets the markup against what Stripe and Duffel really took', async () => {
        stub();

        const r = await reconcilePlatformCost('2026-08');

        // 30 orders × $3.00 + 1% of $11,000 supplier value.
        expect(r.duffelExpectedUsd).toBe(30 * DUFFEL_PAID_ORDER_USD + 110);
        expect(r.netUsd).toBe(900 - 528 - r.duffelExpectedUsd);
    });

    it('prefers the recorded fee over the estimate', async () => {
        stub();

        const r = await reconcilePlatformCost('2026-08');

        expect(r.stripeFeeRecordedUsd).toBe(528);
        expect(r.stripeFeeEstimatedUsd).not.toBe(r.stripeFeeRecordedUsd);
        // The net is built from the recorded figure, not the assumed one.
        expect(r.netUsd).toBe(900 - r.stripeFeeRecordedUsd - r.duffelExpectedUsd);
    });

    it('falls back to the estimate for a month with nothing recorded', async () => {
        // Bookings taken before fee recording shipped will never have one, and a month with
        // no number at all is worse than a month with an approximate one.
        stub(scoped(), fees({ recorded_count: 0, recorded_usd: 0, gross_usd: 0 }));

        const r = await reconcilePlatformCost('2026-06');

        expect(r.stripeRateObserved).toBeNull();
        expect(r.netUsd).toBe(900 - r.stripeFeeEstimatedUsd - r.duffelExpectedUsd);
    });

    it('reports no cancellation rate when there are too few orders to mean one', async () => {
        stub(scoped({ orders: 3, cancelled: 1 }));

        const r = await reconcilePlatformCost('2026-08');

        expect(r.cancellationRate).toBeNull();
        expect(r.caveats.join(' ')).toContain('too few');
    });

    it('flags a Stripe rate that has drifted from what pricing assumes', async () => {
        // 2.9% settled against a configured rate is the failure that hid the original problem.
        stub(scoped(), fees({ recorded_usd: 348, gross_usd: 12_000 }));

        const r = await reconcilePlatformCost('2026-08');

        expect(r.stripeRateObserved).toBe(0.029);
        expect(r.stripeRateConfigured).toBe(STRIPE_RATE);
        expect(r.caveats.join(' ')).toContain('retune STRIPE_RATE');
    });

    it('excludes staff bookings but says it did', async () => {
        stub(scoped({ orders: 28, staff_orders: 2 }));

        const r = await reconcilePlatformCost('2026-08');

        expect(r.orders).toBe(28);
        expect(r.staffOrdersExcluded).toBe(2);
        expect(r.caveats.join(' ')).toContain('staff booking');
    });

    it('flags fees that settled in another currency rather than converting them silently', async () => {
        stub(scoped(), fees({ non_usd: 3 }));

        const r = await reconcilePlatformCost('2026-08');

        expect(r.caveats.join(' ')).toContain('non-USD');
    });

    it('defaults to last month, since Duffel bills in arrears', async () => {
        stub();
        const now = new Date();
        const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

        const r = await reconcilePlatformCost();

        expect(r.month).toBe(`${expected.getUTCFullYear()}-${String(expected.getUTCMonth() + 1).padStart(2, '0')}`);
    });
});
