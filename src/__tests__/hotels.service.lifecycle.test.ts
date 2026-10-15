import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config', () => ({ config: { RESEND_API_KEY: '', SITE_URL: 'https://cheapestgo.com' } }));
vi.mock('@/lib/hotels/search', () => ({ runTgxSearch: vi.fn() }));
vi.mock('@/lib/hotels/travelgatex', () => ({ quoteTgx: vi.fn(), bookTgx: vi.fn(), cancelTgx: vi.fn() }));
vi.mock('@/lib/hotels/etgContent', () => ({ ensureEtgContent: vi.fn() }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

vi.mock('@/lib/stripe', () => ({
    stripe: {
        paymentIntents: { create: vi.fn(), retrieve: vi.fn(), capture: vi.fn(), cancel: vi.fn(), update: vi.fn(), search: vi.fn() },
        refunds: { create: vi.fn() },
    },
}));

vi.mock('@/repositories/hotels.repository', () => ({
    HotelsRepository: vi.fn(function (this: any) {
        this.recordSearchDemand   = vi.fn().mockResolvedValue(undefined);
        this.savePrebookQuote     = vi.fn().mockResolvedValue(undefined);
        this.savePolicySnapshot   = vi.fn().mockResolvedValue(undefined);
        this.findPolicySnapshot   = vi.fn().mockResolvedValue(null);
        this.openRefund           = vi.fn().mockResolvedValue('refund-log-1');
        this.closeRefund          = vi.fn().mockResolvedValue(undefined);
        this.findPrebookQuote     = vi.fn();
    }),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: { bookings: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));

vi.mock('@/middleware/error.middleware', () => ({
    AppError: class AppError extends Error {
        constructor(public status: number, message: string, public code: string, public details?: Record<string, unknown>) {
            super(message);
        }
    },
}));

import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { HotelsService } from '@/services/hotels.service';
import { HotelBookingLifecycleService } from '@/services/hotelBookingLifecycle.service';
import { MockHotelProvider } from '@/lib/hotels/providers/mock/MockHotelProvider';
import { HotelProviderError } from '@/lib/hotels/providers/types';
import { InMemoryLifecycleRepo } from './helpers/inMemoryLifecycleRepo';

const NOW  = Date.parse('2026-10-14T00:00:00Z');
const STAY = { checkIn: '2026-11-10', checkOut: '2026-11-12' };
const USER = 'user-1';
const PI   = 'pi_mock_1';
const REF  = 'CG-M0CK01';

let mock: MockHotelProvider;
let repo: InMemoryLifecycleRepo;
let service: HotelsService;

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    mock    = new MockHotelProvider({ now: () => NOW });
    repo    = new InMemoryLifecycleRepo();
    service = new HotelsService(mock, new HotelBookingLifecycleService(repo.asRepository(), {
        settleTimeoutMs: 400, settlePollMs: 5, captureRetryMs: 0,
    }));

    repo.seed({ reference: REF, userId: USER, paymentIntentId: PI });

    vi.mocked(prisma.bookings.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.bookings.create).mockResolvedValue({ id: 'row-1' } as never);
    vi.mocked(prisma.bookings.update).mockResolvedValue({} as never);

    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
        id: PI, status: 'requires_capture', amount: 26400, currency: 'usd',
        metadata: { userId: USER, bookingReference: REF },
    } as never);
    vi.mocked(stripe.paymentIntents.capture).mockResolvedValue({} as never);
    vi.mocked(stripe.paymentIntents.cancel).mockResolvedValue({} as never);
    vi.mocked(stripe.paymentIntents.update).mockResolvedValue({} as never);
});

async function quote(hotelId = 'MOCK-MNL-001') {
    const rates = await mock.getRates(hotelId, { ...STAY, adults: 2, children: 0 });
    const rate  = rates.find((r) => r.roomName === 'Standard Double Room' && r.boardCode === 'BB')!;
    const q: any = await service.preBook({ offerId: rate.offerId, roomName: rate.roomName, adults: 2, children: 0, currency: 'USD' });
    return q.data.prebookId as string;
}

