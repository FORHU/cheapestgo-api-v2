/**
 * Capture the exchange rate a booking was taken at.
 *
 * See ADR-0008. Revenue is reported in USD at the rate in force when the payment was
 * taken, so every booking row carries the dollar amount, the rate used, and when that
 * rate was read. The rate is evidence — written once and never recalculated, so a
 * report for a closed period returns the same figure however long afterwards it runs.
 *
 * This runs *after* Stripe has taken the money, so it must never throw and must never
 * block a write. If no rate can be obtained the booking is still recorded with the FX
 * fields left null, and a backfill resolves them later. A booking lost to a rates
 * outage would be far worse than one recorded unconverted.
 */

import { ExchangeRatesService } from '@/services/exchange-rates.service';

export interface FxLock {
    /** The amount restated into USD. Null when no rate was available. */
    usd_amount:     number | null;
    /** USD per 1 unit of the booking's currency. */
    fx_rate:        number | null;
    fx_captured_at: Date | null;
    /** 'identity' (already USD), 'live', or null when unresolved. */
    fx_source:      string | null;
}

const EMPTY: FxLock = { usd_amount: null, fx_rate: null, fx_captured_at: null, fx_source: null };

/**
 * @param amount   Gross charged to the customer, in `currency`.
 * @param currency The booking's Charge Currency (ISO 4217).
 * @param rates    Injectable for tests; defaults to the live rates service.
 */
export async function lockFx(
    amount:   number | null | undefined,
    currency: string | null | undefined,
    rates:    Pick<ExchangeRatesService, 'getLiveRates'> = new ExchangeRatesService(),
): Promise<FxLock> {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || !currency) return EMPTY;

    const ccy = String(currency).toUpperCase();
    const now = new Date();

    // A USD booking needs no rate and no provider call.
    if (ccy === 'USD') {
        return { usd_amount: amount, fx_rate: 1, fx_captured_at: now, fx_source: 'identity' };
    }

    try {
        const result = await rates.getLiveRates();
        const rate = result?.rates?.[ccy];

        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
            console.warn(`[fxLock] No rate for ${ccy} — booking recorded unconverted, backfill will resolve it.`);
            return EMPTY;
        }

        // Rates are USD-per-1-unit, so this is a multiply, not a divide.
        return {
            usd_amount:     amount * rate,
            fx_rate:        rate,
            fx_captured_at: now,
            fx_source:      'live',
        };
    } catch (err) {
        // Money has already moved; never let this fail the write.
        console.error('[fxLock] Rate capture failed — booking recorded unconverted:', err);
        return EMPTY;
    }
}
