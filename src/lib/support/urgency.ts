/**
 * How close a Support Chat's customer is to travelling.
 *
 * The Waiting queue was once strictly first-come-first-served, which is the fair rule when
 * nothing distinguishes the people in it. In travel something does: a customer at an airport
 * whose flight leaves in three hours and a customer asking how refunds work are not
 * interchangeable, and answering them in the order they happened to write is only defensible
 * if you cannot tell them apart. Since ADR-0032 every Support Chat has an account behind it and
 * a linked booking carries the dates, so we can. See ADR-0039.
 *
 * Nothing here is stored. Urgency is computed in the query every time the queue is read,
 * because a booking three weeks out when the chat opened is three days out a fortnight later;
 * a column would be wrong by then unless something walked the table to refresh it. The only
 * thing written down is an Agent overruling the computation.
 */

/**
 * Ordered least to most urgent. The numbers are the sort key and are deliberately spaced so a
 * tier can be inserted between two of them without renumbering the rest.
 */
export const URGENCY_RANK = {
    low:      10,
    normal:   20,
    high:     30,
    critical: 40,
} as const;

export type Urgency = keyof typeof URGENCY_RANK;

/** What an Agent may set. Identical to the computed tiers — an override is a tier, not a flag. */
export const AGENT_PRIORITIES: readonly Urgency[] = ['low', 'normal', 'high', 'critical'];

export function isUrgency(value: unknown): value is Urgency {
    return typeof value === 'string' && value in URGENCY_RANK;
}

/**
 * Turn the rank the queue sorted by back into a tier the screen can label.
 *
 * The query returns a number because that is what ORDER BY needs; a person reading the inbox
 * needs the word. An unknown rank falls to `normal` rather than throwing — a row that cannot be
 * labelled should still be answerable.
 */
export function urgencyFromRank(rank: number | string | null | undefined): Urgency {
    const n = typeof rank === 'string' ? Number(rank) : rank;
    if (n == null || Number.isNaN(n)) return 'normal';
    const hit = (Object.entries(URGENCY_RANK) as [Urgency, number][]).find(([, v]) => v === n);
    return hit ? hit[0] : 'normal';
}

/**
 * Hours from now within which a trip counts as each tier.
 *
 * `critical` is 24 hours rather than something tighter because the customer who cannot wait is
 * usually the one already travelling or about to leave for the airport, and a chat opened at
 * midnight for a morning flight must not be answered after it.
 */
export const CRITICAL_WITHIN_HOURS = 24;
export const HIGH_WITHIN_HOURS = 24 * 7;

/**
 * The tier for a single trip, given when it starts and ends.
 *
 * Being *inside* the travel window is critical — a customer in the hotel tonight has the least
 * room to be told to wait — and so is being about to enter it.
 *
 * A trip already over is `normal`, not `low`: a refund or a complaint about a trip that went
 * wrong is ordinary support, and demoting it below a general question would say the opposite of
 * what we mean.
 */
export function urgencyOfTrip(
    startsAt: Date | null,
    endsAt: Date | null,
    now: Date = new Date(),
): Urgency {
    if (!startsAt) return 'normal';
    const end = endsAt ?? startsAt;
    if (now >= startsAt && now <= end) return 'critical';
    if (now > end) return 'normal';

    const hoursAway = (startsAt.getTime() - now.getTime()) / 3_600_000;
    if (hoursAway <= CRITICAL_WITHIN_HOURS) return 'critical';
    if (hoursAway <= HIGH_WITHIN_HOURS) return 'high';
    return 'normal';
}

/**
 * The rank the queue orders by, as SQL.
 *
 * An Agent's override wins outright; otherwise the most urgent linked trip decides, and a chat
 * with no trip at all is `normal`. Expressed against `support_conversations c`.
 *
 * A stay and a flight are both trips with a window, so both are read through one lateral: a
 * stay's is check-in to check-out, a flight's is its first departure to its last arrival.
 */
export const URGENCY_SQL = /* sql */ `
    COALESCE(
        CASE c.priority
            WHEN 'critical' THEN ${URGENCY_RANK.critical}
            WHEN 'high'     THEN ${URGENCY_RANK.high}
            WHEN 'normal'   THEN ${URGENCY_RANK.normal}
            WHEN 'low'      THEN ${URGENCY_RANK.low}
        END,
        (
            SELECT MAX(
                CASE
                    WHEN now() BETWEEN t.starts_at AND t.ends_at                          THEN ${URGENCY_RANK.critical}
                    WHEN now() > t.ends_at                                                THEN ${URGENCY_RANK.normal}
                    WHEN t.starts_at <= now() + interval '${CRITICAL_WITHIN_HOURS} hours'  THEN ${URGENCY_RANK.critical}
                    WHEN t.starts_at <= now() + interval '${HIGH_WITHIN_HOURS} hours'      THEN ${URGENCY_RANK.high}
                    ELSE ${URGENCY_RANK.normal}
                END
            )
            FROM support_conversation_bookings scb
            JOIN LATERAL (
                SELECT b.check_in::timestamptz AS starts_at,
                       b.check_out::timestamptz AS ends_at
                  FROM bookings b
                 WHERE b.booking_reference = scb.booking_reference
                UNION ALL
                SELECT MIN(fs.departure) AS starts_at,
                       MAX(fs.arrival)   AS ends_at
                  FROM flight_bookings fb
                  JOIN flight_segments fs ON fs.booking_id = fb.id
                 WHERE fb.booking_reference = scb.booking_reference
                 HAVING MIN(fs.departure) IS NOT NULL
            ) t ON TRUE
            WHERE scb.conversation_id = c.id
        ),
        ${URGENCY_RANK.normal}
    )
`;