const params = (prebookId: string) => ({
    paymentIntentId: PI, userId: USER, prebookId,
    holder: { firstName: 'Juan', lastName: 'dela Cruz', email: 'juan@example.com' },
    guests: [{ firstName: 'Juan', lastName: 'dela Cruz' }, { firstName: 'Maria', lastName: 'dela Cruz' }],
    propertyName: 'Bayside Grand Manila', roomName: 'Standard Double Room',
    checkIn: STAY.checkIn, checkOut: STAY.checkOut, adults: 2, children: 0, currency: 'USD',
});

const bookCalls = () => mock.calls.filter((c) => c.method === 'book').length;

describe('the happy path', () => {
    it('moves the attempt to CONFIRMED and captures once', async () => {
        const out: any = await service.confirmBooking(params(await quote()));

        expect(out.success).toBe(true);
        expect(repo.path(REF)).toEqual(['PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', 'CONFIRMED']);
        expect(repo.records.get(REF)?.supplierReference).toMatch(/^MOCKSUP-/);
        expect(repo.payments.get(PI)).toBe('captured');
        expect(stripe.paymentIntents.capture).toHaveBeenCalledTimes(1);
    });

    it('keeps what the traveller supplied, so a payment event could finish it later', async () => {
        await service.confirmBooking(params(await quote()));
        expect(repo.guests.get(REF)?.map((g) => g.kind)).toEqual(['holder', 'adult', 'adult']);
        expect(repo.records.get(REF)?.draft).toMatchObject({ adults: 2, children: 0 });
    });
});

describe('two callers, one payment', () => {
    it('asks the supplier once when the same confirmation arrives twice at once', async () => {
        const prebookId = await quote();

        const [a, b]: any[] = await Promise.all([
            service.confirmBooking(params(prebookId)),
            service.confirmBooking(params(prebookId)),
        ]);

        expect(bookCalls()).toBe(1);
        expect(stripe.paymentIntents.capture).toHaveBeenCalledTimes(1);
        // Both are told the booking succeeded — the second waited for the first.
        expect(a.success).toBe(true);
        expect(b.success).toBe(true);
        expect(repo.status(REF)).toBe('CONFIRMED');
    });

    it('answers a late caller from the finished booking rather than asking again', async () => {
        const prebookId = await quote();
        await service.confirmBooking(params(prebookId));

        const again: any = await service.confirmBooking(params(prebookId));

        expect(again.success).toBe(true);
        expect(bookCalls()).toBe(1);
    });

    it('never carries on to the supplier from a lost claim it cannot explain', async () => {
        repo.records.get(REF)!.status = 'NEEDS_REVIEW';
        const out: any = await service.confirmBooking(params(await quote()));

        expect(out).toMatchObject({ success: false, pending: true });
        expect(bookCalls()).toBe(0);
    });
});

describe('a supplier that said no', () => {
    it('voids the authorisation, files the failure, and captures nothing', async () => {
        const out: any = await service.confirmBooking(params(await quote('MOCK-QA-BOOKFAIL')));

        expect(out).toMatchObject({ success: false, providerConfirmed: false });
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI);
        expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
        expect(prisma.bookings.create).not.toHaveBeenCalled();
        expect(repo.status(REF)).toBe('FAILED');
        expect(repo.records.get(REF)?.failureCode).toBe('REJECTED');
    });
});

