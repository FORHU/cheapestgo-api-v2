import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
    $queryRaw:       vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRaw:     vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));

import { HotelBookingLifecycleRepository } from '@/repositories/hotelBookingLifecycle.repository';
import { InvalidTransitionError } from '@/lib/hotels/lifecycle/stateMachine';

const sql = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

const ROW = {
    id: 'b0b0b0b0-0000-0000-0000-000000000001',
    booking_reference: 'CG-ABC123',
    user_id: 'u-1',
    status: 'PAYMENT_PENDING',
    provider: 'mock',
    prebook_ref: 'MOCK:xyz',
    payment_intent_id: 'pi_1',
    hotel_code: 'MOCK-MNL-001',
    property_name: 'Bayside Grand Manila',
    room_name: 'Standard Double Room',
    check_in: new Date('2026-11-10T00:00:00Z'),
    check_out: '2026-11-12',
    currency: 'USD',
    amount_minor: BigInt(26400),
    draft: { board: 'BB' },
    supplier_reference: null,
    failure_code: null,
    failure_message: null,
    created_at: new Date('2026-10-15T00:00:00Z'),
    updated_at: new Date('2026-10-15T00:00:00Z'),
};

let repo: HotelBookingLifecycleRepository;

beforeEach(() => {
    vi.clearAllMocks();
    HotelBookingLifecycleRepository.resetWarnings();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    db.$queryRaw.mockResolvedValue([]);
    db.$queryRawUnsafe.mockResolvedValue([]);
    db.$executeRaw.mockResolvedValue(1);
    repo = new HotelBookingLifecycleRepository();
});

describe('begin', () => {
    const input = {
        reference: 'CG-ABC123', userId: 'u-1', provider: 'mock', prebookRef: 'MOCK:xyz',
        paymentIntentId: 'pi_1', currency: 'usd', amountMinor: 26400,
    };

    it('opens an attempt and returns it in application terms', async () => {
        db.$queryRawUnsafe.mockResolvedValueOnce([ROW]);

        const rec = await repo.begin(input);

        expect(rec).toMatchObject({
            reference: 'CG-ABC123', status: 'PAYMENT_PENDING', paymentIntentId: 'pi_1',
            currency: 'USD', amountMinor: 26400, checkIn: '2026-11-10', checkOut: '2026-11-12',
            draft: { board: 'BB' },
        });
        // Charge currency is stored upper-case regardless of how Stripe spells it.
        expect(db.$queryRawUnsafe.mock.calls[0]).toContain('USD');
    });

    it('does not regress an existing attempt on a replay: the upsert never touches status', async () => {
        db.$queryRawUnsafe.mockResolvedValueOnce([{ ...ROW, status: 'PAYMENT_AUTHORIZED' }]);

        const rec = await repo.begin(input);

        const statement = db.$queryRawUnsafe.mock.calls[0][0] as string;
        expect(statement).toMatch(/ON CONFLICT \(booking_reference\) DO UPDATE/);
        const setClause = statement.slice(statement.indexOf('DO UPDATE'));
        expect(setClause).not.toMatch(/\bstatus\s*=/);
        expect(rec?.status).toBe('PAYMENT_AUTHORIZED');
    });

    it('supersedes an unpaid attempt on the same quote before inserting', async () => {
        db.$queryRawUnsafe.mockResolvedValueOnce([ROW]);
        await repo.begin(input);
        expect(sql(db.$executeRaw.mock.calls[0])).toMatch(/SUPERSEDED/);
        expect(sql(db.$executeRaw.mock.calls[0])).toMatch(/status = 'PAYMENT_PENDING'/);
    });

    it('never throws: an outage returns null', async () => {
        db.$executeRaw.mockRejectedValue(new Error('connection refused'));
        await expect(repo.begin(input)).resolves.toBeNull();
    });

    it('warns once, not per call, when the tables are not there yet', async () => {
        db.$executeRaw.mockRejectedValue(new Error('relation "hotel_bookings" does not exist'));
        await repo.begin(input);
        await repo.begin(input);
        await repo.begin(input);
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(vi.mocked(console.warn).mock.calls[0][0]).toMatch(/20261015000001_hotel_booking_lifecycle/);
    });
});

