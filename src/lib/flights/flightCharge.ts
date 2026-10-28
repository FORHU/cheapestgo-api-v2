/**
 * What a flight costs the traveller: the one function behind both the figure they are
 * **quoted** and the figure their card is **held for**.
 *
 * They were two different numbers. The search, the checkout's total and its Pay button all
 * showed Duffel's raw fare, while `book` charged the fare plus the markup — a $250 fare billed
 * at $272.40 under a button that said "Pay USD 250". Both now come from here, with the same
 * markup spec and the same conversion, so they agree by construction (the hotel flow's
 * `hotelServiceFee` exists for the same reason).
 */

import { AppError } from '@/middleware/error.middleware';
import { applyMarkup, toStripeAmount, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import { orderTotal } from '@/lib/flights/orderTotal';
import { makeStrictConverter } from '@/lib/payments/convertStrict';
import { ExchangeRatesService } from '@/services/exchange-rates.service';

export interface FlightCharge {
    /** The airline's currency, lowercase. */
    baseCurrency:   string;
    /** What the card is charged in, lowercase. The airline's, unless a display currency was asked for. */
    chargeCurrency: string;
    /** The markup applied, in the airline's currency — what the session records as the audit trail. */
    pricing:        ReturnType<typeof applyMarkup>;
    /** What Duffel bills for the order — fare plus chosen seats and bags — in `chargeCurrency`. */
    fare:           number;
    /** What we add, in `chargeCurrency`: `total − fare`, to the cent. */
    serviceFee:     number;
    /** What the card is held for, in `chargeCurrency`. */
    total:          number;
    /** `total` in Stripe's smallest unit. */
    stripeAmount:   number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function priceFlightCharge(
    rawOffer: any,
    opts: { seatServiceIds?: string[]; bagServiceIds?: string[]; displayCurrency?: string } = {},
): Promise<FlightCharge> {
    // What Duffel will ask for this order — the fare plus the seats and bags, all from the
    // offer — in the airline's currency, before markup. The lifecycle prices its capture
    // against the same figure, so it is stored on the session as `original_price`.
    const stripeBase = parseFloat(orderTotal(rawOffer, opts.seatServiceIds ?? [], opts.bagServiceIds ?? []));
    const baseCurrency = String(rawOffer.total_currency ?? 'usd').toLowerCase();
    const chargeCurrency = (opts.displayCurrency || baseCurrency).toLowerCase();

    const convert = makeStrictConverter(
        baseCurrency === chargeCurrency && baseCurrency === 'usd'
            ? null                                   // nothing to convert; skip the fetch
            : await new ExchangeRatesService().getLiveRates(),
    );

    // The flat component is in USD because the costs it recovers are: Duffel's $3.00
    // order fee and Stripe's $0.30. `stripeBase` is in the supplier's currency, so it
    // has to be converted first — adding 4.40 to a PHP fare would charge ₱4.40, about
    // eight US cents. Falling back to zero under-recovers one booking by ~$4.40 rather
    // than refusing it.
    let flatInBaseCurrency = FLIGHT_MARKUP_SPEC.flat;
    try {
        flatInBaseCurrency = convert(FLIGHT_MARKUP_SPEC.flat, 'usd', baseCurrency);
    } catch (fxErr: any) {
        flatInBaseCurrency = 0;
        console.error(
            `[flightCharge] Could not convert the flat markup component USD→${baseCurrency} `
            + `(${fxErr?.message}) — charging the proportional part only.`,
        );
    }

    const pricing = applyMarkup(stripeBase, FLIGHT_MARKUP_SPEC, flatInBaseCurrency);

    // Charge in the customer's own currency, so a refund matches what they paid with no
    // FX drift. Strictly converted: a silent passthrough charges the fare's numeric
    // value in the wrong currency — 5,800 PHP billed as 5,800 USD.
    let fare: number;
    let total: number;
    try {
        const across = chargeCurrency !== baseCurrency;
        total = across ? round2(convert(pricing.chargedPrice, baseCurrency, chargeCurrency)) : pricing.chargedPrice;
        fare  = across ? round2(convert(stripeBase, baseCurrency, chargeCurrency)) : round2(stripeBase);
    } catch (fxErr: any) {
        console.error(`[flightCharge] FX conversion failed (${baseCurrency}→${chargeCurrency}):`, fxErr?.message);
        throw new AppError(
            503,
            'Currency conversion is temporarily unavailable. Your card was not charged. Please try again shortly.',
            'FX_UNAVAILABLE',
        );
    }

    return {
        baseCurrency, chargeCurrency, pricing,
        fare,
        serviceFee: round2(total - fare),
        total,
        stripeAmount: toStripeAmount(total, chargeCurrency),
    };
}
