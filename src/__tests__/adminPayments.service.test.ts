import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({ listPayments: vi.fn(), findPaymentSources: vi.fn() }));
vi.mock('@/repositories/payments.repository', () => ({
    listPayments: repo.listPayments,
    findPaymentSources: repo.findPaymentSources,
}));

import { Prisma } from '@prisma/client';
import { AdminPaymentsService } from '@/services/adminPayments.service';

const service = new AdminPaymentsService();

/** One record behind a payment, as the detail panel still lists them. */
const record = (over: Partial<Record<string, unknown>> = {}) => ({
    source: 'bookings', internalId: 'b-1',
    bookingReference: 'CG-ABC123', bookingStatus: 'confirmed', ...over,
});

/**
 * A grouped payment, which is what the list now returns: one PaymentIntent, one row, carrying
 * the records behind it.
 */
const row = (over: Partial<Record<string, unknown>> = {}) => ({
    paymentIntentId: 'pi_1', product: 'hotel',
    bookingReference: 'CG-ABC123', supplierReference: '31489968',
    provider: 'travelgatex', customerEmail: 'juan@example.com', customerName: 'Juan dela Cruz',
    userId: 'user-1', amount: new Prisma.Decimal('8557.36'), currency: 'PHP',
    createdAt: new Date('2026-10-26T09:14:00Z'),
    records: [record()], ...over,
});

/** A record as the per-record query returns it, for `sources`. */
const sourceRow = (over: Partial<Record<string, unknown>> = {}) => ({
    paymentIntentId: 'pi_1', source: 'bookings', internalId: 'b-1', product: 'hotel',
    bookingReference: 'CG-ABC123', bookingStatus: 'confirmed', supplierReference: '31489968',
    provider: 'travelgatex', customerEmail: 'juan@example.com', customerName: 'Juan dela Cruz',
    userId: 'user-1', amount: new Prisma.Decimal('8557.36'), currency: 'PHP',
    createdAt: new Date('2026-10-26T09:14:00Z'), ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    repo.listPayments.mockResolvedValue({ rows: [row()], total: 1 });
});

describe('what the back office is handed', () => {
    /**
     * A money value that has been through a JS float is no longer evidence of anything, and this
     * page exists to produce evidence. Decimal in, string out, never Number.
     */
    it('passes money through as a string, never a number', async () => {
        const { items } = await service.list({});
        expect(items[0].amount).toBe('8557.36');
        expect(typeof items[0].amount).toBe('string');
    });

    it('sends timestamps as UTC ISO, leaving the display timezone to the reader', async () => {
        const { items } = await service.list({});
        expect(items[0].createdAt).toBe('2026-10-26T09:14:00.000Z');
    });

    it('keeps a null amount null rather than inventing a zero', async () => {
        repo.listPayments.mockResolvedValue({ rows: [row({ amount: null, currency: null })], total: 1 });
        const { items } = await service.list({});
        expect(items[0].amount).toBeNull();
        expect(items[0].currency).toBeNull();
    });
});

describe('paging', () => {
    it('defaults to 25 and offsets from a 1-based page', async () => {
        await service.list({ page: 3 });
        expect(repo.listPayments).toHaveBeenCalledWith({ page: 3 }, { limit: 25, offset: 50 });
    });

    /** The brief forbids handing the browser the whole history; the ceiling is the service's. */
    it('refuses to exceed 100 a page however much is asked for', async () => {
        await service.list({ limit: 5000 });
        expect(repo.listPayments.mock.calls[0][1].limit).toBe(100);
    });

    it('treats a nonsensical page or limit as the first page', async () => {
        await service.list({ page: 0, limit: 0 });
        expect(repo.listPayments.mock.calls[0][1]).toEqual({ limit: 1, offset: 0 });
    });
});

/**
 * ADR-0003, corrected. A hotel booking is held in two tables **by design** — the lifecycle
 * attempt and the sale it became — so the page once showed every healthy stay twice and flagged
 * both as duplicates. A warning that fires on every correct row is one nobody reads, which is
 * the failure that ADR was written to prevent rather than to cause.
 *
 * One PaymentIntent is one row, which is the grain CONTEXT.md names. The records travel with it,
 * so nothing is hidden by the grouping; what is flagged is only a disagreement the normal pair
 * cannot produce.
 */
describe('a payment held in more than one table', () => {
    it('is one row, carrying both records', async () => {
        repo.listPayments.mockResolvedValue({
            rows: [row({ records: [
                record({ source: 'hotel_bookings', internalId: 'hb-1', bookingStatus: 'CONFIRMED' }),
                record({ source: 'bookings', internalId: 'b-1', bookingStatus: 'confirmed' }),
            ] })],
            total: 1,
        });

        const { items } = await service.list({});

        expect(items).toHaveLength(1);
        expect(items[0].records.map(r => r.source)).toEqual(['hotel_bookings', 'bookings']);
    });

    /** The lifecycle-plus-sale pair is normal, and must not read as a finding. */
    it('raises no anomaly for the ordinary pair', async () => {
        repo.listPayments.mockResolvedValue({
            rows: [row({ records: [record({ source: 'hotel_bookings' }), record({ source: 'bookings' })] })],
            total: 1,
        });

        const { items } = await service.list({});

        expect(items[0].anomaly).toBeUndefined();
    });

    /** What a real double-write looks like: one payment against two different bookings. */
    it('carries an anomaly through when the repository found one', async () => {
        repo.listPayments.mockResolvedValue({
            rows: [row({ anomaly: 'multiple_references' })],
            total: 1,
        });

        const { items } = await service.list({});

        expect(items[0].anomaly).toBe('multiple_references');
    });

    /** Paging is in payments now, so a stay in two tables does not consume two of the page. */
    it('counts payments rather than records', async () => {
        repo.listPayments.mockResolvedValue({ rows: [row(), row({ paymentIntentId: 'pi_2' })], total: 2 });

        const { items, total } = await service.list({});

        expect(items).toHaveLength(2);
        expect(total).toBe(2);
    });
});

describe('one payment, every record of it', () => {
    it('returns each source in the order it was created', async () => {
        repo.findPaymentSources.mockResolvedValue([
            row({ source: 'booking_sessions', createdAt: new Date('2026-10-26T09:10:00Z') }),
            row({ source: 'hotel_bookings',   createdAt: new Date('2026-10-26T09:14:00Z') }),
        ]);

        const out = await service.sources('pi_1');

        expect(out.paymentIntentId).toBe('pi_1');
        expect(out.sources.map(s => s.source)).toEqual(['booking_sessions', 'hotel_bookings']);
    });

    /**
     * A PaymentIntent in Stripe that no table here references is ADR-0026's Unrecorded
     * Reservation: a guest holding a room the platform cannot see. Empty is a finding, not a
     * failure, so the service reports it plainly and lets the route decide the status code.
     */
    it('reports nothing found without inventing a record', async () => {
        repo.findPaymentSources.mockResolvedValue([]);
        const out = await service.sources('pi_missing');
        expect(out).toEqual({ paymentIntentId: 'pi_missing', sources: [] });
    });
});
