// Give every booking taken before the rate was recorded the rate it was actually taken at.
//
// Why it matters: revenue is reported in USD at the rate in force when the payment was taken
// (ADR-0008), and `lockFx` deliberately never throws — a rates outage leaves the FX columns
// null rather than costing the booking. A row with no rate is excluded from every blended
// total, so `/admin/revenue` quietly understates what was sold. This is the other half of that
// design: the backfill it assumes exists.
//
// Rates come from the ECB via Frankfurter, which serves exact historical rates by date for
// free. Currencies the ECB does not publish (VND, TWD, AED) have no historical source at all —
// those rows are written at today's rate and marked `estimated`, so the dashboard can show how
// much of a total is soft rather than presenting a guess as a measurement.
//
// Safe by default:
//   - **Dry run unless `--apply`.** It says what it would write and writes nothing.
//   - **Idempotent.** Only rows where `usd_amount IS NULL` are touched, so a partial run can
//     simply be repeated.
//   - **Skips what it cannot price.** A currency with no rate from either source is left
//     unconverted and counted, not guessed at.
//   - **Says which database it is pointed at before doing anything.**
//
//   npm run backfill-booking-fx             # dry run
//   npm run backfill-booking-fx -- --apply  # write

import { prisma } from '@/lib/prisma';

/** Currencies the ECB publishes. Anything else cannot be priced historically. */
const ECB_CURRENCIES = new Set([
    'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD',
    'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD',
    'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
]);

/** Each table and the column that holds what the customer was charged. */
const TABLES = [
    { name: 'unified_bookings', amount: 'total_price' },
    { name: 'bookings',         amount: 'total_price' },
    { name: 'flight_bookings',  amount: 'COALESCE(charged_price, total_price)' },
] as const;

const RATE_TIMEOUT_MS = 10_000;

const rateCache = new Map<string, number | null>();

/**
 * USD per 1 unit of `currency` on `date` (YYYY-MM-DD), or null when the ECB has no series.
 *
 * Frankfurter answers a weekend or holiday with the prior business day — which is the rate
 * that actually applied, so that is the answer wanted here rather than an error.
 */
async function historicalRate(currency: string, date: string): Promise<number | null> {
    const key = `${currency}:${date}`;
    if (rateCache.has(key)) return rateCache.get(key)!;

    let value: number | null = null;
    try {
        const res = await fetch(
            `https://api.frankfurter.dev/v1/${date}?base=USD&symbols=${currency}`,
            { signal: AbortSignal.timeout(RATE_TIMEOUT_MS) },
        );
        if (res.ok) {
            const perUsd = (await res.json() as any)?.rates?.[currency];
            if (typeof perUsd === 'number' && perUsd > 0) value = 1 / perUsd;
        }
    } catch (err: any) {
        console.warn(`  ! rate lookup failed for ${currency} on ${date}: ${err.message}`);
    }

    rateCache.set(key, value);
    return value;
}

/** Today's rate, for currencies with no ECB history. */
async function fallbackRate(currency: string): Promise<number | null> {
    const key = `${currency}:today`;
    if (rateCache.has(key)) return rateCache.get(key)!;

    let value: number | null = null;
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(RATE_TIMEOUT_MS) });
        if (res.ok) {
            const perUsd = (await res.json() as any)?.rates?.[currency];
            if (typeof perUsd === 'number' && perUsd > 0) value = 1 / perUsd;
        }
    } catch (err: any) {
        console.warn(`  ! fallback rate failed for ${currency}: ${err.message}`);
    }

    rateCache.set(key, value);
    return value;
}

async function main() {
    const apply = process.argv.includes('--apply');

    const target = (() => {
        try {
            const url = new URL(process.env.DATABASE_URL ?? '');
            return `${url.hostname}:${url.port || 5432}${url.pathname}`;
        } catch {
            return '(unparseable DATABASE_URL)';
        }
    })();
    console.log(`[backfill-fx] database: ${target}`);
    console.log(`[backfill-fx] mode:     ${apply ? 'APPLY — rates will be written' : 'dry run — nothing will be written'}\n`);

    let pending = 0, written = 0, estimated = 0, skipped = 0;

    for (const { name, amount } of TABLES) {
        // Table and column names are literals from TABLES above, never input.
        const rows = await prisma.$queryRawUnsafe<{ id: string; amt: unknown; currency: string; booked_on: Date }[]>(`
            SELECT id, ${amount} AS amt, COALESCE(currency, 'USD') AS currency,
                   created_at::date AS booked_on
            FROM ${name}
            WHERE usd_amount IS NULL AND ${amount} IS NOT NULL
            ORDER BY created_at
        `);

        if (!rows.length) {
            console.log(`${name}: nothing to backfill`);
            continue;
        }

        console.log(`${name}: ${rows.length} row(s) pending`);
        pending += rows.length;

        for (const row of rows) {
            const currency = String(row.currency).toUpperCase();
            const date = row.booked_on instanceof Date
                ? row.booked_on.toISOString().slice(0, 10)
                : String(row.booked_on).slice(0, 10);

            let rate: number | null;
            let source: string;
            if (currency === 'USD') {
                rate = 1;
                source = 'identity';
            } else if (ECB_CURRENCIES.has(currency)) {
                rate = await historicalRate(currency, date);
                source = 'ecb-historical';
            } else {
                rate = await fallbackRate(currency);
                source = 'estimated';
            }

            if (!rate) {
                console.warn(`  - ${row.id}: no rate for ${currency} on ${date}, leaving unconverted`);
                skipped++;
                continue;
            }

            const usd = Number(row.amt) * rate;

            if (apply) {
                await prisma.$executeRawUnsafe(
                    `UPDATE ${name} SET usd_amount = $1, fx_rate = $2, fx_captured_at = $3, fx_source = $4 WHERE id = $5::uuid`,
                    usd.toFixed(4), rate.toFixed(10), new Date(`${date}T00:00:00Z`), source, row.id,
                );
            }

            if (source === 'estimated') estimated++;
            written++;
            console.log(`  ${apply ? '✓' : '·'} ${date}  ${String(row.amt).padStart(12)} ${currency} → $${usd.toFixed(2).padStart(10)}  [${source}]`);
        }
    }

    console.log('\n─────────────────────────────────────────');
    console.log(`pending:    ${pending}`);
    console.log(`${apply ? 'written' : 'would write'}:    ${written}`);
    console.log(`estimated:  ${estimated}${estimated ? '  ← no ECB history; soft in the dashboard' : ''}`);
    console.log(`skipped:    ${skipped}${skipped ? '  ← still excluded from blended totals' : ''}`);
    if (!apply && written) console.log('\nRe-run with --apply to commit.');
}

main()
    .catch((err) => { console.error('[backfill-fx] failed:', err); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
