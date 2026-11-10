import {
    listPayments, findPaymentSources,
    type PaymentListFilters, type PaymentProduct, type PaymentRow, type PaymentGroup,
} from '@/repositories/payments.repository';

/**
 * The back office's payment search — the rules about what support is shown, as against the
 * repository's job of fetching it. See ADR-0003 for why this reads rather than owns a table.
 */

/** Hard ceiling on a page, whatever the caller asks for. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

export interface PaymentListQuery extends PaymentListFilters {
    limit?: number;
    page?: number;
}

/** One of the records behind a payment, named so the reader can see where a status came from. */
export interface PaymentRecordItem {
    source: PaymentRow['source'];
    internalId: string;
    bookingReference: string | null;
    bookingStatus: string | null;
}

/**
 * What a row looks like on the wire: money as a string, so no total is ever a float.
 *
 * **One row is one PaymentIntent**, which is the grain CONTEXT.md names. It used to be one row
 * per internal record, so every healthy hotel booking appeared twice and carried a duplicate
 * warning — two tables hold a hotel booking on purpose, the attempt and the sale it became. A
 * warning that fires on every correct row is one nobody reads, which is the failure ADR-0003
 * exists to prevent rather than to cause.
 */
export interface PaymentListItem {
    paymentIntentId: string;
    product: PaymentProduct;
    bookingReference: string | null;
    supplierReference: string | null;
    provider: string | null;
    customerEmail: string | null;
    customerName: string | null;
    amount: string | null;
    currency: string | null;
    createdAt: string;
    /** Every record behind this payment, oldest first. Normally one or two. */
    records: PaymentRecordItem[];
    /**
     * A disagreement the normal lifecycle-plus-sale pair cannot produce: two different booking
     * references on one payment, or two records from the same table. Absent on a healthy row.
     */
    anomaly?: 'multiple_references' | 'repeated_source';
}

function toItem(g: PaymentGroup): PaymentListItem {
    return {
        paymentIntentId:   g.paymentIntentId,
        product:           g.product,
        bookingReference:  g.bookingReference,
        supplierReference: g.supplierReference,
        provider:          g.provider,
        customerEmail:     g.customerEmail,
        customerName:      g.customerName,
        // Decimal to string, never to number. A money value that has been through a JS float is
        // no longer evidence of anything.
        amount:            g.amount === null ? null : g.amount.toString(),
        currency:          g.currency,
        createdAt:         g.createdAt.toISOString(),
        records:           g.records.map(r => ({
            source:           r.source,
            internalId:       r.internalId,
            bookingReference: r.bookingReference,
            bookingStatus:    r.bookingStatus,
        })),
        ...(g.anomaly ? { anomaly: g.anomaly } : {}),
    };
}

/** A single record, for the detail panel, which still shows them one by one. */
function toRecordItem(r: PaymentRow): PaymentRecordItem & {
    paymentIntentId: string; product: PaymentProduct; supplierReference: string | null;
    provider: string | null; customerEmail: string | null; customerName: string | null;
    amount: string | null; currency: string | null; createdAt: string;
} {
    return {
        paymentIntentId:   r.paymentIntentId,
        source:            r.source,
        internalId:        r.internalId,
        product:           r.product,
        bookingReference:  r.bookingReference,
        bookingStatus:     r.bookingStatus,
        supplierReference: r.supplierReference,
        provider:          r.provider,
        customerEmail:     r.customerEmail,
        customerName:      r.customerName,
        amount:            r.amount === null ? null : r.amount.toString(),
        currency:          r.currency,
        createdAt:         r.createdAt.toISOString(),
    };
}

export class AdminPaymentsService {
    /**
     * A page of payments for the back office table, one row per PaymentIntent.
     *
     * Grouped in the database rather than here, so a page of 25 is 25 payments and the total
     * counts payments. The records behind each one travel with it, so nothing is hidden by the
     * grouping: a reader sees that a stay is held in two tables, and sees it as detail rather
     * than as a warning.
     */
    async list(q: PaymentListQuery): Promise<{ items: PaymentListItem[]; total: number; page: number; limit: number }> {
        const limit = Math.min(Math.max(q.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
        const page  = Math.max(q.page ?? 1, 1);

        const { rows, total } = await listPayments(q, { limit, offset: (page - 1) * limit });

        return { items: rows.map(toItem), total, page, limit };
    }

    /**
     * Everything the database knows about one PaymentIntent.
     *
     * Deliberately only the database. Stripe is the authority on the money and is read separately,
     * so that a Stripe outage degrades the page rather than emptying it, and so a reader can see
     * plainly which half of the picture is missing.
     */
    async sources(paymentIntentId: string) {
        const rows = await findPaymentSources(paymentIntentId);
        return { paymentIntentId, sources: rows.map(toRecordItem) };
    }
}

export const adminPaymentsService = new AdminPaymentsService();
