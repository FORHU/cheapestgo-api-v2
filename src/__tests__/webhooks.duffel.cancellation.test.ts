import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const syncSupplierCancellation = vi.hoisted(() => vi.fn());
const getDuffelOrder = vi.hoisted(() => vi.fn());
const executeRaw = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const SECRET = vi.hoisted(() => 'duffel_webhook_secret');

vi.mock('@/config', () => ({ config: { DUFFEL_WEBHOOK_SECRET: SECRET, DUFFEL_ACCESS_TOKEN: 'duffel_test_x', STRIPE_WEBHOOK_SECRET: 'x' } }));
vi.mock('@/lib/logger', () => ({ logger }));
vi.mock('@/lib/stripe', () => ({ stripe: { webhooks: { constructEvent: vi.fn() }, refunds: { create: vi.fn() } } }));
vi.mock('@/lib/prisma', () => ({
    prisma: {
        $executeRaw:     executeRaw,
        $queryRaw:       vi.fn().mockResolvedValue([]),
        flight_bookings: { findFirst: vi.fn().mockResolvedValue(null) },
    },
}));
vi.mock('@/lib/flights/duffelTickets', () => ({ ticketNumbersFrom: vi.fn().mockReturnValue(['1251234567890']) }));
vi.mock('@/lib/flights/duffel', () => ({ duffelHeaders: vi.fn(), getDuffelOrder }));
vi.mock('@/lib/email/flightConfirmation', () => ({ sendFlightConfirmationEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/services/flights.service', () => ({
    FlightsService: class { syncSupplierCancellation = syncSupplierCancellation; },
}));

import router from '@/routes/webhooks.route';

function duffelHandler() {
    const layer = (router as any).stack.find((l: any) => l.route?.path === '/flight-supplier' && l.route.methods.post);
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle as (req: any, res: any) => Promise<unknown>;
}

function fakeRes() {
    const res: any = { statusCode: 200, body: undefined };
    res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
    res.json = vi.fn((b: unknown) => { res.body = b; return res; });
    return res;
}

/** A delivery as Duffel sends it: the resource at `data.object`, signed `t=…,v1=…`. */
async function deliver(type: string, object: Record<string, unknown>) {
    const body = Buffer.from(JSON.stringify({
        id: 'wev_1', type, live_mode: false, idempotency_key: 'idem', created_at: '2026-11-06T10:00:00Z',
        data: { object },
    }));
    const t = '1762423200';
    const v1 = crypto.createHmac('sha256', SECRET).update(`${t}.${body.toString('utf8')}`).digest('hex');
    const res = fakeRes();
    await duffelHandler()({ headers: { 'x-duffel-signature': `t=${t},v1=${v1}` }, body }, res);
    return res;
}

beforeEach(() => {
    vi.clearAllMocks();
    syncSupplierCancellation.mockResolvedValue({ changed: true, status: 'refunded' });
});

describe('POST /flight-supplier — an order cancelled at Duffel', () => {
    it('settles the booking from a confirmed cancellation, read from data.object', async () => {
        const res = await deliver('order_cancellation.confirmed', { id: 'ore_1', order_id: 'ord_1', refund_amount: '100.00' });

        expect(res.statusCode).toBe(200);
        expect(syncSupplierCancellation).toHaveBeenCalledWith('ord_1');
    });

    it('does not mark a cancelled order ticketed when Duffel says the order changed', async () => {
        getDuffelOrder.mockResolvedValue({ id: 'ord_1', cancelled_at: '2026-11-06T10:00:00Z', documents: [{ type: 'electronic_ticket', unique_identifier: '125' }] });

        await deliver('air.order.changed', { id: 'ord_1' });

        expect(syncSupplierCancellation).toHaveBeenCalledWith('ord_1');
        expect(executeRaw).not.toHaveBeenCalled();
    });

    it('still syncs a live order\'s tickets from an order change', async () => {
        getDuffelOrder.mockResolvedValue({ id: 'ord_1', cancelled_at: null, documents: [] });

        await deliver('air.order.changed', { id: 'ord_1' });

        expect(syncSupplierCancellation).not.toHaveBeenCalled();
        expect(executeRaw).toHaveBeenCalledTimes(1);
    });

    it('rejects an unsigned delivery', async () => {
        const res = fakeRes();
        await duffelHandler()({ headers: {}, body: Buffer.from('{}') }, res);

        expect(res.statusCode).toBe(401);
        expect(syncSupplierCancellation).not.toHaveBeenCalled();
    });
});
