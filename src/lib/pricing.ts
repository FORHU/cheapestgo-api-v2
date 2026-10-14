/**
 * ─── Markup and pricing ───────────────────────────────────────────────────────
 *
 * The markup recovers **Platform Cost** — Stripe's fees plus the supplier platform's own
 * fees — and nothing else. No margin is intended, and hosting, monitoring and mapping are
 * deliberately outside the set: they scale with the product rather than with bookings, so
 * recovering them through a fare would be a margin under another name. See ADR-0036.
 *
 * ## Platform Cost is flat plus proportional, so the markup is too
 *
 * This is the whole reason a rate alone is not enough. Duffel invoice INV07982 (Aug 2026):
 *
 *     Paid Order        7 × $3.00              = $21.00   flat, per order
 *     Managed Content   1% × $5,812.44         = $58.12   proportional to fare
 *
 * So a flight order costs 1% + $3.00 at Duffel and STRIPE_RATE + STRIPE_FLAT_FEE at
 * Stripe. Break-even on a base fare P is (0.039·P + 3.30) / (0.971·P), which converges to
 * 4.017% as P → ∞ — above the 4% a flat-rate model charged. There is no ticket price at
 * which a single percentage is solvent, because the cost it recovers is not a single
 * percentage: too thin on cheap fares, too fat on expensive ones.
 *
 * ## Cancellations are socialised, which is why the rate exceeds break-even
 *
 * A cancelled booking costs what a completed one costs — Duffel billed all seven August
 * orders including the six that were cancelled, and Stripe keeps its fee on a refund — but
 * the refund returns the markup in full. Spreading that gives
 * M = (3.30 + 0.039·P) / (0.971 − c) for a cancellation rate c. The pole at c = 0.971 means
 * the curve is gentle at low c and violent at high c. Defaults below assume **c = 20%**,
 * which is an assumption awaiting real data, not a measurement.
 *
 * ## FLIGHTS — $4.40 + 7.2%, effective fee capped at 12%
 *
 * The cap bounds the checkout jump on cheap fares, where the flat component is a large
 * share of a small number. Two thresholds matter and they are not the same fare: the cap
 * **binds** below ~$90, but it only stops **covering cost** below ~$54.
 *
 *     $50 → fee $6.00 (capped)   $100 → $11.60   $300 → $26.00   $830 → $64.16
 *
 * ## HOTELS — $0.40 + 5.9%
 *
 * There is no hotel equivalent of the Duffel invoice: the OTV monthly invoice *is* the room
 * cost on a credit line, already funded by the fare. TravelgateX does charge a connection
 * fee but the account is on the **Free** development tier, which must change before
 * go-live, and nothing here absorbs it.
 *
 * The $0.40 covers Stripe's $0.30 per charge. It was decided in ADR-0036 and then not
 * charged: v1 added it to the spec and passed `0` at its only call site in the same commit
 * (`57278e66`), so hotels billed the rate alone while the tolerance below was sized on the
 * assumption that they did not. It is charged now, through `hotelServiceFee`, which is also
 * what the checkout renders — so the fee a customer sees and the fee they pay are one number.
 *
 * ## Bundles
 *
 * Retired. Bundling swapped the hotel rate for a lower bundle rate and nothing else, so the
 * advertised "saving" was funded from the hotel provision. A bundle is still one Duffel
 * order, one OTV booking and two Stripe charges — there is no cost saving to pass on.
 *
 * ─── Changing rates ───────────────────────────────────────────────────────────
 *
 *   FLIGHT_MARKUP_PERCENTAGE=0.072   FLIGHT_MARKUP_FLAT_USD=4.40
 *   HOTEL_MARKUP_PERCENTAGE=0.059    HOTEL_MARKUP_FLAT_USD=0.40
 *   MARKUP_CAP=0.12                  STRIPE_RATE=0.044   # MEASURED, not the headline 2.9%
 *
 *   These are not independent. STRIPE_RATE is an input to all of them and to
 *   HOTEL_FX_DISPLAY_TOLERANCE — changing it without recomputing the rest is how the model
 *   came to charge 4% against a 4.017% floor.
 *
 *   Rates are clamped to [0, 0.50] and the flat component to [0, 50] USD, so a
 *   misconfiguration cannot charge customers absurd prices.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Markup specs ─────────────────────────────────────────────────────────────

/**
 * How much a booking is marked up, in the two shapes Platform Cost actually takes plus a
 * ceiling on the result.
 *
 * `flat` is denominated in **USD**, because that is how the costs it recovers are quoted
 * (Duffel's $3.00 order fee, Stripe's $0.30). It must therefore be converted into the
 * currency the base price is in before use — see `flatInBaseCurrency` on {@link applyMarkup}.
 */
