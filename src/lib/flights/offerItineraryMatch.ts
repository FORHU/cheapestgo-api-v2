/**
 * Is a refreshed Duffel offer the SAME journey the traveller chose?
 *
 * When the selected offer expires, `/api/flights/book` rebuilds an
 * `offer_request` and books from the results. That request carries only
 * origin, destination, departure DATE and cabin — every flight that airline
 * operates on that route that day comes back, and the pool was then filtered by
 * validating carrier and sorted by how close the price was.
 *
 * Price proximity is not identity. A 06:00 departure and a 22:00 departure on
 * the same carrier for the same money are indistinguishable to that sort, so a
 * traveller could be ticketed onto a flight sixteen hours from the one they
 * picked, without ever being asked. Nothing downstream would notice either:
 * `flight_segments` is written from the originally selected itinerary.
 *
 * So identity is checked here, on the things that actually name a flight —
 * marketing carrier, flight number, and departure instant, segment by segment.
 */

/** Duffel timestamps are ISO-8601; compare as instants, not as strings. */
function sameInstant(a: unknown, b: unknown, toleranceMs: number): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const x = Date.parse(a);
    const y = Date.parse(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return Math.abs(x - y) <= toleranceMs;
}

function norm(s: unknown): string {
    return typeof s === 'string' ? s.trim().toUpperCase() : '';
}

/** Flatten an offer's slices into a flat segment list, in travel order. */
function segmentsOf(offer: any): any[] {
    const slices: any[] = Array.isArray(offer?.slices) ? offer.slices : [];
    return slices.flatMap((sl: any) => (Array.isArray(sl?.segments) ? sl.segments : []));
}

/**
 * The identity of one segment: who markets it, which flight number, when it goes.
 * `operating_carrier` is deliberately not used — codeshares legitimately vary it
 * between two sells of the same physical flight.
 */
function segmentKeyMatches(a: any, b: any, toleranceMs: number): boolean {
    const carrierA = norm(a?.marketing_carrier?.iata_code);
    const carrierB = norm(b?.marketing_carrier?.iata_code);
    if (!carrierA || carrierA !== carrierB) return false;

    const flightA = norm(a?.marketing_carrier_flight_number);
    const flightB = norm(b?.marketing_carrier_flight_number);
    if (!flightA || flightA !== flightB) return false;

    if (norm(a?.origin?.iata_code) !== norm(b?.origin?.iata_code)) return false;
    if (norm(a?.destination?.iata_code) !== norm(b?.destination?.iata_code)) return false;

    return sameInstant(a?.departing_at, b?.departing_at, toleranceMs);
}

/**
 * True only when `candidate` is the same journey as `original`.
 *
 * Deliberately strict, and asymmetric in its failure mode: rejecting a genuine
 * match costs the traveller a "search again", while accepting a near-match
 * tickets them onto the wrong aeroplane.
 *
 * @param toleranceMs slack on departure time, for airlines that retime a flight
 *        by a minute or two between two sells of it. Default 0 — exact.
 */
export function isSameItinerary(original: any, candidate: any, toleranceMs = 0): boolean {
    const a = segmentsOf(original);
    const b = segmentsOf(candidate);

    if (a.length === 0 || a.length !== b.length) return false;

    // Slice shape has to agree too, or a one-way could match half a round trip.
    const slicesA: any[] = Array.isArray(original?.slices) ? original.slices : [];
    const slicesB: any[] = Array.isArray(candidate?.slices) ? candidate.slices : [];
    if (slicesA.length !== slicesB.length) return false;
    for (let i = 0; i < slicesA.length; i++) {
        const segsA = Array.isArray(slicesA[i]?.segments) ? slicesA[i].segments.length : -1;
        const segsB = Array.isArray(slicesB[i]?.segments) ? slicesB[i].segments.length : -2;
        if (segsA !== segsB) return false;
    }

    for (let i = 0; i < a.length; i++) {
        if (!segmentKeyMatches(a[i], b[i], toleranceMs)) return false;
    }
    return true;
}

/**
 * Narrow a refresh pool to offers that are the same journey, cheapest first.
 *
 * Returns an empty array when nothing matches — the caller must then report the
 * flight as unavailable rather than substituting a different one.
 */
export function sameItineraryOffers(original: any, pool: any[], toleranceMs = 0): any[] {
    return (pool ?? [])
        .filter(o => isSameItinerary(original, o, toleranceMs))
        .sort((x, y) => parseFloat(x?.total_amount ?? '0') - parseFloat(y?.total_amount ?? '0'));
}
