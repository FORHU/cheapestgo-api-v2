import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ZERO_DECIMAL_CURRENCIES } from '@/lib/pricing';

/**
 * The back office's view of money, derived rather than stored — see ADR-0003.
 *
 * There is no `payments` table. A **Payment** is one Stripe PaymentIntent, and the rows that know
 * about one are spread across the tables that own each product: `bookings` and `hotel_bookings`
 * for stays, `flight_bookings` for flights, and `booking_sessions` for a checkout that took a
 * card and never became either. This unions them into one grain so support can search money the
 * way a customer talks about it, instead of guessing which product table to open.
 *
 * Deliberately raw SQL. The union is across tables with different column names, different money
 * representations (`amount_minor` against `total_price`) and no shared relation, which Prisma's
 * query builder cannot express — and the alternative, reading all four into memory and merging,
 * is the thing the brief rules out for a table that must filter, sort and paginate server-side.
 */

/** Which product a payment was taken for. `unknown` is a session that never chose. */
export type PaymentProduct = 'hotel' | 'flight' | 'unknown';

export interface PaymentRow {
    /** The Stripe PaymentIntent. The grain, and the only id every source agrees on. */
    paymentIntentId: string;
    /** Which table the row came from, so the detail view knows where to look next. */
    source: 'bookings' | 'hotel_bookings' | 'flight_bookings' | 'booking_sessions';
    /** The primary key in `source`. The timeline's event tables key on this, not on the intent. */
    internalId: string;
    product: PaymentProduct;
    bookingReference: string | null;
    bookingStatus: string | null;
    /** The supplier's own reference, where we were given one. Never re-read — see ADR-0003. */
    supplierReference: string | null;
    provider: string | null;
    customerEmail: string | null;
    customerName: string | null;
    userId: string | null;
    /** Decimal, as the source recorded it. Minor units are converted at the query. */
    amount: Prisma.Decimal | null;
    currency: string | null;
    createdAt: Date;
}

/**
 * One record behind a payment: which table holds it, and what it says.
 *
 * A successful hotel booking always has two — the lifecycle attempt and the sale it became —
 * so a payment having several records is normal and is detail, not a finding.
 */
export interface PaymentRecord {
    source: PaymentRow['source'];
    internalId: string;
    bookingReference: string | null;
    bookingStatus: string | null;
}

/**
 * A payment, at the grain the back office counts in: one Stripe PaymentIntent, one row.
 *
 * This replaced a row per internal record. Two tables hold a hotel booking by design
 * (db/migrations/20261015000001_hotel_booking_lifecycle.sql: "the workflow of a booking attempt,
 * beside the sale it may become"), so every healthy stay appeared twice and was flagged as a
 * duplicate — a warning that is always on, which is the thing ADR-0003 set out to avoid.
 */
export interface PaymentGroup {
    paymentIntentId: string;
    product: PaymentProduct;
    bookingReference: string | null;
    supplierReference: string | null;
    provider: string | null;
    customerEmail: string | null;
    customerName: string | null;
    userId: string | null;
    amount: Prisma.Decimal | null;
    currency: string | null;
    /** The earliest record's timestamp: when this payment first appeared anywhere. */
    createdAt: Date;
    /** Every record behind it, oldest first. */
    records: PaymentRecord[];
    /**
     * Set only when the records disagree in a way that cannot be explained by the normal
     * lifecycle-plus-sale pair: more than one booking reference on one payment, or two records
     * from the same table. This is the finding the page exists to surface.
     */
    anomaly?: 'multiple_references' | 'repeated_source';
}

export interface PaymentListFilters {
    /** Matches a booking reference, PaymentIntent, PNR or customer email. */
    search?: string;
    product?: PaymentProduct;
    bookingStatus?: string;
    currency?: string;
    provider?: string;
    from?: Date;
    to?: Date;
}

