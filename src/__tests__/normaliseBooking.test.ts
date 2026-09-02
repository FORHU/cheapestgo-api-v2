import { describe, expect, it } from 'vitest';
import { normaliseBooking, mergeAdminBookings } from '@/lib/admin/normaliseBooking';

/**
 * The admin endpoint returned raw Prisma rows while the client read `userId`,
 * `totalAmount` and `createdAt`. One booking took the page down on
 * `booking.userId.slice()`. These pin the mapping that now sits between them.
 */

const hotelRow = {
    id: 'h-1',
    user_id: 'u-1',
    booking_id: 'CG-123',
    status: 'confirmed',
    total_price: 11533,
    currency: 'PHP',
    created_at: '2026-08-01T00:00:00Z',
    property_name: 'Hilton Cebu',
};

const flightRow = {
    id: 'f-1',
    user_id: 'u-2',
    pnr: 'ABC123',
    status: 'ticketed',
    total_price: 20000,
    charged_price: 22502.4,
    currency: 'PHP',
    created_at: '2026-08-02T00:00:00Z',
};

describe('normaliseBooking', () => {
    it('renames the hotel row to the shape the client declares', () => {
        const b = normaliseBooking(hotelRow, 'hotel');
        expect(b.userId).toBe('u-1');
        expect(b.totalAmount).toBe(11533);
        expect(b.reference).toBe('CG-123');
        expect(b.summary).toBe('Hilton Cebu');
        expect(b.type).toBe('hotel');
    });

    it('identifies a flight by its PNR', () => {
        const b = normaliseBooking(flightRow, 'flight');
        expect(b.reference).toBe('ABC123');
        expect(b.summary).toBe('ABC123');
    });

    it('prefers the charged price over the pre-capture total', () => {
        // total_price is what was quoted; charged_price is what the customer paid,
        // and they differ whenever a reprice happened before capture.
        expect(normaliseBooking(flightRow, 'flight').totalAmount).toBe(22502.4);
    });

    it('reads a Decimal or a string amount as a number', () => {
        // Raw queries return `numeric` as a string or a Decimal object depending on
        // the driver; Number() on the object form yields NaN without this.
        expect(normaliseBooking({ ...hotelRow, total_price: '11533.00' }, 'hotel').totalAmount).toBe(11533);
        expect(normaliseBooking({ ...hotelRow, total_price: { toString: () => '99.50' } }, 'hotel').totalAmount).toBe(99.5);
    });

    it('never yields NaN for a missing or unreadable amount', () => {
        expect(normaliseBooking({ ...hotelRow, total_price: null, charged_price: null }, 'hotel').totalAmount).toBe(0);
        expect(normaliseBooking({ ...hotelRow, total_price: 'not-a-number' }, 'hotel').totalAmount).toBe(0);
    });

    it('gives an empty string, not undefined, for a missing user id', () => {
        // The client indexes a lookup with this and calls string methods on the
        // fallback — undefined is what crashed the page.
        expect(normaliseBooking({ ...hotelRow, user_id: null }, 'hotel').userId).toBe('');
    });

    it('leaves reference and summary undefined rather than empty when absent', () => {
        const b = normaliseBooking({ id: 'x', status: 'confirmed' }, 'flight');
        expect(b.reference).toBeUndefined();
        expect(b.summary).toBeUndefined();
        expect(b.status).toBe('confirmed');
    });
});

describe('mergeAdminBookings', () => {
    it('returns both kinds in one list, newest first', () => {
        const merged = mergeAdminBookings([hotelRow], [flightRow]);
        expect(merged).toHaveLength(2);
        // The flight is a day later, so it leads.
        expect(merged[0].type).toBe('flight');
        expect(merged[1].type).toBe('hotel');
    });

    it('copes with either side being empty', () => {
        expect(mergeAdminBookings([], [flightRow])).toHaveLength(1);
        expect(mergeAdminBookings([hotelRow], [])).toHaveLength(1);
        expect(mergeAdminBookings([], [])).toEqual([]);
    });
});
