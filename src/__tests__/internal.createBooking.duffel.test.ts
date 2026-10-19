/**
 * POST /internal/create-booking, Duffel path: what it writes once an order and a payment exist.
 *
 * Pins the projection to flight_bookings / flight_segments / passengers / email so it can be
 * moved behind the flight booking lifecycle without changing what a booking looks like.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
    $queryRaw:       vi.fn(),
    $executeRaw:     vi.fn(),
    flight_bookings: { create: vi.fn(), findFirst: vi.fn() },
    flight_segments: { create: vi.fn() },
    passengers:      { create: vi.fn() },
}));
const stripeMock = vi.hoisted(() => ({ paymentIntents: { retrieve: vi.fn(), cancel: vi.fn(), capture: vi.fn() } }));
const getDuffelOrder = vi.hoisted(() => vi.fn());
const sendFlightConfirmationEmail = vi.hoisted(() => vi.fn());
const lockFx = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/stripe', () => ({ stripe: stripeMock }));
vi.mock('@/lib/flights/duffel', () => ({ getDuffelOrder }));
vi.mock('@/lib/flights/mystifly', () => ({ mystiflyRequest: vi.fn() }));
vi.mock('@/lib/flights/search', () => ({ searchFlights: vi.fn(), saveSearch: vi.fn() }));
vi.mock('@/lib/email/flightConfirmation', () => ({ sendFlightConfirmationEmail }));
vi.mock('@/lib/payments/fxLock', () => ({ lockFx }));

import internalRouter from '@/routes/internal.route';

const SESSION_ID = '5e55e55e-0000-0000-0000-000000000001';

const STORED_FLIGHT = {
    tripType: 'round-trip',
    segments: [
        { origin: 'MNL', destination: 'NRT', departure: { time: '2026-12-01T08:00:00Z' }, arrival: { time: '2026-12-01T13:00:00Z' }, airline: { code: 'PR' }, flightNumber: 'PR428' },
    ],
};

const SESSION = {
    id: SESSION_ID,
    user_id: 'u-1',
    provider: 'duffel',
    flight: STORED_FLIGHT,
    passengers: [
        { firstName: 'Juan', lastName: 'Cruz', type: 'ADT', passport: { number: 'P123' } },
        { firstName: 'Ana', lastName: 'Cruz', type: 'child' },
    ],
    contact: { email: 'juan@example.com' },
    payment_intent_id: 'pi_1',
    fare_policy: { isRefundable: false },
    duffel_pre_order_id: 'ord_1',
    duffel_pre_order_pnr: 'ABC123',
    duffel_pre_order_tickets: ['1251234567890', '1251234567891'],
    duffel_pre_order_ticketed: true,
    currency: 'USD',
    original_price: '100.00',
    charged_price: '112.00',
};

/** The order Duffel holds: its itinerary is what the segments are written from. */
const BOOKED_ORDER = {
    id: 'ord_1',
    slices: [{
        segments: [{
            origin: { iata_code: 'MNL' }, destination: { iata_code: 'HND' },
            departing_at: '2026-12-01T09:00:00Z', arriving_at: '2026-12-01T14:00:00Z',
            marketing_carrier: { iata_code: 'PR' }, operating_carrier: { iata_code: 'PR', name: 'Philippine Airlines' },
            marketing_carrier_flight_number: '432',
        }],
    }],
};

function handler() {
    const layer = (internalRouter as any).stack.find((l: any) => l.route?.path === '/create-booking' && l.route.methods.post);
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle as (req: any, res: any) => Promise<unknown>;
}

function fakeRes() {
    const res: any = { statusCode: 200, body: undefined };
    res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
    res.json = vi.fn((b: unknown) => { res.body = b; return res; });
    return res;
}

async function createBooking() {
    const res = fakeRes();
    await handler()({ body: { sessionId: SESSION_ID }, headers: {} }, res);
    return res;
}

const executed = () => db.$executeRaw.mock.calls.map((c) => (c[0] as TemplateStringsArray).join('?'));

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    db.$queryRaw.mockResolvedValue([SESSION]);
    db.$executeRaw.mockResolvedValue(1);
    db.flight_bookings.create.mockResolvedValue({ id: 'bk-1' });
    db.flight_segments.create.mockResolvedValue({});
    db.passengers.create.mockResolvedValue({});
    stripeMock.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_1', amount: 11200, currency: 'usd' });
    getDuffelOrder.mockResolvedValue(BOOKED_ORDER);
    sendFlightConfirmationEmail.mockResolvedValue(undefined);
    lockFx.mockResolvedValue({ usd_amount: 112, fx_rate: 1, fx_captured_at: new Date('2026-10-19T00:00:00Z'), fx_source: 'identity' });
});

