import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe', () => ({
    stripe: { paymentIntents: { capture: vi.fn(), retrieve: vi.fn(), cancel: vi.fn() } },
}));

import { stripe } from '@/lib/stripe';
import { HotelBookingLifecycleService } from '@/services/hotelBookingLifecycle.service';
import type { HotelBookingLifecycleRepository, LifecycleRecord } from '@/repositories/hotelBookingLifecycle.repository';
import { HotelProviderError, type HotelProvider } from '@/lib/hotels/providers/types';

const PI = 'pi_1';
const REF = 'CG-ABC123';

function record(over: Partial<LifecycleRecord> = {}): LifecycleRecord {
    return {
        id: 'id-1', reference: REF, userId: 'u-1', status: 'PAYMENT_AUTHORIZED', provider: 'mock',
        prebookRef: 'MOCK:x', paymentIntentId: PI, hotelCode: 'H1', propertyName: 'Grand', roomName: 'Std',
        checkIn: '2026-11-10', checkOut: '2026-11-12', currency: 'USD', amountMinor: 24000, draft: {},
        supplierReference: null, failureCode: null, failureMessage: null,
        createdAt: new Date('2026-10-15T00:00:00Z'), updatedAt: new Date('2026-10-15T00:00:00Z'),
        ...over,
    };
}

function fakeRepo() {
    return {
        begin: vi.fn(), transition: vi.fn().mockResolvedValue('applied'), note: vi.fn().mockResolvedValue(undefined),
        findByReference: vi.fn().mockResolvedValue(record()), findByPaymentIntent: vi.fn().mockResolvedValue(record()),
        saveConfirmInputs: vi.fn(), loadGuests: vi.fn().mockResolvedValue([]), markPayment: vi.fn().mockResolvedValue(undefined),
        findAbandoned: vi.fn().mockResolvedValue([]), findNeedingAttention: vi.fn().mockResolvedValue([]),
    };
}

function provider(over: Partial<HotelProvider> = {}): HotelProvider {
    return {
        id: 'mock', displayName: 'mock', capabilities: { bookingRead: false, providesContent: false },
        ownsRef: () => true, ...over,
    } as unknown as HotelProvider;
}

let repo: ReturnType<typeof fakeRepo>;
let svc: HotelBookingLifecycleService;

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    repo = fakeRepo();
    svc = new HotelBookingLifecycleService(repo as unknown as HotelBookingLifecycleRepository, {
        settleTimeoutMs: 30, settlePollMs: 5, captureRetryMs: 0,
    });
});

const transitions = () => repo.transition.mock.calls.map((c) => `${[c[1]].flat().join('|')}→${c[2]}`);

describe('claim', () => {
    it('records the authorisation, then wins the supplier booking', async () => {
        expect(await svc.claim(REF, PI, 'browser')).toEqual({ result: 'claimed' });
        expect(transitions()).toEqual(['PAYMENT_PENDING→PAYMENT_AUTHORIZED', 'PAYMENT_AUTHORIZED→SUPPLIER_BOOKING']);
        expect(repo.markPayment).toHaveBeenCalledWith(PI, 'authorized');
    });

    it('is lost, with the current record, when someone else already claimed', async () => {
        repo.transition
            .mockResolvedValueOnce('lost')    // the webhook recorded the authorisation first
            .mockResolvedValueOnce('lost');   // and someone else claimed
        repo.findByReference.mockResolvedValue(record({ status: 'SUPPLIER_BOOKING' }));

        const out = await svc.claim(REF, PI, 'browser');

        expect(out.result).toBe('lost');
        expect(repo.markPayment).not.toHaveBeenCalled();
    });

    it('is unavailable — not lost — when the lifecycle cannot be reached', async () => {
        repo.transition.mockResolvedValue('unavailable');
        expect(await svc.claim(REF, PI, 'browser')).toEqual({ result: 'unavailable' });
    });
});

