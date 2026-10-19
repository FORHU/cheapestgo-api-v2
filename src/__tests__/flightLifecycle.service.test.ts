import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));
vi.mock('@/lib/stripe', () => ({
    stripe: { paymentIntents: { capture: vi.fn(), retrieve: vi.fn(), cancel: vi.fn() } },
}));
vi.mock('@/lib/flights/duffel', () => ({
    getDuffelOffer:          vi.fn(),
    placeDuffelOrder:        vi.fn(),
    ORDER_CREATE_TIMEOUT_MS: 130_000,
}));
vi.mock('@/lib/flights/duffelOrderReconcile', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/flights/duffelOrderReconcile')>()),
    findOrderFromTimedOutAttempt: vi.fn(),
}));
vi.mock('@/lib/hotels/supplierAttempt', () => ({
    startSupplierAttempt:  vi.fn(),
    finishSupplierAttempt: vi.fn(),
}));
vi.mock('@/services/flightBookingCompletion', () => ({ completeDuffelBooking: vi.fn() }));

import { stripe } from '@/lib/stripe';
import { getDuffelOffer, placeDuffelOrder } from '@/lib/flights/duffel';
import { findOrderFromTimedOutAttempt } from '@/lib/flights/duffelOrderReconcile';
import { startSupplierAttempt, finishSupplierAttempt } from '@/lib/hotels/supplierAttempt';
import { completeDuffelBooking } from '@/services/flightBookingCompletion';
import { applyMarkup, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import { FlightBookingLifecycleService } from '@/services/flightBookingLifecycle.service';
import type { FlightBookingLifecycleRepository, FlightLifecycleRecord } from '@/repositories/flightBookingLifecycle.repository';
import type { FlightsRepository } from '@/repositories/flights.repository';

const SESSION = '5e55e55e-0000-0000-0000-000000000001';
const PI = 'pi_1';
const AUTHORISED = 11160;

const OFFER = {
    id: 'off_1',
    total_amount: '100.00',
    total_currency: 'USD',
    passengers: [{ id: 'pas_1' }],
    available_services: [{ id: 'seat_1', total_amount: '15.00' }],
    slices: [{ segments: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'NRT' } }] }],
};

const SESSION_ROW = {
    id: SESSION,
    user_id: 'u-1',
    provider: 'duffel',
    flight: { _offerId: 'off_1', segments: [] },
    passengers: [{ firstName: 'Juan', lastName: 'Cruz', birthDate: '1990-01-01', gender: 'M', type: 'ADT' }],
    contact: { email: 'juan@example.com', phone: '+639171234567' },
    payment_intent_id: PI,
    capture_method: 'manual',
    seat_service_ids: [],
    bag_service_ids: [],
    original_price: 100,
    charged_price: 111.6,
    currency: 'usd',
};

const ORDER = {
    id: 'ord_1',
    booking_reference: 'ABC123',
    total_amount: '100.00',
    total_currency: 'USD',
    created_at: '2026-10-19T00:00:00Z',
    documents: [{ type: 'electronic_ticket', unique_identifier: '1251234567890' }],
};

const intent = (over: Record<string, unknown> = {}) => ({
    id: PI, status: 'requires_capture', amount: AUTHORISED, amount_capturable: AUTHORISED, currency: 'usd',
    metadata: { bookingSessionId: SESSION, type: 'flight' }, ...over,
});

function record(over: Partial<FlightLifecycleRecord> = {}): FlightLifecycleRecord {
    return {
        sessionId: SESSION, userId: 'u-1', provider: 'duffel', status: 'SUPPLIER_BOOKING',
        paymentIntentId: PI, captureMethod: 'manual',
        createdAt: new Date('2026-10-19T00:00:00Z'), updatedAt: new Date('2026-10-19T00:00:00Z'),
        failureCode: null, failureMessage: null, supplierOrderId: null,
        ...over,
    };
}

function fakeLifecycle() {
    return {
        begin: vi.fn(), transition: vi.fn().mockResolvedValue('applied'), note: vi.fn().mockResolvedValue(undefined),
        findBySession: vi.fn().mockResolvedValue(record()), findByPaymentIntent: vi.fn().mockResolvedValue(record()),
        findAbandoned: vi.fn().mockResolvedValue([]), findNeedingAttention: vi.fn().mockResolvedValue([]),
        events: vi.fn().mockResolvedValue([]),
    };
}

