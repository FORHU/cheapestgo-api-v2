import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Recording what the supplier quoted at prebook.
 *
 * Checkout charges from this row rather than from the browser's payload (ADR-0021), so losing it
 * means losing the sale: `create-payment` answers `QUOTE_NOT_FOUND` and the traveller is told to
 * reselect a room that is perfectly available.
 *
 * It was lost on every single prebook. `check_in` and `check_out` are `date` columns — v1's
 * migration `20260816000001_hotel_prebook_quotes.sql` creates them that way, and api-v2 shares
 * that database (ADR-0001) — but api-v2's Prisma schema described them as `String?` from its
 * first commit. Prisma bound the supplier's plain `YYYY-MM-DD` as text, Postgres answered
 * `incorrect binary data format in bind parameter 6`, and the upsert failed whole.
 *
 * The damage was out of all proportion to the mistake: nothing reads `check_in` or `check_out`
 * from this table — `findPrebookQuote` selects only `gross`, `currency` and `expires_at` — so two
 * unread columns destroyed the three that matter. And the caller logs the failure and carries on
 * by design, so prebook kept answering 200 while recording nothing.
 */

const db = vi.hoisted(() => ({ upsert: vi.fn(), findUnique: vi.fn() }));

vi.mock('@/lib/prisma', () => ({
    prisma: { hotel_prebook_quotes: { upsert: db.upsert, findUnique: db.findUnique } },
}));

import { HotelsRepository } from '@/repositories/hotels.repository';

const repo = new HotelsRepository();

const quote = (over: Record<string, unknown> = {}) => ({
    prebookId: 'MOCK:abc',
    net:       131155,
    gross:     145728,
    currency:  'krw',
    roomName:  'Standard Double Room',
    checkIn:   '2026-11-26',
    checkOut:  '2026-11-27',
    expiresAt: new Date('2026-11-10T03:00:00.000Z'),
    ...over,
});

const written = () => db.upsert.mock.calls[0][0].create;

beforeEach(() => {
    vi.clearAllMocks();
    db.upsert.mockResolvedValue({ prebook_id: 'MOCK:abc' });
});

describe('saving a prebook quote', () => {
    /** The bug itself: a string here is a rejected bind parameter and a lost row. */
    it('writes the stay dates as Dates, never as the strings the supplier sent', async () => {
        await repo.savePrebookQuote(quote());

        expect(written().check_in).toBeInstanceOf(Date);
        expect(written().check_out).toBeInstanceOf(Date);
    });

    /**
     * Pinned to midnight UTC. A `date` column keeps no time, so a value converted in a
     * negative-offset zone would land on the previous day — the guest's arrival moved a night
     * earlier, recorded against terms judged on that date.
     */
    it('keeps the calendar day the supplier meant', async () => {
        await repo.savePrebookQuote(quote());

        expect(written().check_in.toISOString()).toBe('2026-11-26T00:00:00.000Z');
        expect(written().check_out.toISOString()).toBe('2026-11-27T00:00:00.000Z');
    });

    it('accepts a full timestamp and keeps its day', async () => {
        await repo.savePrebookQuote(quote({ checkIn: '2026-11-26T15:30:00+08:00' }));

        expect(written().check_in.toISOString()).toBe('2026-11-26T00:00:00.000Z');
    });

    /**
     * The whole point of coercing in one place. These three are what checkout reads, and they
     * shared the failed bind parameter — so a date the database would not accept cost us the
     * price, the currency and the expiry as well.
     */
    it('still records the figures checkout charges from when the dates are absent', async () => {
        await repo.savePrebookQuote(quote({ checkIn: null, checkOut: null }));

        const row = written();
        expect(row.check_in).toBeNull();
        expect(row.check_out).toBeNull();
        expect(Number(row.gross)).toBe(145728);
        expect(row.currency).toBe('KRW');
        expect(row.expires_at).toEqual(new Date('2026-11-10T03:00:00.000Z'));
    });

    it('does not let an unparseable date take the row down with it', async () => {
        await repo.savePrebookQuote(quote({ checkIn: 'not-a-date' }));

        expect(written().check_in).toBeNull();
        expect(Number(written().gross)).toBe(145728);
    });

    it('normalises the currency, because the charge is matched against it', async () => {
        await repo.savePrebookQuote(quote());

        expect(written().currency).toBe('KRW');
    });

    /** Re-quoting the same token must replace the figure, not leave a stale one to charge from. */
    it('upserts on the prebook id and updates the same fields it creates', async () => {
        await repo.savePrebookQuote(quote());

        const call = db.upsert.mock.calls[0][0];
        expect(call.where).toEqual({ prebook_id: 'MOCK:abc' });
        expect(Object.keys(call.update).sort()).toEqual(Object.keys(call.create).filter(k => k !== 'prebook_id').sort());
    });
});

describe('reading a prebook quote back', () => {
    it('hands back plain numbers, keeping Prisma Decimals at the boundary', async () => {
        db.findUnique.mockResolvedValue({
            gross: { toNumber: () => 145728 }, currency: 'KRW',
            expires_at: new Date('2026-11-10T03:00:00.000Z'),
        });

        const found = await repo.findPrebookQuote('MOCK:abc');

        expect(found).toEqual({
            gross: 145728, currency: 'KRW', expires_at: new Date('2026-11-10T03:00:00.000Z'),
        });
    });

    /** No row is a refusal to charge, not a zero. */
    it('returns null when there is no quote', async () => {
        db.findUnique.mockResolvedValue(null);

        await expect(repo.findPrebookQuote('MOCK:gone')).resolves.toBeNull();
    });
});
