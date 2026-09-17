/**
 * Whether the markup actually covered **Platform Cost** for a given month.
 *
 * The markup is priced from estimates — it has to be, since it is applied before a charge
 * exists — and until now nothing ever compared those estimates to what was really taken.
 * `STRIPE_RATE` carried the US domestic-card figure while charges settle in KRW, USD and
 * PHP; Duffel's per-order fee was not modelled at all. A 4% markup sat below a 4.017%
 * break-even for months and the only thing that surfaced it was an invoice screenshot
 * arriving by chance.
 *
 * This is the loop that closes. It reads back what the booking paths now record — the real
 * Stripe fee from `booking_financial_events.metadata` — and sets it beside what the model
 * assumed, so drift shows up in a query instead of in an invoice.
 *
 * Derived on every call, never stored, for the reason ADR-0026 gives: a stored discrepancy
 * is a third record that can disagree with the two it summarises. See ADR-0036.
 */

import { prisma } from '@/lib/prisma';
import { STRIPE_RATE, STRIPE_FLAT_FEE, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';

/**
 * Duffel's published schedule, from invoice INV07982 (Aug 2026).
 *
 * Not read from an API — Duffel exposes no billing endpoint — so these are transcribed and
 * must be re-checked against the invoice when it changes. That is precisely why the
 * reconciliation below reports the *expected* Duffel cost rather than asserting it: the
 * monthly invoice remains the authority.
 */
export const DUFFEL_PAID_ORDER_USD = 3.00;
export const DUFFEL_MANAGED_CONTENT_RATE = 0.01;

/** Roles whose bookings are the team's own, and so are not demand. */
const STAFF_ROLES = ['admin', 'support_agent'];

/** Statuses that mean an order existed and then did not survive. */
const CANCELLED_STATUSES = [
    'cancelled', 'refunded', 'refund_pending', 'cancel_requested',
    'cancel_failed', 'refund_failed', 'failed', 'expired',
];

/** Below this, a cancellation rate is noise rather than a measurement. */
const MEANINGFUL_ORDER_COUNT = 20;

export interface PlatformCostPeriod {
    /** `YYYY-MM`. */
    month: string;

    /** Orders created, excluding staff bookings. */
    orders:    number;
    /** Of those, how many were cancelled in any form. */
    cancelled: number;
    /**
     * The cancellation rate the markup is sized against. `null` when there are too few
     * orders to mean anything — a rate off three bookings is noise, and reporting it as
     * though it were a measurement is how a bad number gets banked. The model assumes 20%.
     */
    cancellationRate: number | null;

    /** Staff bookings excluded from the figures above, reported so the exclusion is visible. */
    staffOrdersExcluded: number;

    /** Markup collected on orders that were not cancelled, in USD. */
    markupRetainedUsd: number;

    /** What the model assumed Stripe would take, in USD. */
    stripeFeeEstimatedUsd: number;
    /** What Stripe's balance transactions say it actually took, in USD. */
    stripeFeeRecordedUsd:  number;
    /** How many orders have a recorded fee. Low coverage makes the comparison meaningless. */
    stripeFeeRecordedCount: number;
    /** The effective rate implied by the recorded fees. `null` until one has been recorded. */
    stripeRateObserved:   number | null;
    stripeRateConfigured: number;

    /** Expected Duffel billing for the month: orders × $3.00 + 1% of order value. */
    duffelExpectedUsd: number;

    /** markupRetained − (stripeRecorded ?? stripeEstimated) − duffelExpected. Negative is under-recovery. */
    netUsd: number;

    /** Things that make the numbers above less trustworthy than they look. */
    caveats: string[];
}

interface ScopedRow {
    orders:               number;
    cancelled:            number;
    staff_orders:         number;
    markup_retained_usd:  number;
    charged_usd:          number;
    supplier_usd:         number;
    charged_retained_usd: number;
}

interface FeeRow {
    recorded_count: number;
    recorded_usd:   number;
    gross_usd:      number;
    non_usd:        number;
}

/**
 * Reconcile one month. `month` is `YYYY-MM`; defaults to the previous month, since Duffel
 * invoices in arrears and the current month is always partial.
 */
export async function reconcilePlatformCost(month?: string): Promise<PlatformCostPeriod> {
    const period  = month ?? previousMonth();
    const caveats: string[] = [];

    // Flights only. Hotels carry no per-order supplier fee to reconcile — the OTV invoice
    // *is* the room cost, already funded by the fare — and TravelgateX is still on the free
    // development tier. That changes the day TGX starts billing.
    const [row] = await prisma.$queryRaw<ScopedRow[]>`
        WITH scoped AS (
            SELECT b.id,
                   b.status,
                   -- fx_rate_snapshot restates a charge into the reporting currency at the
                   -- rate in force when it was taken (ADR-0008), so a closed month never
                   -- moves. Falling back to 1 assumes USD, which is what the column default
                   -- meant before the snapshot existed.
                   COALESCE(b.charged_price, b.total_price, 0)
                       * COALESCE(NULLIF(b.fx_rate_snapshot, 0), 1)          AS charged_usd,
                   COALESCE(b.supplier_cost, 0)
                       * COALESCE(NULLIF(b.fx_rate_snapshot, 0), 1)          AS supplier_usd,
                   COALESCE(u.role, 'user') = ANY(${STAFF_ROLES})            AS is_staff,
                   b.status = ANY(${CANCELLED_STATUSES})                     AS is_cancelled
            FROM flight_bookings b
            LEFT JOIN users u ON u.id = b.user_id
            WHERE to_char(b.created_at, 'YYYY-MM') = ${period}
        )
        SELECT
            COUNT(*) FILTER (WHERE NOT is_staff)::int                        AS orders,
            COUNT(*) FILTER (WHERE NOT is_staff AND is_cancelled)::int       AS cancelled,
            COUNT(*) FILTER (WHERE is_staff)::int                            AS staff_orders,
            -- A cancellation refunds the markup in full, so only surviving orders retain
            -- anything. That is the whole reason the rate carries a buffer.
            COALESCE(SUM(charged_usd - supplier_usd)
                     FILTER (WHERE NOT is_staff AND NOT is_cancelled), 0)::float8
                                                                             AS markup_retained_usd,
            COALESCE(SUM(charged_usd) FILTER (WHERE NOT is_staff), 0)::float8 AS charged_usd,
            COALESCE(SUM(supplier_usd) FILTER (WHERE NOT is_staff), 0)::float8 AS supplier_usd,
            COALESCE(SUM(charged_usd)
                     FILTER (WHERE NOT is_staff AND NOT is_cancelled), 0)::float8
                                                                             AS charged_retained_usd
        FROM scoped
    `;

    // What Stripe really took, from the ledger the webhook now writes. Fees are recorded in
    // the settlement currency; the account settles USD, so they are summed as-is and a
    // non-USD row is flagged rather than silently converted.
    const [fees] = await prisma.$queryRaw<FeeRow[]>`
        SELECT
            COUNT(*) FILTER (WHERE e.metadata ? 'stripeFee')::int             AS recorded_count,
            COALESCE(SUM((e.metadata->>'stripeFee')::numeric)
                     FILTER (WHERE e.metadata->>'stripeFeeCurrency' = 'USD'), 0)::float8
                                                                             AS recorded_usd,
            COALESCE(SUM(e.amount)
                     FILTER (WHERE e.metadata->>'stripeFeeCurrency' = 'USD'), 0)::float8
                                                                             AS gross_usd,
            COUNT(*) FILTER (WHERE e.metadata ? 'stripeFee'
                               AND e.metadata->>'stripeFeeCurrency' <> 'USD')::int
                                                                             AS non_usd
        FROM booking_financial_events e
        JOIN flight_bookings b ON b.id = e.booking_id
        LEFT JOIN users u ON u.id = b.user_id
        WHERE e.event_type = 'payment'
          AND to_char(e.created_at, 'YYYY-MM') = ${period}
          AND COALESCE(u.role, 'user') <> ALL(${STAFF_ROLES})
    `;

    const orders          = Number(row?.orders ?? 0);
    const cancelled       = Number(row?.cancelled ?? 0);
    const staffOrders     = Number(row?.staff_orders ?? 0);
    const chargedUsd      = Number(row?.charged_usd ?? 0);
    const supplierUsd     = Number(row?.supplier_usd ?? 0);
    const chargedRetained = Number(row?.charged_retained_usd ?? 0);
    const markupRetained  = round2(Number(row?.markup_retained_usd ?? 0));
    const recordedCount   = Number(fees?.recorded_count ?? 0);
    const grossUsd        = Number(fees?.gross_usd ?? 0);
    const nonUsd          = Number(fees?.non_usd ?? 0);

    // Stripe is paid on every charge, cancelled or not — it keeps its fee on a refund — so
    // the estimate is taken over all orders, not just surviving ones.
    const stripeFeeEstimatedUsd = round2(chargedUsd * STRIPE_RATE + orders * STRIPE_FLAT_FEE);
    const stripeFeeRecordedUsd  = round2(Number(fees?.recorded_usd ?? 0));
    const stripeRateObserved    = grossUsd > 0
        ? Math.round((stripeFeeRecordedUsd / grossUsd) * 10_000) / 10_000
        : null;

    // Duffel bills on the order as created, including ones later cancelled — the August
    // invoice charged all seven orders when six had been cancelled.
    const duffelExpectedUsd = round2(orders * DUFFEL_PAID_ORDER_USD + supplierUsd * DUFFEL_MANAGED_CONTENT_RATE);

    if (orders < MEANINGFUL_ORDER_COUNT) {
        caveats.push(`Only ${orders} non-staff orders — too few for the cancellation rate to be a measurement.`);
    }
    if (staffOrders) {
        caveats.push(`${staffOrders} staff booking(s) excluded. They cost Duffel $3.00 each regardless.`);
    }
    if (orders > 0 && recordedCount < orders) {
        caveats.push(
            `Stripe fee recorded on ${recordedCount} of ${orders} orders — `
            + 'bookings taken before fee recording shipped will never have one.',
        );
    }
    if (nonUsd) {
        caveats.push(`${nonUsd} fee(s) settled in a non-USD currency and are excluded from the USD totals.`);
    }
    if (stripeRateObserved !== null && Math.abs(stripeRateObserved - STRIPE_RATE) > 0.005) {
        caveats.push(
            `Observed Stripe rate ${(stripeRateObserved * 100).toFixed(2)}% differs from the configured `
            + `${(STRIPE_RATE * 100).toFixed(2)}% by more than half a point — retune STRIPE_RATE.`,
        );
    }
    if (chargedRetained > 0 && FLIGHT_MARKUP_SPEC.flat === 0) {
        caveats.push('FLIGHT_MARKUP_SPEC.flat is 0 — the per-order Duffel fee is not being recovered at all.');
    }

    // Prefer what was actually taken; fall back to the estimate when nothing was recorded,
    // so an early month still produces a number rather than a hole.
    const stripeActualOrEstimate = recordedCount > 0 ? stripeFeeRecordedUsd : stripeFeeEstimatedUsd;

    return {
        month: period,
        orders,
        cancelled,
        cancellationRate: orders >= MEANINGFUL_ORDER_COUNT ? Math.round((cancelled / orders) * 10_000) / 10_000 : null,
        staffOrdersExcluded: staffOrders,
        markupRetainedUsd:   markupRetained,
        stripeFeeEstimatedUsd,
        stripeFeeRecordedUsd,
        stripeFeeRecordedCount: recordedCount,
        stripeRateObserved,
        stripeRateConfigured: STRIPE_RATE,
        duffelExpectedUsd,
        netUsd: round2(markupRetained - stripeActualOrEstimate - duffelExpectedUsd),
        caveats,
    };
}

function previousMonth(): string {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