export interface PaymentListPage {
    /** One per PaymentIntent. `total` counts these, not the records inside them. */
    rows: PaymentGroup[];
    total: number;
}

/**
 * One SELECT per source, unioned.
 *
 * `bookings` and `hotel_bookings` both describe stays and overlap during the v2 cutover
 * (ADR-0014): the same stay can exist in both, under the same PaymentIntent. They are *not*
 * de-duplicated here. A payment visible twice under two different internal records is a fact
 * support needs to see, not a presentation artefact to hide — it is how a double-written booking
 * announces itself.
 */
/**
 * Every payment-bearing row, as one set. Exported for tests: the arms differ in which column
 * holds the booking reference, and reading the wrong one is invisible until a page prints
 * "no booking" beside a booking that exists.
 */
export function unionSelect(): Prisma.Sql {
    return Prisma.sql`
        SELECT b.payment_intent_id                         AS payment_intent_id,
               'bookings'                                  AS source,
               b.id::text                                  AS internal_id,
               'hotel'                                     AS product,
               -- booking_id is the reference this system mints, shows the guest, and looks a
               -- booking up by. booking_reference is a separate, nullable column that the v2
               -- booking path never writes. Reading only the latter printed "no booking" beside
               -- every stay that had one, which is the exact row this page exists to surface --
               -- made to look like the failure it is meant to report.
               COALESCE(NULLIF(TRIM(b.booking_reference), ''), b.booking_id) AS booking_reference,
               b.status                                    AS booking_status,
               NULL::text                                  AS supplier_reference,
               b.provider                                  AS provider,
               b.holder_email                              AS customer_email,
               NULLIF(TRIM(CONCAT(b.holder_first_name, ' ', b.holder_last_name)), '') AS customer_name,
               b.user_id::text                             AS user_id,
               b.total_price                               AS amount,
               -- Upper-cased in every arm: sessions keep Stripe's lower-case usd and the booking
               -- tables keep USD, so as stored the currency filter matched one set and skipped
               -- the other. (No backticks in here: this is inside a JS template literal.)
               UPPER(b.currency)                           AS currency,
               b.created_at                                AS created_at
          FROM bookings b
         WHERE b.payment_intent_id IS NOT NULL

        UNION ALL

        SELECT hb.payment_intent_id,
               'hotel_bookings',
               hb.id::text,
               'hotel',
               hb.booking_reference,
               hb.status::text,
               hb.supplier_reference,
               hb.provider,
               u.email,
               NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
               hb.user_id::text,
               -- Stored in Stripe's minor units here and as a decimal everywhere else. Dividing by
               -- 100 is right only for two-decimal currencies: a zero-decimal one (JPY, KRW) is
               -- already whole units, and a blanket "/ 100" showed ¥72,576 as 725.76. The list is
               -- pricing's own, so it cannot drift from the one that wrote this column.
               CASE WHEN LOWER(hb.currency) IN (${Prisma.join([...ZERO_DECIMAL_CURRENCIES])})
                    THEN hb.amount_minor::numeric
                    ELSE hb.amount_minor::numeric / 100 END,
               UPPER(hb.currency),
               hb.created_at
          FROM hotel_bookings hb
          LEFT JOIN users u ON u.id = hb.user_id
         WHERE hb.payment_intent_id IS NOT NULL

        UNION ALL

        SELECT fb.payment_intent_id,
               'flight_bookings',
               fb.id::text,
               'flight',
               -- A flight is identified by its PNR everywhere else (admin search, the confirmation
               -- email, the booking list); nothing writes its booking_reference column, so reading
               -- only that printed no booking beside every flight and made PNR search match nothing.
               COALESCE(NULLIF(TRIM(fb.booking_reference), ''), NULLIF(TRIM(fb.pnr), '')),
               fb.status,
               fb.provider_order_id,
               fb.provider,
               u.email,
               NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
               fb.user_id::text,
               fb.total_price,
               UPPER(fb.currency),
               fb.created_at
          FROM flight_bookings fb
          LEFT JOIN users u ON u.id = fb.user_id
         WHERE fb.payment_intent_id IS NOT NULL

        UNION ALL

        -- A card taken at checkout for a booking that never appeared. The row most worth finding:
        -- money moved and no product table knows about it. Only sessions with no booking of their
        -- own are listed, so a completed checkout is not counted twice.
        SELECT bs.payment_intent_id,
               'booking_sessions',
               bs.id::text,
               'unknown',
               bs.booking_reference,
               bs.lifecycle_status,
               NULL::text,
               bs.provider,
               u.email,
               NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''),
               bs.user_id::text,
               bs.charged_price,
               UPPER(bs.currency),
               bs.created_at
          FROM booking_sessions bs
          LEFT JOIN users u ON u.id = bs.user_id
         WHERE bs.payment_intent_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM flight_bookings f WHERE f.payment_intent_id = bs.payment_intent_id
           )
           AND NOT EXISTS (
               SELECT 1 FROM bookings b2 WHERE b2.payment_intent_id = bs.payment_intent_id
           )
           AND NOT EXISTS (
               SELECT 1 FROM hotel_bookings h2 WHERE h2.payment_intent_id = bs.payment_intent_id
           )
    `;
}

