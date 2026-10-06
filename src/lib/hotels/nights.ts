/**
 * Nights between two ISO dates, never less than one.
 *
 * Shared by the search stream and the property endpoint because both divide the supplier's
 * price by it, and the two disagreeing would price the same room differently depending on which
 * screen you came from.
 *
 * A same-day or missing pair gives one rather than zero: dividing by zero would send Infinity to
 * a card, and a stay with no dates is quoted as though it were a single night — which is what
 * the supplier priced.
 */
export function nightsBetween(checkin?: string, checkout?: string): number {
    if (!checkin || !checkout) return 1;

    const from = Date.parse(checkin);
    const to   = Date.parse(checkout);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return 1;

    return Math.max(1, Math.round((to - from) / 86_400_000));
}
