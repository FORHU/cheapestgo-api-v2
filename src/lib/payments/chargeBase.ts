/**
 * Decide what a hotel checkout may actually be charged.
 *
 * The rule this encodes: the Stripe base comes from the supplier quote recorded at
 * prebook time, converted server-side. The client's `amount` is treated as a claim
 * about what the customer was shown — never as the price.
 *
 * Kept free of Prisma, Stripe and HTTP so the rules protecting the charge amount can
 * be tested on their own. See ADR-0021.
 */

import { HOTEL_FX_DISPLAY_TOLERANCE } from '../pricing';

export interface StoredQuote {
    gross: number | string;
    currency: string;
    expires_at: string | Date;
}

export type ChargeBaseResult =
    /** `base` is what to charge: the server's figure, capped at what the customer was shown. */
    | {
        ok: true;
        base: number;
        currency: string;
        quoteGross: number;
        quoteCurrency: string;
        drift: number;
        absorbed: number;
    }
    | {
        ok: false;
        code: 'QUOTE_NOT_FOUND' | 'QUOTE_EXPIRED' | 'FX_UNAVAILABLE' | 'PRICE_CHANGED';
        message: string;
        serverPrice?: number;
        currency?: string;
    };

/**
 * @param quote          Row from `hotel_prebook_quotes`, or null when absent.
 * @param clientAmount   The total the browser says it displayed, in `targetCurrency`.
 * @param targetCurrency Currency the customer will be charged in.
 * @param convert        Converter for quote currency → target. Must throw when it
 *                       cannot convert safely (i.e. `convertCurrencyStrict`).
 * @param now            Injectable clock for tests.
 */
export function resolveHotelChargeBase(
    quote: StoredQuote | null | undefined,
    clientAmount: number,
    targetCurrency: string,
    convert: (amount: number, from: string, to: string) => number,
    now: number = Date.now(),
): ChargeBaseResult {
    if (!quote) {
        return {
            ok: false,
            code: 'QUOTE_NOT_FOUND',
            message: 'This room quote is no longer valid. Please reselect your room.',
        };
    }

    if (new Date(quote.expires_at).getTime() < now) {
        return {
            ok: false,
            code: 'QUOTE_EXPIRED',
            message: 'This room quote has expired. Please reselect your room to get a current price.',
        };
    }

    const quoteGross = Number(quote.gross);
    const quoteCurrency = String(quote.currency).toUpperCase();
    const target = targetCurrency.toUpperCase();

    if (!Number.isFinite(quoteGross) || quoteGross <= 0) {
        return {
            ok: false,
            code: 'QUOTE_NOT_FOUND',
            message: 'This room quote is no longer valid. Please reselect your room.',
        };
    }

    let base: number;
    if (quoteCurrency === target) {
        base = quoteGross;
    } else {
        try {
            base = convert(quoteGross, quoteCurrency, target);
        } catch {
            return {
                ok: false,
                code: 'FX_UNAVAILABLE',
                message: 'Currency conversion is temporarily unavailable. Please try again shortly, or switch your display currency.',
            };
        }
    }

    const drift = Math.abs(clientAmount - base) / base;
    if (drift > HOTEL_FX_DISPLAY_TOLERANCE) {
        return {
            ok: false,
            code: 'PRICE_CHANGED',
            message: 'The price has changed since you started checkout. Please review the updated total.',
            serverPrice: Math.round(base * 100) / 100,
            currency: target,
        };
    }

    // Inside the tolerance, never bill above the figure the customer was shown. If our
    // conversion came out higher we absorb the difference — capped by the tolerance,
    // which is set below the markup buffer so this cannot cost more than the booking
    // earns. If it came out lower, the customer gets the lower price.
    const charged = Math.min(base, clientAmount);

    return {
        ok: true,
        base: charged,
        currency: target,
        quoteGross,
        quoteCurrency,
        drift,
        absorbed: base - charged,
    };
}

export type DisplayedTotalResult =
    | { ok: true; total: number; absorbed: number }
    | { ok: false; code: 'PRICE_CHANGED'; message: string; serverPrice: number; currency: string };

/**
 * Never bill above the total the customer was shown — fee included.
 *
 * `resolveHotelChargeBase` already caps the *base* at what was displayed. This is the same
 * rule applied one step later, to the figure a customer actually agrees to: the base plus the
 * service fee. The fee is deterministic from the base except for its flat part, which is
 * quoted in USD and converted at whatever rate is current, so a rate refresh between prebook
 * and payment can move the total by a fraction of a cent to a few cents. Within the same
 * tolerance the displayed total stands and the difference is absorbed; beyond it the
 * customer is asked to confirm the new total rather than billed it.
 *
 * `displayedTotal` is optional because not every caller sends it. Without it there is
 * nothing to hold the charge to, and the server's own figure is charged.
 */
export function capAtDisplayedTotal(
    chargedTotal: number,
    displayedTotal: number | null | undefined,
    currency: string,
): DisplayedTotalResult {
    const shown = Number(displayedTotal);
    if (!Number.isFinite(shown) || shown <= 0 || chargedTotal <= shown) {
        return { ok: true, total: chargedTotal, absorbed: 0 };
    }

    const drift = (chargedTotal - shown) / chargedTotal;
    if (drift > HOTEL_FX_DISPLAY_TOLERANCE) {
        return {
            ok: false,
            code: 'PRICE_CHANGED',
            message: 'The price has changed since you started checkout. Please review the updated total.',
            serverPrice: Math.round(chargedTotal * 100) / 100,
            currency: currency.toUpperCase(),
        };
    }

    return { ok: true, total: shown, absorbed: Math.round((chargedTotal - shown) * 100) / 100 };
}
