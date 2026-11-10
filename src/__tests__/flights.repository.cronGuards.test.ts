/**
 * The two crons that act on flight sessions and orders, and the attempts they must not touch.
 *
 * Both predate the flight booking lifecycle. Left as they were, auto-recover would read an
 * authorised (not captured) card as unpaid and expire the attempt under it, and the
 * orphaned-order cron would cancel the ticket of an order whose payment was being kept.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));

import { FlightsRepository } from '@/repositories/flights.repository';

const sql = () => (db.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
const values = () => db.$queryRaw.mock.calls[0].slice(1);

let repo: FlightsRepository;

beforeEach(() => {
    vi.clearAllMocks();
    db.$queryRaw.mockResolvedValue([]);
    repo = new FlightsRepository();
});

describe('sessions auto-recover may retry', () => {
    const olderThan = new Date('2026-10-19T11:55:00Z');
    const newerThan = new Date('2026-10-18T12:00:00Z');

    it('never offers a session the booking lifecycle owns', async () => {
        await repo.findSessionsToAutoRecover(olderThan, newerThan, 10);
        expect(sql()).toMatch(/AND \(provider <> 'duffel' OR capture_method IS DISTINCT FROM 'manual'\)/);
    });

    it('otherwise offers what it always did: paid, unbooked, between five minutes and a day old', async () => {
        await repo.findSessionsToAutoRecover(olderThan, newerThan, 10);
        expect(sql()).toMatch(/payment_intent_id IS NOT NULL/);
        expect(sql()).toMatch(/status NOT IN \('booked', 'expired', 'completed', 'failed'\)/);
        expect(values()).toEqual([olderThan.toISOString(), newerThan.toISOString(), 10]);
    });
});

describe('bookings the ticket poll checks', () => {
    it('includes the ones the booking lifecycle left waiting for a ticket', async () => {
        // The lifecycle writes `awaiting_ticket` when Duffel has not issued yet. The poll
        // selected only `booked`, which nothing writes, so those bookings were never
        // checked again and the traveller never got their ticket email.
        await repo.findBookingsAwaitingTicket();
        expect(sql()).toMatch(/status IN \('awaiting_ticket', 'booked'\)/);
    });

    it('otherwise checks what it always did: a Duffel order still inside its ticketing deadline', async () => {
        await repo.findBookingsAwaitingTicket();
        expect(sql()).toMatch(/provider = 'duffel'/);
        expect(sql()).toMatch(/provider_order_id IS NOT NULL/);
        expect(sql()).toMatch(/\(ticket_time_limit IS NULL OR ticket_time_limit > NOW\(\)\)/);
        expect(values()).toEqual([50]);
    });
});

describe('marking a polled booking ticketed', () => {
    it('only moves a booking that is still waiting for its ticket', async () => {
        // The poll reads Duffel between its select and this write. A customer cancel in that
        // window must not be overwritten with `ticketed`.
        await repo.markTicketedIfAwaiting('fb-1', ['0797586589419']);
        expect(sql()).toMatch(/UPDATE flight_bookings/);
        expect(sql()).toMatch(/AND status IN \('awaiting_ticket', 'booked'\)/);
        expect(sql()).toMatch(/RETURNING id/);
        expect(values()).toEqual([JSON.stringify(['0797586589419']), 'fb-1']);
    });

    it('stamps ticketed_at, and never updated_at, which flight_bookings does not have', async () => {
        // The poll's old UPDATE set `updated_at = NOW()`. Postgres rejects the whole statement
        // ("column updated_at does not exist"), so even a booking it did select could never
        // have been marked ticketed. `ticketed_at` is what the issue-ticket route stamps.
        await repo.markTicketedIfAwaiting('fb-1', ['T-1']);
        expect(sql()).toMatch(/ticketed_at\s*=\s*COALESCE\(ticketed_at, NOW\(\)\)/);
        expect(sql()).not.toMatch(/updated_at/);
    });

    it('says whether it moved the booking', async () => {
        db.$queryRaw.mockResolvedValueOnce([{ id: 'fb-1' }]);
        expect(await repo.markTicketedIfAwaiting('fb-1', ['T-1'])).toBe(true);
        db.$queryRaw.mockResolvedValueOnce([]);
        expect(await repo.markTicketedIfAwaiting('fb-1', ['T-1'])).toBe(false);
    });
});

describe('orders the orphaned-order cron may cancel', () => {
    it('never offers one the booking lifecycle wrote', async () => {
        await repo.findOrphanedOrderCandidates(new Date('2026-10-19T11:25:00Z'));
        expect(sql()).toMatch(/NOT EXISTS[\s\S]*booking_sessions s[\s\S]*s\.id = fb\.session_id[\s\S]*s\.capture_method = 'manual'/);
    });

    it('otherwise offers what it always did: a Duffel order still pending payment', async () => {
        const cutoff = new Date('2026-10-19T11:25:00Z');
        await repo.findOrphanedOrderCandidates(cutoff);
        expect(sql()).toMatch(/fb\.provider = 'duffel'/);
        expect(sql()).toMatch(/fb\.status IN \('payment_initiated', 'initiated', 'pending'\)/);
        expect(values()).toEqual([cutoff.toISOString(), 20]);
    });
});
