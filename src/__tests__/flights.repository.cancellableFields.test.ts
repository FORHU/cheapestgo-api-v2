/**
 * What a cancellation reads of a flight booking. Its refund is the airline's refund as a share of
 * what the airline charged (`supplier_cost`, in the fare's currency) — not of `total_price`, which
 * holds what the traveller paid, in the card's currency with our fee on top. Both readers the
 * cancel paths use must load it, or every refund falls back to the paid price.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
    flight_bookings: { findUnique: vi.fn(), findFirst: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));

import { FlightsRepository } from '@/repositories/flights.repository';

let repo: FlightsRepository;

beforeEach(() => {
    vi.clearAllMocks();
    db.flight_bookings.findUnique.mockResolvedValue(null);
    db.flight_bookings.findFirst.mockResolvedValue(null);
    repo = new FlightsRepository();
});

describe('a booking as the cancel paths read it', () => {
    it('carries the airline\'s charge when read by id (the page\'s quote and cancel)', async () => {
        await repo.getFlightBookingById('bk-1');
        expect(db.flight_bookings.findUnique.mock.calls[0][0].select).toMatchObject({ supplier_cost: true, total_price: true });
    });

    it('carries the airline\'s charge when read by order (a cancellation made at Duffel)', async () => {
        await repo.getFlightBookingByOrderId('ord-1');
        expect(db.flight_bookings.findFirst.mock.calls[0][0].select).toMatchObject({ supplier_cost: true, total_price: true });
    });
});