describe('a supplier that did not answer', () => {
    it('reads the reservation back and finishes the booking when it exists', async () => {
        const out: any = await service.confirmBooking(params(await quote('MOCK-QA-BOOKTIMEOUT')));

        expect(out.success).toBe(true);
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(stripe.paymentIntents.capture).toHaveBeenCalledTimes(1);
        expect(repo.status(REF)).toBe('CONFIRMED');
        // One reservation, not two: the read-back found it rather than re-booking.
        expect(mock.reservations).toHaveLength(1);
    });

    it('keeps the hold and asks for review when the supplier cannot be asked', async () => {
        (mock as any).capabilities = { bookingRead: false, providesContent: true };

        const out: any = await service.confirmBooking(params(await quote('MOCK-QA-BOOKTIMEOUT')));

        expect(out).toMatchObject({ success: false, needsReview: true });
        // The reservation exists; voiding here would leave the guest holding a room we refunded.
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
        expect(prisma.bookings.create).not.toHaveBeenCalled();
        expect(repo.status(REF)).toBe('NEEDS_REVIEW');
    });
});

describe('a payment that cannot be captured', () => {
    it('flags the booking for a person instead of failing with a stack trace', async () => {
        vi.mocked(stripe.paymentIntents.capture).mockRejectedValue(new Error('card_declined'));

        const out: any = await service.confirmBooking(params(await quote()));

        expect(out).toMatchObject({ success: false, providerConfirmed: true, needsReview: true });
        expect(out.error).toMatch(/do not pay again/i);
        expect(prisma.bookings.create).not.toHaveBeenCalled();
        expect(repo.status(REF)).toBe('NEEDS_REVIEW');
        expect(repo.records.get(REF)?.failureCode).toBe('CAPTURE_FAILED');
    });
});

describe('when the lifecycle is unavailable', () => {
    it('books exactly as it did before the tables existed', async () => {
        repo.unavailable = true;

        const out: any = await service.confirmBooking(params(await quote()));

        expect(out.success).toBe(true);
        expect(bookCalls()).toBe(1);
        expect(stripe.paymentIntents.capture).toHaveBeenCalledTimes(1);
    });

    it('still voids the hold when the supplier refuses', async () => {
        repo.unavailable = true;

        await service.confirmBooking(params(await quote('MOCK-QA-BOOKFAIL')));

        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI);
    });
});

describe('a payment from before references existed', () => {
    it('is booked without a lifecycle record', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
            id: PI, status: 'requires_capture', amount: 26400, currency: 'usd', metadata: { userId: USER },
        } as never);

        const out: any = await service.confirmBooking(params(await quote()));

        expect(out.success).toBe(true);
        expect(repo.log).toHaveLength(0);
    });
});

describe('cancellation', () => {
    it('records a refunded cancellation against the attempt', async () => {
        await service.confirmBooking(params(await quote()));
        repo.log.length = 0;

        vi.mocked(prisma.bookings.findFirst).mockResolvedValue({
            booking_id: REF, user_id: USER, payment_intent_id: PI, status: 'confirmed', provider: 'mock',
            provider_metadata: { hotelCode: 'MOCK-MNL-001', supplierRef: 'MOCKSUP-000001' },
            property_name: 'Bayside Grand Manila', total_price: 264, currency: 'USD',
            check_in: new Date('2026-11-10T00:00:00Z'),
        } as never);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'requires_capture', amount: 26400 } as never);

        const out: any = await service.cancelBooking({ bookingRef: REF, userId: USER, paymentIntentId: PI });

        expect(out.success).toBe(true);
        // Releasing an uncaptured authorisation is the refund, so the legacy flow ends at
        // cancelled_refunded and the lifecycle follows it through REFUND_PENDING.
        expect(repo.path(REF)).toEqual(['CANCEL_REQUESTED', 'REFUND_PENDING', 'REFUNDED']);
    });
});