describe('transition (the claim)', () => {
    it('is applied for exactly the caller that moved it', async () => {
        db.$queryRaw.mockResolvedValueOnce([{ booking_id: ROW.id }]);

        const out = await repo.transition('CG-ABC123', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', { actor: 'browser' });

        expect(out).toBe('applied');
        expect(sql(db.$queryRaw.mock.calls[0])).toMatch(/status = ANY\(/);
    });

    it('is lost when another caller got there first', async () => {
        db.$queryRaw.mockResolvedValueOnce([]);
        expect(await repo.transition('CG-ABC123', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', { actor: 'webhook' }))
            .toBe('lost');
    });

    it('is unavailable — not lost — when the table cannot be reached', async () => {
        db.$queryRaw.mockRejectedValueOnce(new Error('relation "hotel_bookings" does not exist'));
        expect(await repo.transition('CG-ABC123', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', { actor: 'browser' }))
            .toBe('unavailable');
    });

    it('refuses an illegal transition before any SQL runs', async () => {
        await expect(repo.transition('CG-ABC123', 'CONFIRMED', 'PAYMENT_PENDING', { actor: 'browser' }))
            .rejects.toBeInstanceOf(InvalidTransitionError);
        expect(db.$queryRaw).not.toHaveBeenCalled();
    });

    it('accepts several allowed origins', async () => {
        db.$queryRaw.mockResolvedValueOnce([{ booking_id: ROW.id }]);
        const out = await repo.transition('CG-ABC123', ['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED'], 'EXPIRED', { actor: 'sweeper' });
        expect(out).toBe('applied');
        expect(db.$queryRaw.mock.calls[0]).toContainEqual(['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED']);
    });

    it('records the actor, reason and failure detail with the move', async () => {
        db.$queryRaw.mockResolvedValueOnce([{ booking_id: ROW.id }]);
        await repo.transition('CG-ABC123', 'SUPPLIER_BOOKING', 'FAILED', {
            actor: 'browser', reason: 'supplier refused', patch: { failureCode: 'REJECTED', failureMessage: 'No rooms' },
        });
        const values = db.$queryRaw.mock.calls[0].slice(1);
        expect(values).toEqual(expect.arrayContaining(['FAILED', 'browser', 'supplier refused', 'REJECTED', 'No rooms']));
    });
});

describe('reads', () => {
    it('finds by reference and by payment intent, and returns null for nothing', async () => {
        db.$queryRawUnsafe.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([]);
        expect((await repo.findByReference('CG-ABC123'))?.reference).toBe('CG-ABC123');
        expect(await repo.findByPaymentIntent('pi_nope')).toBeNull();
    });

    it('drops a row whose status it does not recognise rather than guessing', async () => {
        db.$queryRawUnsafe.mockResolvedValueOnce([{ ...ROW, status: 'WHO_KNOWS' }]);
        expect(await repo.findByReference('CG-ABC123')).toBeNull();
    });

    it('only offers a sweep what the supplier was never asked about', async () => {
        db.$queryRawUnsafe.mockResolvedValueOnce([ROW]);
        const out = await repo.findAbandoned(['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED'], new Date('2026-10-14T00:00:00Z'), 50);

        expect(out).toHaveLength(1);
        const statement = db.$queryRawUnsafe.mock.calls[0][0] as string;
        expect(statement).toMatch(/NOT EXISTS[\s\S]*supplier_booking_attempts/);
        expect(statement).toMatch(/client_reference = h\.booking_reference/);
    });

    it('returns empty lists, never throws, when a read fails', async () => {
        db.$queryRawUnsafe.mockRejectedValue(new Error('boom'));
        db.$queryRaw.mockRejectedValue(new Error('boom'));
        expect(await repo.findAbandoned(['PAYMENT_PENDING'], new Date())).toEqual([]);
        expect(await repo.findNeedingAttention(new Date())).toEqual([]);
        expect(await repo.loadGuests('CG-ABC123')).toEqual([]);
        expect(await repo.events('CG-ABC123')).toEqual([]);
    });
});

describe('confirm inputs', () => {
    it('replaces the guests of the attempt and merges the purchase options', async () => {
        db.$queryRaw.mockResolvedValueOnce([{ id: ROW.id }]);

        const ok = await repo.saveConfirmInputs('CG-ABC123', {
            draft:  { board: 'BB', specialRequests: 'high floor' },
            guests: [
                { kind: 'holder', firstName: 'Juan', lastName: 'dela Cruz', email: 'juan@example.com' },
                { kind: 'adult', firstName: 'Maria', lastName: 'dela Cruz' },
            ],
        });

        expect(ok).toBe(true);
        const writes = db.$executeRaw.mock.calls.map(sql);
        expect(writes[0]).toMatch(/DELETE FROM hotel_booking_guests/);
        expect(writes.filter((w) => /INSERT INTO hotel_booking_guests/.test(w))).toHaveLength(2);
    });

    it('reports false when the attempt does not exist', async () => {
        db.$queryRaw.mockResolvedValueOnce([]);
        expect(await repo.saveConfirmInputs('CG-NOPE', { draft: {}, guests: [] })).toBe(false);
    });

    it('reads guests back in order', async () => {
        db.$queryRaw.mockResolvedValueOnce([
            { kind: 'holder', first_name: 'Juan', last_name: 'dela Cruz', age: null, email: 'j@x.com' },
            { kind: 'child', first_name: 'Pepe', last_name: 'dela Cruz', age: 8, email: null },
        ]);
        expect(await repo.loadGuests('CG-ABC123')).toEqual([
            { kind: 'holder', firstName: 'Juan', lastName: 'dela Cruz', age: null, email: 'j@x.com' },
            { kind: 'child', firstName: 'Pepe', lastName: 'dela Cruz', age: 8, email: null },
        ]);
    });
});
