import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The offer endpoint is read twice: for the quote at checkout, and for the receipt after the
 * booking. A quote that cannot be made — rates down for a non-USD fare — must cost the reader
 * the quote, never the offer.
 */

vi.mock('@/lib/flights/search', () => ({ searchFlightsWithStatus: vi.fn(), searchFlights: vi.fn(), applyServerFilters: vi.fn() }));
vi.mock('@/lib/flights/duffel', () => ({
    parseDuffelOffer: vi.fn(() => ({ offer_id: 'off-abc' })),
    normalizedToFlightOffer: vi.fn(() => ({ offerId: 'off-abc', segments: [], _rawOffer: {} })),
    getDuffelAvailableServices: vi.fn(), getDuffelSeatMaps: vi.fn(), getDuffelBalances: vi.fn(), getAvailableBalance: vi.fn(),
    createDuffelCancellationQuote: vi.fn(), confirmDuffelCancellation: vi.fn(), getDuffelOrder: vi.fn(),
    getDuffelOffer: vi.fn(), placeDuffelOrder: vi.fn(), refreshDuffelOffer: vi.fn(),
    ORDER_CREATE_TIMEOUT_MS: 130_000, searchDuffel: vi.fn(),
}));
vi.mock('@/lib/flights/duffelOrderReconcile', () => ({ findOrderFromTimedOutAttempt: vi.fn(), toReconciledOrder: vi.fn() }));
vi.mock('@/lib/flights/mystifly', () => ({ mystiflyRequest: vi.fn() }));
vi.mock('@/lib/stripe', () => ({ stripe: { paymentIntents: {}, refunds: {} } }));
vi.mock('@/repositories/flights.repository', () => ({ FlightsRepository: vi.fn(function () {}) }));
vi.mock('@/services/flightBookingLifecycle.service', () => ({ FlightBookingLifecycleService: vi.fn(function () {}) }));
vi.mock('@/services/flightBookingCompletion', () => ({ completeDuffelBooking: vi.fn() }));
vi.mock('@/middleware/error.middleware', () => ({
    AppError: class AppError extends Error {
        constructor(public status: number, message: string, public code: string) { super(message); }
    },
}));
vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));

const charge = vi.hoisted(() => ({ priceFlightCharge: vi.fn() }));
vi.mock('@/lib/flights/flightCharge', () => charge);

import { getDuffelOffer } from '@/lib/flights/duffel';
import { FlightsService } from '@/services/flights.service';

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDuffelOffer).mockResolvedValue({ id: 'off-abc', total_amount: '5800.00', total_currency: 'PHP' });
});

describe('FlightsService.getOffer() when the price cannot be quoted', () => {
    it('still answers the offer, without a quote', async () => {
        charge.priceFlightCharge.mockRejectedValue(new Error('rates down'));

        const offer = await new FlightsService().getOffer('off-abc');

        expect(offer).toMatchObject({ offerId: 'off-abc' });
        expect(offer).not.toHaveProperty('quote');
    });

    it('prices in the currency asked for, and in the airline\'s own when none is', async () => {
        charge.priceFlightCharge.mockResolvedValue({ chargeCurrency: 'usd', fare: 100, serviceFee: 11.6, total: 111.6 });

        await new FlightsService().getOffer('off-abc', 'one-way', 'USD');
        expect(charge.priceFlightCharge).toHaveBeenLastCalledWith(expect.anything(), { displayCurrency: 'USD' });

        await new FlightsService().getOffer('off-abc');
        expect(charge.priceFlightCharge).toHaveBeenLastCalledWith(expect.anything(), { displayCurrency: undefined });
    });

    it('quotes in the figures the pricing function gave, upper-casing the currency', async () => {
        charge.priceFlightCharge.mockResolvedValue({ chargeCurrency: 'php', fare: 5800, serviceFee: 637.6, total: 6437.6 });

        const offer = await new FlightsService().getOffer('off-abc');

        expect(offer.quote).toEqual({ currency: 'PHP', fare: 5800, serviceFee: 637.6, total: 6437.6 });
    });
});
