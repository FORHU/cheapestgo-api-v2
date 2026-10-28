import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The one price a flight is quoted at and charged at.
 *
 * The checkout used to show Duffel's raw fare while `book` charged that fare plus the
 * markup — a $250 fare billed at $272.40 under a button that said "Pay USD 250". The figure a
 * traveller is shown and the figure the card is held for now come from the same function, so
 * they cannot differ.
 */

const rates = vi.hoisted(() => ({ getLiveRates: vi.fn() }));
vi.mock('@/services/exchange-rates.service', () => ({
    ExchangeRatesService: vi.fn(function (this: any) { this.getLiveRates = rates.getLiveRates; }),
}));
vi.mock('@/middleware/error.middleware', () => ({
    AppError: class AppError extends Error {
        constructor(public status: number, message: string, public code: string, public details?: Record<string, unknown>) { super(message); }
    },
}));

import { priceFlightCharge } from '@/lib/flights/flightCharge';
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';

const offer = (total: string, currency = 'USD', services: Array<{ id: string; total_amount: string }> = []) =>
    ({ id: 'off_1', total_amount: total, total_currency: currency, available_services: services });

/** USD-per-1-unit, as `ExchangeRatesService` serves them. */
const liveRates = () => ({ rates: { USD: 1, PHP: 0.02, KRW: 0.001 }, fetchedAt: Date.now(), source: 'live' });

beforeEach(() => {
    vi.clearAllMocks();
    rates.getLiveRates.mockResolvedValue(liveRates());
});

describe('priceFlightCharge', () => {
    it('quotes a USD fare as the fare plus the markup book charges, with no rates fetched', async () => {
        const charge = await priceFlightCharge(offer('250.00'));

        const expected = applyMarkup(250, FLIGHT_MARKUP_SPEC).chargedPrice;
        expect(charge).toMatchObject({ chargeCurrency: 'usd', fare: 250, total: expected });
        expect(charge.serviceFee).toBeCloseTo(expected - 250, 2);
        expect(charge.serviceFee).toBeGreaterThan(0);
        expect(charge.stripeAmount).toBe(toStripeAmount(expected, 'usd'));
        expect(rates.getLiveRates).not.toHaveBeenCalled();
    });

    it('counts the chosen seats and bags in the fare, priced from the offer', async () => {
        const charge = await priceFlightCharge(
            offer('100.00', 'USD', [{ id: 'seat_1', total_amount: '15.00' }, { id: 'bag_1', total_amount: '20.00' }]),
            { seatServiceIds: ['seat_1'], bagServiceIds: ['bag_1'] },
        );

        expect(charge.fare).toBe(135);
        expect(charge.total).toBe(applyMarkup(135, FLIGHT_MARKUP_SPEC).chargedPrice);
    });

    it('ignores a service the offer does not list', async () => {
        const charge = await priceFlightCharge(offer('100.00'), { seatServiceIds: ['seat_gone'] });
        expect(charge.fare).toBe(100);
    });

    it('carries the flat component into a non-USD fare in that currency, not as a bare 4.40', async () => {
        const charge = await priceFlightCharge(offer('5800.00', 'PHP'));

        // $4.40 at 0.02 USD per peso is ₱220.
        const expected = applyMarkup(5800, FLIGHT_MARKUP_SPEC, 220).chargedPrice;
        expect(charge).toMatchObject({ chargeCurrency: 'php', fare: 5800, total: expected });
        expect(charge.total).toBeGreaterThan(5800 * 1.05);
    });

    it('converts fare and total together when charged in another currency', async () => {
        const charge = await priceFlightCharge(offer('100.00', 'USD'), { displayCurrency: 'KRW' });

        // 1 USD = 1000 KRW at these rates.
        const totalUsd = applyMarkup(100, FLIGHT_MARKUP_SPEC).chargedPrice;
        expect(charge).toMatchObject({ chargeCurrency: 'krw', fare: 100_000, total: Math.round(totalUsd * 1000 * 100) / 100 });
        expect(charge.stripeAmount).toBe(toStripeAmount(charge.total, 'krw'));
    });

    it('refuses to quote across currencies when there are no usable rates', async () => {
        rates.getLiveRates.mockResolvedValue(null);

        await expect(priceFlightCharge(offer('100.00', 'USD'), { displayCurrency: 'PHP' }))
            .rejects.toMatchObject({ status: 503, code: 'FX_UNAVAILABLE' });
    });

    it('never lets the fare and the fee disagree with the total, to the cent', async () => {
        for (const [amount, currency] of [['9.99', 'USD'], ['60.00', 'USD'], ['250.00', 'USD'], ['1234.56', 'USD'], ['5800.00', 'PHP']]) {
            const charge = await priceFlightCharge(offer(amount, currency));
            expect(Math.round((charge.fare + charge.serviceFee) * 100)).toBe(Math.round(charge.total * 100));
        }
    });
});
