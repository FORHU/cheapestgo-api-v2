/**
 * Recover the order a timed-out `POST /air/orders` may already have created.
 *
 * Aborting an order-creation request does not cancel it. Duffel completes the
 * booking with the airline regardless, so a client-side timeout leaves a real,
 * paid, ticketed PNR that this app never hears about — the traveller is told
 * the booking failed, the balance is debited, and nothing links the two.
 *
 * Duffel's own guidance for "did it actually get created?" is to check the
 * listing API (their `Idempotency-Key` header is undocumented and cannot be
 * relied on to replay the original response). This module does exactly that:
 * lists recent orders and looks for one that matches the attempt we just lost.
 *
 * Matching has to be conservative in one direction only. A false negative
 * leaves an orphan to clean up manually — bad, but the status quo. A false
 * positive attaches a traveller to *someone else's* ticket, so every criterion
 * below must agree before an order is claimed.
 */

const DUFFEL_ORDERS_URL = 'https://api.duffel.com/air/orders';

export interface ReconcileCriteria {
    /** ISO timestamp taken immediately before the order request was sent. */
    sinceIso: string;
    /** First slice origin IATA, e.g. "CRK". */
    origin: string;
    /** Last slice destination IATA, e.g. "NRT". */
    destination: string;
    /** Order total as a fixed-2 string, e.g. "929.00". */
    totalAmount: string;
    /** Order currency, e.g. "USD". */
    currency: string;
    /** Lead passenger family name, as sent to Duffel. */
    familyName?: string;
}

export interface ReconciledOrder {
    orderId: string;
    pnr: string;
    tickets: string[];
    isTicketed: boolean;
    orderTotal: string;
    orderCurrency: string;
}

/** Numeric compare so "929.0" and "929.00" agree. */
function sameAmount(a: unknown, b: unknown): boolean {
    const x = Number(a);
    const y = Number(b);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.005;
}

function norm(s: unknown): string {
    return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

/**
 * Does this Duffel order correspond to the attempt described by `criteria`?
 *
 * Exported for tests — every clause here is a guard against claiming an order
 * that belongs to a different booking.
 */
export function orderMatches(order: any, criteria: ReconcileCriteria): boolean {
    if (!order?.id) return false;

    // Never claim something already cancelled — it cannot be the live result of
    // the attempt we are reconciling.
    if (order.cancelled_at) return false;

    // Created at or after we sent the request. Guards against attaching to an
    // older order for the same route and price (a genuine repeat customer).
    const created = Date.parse(order.created_at ?? '');
    const since = Date.parse(criteria.sinceIso);
    if (!Number.isFinite(created) || !Number.isFinite(since)) return false;
    // 1s of slack: Duffel stamps created_at server-side and clocks differ.
    if (created < since - 1000) return false;

    if (!sameAmount(order.total_amount, criteria.totalAmount)) return false;
    if (norm(order.total_currency) !== norm(criteria.currency)) return false;

    const slices = Array.isArray(order.slices) ? order.slices : [];
    if (slices.length === 0) return false;
    const first = slices[0];
    const last = slices[slices.length - 1];
    if (norm(first?.origin?.iata_code) !== norm(criteria.origin)) return false;
    if (norm(last?.destination?.iata_code) !== norm(criteria.destination)) return false;

    // Family name is the strongest identity signal available on an order, so
    // require it whenever we were given one.
    if (criteria.familyName) {
        const names = (Array.isArray(order.passengers) ? order.passengers : [])
            .map((p: any) => norm(p?.family_name));
        if (!names.includes(norm(criteria.familyName))) return false;
    }

    return true;
}

/** Shape a matched Duffel order into the pre-order record the book route stores. */
export function toReconciledOrder(order: any): ReconciledOrder {
    const tickets: string[] = [];
    for (const doc of order?.documents ?? []) {
        if (doc?.unique_identifier) tickets.push(doc.unique_identifier);
    }
    return {
        orderId: order.id,
        pnr: order.booking_reference ?? '',
        tickets,
        isTicketed: tickets.length > 0,
        orderTotal: order.total_amount ?? '',
        orderCurrency: order.total_currency ?? '',
    };
}

/**
 * Look for the order a timed-out attempt may have created.
 *
 * Resolves to the **raw** Duffel order so the caller can feed it through the
 * same path a normal 201 takes, or null when nothing matches — in which case
 * the caller should report the failure it was going to report anyway.
 *
 * Never throws: reconciliation runs on an error path and must not replace one
 * failure with a different one.
 */
export async function findOrderFromTimedOutAttempt(
    token: string,
    criteria: ReconcileCriteria,
    fetchImpl: typeof fetch = fetch,
): Promise<any | null> {
    try {
        const res = await fetchImpl(`${DUFFEL_ORDERS_URL}?limit=50`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Duffel-Version': 'v2',
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
            console.error(`[reconcile] Duffel order list failed: ${res.status}`);
            return null;
        }
        const body = await res.json() as { data?: any[] };
        const orders: any[] = body?.data ?? [];
        const match = orders.find(o => orderMatches(o, criteria));
        if (!match) return null;

        console.warn(
            `[reconcile] Recovered order ${match.id} (${match.booking_reference}) ` +
            `from a timed-out attempt — ${match.total_amount} ${match.total_currency}`,
        );
        return match;
    } catch (err: any) {
        console.error('[reconcile] Lookup failed:', err?.message ?? err);
        return null;
    }
}
