/**
 * How far a result sits from the **Search Anchor**, and whether that is worth saying.
 *
 * A search reaches well past the place it was anchored to, on purpose: a Tokyo search returns
 * Hachioji and Machida, 32–33 km out and both of them Tokyo, and the alternative is deciding
 * where a city ends by drawing a rectangle around it. Measured on 2026-11-06, a rectangle around
 * Tokyo excludes Fuchu — which is Tokyo — and includes Kawasaki, which is not.
 *
 * What was missing was never the filtering. It was that a card read "Hachioji, Tokyo" and a price,
 * and never that it was 33 km from where the traveller searched. See ADR-0051.
 */

/**
 * The distance past which a result is worth calling out, by the rung the traveller picked.
 *
 * "Far" is not one number. Three kilometres is nothing when you asked for a city and a long walk
 * when you asked for a station, so the threshold follows the scale of the thing anchored. The
 * keys are the picker's own rung names, including the sub-area words the controller recognises.
 *
 * Province, state, county, region and country are **absent on purpose**: a distance from the
 * middle of Hokkaido is noise on every card, so those searches say nothing at all.
 */
/** Haversine distance in km. The one copy — `search.ts` imports it from here. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R  = 6371;
    const dL = ((lat2 - lat1) * Math.PI) / 180;
    const dG = ((lng2 - lng1) * Math.PI) / 180;
    const a  = Math.sin(dL / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dG / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const FAR_KM: Readonly<Record<string, number>> = {
    poi: 1, address: 1, landmark: 1, specific: 1,
    district: 5, neighborhood: 5, neighbourhood: 5, locality: 5,
    city: 15,
};

/** The threshold for a rung, or null where there is no anchor worth measuring from. */
export function farThresholdKm(rung?: string | null): number | null {
    return rung ? FAR_KM[rung.toLowerCase()] ?? null : null;
}

/**
 * The rung a distance should be judged against.
 *
 * `rung` is downgraded to 'city' for a sub-area search, because OTV serves only the City rung
 * (ADR-0006), and `areaRung` keeps what the traveller actually chose. Judging a Shibuya search by
 * the city threshold would silence it, so the picked rung wins wherever it survived.
 */
export function anchorRung(p: { rung?: string | null; areaRung?: string | null }): string | null {
    return p.areaRung ?? p.rung ?? null;
}

/**
 * The distance to put on a card, or null to say nothing.
 *
 * Null is the common case and has to read as "this one is central", not as a missing field —
 * which is why the rule is per rung rather than a flat number that would fire on a quarter of
 * Tokyo and never once on Seoul for no reason a reader could see.
 */
export function distanceToShow(km: number | null | undefined, rung?: string | null): number | null {
    const threshold = farThresholdKm(rung);
    if (threshold == null || km == null || !Number.isFinite(km) || km <= threshold) return null;
    // One decimal below 10 km, whole kilometres above: "2.4 km from Shibuya", "33 km from Tokyo".
    return km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
}

/**
 * Stamp `distanceKm` onto hotels that did not come from the instant catalog.
 *
 * The catalog measures its own rows as it culls them, but the supplier answers with hotels the
 * catalog never held, and those reach the map as cards like any other. Measured in one place so
 * a card's distance cannot depend on which phase of the search produced it — a badge present on
 * some cards and absent on others for no reason the reader can see is the failure this whole
 * change exists to avoid.
 */
export function attachDistance<T extends { lat?: unknown; lng?: unknown }>(
    hotels: T[],
    anchor: { lat?: number; lng?: number; rung?: string | null; areaRung?: string | null },
): T[] {
    if (!anchor.lat || !anchor.lng) return hotels;
    const rung = anchorRung(anchor);
    if (farThresholdKm(rung) == null) return hotels;

    return hotels.map((h) => {
        const lat = Number(h.lat), lng = Number(h.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng)) return h;
        return { ...h, distanceKm: distanceToShow(haversineKm(anchor.lat!, anchor.lng!, lat, lng), rung) };
    });
}
