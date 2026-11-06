import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
    bookings: {
        findMany:  vi.fn(),
        findFirst: vi.fn(),
    },
    hotel_bookings: {
        findMany:  vi.fn(),
        findFirst: vi.fn(),
    },
    flight_bookings: {
        findMany: vi.fn(),
    },
    golf_bookings: {
        findMany: vi.fn(),
    },
}));

vi.mock('@/lib/prisma', () => ({ prisma: db }));

import { BookingsRepository } from '@/repositories/bookings.repository';

const USER = '11111111-2222-3333-4444-555555555555';

const LEGACY_HOTEL = {
    id: 'b-leg-1',
    booking_id: 'CG-HOTEL-LEGACY',
    user_id: USER,
    property_name: 'Legacy Manila Hotel',
    room_name: 'Standard Room',
    check_in: new Date('2026-12-01'),
    check_out: new Date('2026-12-05'),
    total_price: 150.00,
    currency: 'USD',
    status: 'confirmed',
    created_at: new Date('2026-11-01T10:00:00Z'),
};

const V2_HOTEL = {
    id: 'hb-v2-1',
    booking_reference: 'CG-HOTEL-V2',
    user_id: USER,
    provider: 'travelgatex',
    property_name: 'BGC Grand Hotel',
    room_name: 'Executive Suite',
    check_in: new Date('2026-12-10'),
    check_out: new Date('2026-12-12'),
    amount_minor: 25000n,
    currency: 'USD',
    status: 'CONFIRMED',
    supplier_reference: 'TGX-9988',
    created_at: new Date('2026-11-03T10:00:00Z'),
    updated_at: new Date('2026-11-03T10:05:00Z'),
    hotel_booking_guests: [
        { kind: 'holder', first_name: 'Reign', last_name: 'Valdez', email: 'reign@example.com' },
    ],
};

const FLIGHT = {
    id: 'fb-1',
    booking_reference: 'CG-FLIGHT-01',
    user_id: USER,
    created_at: new Date('2026-11-02T10:00:00Z'),
    flight_segments: [
        { segment_index: 0, origin: 'MNL', destination: 'NRT' },
    ],
    passengers: [
        { first_name: 'Reign', last_name: 'Valdez' },
    ],
};

const GOLF = {
    id: 'gb-1',
    reference: 'CG-GOLF-01',
    user_id: USER,
    players: 2,
    lead_name: 'Reign Valdez',
    contact_email: 'reign@example.com',
    currency: 'USD',
    total: '220.00',
    status: 'confirmed',
    created_at: new Date('2026-11-04T10:00:00Z'),
    updated_at: new Date('2026-11-04T10:00:00Z'),
    golf_courses: {
        name: 'Wack Wack Golf & Country Club',
    },
    golf_tee_times: {
        starts_at: new Date('2026-12-15T08:00:00Z'),
    },
};

let repo: BookingsRepository;

beforeEach(() => {
    vi.clearAllMocks();
    db.bookings.findMany.mockResolvedValue([]);
    db.hotel_bookings.findMany.mockResolvedValue([]);
    db.flight_bookings.findMany.mockResolvedValue([]);
    db.golf_bookings.findMany.mockResolvedValue([]);
    repo = new BookingsRepository();
});

describe('BookingsRepository.listForUser (aggregation)', () => {
    it('aggregates and sorts all booking types (hotels, flights, golf) descending by created_at', async () => {
        db.bookings.findMany.mockResolvedValueOnce([LEGACY_HOTEL]);
        db.hotel_bookings.findMany.mockResolvedValueOnce([V2_HOTEL]);
        db.flight_bookings.findMany.mockResolvedValueOnce([FLIGHT]);
        db.golf_bookings.findMany.mockResolvedValueOnce([GOLF]);

        const trips = await repo.listForUser(USER);

        expect(trips).toHaveLength(4);
        // Sorted descending by created_at: GOLF (Nov 4) -> V2_HOTEL (Nov 3) -> FLIGHT (Nov 2) -> LEGACY_HOTEL (Nov 1)
        expect(trips[0].type).toBe('golf');
        expect(trips[0].booking_id).toBe('CG-GOLF-01');

        expect(trips[1].type).toBe('hotel');
        expect(trips[1].booking_id).toBe('CG-HOTEL-V2');
        expect(trips[1].total_price).toBe(250);

        expect(trips[2].type).toBe('flight');

        expect(trips[3].type).toBe('hotel');
        expect(trips[3].booking_id).toBe('CG-HOTEL-LEGACY');
    });

    it('filters strictly by tripType when specified', async () => {
        db.golf_bookings.findMany.mockResolvedValueOnce([GOLF]);

        const golfTrips = await repo.listForUser(USER, 'golf');
        expect(golfTrips).toHaveLength(1);
        expect(golfTrips[0].type).toBe('golf');
        expect(db.bookings.findMany).not.toHaveBeenCalled();
        expect(db.flight_bookings.findMany).not.toHaveBeenCalled();
    });

    it('deduplicates V2 hotel bookings when matching legacy booking_id is present', async () => {
        db.bookings.findMany.mockResolvedValueOnce([
            { ...LEGACY_HOTEL, booking_id: 'CG-HOTEL-V2' },
        ]);
        db.hotel_bookings.findMany.mockResolvedValueOnce([V2_HOTEL]);

        const trips = await repo.listForUser(USER, 'hotel');
        expect(trips).toHaveLength(1);
        expect(trips[0].booking_id).toBe('CG-HOTEL-V2');
    });
});

describe('BookingsRepository.findByIdForUser', () => {
    it('returns legacy booking when found', async () => {
        db.bookings.findFirst.mockResolvedValueOnce(LEGACY_HOTEL);

        const found = await repo.findByIdForUser('CG-HOTEL-LEGACY', USER);
        expect(found).toEqual(LEGACY_HOTEL);
        expect(db.hotel_bookings.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to V2 hotel_bookings when not in legacy table', async () => {
        db.bookings.findFirst.mockResolvedValueOnce(null);
        db.hotel_bookings.findFirst.mockResolvedValueOnce(V2_HOTEL);

        const found = await repo.findByIdForUser('CG-HOTEL-V2', USER);
        expect(found).toMatchObject({
            booking_id: 'CG-HOTEL-V2',
            property_name: 'BGC Grand Hotel',
            total_price: 250,
            holder_first_name: 'Reign',
        });
    });
});