/** The filters, as one WHERE applied to the unioned set rather than to each source. */
function whereFor(f: PaymentListFilters): Prisma.Sql {
    const clauses: Prisma.Sql[] = [];

    if (f.search) {
        // One box for the four things a customer or an agent actually quotes.
        const like = `%${f.search.trim()}%`;
        clauses.push(Prisma.sql`(
            p.booking_reference ILIKE ${like}
         OR p.payment_intent_id ILIKE ${like}
         OR p.customer_email    ILIKE ${like}
         OR p.supplier_reference ILIKE ${like}
        )`);
    }
    if (f.product)       clauses.push(Prisma.sql`p.product = ${f.product}`);
    if (f.bookingStatus) clauses.push(Prisma.sql`p.booking_status = ${f.bookingStatus}`);
    // Compared against the normalised column, so the case the caller typed does not matter.
    if (f.currency)      clauses.push(Prisma.sql`p.currency = ${f.currency.trim().toUpperCase()}`);
    if (f.provider)      clauses.push(Prisma.sql`p.provider = ${f.provider}`);
    if (f.from)          clauses.push(Prisma.sql`p.created_at >= ${f.from}`);
    if (f.to)            clauses.push(Prisma.sql`p.created_at <= ${f.to}`);

    return clauses.length ? Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}` : Prisma.empty;
}

/**
 * A page of payments, newest first, filtered and counted in the database.
 *
 * The count is a second query over the same union rather than a window function: the brief is
 * explicit that the browser must not receive the whole history, and a `COUNT(*) OVER ()` would
 * still make the database materialise every matching row to answer the page.
 */
export async function listPayments(
    filters: PaymentListFilters,
    page: { limit: number; offset: number },
): Promise<PaymentListPage> {
    const union = unionSelect();
    const where = whereFor(filters);

    // Grouped in the database, not after the fact. A page of 25 must be 25 payments, and the
    // total must count payments — paging over records would hand the browser a page whose size
    // depends on how many tables happened to mention each one.
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT p.payment_intent_id,
               MIN(p.created_at)                                   AS created_at,
               -- One payment's records agree on these; MIN is a way to pick one, not a sum.
               MIN(p.product)                                      AS product,
               MIN(p.currency)                                     AS currency,
               MAX(p.amount)                                       AS amount,
               MIN(p.booking_reference)                            AS booking_reference,
               MIN(p.supplier_reference)                           AS supplier_reference,
               MIN(p.provider)                                     AS provider,
               MIN(p.customer_email)                               AS customer_email,
               MIN(p.customer_name)                                AS customer_name,
               MIN(p.user_id)                                      AS user_id,
               COUNT(DISTINCT p.booking_reference)                 AS reference_count,
               COUNT(*)                                            AS record_count,
               COUNT(DISTINCT p.source)                            AS source_count,
               JSON_AGG(JSON_BUILD_OBJECT(
                   'source',           p.source,
                   'internalId',       p.internal_id,
                   'bookingReference', p.booking_reference,
                   'bookingStatus',    p.booking_status
               ) ORDER BY p.created_at ASC)                        AS records
          FROM (${union}) p
        ${where}
         GROUP BY p.payment_intent_id
         ORDER BY MIN(p.created_at) DESC
         LIMIT ${page.limit} OFFSET ${page.offset}
    `);

    const counted = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(DISTINCT p.payment_intent_id)::bigint AS count FROM (${union}) p ${where}
    `);

    return {
        rows: rows.map(toPaymentGroup),
        total: Number(counted[0]?.count ?? 0),
    };
}

/**
 * A grouped row, with the one judgement this query makes: whether the records disagree.
 *
 * A hotel booking writes two records by design, so a count above one proves nothing. What does
 * is two records naming **different** bookings, or two from the **same** table — neither of which
 * the normal lifecycle-plus-sale pair can produce.
 */
function toPaymentGroup(r: Record<string, unknown>): PaymentGroup {
    const records = (r.records as PaymentRecord[] | null) ?? [];
    const referenceCount = Number(r.reference_count ?? 0);
    const recordCount    = Number(r.record_count ?? 0);
    const sourceCount    = Number(r.source_count ?? 0);

    const anomaly: PaymentGroup['anomaly'] | undefined =
        referenceCount > 1 ? 'multiple_references'
        : recordCount > sourceCount ? 'repeated_source'
        : undefined;

    return {
        paymentIntentId:   String(r.payment_intent_id),
        product:           r.product as PaymentProduct,
        bookingReference:  (r.booking_reference as string | null) ?? null,
        supplierReference: (r.supplier_reference as string | null) ?? null,
        provider:          (r.provider as string | null) ?? null,
        customerEmail:     (r.customer_email as string | null) ?? null,
        customerName:      (r.customer_name as string | null) ?? null,
        userId:            (r.user_id as string | null) ?? null,
        amount:            (r.amount as Prisma.Decimal | null) ?? null,
        currency:          (r.currency as string | null) ?? null,
        createdAt:         r.created_at as Date,
        records,
        ...(anomaly ? { anomaly } : {}),
    };
}

/**
 * Every row that mentions one PaymentIntent, across every source.
 *
 * Returns a list, not a single row, and that is the point: two rows for one PaymentIntent means
 * the same money is recorded twice, which is exactly what an investigation is looking for.
 */
export async function findPaymentSources(paymentIntentId: string): Promise<PaymentRow[]> {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT * FROM (${unionSelect()}) p
        WHERE p.payment_intent_id = ${paymentIntentId}
        ORDER BY p.created_at ASC
    `);
    return rows.map(toPaymentRow);
}

function toPaymentRow(r: Record<string, unknown>): PaymentRow {
    return {
        paymentIntentId:   String(r.payment_intent_id),
        source:            r.source as PaymentRow['source'],
        internalId:        String(r.internal_id),
        product:           r.product as PaymentProduct,
        bookingReference:  (r.booking_reference as string | null) ?? null,
        bookingStatus:     (r.booking_status as string | null) ?? null,
        supplierReference: (r.supplier_reference as string | null) ?? null,
        provider:          (r.provider as string | null) ?? null,
        customerEmail:     (r.customer_email as string | null) ?? null,
        customerName:      (r.customer_name as string | null) ?? null,
        userId:            (r.user_id as string | null) ?? null,
        amount:            (r.amount as Prisma.Decimal | null) ?? null,
        currency:          (r.currency as string | null) ?? null,
        createdAt:         r.created_at as Date,
    };
}