describe('completing from the payment event', () => {
    /** The traveller said who is staying at payment time, so nothing is waiting on the browser. */
    async function paidWithDetails() {
        const prebookId = await quote();
        Object.assign(repo.records.get(REF)!, {
            prebookRef: prebookId, checkIn: STAY.checkIn, checkOut: STAY.checkOut,
            propertyName: 'Bayside Grand Manila', roomName: 'Standard Double Room', currency: 'USD',
            draft: { adults: 2, children: 0 },
        });
        repo.guests.set(REF, [
            { kind: 'holder', firstName: 'Juan', lastName: 'dela Cruz', email: 'juan@example.com' },
            { kind: 'adult', firstName: 'Juan', lastName: 'dela Cruz' },
            { kind: 'adult', firstName: 'Maria', lastName: 'dela Cruz' },
        ]);
        return prebookId;
    }

    it('books and confirms without the browser, as the webhook', async () => {
        await paidWithDetails();

        const out = await service.completeFromPayment(PI);

        expect(out).toMatchObject({ handled: true, completed: true, reference: REF });
        expect(bookCalls()).toBe(1);
        expect(repo.status(REF)).toBe('CONFIRMED');
        expect(repo.log.every((e) => e.actor === 'webhook')).toBe(true);
    });

    it('does nothing for a payment that is not a hotel attempt', async () => {
        expect(await service.completeFromPayment('pi_flight')).toMatchObject({ handled: false, completed: false });
        expect(bookCalls()).toBe(0);
    });

    it('only records the authorisation when the traveller has not said who is staying', async () => {
        await quote();

        const out = await service.completeFromPayment(PI);

        expect(out).toMatchObject({ handled: true, completed: false, reason: expect.stringMatching(/details/) });
        expect(repo.status(REF)).toBe('PAYMENT_AUTHORIZED');
        expect(bookCalls()).toBe(0);
    });

    it('leaves a booking the browser is already completing alone', async () => {
        await paidWithDetails();
        repo.records.get(REF)!.status = 'SUPPLIER_BOOKING';

        const out = await service.completeFromPayment(PI);

        expect(out).toMatchObject({ handled: true, completed: false, reason: 'already SUPPLIER_BOOKING' });
        expect(bookCalls()).toBe(0);
    });

    it('asks the supplier once when the webhook and the browser arrive together', async () => {
        const prebookId = await paidWithDetails();

        const [viaWebhook, viaBrowser]: any[] = await Promise.all([
            service.completeFromPayment(PI),
            service.confirmBooking(params(prebookId)),
        ]);

        expect(bookCalls()).toBe(1);
        expect(stripe.paymentIntents.capture).toHaveBeenCalledTimes(1);
        expect(viaBrowser.success).toBe(true);
        expect(viaWebhook.handled).toBe(true);
        expect(repo.status(REF)).toBe('CONFIRMED');
    });
});

describe('booking status', () => {
    it('reports the lifecycle to its owner', async () => {
        repo.records.get(REF)!.status = 'SUPPLIER_BOOKING';

        const out: any = await service.getBookingStatus(REF, USER);

        expect(out.data).toMatchObject({ reference: REF, status: 'SUPPLIER_BOOKING', bookingStatus: null, failure: null });
    });

    it('carries the failure and the legacy status once confirmed', async () => {
        await service.confirmBooking(params(await quote()));

        const out: any = await service.getBookingStatus(REF, USER);

        expect(out.data).toMatchObject({ status: 'CONFIRMED', bookingStatus: 'confirmed' });
    });

    it('is a 404 for someone else\'s booking, not a leak', async () => {
        await expect(service.getBookingStatus(REF, 'user-2')).rejects.toMatchObject({ status: 404 });
    });

    it('answers a booking from before the lifecycle from the sale itself', async () => {
        vi.mocked(prisma.bookings.findFirst).mockResolvedValueOnce({
            booking_id: 'CG-OLD111', status: 'confirmed', updated_at: new Date(), provider: 'travelgatex', currency: 'PHP',
        } as never);

        const out: any = await service.getBookingStatus('CG-OLD111', USER);

        expect(out.data).toMatchObject({ reference: 'CG-OLD111', status: 'CONFIRMED', bookingStatus: 'confirmed', history: [] });
    });

    it('is a 404 when there is no such booking at all', async () => {
        vi.mocked(prisma.bookings.findFirst).mockResolvedValueOnce(null);
        await expect(service.getBookingStatus('CG-NOPE00', USER)).rejects.toMatchObject({ status: 404 });
    });
});

