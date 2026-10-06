import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        bookings:        { findMany: vi.fn() },
        flight_bookings: { findMany: vi.fn() },
    },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { AdminRevenueService } from '@/services/adminRevenue.service';

/**
 * What the revenue screen totals.
 *
 * The figures used to be summed in whatever currency each booking was charged in, so a
 * ₩1,200,000 stay and a $420 flight were added together as bare numbers. Every total is now
 * restated at the booking's own locked rate (ADR-0008) — never at today's rate, which would
 * make a closed period move each time the page is opened.
 */

const hotel = (over: Record<string, unknown> = {}) => ({
    id: 'h1', booking_id: 'FORHU-1', status: 'confirmed', currency: 'PHP',
    created_at: new Date('2026-09-01'), total_price: 5800, charged_price: 5800,
    supplier_cost: 5000, markup_pct: null, usd_amount: 100, fx_rate: 0.01724,
    holder_first_name: 'Ana', holder_last_name: 'Cruz', holder_email: 'ana@example.test',
    property_name: 'Hotel Naru', ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.flight_bookings.findMany.mockResolvedValue([]);
});

describe('AdminRevenueService', () => {
    it('reports its totals in one currency', async () => {
        prismaMock.bookings.findMany.mockResolvedValue([hotel()]);

        const result = await new AdminRevenueService().read({});

        expect(result.currency).toBe('USD');
        expect(result.stats.totalRevenue).toBe(100);
    });

    it('scales a booking by its own locked rate, not by the page load', async () => {
        // ₩1,200,000 at the rate captured when the payment was taken. Counted at face value
        // this would add 1,200,000 to a dollar total and swamp the period.
        prismaMock.bookings.findMany.mockResolvedValue([
            hotel({ id: 'h2', currency: 'KRW', total_price: 1_200_000, charged_price: 1_200_000, supplier_cost: 1_100_000, usd_amount: 900 }),
        ]);

        const result = await new AdminRevenueService().read({});

        expect(result.stats.totalRevenue).toBe(900);
        expect(result.stats.totalMarkup).toBeLessThan(900);
    });

    it('leaves a booking with no locked rate out, and says how many', async () => {
        // A partial total that does not admit it is partial is the failure being avoided.
        prismaMock.bookings.findMany.mockResolvedValue([
            hotel(),
            hotel({ id: 'h3', usd_amount: null, fx_rate: null }),
        ]);

        const result = await new AdminRevenueService().read({});

        expect(result.stats.totalRevenue).toBe(100);
        expect(result.stats.unconvertedCount).toBe(1);
        // The row is still listed — it just does not contribute to the totals.
        expect(result.total).toBe(2);
    });

    it('still shows each row in the currency the customer was charged in', async () => {
        prismaMock.bookings.findMany.mockResolvedValue([hotel()]);

        const [row] = (await new AdminRevenueService().read({})).bookings;

        expect(row.currency).toBe('PHP');
        expect(row.totalAmount).toBe(5800);
    });
});