export interface MarkupSpec {
    /** Proportional component, as a decimal (0.059 = 5.9%). */
    rate: number;
    /** Flat component per booking, in USD. */
    flat: number;
    /** Ceiling on the whole fee, as a share of the base price (0.12 = 12%). */
    cap: number;
}

/** 7.2% + $4.40, capped at 12%. Recovers Duffel's 1% + $3.00 and Stripe's rate + flat. */
export const FLIGHT_MARKUP_SPEC: MarkupSpec = {
    rate: parseMarkupEnv('FLIGHT_MARKUP_PERCENTAGE', 0.072),
    flat: parseFlatEnv('FLIGHT_MARKUP_FLAT_USD', 4.40),
    cap:  parseMarkupEnv('MARKUP_CAP', 0.12),
};

/** 5.9% + $0.40, capped at 12%. The flat part covers Stripe's $0.30 per charge. */
export const HOTEL_MARKUP_SPEC: MarkupSpec = {
    rate: parseMarkupEnv('HOTEL_MARKUP_PERCENTAGE', 0.059),
    flat: parseFlatEnv('HOTEL_MARKUP_FLAT_USD', 0.40),
    cap:  parseMarkupEnv('MARKUP_CAP', 0.12),
};

// Logged once at module load, so a misconfigured deployment is visible in the startup log
// rather than in a month of reconciliation.
console.log(
    `[pricing] Effective markup — flights: ${(FLIGHT_MARKUP_SPEC.rate * 100).toFixed(1)}% + $${FLIGHT_MARKUP_SPEC.flat.toFixed(2)}, `
    + `hotels: ${(HOTEL_MARKUP_SPEC.rate * 100).toFixed(1)}% + $${HOTEL_MARKUP_SPEC.flat.toFixed(2)}, `
    + `cap: ${(FLIGHT_MARKUP_SPEC.cap * 100).toFixed(0)}%`,
);

// ── Stripe fees ──────────────────────────────────────────────────────────────

/**
 * Stripe's percentage fee per transaction.
 *
 * **4.4%, measured — not Stripe's headline 2.9%.** Every live charge on this account
 * settles at 2.9% + 1.5% + $0.30: the base rate plus the international-card surcharge,
 * because the Stripe account is US-registered and the customers are not. Read off
 * `balance_transaction` on 2026-09-08 — six live charges, all Philippine cards, every one
 * landing on 4.40% to the cent. Six is enough because the fee is a deterministic tier, not
 * a distribution: one charge establishes the rate.
 *
 * **A KRW charge is international *and* converted, so it attracts a further 1% — around
 * 5.4%. AirangGo is Korea-locked, so read the KR tier before it takes live bookings**
 * rather than learning it from a month of under-recovery. It is not pre-emptively set to
 * 5.4%, because that would over-recover a full point on every Philippine booking.
 */
export const STRIPE_RATE = parseMarkupEnv('STRIPE_RATE', 0.044);

/** Stripe's flat fee per transaction, in major currency units (USD $0.30). */
export const STRIPE_FLAT_FEE = parseFlatEnv('STRIPE_FLAT_FEE', 0.30);

// ── Tolerances ───────────────────────────────────────────────────────────────

