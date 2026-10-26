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
    getDuffelOffer:                vi.fn(),
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
        this.getBookingSession                 = vi.fn().mockResolvedValue(null);
        this.lockSessionForBooking             = vi.fn().mockResolvedValue(true);
        this.setSessionStatus                  = vi.fn().mockResolvedValue(undefined);
    }),
}));

const lifecycle = vi.hoisted(() => ({ complete: vi.fn(), open: vi.fn(), find: vi.fn() }));
vi.mock('@/services/flightBookingLifecycle.service', () => ({
    FlightBookingLifecycleService: vi.fn(function(this: any) {
        this.complete = lifecycle.complete;
        this.open     = lifecycle.open;
        this.find     = lifecycle.find;
    }),
}));

vi.mock('@/services/flightBookingCompletion', () => ({ completeDuffelBooking: vi.fn() }));

vi.mock('@/middleware/error.middleware', () => ({
    AppError: class AppError extends Error {
        constructor(public status: number, message: string, public code: string, public details?: Record<string, unknown>) {
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
    placeDuffelOrder, getDuffelOrder, getDuffelOffer,
    createDuffelCancellationQuote, confirmDuffelCancellation,
} from '@/lib/flights/duffel';
import { stripe }          from '@/lib/stripe';
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import { completeDuffelBooking } from '@/services/flightBookingCompletion';
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
//
// `book` used to buy the ticket and then ask for the card. It now asks for the card and buys
// nothing: the order is placed by the booking lifecycle once the card is authorised. Each test
// here that changed maps to a row of "Behaviour changes this slice makes on purpose" in the
// flight booking money-safety plan.

describe('FlightsService.book()', () => {
    const repoOf = () => (service as any).repo;

    beforeEach(() => {
        vi.mocked(getDuffelOffer).mockResolvedValue(RAW_OFFER);
        vi.mocked(stripe.paymentIntents.create).mockResolvedValue({ id: PI_ID, client_secret: 'pi_secret_xyz' } as any);
        lifecycle.open.mockResolvedValue(null);
    });

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

    // §3 row 1
    it('places no airline order — the card is authorised first', async () => {
        await service.book(BOOK_PARAMS);

        expect(placeDuffelOrder).not.toHaveBeenCalled();
        expect(createDuffelCancellationQuote).not.toHaveBeenCalled();
    });

    // §3 row 2
    it('opens a manual-capture PaymentIntent priced from the offer Duffel holds now', async () => {
        const result = await service.book(BOOK_PARAMS);

        expect(getDuffelOffer).toHaveBeenCalledWith('off-abc', { withServices: false });
        const expected = toStripeAmount(applyMarkup(100, FLIGHT_MARKUP_SPEC).chargedPrice, 'usd');
        expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
            expect.objectContaining({
                amount: expected, currency: 'usd', capture_method: 'manual',
                metadata: expect.objectContaining({ bookingSessionId: SESSION_ID, type: 'flight', provider: 'duffel' }),
            }),
            expect.objectContaining({ idempotencyKey: expect.stringContaining('flight-pi-') }),
        );
        expect(result).toMatchObject({ clientSecret: 'pi_secret_xyz', sessionId: SESSION_ID, paymentIntentId: PI_ID });
    });

    it('tells the caller exactly what the card is held for, so the page can show that and nothing else', async () => {
        const result = await service.book(BOOK_PARAMS);

        const total = applyMarkup(100, FLIGHT_MARKUP_SPEC).chargedPrice;
        expect(result).toMatchObject({ amount: total, currency: 'USD', fare: 100 });
        expect(result.serviceFee).toBeCloseTo(total - 100, 2);
        // The figure it reports is the figure Stripe was asked to hold.
        expect(vi.mocked(stripe.paymentIntents.create).mock.calls[0][0].amount)
            .toBe(toStripeAmount(result.amount, 'usd'));
    });

    it('writes the attempt as a manual-capture session, with what its order will need', async () => {
        await service.book(BOOK_PARAMS);

        expect(repoOf().createBookingSession).toHaveBeenCalledWith(expect.objectContaining({
            captureMethod: 'manual',
            flight: expect.objectContaining({ _offerId: 'off-abc' }),
            passengers: BOOK_PARAMS.passengers,
            contact: BOOK_PARAMS.contact,
        }));
        expect(repoOf().updateBookingSessionPayment).toHaveBeenCalledWith(SESSION_ID, PI_ID);
        // What the hold was computed from: the fare in the airline's currency, before markup.
        expect(repoOf().updateBookingSessionAudit).toHaveBeenCalledWith(SESSION_ID, expect.objectContaining({
            currency: 'usd', originalPrice: 100,
        }));
        expect(lifecycle.open).toHaveBeenCalledWith(SESSION_ID);
    });

    it('prices chosen seats from the offer, never from the browser\'s own total', async () => {
        vi.mocked(getDuffelOffer).mockResolvedValue({ ...RAW_OFFER, available_services: [{ id: 'seat_1', total_amount: '15.00' }] });

        await service.book({ ...BOOK_PARAMS, seatServiceIds: ['seat_1'], seatTotal: 999 });

        expect(getDuffelOffer).toHaveBeenCalledWith('off-abc', { withServices: true });
        expect(vi.mocked(stripe.paymentIntents.create).mock.calls[0][0].amount)
            .toBe(toStripeAmount(applyMarkup(115, FLIGHT_MARKUP_SPEC).chargedPrice, 'usd'));
    });

    it('refuses a seat the offer no longer sells, before the card', async () => {
        await expect(service.book({ ...BOOK_PARAMS, seatServiceIds: ['seat_gone'] }))
            .rejects.toMatchObject({ status: 409, code: 'SERVICE_UNAVAILABLE' });
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    // §3 row 3: what `book` can still catch before the card
    it('says an offer Duffel no longer has is gone, before the card', async () => {
        vi.mocked(getDuffelOffer).mockResolvedValue(null);

        await expect(service.book(BOOK_PARAMS)).rejects.toMatchObject({ status: 410, code: 'OFFER_EXPIRED' });
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('says the price changed, before the card, when the fare rose since the traveller saw it', async () => {
        await expect(service.book({ ...BOOK_PARAMS, confirmedPrice: 80 }))
            .rejects.toMatchObject({ status: 409, code: 'PRICE_CHANGED' });
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('does not call a fare that came down a price change', async () => {
        await expect(service.book({ ...BOOK_PARAMS, confirmedPrice: 120 })).resolves.toMatchObject({ paymentIntentId: PI_ID });
    });

    it('refuses an unusable phone before the card', async () => {
        await expect(service.book({ ...BOOK_PARAMS, contact: { email: 'juan@example.com', phone: '12' } }))
            .rejects.toMatchObject({ status: 400, code: 'INVALID_PHONE' });
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('leaves nothing to clean up when Stripe is down — no order exists yet', async () => {
        vi.mocked(stripe.paymentIntents.create).mockRejectedValue(new Error('Stripe is down'));

        await expect(service.book(BOOK_PARAMS)).rejects.toThrow('Stripe is down');
        expect(createDuffelCancellationQuote).not.toHaveBeenCalled();
    });

    it('lets a traveller book a duplicate departure once they have been warned', async () => {
        // Warned, not refused (ADR-0011).
        repoOf().getActiveBookingsForUser.mockResolvedValue([{ id: 'bk-other' }]);
        repoOf().findSegmentConflict.mockResolvedValue({ booking_id: 'bk-other' });
        const firstSegFlight = { ...MOCK_FLIGHT, slices: [{ segments: [{ origin: { iata_code: 'MNL' }, departing_at: '2026-09-01T08:00:00' }] }] };

        await expect(service.book({ ...BOOK_PARAMS, flight: firstSegFlight as any }))
            .rejects.toMatchObject({ code: 'DUPLICATE_BOOKING' });

        await expect(service.book({ ...BOOK_PARAMS, flight: firstSegFlight as any, acknowledgeDuplicate: true }))
            .resolves.toMatchObject({ paymentIntentId: PI_ID });
    });
});

// ─── confirm() ────────────────────────────────────────────────────────────────

describe('FlightsService.confirm()', () => {
    const authorised = (over: Record<string, unknown> = {}) => vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
        id: PI_ID, status: 'requires_capture', capture_method: 'manual',
        metadata: { bookingSessionId: SESSION_ID, provider: 'duffel' }, ...over,
    } as any);
    const confirm = () => service.confirm(PI_ID, SESSION_ID, USER_ID);

    it('throws 403 SESSION_MISMATCH when the PI sessionId does not match', async () => {
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
            id:       PI_ID,
            status:   'succeeded',
            metadata: { bookingSessionId: 'other-session', provider: 'duffel' },
        } as any);

        await expect(confirm()).rejects.toMatchObject({ status: 403, code: 'SESSION_MISMATCH' });
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

        const result = await confirm();

        expect(result.pnr).toBe('PNRABC');
        expect(result.source).toBe('webhook');
    });

    // §3 row 6
    it('completes an authorised, not yet captured, payment through the booking lifecycle', async () => {
        authorised();
        lifecycle.complete.mockResolvedValue({ kind: 'confirmed', bookingId: BOOKING_ID, pnr: 'PNRABC', status: 'ticketed' });
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        const result = await confirm();

        expect(lifecycle.complete).toHaveBeenCalledWith({
            sessionId: SESSION_ID, paymentIntentId: PI_ID, actor: 'browser', userId: USER_ID,
        });
        expect(result).toEqual({ bookingId: BOOKING_ID, pnr: 'PNRABC', status: 'ticketed', source: 'lifecycle' });
        // In process: no HTTP round trip to /internal/create-booking (ADR-0012).
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    // §3 row 5
    it('says "still processing" rather than failing when the airline has not settled it', async () => {
        authorised();
        lifecycle.complete.mockResolvedValue({ kind: 'pending', needsReview: true, message: 'Your booking is being confirmed by our team.' });

        await expect(confirm()).rejects.toMatchObject({
            status: 409, code: 'BOOKING_PROCESSING', message: 'Your booking is being confirmed by our team.',
            details: { pending: true, needsReview: true, sessionId: SESSION_ID },
        });
    });

    // §3 row 3
    it('relays a fare that changed after the card, with the hold released', async () => {
        authorised();
        lifecycle.complete.mockResolvedValue({
            kind: 'failed', code: 'PRICE_CHANGED', message: 'The fare changed.',
            details: { oldPrice: 100, newPrice: 140, currency: 'USD' },
        });

        await expect(confirm()).rejects.toMatchObject({
            status: 409, code: 'PRICE_CHANGED', details: { oldPrice: 100, newPrice: 140, currency: 'USD' },
        });
    });

    it('relays an offer that expired after the card', async () => {
        authorised();
        lifecycle.complete.mockResolvedValue({ kind: 'failed', code: 'OFFER_EXPIRED', message: 'This fare is no longer available.' });
        await expect(confirm()).rejects.toMatchObject({ status: 410, code: 'OFFER_EXPIRED' });
    });

    it('keeps the wire code clients know for a payment that was not authorised', async () => {
        authorised({ status: 'requires_payment_method' });
        lifecycle.complete.mockResolvedValue({ kind: 'failed', code: 'PAYMENT_NOT_AUTHORIZED', message: 'Payment not authorised' });
        await expect(confirm()).rejects.toMatchObject({ status: 402, code: 'PAYMENT_NOT_COMPLETED' });
    });

    describe('a session booked before this release (its order placed at book)', () => {
        const legacy = {
            id: SESSION_ID, user_id: USER_ID, payment_intent_id: PI_ID, capture_method: 'automatic',
            duffel_pre_order_id: 'ord-old', duffel_pre_order_pnr: 'PNROLD',
            duffel_pre_order_tickets: ['T-1'], duffel_pre_order_ticketed: true,
        };

        it('is finished in process, the old way, without the lifecycle', async () => {
            authorised({ status: 'succeeded', capture_method: 'automatic' });
            (service as any).repo.getBookingSession.mockResolvedValue(legacy);
            vi.mocked(completeDuffelBooking).mockResolvedValue({
                bookingId: BOOKING_ID, pnr: 'PNROLD', status: 'ticketed', confirmedPrice: 112, confirmedCurrency: 'USD',
            });

            const result = await confirm();

            expect(lifecycle.complete).not.toHaveBeenCalled();
            expect((service as any).repo.lockSessionForBooking).toHaveBeenCalledWith(SESSION_ID);
            expect(completeDuffelBooking).toHaveBeenCalledWith({
                session: legacy, paymentIntentId: PI_ID,
                order: { orderId: 'ord-old', pnr: 'PNROLD', tickets: ['T-1'], isTicketed: true },
            });
            expect(result).toEqual({ bookingId: BOOKING_ID, pnr: 'PNROLD', status: 'ticketed', source: 'confirm-fallback' });
        });

        it('still needs the payment taken', async () => {
            authorised({ status: 'processing', capture_method: 'automatic' });
            await expect(confirm()).rejects.toMatchObject({ status: 402, code: 'PAYMENT_NOT_COMPLETED' });
            expect(completeDuffelBooking).not.toHaveBeenCalled();
        });
    });
});

// ─── getOffer() ───────────────────────────────────────────────────────────────

describe('FlightsService.getOffer()', () => {
    it('reads the offer from Duffel and answers it in the shape the results cards use, without the raw payload', async () => {
        const { parseDuffelOffer, normalizedToFlightOffer } = await import('@/lib/flights/duffel');
        vi.mocked(getDuffelOffer).mockResolvedValue(RAW_OFFER);
        vi.mocked(parseDuffelOffer).mockReturnValue({ offer_id: 'off-abc' } as any);
        vi.mocked(normalizedToFlightOffer).mockReturnValue({ offerId: 'off-abc', segments: [], _rawOffer: RAW_OFFER } as any);

        const offer = await service.getOffer('off-abc', 'round-trip');

        expect(getDuffelOffer).toHaveBeenCalledWith('off-abc');
        expect(normalizedToFlightOffer).toHaveBeenCalledWith({ offer_id: 'off-abc' }, 'round-trip');
        expect(offer).toMatchObject({ offerId: 'off-abc', segments: [] });
        expect(offer).not.toHaveProperty('_rawOffer');
    });

    it('quotes what the card would be held for — to the cent, the figure book then holds', async () => {
        const { parseDuffelOffer, normalizedToFlightOffer } = await import('@/lib/flights/duffel');
        vi.mocked(getDuffelOffer).mockResolvedValue(RAW_OFFER);
        vi.mocked(parseDuffelOffer).mockReturnValue({ offer_id: 'off-abc' } as any);
        vi.mocked(normalizedToFlightOffer).mockReturnValue({ offerId: 'off-abc', segments: [], _rawOffer: RAW_OFFER } as any);
        vi.mocked(stripe.paymentIntents.create).mockResolvedValue({ id: PI_ID, client_secret: 'pi_secret_xyz' } as any);
        lifecycle.open.mockResolvedValue(null);

        const offer = await service.getOffer('off-abc');
        const booked = await service.book(BOOK_PARAMS);

        expect(offer.quote).toEqual({ currency: 'USD', fare: booked.fare, serviceFee: booked.serviceFee, total: booked.amount });
        // A fee is part of the quote, not an afterthought: the total is more than the fare.
        expect(offer.quote!.total).toBeGreaterThan(offer.quote!.fare);
    });

    it('says the fare is gone when Duffel no longer has it', async () => {
        vi.mocked(getDuffelOffer).mockResolvedValue(null);
        await expect(service.getOffer('off-gone')).rejects.toMatchObject({ status: 410, code: 'OFFER_EXPIRED' });
    });

    it('says the airline could not be reached, rather than that the fare is gone', async () => {
        vi.mocked(getDuffelOffer).mockRejectedValue(new Error('duffel 503'));
        await expect(service.getOffer('off-abc')).rejects.toMatchObject({ status: 503, code: 'UPSTREAM_UNAVAILABLE' });
    });
});

// ─── getBookingStatus() ───────────────────────────────────────────────────────

describe('FlightsService.getBookingStatus()', () => {
    const repoOf = () => (service as any).repo;
    const attempt = (status: string, over: Record<string, unknown> = {}) =>
        ({ sessionId: SESSION_ID, userId: USER_ID, status, failureCode: null, failureMessage: null, ...over });

    beforeEach(() => {
        repoOf().getFlightBookingBySessionForUser.mockResolvedValue(null);
        lifecycle.find.mockResolvedValue(null);
    });

    it('answers with the booking once there is one, as it always has', async () => {
        repoOf().getFlightBookingBySessionForUser.mockResolvedValue({ id: BOOKING_ID, pnr: 'PNRABC', status: 'ticketed' });
        expect(await service.getBookingStatus(SESSION_ID, USER_ID))
            .toEqual({ found: true, bookingId: BOOKING_ID, pnr: 'PNRABC', status: 'ticketed' });
        expect(lifecycle.find).not.toHaveBeenCalled();
    });

    it('says the airline is being asked, rather than "not found", mid-completion', async () => {
        lifecycle.find.mockResolvedValue(attempt('SUPPLIER_BOOKING'));
        expect(await service.getBookingStatus(SESSION_ID, USER_ID)).toEqual({ found: false, lifecycle: 'processing' });

        lifecycle.find.mockResolvedValue(attempt('PAYMENT_AUTHORIZED'));
        expect(await service.getBookingStatus(SESSION_ID, USER_ID)).toEqual({ found: false, lifecycle: 'processing' });
    });

    it('says the payment has not been made yet', async () => {
        lifecycle.find.mockResolvedValue(attempt('PAYMENT_PENDING'));
        expect(await service.getBookingStatus(SESSION_ID, USER_ID)).toEqual({ found: false, lifecycle: 'pending' });
    });

    it('says a person is looking at it', async () => {
        lifecycle.find.mockResolvedValue(attempt('NEEDS_REVIEW', { failureCode: 'CAPTURE_FAILED' }));
        expect(await service.getBookingStatus(SESSION_ID, USER_ID)).toEqual({ found: false, lifecycle: 'needs_review' });
    });

    it('says why it failed, from the attempt', async () => {
        lifecycle.find.mockResolvedValue(attempt('FAILED', { failureCode: 'PRICE_CHANGED', failureMessage: 'The fare changed.' }));
        expect(await service.getBookingStatus(SESSION_ID, USER_ID)).toEqual({
            found: false, failed: true, lifecycle: 'failed', code: 'PRICE_CHANGED', error: 'The fare changed.',
        });
    });

    it('tells no one about someone else\'s attempt', async () => {
        lifecycle.find.mockResolvedValue(attempt('SUPPLIER_BOOKING', { userId: 'someone-else' }));
        expect(await service.getBookingStatus(SESSION_ID, USER_ID)).toEqual({ found: false });
    });

    it('is plain "not found" when there is no attempt either', async () => {
        expect(await service.getBookingStatus(SESSION_ID, USER_ID)).toEqual({ found: false });
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
