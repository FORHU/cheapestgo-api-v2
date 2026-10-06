import { logger } from '@/lib/logger';

/**
 * Live exchange rates, ported from v1's `src/lib/server/exchange-rates.ts`.
 *
 * Providers are tried in order:
 *   1. open.er-api.com  - ExchangeRate-API's free open endpoint. 166 currencies,
 *      no key, refreshed daily. Covers every currency we support.
 *   2. Frankfurter      - European Central Bank reference rates. Free and keyless
 *      but only 30 currencies: it omits VND, TWD and AED, so it can only ever be
 *      a partial fallback. ECB publishes on business days, so weekend responses
 *      are up to three days stale.
 *   3. the caller's own static table.
 *
 * Both are keyless. Setting EXCHANGE_RATES_API_KEY switches the primary to the
 * paid endpoint, which agrees on shape apart from the rates field name.
 *
 * Two providers rather than one because a single transient failure on a cold
 * process is otherwise a hard 503: the route had Frankfurter alone, and a five
 * second timeout against it was enough to fail the request outright.
 */

/** Currencies the app exposes in its currency picker. */
export const SUPPORTED_CURRENCIES = [
    'USD', 'PHP', 'KRW', 'JPY', 'EUR', 'GBP', 'AUD', 'SGD',
    'MYR', 'THB', 'VND', 'IDR', 'CNY', 'TWD', 'HKD', 'INR', 'AED', 'CAD',
] as const;

export type RateSource = 'live' | 'live-partial' | 'cache' | 'stale-cache';

export interface RatesResult {
    /** USD-per-1-unit format, e.g. { USD: 1, PHP: 0.0162 }. */
    rates:     Record<string, number>;
    source:    RateSource;
    /** Which upstream produced these rates. */
    provider:  string;
    fetchedAt: number;
    /** Supported currencies the upstream did not return. */
    missing:   string[];
}

const CACHE_TTL        = 60 * 60 * 1000; // 1 hour
const UPSTREAM_TIMEOUT = 5000;

let cached: RatesResult | null = null;

/**
 * Convert an upstream "1 USD = X units" map into our "1 unit = Y USD" format,
 * keeping only supported currencies and discarding non-positive values.
 */
function toUsdPerUnit(apiRates: Record<string, unknown>): Record<string, number> {
    const out: Record<string, number> = { USD: 1.0 };
    for (const code of SUPPORTED_CURRENCIES) {
        if (code === 'USD') continue;
        const raw = apiRates[code];
        if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
            out[code] = 1 / raw;
        }
    }
    return out;
}

function missingFrom(rates: Record<string, number>): string[] {
    return SUPPORTED_CURRENCIES.filter(c => !(c in rates));
}

/** Primary: ExchangeRate-API open endpoint. Covers all supported currencies. */
async function fetchFromErApi(): Promise<Record<string, number> | null> {
    const key = process.env.EXCHANGE_RATES_API_KEY;
    const url = key
        ? `https://v6.exchangerate-api.com/v6/${key}/latest/USD`
        : 'https://open.er-api.com/v6/latest/USD';

    const res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) });
    if (!res.ok) throw new Error(`er-api returned ${res.status}`);

    const data = await res.json() as { conversion_rates?: Record<string, unknown>; rates?: Record<string, unknown> };
    const apiRates = data.conversion_rates ?? data.rates;
    if (!apiRates || typeof apiRates !== 'object') throw new Error('er-api returned no rates');

    return toUsdPerUnit(apiRates);
}

/** Fallback: ECB via Frankfurter. Known to omit VND, TWD and AED. */
async function fetchFromFrankfurter(): Promise<Record<string, number> | null> {
    const symbols = SUPPORTED_CURRENCIES.filter(c => c !== 'USD').join(',');
    const res = await fetch(
        `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols}`,
        { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) },
    );
    if (!res.ok) throw new Error(`frankfurter returned ${res.status}`);

    const data = await res.json() as { rates?: Record<string, unknown> };
    if (!data?.rates) throw new Error('frankfurter returned no rates');

    return toUsdPerUnit(data.rates);
}

export class ExchangeRatesService {
    /**
     * Rates from a one-hour process-local cache, refreshed through the provider
     * chain when stale.
     *
     * Never throws. On total upstream failure it returns the last known rates
     * with source 'stale-cache', or null if we have never fetched successfully —
     * callers fall back to their own static table rather than showing nothing.
     */
    async getLiveRates(force = false): Promise<RatesResult | null> {
        const now = Date.now();

        if (!force && cached && now - cached.fetchedAt < CACHE_TTL) {
            return { ...cached, source: 'cache' };
        }

        const providers: Array<[string, () => Promise<Record<string, number> | null>]> = [
            ['er-api',      fetchFromErApi],
            ['frankfurter', fetchFromFrankfurter],
        ];

        for (const [name, fn] of providers) {
            try {
                const rates = await fn();
                if (!rates) continue;

                const missing = missingFrom(rates);
                // A provider that cannot price most of our currencies is not usable.
                if (missing.length > SUPPORTED_CURRENCIES.length / 2) {
                    throw new Error(`only returned ${Object.keys(rates).length} usable rates`);
                }

                cached = { rates, source: missing.length ? 'live-partial' : 'live', provider: name, fetchedAt: now, missing };

                if (missing.length) {
                    logger.warn({
                        message: `[exchange-rates] ${name} did not return: ${missing.join(', ')} — `
                            + 'these will keep their previous/static values.',
                    });
                }
                return cached;
            } catch (err) {
                logger.error({ err, message: `[exchange-rates] provider ${name} failed` });
            }
        }

        if (cached) {
            logger.warn({ message: '[exchange-rates] all providers failed — serving stale cache' });
            return { ...cached, source: 'stale-cache' };
        }

        logger.error({ message: '[exchange-rates] all providers failed and no cache available' });
        return null;
    }
}

/** Test seam: drop the cached rates. */
export function __resetRatesCache(): void {
    cached = null;
}