describe('cancel preview', () => {
    // Fifty per cent back until the 5th, then nothing; the same terms the real cancel will read.
    const POLICY = {
        policyType: 'tiered' as const,
        freeCancelDeadline: null,
        tiers: [
            { cancelDeadline: new Date('2026-11-05T10:00:00Z'), penaltyAmount: 50, penaltyType: 'percent', currency: 'USD', tierOrder: 1 },
            { cancelDeadline: new Date('2026-11-18T10:00:00Z'), penaltyAmount: 100, penaltyType: 'percent', currency: 'USD', tierOrder: 2 },
        ],
    };
    const BOOKED_AT = Date.parse('2026-11-01T00:00:00Z');

    const row = {
        booking_id: REF, user_id: USER, payment_intent_id: PI, status: 'confirmed', provider: 'mock',
        provider_metadata: { hotelCode: 'MOCK-MNL-001', supplierRef: 'MOCKSUP-000001' },
        property_name: 'Bayside Grand Manila', total_price: 264, currency: 'USD',
        check_in: new Date('2026-11-20T00:00:00Z'),
    };

    beforeEach(() => {
        vi.mocked(prisma.bookings.findFirst).mockResolvedValue(row as never);
        (service as any).repo.findPolicySnapshot.mockResolvedValue(POLICY);
    });

    it('shows the owner what they would get back, and until when', async () => {
        const out: any = await service.getCancelPreview(REF, USER, BOOKED_AT);

        expect(out.data).toMatchObject({
            reference: REF, cancellable: true,
            refund:  { amount: 132, currency: 'USD', type: 'partial_refund' },
            penalty: { amount: 132, currency: 'USD' },
            paid:    { amount: 264, currency: 'USD' },
            deadline: '2026-11-05T10:00:00.000Z',
        });
    });

    it('cancels nothing and asks no supplier', async () => {
        await service.getCancelPreview(REF, USER, BOOKED_AT);

        expect(prisma.bookings.update).not.toHaveBeenCalled();
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(stripe.refunds.create).not.toHaveBeenCalled();
        expect(mock.calls.filter((c) => c.method === 'cancelBooking')).toHaveLength(0);
        expect(repo.log).toHaveLength(0);
    });

    it('is the figure the real cancellation then refunds', async () => {
        // A real cancellation is of a booking the supplier holds: book it first.
        vi.mocked(prisma.bookings.findFirst).mockResolvedValueOnce(null);
        await service.confirmBooking(params(await quote()));
        vi.clearAllMocks();
        vi.mocked(prisma.bookings.findFirst).mockResolvedValue(row as never);
        vi.mocked(prisma.bookings.update).mockResolvedValue({} as never);

        vi.useFakeTimers({ now: BOOKED_AT, toFake: ['Date'] });
        try {
            const preview: any = await service.getCancelPreview(REF, USER);

            vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'succeeded', amount: 26400 } as never);
            vi.mocked(stripe.refunds.create).mockResolvedValue({ id: 're_1', status: 'succeeded' } as never);
            await service.cancelBooking({ bookingRef: REF, userId: USER, paymentIntentId: PI });

            const refundedMinor = vi.mocked(stripe.refunds.create).mock.calls[0][0]?.amount as number;
            expect(refundedMinor).toBe(Math.round(preview.data.refund.amount * 100));
        } finally {
            vi.useRealTimers();
        }
    });

    it('is a 404 for someone else\'s booking', async () => {
        await expect(service.getCancelPreview(REF, 'user-2', BOOKED_AT)).rejects.toMatchObject({ status: 404 });
    });

    it('is a 404 when there is no such booking', async () => {
        vi.mocked(prisma.bookings.findFirst).mockResolvedValue(null);
        await expect(service.getCancelPreview('CG-NOPE00', USER, BOOKED_AT)).rejects.toMatchObject({ status: 404 });
    });

    it('does not promise a refund when no terms were recorded', async () => {
        (service as any).repo.findPolicySnapshot.mockResolvedValue(null);

        const out: any = await service.getCancelPreview(REF, USER, BOOKED_AT);

        expect(out.data.refund).toMatchObject({ amount: 0, type: 'no_refund' });
    });

    it('says a booking that is already cancelled cannot be cancelled again', async () => {
        vi.mocked(prisma.bookings.findFirst).mockResolvedValue({ ...row, status: 'cancelled_refunded' } as never);

        const out: any = await service.getCancelPreview(REF, USER, BOOKED_AT);

        expect(out.data).toMatchObject({ cancellable: false, reason: 'already_cancelled' });
    });
});

