import { golfServiceFee, roundToCurrency } from '@/lib/pricing';

/**
 * The all-in price of golf (v1 ADR-0047): the green fee plus the service fee, in the currency the
 * visitor chose. The tee-time picker shows it, and piece 2b's checkout will charge it, so the price
 * on the course page is the price on the card.
 *
 * A course prices in its own currency; the visitor sees and pays in theirs (v1 ADR-0051). The green
 * fee is converted first and the fee is then put on the converted figure, as hotels do, and every
 * part is rounded to the visitor's currency so the parts add up to the total exactly.
 */

export interface GolfQuote {
    /** The currency the visitor sees and would pay in. */
    currency: string;
    /** Visitor's currency per 1 unit of the course's. */
    rate: number;
    greenFee: number;
    serviceFee: number;
    total: number;
    markupRate: number;
}

/**
 * @param convert  A strict converter (`makeStrictConverter`). Throws when a currency has no usable
 *                 rate, and so does this: a price that cannot be converted is never guessed.
 */
export function quoteGolf({ greenFeeTotal, currency, chargeCurrency = currency, convert }: {
    greenFeeTotal: number;
    currency: string;
    chargeCurrency?: string;
    convert: (amount: number, from: string, to: string) => number;
}): GolfQuote {
    const course = currency.trim().toUpperCase();
    const charge = chargeCurrency.trim().toUpperCase();

    const greenFee = roundToCurrency(course === charge ? greenFeeTotal : convert(greenFeeTotal, course, charge), charge);
    const fee = golfServiceFee(greenFee, charge, convert);
    const total = roundToCurrency(fee.chargedTotal, charge);

    return {
        currency:   charge,
        rate:       course === charge ? 1 : convert(1, course, charge),
        greenFee,
        serviceFee: roundToCurrency(total - greenFee, charge),
        total,
        markupRate: fee.markupRate,
    };
}
