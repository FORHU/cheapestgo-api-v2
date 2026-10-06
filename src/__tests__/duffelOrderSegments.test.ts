import { describe, it, expect } from 'vitest';
import { segmentsFromDuffelOrder, withBookedItinerary } from '@/lib/flights/duffelOrderSegments';

const order = {
    id: 'ord_1',
    slices: [
        {
            segments: [{
                marketing_carrier: { iata_code: 'BR', name: 'EVA Air' },
                operating_carrier: { iata_code: 'B7', name: 'Uni Air' },
                marketing_carrier_flight_number: '271',
                origin: { iata_code: 'CRK' },
                destination: { iata_code: 'TPE' },
                origin_terminal: '1',
                destination_terminal: '2',
                departing_at: '2026-09-14T06:05:00',
                arriving_at: '2026-09-14T08:30:00',
                passengers: [{ cabin_class: 'business' }],
            }],
        },
        {
            segments: [{
                marketing_carrier: { iata_code: 'BR', name: 'EVA Air' },
                marketing_carrier_flight_number: '272',
                origin: { iata_code: 'TPE' },
                destination: { iata_code: 'CRK' },
                departing_at: '2026-09-20T10:00:00',
                arriving_at: '2026-09-20T12:15:00',
                passengers: [{ cabin_class: 'business' }],
            }],
        },
    ],
};

describe('segmentsFromDuffelOrder', () => {
    it('numbers segments by slice so outbound and return stay distinguishable', () => {
        expect(segmentsFromDuffelOrder(order).map(s => s.segmentIndex)).toEqual([0, 1]);
    });

    it('builds the flight number from the marketing carrier, as the traveller sees it', () => {
        expect(segmentsFromDuffelOrder(order)[0].flightNumber).toBe('BR271');
    });

    it('reports the operating carrier as the airline actually flown', () => {
        const [outbound, ret] = segmentsFromDuffelOrder(order);
        expect(outbound.airline).toBe('B7');
        // Falls back to marketing when the order names no operating carrier.
        expect(ret.airline).toBe('BR');
    });

    it('reads cabin off the per-passenger fare details', () => {
        expect(segmentsFromDuffelOrder(order)[0].cabinClass).toBe('business');
    });

    it('carries departure and arrival instants through unchanged', () => {
        const [outbound] = segmentsFromDuffelOrder(order);
        expect(outbound.departureTime).toBe('2026-09-14T06:05:00');
        expect(outbound.arrivalTime).toBe('2026-09-14T08:30:00');
    });

    it('returns nothing for an order with no readable slices', () => {
        expect(segmentsFromDuffelOrder({})).toEqual([]);
        expect(segmentsFromDuffelOrder(null)).toEqual([]);
    });

    it('defaults cabin rather than emitting undefined into the column', () => {
        const bare = { slices: [{ segments: [{ origin: {}, destination: {} }] }] };
        expect(segmentsFromDuffelOrder(bare)[0].cabinClass).toBe('economy');
    });

    it('carries the origin/destination terminal through when Duffel reports one', () => {
        const [outbound, ret] = segmentsFromDuffelOrder(order);
        expect(outbound.originTerminal).toBe('1');
        expect(outbound.destinationTerminal).toBe('2');
        // Second slice's segment has no terminal fields — falls back to null, not undefined.
        expect(ret.originTerminal).toBeNull();
        expect(ret.destinationTerminal).toBeNull();
    });
});

describe('withBookedItinerary', () => {
    it('replaces the selected legs with the ticketed ones, keeping everything else', () => {
        const flight = { tripType: 'round-trip', traceId: 'x', segments: [{ flightNumber: 'BR999' }] };
        const merged = withBookedItinerary(flight, order);

        expect(merged.tripType).toBe('round-trip');
        expect(merged.traceId).toBe('x');
        expect(merged.segments.map((s: any) => s.flightNumber)).toEqual(['BR271', 'BR272']);
    });

    it('leaves the payload alone when the order yields no segments', () => {
        // Better a stale itinerary than a blank one.
        const flight = { segments: [{ flightNumber: 'BR271' }] };
        expect(withBookedItinerary(flight, {})).toBe(flight);
    });
});
