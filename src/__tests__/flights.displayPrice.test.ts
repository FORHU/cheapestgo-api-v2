import { describe, it, expect } from 'vitest';
import { withDisplayPrices, needsRates } from '@/lib/flights/displayPrice';
import type { FlightOffer } from '@/types/flights';
import type { RatesResult } from '@/services/exchange-rates.service';

/**
 * Search results priced for a client that has no exchange rates of its own (the mobile app).
 * The rule that matters: an offer is shown converted or not converted, never the airline's
 * number under someone else's currency — $117.55 must not reach a phone as ₱118.
 */

const NOW = 1_800_000_000_000;

const offer = (total: number, currency: string, extra: Partial<FlightOffer> = {}): FlightOffer => ({
    offerId: `off-${total}-${currency}`,
    provider: 'duffel',
    price: { total, base: total * 0.85, taxes: total * 0.15, currency, pricePerAdult: total },
    segments: [],
    totalDuration: 240,
    totalStops: 0,
    refundable: false,
    normalizedPriceUsd: total,
    bestScore: 0,
    physicalFlightId: 'x',
    ...extra,
});

// USD-per-1-unit, as ExchangeRatesService returns them: 1 PHP = 0.017 USD.
const rates = (overrides: Partial<RatesResult> = {}): RatesResult => ({
    rates: { USD: 1, PHP: 0.017, KRW: 0.00072 },
    source: 'live',
    provider: 'test',
    fetchedAt: NOW - 60_000,
    missing: [],
    ...overrides,
});

const at = () => NOW;

describe('withDisplayPrices', () => {
    it('converts a USD fare into pesos, leaving the airline fare as it was', () => {
        const [o] = withDisplayPrices([offer(117.55, 'USD')], 'PHP', rates(), at);
        expect(o.displayPrice).toEqual({ currency: 'PHP', total: 6914.71, pricePerAdult: 6914.71, rateSource: 'live' });
        expect(o.price).toEqual(expect.objectContaining({ total: 117.55, currency: 'USD' }));
    });

    it('rounds currencies without a minor unit to whole numbers', () => {
        const [o] = withDisplayPrices([offer(100, 'USD')], 'KRW', rates(), at);
        expect(Number.isInteger(o.displayPrice!.total)).toBe(true);
    });

    it('needs no rate when the fare is already in the asked-for currency', () => {
        const [o] = withDisplayPrices([offer(5000, 'PHP')], 'php', null, at);
        expect(o.displayPrice).toEqual({ currency: 'PHP', total: 5000, pricePerAdult: 5000, rateSource: 'same-currency' });
    });

    it('leaves the offer unconverted when there are no rates, rather than relabelling it', () => {
        const [o] = withDisplayPrices([offer(117.55, 'USD')], 'PHP', null, at);
        expect(o.displayPrice).toBeUndefined();
    });

    it('leaves it unconverted when the rates are more than a day old', () => {
        const [o] = withDisplayPrices([offer(117.55, 'USD')], 'PHP', rates({ fetchedAt: NOW - 25 * 3_600_000 }), at);
        expect(o.displayPrice).toBeUndefined();
    });

    it('leaves it unconverted when the airline currency has no rate', () => {
        const [o] = withDisplayPrices([offer(80, 'GBP')], 'PHP', rates(), at);
        expect(o.displayPrice).toBeUndefined();
    });

    it('prices the alternatives grouped under an offer too', () => {
        const [o] = withDisplayPrices([offer(100, 'USD', { alternatives: [offer(120, 'USD')] })], 'PHP', rates(), at);
        expect(o.alternatives?.[0].displayPrice?.currency).toBe('PHP');
    });
});

describe('needsRates', () => {
    it('is false when every fare is already in the asked-for currency', () => {
        expect(needsRates([offer(1, 'PHP'), offer(2, 'php')], 'PHP')).toBe(false);
    });
    it('is true when any fare is in another currency', () => {
        expect(needsRates([offer(1, 'PHP'), offer(2, 'USD')], 'PHP')).toBe(true);
    });
});
