/**
 * What a Duffel order says about tickets and seats.
 *
 * The e-ticket number lives on `documents[].unique_identifier`. Two places read
 * `document_number`, which Duffel does not send: `.map()` over it yields `[undefined]`, so
 * the check for "no tickets yet" passed on a length of one and the booking was marked
 * ticketed with `[null]` recorded against it. A ticket number nobody can read is the one
 * thing a ticketed booking has to carry — it is what an airline asks for at the desk.
 */

/** Every e-ticket number on the order, in order, with unreadable entries dropped. */
export function ticketNumbersFrom(order: any): string[] {
    return (order?.documents ?? [])
        .filter((d: any) => d?.type === 'electronic_ticket')
        // `document_number` is read as a fallback only so a future schema change cannot
        // silently empty this again.
        .map((d: any) => d?.unique_identifier ?? d?.document_number)
        .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0);
}

/**
 * Duffel passenger id → the seats the airline assigned, joined for a multi-leg trip
 * ("14A" one-way, "14A / 22C" where both legs were assigned up front).
 *
 * Usually empty: most low-cost carriers assign seats at check-in rather than at booking.
 */
export function buildSeatMap(order: any): Map<string, string> {
    const map = new Map<string, string>();
    for (const slice of order?.slices ?? []) {
        for (const seg of slice?.segments ?? []) {
            for (const pax of seg?.passengers ?? []) {
                const designator: string | undefined = pax?.seat?.designator;
                if (designator && pax.passenger_id) {
                    const prev = map.get(pax.passenger_id);
                    map.set(pax.passenger_id, prev ? `${prev} / ${designator}` : designator);
                }
            }
        }
    }
    return map;
}