/**
 * How far a fare may drift before we stop and ask the traveller to confirm.
 *
 * This MUST be one value shared by every gate that can raise a `price_changed` prompt.
 * When two gates disagreed in v1, a fare drifting between the looser and the stricter
 * threshold sailed past the first check and was rejected by the second, so the traveller
 * was asked about a change the app had just decided was immaterial.
 *
 * Kept tight in production on purpose: markup is sized to recover Platform Cost and nothing
 * more, so an increase absorbed silently is a direct loss rather than a smaller margin.
 */
export const FLIGHT_PRICE_TOLERANCE_LIVE = 0.50;

/** Duffel's test environment returns noisy prices, so a tight threshold there prompts on
 *  nearly every attempt. */
export const FLIGHT_PRICE_TOLERANCE_SANDBOX = 10.00;

/**
 * How far the client's displayed hotel total may differ from the server's own conversion of
 * the supplier quote before checkout stops and re-confirms.
 *
 * The customer is never billed more than the figure they were shown. Within this band the
 * server honours the displayed price and absorbs the difference; beyond it, checkout returns
 * the updated total for the customer to approve.
 *
 * Chosen against the margin, not picked for roundness. At a 5% rate and an assumed 2.9%
 * Stripe fee, a $300 hotel left ~1.77% of the charge and 0.5% consumed 28% of that.
 * Measuring Stripe at 4.4% cut the real buffer to 0.27%, putting a 0.5% tolerance *above
 * the entire margin*: a gap inside tolerance, absorbed by design, made the booking a loss.
 * At 5.9% the buffer is ~1.19%, and 0.3% keeps the same 28% share the original design
 * intended while staying wide enough that ordinary rate movement never interrupts checkout.
 *
 * A function of STRIPE_RATE and the hotel rate. Change either and recompute it.
 */
export const HOTEL_FX_DISPLAY_TOLERANCE = 0.003; // 0.3%

/** How long a recorded prebook quote may be charged from before it must be re-taken. */
export const PREBOOK_QUOTE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Effective flight tolerance for this environment.
 *
 * Compare **base fares** with it, never a total that includes seats or bags: the
 * revalidation gate can only see the bare fare, so a total-vs-base comparison reads the
 * ancillary cost as a price increase and rejects a price the traveller already confirmed.
 */
