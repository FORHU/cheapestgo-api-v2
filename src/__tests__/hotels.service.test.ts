import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/hotels/search', () => ({
    runTgxSearch: vi.fn(),
}));

vi.mock('@/lib/hotels/travelgatex', () => ({
    quoteTgx:  vi.fn(),
    bookTgx:   vi.fn(),
    cancelTgx: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
    stripe: {
        paymentIntents: {
            create:   vi.fn(),
            retrieve: vi.fn(),
            capture:  vi.fn(),
            cancel:   vi.fn(),
            update:   vi.fn(),
            search:   vi.fn(),
        },
        refunds: {
            create: vi.fn(),
        },
    },
}));

vi.mock('@/repositories/hotels.repository', () => ({
    HotelsRepository: vi.fn(function(this: any) {
        this.recordSearchDemand   = vi.fn().mockResolvedValue(undefined);
        this.findHotelContent     = vi.fn();
        this.findHotelReviews     = vi.fn();
        this.findHotelReviewItems = vi.fn();
        this.savePrebookQuote     = vi.fn().mockResolvedValue(undefined);
        this.savePolicySnapshot   = vi.fn().mockResolvedValue(undefined);
        // Cancellation reads the terms recorded at booking time. Null is the
        // "no policy on record" path, which refuses to refund rather than guess.
        this.findPolicySnapshot   = vi.fn().mockResolvedValue(null);
        // Checkout charges from this row rather than the client's payload, so these
        // cases have to supply one; a null here is the QUOTE_NOT_FOUND path.
        this.findPrebookQuote     = vi.fn();
    }),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        bookings: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@/middleware/error.middleware', () => ({
    AppError: class AppError extends Error {
        constructor(public status: number, message: string, public code: string) {
            super(message);
        }
    },
}));

vi.mock('@/lib/pricing', () => ({
    HOTEL_MARKUP:  0.05,
    BUNDLE_MARKUP: 0.04,
    HOTEL_FX_DISPLAY_TOLERANCE: 0.005,
    PREBOOK_QUOTE_TTL_MS: 30 * 60 * 1000,
    applyMarkup: (base: number, rate: number) => ({
        originalPrice: base,
        chargedPrice:  Math.round(base * (1 + rate) * 100) / 100,
        markupAmount:  Math.round(base * rate * 100) / 100,
        markupRate:    rate,
    }),
    toStripeAmount: (price: number, currency: string) =>
        ['jpy', 'krw'].includes(currency.toLowerCase()) ? Math.round(price) : Math.round(price * 100),
}));

vi.mock('crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('crypto')>();
    return { ...actual };
});

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { runTgxSearch } from '@/lib/hotels/search';
import { quoteTgx, bookTgx, cancelTgx } from '@/lib/hotels/travelgatex';
import { stripe } from '@/lib/stripe';
import { HotelsService } from '@/services/hotels.service';
import { prisma } from '@/lib/prisma';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const SEARCH_PARAMS = {
    destination: 'Bangkok',
    checkIn:     '2026-09-01',
    checkOut:    '2026-09-05',
    adults:      2,
    countryCode: 'TH',
};

const MOCK_SEARCH_RESULT = {
    data: [{ hotelId: 'H1', name: 'The Grand', price: 120, currency: 'USD' }],
    totalCount: 1,
};


const OPTION_REF = 'quote-token-xyz';
const BOOKING_REF = 'CG-user1-1234567890';
const PI_ID       = 'pi_test_abc';
const USER_ID     = 'user-123';

// ── Tests ──────────────────────────────────────────────────────────────────────

let service: HotelsService;

beforeEach(() => {
    vi.clearAllMocks();
    service = new HotelsService();
    // default prisma stubs (tests that need specific values override these)
    vi.mocked(prisma.bookings.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.bookings.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.bookings.create).mockResolvedValue({} as any);
    vi.mocked(prisma.bookings.update).mockResolvedValue({} as any);
});

// ─── search() ─────────────────────────────────────────────────────────────────

describe('HotelsService.search()', () => {
    it('calls runTgxSearch with the search params', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue(MOCK_SEARCH_RESULT as any);

        await service.search(SEARCH_PARAMS);

        expect(runTgxSearch).toHaveBeenCalledWith(
            expect.objectContaining({
                cityName: 'Bangkok',
                checkin:  '2026-09-01',
                checkout: '2026-09-05',
                adults:   2,
            })
        );
    });

    it('returns the search results', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue(MOCK_SEARCH_RESULT as any);

        const result = await service.search(SEARCH_PARAMS);

        expect(result).toEqual(MOCK_SEARCH_RESULT);
    });

    it('records demand even if demand recording fails', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue(MOCK_SEARCH_RESULT as any);

        const result = await service.search(SEARCH_PARAMS);

        expect(result).toEqual(MOCK_SEARCH_RESULT);
    });
});

