import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/flights/search', () => ({
    searchFlights:      vi.fn(),
    applyServerFilters: vi.fn((offers: any[]) => offers),
}));

vi.mock('@/lib/flights/duffel', async (importOriginal) => ({
    seatMapServices:               (await importOriginal<typeof import('@/lib/flights/duffel')>()).seatMapServices,
    parseDuffelOffer:              vi.fn(),
    normalizedToFlightOffer:       vi.fn(),
    getDuffelAvailableServices:    vi.fn(),
    getDuffelSeatMaps:             vi.fn(),
    getDuffelBalances:             vi.fn(),
    getAvailableBalance:           vi.fn(),
    createDuffelCancellationQuote: vi.fn(),
    confirmDuffelCancellation:     vi.fn(),
    getDuffelOrder:                vi.fn(),
    placeDuffelOrder:              vi.fn(),
    refreshDuffelOffer:            vi.fn(),
    searchDuffel:                  vi.fn(),
}));

vi.mock('@/lib/flights/mystifly', () => ({
    mystiflyRequest: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
    stripe: {
        paymentIntents: {
            create:   vi.fn(),
            retrieve: vi.fn(),
            capture:  vi.fn(),
            cancel:   vi.fn(),
            search:   vi.fn().mockResolvedValue({ data: [] }),
        },
        refunds: {
            create: vi.fn(),
        },
    },
}));

vi.mock('@/repositories/flights.repository', () => ({
    FlightsRepository: vi.fn(function(this: any) {
        this.getActiveBookingsForUser           = vi.fn().mockResolvedValue([]);
        this.findSegmentConflict               = vi.fn().mockResolvedValue(null);
        this.createBookingSession              = vi.fn().mockResolvedValue({ id: 'sess-123' });
        this.updateBookingSessionPayment       = vi.fn().mockResolvedValue(undefined);
        this.updateBookingSessionAudit         = vi.fn().mockResolvedValue(undefined);
        this.updateBookingSessionDuffelPreOrder = vi.fn().mockResolvedValue(undefined);
        this.getFlightBookingBySession         = vi.fn().mockResolvedValue(null);
        this.getFlightBookingBySessionForUser  = vi.fn();
        this.getFlightBookingById              = vi.fn();
        this.setFlightBookingCancelRequested   = vi.fn().mockResolvedValue(true);
        this.updateFlightBookingCancellation   = vi.fn().mockResolvedValue(undefined);
        this.updateFlightBookingRefundedStatus = vi.fn().mockResolvedValue(undefined);
        this.updateFlightBookingPaymentIntentId = vi.fn().mockResolvedValue(undefined);
        this.getBookingSessionForCancelQuote   = vi.fn().mockResolvedValue(null);
    }),
}));

vi.mock('@/middleware/error.middleware', () => ({
    AppError: class AppError extends Error {
        constructor(public status: number, message: string, public code: string) {
            super(message);
        }
    },
}));