describe('answering a lost claim', () => {
    it('reports success when the winner confirmed', async () => {
        expect(await svc.answerLostClaim(record({ status: 'CONFIRMED' }))).toMatchObject({
            success: true, data: { bookingId: REF, status: 'confirmed' },
        });
    });

    it('waits for a winner that is still mid-flight, then answers with its result', async () => {
        repo.findByReference
            .mockResolvedValueOnce(record({ status: 'SUPPLIER_BOOKING' }))
            .mockResolvedValue(record({ status: 'CONFIRMED' }));
        expect(await svc.answerLostClaim(record({ status: 'SUPPLIER_BOOKING' }))).toMatchObject({ success: true });
    });

    it('says pending, not failed, when the winner has not finished in time', async () => {
        repo.findByReference.mockResolvedValue(record({ status: 'SUPPLIER_BOOKING' }));
        expect(await svc.answerLostClaim(record({ status: 'SUPPLIER_BOOKING' }))).toMatchObject({
            success: false, pending: true, reference: REF,
        });
    });

    it('relays a recorded failure', async () => {
        const out = await svc.answerLostClaim(record({ status: 'FAILED', failureMessage: 'No rooms left' }));
        expect(out).toMatchObject({ success: false, providerConfirmed: false, error: 'No rooms left' });
    });

    it('returns null when the attempt cannot be read, so the caller carries on as before', async () => {
        expect(await svc.answerLostClaim(null)).toBeNull();
    });
});

describe('a supplier that said no', () => {
    beforeEach(() => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'requires_capture' } as never);
        vi.mocked(stripe.paymentIntents.cancel).mockResolvedValue({} as never);
    });

    const ctx = (code: ConstructorParameters<typeof HotelProviderError>[0]) => ({
        err: new HotelProviderError(code, 'No rooms'), provider: provider(), paymentIntentId: PI,
        reference: REF, clientReference: REF, claimed: true, actor: 'browser' as const,
    });

    it.each(['SOLD_OUT', 'PRICE_CHANGED', 'REJECTED', 'NOT_PAYABLE_ONLINE', 'INVALID_RATE'] as const)(
        'voids the authorisation and fails the attempt on %s',
        async (code) => {
            const out = await svc.onBookFailure(ctx(code));

            expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI);
            expect(transitions()).toEqual(['SUPPLIER_BOOKING→FAILED']);
            expect(repo.markPayment).toHaveBeenCalledWith(PI, 'voided');
            expect(out).toMatchObject({ kind: 'failed', response: { success: false, providerConfirmed: false } });
        },
    );

    it('puts the attempt in front of a person when the supplier refused but the hold would not release', async () => {
        vi.mocked(stripe.paymentIntents.cancel).mockRejectedValue(new Error('stripe down'));
        await svc.onBookFailure(ctx('REJECTED'));
        expect(transitions()).toEqual(['SUPPLIER_BOOKING→NEEDS_REVIEW']);
        expect(repo.markPayment).not.toHaveBeenCalled();
    });

    it('still voids when the lifecycle could not claim, because the money does not depend on it', async () => {
        await svc.onBookFailure({ ...ctx('SOLD_OUT'), claimed: false });
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI);
        expect(repo.transition).not.toHaveBeenCalled();
    });

    it('never voids a payment that has already been captured', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'succeeded' } as never);
        await svc.onBookFailure(ctx('REJECTED'));
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(transitions()).toEqual(['SUPPLIER_BOOKING→NEEDS_REVIEW']);
    });
});

describe('a supplier that did not answer', () => {
    const base = {
        paymentIntentId: PI, reference: REF, clientReference: REF, claimed: true, actor: 'browser' as const,
    };

    it.each(['UNKNOWN_OUTCOME', 'TIMEOUT', 'UNAVAILABLE'] as const)(
        'keeps the hold and flags review on %s — it is never voided',
        async (code) => {
            const out = await svc.onBookFailure({ ...base, err: new HotelProviderError(code, 'no answer'), provider: provider() });

            expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
            expect(transitions()).toEqual(['SUPPLIER_BOOKING→NEEDS_REVIEW']);
            expect(out).toMatchObject({ kind: 'failed', response: { needsReview: true, success: false } });
        },
    );

    it('treats an error it does not recognise as ambiguous, not as a refusal', async () => {
        await svc.onBookFailure({ ...base, err: new Error('socket hang up'), provider: provider() });
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });

    it('carries on with the booking when the supplier can be asked and it exists', async () => {
        const found = { provider: 'mock', status: 'OK', clientRef: REF, supplierRef: 'SUP-1' };
        const getBooking = vi.fn().mockResolvedValue(found);
        const p = provider({ capabilities: { bookingRead: true, providesContent: false }, getBooking });

        const out = await svc.onBookFailure({ ...base, err: new HotelProviderError('UNKNOWN_OUTCOME', 'x'), provider: p });

        expect(getBooking).toHaveBeenCalledWith({ clientRef: REF });
        expect(out).toEqual({ kind: 'recovered', booking: found });
        expect(repo.transition).not.toHaveBeenCalled();
    });

    it('does not void even when the read-back finds nothing — it goes to review', async () => {
        const getBooking = vi.fn().mockResolvedValue(null);
        const p = provider({ capabilities: { bookingRead: true, providesContent: false }, getBooking });

        const out = await svc.onBookFailure({ ...base, err: new HotelProviderError('UNKNOWN_OUTCOME', 'x'), provider: p });

        expect(out.kind).toBe('failed');
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(transitions()).toEqual(['SUPPLIER_BOOKING→NEEDS_REVIEW']);
    });

    it('does not read back from a supplier that cannot', async () => {
        const getBooking = vi.fn();
        await svc.onBookFailure({
            ...base, err: new HotelProviderError('TIMEOUT', 'x'),
            provider: provider({ capabilities: { bookingRead: false, providesContent: false }, getBooking }),
        });
        expect(getBooking).not.toHaveBeenCalled();
    });
});