export function getFlightPriceTolerance(): number {
    // Explicit override, so a sandbox run can rehearse live behaviour. Guarded against the
    // empty string: Number('') is 0, and a blank FLIGHT_PRICE_TOLERANCE= would otherwise
    // reject every fare that moved by a cent.
    const rawOverride = process.env.FLIGHT_PRICE_TOLERANCE?.trim();
    if (rawOverride) {
        const override = Number(rawOverride);
        if (Number.isFinite(override) && override >= 0) return override;
    }
    const token = process.env.DUFFEL_ACCESS_TOKEN ?? process.env.DUFFEL_TOKEN ?? '';
    return token.startsWith('duffel_test_')
        ? FLIGHT_PRICE_TOLERANCE_SANDBOX
        : FLIGHT_PRICE_TOLERANCE_LIVE;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Apply a markup to a base price: a proportional part, a flat part, and a cap on the total.
 *
 * The flat component of a {@link MarkupSpec} is in USD, because the costs it recovers are
 * quoted in USD. `basePrice` is whatever currency the caller is working in, so a caller
 * working in anything else **must** pass `flatInBaseCurrency`, converted at the booking's
 * Locked Rate (ADR-0008). Defaulting it to the raw USD figure is correct only when the base
 * price is already USD.
 *
 * `markupRate` on the way out is the **effective** rate — markup over base, after the flat
 * component and the cap. That is what belongs in `markup_pct`, because it is the only rate
 * consistent with the amounts stored beside it.
 */
export function applyMarkup(
    basePrice: number,
    spec: MarkupSpec,
    flatInBaseCurrency: number = spec.flat,
): {
    originalPrice: number;
    chargedPrice:  number;
    markupAmount:  number;
    markupRate:    number;
    markupFlat:    number;
    capped:        boolean;
} {
    const originalPrice = round2(basePrice);

    // A zero or negative base has no proportional part and nothing to cap against, so a
    // flat fee on it would be unbounded as a rate.
    if (!(originalPrice > 0)) {
        return { originalPrice, chargedPrice: originalPrice, markupAmount: 0, markupRate: 0, markupFlat: 0, capped: false };
    }

    const flat     = Math.max(0, flatInBaseCurrency);
    const uncapped = originalPrice * spec.rate + flat;
    const ceiling  = originalPrice * spec.cap;
    const capped   = uncapped > ceiling;

    const markupAmount = round2(capped ? ceiling : uncapped);
    const chargedPrice = round2(originalPrice + markupAmount);

    return {
        originalPrice,
        chargedPrice,
        markupAmount,
        markupRate: Math.round((markupAmount / originalPrice) * 10000) / 10000,
        markupFlat: round2(flat),
        capped,
    };
}

/**
 * The hotel service fee on a base already in the charge currency, and the total that
 * results — the one function behind both the figure a customer is **shown** and the figure
 * they are **charged**.
 *
 * It exists because those two were computed in different places and had drifted. The
 * server charged 5.9% while v1's checkout rendered a hardcoded 5% and app-v2's a hardcoded
 * 6%, so a $300 room displayed $315.00 and billed $317.70. Deriving both from here, with the
 * same spec and the same conversion, is what makes them agree by construction.
 *
 * The flat component is quoted in USD (it covers Stripe's $0.30 per charge) and is converted
 * into `currency` here. If that conversion is not possible the flat part is dropped rather
 * than the booking refused: failing a sale over forty cents is the wrong trade, and a fee
 * shown without it is never *higher* than the one charged with it — see `create-payment`,
 * which never bills above what was displayed.
 *
 * @param convert  A strict converter; throwing is how it says it cannot convert.
 */
export function hotelServiceFee(
    baseInChargeCurrency: number,
    currency: string,
    convert: (amount: number, from: string, to: string) => number,
): {
    serviceFee: number;
    chargedTotal: number;
    markupRate: number;
    markupFlat: number;
    capped: boolean;
} {
    let flat = 0;
    try {
        flat = convert(HOTEL_MARKUP_SPEC.flat, 'USD', currency);
    } catch {
        flat = 0;
    }
    const pricing = applyMarkup(baseInChargeCurrency, HOTEL_MARKUP_SPEC, flat);
    return {
        serviceFee: pricing.markupAmount,
        chargedTotal: pricing.chargedPrice,
        markupRate: pricing.markupRate,
        markupFlat: pricing.markupFlat,
        capped: pricing.capped,
    };
}

/**
 * The saving a traveller receives by bundling a hotel with a flight.
 *
 * Always zero, and kept as a function rather than deleted so the call site stays honest
 * about there being nothing to advertise. There was never a discount line: bundling swapped
 * one multiplier for another, and that gap is now an earmarked provision against
 * TravelgateX's incoming connection fee — spending it on a discount spends money that is
 * already committed. See ADR-0036.
 */
export function bundleSavingPercent(): number {
    return 0;
}

// ── Stripe amounts ───────────────────────────────────────────────────────────

/**
 * Convert a price to the integer amount Stripe expects — the smallest currency unit, with
 * zero-decimal currencies (JPY, KRW, …) passed as-is.
 */
export function toStripeAmount(price: number, currency: string): number {
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
        ? Math.round(price)
        : Math.round(price * 100);
}

/**
 * Read a Stripe amount back into major currency units — the inverse of
 * {@link toStripeAmount}, and the only correct way to interpret `pi.amount`,
 * `refund.amount`, `balance.available[].amount` or any other Stripe integer.
 *
 * For a two-decimal currency, dividing by 100 by hand is right by accident; for a
 * zero-decimal one it is out by a factor of a hundred. In v1 that made a ₩1,200,000 booking
 * quote a ₩12,000 refund. KRW is a Charge Currency and AirangGo is Korea-locked, so this is
 * not a theoretical currency — it is a primary market.
 */
export function fromStripeAmount(amount: number, currency: string): number {
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
        ? amount
        : round2(amount / 100);
}

// ── Reporting ────────────────────────────────────────────────────────────────

/** What Stripe takes from a given charged price. */
export function calculateStripeFee(chargedPrice: number): number {
    return round2(chargedPrice * STRIPE_RATE + STRIPE_FLAT_FEE);
}

/**
 * What is left of the markup after Stripe, for a hypothetical booking.
 *
 * For finance reporting, not for the payment flow. A positive result is not profit: the
 * supplier platform's own fees arrive on a monthly invoice and are invisible on any single
 * booking, so this is what is available to pay them with, not what is kept.
 */
export function estimateNetProfit(basePrice: number, spec: MarkupSpec): number {
    const { chargedPrice, markupAmount } = applyMarkup(basePrice, spec);
    return round2(markupAmount - calculateStripeFee(chargedPrice));
}

/**
 * Add markup, supplier cost and net profit to a booking for the revenue screen.
 *
 * **It does not fall back to the configured rate.** v1's version recovered a missing
 * supplier cost as `totalAmount / (1 + markupRate)` using the *current* configured rate.
 * That inverse has no term for a flat component, so from the moment flights gained one it
 * was wrong — and being the fallback path for bookings with missing data, it produced
 * plausible, incorrect margins in reporting rather than failing.
 *
 * So the estimate runs only from a rate the booking itself recorded (`markup_pct`). Where
 * none exists, the booking is reported with a zero markup and `isEstimated: true` rather
 * than a guess: a visibly missing figure gets investigated, an invented one gets banked.
 */
export function enrichBookingFinances<T extends {
    totalAmount:   number;
    supplierCost:  number;
    markupAmount:  number;
    profit:        number;
    markup_pct?:   number | null;
}>(booking: T): T & { markupPercentage: number; stripeFee: number; isEstimated: boolean } {
    const markupRate = booking.markup_pct ?? 0;

    let supplierCost = booking.supplierCost;
    let markupAmount = booking.markupAmount;
    let isEstimated  = false;

    if (supplierCost === 0 || supplierCost === booking.totalAmount) {
        if (markupRate > 0) {
            supplierCost = round2(booking.totalAmount / (1 + markupRate));
            markupAmount = round2(booking.totalAmount - supplierCost);
        } else {
            // Nothing recorded and nothing to infer from. Report the gap rather than
            // inventing a margin that finance would go on to bank.
            supplierCost = round2(booking.totalAmount);
            markupAmount = 0;
        }
        isEstimated = true;
    } else if (markupAmount === 0 && supplierCost < booking.totalAmount) {
        markupAmount = round2(booking.totalAmount - supplierCost);
    }

    const stripeFee = calculateStripeFee(booking.totalAmount);

    // The rate this booking actually carried, read off its own amounts rather than off a
    // configured constant — which would print today's number against a booking sold at a
    // different one.
    const effectiveRate = supplierCost > 0 ? markupAmount / supplierCost : markupRate;

    return {
        ...booking,
        supplierCost,
        markupAmount,
        profit: round2(markupAmount - stripeFee),
        markupPercentage: Number((effectiveRate * 100).toFixed(2)),
        stripeFee,
        isEstimated,
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Currencies where Stripe expects whole units rather than minor ones. */
const ZERO_DECIMAL_CURRENCIES = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
    'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Clamped to [0, 0.50] so a misconfiguration cannot overcharge a customer. */
function parseMarkupEnv(key: string, defaultValue: number): number {
    const raw = process.env[key];
    if (!raw) return defaultValue;
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) return defaultValue;
    return Math.max(0, Math.min(0.50, parsed));
}

/** Clamped to [0, 50] USD, for the same reason: a stray decimal point in a deployment's
 *  env should not add hundreds of dollars of fees to a cheap fare. */
function parseFlatEnv(key: string, defaultValue: number): number {
    const raw = process.env[key];
    if (!raw) return defaultValue;
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) return defaultValue;
    return Math.max(0, Math.min(50, parsed));
}
