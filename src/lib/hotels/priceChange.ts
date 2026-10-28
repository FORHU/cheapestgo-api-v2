/**
 * Has the price moved since the traveller was shown one?
 *
 * Between search and prebook the supplier re-prices, and until now nothing told the checkout:
 * it simply showed the new figure, and a traveller who had agreed to one number found
 * themselves looking at another with no sign anything had changed. This is the comparison the
 * prebook response carries so the checkout can say so and ask.
 *
 * It describes; it does not decide. A rise is not an error here — whether to proceed is the
 * traveller's, and `createPayment` already refuses to bill above the total they were shown.
 */

import { toStripeAmount } from '@/lib/pricing';

export interface PriceChange {
    /** What the traveller was shown, in `currency`. */
    previous:   number;
    /** What it is now, in `currency`. */
    current:    number;
    direction:  'up' | 'down';
    currency:   string;
    /** `current - previous`, negative for a drop. */
    difference: number;
}

/** Below a tenth of a percent is a conversion's last digit, not a repricing. */
const RELATIVE_TOLERANCE = 0.001;

/** The currency's smallest unit, so a won and a cent are each "one" and compare honestly. */
function toMinor(amount: number, currency: string): number {
    try {
        return toStripeAmount(amount, currency);
    } catch {
        return Math.round(amount * 100);
    }
}

export function computePriceChange(input: {
    expected: number | null | undefined;
    current:  number;
    currency: string;
}): PriceChange | undefined {
    const { expected, current, currency } = input;
    if (expected == null || !Number.isFinite(expected) || expected <= 0) return undefined;
    if (!Number.isFinite(current) || current <= 0) return undefined;

    const previousMinor = toMinor(expected, currency);
    const currentMinor  = toMinor(current, currency);
    const deltaMinor    = currentMinor - previousMinor;

    const threshold = Math.max(1, Math.round(previousMinor * RELATIVE_TOLERANCE));
    if (Math.abs(deltaMinor) < threshold) return undefined;

    // Rounded to the figure's own precision rather than floating-point whatever it came to.
    const difference = Math.round((current - expected) * 100) / 100;
    return {
        previous:  expected,
        current,
        direction: deltaMinor > 0 ? 'up' : 'down',
        currency:  currency.toUpperCase(),
        difference,
    };
}