describe('what the traveller supplied reaches the booking', () => {
    it('keeps the holder\'s phone with the booking', async () => {
        await service.confirmBooking({ ...params(await quote()), holderPhone: '+63 917 123 4567' } as any);

        expect(prisma.bookings.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                provider_metadata: expect.objectContaining({ holderPhone: '+63 917 123 4567' }),
            }),
        });
    });

    it('does not invent a phone when none was given', async () => {
        await service.confirmBooking(params(await quote()));

        const data = vi.mocked(prisma.bookings.create).mock.calls[0][0].data as any;
        expect('holderPhone' in data.provider_metadata).toBe(false);
    });

    it('also keeps it for a booking that is finished from the payment event', async () => {
        await service.confirmBooking({ ...params(await quote()), holderPhone: '+63 917 123 4567' } as any);
        expect(repo.records.get(REF)?.draft).toMatchObject({ holderPhone: '+63 917 123 4567' });
    });

    it('sends an infant to the supplier as age 0, not as 10', async () => {
        const prebookId = await quote();
        await service.confirmBooking({
            ...params(prebookId), children: 1,
            guests: [
                { firstName: 'Juan', lastName: 'dela Cruz' }, { firstName: 'Maria', lastName: 'dela Cruz' },
                { firstName: 'Baby', lastName: 'dela Cruz', age: 0 },
            ],
        });

        const booked = mock.calls.find((c) => c.method === 'book')!.input as { guests: Array<{ age: number; type: string }> };
        expect(booked.guests.at(-1)).toMatchObject({ type: 'child', age: 0 });
    });
});