function fakeSessions() {
    return {
        getBookingSession:         vi.fn().mockResolvedValue(SESSION_ROW),
        getFlightBookingBySession: vi.fn().mockResolvedValue(null),
        lockSessionForBooking:     vi.fn().mockResolvedValue(true),
        setSessionStatus:          vi.fn().mockResolvedValue(undefined),
    };
}

let lifecycle: ReturnType<typeof fakeLifecycle>;
let sessions: ReturnType<typeof fakeSessions>;
let svc: FlightBookingLifecycleService;

const transitions = () => lifecycle.transition.mock.calls.map((c) => `${[c[1]].flat().join('|')}→${c[2]}`);
const lastTransition = () => lifecycle.transition.mock.calls[lifecycle.transition.mock.calls.length - 1];
const complete = (over: Record<string, unknown> = {}) =>
    svc.complete({ sessionId: SESSION, paymentIntentId: PI, actor: 'browser', userId: 'u-1', ...over });

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    lifecycle = fakeLifecycle();
    sessions = fakeSessions();
    svc = new FlightBookingLifecycleService(
        lifecycle as unknown as FlightBookingLifecycleRepository,
        sessions as unknown as FlightsRepository,
        { settleTimeoutMs: 30, settlePollMs: 5, captureRetryMs: 0 },
    );

    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue(intent() as any);
    vi.mocked(stripe.paymentIntents.capture).mockResolvedValue(intent({ status: 'succeeded' }) as any);
    vi.mocked(stripe.paymentIntents.cancel).mockResolvedValue(intent({ status: 'canceled' }) as any);
    vi.mocked(getDuffelOffer).mockResolvedValue(OFFER);
    vi.mocked(placeDuffelOrder).mockResolvedValue({
        kind: 'success', order: ORDER, finalTotal: '100.00', finalCurrency: 'USD', usedOffer: OFFER,
    });
    vi.mocked(findOrderFromTimedOutAttempt).mockResolvedValue(null);
    vi.mocked(startSupplierAttempt).mockResolvedValue('attempt-1');
    vi.mocked(completeDuffelBooking).mockResolvedValue({
        bookingId: 'bk-1', pnr: 'ABC123', status: 'ticketed', confirmedPrice: 111.6, confirmedCurrency: 'USD',
    });
});

// ── The happy path ─────────────────────────────────────────────────────────────

describe('an order the airline accepts', () => {
    it('authorises, claims, orders, captures, then records the sale', async () => {
        const out = await complete();

        expect(out).toEqual({ kind: 'confirmed', bookingId: 'bk-1', pnr: 'ABC123', status: 'ticketed' });
        expect(transitions()).toEqual([
            'PAYMENT_PENDING→PAYMENT_AUTHORIZED',
            'PAYMENT_AUTHORIZED→SUPPLIER_BOOKING',
            'SUPPLIER_BOOKING→CONFIRMED',
        ]);
        expect(lastTransition()[3]).toMatchObject({ actor: 'browser', patch: { supplierOrderId: 'ord_1' } });
    });

    it('orders the offer the session stored, for the passengers the session stored', async () => {
        await complete();

        expect(getDuffelOffer).toHaveBeenCalledWith('off_1');
        const params = vi.mocked(placeDuffelOrder).mock.calls[0][0];
        expect(params).toMatchObject({
            rawOffer: OFFER,
            total: '100.00',
            currency: 'USD',
            confirmedPrice: 100,
            passengers: [{ id: 'pas_1', given_name: 'Juan', family_name: 'Cruz', phone_number: '+639171234567', email: 'juan@example.com' }],
        });
    });

    it('prices the seats and bags the session chose from the offer, not from anything the browser said', async () => {
        sessions.getBookingSession.mockResolvedValue({ ...SESSION_ROW, seat_service_ids: ['seat_1'], original_price: 115 });
        await complete();
        expect(vi.mocked(placeDuffelOrder).mock.calls[0][0]).toMatchObject({ total: '115.00', seatServiceIds: ['seat_1'], confirmedPrice: 115 });
    });

    it('keys the order to this attempt, so a corrected retry is never answered with an earlier one', async () => {
        await complete();
        expect(vi.mocked(placeDuffelOrder).mock.calls[0][0].idempotencyKey).toBe(`flight-order-${SESSION}`);
    });

    it('records the supplier call before it is made, and closes it after', async () => {
        await complete();

        expect(startSupplierAttempt).toHaveBeenCalledWith({ provider: 'duffel', operation: 'book', clientReference: SESSION });
        expect(vi.mocked(startSupplierAttempt).mock.invocationCallOrder[0])
            .toBeLessThan(vi.mocked(placeDuffelOrder).mock.invocationCallOrder[0]);
        expect(finishSupplierAttempt).toHaveBeenCalledWith('attempt-1', expect.objectContaining({ status: 'confirmed', supplierReference: 'ord_1' }));
    });

    it('captures the whole authorisation, once, under a key for this attempt', async () => {
        await complete();
        expect(stripe.paymentIntents.capture).toHaveBeenCalledTimes(1);
        expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(PI, {}, { idempotencyKey: `flight-capture-${SESSION}` });
    });

    it('records the sale only after the money is taken', async () => {
        await complete();

        expect(completeDuffelBooking).toHaveBeenCalledWith({
            session: SESSION_ROW,
            paymentIntentId: PI,
            order: { orderId: 'ord_1', pnr: 'ABC123', tickets: ['1251234567890'], isTicketed: true },
        });
        expect(vi.mocked(stripe.paymentIntents.capture).mock.invocationCallOrder[0])
            .toBeLessThan(vi.mocked(completeDuffelBooking).mock.invocationCallOrder[0]);
    });

    it('never voids a payment it has captured', async () => {
        await complete();
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });
});