vi.mock('@/config', () => ({
    config: {
        DUFFEL_ACCESS_TOKEN: 'duffel_test_abc',
        FUNCTIONS_SECRET:    'test-secret',
    },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { searchFlights, applyServerFilters }                from '@/lib/flights/search';
import {
    placeDuffelOrder, getDuffelOrder,
    createDuffelCancellationQuote, confirmDuffelCancellation,
    getDuffelAvailableServices, getDuffelSeatMaps,
} from '@/lib/flights/duffel';
import { stripe }          from '@/lib/stripe';
import { FlightsService }  from '@/services/flights.service';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const USER_ID    = 'user-123';
const PI_ID      = 'pi_test_abc';
const SESSION_ID = 'sess-123';
const BOOKING_ID = 'bk-456';

const MOCK_OFFERS = [
    { provider: 'duffel', price: { total: 250, currency: 'USD' }, totalStops: 0, segments: [] },
];

const SEARCH_PARAMS = {
    origin:        'MNL',
    destination:   'NRT',
    departureDate: '2026-09-01',
    adults:        1,
    cabinClass:    'economy',
};

const RAW_OFFER = {
    id:                 'off-abc',
    passengers:         [{ id: 'pax1' }],
    total_amount:       '100.00',
    total_currency:     'usd',
    available_services: [],
};

const MOCK_FLIGHT = {
    price:    { total: 100, currency: 'USD' },
    segments: [{ origin: 'MNL', destination: 'NRT', departing_at: '2026-09-01T08:00:00' }],
    _rawOffer: RAW_OFFER,
};

const BOOK_PARAMS = {
    provider:       'duffel',
    flight:         MOCK_FLIGHT as any,
    passengers:     [{ firstName: 'Juan', lastName: 'Cruz', birthDate: '1990-01-01', gender: 'M', type: 'ADT' }],
    contact:        { email: 'juan@example.com', phone: '9171234567', countryCode: '63' },
    idempotencyKey: 'idem-abc',
    farePolicy:     { isRefundable: false, isChangeable: false } as any,
    userId:         USER_ID,
};

const MOCK_BOOKING = {
    id:                    BOOKING_ID,
    user_id:               USER_ID,
    provider:              'duffel',
    status:                'confirmed',
    pnr:                   'PNRABC',
    session_id:            SESSION_ID,
    payment_intent_id:     PI_ID,
    provider_order_id:     'ord-1',
    duffel_order_id:       null,
    total_price:           '100.00',
    refund_penalty_amount: null,
    refund_currency:       'USD',
    payment_currency:      'USD',
    charged_price:         '102.50',
    cancellation_log:      [],
};

function mockDuffelCancelFlow() {
    vi.mocked(getDuffelOrder).mockResolvedValue({ available_actions: ['cancel'] } as any);
    vi.mocked(createDuffelCancellationQuote).mockResolvedValue({ id: 'q1', refund_amount: '100', refund_currency: 'USD' } as any);
    vi.mocked(confirmDuffelCancellation).mockResolvedValue({ refund_amount: '100', refund_currency: 'USD' } as any);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

let service: FlightsService;

beforeEach(() => {
    vi.clearAllMocks();
    service = new FlightsService();
});

// ─── search() ─────────────────────────────────────────────────────────────────

describe('FlightsService.search()', () => {
    it('calls searchFlights with the given params', async () => {
        vi.mocked(searchFlights).mockResolvedValue(MOCK_OFFERS as any);

        await service.search(SEARCH_PARAMS as any);

        expect(searchFlights).toHaveBeenCalledWith(SEARCH_PARAMS);
    });

    it('passes results through applyServerFilters with the given filters', async () => {
        vi.mocked(searchFlights).mockResolvedValue(MOCK_OFFERS as any);
        const filters = { sortBy: 'price' as const, maxStops: 0 };

        await service.search(SEARCH_PARAMS as any, filters);

        expect(applyServerFilters).toHaveBeenCalledWith(MOCK_OFFERS, filters);
    });

    it('returns offers, totalResults, allCount, and a searchTimestamp', async () => {
        vi.mocked(searchFlights).mockResolvedValue(MOCK_OFFERS as any);
        vi.mocked(applyServerFilters).mockReturnValue(MOCK_OFFERS as any);

        const result = await service.search(SEARCH_PARAMS as any);

        expect(result.offers).toEqual(MOCK_OFFERS);
        expect(result.totalResults).toBe(1);
        expect(result.allCount).toBe(1);
        expect(result.searchTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

// ─── book() ───────────────────────────────────────────────────────────────────

describe('FlightsService.book()', () => {
    it('throws 422 FARE_UNAVAILABLE for mystifly provider', async () => {
        await expect(service.book({ ...BOOK_PARAMS, provider: 'mystifly_v2' }))
            .rejects.toMatchObject({ status: 422, code: 'FARE_UNAVAILABLE' });
    });

    it('throws 400 INVALID_PROVIDER for an unsupported provider', async () => {
        await expect(service.book({ ...BOOK_PARAMS, provider: 'amadeus' }))
            .rejects.toMatchObject({ status: 400, code: 'INVALID_PROVIDER' });
    });

    it('throws 400 INVALID_PRICE when the flight price is zero', async () => {
        const zeroFlight = { ...MOCK_FLIGHT, price: { total: 0, currency: 'USD' } };

        await expect(service.book({ ...BOOK_PARAMS, flight: zeroFlight as any }))
            .rejects.toMatchObject({ status: 400, code: 'INVALID_PRICE' });
    });

    it('calls placeDuffelOrder with the passenger name and contact from book params', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({
            kind: 'ok',
            order: { id: 'ord1', booking_reference: 'PNR1', documents: [] },
            finalTotal: '100.00', finalCurrency: 'usd',
        } as any);
        vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
            id: PI_ID, client_secret: 'pi_secret_xyz',
        } as any);

        await service.book(BOOK_PARAMS);

        expect(placeDuffelOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                rawOffer: RAW_OFFER,
                passengers: [expect.objectContaining({
                    id:          'pax1',
                    given_name:  'Juan',
                    family_name: 'Cruz',
                    email:       'juan@example.com',
                })],
            }),
        );
    });

    // The posted offer is a search result: Duffel never includes services on those, and
    // never lists seats on an offer at all. Pricing extras from it charged them at zero,
    // and Duffel refuses such orders (payment_amount_does_not_match_order_amount).
    describe('pricing selected seats and bags', () => {
        const SEARCH_RAW_OFFER = { id: 'off-abc', passengers: [{ id: 'pax1' }], total_amount: '100.00', total_currency: 'usd' };
        const flight = { ...MOCK_FLIGHT, _rawOffer: SEARCH_RAW_OFFER } as any;

        beforeEach(() => {
            vi.mocked(placeDuffelOrder).mockResolvedValue({
                kind: 'ok', order: { id: 'ord1', booking_reference: 'PNR1', documents: [] },
                finalTotal: '100.00', finalCurrency: 'usd',
            } as any);
            vi.mocked(stripe.paymentIntents.create).mockResolvedValue({ id: PI_ID, client_secret: 'pi_secret_xyz' } as any);
        });

        it('adds the bag price Duffel quotes for the offer', async () => {
            vi.mocked(getDuffelAvailableServices).mockResolvedValue([{ id: 'ase_bag', type: 'baggage', total_amount: '20.00' }]);

            await service.book({ ...BOOK_PARAMS, flight, bagServiceIds: ['ase_bag'] });

            expect(getDuffelAvailableServices).toHaveBeenCalledWith('off-abc');
            expect(placeDuffelOrder).toHaveBeenCalledWith(expect.objectContaining({ total: '120.00' }));
        });

        it('adds the seat price from the seat map', async () => {
            vi.mocked(getDuffelSeatMaps).mockResolvedValue([{
                cabins: [{ rows: [{ sections: [{ elements: [
                    { type: 'seat', designator: '1A', available_services: [{ id: 'ase_seat', passenger_id: 'pax1', total_amount: '12.50' }] },
                ] }] }] }],
            }]);

            await service.book({ ...BOOK_PARAMS, flight, seatServiceIds: ['ase_seat'] });

            expect(getDuffelSeatMaps).toHaveBeenCalledWith('off-abc');
            expect(placeDuffelOrder).toHaveBeenCalledWith(expect.objectContaining({ total: '112.50' }));
        });

        it('does not look prices up when nothing extra was chosen', async () => {
            await service.book({ ...BOOK_PARAMS, flight });

            expect(getDuffelAvailableServices).not.toHaveBeenCalled();
            expect(getDuffelSeatMaps).not.toHaveBeenCalled();
            expect(placeDuffelOrder).toHaveBeenCalledWith(expect.objectContaining({ total: '100.00' }));
        });

        it('refuses to place the order when Duffel will not quote the extras', async () => {
            vi.mocked(getDuffelAvailableServices).mockRejectedValue(Object.assign(new Error('Duffel services 503'), { status: 503 }));

            await expect(service.book({ ...BOOK_PARAMS, flight, bagServiceIds: ['ase_bag'] }))
                .rejects.toMatchObject({ status: 502, code: 'SERVICE_PRICES_UNAVAILABLE' });
            expect(placeDuffelOrder).not.toHaveBeenCalled();
        });
    });

    it('creates a Stripe PI with automatic capture and returns clientSecret + sessionId + paymentIntentId', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({
            kind: 'ok',
            order: { id: 'ord1', booking_reference: 'PNR1', documents: [] },
            finalTotal: '100.00', finalCurrency: 'usd',
        } as any);
        vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
            id: PI_ID, client_secret: 'pi_secret_xyz',
        } as any);

        const result = await service.book(BOOK_PARAMS);

        expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
            expect.objectContaining({ currency: 'usd', capture_method: 'automatic' }),
            expect.objectContaining({ idempotencyKey: expect.stringContaining('flight-pi-') }),
        );
        expect(result.clientSecret).toBe('pi_secret_xyz');
        expect(result.sessionId).toBe(SESSION_ID);
        expect(result.paymentIntentId).toBe(PI_ID);
    });

    it('throws 409 PRICE_CHANGED when the Duffel offer price has changed', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({
            kind: 'price_changed', oldPrice: 100, newPrice: 120, currency: 'usd',
        } as any);

        await expect(service.book(BOOK_PARAMS))
            .rejects.toMatchObject({ status: 409, code: 'PRICE_CHANGED' });
    });

    it('throws 409 OFFER_REPLACED when Duffel substitutes a new offer', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({
            kind: 'offer_replaced', newOffer: {},
        } as any);

        await expect(service.book(BOOK_PARAMS))
            .rejects.toMatchObject({ status: 409, code: 'OFFER_REPLACED' });
    });
});