describe('a supplier that will not cancel', () => {
    // A confirmed booking, with the money already taken, that the guest now wants to cancel.
    const row = () => ({
        booking_id: REF, user_id: USER, payment_intent_id: PI, status: 'confirmed', provider: 'mock',
        provider_metadata: { hotelCode: 'MOCK-MNL-001', supplierRef: 'MOCKSUP-000001' },
        property_name: 'Bayside Grand Manila', total_price: 264, currency: 'USD',
        check_in: new Date('2026-11-20T00:00:00Z'),
    });

    /** Books, then sets the world up for a cancellation and forgets what the booking touched. */
    async function booked(status = 'confirmed') {
        await service.confirmBooking(params(await quote()));
        vi.clearAllMocks();
        repo.log.length = 0;

        vi.mocked(prisma.bookings.findFirst).mockResolvedValue({ ...row(), status } as never);
        vi.mocked(prisma.bookings.update).mockResolvedValue({} as never);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'succeeded', amount: 26400 } as never);
        vi.mocked(stripe.refunds.create).mockResolvedValue({ id: 're_1', status: 'succeeded' } as never);
        // Freshly booked, so the policy is free and a refund is owed if the cancellation goes through.
        (service as any).repo.findPolicySnapshot.mockResolvedValue({
            policyType: 'free_cancellation', freeCancelDeadline: new Date('2099-01-01T00:00:00Z'), tiers: [],
        });
    }

    const cancel = () => service.cancelBooking({ bookingRef: REF, userId: USER, paymentIntentId: PI });
    const nothingMoved = () => {
        expect(stripe.refunds.create).not.toHaveBeenCalled();
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(prisma.bookings.update).not.toHaveBeenCalled();
    };

    it('does not refund a guest whose room the supplier still holds', async () => {
        await booked();
        mock.setScenario('cancel_rejected');

        await expect(cancel()).rejects.toMatchObject({ status: 409, code: 'CANCEL_REFUSED' });

        nothingMoved();
        // Back where it was: still confirmed, still theirs.
        expect(repo.status(REF)).toBe('CONFIRMED');
        expect(repo.path(REF)).toEqual(['CANCEL_REQUESTED', 'CONFIRMED']);
    });

    it('finishes the cancellation when an unanswered request is found to have gone through', async () => {
        await booked();
        mock.setScenario('cancel_timeout');   // the mock applies it, then loses the answer

        const out: any = await cancel();

        expect(out.success).toBe(true);
        expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
        expect(repo.status(REF)).toBe('REFUNDED');
    });

    it('keeps the booking and the money, and asks for review, when it cannot be found out', async () => {
        await booked();
        (mock as any).capabilities = { bookingRead: false, providesContent: true };
        mock.setScenario('cancel_timeout');

        await expect(cancel()).rejects.toMatchObject({ status: 502, code: 'CANCEL_UNCONFIRMED' });

        nothingMoved();
        expect(repo.status(REF)).toBe('NEEDS_REVIEW');
        expect(repo.records.get(REF)?.failureCode).toBe('CANCEL_UNCONFIRMED');
    });

    it('proceeds when the supplier says the booking is already cancelled', async () => {
        await booked();
        vi.spyOn(mock, 'cancelBooking').mockRejectedValue(
            new HotelProviderError('REJECTED', 'Booking already cancelled', { provider: 'mock', cause: { alreadyCancelled: true } }),
        );

        const out: any = await cancel();

        expect(out.success).toBe(true);
        expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
    });

    it('does not read "cancellation not permitted" as "already cancelled"', async () => {
        await booked();
        // OTV's own flag is a substring test on "cancel", which this message satisfies.
        vi.spyOn(mock, 'cancelBooking').mockRejectedValue(
            new HotelProviderError('REJECTED', 'Cancellation is not permitted for this rate', { provider: 'mock', cause: { alreadyCancelled: true } }),
        );

        await expect(cancel()).rejects.toMatchObject({ code: 'CANCEL_REFUSED' });
        nothingMoved();
    });

    it('does not ask the supplier again when only the refund is being retried', async () => {
        await booked('cancelled_refund_failed');
        const spy = vi.spyOn(mock, 'cancelBooking');

        const out: any = await cancel();

        expect(out.success).toBe(true);
        expect(spy).not.toHaveBeenCalled();
        expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
    });
});

describe('a card that was not authorised', () => {
    it('is refused at confirm, with the supplier never asked and the attempt left where it was', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
            id: PI, status: 'requires_payment_method', amount: 26400, currency: 'usd',
            metadata: { userId: USER, bookingReference: REF },
        } as never);

        await expect(service.confirmBooking(params(await quote())))
            .rejects.toMatchObject({ status: 402, code: 'PAYMENT_REQUIRED' });

        expect(bookCalls()).toBe(0);
        expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
        expect(repo.status(REF)).toBe('PAYMENT_PENDING');
        expect(prisma.bookings.create).not.toHaveBeenCalled();
    });

    it('is refused for a payment that belongs to someone else', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
            id: PI, status: 'requires_capture', amount: 26400, currency: 'usd',
            metadata: { userId: 'user-2', bookingReference: REF },
        } as never);

        await expect(service.confirmBooking(params(await quote())))
            .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
        expect(bookCalls()).toBe(0);
    });
});