// ── Price moved after authorisation ────────────────────────────────────────────

describe('a price that moved after the card was authorised', () => {
    it('captures less when the airline charged less', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({
            kind: 'success', order: { ...ORDER, total_amount: '90.00' }, finalTotal: '90.00', finalCurrency: 'USD', usedOffer: OFFER,
        });

        await complete();

        const expected = Math.round(AUTHORISED
            * applyMarkup(90, FLIGHT_MARKUP_SPEC).chargedPrice
            / applyMarkup(100, FLIGHT_MARKUP_SPEC).chargedPrice);
        expect(expected).toBeLessThan(AUTHORISED);
        expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(
            PI, { amount_to_capture: expected }, { idempotencyKey: `flight-capture-${SESSION}` },
        );
    });

    it('never captures more than was authorised when the airline charged a little more', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({
            kind: 'success', order: { ...ORDER, total_amount: '101.50' }, finalTotal: '101.50', finalCurrency: 'USD', usedOffer: OFFER,
        });

        const out = await complete();

        expect(out.kind).toBe('confirmed');
        expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(PI, {}, expect.anything());
    });

    it('releases the hold and says so when the price went up beyond tolerance', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({ kind: 'price_changed', oldPrice: 100, newPrice: 140, currency: 'USD' });

        const out = await complete();

        expect(out).toMatchObject({
            kind: 'failed', code: 'PRICE_CHANGED',
            details: { oldPrice: 100, newPrice: 140, currency: 'USD' },
        });
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI);
        expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
        expect(lastTransition().slice(1, 3)).toEqual(['SUPPLIER_BOOKING', 'FAILED']);
        expect(lastTransition()[3]).toMatchObject({ patch: { failureCode: 'PRICE_CHANGED' } });
    });
});

// ── Definitive refusals ────────────────────────────────────────────────────────