// ─── createPayment() ──────────────────────────────────────────────────────────

describe('HotelsService.createPayment()', () => {
    const BASE_PARAMS = {
        userId:       USER_ID,
        prebookId:    'TGX:b260901!~|c260905!~|d10000352!~|hUS',
        amount:       300,
        currency:     'USD',
        holderEmail:  'juan@example.com',
        propertyName: 'The Grand Hotel',
        roomName:     'Deluxe Room',
        checkIn:      '2026-09-01',
        checkOut:     '2026-09-05',
    };

    // The recorded supplier quote these payments charge from. Same currency as the
    // charge, so no FX is involved and the amount is taken as-is.
    beforeEach(() => {
        (service as any).repo.findPrebookQuote.mockResolvedValue({
            gross:      300,
            currency:   'USD',
            expires_at: new Date(Date.now() + 20 * 60_000),
        });
    });

    it('charges the recorded quote, not a tampered payload', async () => {
        vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
            id: PI_ID, client_secret: 'cs_test_secret',
        } as any);

        // Browser claims the room costs 1 while the supplier quoted 300.
        await expect(service.createPayment({ ...BASE_PARAMS, amount: 1 }))
            .rejects.toMatchObject({ code: 'PRICE_CHANGED', status: 409 });

        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('refuses a prebookId with no recorded quote', async () => {
        (service as any).repo.findPrebookQuote.mockResolvedValue(null);

        await expect(service.createPayment(BASE_PARAMS))
            .rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND', status: 409 });

        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('refuses an expired quote', async () => {
        (service as any).repo.findPrebookQuote.mockResolvedValue({
            gross:      300,
            currency:   'USD',
            expires_at: new Date(Date.now() - 1_000),
        });

        await expect(service.createPayment(BASE_PARAMS))
            .rejects.toMatchObject({ code: 'QUOTE_EXPIRED', status: 409 });

        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('throws 400 for unsupported currency', async () => {
        await expect(service.createPayment({ ...BASE_PARAMS, currency: 'XYZ' }))
            .rejects.toMatchObject({ status: 400, code: 'UNSUPPORTED_CURRENCY' });
    });

    it('throws 400 for amount exceeding currency cap', async () => {
        await expect(service.createPayment({ ...BASE_PARAMS, amount: 999_999_999 }))
            .rejects.toMatchObject({ status: 400, code: 'INVALID_AMOUNT' });
    });

    it('throws 409 when user has overlapping booking at same property', async () => {
        vi.mocked(prisma.bookings.findFirst).mockResolvedValueOnce({
            booking_id: 'EXISTING-1',
            check_in:   new Date('2026-09-02'),
            check_out:  new Date('2026-09-06'),
        } as any);

        await expect(service.createPayment(BASE_PARAMS))
            .rejects.toMatchObject({ code: 'DUPLICATE_BOOKING' });
    });

    it('creates a PaymentIntent with manual capture and markup applied', async () => {
        vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
            id:            PI_ID,
            client_secret: 'cs_test_secret',
        } as any);

        await service.createPayment(BASE_PARAMS);

        expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
            expect.objectContaining({
                currency:       'usd',
                capture_method: 'manual',
                amount:         expect.any(Number), // 300 * 1.05 * 100 = 31500
                metadata:       expect.objectContaining({ userId: USER_ID, type: 'hotel' }),
            }),
            expect.objectContaining({ idempotencyKey: expect.stringContaining(`hotel-pi-${USER_ID}`) })
        );
    });

    it('applies bundle markup when bundleFlightId is provided', async () => {
        vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
            id: PI_ID, client_secret: 'cs_test_secret',
        } as any);

        await service.createPayment({ ...BASE_PARAMS, bundleFlightId: 'FLT-123' });

        expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({ type: 'hotel_bundle', bundleFlightId: 'FLT-123' }),
            }),
            expect.anything()
        );
    });

    it('returns success with clientSecret and paymentIntentId', async () => {
        vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
            id:            PI_ID,
            client_secret: 'cs_test_secret',
        } as any);

        const result = await service.createPayment(BASE_PARAMS);

        expect(result.success).toBe(true);
        expect(result.data?.paymentIntentId).toBe(PI_ID);
        expect(result.data?.clientSecret).toBe('cs_test_secret');
    });
});

// ─── preBook() ────────────────────────────────────────────────────────────────

