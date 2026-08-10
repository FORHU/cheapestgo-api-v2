/** 5% — covers Stripe fees with a larger buffer for multi-night refund risk */
export const HOTEL_MARKUP = parseMarkupEnv('HOTEL_MARKUP_PERCENTAGE', 0.05);

/** 4% — blended rate for flight + hotel bundles */
export const BUNDLE_MARKUP = parseMarkupEnv('BUNDLE_MARKUP_PERCENTAGE', 0.04);

/** Currencies where Stripe expects the amount in whole units (no cents) */
const ZERO_DECIMAL_CURRENCIES = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
    'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

export function applyMarkup(basePrice: number, markupRate: number): {
    originalPrice: number;
    chargedPrice:  number;
    markupAmount:  number;
    markupRate:    number;
} {
    const chargedPrice = round2(basePrice * (1 + markupRate));
    return {
        originalPrice: round2(basePrice),
        chargedPrice,
        markupAmount:  round2(chargedPrice - basePrice),
        markupRate,
    };
}

export function toStripeAmount(price: number, currency: string): number {
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
        ? Math.round(price)
        : Math.round(price * 100);
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function parseMarkupEnv(key: string, defaultValue: number): number {
    const raw = process.env[key];
    if (!raw) return defaultValue;
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) return defaultValue;
    return Math.max(0, Math.min(0.50, parsed));
}