describe('an airline that said no', () => {
    it('releases the hold on a refusal and records why', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({
            kind: 'error', status: 400, data: { errors: [{ code: 'invalid', message: 'given_name is invalid' }] },
        });

        const out = await complete();

        expect(out).toMatchObject({ kind: 'failed', code: 'DUFFEL_ORDER_FAILED' });
        expect((out as { message: string }).message).toMatch(/given_name is invalid/);
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI);
        expect(transitions()).toContain('SUPPLIER_BOOKING→FAILED');
        expect(completeDuffelBooking).not.toHaveBeenCalled();
        expect(sessions.setSessionStatus).toHaveBeenCalledWith(SESSION, 'failed');
        expect(finishSupplierAttempt).toHaveBeenCalledWith('attempt-1', expect.objectContaining({ status: 'failed' }));
    });

    it('calls an expired offer what it is', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({
            kind: 'error', status: 422, data: { errors: [{ code: 'offer_no_longer_available', message: 'Please select another offer' }] },
        });
        expect(await complete()).toMatchObject({ kind: 'failed', code: 'OFFER_EXPIRED' });
        expect(stripe.paymentIntents.cancel).toHaveBeenCalled();
    });

    it('does not order at all when the stored offer is gone', async () => {
        vi.mocked(getDuffelOffer).mockResolvedValue(null);

        expect(await complete()).toMatchObject({ kind: 'failed', code: 'OFFER_EXPIRED' });
        expect(placeDuffelOrder).not.toHaveBeenCalled();
        expect(startSupplierAttempt).not.toHaveBeenCalled();
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI);
    });

    it('releases the hold when the offer could not even be read — nothing was ordered', async () => {
        vi.mocked(getDuffelOffer).mockRejectedValue(new Error('duffel 503'));

        expect(await complete()).toMatchObject({ kind: 'failed', code: 'UPSTREAM_UNAVAILABLE' });
        expect(placeDuffelOrder).not.toHaveBeenCalled();
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI);
    });

    it('treats a replacement offer that needs new seats or bags as an expired one', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({ kind: 'offer_replaced', newOfferId: 'off_2', newOffer: {} });
        expect(await complete()).toMatchObject({ kind: 'failed', code: 'OFFER_EXPIRED' });
        expect(stripe.paymentIntents.cancel).toHaveBeenCalled();
    });

    it('keeps the attempt for a person when the hold cannot be released', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({ kind: 'price_changed', oldPrice: 100, newPrice: 140, currency: 'USD' });
        vi.mocked(stripe.paymentIntents.cancel).mockRejectedValue(new Error('stripe down'));

        const out = await complete();

        expect(out).toMatchObject({ kind: 'failed', code: 'PRICE_CHANGED' });
        expect(lastTransition().slice(1, 3)).toEqual(['SUPPLIER_BOOKING', 'NEEDS_REVIEW']);
        expect(lastTransition()[3]).toMatchObject({ patch: { failureCode: 'VOID_FAILED' } });
    });
});

// ── No answer ──────────────────────────────────────────────────────────────────

describe('an airline that did not answer', () => {
    const timedOut = { kind: 'error' as const, status: 504, data: { errors: [{ code: 'timeout' }] }, timedOut: true };

    it('finds the order it made anyway and finishes the booking with it', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue(timedOut);
        vi.mocked(findOrderFromTimedOutAttempt).mockResolvedValue(ORDER);

        const out = await complete();

        expect(out).toMatchObject({ kind: 'confirmed', bookingId: 'bk-1' });
        expect(findOrderFromTimedOutAttempt).toHaveBeenCalledWith('duffel_test_abc', expect.objectContaining({
            origin: 'MNL', destination: 'NRT', totalAmount: '100.00', currency: 'USD', familyName: 'Cruz',
        }));
        expect(lifecycle.note).toHaveBeenCalledWith(SESSION, 'browser', expect.stringMatching(/read back/), { orderId: 'ord_1' });
        expect(stripe.paymentIntents.capture).toHaveBeenCalled();
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });

    it('keeps the hold and asks for a person when no order can be found', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue(timedOut);

        const out = await complete();

        expect(out).toMatchObject({ kind: 'pending', needsReview: true });
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
        expect(lastTransition().slice(1, 3)).toEqual(['SUPPLIER_BOOKING', 'NEEDS_REVIEW']);
        expect(lastTransition()[3]).toMatchObject({ patch: { failureCode: 'UNKNOWN_OUTCOME' } });
        expect(sessions.setSessionStatus).not.toHaveBeenCalled();
    });

    it('treats a server error from the airline as no answer, not as a refusal', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({ kind: 'error', status: 502, data: {} });

        expect(await complete()).toMatchObject({ kind: 'pending', needsReview: true });
        expect(findOrderFromTimedOutAttempt).toHaveBeenCalled();
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });

    it('treats a dropped connection as no answer', async () => {
        vi.mocked(placeDuffelOrder).mockRejectedValue(new Error('socket hang up'));

        expect(await complete()).toMatchObject({ kind: 'pending', needsReview: true });
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });
});

// ── Money that will not move ───────────────────────────────────────────────────