// ─── confirm() ────────────────────────────────────────────────────────────────

describe('FlightsService.confirm()', () => {
    it('throws 403 SESSION_MISMATCH when the PI sessionId does not match', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
            id:       PI_ID,
            status:   'succeeded',
            metadata: { bookingSessionId: 'other-session', provider: 'duffel' },
        } as any);

        await expect(service.confirm(PI_ID, SESSION_ID, USER_ID, 'http://localhost:3001'))
            .rejects.toMatchObject({ status: 403, code: 'SESSION_MISMATCH' });
    });

    it('returns booking data immediately with source "webhook" if the booking already has a PNR', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
            id:       PI_ID,
            status:   'succeeded',
            metadata: { bookingSessionId: SESSION_ID, provider: 'duffel' },
        } as any);
        const repo = (service as any).repo;
        repo.getFlightBookingBySession.mockResolvedValue({
            id: BOOKING_ID, pnr: 'PNRABC', status: 'confirmed', payment_intent_id: PI_ID,
        });

        const result = await service.confirm(PI_ID, SESSION_ID, USER_ID, 'http://localhost:3001');

        expect(result.pnr).toBe('PNRABC');
        expect(result.source).toBe('webhook');
    });

    it('throws 402 PAYMENT_NOT_COMPLETED when Duffel PI is not in succeeded state', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
            id:       PI_ID,
            status:   'requires_capture',
            metadata: { bookingSessionId: SESSION_ID, provider: 'duffel' },
        } as any);
        const repo = (service as any).repo;
        repo.getFlightBookingBySession.mockResolvedValue(null);

        await expect(service.confirm(PI_ID, SESSION_ID, USER_ID, 'http://localhost:3001'))
            .rejects.toMatchObject({ status: 402, code: 'PAYMENT_NOT_COMPLETED' });
    });
});

