import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/flights/search', () => ({
    searchFlightsWithStatus: vi.fn(),
    searchFlights:      vi.fn(),
    applyServerFilters: vi.fn((offers: any[]) => offers),
}));

vi.mock('@/lib/flights/duffel', () => ({
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
    ORDER_CREATE_TIMEOUT_MS:       130_000,
    searchDuffel:                  vi.fn(),
}));

vi.mock('@/lib/flights/duffelOrderReconcile', () => ({
    findOrderFromTimedOutAttempt: vi.fn(),
    toReconciledOrder: vi.fn(),
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
        this.findRecentPreOrderSessions        = vi.fn().mockResolvedValue([]);
        this.expireSessionsForPreOrder         = vi.fn().mockResolvedValue(undefined);
        this.getFlightBookingBySession         = vi.fn().mockResolvedValue(null);
        this.getFlightBookingBySessionForUser  = vi.fn();
        this.getFlightBookingById              = vi.fn();
        this.setFlightBookingCancelRequested   = vi.fn().mockResolvedValue(true);
        this.updateFlightBookingCancellation   = vi.fn().mockResolvedValue(undefined);
        this.updateFlightBookingRefundedStatus = vi.fn().mockResolvedValue(undefined);
        this.updateFlightBookingPaymentIntentId = vi.fn().mockResolvedValue(undefined);
        this.getBookingSessionForCancelQuote   = vi.fn().mockResolvedValue(null);
        this.getPriceCalendarRaw               = vi.fn();
        this.getPriceCalendarFallback          = vi.fn();
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

import { searchFlightsWithStatus, applyServerFilters }      from '@/lib/flights/search';
import {
    placeDuffelOrder, getDuffelOrder,
    createDuffelCancellationQuote, confirmDuffelCancellation,
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
    const answering = (offers: unknown[], failedProviders: string[] = []) =>
        vi.mocked(searchFlightsWithStatus).mockResolvedValue({ offers, failedProviders } as any);

    it('searches with the given params', async () => {
        answering(MOCK_OFFERS);

        await service.search(SEARCH_PARAMS as any);

        expect(searchFlightsWithStatus).toHaveBeenCalledWith(SEARCH_PARAMS);
    });

    it('passes results through applyServerFilters with the given filters', async () => {
        answering(MOCK_OFFERS);
        const filters = { sortBy: 'price' as const, maxStops: 0 };

        await service.search(SEARCH_PARAMS as any, filters);

        expect(applyServerFilters).toHaveBeenCalledWith(MOCK_OFFERS, filters);
    });

    it('returns offers, totalResults, allCount, and a searchTimestamp', async () => {
        answering(MOCK_OFFERS);
        vi.mocked(applyServerFilters).mockReturnValue(MOCK_OFFERS as any);

        const result = await service.search(SEARCH_PARAMS as any);

        expect(result.offers).toEqual(MOCK_OFFERS);
        expect(result.totalResults).toBe(1);
        expect(result.allCount).toBe(1);
        expect(result.searchTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('tells an outage apart from a route nobody flies', async () => {
        // Presented identically, a provider that could not answer reads to the traveller as
        // "there are no flights" — with nothing to retry.
        answering([], ['Duffel']);
        vi.mocked(applyServerFilters).mockReturnValue([] as any);

        const outage = await service.search(SEARCH_PARAMS as any);
        expect(outage).toMatchObject({ providersFailed: true, failedProviders: ['Duffel'] });

        answering([]);
        const emptyRoute = await service.search(SEARCH_PARAMS as any);
        expect(emptyRoute).toMatchObject({ providersFailed: false, failedProviders: [] });
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
            kind: 'success',
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

    it('creates a Stripe PI with automatic capture and returns clientSecret + sessionId + paymentIntentId', async () => {
        vi.mocked(placeDuffelOrder).mockResolvedValue({
            kind: 'success',
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

// ─── offerRefresh() ───────────────────────────────────────────────────────────

describe('FlightsService.offerRefresh()', () => {
    const seg = (flightNumber: string, departingAt: string) => ({
        marketing_carrier: { iata_code: 'PR' },
        marketing_carrier_flight_number: flightNumber,
        origin: { iata_code: 'MNL' },
        destination: { iata_code: 'NRT' },
        departing_at: departingAt,
        passengers: [{ cabin_class: 'economy' }],
    });
    const offer = (id: string, flightNumber: string, departingAt: string, total: string) => ({
        id, total_amount: total, total_currency: 'USD',
        slices: [{ segments: [seg(flightNumber, departingAt)] }],
    });

    const chosen = offer('off-chosen', '432', '2026-10-01T06:00:00Z', '250.00');

    it('replaces an expired offer only with the same flight', async () => {
        const { refreshDuffelOffer, parseDuffelOffer, normalizedToFlightOffer } = await import('@/lib/flights/duffel');
        vi.mocked(refreshDuffelOffer).mockResolvedValue([
            offer('off-cheaper-evening', '436', '2026-10-01T22:00:00Z', '199.00'),
            offer('off-same', '432', '2026-10-01T06:00:00Z', '262.00'),
        ] as any);
        vi.mocked(parseDuffelOffer).mockReturnValue({} as any);
        vi.mocked(normalizedToFlightOffer).mockReturnValue({ id: 'normalized' } as any);

        const result = await service.offerRefresh(chosen);

        expect(result).toMatchObject({ success: true, newOfferId: 'off-same' });
    });

    it('reports the flight unavailable rather than substituting a different one', async () => {
        // The cheaper 22:00 departure on the same airline is exactly what the old match would
        // have picked, sixteen hours from the flight the traveller chose.
        const { refreshDuffelOffer } = await import('@/lib/flights/duffel');
        vi.mocked(refreshDuffelOffer).mockResolvedValue([
            offer('off-cheaper-evening', '436', '2026-10-01T22:00:00Z', '199.00'),
        ] as any);

        const result = await service.offerRefresh(chosen);

        expect(result).toMatchObject({ success: false, reason: 'no_same_itinerary' });
    });

    it('answers an upstream failure without an error status', async () => {
        const { refreshDuffelOffer } = await import('@/lib/flights/duffel');
        vi.mocked(refreshDuffelOffer).mockRejectedValue(new Error('Duffel 429'));

        await expect(service.offerRefresh(chosen)).resolves.toMatchObject({ success: false, reason: 'upstream_error' });
    });
});

// ─── book(): the safety rules ported from v1 ──────────────────────────────────

describe('FlightsService.book() — never buys a trip twice, never strands an order', () => {
    const placed = () => vi.mocked(placeDuffelOrder).mockResolvedValue({
        kind: 'success',
        order: { id: 'ord-new', booking_reference: 'PNRNEW', documents: [] },
        finalTotal: '100.00', finalCurrency: 'usd',
    } as any);
    const pi = () => vi.mocked(stripe.paymentIntents.create).mockResolvedValue({ id: PI_ID, client_secret: 'secret' } as any);
    const repoOf = () => (service as any).repo;

    const earlierSession = {
        id: 'sess-earlier', status: 'payment_initiated', duffel_pre_order_id: 'ord-earlier',
        payment_intent_id: 'pi_earlier', flight: { _offerId: RAW_OFFER.id },
        created_at: new Date(Date.now() - 5 * 60_000),
    };
    const liveOrder = (patch: Record<string, any> = {}) => ({
        id: 'ord-earlier', booking_reference: 'PNROLD', total_amount: '100.00', total_currency: 'USD',
        documents: [], passengers: [{ given_name: 'Juan', family_name: 'Cruz', born_on: '1990-01-01' }],
        ...patch,
    });

    it('reuses the order a previous attempt bought for the same offer and people', async () => {
        // Back to details, then submit again: without this the traveller pays for two tickets.
        repoOf().findRecentPreOrderSessions.mockResolvedValue([earlierSession]);
        vi.mocked(getDuffelOrder).mockResolvedValue(liveOrder() as any);
        pi();

        await service.book(BOOK_PARAMS);

        expect(placeDuffelOrder).not.toHaveBeenCalled();
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_earlier');
    });

    it('releases the earlier order and buys again when a name was corrected', async () => {
        // Reusing it would ticket the misspelled name the traveller went back to fix.
        repoOf().findRecentPreOrderSessions.mockResolvedValue([earlierSession]);
        vi.mocked(getDuffelOrder).mockResolvedValue(liveOrder({
            passengers: [{ given_name: 'Jaun', family_name: 'Cruz', born_on: '1990-01-01' }],
        }) as any);
        vi.mocked(createDuffelCancellationQuote).mockResolvedValue({ id: 'q-old' } as any);
        vi.mocked(confirmDuffelCancellation).mockResolvedValue({} as any);
        placed(); pi();

        await service.book(BOOK_PARAMS);

        expect(createDuffelCancellationQuote).toHaveBeenCalledWith('ord-earlier');
        expect(placeDuffelOrder).toHaveBeenCalled();
        expect(repoOf().expireSessionsForPreOrder).toHaveBeenCalledWith('ord-earlier');
    });

    it('cancels the airline order when anything after it fails', async () => {
        // A Stripe outage used to leave a paid ticket against the balance that nothing recorded.
        placed();
        vi.mocked(stripe.paymentIntents.create).mockRejectedValue(new Error('Stripe is down'));
        vi.mocked(createDuffelCancellationQuote).mockResolvedValue({ id: 'q-new' } as any);
        vi.mocked(confirmDuffelCancellation).mockResolvedValue({} as any);

        await expect(service.book(BOOK_PARAMS)).rejects.toThrow('Stripe is down');

        expect(createDuffelCancellationQuote).toHaveBeenCalledWith('ord-new');
        expect(confirmDuffelCancellation).toHaveBeenCalledWith('q-new');
    });

    it('lets a traveller book a duplicate departure once they have been warned', async () => {
        // Warned, not refused (ADR-0011).
        repoOf().getActiveBookingsForUser.mockResolvedValue([{ id: 'bk-other' }]);
        repoOf().findSegmentConflict.mockResolvedValue({ booking_id: 'bk-other' });
        const firstSegFlight = { ...MOCK_FLIGHT, slices: [{ segments: [{ origin: { iata_code: 'MNL' }, departing_at: '2026-09-01T08:00:00' }] }] };

        await expect(service.book({ ...BOOK_PARAMS, flight: firstSegFlight as any }))
            .rejects.toMatchObject({ code: 'DUPLICATE_BOOKING' });

        placed(); pi();
        await expect(service.book({ ...BOOK_PARAMS, flight: firstSegFlight as any, acknowledgeDuplicate: true }))
            .resolves.toMatchObject({ paymentIntentId: PI_ID });
    });

    it('sends passport details to the airline when the offer asks for them', async () => {
        placed(); pi();
        const wantsDocs = { ...RAW_OFFER, passenger_identity_documents_required: true };
        const flight = { ...MOCK_FLIGHT, _rawOffer: wantsDocs };

        await service.book({
            ...BOOK_PARAMS,
            flight: flight as any,
            passengers: [{ ...BOOK_PARAMS.passengers[0], passportNumber: 'P1234567', passportExpiry: '2031-01-01', nationality: 'ph' }],
        });

        expect(placeDuffelOrder).toHaveBeenCalledWith(expect.objectContaining({
            passengers: [expect.objectContaining({
                identity_documents: [{ type: 'passport', unique_identifier: 'P1234567', issuing_country_code: 'PH', expires_on: '2031-01-01' }],
            })],
        }));
    });
});

describe('FlightsService.book() — a timed-out order is looked for, not written off', () => {
    it('adopts the order Duffel created while the request was abandoned', async () => {
        // Aborting POST /air/orders does not cancel it. Reporting failure here leaves a real,
        // paid, ticketed PNR against the balance with nothing linking it to the traveller.
        const { findOrderFromTimedOutAttempt, toReconciledOrder } = await import('@/lib/flights/duffelOrderReconcile');
        vi.mocked(placeDuffelOrder).mockResolvedValue({
            kind: 'error', status: 504, timedOut: true,
            data: { errors: [{ code: 'timeout', message: 'timed out' }] },
        } as any);
        vi.mocked(findOrderFromTimedOutAttempt).mockResolvedValue({
            id: 'ord-recovered', booking_reference: 'PNRREC', total_amount: '100.00', total_currency: 'usd',
            documents: [{ type: 'electronic_ticket', unique_identifier: 'T-1' }],
        } as any);
        vi.mocked(toReconciledOrder).mockReturnValue({
            orderId: 'ord-recovered', pnr: 'PNRREC', tickets: ['T-1'], isTicketed: true,
            orderTotal: '100.00', orderCurrency: 'usd',
        } as any);
        vi.mocked(stripe.paymentIntents.create).mockResolvedValue({ id: PI_ID, client_secret: 'secret' } as any);

        const result = await service.book(BOOK_PARAMS);

        expect(findOrderFromTimedOutAttempt).toHaveBeenCalled();
        expect(result.paymentIntentId).toBe(PI_ID);
    });

    it('reports the failure when no such order exists', async () => {
        const { findOrderFromTimedOutAttempt } = await import('@/lib/flights/duffelOrderReconcile');
        vi.mocked(placeDuffelOrder).mockResolvedValue({
            kind: 'error', status: 504, timedOut: true,
            data: { errors: [{ code: 'timeout', message: 'timed out' }] },
        } as any);
        vi.mocked(findOrderFromTimedOutAttempt).mockResolvedValue(null);

        await expect(service.book(BOOK_PARAMS)).rejects.toMatchObject({ code: 'DUFFEL_ORDER_FAILED' });
    });
});