describe('a payment that cannot be captured', () => {
    it('retries once, then keeps the order for a person and writes no sale', async () => {
        vi.mocked(stripe.paymentIntents.capture).mockRejectedValue(new Error('card_declined'));

        const out = await complete();

        expect(out).toMatchObject({ kind: 'pending', needsReview: true });
        expect(stripe.paymentIntents.capture).toHaveBeenCalledTimes(2);
        // No flight_bookings row: the orphaned-order cron would cancel the ticket of an unpaid one.
        expect(completeDuffelBooking).not.toHaveBeenCalled();
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(lastTransition().slice(1, 3)).toEqual(['SUPPLIER_BOOKING', 'NEEDS_REVIEW']);
        expect(lastTransition()[3]).toMatchObject({ patch: { failureCode: 'CAPTURE_FAILED', supplierOrderId: 'ord_1' } });
    });

    it('believes Stripe when a capture whose answer was lost actually succeeded', async () => {
        vi.mocked(stripe.paymentIntents.capture).mockRejectedValueOnce(new Error('timeout'));
        vi.mocked(stripe.paymentIntents.retrieve)
            .mockResolvedValueOnce(intent() as any)
            .mockResolvedValueOnce(intent({ status: 'succeeded' }) as any);

        expect(await complete()).toMatchObject({ kind: 'confirmed' });
        expect(stripe.paymentIntents.capture).toHaveBeenCalledTimes(1);
    });

    it('keeps a captured order for a person when the sale cannot be written', async () => {
        vi.mocked(completeDuffelBooking).mockRejectedValue(new Error('db down'));

        const out = await complete();

        expect(out).toMatchObject({ kind: 'pending', needsReview: true });
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(lastTransition()[3]).toMatchObject({ patch: { failureCode: 'SALE_NOT_RECORDED', supplierOrderId: 'ord_1' } });
    });
});

// ── Who gets to ask the airline ────────────────────────────────────────────────

describe('two callers, one payment', () => {
    it('lets the loser answer from the winner\'s result, without asking the airline', async () => {
        lifecycle.transition.mockResolvedValueOnce('lost').mockResolvedValueOnce('lost');
        lifecycle.findBySession.mockResolvedValue(record({ status: 'CONFIRMED' }));
        sessions.getFlightBookingBySession.mockResolvedValue({ id: 'bk-1', pnr: 'ABC123', status: 'ticketed' });

        expect(await complete()).toEqual({ kind: 'confirmed', bookingId: 'bk-1', pnr: 'ABC123', status: 'ticketed' });
        expect(getDuffelOffer).not.toHaveBeenCalled();
        expect(placeDuffelOrder).not.toHaveBeenCalled();
        expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    });

    it('waits for a winner still talking to the airline', async () => {
        lifecycle.transition.mockResolvedValueOnce('lost').mockResolvedValueOnce('lost');
        lifecycle.findBySession
            .mockResolvedValueOnce(record({ status: 'SUPPLIER_BOOKING' }))
            .mockResolvedValue(record({ status: 'CONFIRMED' }));
        sessions.getFlightBookingBySession.mockResolvedValue({ id: 'bk-1', pnr: 'ABC123', status: 'ticketed' });

        expect(await complete()).toMatchObject({ kind: 'confirmed' });
    });

    it('says pending, not failed, when the winner has not finished in time', async () => {
        lifecycle.transition.mockResolvedValueOnce('lost').mockResolvedValueOnce('lost');
        lifecycle.findBySession.mockResolvedValue(record({ status: 'SUPPLIER_BOOKING' }));

        expect(await complete()).toMatchObject({ kind: 'pending', needsReview: false });
    });

    it('relays the winner\'s recorded failure', async () => {
        lifecycle.transition.mockResolvedValueOnce('lost').mockResolvedValueOnce('lost');
        lifecycle.findBySession.mockResolvedValue(record({
            status: 'FAILED', failureCode: 'OFFER_EXPIRED', failureMessage: 'This fare is no longer available.',
        }));

        expect(await complete()).toEqual({ kind: 'failed', code: 'OFFER_EXPIRED', message: 'This fare is no longer available.' });
    });

    it('says a booking under review is still being confirmed', async () => {
        lifecycle.transition.mockResolvedValueOnce('lost').mockResolvedValueOnce('lost');
        lifecycle.findBySession.mockResolvedValue(record({ status: 'NEEDS_REVIEW' }));
        expect(await complete()).toMatchObject({ kind: 'pending', needsReview: true });
    });
});