describe('HotelsService.preBook()', () => {
    it('rejects non-TGX offerId', async () => {
        await expect(service.preBook({ offerId: 'LITEAPI:123' })).rejects.toThrow();
    });

    it('rejects malformed TGX token', async () => {
        await expect(service.preBook({ offerId: 'TGX:bad-token' })).rejects.toThrow();
    });
});

// ─── confirmBooking() ─────────────────────────────────────────────────────────

describe('HotelsService.confirmBooking()', () => {
    const BASE_PARAMS = {
        paymentIntentId: PI_ID,
        userId:          USER_ID,
        prebookId:       `TGX:${OPTION_REF}`,
        holder:          { firstName: 'Juan', lastName: 'dela Cruz', email: 'juan@example.com' },
        checkIn:         '2026-09-01',
        checkOut:        '2026-09-05',
    };

    function mockPI(overrides: Partial<{ status: string; metadata: any; amount: number; currency: string }> = {}) {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
            id:       PI_ID,
            status:   'requires_capture',
            amount:   12000,
            currency: 'usd',
            metadata: { userId: USER_ID },
            ...overrides,
        } as any);
    }

    it('throws 403 when userId does not match PI metadata', async () => {
        mockPI({ metadata: { userId: 'other-user' } });

        await expect(service.confirmBooking(BASE_PARAMS))
            .rejects.toMatchObject({ status: 403 });
    });

    it('throws 402 when PI status is not requires_capture', async () => {
        mockPI({ status: 'succeeded' });

        await expect(service.confirmBooking(BASE_PARAMS))
            .rejects.toMatchObject({ status: 402 });
    });

    it('calls bookTgx with quoteToken and holder details', async () => {
        mockPI();
        vi.mocked(bookTgx).mockResolvedValue({ status: 'confirmed', clientRef: BOOKING_REF, price: { gross: 120, net: 110, currency: 'USD' } } as any);
        vi.mocked(stripe.paymentIntents.capture).mockResolvedValue({} as any);
        vi.mocked(stripe.paymentIntents.update).mockResolvedValue({} as any);

        await service.confirmBooking(BASE_PARAMS);

        expect(bookTgx).toHaveBeenCalledWith(
            expect.objectContaining({
                quoteToken: OPTION_REF,
                holder: expect.objectContaining({ firstName: 'Juan', email: 'juan@example.com' }),
            })
        );
    });

    it('captures the Stripe payment after a successful booking', async () => {
        mockPI();
        vi.mocked(bookTgx).mockResolvedValue({ status: 'confirmed', clientRef: BOOKING_REF, price: { gross: 120, net: 110, currency: 'USD' } } as any);
        vi.mocked(stripe.paymentIntents.capture).mockResolvedValue({} as any);
        vi.mocked(stripe.paymentIntents.update).mockResolvedValue({} as any);

        await service.confirmBooking(BASE_PARAMS);

        expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(PI_ID);
    });

    it('returns success with bookingId from bookTgx response', async () => {
        mockPI();
        vi.mocked(bookTgx).mockResolvedValue({ status: 'confirmed', clientRef: BOOKING_REF, price: { gross: 120, net: 110, currency: 'USD' } } as any);
        vi.mocked(stripe.paymentIntents.capture).mockResolvedValue({} as any);
        vi.mocked(stripe.paymentIntents.update).mockResolvedValue({} as any);

        const result = await service.confirmBooking(BASE_PARAMS);

        expect(result.success).toBe(true);
        expect(result.data?.bookingId).toBe(BOOKING_REF);
    });
});

// ─── cancelBooking() ──────────────────────────────────────────────────────────

