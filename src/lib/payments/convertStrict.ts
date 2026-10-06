/**
 * Currency conversion for amounts that determine money movement.
 *
 * Unlike a display conversion this throws rather than returning the amount
 * unconverted, because silently passing 5800 through a PHP→USD conversion charges
 * 5800 USD. A provider outage must fail the booking loudly, not bill at a stale rate.
 *
 * Rates arrive from `ExchangeRatesService`, which never throws and can serve a stale
 * cache — so freshness is checked here rather than assumed.
 */

import type { RatesResult } from '@/services/exchange-rates.service';

export class ExchangeRateError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExchangeRateError';
    }
}

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Build a converter bound to one set of rates.
 *
 * Returned as a closure so `resolveHotelChargeBase` can stay free of I/O: the caller
 * fetches rates once, and the rule it hands them to cannot reach for different ones
 * partway through a decision.
 *
 * @param rates    Result from `ExchangeRatesService.getLiveRates()`, or null when the
 *                 providers and the cache both had nothing.
 * @param maxAgeMs Reject rates older than this. Defaults to 24h.
 * @param now      Injectable clock for tests.
 */
export function makeStrictConverter(
    rates: RatesResult | null,
    maxAgeMs: number = DEFAULT_MAX_AGE_MS,
    now: () => number = Date.now,
): (amount: number, from: string, to: string) => number {
    return (amount: number, fromCurrency: string, toCurrency: string): number => {
        const from = fromCurrency.toUpperCase();
        const to   = toCurrency.toUpperCase();

        // Same currency needs no rate at all, so an FX outage must not block it.
        if (from === to) return amount;

        if (!Number.isFinite(amount)) {
            throw new ExchangeRateError(`Refusing to convert non-finite amount: ${amount}`);
        }

        if (!rates) {
            throw new ExchangeRateError(
                `No exchange rates available — refusing to convert ${from}→${to} for a charge.`,
            );
        }

        const age = now() - rates.fetchedAt;
        if (age > maxAgeMs) {
            throw new ExchangeRateError(
                `Exchange rates are ${Math.round(age / 3_600_000)}h old; `
                + `refusing to convert ${from}→${to} for a charge.`,
            );
        }

        const fromRate = rates.rates[from];
        const toRate   = rates.rates[to];

        if (!fromRate || !toRate) {
            throw new ExchangeRateError(
                `No exchange rate for ${!fromRate ? from : to} — cannot convert ${from}→${to} safely.`,
            );
        }

        // Rates are USD-per-1-unit, so cross-convert through USD.
        return (amount * fromRate) / toRate;
    };
}
