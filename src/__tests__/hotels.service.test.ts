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
        },
        refunds: {
            create: vi.fn(),
        },
    },
}));

vi.mock('@/lib/redis', () => ({
    redis: {
        set: vi.fn(),
        del: vi.fn(),
    },
}));

vi.mock('@/repositories/hotels.repository', () => ({
    HotelsRepository: vi.fn(function(this: any) {
        this.recordSearchDemand   = vi.fn().mockResolvedValue(undefined);
        this.findHotelContent     = vi.fn();
        this.findHotelReviews     = vi.fn();
        this.findHotelReviewItems = vi.fn();
    }),
}));

vi.mock('@/middleware/error.middleware', () => ({
    AppError: class AppError extends Error {
        constructor(public status: number, message: string, public code: string) {
            super(message);
        }
    },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { runTgxSearch } from '@/lib/hotels/search';
import { quoteTgx, bookTgx, cancelTgx } from '@/lib/hotels/travelgatex';
import { stripe } from '@/lib/stripe';
import { redis } from '@/lib/redis';
import { HotelsService } from '@/services/hotels.service';

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

const RATE_KEY   = 'tgx-token-abc123';
const OPTION_REF = 'quote-token-xyz';
const BOOKING_REF = 'CG-user1-1234567890';
const PI_ID       = 'pi_test_abc';
const USER_ID     = 'user-123';

// ── Tests ──────────────────────────────────────────────────────────────────────

let service: HotelsService;

beforeEach(() => {
    vi.clearAllMocks();
    service = new HotelsService();
});

// ─── search() ─────────────────────────────────────────────────────────────────

describe('HotelsService.search()', () => {
    it('calls runTgxSearch with the search params', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue(MOCK_SEARCH_RESULT as any);

        await service.search(SEARCH_PARAMS);

        expect(runTgxSearch).toHaveBeenCalledWith(
            expect.objectContaining({
                destination: 'Bangkok',
                checkIn:     '2026-09-01',
                checkOut:    '2026-09-05',
                adults:      2,
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

// ─── preBook() ────────────────────────────────────────────────────────────────

describe('HotelsService.preBook()', () => {
    it('calls quoteTgx with the rateKey', async () => {
        vi.mocked(quoteTgx).mockResolvedValue({ price: 120, currency: 'USD' } as any);

        await service.preBook({
            optionRefId: OPTION_REF,
            rateKey:     RATE_KEY,
            checkIn:     '2026-09-01',
            checkOut:    '2026-09-05',
            adults:      2,
            hotelId:     'H1',
        });

        expect(quoteTgx).toHaveBeenCalledWith(RATE_KEY);
    });

    it('returns the quote result', async () => {
        const quote = { price: 120, currency: 'USD', token: 'quote-xyz' };
        vi.mocked(quoteTgx).mockResolvedValue(quote as any);

        const result = await service.preBook({
            optionRefId: OPTION_REF,
            rateKey:     RATE_KEY,
            checkIn:     '2026-09-01',
            checkOut:    '2026-09-05',
            adults:      2,
            hotelId:     'H1',
        });

        expect(result).toEqual(quote);
    });
});

// ─── confirmBooking() ─────────────────────────────────────────────────────────

describe('HotelsService.confirmBooking()', () => {
    const BASE_PARAMS = {
        paymentIntentId: PI_ID,
        userId:          USER_ID,
        optionRefId:     OPTION_REF,
        rateKey:         RATE_KEY,
        guestName:       'Juan dela Cruz',
        guestEmail:      'juan@example.com',
        checkIn:         '2026-09-01',
        checkOut:        '2026-09-05',
        hotelId:         'H1',
    };

    function mockPI(overrides: Partial<{ status: string; metadata: any }> = {}) {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
            id:       PI_ID,
            status:   'requires_capture',
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

    it('calls bookTgx with optionRefId as quoteToken and guest details', async () => {
        mockPI();
        vi.mocked(bookTgx).mockResolvedValue({ status: 'CONFIRMED', clientRef: BOOKING_REF } as any);
        vi.mocked(stripe.paymentIntents.capture).mockResolvedValue({} as any);

        await service.confirmBooking(BASE_PARAMS);

        expect(bookTgx).toHaveBeenCalledWith(
            expect.objectContaining({
                quoteToken: OPTION_REF,
                holder: expect.objectContaining({
                    firstName: 'Juan',
                    email:     'juan@example.com',
                }),
            })
        );
    });

    it('captures the Stripe payment after a successful booking', async () => {
        mockPI();
        vi.mocked(bookTgx).mockResolvedValue({ status: 'CONFIRMED', clientRef: BOOKING_REF } as any);
        vi.mocked(stripe.paymentIntents.capture).mockResolvedValue({} as any);

        await service.confirmBooking(BASE_PARAMS);

        expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(PI_ID);
    });

    it('returns bookingRef and status from bookTgx response', async () => {
        mockPI();
        vi.mocked(bookTgx).mockResolvedValue({ status: 'CONFIRMED', clientRef: BOOKING_REF } as any);
        vi.mocked(stripe.paymentIntents.capture).mockResolvedValue({} as any);

        const result = await service.confirmBooking(BASE_PARAMS);

        expect(result.bookingRef).toBe(BOOKING_REF);
        expect(result.status).toBe('CONFIRMED');
    });
});

// ─── cancelBooking() ──────────────────────────────────────────────────────────

describe('HotelsService.cancelBooking()', () => {
    it('calls cancelTgx with the bookingRef as clientReference', async () => {
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID });

        expect(cancelTgx).toHaveBeenCalledWith({ clientReference: BOOKING_REF });
    });

    it('returns cancelled status', async () => {
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);

        const result = await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID });

        expect(result.status).toBe('cancelled');
    });

    it('cancels the PI when it is still requires_capture', async () => {
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'requires_capture' } as any);
        vi.mocked(stripe.paymentIntents.cancel).mockResolvedValue({} as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID, paymentIntentId: PI_ID });

        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(PI_ID, { cancellation_reason: 'requested_by_customer' });
        expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('issues a refund when the PI has already been captured', async () => {
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'succeeded' } as any);
        vi.mocked(stripe.refunds.create).mockResolvedValue({} as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID, paymentIntentId: PI_ID });

        expect(stripe.refunds.create).toHaveBeenCalledWith(
            expect.objectContaining({ payment_intent: PI_ID, reason: 'requested_by_customer' }),
            expect.objectContaining({ idempotencyKey: `hotel-refund-${BOOKING_REF}` })
        );
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    });

    it('does not touch Stripe when no paymentIntentId is provided', async () => {
        vi.mocked(cancelTgx).mockResolvedValue({ status: 'CANCELLED' } as any);

        await service.cancelBooking({ bookingRef: BOOKING_REF, userId: USER_ID });

        expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
        expect(stripe.refunds.create).not.toHaveBeenCalled();
    });
});
