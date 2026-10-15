/**
 * The whole-stay price of a listing, alongside the nightly rate it advertises.
 *
 * A search card says "per night", so `price` is the Nightly Rate; a checkout bills the stay.
 * Both have always been derivable and neither was stated — the browser multiplied the card
 * back up by the nights, which is how a stay total ended up billed nights-times-over once
 * before (see `getProperty`). ADR-0020 says api-v2 emits both. This is the second.
 *
 * Added at the response boundary rather than inside the supplier search: that code is
 * QA-hardened and its contract is "a listing carries the Nightly Rate", which stays true.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Prefers the supplier's own total over `price × nights`, since multiplying a rounded nightly
 * rate back up loses cents the supplier actually quoted. It is only trusted when it agrees
 * with the card to within a percent: the listing is priced from its cheapest option, and a
 * first rate that is not that option would otherwise put a different room's price on the card.
 */
export function stayTotalOf(
    listing: { price?: number; roomTypes?: Array<{ gross?: number }> },
    nights: number,
): number | undefined {
    const price = listing.price;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return undefined;

    const n = nights >= 1 ? nights : 1;
    const derived = round2(price * n);

    const quoted = listing.roomTypes?.[0]?.gross;
    if (typeof quoted === 'number' && quoted > 0 && Math.abs(quoted - derived) <= derived * 0.01) {
        return round2(quoted);
    }
    return derived;
}

export function attachStayTotals<T extends { price?: number; roomTypes?: Array<{ gross?: number }> }>(
    listings: readonly T[],
    nights: number,
): Array<T & { stayTotal?: number; nights: number }> {
    const n = nights >= 1 ? nights : 1;
    return listings.map((l) => {
        const stayTotal = stayTotalOf(l, n);
        return stayTotal === undefined ? { ...l, nights: n } : { ...l, stayTotal, nights: n };
    });
}
