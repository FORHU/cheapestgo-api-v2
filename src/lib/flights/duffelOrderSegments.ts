/**
 * The itinerary a Duffel order actually holds, in the shape create-booking stores.
 *
 * `flight_segments` used to be written from `booking_sessions.flight` — the
 * payload the browser posted. That is the itinerary the traveller *selected*,
 * which is not necessarily the one that got ticketed: the expired-offer refresh
 * path books from a freshly fetched offer, and the payload is client-supplied in
 * the first place. Any drift showed up as a confirmation email and a trips page
 * describing a flight the PNR is not for.
 *
 * The order is the authority. This maps it into the normalised segment shape so
 * what we store is what the airline is holding.
 */

export interface StoredSegment {
    segmentIndex: number;
    airline: string;
    airlineName: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: string | null;
    arrivalTime: string | null;
    cabinClass: string;
    originTerminal: string | null;
    destinationTerminal: string | null;
}

/**
 * Cabin lives on the order's per-passenger fare details, not on the segment
 * itself. Take the first passenger's — the whole booking shares a cabin here.
 */
function cabinFor(seg: any): string {
    const paxList: any[] = Array.isArray(seg?.passengers) ? seg.passengers : [];
    return paxList[0]?.cabin_class ?? 'economy';
}

export function segmentsFromDuffelOrder(order: any): StoredSegment[] {
    const slices: any[] = Array.isArray(order?.slices) ? order.slices : [];
    const out: StoredSegment[] = [];

    slices.forEach((slice: any, sliceIdx: number) => {
        const segments: any[] = Array.isArray(slice?.segments) ? slice.segments : [];
        for (const seg of segments) {
            const marketing = seg?.marketing_carrier ?? {};
            const operating = seg?.operating_carrier ?? {};
            const carrierCode: string = marketing.iata_code ?? operating.iata_code ?? '';
            const flightNo: string = seg?.marketing_carrier_flight_number ?? '';

            out.push({
                segmentIndex: sliceIdx,
                // Operating carrier is who the traveller actually flies with, which is
                // what the rest of the app displays; marketing is the fallback.
                airline: operating.iata_code ?? carrierCode,
                airlineName: operating.name ?? marketing.name ?? '',
                flightNumber: carrierCode && flightNo ? `${carrierCode}${flightNo}` : flightNo,
                origin: seg?.origin?.iata_code ?? '',
                destination: seg?.destination?.iata_code ?? '',
                departureTime: seg?.departing_at ?? null,
                arrivalTime: seg?.arriving_at ?? null,
                cabinClass: cabinFor(seg),
                originTerminal: seg?.origin_terminal ?? null,
                destinationTerminal: seg?.destination_terminal ?? null,
            });
        }
    });

    return out;
}

/**
 * Merge the order's true itinerary over the stored flight payload.
 *
 * Everything else on the payload (trip type, fare basis hints, provider ids) is
 * left as it was — only the legs are corrected, and only when the order actually
 * yielded some. An order with no readable slices leaves the payload untouched
 * rather than blanking a booking's itinerary.
 */
export function withBookedItinerary(flight: any, order: any): any {
    const segments = segmentsFromDuffelOrder(order);
    if (segments.length === 0) return flight;
    return { ...(flight ?? {}), segments };
}