describe('capture', () => {
    it('captures once, under a key that is the same for every replay of this booking', async () => {
        vi.mocked(stripe.paymentIntents.capture).mockResolvedValue({ id: PI } as never);

        const out = await svc.capture(PI, REF, ['latest_charge.balance_transaction']);

        expect(out).toEqual({ ok: true, intent: { id: PI } });
        expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(
            PI, { expand: ['latest_charge.balance_transaction'] }, { idempotencyKey: `hotel-capture-${REF}` },
        );
    });

    it('retries once, then reports the failure', async () => {
        vi.mocked(stripe.paymentIntents.capture).mockRejectedValue(new Error('card_declined'));
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'requires_capture' } as never);

        const out = await svc.capture(PI, REF, []);

        expect(out).toEqual({ ok: false, error: 'card_declined' });
        expect(stripe.paymentIntents.capture).toHaveBeenCalledTimes(2);
    });

    it('recognises a capture that landed although its answer was lost', async () => {
        vi.mocked(stripe.paymentIntents.capture).mockRejectedValue(new Error('network'));
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ id: PI, status: 'succeeded' } as never);

        const out = await svc.capture(PI, REF, []);

        expect(out.ok).toBe(true);
        expect(stripe.paymentIntents.capture).toHaveBeenCalledTimes(1);
    });
});

describe('recording outcomes', () => {
    it('confirms with the supplier reference and marks the payment captured', async () => {
        await svc.confirmed(REF, PI, 'SUP-9', 'browser');
        expect(transitions()).toEqual(['SUPPLIER_BOOKING→CONFIRMED']);
        expect(repo.transition.mock.calls[0][3]).toMatchObject({ patch: { supplierReference: 'SUP-9' } });
        expect(repo.markPayment).toHaveBeenCalledWith(PI, 'captured');
    });

    it('flags a failed capture and a moved price for a person', async () => {
        await svc.flagCaptureFailure(REF, 'declined', 'browser');
        await svc.flagPriceMoved(REF, 100, 130, 'browser');
        expect(transitions()).toEqual(['SUPPLIER_BOOKING→NEEDS_REVIEW', 'SUPPLIER_BOOKING→NEEDS_REVIEW']);
        expect(repo.transition.mock.calls[0][3].patch.failureCode).toBe('CAPTURE_FAILED');
        expect(repo.transition.mock.calls[1][3].patch.failureCode).toBe('PRICE_CHANGED_AFTER_BOOKING');
    });
});

describe('cancellation bookkeeping', () => {
    it('walks a refunded cancellation through its states', async () => {
        await svc.recordCancelEnd(REF, 'cancelled_refunded', 'browser');
        expect(transitions()).toEqual(['CANCEL_REQUESTED→REFUND_PENDING', 'REFUND_PENDING→REFUNDED']);
    });

    it('walks a failed refund to REFUND_FAILED, and a plain cancel to CANCELLED', async () => {
        await svc.recordCancelEnd(REF, 'cancelled_refund_failed', 'browser');
        expect(transitions()).toEqual(['CANCEL_REQUESTED→REFUND_PENDING', 'REFUND_PENDING→REFUND_FAILED']);

        repo.transition.mockClear();
        await svc.recordCancelEnd(REF, 'cancelled', 'browser');
        expect(transitions()).toEqual(['CANCEL_REQUESTED→CANCELLED']);
    });

    it('treats a refund retry as REFUND_FAILED → REFUND_PENDING', async () => {
        repo.transition.mockResolvedValueOnce('lost');
        await svc.recordCancelStart(REF, 'browser');
        expect(transitions()).toEqual(['CONFIRMED→CANCEL_REQUESTED', 'REFUND_FAILED→REFUND_PENDING']);
    });
});

