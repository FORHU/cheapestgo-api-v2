/**
 * Reuse the ticket a previous attempt already bought, instead of buying another.
 *
 * `/api/flights/book` issues a real, paid Duffel order at Step 1.5 — before the
 * traveller has entered a card. The payment screen then offers "Back to details",
 * and re-submitting from there calls `/book` again, which opens a fresh booking
 * session and buys a **second** ticket for the same trip. That is how one CRK→NRT
 * attempt became two paid EVA tickets 61 seconds apart: the same fare, once
 * quoted in USD and once in PHP after a currency change.
 *
 * Matching is on the Duffel offer id, which is the tightest key available. The
 * offer is carried in `sessionStorage` across the back-and-forth, so a genuine
 * re-submit of the same trip presents the same offer id, while a new search
 * produces a different one and is correctly treated as a new booking.
 */

/** Statuses where the session's pre-order is still unpaid and therefore reusable. */
const REUSABLE_STATUSES = new Set(['initiated', 'payment_initiated', 'payment_authorized']);

/** Sessions live 30 minutes; never reuse a pre-order past that. */
export const REUSE_WINDOW_MS = 30 * 60 * 1000;

export interface CandidateSession {
    id: string;
    status: string;
    duffel_pre_order_id: string | null;
    duffel_pre_order_pnr?: string | null;
    duffel_pre_order_tickets?: string[] | null;
    duffel_pre_order_ticketed?: boolean | null;
    payment_intent_id?: string | null;
    flight?: any;
    created_at: string | Date;
}

export interface ReuseOptions {
    /** Duffel offer id of the booking being attempted now. */
    offerId: string;
    /** The session just created for this attempt — never match against itself. */
    excludeSessionId: string;
    now?: Date;
    maxAgeMs?: number;
}

/**
 * The Duffel offer id a stored session was created from, if it kept one.
 *
 * api-v2 strips the raw offer before storing a session's flight, so it records the id on its
 * own as `_offerId`; v1 kept the whole raw offer. Both are read, so a session written by either
 * can be matched.
 */
export function sessionOfferId(session: CandidateSession): string | null {
    const id = session?.flight?._offerId ?? session?.flight?._rawOffer?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Pick the most recent session holding a still-unpaid pre-order for this offer.
 *
 * Returns null when there is nothing safe to reuse — the caller then creates an
 * order as normal. Being wrong in that direction costs an extra ticket only in
 * the case we already had; being wrong the other way would attach a traveller to
 * an order for a different trip, so every clause here has to agree.
 */
export function findReusablePreOrder(
    sessions: CandidateSession[],
    opts: ReuseOptions,
): CandidateSession | null {
    const now = opts.now ?? new Date();
    const maxAge = opts.maxAgeMs ?? REUSE_WINDOW_MS;
    if (!opts.offerId) return null;

    const usable = (sessions ?? []).filter(s => {
        if (!s || s.id === opts.excludeSessionId) return false;
        if (!s.duffel_pre_order_id) return false;
        if (!REUSABLE_STATUSES.has(s.status)) return false;
        if (sessionOfferId(s) !== opts.offerId) return false;

        const created = new Date(s.created_at).getTime();
        if (!Number.isFinite(created)) return false;
        const age = now.getTime() - created;
        // Future-dated rows mean clock skew, not a valid candidate.
        if (age < 0 || age > maxAge) return false;

        return true;
    });

    if (usable.length === 0) return null;

    // Most recent wins: if several attempts somehow bought tickets, the newest
    // pre-order is the one whose price and services match this attempt.
    usable.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return usable[0];
}

// ─── Identity gates ───────────────────────────────────────────────────────────

/** Compare names/dates the way an airline does: case- and padding-insensitive. */
function normName(s: unknown): string {
    return typeof s === 'string' ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

/**
 * The passenger a Duffel order was actually bought for, as submitted now.
 *
 * Matching on the offer id alone is not enough to adopt an order. The payment
 * screen's "Back to details" exists so a traveller can FIX a misspelled name or
 * a wrong date of birth, and re-submitting presents the very same offer id. A
 * reuse that ignores those edits tickets the uncorrected name and records the
 * corrected one — the traveller then discovers at check-in that their ticket
 * does not match their passport, and the correction costs a reissue.
 *
 * Order-of-passengers is significant: Duffel maps each passenger to a specific
 * offer passenger id, so passenger 1 on the order is passenger 1 here.
 */
export function samePassengerIdentity(
    orderPassengers: Array<{ given_name?: string | null; family_name?: string | null; born_on?: string | null }> | null | undefined,
    submitted: Array<{ firstName?: string; lastName?: string; birthDate?: string }> | null | undefined,
): boolean {
    const a = orderPassengers ?? [];
    const b = submitted ?? [];
    if (a.length === 0 || a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        if (normName(a[i]?.given_name) !== normName(b[i]?.firstName)) return false;
        if (normName(a[i]?.family_name) !== normName(b[i]?.lastName)) return false;
        // born_on and birthDate are both YYYY-MM-DD.
        if (normName(a[i]?.born_on) !== normName(b[i]?.birthDate)) return false;
    }
    return true;
}

/**
 * Does the stored order cost what this attempt would cost?
 *
 * Stands in for comparing ancillaries directly: an order's service ids are its
 * own, not the offer service ids the client selects from, so they cannot be
 * compared. The total can. Adding or dropping a bag or a seat moves it, and a
 * reuse would otherwise charge the old total and deliver the old ancillaries.
 */
export function sameOrderTotal(orderTotal: unknown, expectedTotal: unknown): boolean {
    const x = Number(orderTotal);
    const y = Number(expectedTotal);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.005;
}
