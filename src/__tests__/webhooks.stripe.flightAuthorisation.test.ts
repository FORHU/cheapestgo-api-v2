import { describe, it, expect, vi, beforeEach } from 'vitest';

const flightComplete = vi.hoisted(() => vi.fn());
const hotelComplete = vi.hoisted(() => vi.fn());
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
vi.mock('@/services/hotels.service', () => ({
    HotelsService: class { completeFromPayment = hotelComplete; },
}));
vi.mock('@/services/flightBookingLifecycle.service', () => ({
    FlightBookingLifecycleService: class { completeFromPayment = flightComplete; },
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

const intent = (metadata: Record<string, string>) => ({ id: 'pi_1', capture_method: 'manual', metadata });

async function deliver(metadata: Record<string, string>) {
    constructEvent.mockReturnValue({
        id: 'evt_1', type: 'payment_intent.amount_capturable_updated', data: { object: intent(metadata) },
    });
    const res = fakeRes();
    await stripeHandler()({ headers: { 'stripe-signature': 'sig' }, body: Buffer.from('{}') }, res);
    return res;
}

beforeEach(() => {
    vi.clearAllMocks();
    flightComplete.mockResolvedValue({ handled: true, outcome: 'confirmed' });
    hotelComplete.mockResolvedValue({ handled: true, completed: true });
});

describe('POST /stripe — a flight payment was authorised', () => {
    it('completes the flight booking from the authorisation — the traveller may have closed the tab', async () => {
        const res = await deliver({ type: 'flight', bookingSessionId: 'sess-1' });

        expect(flightComplete).toHaveBeenCalledWith(intent({ type: 'flight', bookingSessionId: 'sess-1' }));
        expect(hotelComplete).not.toHaveBeenCalled();
        expect(res.body).toEqual({ received: true });
    });

    it('does the same for a flight bundled with a hotel — the hotel half completes on its own payment', async () => {
        await deliver({ type: 'flight_bundle', bookingSessionId: 'sess-1', bundleHotelId: 'h1' });
        expect(flightComplete).toHaveBeenCalledTimes(1);
        expect(hotelComplete).not.toHaveBeenCalled();
    });

    it('does not send a hotel payment to the flight completion', async () => {
        await deliver({ type: 'hotel' });
        expect(flightComplete).not.toHaveBeenCalled();
        expect(hotelComplete).toHaveBeenCalledWith('pi_1');
    });

    it('logs a completion that throws and acknowledges the event, so Stripe does not retry the same attempt', async () => {
        flightComplete.mockRejectedValue(new Error('boom'));

        const res = await deliver({ type: 'flight', bookingSessionId: 'sess-1' });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ received: true });
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringMatching(/flight booking/i),
            expect.objectContaining({ paymentIntentId: 'pi_1', message: 'boom' }),
        );
    });
});
