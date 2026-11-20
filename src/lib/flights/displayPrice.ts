/**
 * Search results priced in the currency the client asked for.
 *
 * A display conversion, not a charge: `price` keeps the airline's figure and currency,
 * because `book` and revalidation compare against that. The converted figure goes in
 * `displayPrice` beside it.
 *
 * Uses the strict converter on purpose. An offer whose rate is missing or stale gets no
 * `displayPrice` at all, rather than the airline's number under the asked-for currency:
 * a client that cannot convert (the mobile app has no rates) would otherwise print
 * $117.55 as ₱118.
 */

import type { FlightOffer } from '@/types/flights';
import type { RatesResult } from '@/services/exchange-rates.service';
import { makeStrictConverter } from '@/lib/payments/convertStrict';

/** Currencies with no minor unit: shown as whole numbers. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'TWD']);

function round(amount: number, currency: string): number {
    return ZERO_DECIMAL.has(currency) ? Math.round(amount) : Math.round(amount * 100) / 100;
}

/** True when converting these offers into `currency` needs exchange rates at all. */
export function needsRates(offers: FlightOffer[], currency: string): boolean {
    const to = currency.toUpperCase();
    return offers.some(o => (o.price?.currency ?? '').toUpperCase() !== to);
}

export function withDisplayPrices(
    offers: FlightOffer[],
    currency: string,
    rates: RatesResult | null,
    now: () => number = Date.now,
): FlightOffer[] {
    const to = currency.toUpperCase();
    const convert = makeStrictConverter(rates, undefined, now);
    const rateSource = rates?.source ?? 'none';

    const priceOne = (offer: FlightOffer): FlightOffer => {
        const from = (offer.price?.currency ?? '').toUpperCase();
        if (!from) return offer;
        try {
            const displayPrice = {
                currency: to,
                total: round(convert(offer.price.total, from, to), to),
                pricePerAdult: round(convert(offer.price.pricePerAdult, from, to), to),
                rateSource: from === to ? 'same-currency' : rateSource,
            };
            const alternatives = offer.alternatives?.map(priceOne);
            return { ...offer, displayPrice, ...(alternatives ? { alternatives } : {}) };
        } catch {
            // No usable rate for this pair: leave the offer unconverted, never mislabelled.
            return offer;
        }
    };

    return offers.map(priceOne);
}
