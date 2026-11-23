import { describe, it, expect, vi, beforeEach } from 'vitest';

const settle = vi.hoisted(() => vi.fn());
const constructEvent = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock('@/config', () => ({ config: { STRIPE_WEBHOOK_SECRET: 'whsec_test', DUFFEL_WEBHOOK_SECRET: 'x', DUFFEL_ACCESS_TOKEN: 'x' } }));
vi.mock('@/lib/logger', () => ({ logger }));
vi.mock('@/lib/stripe', () => ({ stripe: { webhooks: { constructEvent }, refunds: { create: vi.fn() } } }));
vi.mock('@/lib/prisma', () => ({
    prisma: {
        stripe_processed_events: {
            create:     vi.fn().mockResolvedValue({}),
            findUnique: vi.fn().mockResolvedValue(null),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        bookings: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        $executeRaw: vi.fn(),
    },
}));
vi.mock('@/lib/flights/duffelTickets', () => ({ ticketNumbersFrom: vi.fn() }));
vi.mock('@/lib/flights/duffel', () => ({ duffelHeaders: vi.fn() }));
vi.mock('@/lib/email/flightConfirmation', () => ({ sendFlightConfirmationEmail: vi.fn() }));
vi.mock('@/services/flightRefundFailure', () => ({ settleFailedFlightRefund: settle }));

import router from '@/routes/webhooks.route';

/**
 * Stripe reports a refund that failed after it was accepted as `refund.failed`, and — on API
 * versions before that event existed — as `charge.refund.updated` with status `failed`. Either one
 * reaches the same settlement (BUG-1); the second is not mistaken for every other refund update.
 */

function stripeHandler() {
    const layer = (router as any).stack.find((l: any) => l.route?.path === '/stripe' && l.route.methods.post);
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle as (req: any, res: any) => Promise<unknown>;
}

function fakeRes() {
    const res: any = { statusCode: 200, body: undefined };
    res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
    res.json = vi.fn((b: unknown) => { res.body = b; return res; });
    return res;
}

const refund = (status: string) => ({ id: 're_1', object: 'refund', status, payment_intent: 'pi_1', amount: 24620, currency: 'usd' });

async function deliver(type: string, status: string) {
    constructEvent.mockReturnValue({ id: `evt_${type}_${status}`, type, data: { object: refund(status) } });
    const res = fakeRes();
    await stripeHandler()({ headers: { 'stripe-signature': 'sig' }, body: Buffer.from('{}') }, res);
    return res;
}

beforeEach(() => {
    vi.clearAllMocks();
    settle.mockResolvedValue({ handled: true, bookingId: 'fb-1', status: 'refund_failed' });
});

describe('POST /stripe — a refund failed after it was accepted', () => {
    it('settles it on refund.failed', async () => {
        const res = await deliver('refund.failed', 'failed');

        expect(settle).toHaveBeenCalledWith(refund('failed'));
        expect(res.body).toEqual({ received: true });
    });

    it('settles it on charge.refund.updated when the refund has failed', async () => {
        await deliver('charge.refund.updated', 'failed');

        expect(settle).toHaveBeenCalledWith(refund('failed'));
    });

    it('leaves every other refund update alone', async () => {
        await deliver('charge.refund.updated', 'succeeded');

        expect(settle).not.toHaveBeenCalled();
    });

    it('answers 500 when settling it fails, so Stripe delivers it again', async () => {
        settle.mockRejectedValue(new Error('db down'));

        const res = await deliver('refund.failed', 'failed');

        expect(res.statusCode).toBe(500);
    });
});
