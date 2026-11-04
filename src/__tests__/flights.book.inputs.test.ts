import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * What `FlightsService.book` does with a request that cannot become an order.
 *
 * `book` is the last place a "no" is free: nothing is ordered and nothing authorised. The route
 * hands it the request body unchecked, so a body without a contact or with the wrong number of
 * travellers used to get past it, hold the traveller's card, and only be refused at `confirm` —
 * or, for a missing contact, crash with a 500.
 */

vi.mock('@/lib/flights/search', () => ({
    searchFlightsWithStatus: vi.fn(), searchFlights: vi.fn(), applyServerFilters: vi.fn((o: any[]) => o),
}));
vi.mock('@/lib/flights/duffel', () => ({
    parseDuffelOffer: vi.fn(), normalizedToFlightOffer: vi.fn(), getDuffelAvailableServices: vi.fn(),
    getDuffelSeatMaps: vi.fn(), getDuffelBalances: vi.fn(), getAvailableBalance: vi.fn(),
    createDuffelCancellationQuote: vi.fn(), confirmDuffelCancellation: vi.fn(), getDuffelOrder: vi.fn(),
    getDuffelOffer: vi.fn(), placeDuffelOrder: vi.fn(), refreshDuffelOffer: vi.fn(),
    ORDER_CREATE_TIMEOUT_MS: 130_000, searchDuffel: vi.fn(),
}));
vi.mock('@/lib/flights/duffelOrderReconcile', () => ({ findOrderFromTimedOutAttempt: vi.fn(), toReconciledOrder: vi.fn() }));
vi.mock('@/lib/flights/mystifly', () => ({ mystiflyRequest: vi.fn() }));
vi.mock('@/lib/stripe', () => ({
    stripe: {
        paymentIntents: { create: vi.fn(), retrieve: vi.fn(), capture: vi.fn(), cancel: vi.fn(), search: vi.fn().mockResolvedValue({ data: [] }) },
        refunds: { create: vi.fn() },
    },
}));
vi.mock('@/repositories/flights.repository', () => ({
    FlightsRepository: vi.fn(function (this: any) {
        this.getActiveBookingsForUser = vi.fn().mockResolvedValue([]);
        this.findSegmentConflict = vi.fn().mockResolvedValue(null);
        this.createBookingSession = vi.fn().mockResolvedValue({ id: 'sess-123' });
        this.updateBookingSessionPayment = vi.fn().mockResolvedValue(undefined);
        this.updateBookingSessionAudit = vi.fn().mockResolvedValue(undefined);
    }),
}));
const lifecycle = vi.hoisted(() => ({
    complete: vi.fn(), open: vi.fn(), find: vi.fn(),
    // No earlier attempt at the offer.
    paidAttempt: vi.fn().mockResolvedValue(null), resumeUnpaid: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/flightBookingLifecycle.service', () => ({
    FlightBookingLifecycleService: vi.fn(function (this: any) {
        this.complete = lifecycle.complete; this.open = lifecycle.open; this.find = lifecycle.find;
        this.paidAttempt = lifecycle.paidAttempt; this.resumeUnpaid = lifecycle.resumeUnpaid;
    }),
}));
vi.mock('@/services/flightBookingCompletion', () => ({ completeDuffelBooking: vi.fn() }));
vi.mock('@/middleware/error.middleware', () => ({
    AppError: class AppError extends Error {
        constructor(public status: number, message: string, public code: string, public details?: Record<string, unknown>) { super(message); }
    },
}));
vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc', FUNCTIONS_SECRET: 'test-secret' } }));

import { getDuffelOffer } from '@/lib/flights/duffel';
import { stripe } from '@/lib/stripe';
import { FlightsService } from '@/services/flights.service';

const RAW_OFFER = {
    id: 'off-abc', passengers: [{ id: 'pax1' }, { id: 'pax2' }],
    total_amount: '100.00', total_currency: 'usd', available_services: [],
};
const PAX = (firstName: string) => ({ firstName, lastName: 'Cruz', birthDate: '1990-01-01', gender: 'M', type: 'ADT' });
const BOOK = {
    provider: 'duffel',
    flight: { price: { total: 100, currency: 'USD' }, segments: [{ origin: 'MNL', destination: 'NRT', departing_at: '2026-09-01T08:00:00' }], _rawOffer: RAW_OFFER } as any,
    passengers: [PAX('Juan'), PAX('Maria')],
    contact: { email: 'juan@example.com', phone: '9171234567', countryCode: '63' } as any,
    idempotencyKey: 'idem-abc',
    farePolicy: { isRefundable: false, isChangeable: false } as any,
    userId: 'user-123',
};

let service: FlightsService;
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDuffelOffer).mockResolvedValue(RAW_OFFER);
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({ id: 'pi_1', client_secret: 'secret' } as any);
    lifecycle.open.mockResolvedValue(null);
    service = new FlightsService();
});

const refusedBeforeTheCard = async (args: any, expected: Record<string, unknown>) => {
    await expect(service.book(args)).rejects.toMatchObject(expected);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect((service as any).repo.createBookingSession).not.toHaveBeenCalled();
};

describe('FlightsService.book() — a request that cannot become an order', () => {
    it('books the fare it was priced for', async () => {
        await expect(service.book(BOOK)).resolves.toMatchObject({ paymentIntentId: 'pi_1' });
    });

    it('refuses a request with no contact as a bad request, not a crash', async () => {
        await refusedBeforeTheCard({ ...BOOK, contact: undefined }, { status: 400, code: 'INVALID_PHONE' });
    });

    it('refuses a request with no travellers', async () => {
        await refusedBeforeTheCard({ ...BOOK, passengers: undefined }, { status: 400, code: 'INVALID_PASSENGERS' });
        await refusedBeforeTheCard({ ...BOOK, passengers: [] }, { status: 400, code: 'INVALID_PASSENGERS' });
    });

    it('refuses fewer travellers than the fare was priced for', async () => {
        await refusedBeforeTheCard({ ...BOOK, passengers: [PAX('Juan')] }, { status: 400, code: 'INVALID_PASSENGERS' });
    });

    it('refuses more travellers than the fare was priced for', async () => {
        await refusedBeforeTheCard({ ...BOOK, passengers: [PAX('Juan'), PAX('Maria'), PAX('Ana')] }, { status: 400, code: 'INVALID_PASSENGERS' });
    });

    it('does not insist on a count when the offer lists no passengers to compare with', async () => {
        vi.mocked(getDuffelOffer).mockResolvedValue({ ...RAW_OFFER, passengers: undefined } as any);
        await expect(service.book(BOOK)).resolves.toMatchObject({ paymentIntentId: 'pi_1' });
    });
});
