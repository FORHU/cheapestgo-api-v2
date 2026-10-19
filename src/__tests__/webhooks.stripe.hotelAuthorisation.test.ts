import { describe, it, expect, vi, beforeEach } from 'vitest';

const completeFromPayment = vi.hoisted(() => vi.fn());
const constructEvent = vi.hoisted(() => vi.fn());

vi.mock('@/config', () => ({ config: { STRIPE_WEBHOOK_SECRET: 'whsec_test', DUFFEL_WEBHOOK_SECRET: 'x', DUFFEL_ACCESS_TOKEN: 'x' } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
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
vi.mock('@/services/hotels.service', () => ({
    HotelsService: class { completeFromPayment = completeFromPayment; },
}));

import router from '@/routes/webhooks.route';

/** The last handler on POST /stripe, past the raw-body parser. */
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

const event = (metadata: Record<string, string>) => ({
    id: 'evt_1',
    type: 'payment_intent.amount_capturable_updated',
    data: { object: { id: 'pi_1', metadata } },
});

async function deliver(metadata: Record<string, string>) {
    constructEvent.mockReturnValue(event(metadata));
    const res = fakeRes();
    await stripeHandler()({ headers: { 'stripe-signature': 'sig' }, body: Buffer.from('{}') }, res);
    return res;
}

beforeEach(() => {
    vi.clearAllMocks();
    completeFromPayment.mockResolvedValue({ handled: true, completed: true });
});

describe('POST /stripe — payment_intent.amount_capturable_updated', () => {
    it('completes a hotel booking from the authorisation', async () => {
        const res = await deliver({ type: 'hotel' });

        expect(completeFromPayment).toHaveBeenCalledWith('pi_1');
        expect(res.body).toEqual({ received: true });
    });

    it('does the same for a hotel bundled with a flight', async () => {
        await deliver({ type: 'hotel_bundle' });
        expect(completeFromPayment).toHaveBeenCalledWith('pi_1');
    });

    it('leaves every other kind of payment alone', async () => {
        // Flights have their own completion: webhooks.stripe.flightAuthorisation.test.ts.
        const res = await deliver({ type: 'golf' });

        expect(completeFromPayment).not.toHaveBeenCalled();
        expect(res.body).toEqual({ received: true });
    });

    it('acknowledges the event even when completion fails, so Stripe does not retry it', async () => {
        completeFromPayment.mockRejectedValue(new Error('boom'));

        const res = await deliver({ type: 'hotel' });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ received: true });
    });
});