describe('HotelsService.cancelBooking()', () => {
    const MOCK_BOOKING = {
        booking_id:       BOOKING_REF,
        user_id:          USER_ID,
        payment_intent_id: PI_ID,
        status:           'confirmed',
        provider:         'travelgatex',
        provider_metadata: { hotelCode: '10000352', supplierRef: 'SUP-REF' },
        property_name:    'The Grand Hotel',
        // What was paid. Cancellation refuses outright without it, since a share of an
        // unreadable amount is not something to hand back.
        total_price:      1000,
        currency:         'PHP',
        check_in:         new Date(Date.now() + 30 * 86_400_000),
    };

    function mockBookingRow(overrides: Partial<typeof MOCK_BOOKING> = {}) {
        vi.mocked(prisma.bookings.findFirst).mockResolvedValue({ ...MOCK_BOOKING, ...overrides } as any);
        vi.mocked(prisma.bookings.update).mockResolvedValue({} as any);
    }

    it('throws 404 when booking is not found', async () => {
        vi.mocked(prisma.bookings.findFirst).mockResolvedValue(null);

        await expect(service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID }))
            .rejects.toMatchObject({ status: 404 });
    });

    it('throws 403 when userId does not own the booking', async () => {
        mockBookingRow({ user_id: 'other-user' });

        await expect(service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID }))
            .rejects.toMatchObject({ status: 403 });
    });

    it('calls cancelTgx with clientReference, hotelCode and supplierRef from metadata', async () => {
        mockBookingRow();
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'requires_capture', amount: 12000 } as any);
        vi.mocked(stripe.paymentIntents.cancel).mockResolvedValue({} as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID, paymentIntentId: PI_ID });

        expect(cancelTgx).toHaveBeenCalledWith(expect.objectContaining({
            clientReference: BOOKING_REF,
            hotelCode:       '10000352',
            supplierReference: 'SUP-REF',
        }));
    });

    it('returns success with bookingId and status', async () => {
        mockBookingRow();
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'requires_capture', amount: 12000 } as any);
        vi.mocked(stripe.paymentIntents.cancel).mockResolvedValue({} as any);

        const result = await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID, paymentIntentId: PI_ID });

        expect(result.success).toBe(true);
        expect(result.data?.bookingId).toBe(BOOKING_REF);
    });

    it('cancels the PI when it is still requires_capture', async () => {
        mockBookingRow();
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'requires_capture', amount: 12000 } as any);
        vi.mocked(stripe.paymentIntents.cancel).mockResolvedValue({} as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID, paymentIntentId: PI_ID });

        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI_ID, { cancellation_reason: 'requested_by_customer' });
        expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    /** Terms recorded at booking time; cancellation is judged against these. */
    const givePolicy = (policy: unknown) =>
        (service as any).repo.findPolicySnapshot.mockResolvedValue(policy);

    const freeCancellation = {
        policyType: 'free_cancellation' as const,
        freeCancelDeadline: new Date(Date.now() + 7 * 86_400_000),
        tiers: [],
    };

    it('refunds in full when the terms say free cancellation', async () => {
        mockBookingRow();
        givePolicy(freeCancellation);
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'succeeded', amount: 12000 } as any);
        vi.mocked(stripe.refunds.create).mockResolvedValue({ id: 're_test', status: 'succeeded' } as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID, paymentIntentId: PI_ID });

        expect(stripe.refunds.create).toHaveBeenCalledWith(
            expect.objectContaining({ payment_intent: PI_ID, amount: 12000, reason: 'requested_by_customer' }),
            expect.objectContaining({ idempotencyKey: `hotel-refund-${BOOKING_REF}-12000` })
        );
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });

    it('refunds nothing on a non-refundable rate', async () => {
        // The bug this replaced: pi.amount went back regardless, so the guest was made
        // whole out of our own pocket while the supplier still charged for the room.
        mockBookingRow();
        givePolicy({ policyType: 'non_refundable', freeCancelDeadline: null, tiers: [] });
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'succeeded', amount: 12000 } as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID, paymentIntentId: PI_ID });

        expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('refunds nothing when no terms were ever recorded', async () => {
        mockBookingRow();
        givePolicy(null);
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'succeeded', amount: 12000 } as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID, paymentIntentId: PI_ID });

        expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('scales the refund to the penalty in force', async () => {
        // A 250 penalty against a 1000 booking leaves 75% of whatever was charged.
        mockBookingRow({ total_price: 1000, currency: 'PHP' } as never);
        givePolicy({
            policyType: 'tiered',
            freeCancelDeadline: new Date(Date.now() - 86_400_000),
            tiers: [{
                cancelDeadline: new Date(Date.now() + 3 * 86_400_000),
                penaltyAmount: 250, penaltyType: 'fixed', currency: 'PHP', tierOrder: 0,
            }],
        });
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'succeeded', amount: 12000 } as any);
        vi.mocked(stripe.refunds.create).mockResolvedValue({ id: 're_test', status: 'succeeded' } as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID, paymentIntentId: PI_ID });

        expect(stripe.refunds.create).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 9000 }),
            expect.anything(),
        );
    });

    it('does not touch Stripe when no PI is found anywhere', async () => {
        mockBookingRow({ payment_intent_id: undefined });
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);
        vi.mocked(stripe.paymentIntents.search).mockResolvedValue({ data: [] } as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID });

        expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
        expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('updates booking status in DB after cancel', async () => {
        mockBookingRow();
        givePolicy(freeCancellation);
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'succeeded', amount: 12000 } as any);
        vi.mocked(stripe.refunds.create).mockResolvedValue({ id: 're_test', status: 'succeeded' } as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID, paymentIntentId: PI_ID });

        expect(prisma.bookings.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { booking_id: BOOKING_REF },
            data:  expect.objectContaining({ status: 'cancelled_refunded' }),
        }));
    });
});