// ─── cancelBooking() ──────────────────────────────────────────────────────────

describe('FlightsService.cancelBooking()', () => {
    it('throws 404 NOT_FOUND when the booking does not exist', async () => {
        const repo = (service as any).repo;
        repo.getFlightBookingById.mockResolvedValue(null);

        await expect(service.cancelBooking(BOOKING_ID, USER_ID))
            .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it('throws 403 FORBIDDEN when the user does not own the booking', async () => {
        const repo = (service as any).repo;
        repo.getFlightBookingById.mockResolvedValue({ ...MOCK_BOOKING, user_id: 'other-user' });

        await expect(service.cancelBooking(BOOKING_ID, USER_ID))
            .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    });

    it('returns terminal status immediately without calling the supplier', async () => {
        const repo = (service as any).repo;
        repo.getFlightBookingById.mockResolvedValue({ ...MOCK_BOOKING, status: 'cancelled' });

        const result = await service.cancelBooking(BOOKING_ID, USER_ID);

        expect(result.status).toBe('cancelled');
        expect(getDuffelOrder).not.toHaveBeenCalled();
    });

    it('throws 422 INVALID_STATUS for a booking in an ineligible status', async () => {
        const repo = (service as any).repo;
        repo.getFlightBookingById.mockResolvedValue({ ...MOCK_BOOKING, status: 'pending' });

        await expect(service.cancelBooking(BOOKING_ID, USER_ID))
            .rejects.toMatchObject({ status: 422, code: 'INVALID_STATUS' });
    });

    it('cancels the Stripe PI when it is still requires_capture', async () => {
        const repo = (service as any).repo;
        repo.getFlightBookingById.mockResolvedValue(MOCK_BOOKING);
        mockDuffelCancelFlow();
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
            status: 'requires_capture', amount: 10250, currency: 'usd',
        } as any);
        vi.mocked(stripe.paymentIntents.cancel).mockResolvedValue({} as any);

        const result = await service.cancelBooking(BOOKING_ID, USER_ID);

        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(
            PI_ID, { cancellation_reason: 'requested_by_customer' },
        );
        expect(stripe.refunds.create).not.toHaveBeenCalled();
        expect(result.status).toBe('refunded');
    });

    it('issues a Stripe refund when the PI has already been captured', async () => {
        const repo = (service as any).repo;
        repo.getFlightBookingById.mockResolvedValue(MOCK_BOOKING);
        mockDuffelCancelFlow();
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
            status: 'succeeded', amount: 10250, currency: 'usd',
        } as any);
        vi.mocked(stripe.refunds.create).mockResolvedValue({ status: 'succeeded', id: 'ref-1' } as any);

        const result = await service.cancelBooking(BOOKING_ID, USER_ID);

        expect(stripe.refunds.create).toHaveBeenCalledWith(
            expect.objectContaining({
                payment_intent: PI_ID,
                reason:         'requested_by_customer',
            }),
            expect.objectContaining({ idempotencyKey: `refund-${BOOKING_ID}` }),
        );
        expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
        expect(result.status).toBe('refunded');
    });
});

// ─── getBags() ────────────────────────────────────────────────────────────────

describe('FlightsService.getBags()', () => {
    it('reports an expired offer as 404 so the client treats it as an error', async () => {
        // Sent as 200 before, which the web client's http helper reads as success.
        vi.mocked(getDuffelAvailableServices).mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));

        await expect(service.getBags('off-gone', []))
            .rejects.toMatchObject({ status: 404, code: 'OFFER_EXPIRED' });
    });
});
