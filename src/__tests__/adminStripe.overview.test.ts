import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The headline figures on the money screen.
 *
 * `/admin/stripe` crashed on load with `Cannot read properties of undefined (reading
 * 'totalVolume')`. The page had always read `data.stats`; the service had never returned it.
 * Neither side was tested against the other, so a contract nobody held shipped and stayed broken.
 *
 * What the figures mean is the part worth pinning. They describe **what this page shows** — the
 * most recent payments and refunds — not the account's lifetime totals, which would need
 * pagination through every object Stripe holds. Quietly presenting one as the other is how a
 * number gets into a report that nobody can reconcile.
 */

const sdk = vi.hoisted(() => ({
    balance: vi.fn(), payments: vi.fn(), refunds: vi.fn(), disputes: vi.fn(), payouts: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
    getStripe: () => ({
        balance:        { retrieve: sdk.balance },
        paymentIntents: { list: sdk.payments },
        refunds:        { list: sdk.refunds },
        disputes:       { list: sdk.disputes },
        payouts:        { list: sdk.payouts },
    }),
    stripe: {},
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { AdminStripeService } from '@/services/adminStripe.service';

const service = new AdminStripeService();

const pi = (over: Record<string, unknown> = {}) => ({
    id: 'pi_1', amount: 12037, amount_received: 12037, currency: 'usd', status: 'succeeded',
    created: 1794279009, metadata: {}, latest_charge: null, livemode: false, ...over,
});
const refund = (over: Record<string, unknown> = {}) => ({
    id: 're_1', amount: 12037, currency: 'usd', status: 'succeeded', reason: null,
    created: 1794279100, charge: 'ch_1', ...over,
});
const dispute = (over: Record<string, unknown> = {}) => ({
    id: 'dp_1', amount: 12037, currency: 'usd', status: 'needs_response', reason: 'fraudulent',
    created: 1794279200, livemode: false, ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    sdk.balance.mockResolvedValue({ available: [{ amount: 21519872, currency: 'usd' }], pending: [] });
    sdk.payments.mockResolvedValue({ data: [] });
    sdk.refunds.mockResolvedValue({ data: [] });
    sdk.disputes.mockResolvedValue({ data: [] });
    sdk.payouts.mockResolvedValue({ data: [] });
});

describe('the stats block the page reads', () => {
    /** The crash itself: the field simply was not there. */
    it('is present even when the account has no activity at all', async () => {
        const data = await service.overview();

        expect(data.stats).toEqual({
            totalPayments: 0, succeeded: 0, totalVolume: 0, totalRefunded: 0, openDisputes: 0,
        });
    });

    /** An attempt is not a sale. Counting failures as volume overstates every figure above it. */
    it('counts only succeeded payments as volume, while still reporting how many were shown', async () => {
        sdk.payments.mockResolvedValue({ data: [
            pi({ id: 'pi_a', amount_received: 10000 }),
            pi({ id: 'pi_b', amount_received: 5000 }),
            pi({ id: 'pi_c', status: 'requires_payment_method', amount_received: 0 }),
            pi({ id: 'pi_d', status: 'canceled', amount_received: 0 }),
        ] });

        const data = await service.overview();

        expect(data.stats.totalPayments).toBe(4);
        expect(data.stats.succeeded).toBe(2);
        expect(data.stats.totalVolume).toBe(150);
    });

    /** A hold that is authorised but never captured is not money we have. */
    it('does not count an uncaptured authorisation as volume', async () => {
        sdk.payments.mockResolvedValue({ data: [
            pi({ status: 'requires_capture', amount: 12037, amount_received: 0 }),
        ] });

        await expect(service.overview()).resolves.toMatchObject({ stats: expect.objectContaining({ totalVolume: 0 }) });
    });

    /** A refund that failed did not reach the customer, so it is not money that went back. */
    it('totals only the refunds Stripe reports as succeeded', async () => {
        sdk.refunds.mockResolvedValue({ data: [
            refund({ id: 're_a', amount: 10000 }),
            refund({ id: 're_b', amount: 5000, status: 'pending' }),
            refund({ id: 're_c', amount: 2500, status: 'failed' }),
        ] });

        await expect(service.overview()).resolves.toMatchObject({ stats: expect.objectContaining({ totalRefunded: 100 }) });
    });

    /**
     * A dispute with a deadline is work. One already won or lost is history, and showing it as
     * open sends somebody to answer a case that closed.
     */
    it('counts only disputes that still need a response as open', async () => {
        sdk.disputes.mockResolvedValue({ data: [
            dispute({ id: 'dp_a', status: 'needs_response' }),
            dispute({ id: 'dp_b', status: 'warning_needs_response' }),
            dispute({ id: 'dp_c', status: 'won' }),
            dispute({ id: 'dp_d', status: 'lost' }),
            dispute({ id: 'dp_e', status: 'under_review' }),
        ] });

        await expect(service.overview()).resolves.toMatchObject({ stats: expect.objectContaining({ openDisputes: 2 }) });
    });

    /** Summed in minor units and converted once; adding converted floats drifts by a cent. */
    it('sums in minor units, so the total does not drift', async () => {
        sdk.payments.mockResolvedValue({ data: [
            pi({ id: 'p1', amount_received: 1 }), pi({ id: 'p2', amount_received: 1 }),
            pi({ id: 'p3', amount_received: 1 }), pi({ id: 'p4', amount_received: 1033 }),
        ] });

        await expect(service.overview()).resolves.toMatchObject({ stats: expect.objectContaining({ totalVolume: 10.36 }) });
    });
});

describe('telling the sandbox from the real account', () => {
    /**
     * Read from Stripe's own answer rather than from the key's prefix: a prefix is a claim, and
     * sandbox figures read as the business's money is exactly the confusion to prevent.
     */
    it('reports live mode from what Stripe says about the objects', async () => {
        sdk.payments.mockResolvedValue({ data: [pi({ livemode: true })] });

        await expect(service.overview()).resolves.toMatchObject({ isLive: true });
    });

    it('falls back to disputes when there are no payments to ask', async () => {
        sdk.disputes.mockResolvedValue({ data: [dispute({ livemode: true })] });

        await expect(service.overview()).resolves.toMatchObject({ isLive: true });
    });

    /** An empty account is assumed to be a sandbox, which is the safe direction to be wrong in. */
    it('assumes sandbox when there is nothing to judge by', async () => {
        await expect(service.overview()).resolves.toMatchObject({ isLive: false });
    });
});