describe('create-booking, Duffel', () => {
    it('answers with the booking, at the price the payment was taken for', async () => {
        const res = await createBooking();
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
            success: true, bookingId: 'bk-1', pnr: 'ABC123', status: 'ticketed',
            confirmedPrice: 112, confirmedCurrency: 'USD',
        });
    });

    it('writes the booking from the order and the payment', async () => {
        await createBooking();
        expect(db.flight_bookings.create).toHaveBeenCalledTimes(1);
        expect(db.flight_bookings.create.mock.calls[0][0].data).toMatchObject({
            user_id:            'u-1',
            session_id:         SESSION_ID,
            provider:           'duffel',
            pnr:                'ABC123',
            status:             'ticketed',
            total_price:        112,
            currency:           'USD',
            payment_intent_id:  'pi_1',
            confirmed_price:    112,
            confirmed_currency: 'USD',
            charged_price:      112,
            supplier_cost:      100,
            provider_order_id:  'ord_1',
            duffel_order_id:    'ord_1',
            ticket_numbers:     ['1251234567890', '1251234567891'],
            fare_policy:        { isRefundable: false },
            trip_type:          'round-trip',
            usd_amount:         112,
            fx_rate:            1,
            fx_source:          'identity',
        });
        expect(lockFx).toHaveBeenCalledWith(112, 'USD');
    });

    it('scales the amount by the currency — a zero-decimal charge is not divided by a hundred', async () => {
        stripeMock.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_1', amount: 150000, currency: 'krw' });
        const res = await createBooking();
        expect(res.body).toMatchObject({ confirmedPrice: 150000, confirmedCurrency: 'KRW' });
    });

    it('falls back to the session\'s figures when the payment cannot be read', async () => {
        stripeMock.paymentIntents.retrieve.mockRejectedValue(new Error('stripe down'));
        const res = await createBooking();
        expect(res.body).toMatchObject({ success: true, confirmedPrice: 112, confirmedCurrency: 'USD' });
    });

    it('marks an order without tickets as awaiting them', async () => {
        db.$queryRaw.mockResolvedValue([{ ...SESSION, duffel_pre_order_ticketed: false, duffel_pre_order_tickets: [] }]);
        const res = await createBooking();
        expect(res.body.status).toBe('awaiting_ticket');
        expect(db.flight_bookings.create.mock.calls[0][0].data.ticket_numbers).toEqual([]);
    });

    it('writes the segments the airline is holding, not the ones the traveller selected', async () => {
        await createBooking();
        expect(getDuffelOrder).toHaveBeenCalledWith('ord_1');
        expect(db.flight_segments.create).toHaveBeenCalledTimes(1);
        expect(db.flight_segments.create.mock.calls[0][0].data).toMatchObject({
            booking_id: 'bk-1', airline: 'PR', flight_number: 'PR432', origin: 'MNL', destination: 'HND',
            departure: new Date('2026-12-01T09:00:00Z'), arrival: new Date('2026-12-01T14:00:00Z'),
        });
    });

    it('falls back to the stored itinerary when the order cannot be read', async () => {
        getDuffelOrder.mockRejectedValue(new Error('duffel down'));
        await createBooking();
        expect(db.flight_segments.create.mock.calls[0][0].data).toMatchObject({
            airline: 'PR', flight_number: 'PR428', destination: 'NRT', departure: new Date('2026-12-01T08:00:00Z'),
        });
    });

    it('writes each passenger with their ticket, by position', async () => {
        await createBooking();
        expect(db.passengers.create.mock.calls.map((c) => c[0].data)).toEqual([
            { booking_id: 'bk-1', first_name: 'Juan', last_name: 'Cruz', type: 'ADT', ticket_number: '1251234567890', passport: 'P123' },
            { booking_id: 'bk-1', first_name: 'Ana', last_name: 'Cruz', type: 'CHD', ticket_number: '1251234567891', passport: null },
        ]);
    });

    it('completes the session and sends the confirmation', async () => {
        await createBooking();
        expect(executed().some((s) => /SET status = 'completed', completed_at = NOW\(\)/.test(s))).toBe(true);
        expect(sendFlightConfirmationEmail).toHaveBeenCalledWith('bk-1');
    });

    it('still answers success when the confirmation email fails', async () => {
        sendFlightConfirmationEmail.mockRejectedValue(new Error('smtp down'));
        const res = await createBooking();
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('refuses a session with no order, and fails it', async () => {
        db.$queryRaw.mockResolvedValue([{ ...SESSION, duffel_pre_order_id: null }]);
        const res = await createBooking();
        expect(res.statusCode).toBe(400);
        expect(db.flight_bookings.create).not.toHaveBeenCalled();
        expect(executed().some((s) => /SET status = 'failed'/.test(s))).toBe(true);
    });
});
