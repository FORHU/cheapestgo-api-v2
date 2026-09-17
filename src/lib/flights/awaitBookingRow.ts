/**
 * Wait for the flight_booking row another path is in the middle of writing.
 *
 * `/api/internal/create-booking` locks its session with a conditional UPDATE. Whoever loses
 * that race is answered with "session not found or already processed" — which reads like a
 * failure but means "someone else is doing it right now".
 *
 * Two callers race by design: the Stripe webhook, and the `/confirm` fallback the client
 * fires after payment. Treating the loser's answer as a real failure is how `/confirm` came
 * to tell a traveller their card had not been charged while the ticket was being issued
 * against it — the worst sentence in the flow, because the traveller then books again.
 *
 * The window is a handful of database round trips, so a short bounded poll closes it. Kept
 * free of Prisma so the reader is injected and the rule can be tested without a database.
 */

export interface AwaitedBooking {
    id: string;
    pnr: string | null;
    status: string | null;
    payment_intent_id?: string | null;
}

export interface AwaitBookingOptions {
    /** Total polls, including the first. */
    attempts?: number;
    /** Delay between polls. */
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Poll for this session's booking until a row appears or the attempts run out.
 *
 * Returns null when nothing was written — only then is the failure real.
 *
 * @param read  Looks the row up; returning null means "not yet". A throw is treated as
 *              "not yet" too, since a transient database error is not evidence of anything.
 */
export async function awaitBookingRow(
    read: (sessionId: string) => Promise<AwaitedBooking | null>,
    sessionId: string,
    opts: AwaitBookingOptions = {},
): Promise<AwaitedBooking | null> {
    const attempts = opts.attempts ?? 6;
    const delayMs = opts.delayMs ?? 750;
    const sleep = opts.sleep ?? defaultSleep;

    for (let i = 0; i < attempts; i++) {
        try {
            const row = await read(sessionId);
            // A row with a PNR is done. A row still without one is a failure the other path
            // recorded deliberately — return it either way and let the caller read `status`.
            if (row?.id) return row;
        } catch (err: any) {
            console.warn(`[await-booking-row] lookup failed (attempt ${i + 1}):`, err?.message ?? err);
        }

        if (i < attempts - 1) await sleep(delayMs);
    }

    return null;
}
