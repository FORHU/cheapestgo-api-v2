import { golfServiceFee, roundToCurrency } from '@/lib/pricing';

/**
 * The all-in price of golf (v1 ADR-0047): the green fee and any extras plus the service fee, in the
 * currency the visitor chose. The tee-time picker shows it and the checkout charges it, so the price
 * on the course page is the price on the card.
 *
 * A course prices in its own currency; the visitor sees and pays in theirs (v1 ADR-0051). Each part
 * is converted on its own and the fee is then put on the converted figures, as hotels do, and every
 * part is rounded to the visitor's currency so the parts add up to the total exactly.
 */

export interface GolfQuote {
    /** The currency the visitor sees and would pay in. */
    currency: string;
    /** Visitor's currency per 1 unit of the course's. */
    rate: number;
    greenFee: number;
    /** Each extra's line, converted on its own, in the order given. */
    extraTotals: number[];
    extrasTotal: number;
    serviceFee: number;
    total: number;
    markupRate: number;
}

type Convert = (amount: number, from: string, to: string) => number;

/** An amount of the course's, in the visitor's currency, to the unit that currency has. */
export function inChargeCurrency(amount: number, course: string, charge: string, convert: Convert): number {
    return roundToCurrency(course === charge ? amount : convert(amount, course, charge), charge);
}

/**
 * @param convert  A strict converter (`makeStrictConverter`). Throws when a currency has no usable
 *                 rate, and so does this: a price that cannot be converted is never guessed.
 */
export function quoteGolf({ greenFeeTotal, extraTotals = [], currency, chargeCurrency = currency, convert }: {
    greenFeeTotal: number;
    /** Each extra's line, in the course's currency. */
    extraTotals?: number[];
    currency: string;
    chargeCurrency?: string;
    convert: Convert;
}): GolfQuote {
    const course = currency.trim().toUpperCase();
    const charge = chargeCurrency.trim().toUpperCase();

    const greenFee = inChargeCurrency(greenFeeTotal, course, charge, convert);
    const lines = extraTotals.map((line) => inChargeCurrency(line, course, charge, convert));
    const extrasTotal = roundToCurrency(lines.reduce((sum, line) => sum + line, 0), charge);
    const base = roundToCurrency(greenFee + extrasTotal, charge);
    const fee = golfServiceFee(base, charge, convert);
    const total = roundToCurrency(fee.chargedTotal, charge);

    return {
        currency:    charge,
        rate:        course === charge ? 1 : convert(1, course, charge),
        greenFee,
        extraTotals: lines,
        extrasTotal,
        serviceFee:  roundToCurrency(total - base, charge),
        total,
        markupRate:  fee.markupRate,
    };
}