describe('webhook completion', () => {
    it('ignores a payment that is not one of its own', async () => {
        repo.findByPaymentIntent.mockResolvedValue(null);
        expect(await svc.recordAuthorised('pi_other')).toBeNull();
        expect(repo.transition).not.toHaveBeenCalled();
    });

    it('records the authorisation', async () => {
        await svc.recordAuthorised(PI);
        expect(transitions()).toEqual(['PAYMENT_PENDING→PAYMENT_AUTHORIZED']);
        expect(repo.markPayment).toHaveBeenCalledWith(PI, 'authorized');
    });

    it('cannot complete unattended until the traveller has supplied who is staying', async () => {
        repo.loadGuests.mockResolvedValue([]);
        expect(await svc.confirmParamsFor(record())).toBeNull();
    });

    it('rebuilds the confirm parameters from what was saved', async () => {
        repo.loadGuests.mockResolvedValue([
            { kind: 'holder', firstName: 'Juan', lastName: 'dela Cruz', email: 'j@x.com', age: null },
            { kind: 'adult', firstName: 'Maria', lastName: 'dela Cruz', age: null, email: null },
            { kind: 'child', firstName: 'Pepe', lastName: 'dela Cruz', age: 8, email: null },
        ]);

        const params = await svc.confirmParamsFor(record({ draft: { adults: 2, children: 1, board: 'BB' } }));

        expect(params).toMatchObject({
            paymentIntentId: PI, userId: 'u-1', prebookId: 'MOCK:x', adults: 2, children: 1, board: 'BB',
            holder: { firstName: 'Juan', lastName: 'dela Cruz', email: 'j@x.com' },
            guests: [{ firstName: 'Maria', lastName: 'dela Cruz' }, { firstName: 'Pepe', lastName: 'dela Cruz', age: 8 }],
            checkIn: '2026-11-10', checkOut: '2026-11-12',
        });
    });
});

describe('sweep', () => {
    const NOW = new Date('2026-10-15T12:00:00Z');

    beforeEach(() => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'requires_capture' } as never);
        vi.mocked(stripe.paymentIntents.cancel).mockResolvedValue({} as never);
    });

    it('voids and expires an authorisation nobody completed', async () => {
        repo.findAbandoned.mockResolvedValueOnce([]).mockResolvedValueOnce([record()]);

        const report = await svc.sweep(NOW);

        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI);
        expect(repo.transition.mock.calls[0][1]).toEqual(['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED']);
        expect(repo.transition.mock.calls[0][2]).toBe('EXPIRED');
        expect(repo.transition.mock.calls[0][3]).toMatchObject({ actor: 'sweeper' });
        expect(report.expired).toEqual([REF]);
    });

    it('only asks for attempts older than each state\'s own limit', async () => {
        await svc.sweep(NOW);
        const [pendingCall, authorisedCall] = repo.findAbandoned.mock.calls;
        expect(pendingCall[0]).toEqual(['PAYMENT_PENDING']);
        expect((pendingCall[1] as Date).getTime()).toBe(NOW.getTime() - 2 * 60 * 60 * 1000);
        expect(authorisedCall[0]).toEqual(['PAYMENT_AUTHORIZED']);
        expect((authorisedCall[1] as Date).getTime()).toBe(NOW.getTime() - 30 * 60 * 1000);
    });

    it('leaves a captured payment alone and reports it', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'succeeded' } as never);
        repo.findAbandoned.mockResolvedValueOnce([record({ status: 'PAYMENT_PENDING' })]).mockResolvedValueOnce([]);

        const report = await svc.sweep(NOW);

        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(repo.transition).not.toHaveBeenCalled();
        expect(report.anomalies[0].reference).toBe(REF);
    });

    it('does not expire an attempt whose hold would not release', async () => {
        vi.mocked(stripe.paymentIntents.cancel).mockRejectedValue(new Error('stripe down'));
        repo.findAbandoned.mockResolvedValueOnce([record()]).mockResolvedValueOnce([]);

        const report = await svc.sweep(NOW);

        expect(repo.transition).not.toHaveBeenCalled();
        expect(report.expired).toEqual([]);
        expect(report.anomalies).toHaveLength(1);
    });

    it('reports attempts that are stuck with the supplier, and does nothing to them', async () => {
        repo.findNeedingAttention.mockResolvedValue([
            record({ status: 'NEEDS_REVIEW', failureCode: 'UNKNOWN_OUTCOME', updatedAt: new Date('2026-10-15T11:00:00Z') }),
        ]);

        const report = await svc.sweep(NOW);

        expect(report.attention).toEqual([
            { reference: REF, status: 'NEEDS_REVIEW', ageMinutes: 60, failureCode: 'UNKNOWN_OUTCOME' },
        ]);
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });
});