describe('before the migration is applied', () => {
    it('claims with the session\'s own lock and books as before', async () => {
        lifecycle.transition.mockResolvedValue('unavailable');

        const out = await complete();

        expect(sessions.lockSessionForBooking).toHaveBeenCalledWith(SESSION);
        expect(out).toMatchObject({ kind: 'confirmed', bookingId: 'bk-1' });
        expect(stripe.paymentIntents.capture).toHaveBeenCalled();
    });

    it('does not ask the airline when the lock was already taken', async () => {
        lifecycle.transition.mockResolvedValue('unavailable');
        sessions.lockSessionForBooking.mockResolvedValue(false);
        lifecycle.findBySession.mockResolvedValue(null);
        sessions.getFlightBookingBySession.mockResolvedValue({ id: 'bk-1', pnr: 'ABC123', status: 'ticketed' });

        expect(await complete()).toMatchObject({ kind: 'confirmed', bookingId: 'bk-1' });
        expect(placeDuffelOrder).not.toHaveBeenCalled();
    });

    it('still releases the hold on a refusal', async () => {
        lifecycle.transition.mockResolvedValue('unavailable');
        vi.mocked(placeDuffelOrder).mockResolvedValue({ kind: 'price_changed', oldPrice: 100, newPrice: 140, currency: 'USD' });

        expect(await complete()).toMatchObject({ kind: 'failed', code: 'PRICE_CHANGED' });
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI);
        expect(sessions.setSessionStatus).toHaveBeenCalledWith(SESSION, 'failed');
    });
});

// ── What is checked before anything moves ──────────────────────────────────────

describe('before the claim', () => {
    it('refuses a payment that was not authorised', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue(intent({ status: 'requires_payment_method' }) as any);

        expect(await complete()).toMatchObject({ kind: 'failed', code: 'PAYMENT_NOT_AUTHORIZED' });
        expect(lifecycle.transition).not.toHaveBeenCalled();
        expect(placeDuffelOrder).not.toHaveBeenCalled();
    });

    it('refuses a payment that belongs to another session', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue(intent({ metadata: { bookingSessionId: 'other' } }) as any);
        expect(await complete()).toMatchObject({ kind: 'failed', code: 'SESSION_MISMATCH' });
        expect(lifecycle.transition).not.toHaveBeenCalled();
    });

    it('refuses a session paid with a different payment', async () => {
        sessions.getBookingSession.mockResolvedValue({ ...SESSION_ROW, payment_intent_id: 'pi_other' });
        expect(await complete()).toMatchObject({ kind: 'failed', code: 'SESSION_MISMATCH' });
        expect(lifecycle.transition).not.toHaveBeenCalled();
    });

    it('refuses someone else\'s session', async () => {
        expect(await complete({ userId: 'u-2' })).toMatchObject({ kind: 'failed', code: 'SESSION_MISMATCH' });
        expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('refuses a session that does not exist', async () => {
        sessions.getBookingSession.mockResolvedValue(null);
        expect(await complete()).toMatchObject({ kind: 'failed', code: 'SESSION_NOT_FOUND' });
    });

    it('answers from the record, never orders again, when the payment was already captured', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue(intent({ status: 'succeeded' }) as any);
        lifecycle.findBySession.mockResolvedValue(record({ status: 'CONFIRMED' }));
        sessions.getFlightBookingBySession.mockResolvedValue({ id: 'bk-1', pnr: 'ABC123', status: 'ticketed' });

        expect(await complete()).toMatchObject({ kind: 'confirmed', bookingId: 'bk-1' });
        expect(lifecycle.transition).not.toHaveBeenCalled();
        expect(placeDuffelOrder).not.toHaveBeenCalled();
    });

    it('relays why a released payment was released', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue(intent({ status: 'canceled' }) as any);
        lifecycle.findBySession.mockResolvedValue(record({ status: 'FAILED', failureCode: 'PRICE_CHANGED', failureMessage: 'The fare changed.' }));

        expect(await complete()).toEqual({ kind: 'failed', code: 'PRICE_CHANGED', message: 'The fare changed.' });
        expect(placeDuffelOrder).not.toHaveBeenCalled();
    });
});
