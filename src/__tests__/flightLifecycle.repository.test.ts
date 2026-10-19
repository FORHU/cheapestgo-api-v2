import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
    $queryRaw:       vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRaw:     vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));

import { FlightBookingLifecycleRepository } from '@/repositories/flightBookingLifecycle.repository';
import { InvalidTransitionError } from '@/lib/flights/lifecycle/stateMachine';

const sql = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

const SESSION = '5e55e55e-0000-0000-0000-000000000001';

const ROW = {
    id:                SESSION,
    user_id:           'u-1',
    provider:          'duffel',
    lifecycle_status:  'PAYMENT_PENDING',
    payment_intent_id: 'pi_1',
    capture_method:    'manual',
    created_at:        new Date('2026-10-19T00:00:00Z'),
    updated_at:        new Date('2026-10-19T00:05:00Z'),
    failure_code:      null,
    failure_message:   null,
    supplier_order_id: null,
};

// What Postgres says, through Prisma, before the migration is applied.
const MISSING_COLUMN = new Error('Raw query failed. Code: `42703`. Message: `column "lifecycle_status" does not exist`');
const MISSING_TABLE  = new Error('Raw query failed. Code: `42P01`. Message: `relation "flight_booking_events" does not exist`');

let repo: FlightBookingLifecycleRepository;

beforeEach(() => {
    vi.clearAllMocks();
    FlightBookingLifecycleRepository.resetWarnings();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    db.$queryRaw.mockResolvedValue([]);
    db.$queryRawUnsafe.mockResolvedValue([]);
    db.$executeRaw.mockResolvedValue(1);
    repo = new FlightBookingLifecycleRepository();
});

describe('transition (the claim)', () => {
    it('applies for the first caller and is lost for a second one racing it', async () => {
        db.$queryRaw
            .mockResolvedValueOnce([{ session_id: SESSION }])
            .mockResolvedValueOnce([]);

        const [first, second] = [
            await repo.transition(SESSION, 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', { actor: 'browser' }),
            await repo.transition(SESSION, 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', { actor: 'webhook' }),
        ];

        expect(first).toBe('applied');
        expect(second).toBe('lost');
        // The status test and the write are one statement: that is what makes it a claim.
        const statement = sql(db.$queryRaw.mock.calls[0]);
        expect(statement).toMatch(/lifecycle_status = ANY\(/);
        expect(statement).toMatch(/FOR UPDATE/);
        expect(statement).toMatch(/UPDATE booking_sessions/);
    });

    it('is unavailable — not lost — when the column is not there yet', async () => {
        db.$queryRaw.mockRejectedValueOnce(MISSING_COLUMN);
        expect(await repo.transition(SESSION, 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', { actor: 'browser' }))
            .toBe('unavailable');
    });

    it('is unavailable when the events table is not there yet', async () => {
        db.$queryRaw.mockRejectedValueOnce(MISSING_TABLE);
        expect(await repo.transition(SESSION, 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', { actor: 'webhook' }))
            .toBe('unavailable');
    });

    it('is unavailable on any other database failure, and never throws', async () => {
        db.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
        await expect(repo.transition(SESSION, 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', { actor: 'webhook' }))
            .resolves.toBe('unavailable');
    });

    it('refuses an illegal transition before any SQL runs', async () => {
        await expect(repo.transition(SESSION, 'CONFIRMED', 'PAYMENT_PENDING', { actor: 'browser' }))
            .rejects.toBeInstanceOf(InvalidTransitionError);
        // The airline is never asked before the card is authorised.
        await expect(repo.transition(SESSION, 'PAYMENT_PENDING', 'SUPPLIER_BOOKING', { actor: 'browser' }))
            .rejects.toBeInstanceOf(InvalidTransitionError);
        expect(db.$queryRaw).not.toHaveBeenCalled();
    });

    it('accepts several allowed origins', async () => {
        db.$queryRaw.mockResolvedValueOnce([{ session_id: SESSION }]);
        const out = await repo.transition(SESSION, ['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED'], 'EXPIRED', { actor: 'sweeper' });
        expect(out).toBe('applied');
        expect(db.$queryRaw.mock.calls[0]).toContainEqual(['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED']);
    });

    it('writes an event with the actor and reason in the same statement as the move', async () => {
        db.$queryRaw.mockResolvedValueOnce([{ session_id: SESSION }]);
        await repo.transition(SESSION, 'SUPPLIER_BOOKING', 'FAILED', { actor: 'browser', reason: 'airline refused the order' });

        expect(sql(db.$queryRaw.mock.calls[0])).toMatch(/INSERT INTO flight_booking_events/);
        const values = db.$queryRaw.mock.calls[0].slice(1);
        expect(values).toEqual(expect.arrayContaining(['FAILED', 'browser', 'airline refused the order']));
    });

    it('keeps failure detail and the airline order in the event payload — the session has no column for them', async () => {
        db.$queryRaw.mockResolvedValueOnce([{ session_id: SESSION }]);
        await repo.transition(SESSION, 'SUPPLIER_BOOKING', 'NEEDS_REVIEW', {
            actor:   'webhook',
            reason:  'airline ordered but the payment could not be captured',
            payload: { attempt: 2 },
            patch:   { failureCode: 'CAPTURE_FAILED', failureMessage: 'card_declined', supplierOrderId: 'ord_123' },
        });

        const json = db.$queryRaw.mock.calls[0].slice(1).find((v: unknown) => typeof v === 'string' && v.startsWith('{'));
        expect(JSON.parse(json as string)).toEqual({
            attempt: 2, failureCode: 'CAPTURE_FAILED', failureMessage: 'card_declined', supplierOrderId: 'ord_123',
        });
    });

    it('writes no payload when there is nothing to say', async () => {
        db.$queryRaw.mockResolvedValueOnce([{ session_id: SESSION }]);
        await repo.transition(SESSION, 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', { actor: 'webhook' });
        const values = db.$queryRaw.mock.calls[0].slice(1);
        expect(values.some((v: unknown) => typeof v === 'string' && v.startsWith('{'))).toBe(false);
    });

    it('cuts a long failure message down before storing it', async () => {
        db.$queryRaw.mockResolvedValueOnce([{ session_id: SESSION }]);
        await repo.transition(SESSION, 'SUPPLIER_BOOKING', 'FAILED', {
            actor: 'browser', patch: { failureCode: 'REJECTED', failureMessage: 'x'.repeat(2000) },
        });
        const json = db.$queryRaw.mock.calls[0].slice(1).find((v: unknown) => typeof v === 'string' && v.startsWith('{'));
        expect(JSON.parse(json as string).failureMessage).toHaveLength(500);
    });
});

describe('begin', () => {
    it('records the creation of the attempt once and returns it', async () => {
        db.$queryRawUnsafe.mockResolvedValueOnce([ROW]);

        const rec = await repo.begin(SESSION);

        expect(rec).toMatchObject({ sessionId: SESSION, status: 'PAYMENT_PENDING', paymentIntentId: 'pi_1' });
        const write = sql(db.$executeRaw.mock.calls[0]);
        expect(write).toMatch(/INSERT INTO flight_booking_events/);
        // A replay (back to details, submit again) must not add a second creation event.
        expect(write).toMatch(/NOT EXISTS/);
    });

    it('returns null, never throws, before the migration', async () => {
        db.$executeRaw.mockRejectedValueOnce(MISSING_TABLE);
        await expect(repo.begin(SESSION)).resolves.toBeNull();
    });
});

describe('note', () => {
    it('records an event that does not move the attempt', async () => {
        await repo.note(SESSION, 'browser', 'read back after a timeout: order found', { orderId: 'ord_1' });
        const statement = sql(db.$executeRaw.mock.calls[0]);
        expect(statement).toMatch(/INSERT INTO flight_booking_events/);
        expect(statement).toMatch(/lifecycle_status, lifecycle_status/);
        expect(db.$executeRaw.mock.calls[0]).toContain('read back after a timeout: order found');
    });

    it('never throws', async () => {
        db.$executeRaw.mockRejectedValueOnce(new Error('boom'));
        await expect(repo.note(SESSION, 'browser', 'x')).resolves.toBeUndefined();
    });
});

describe('reads', () => {
    it('finds by session and by payment intent, in application terms', async () => {
        db.$queryRawUnsafe
            .mockResolvedValueOnce([{ ...ROW, failure_code: 'CAPTURE_FAILED', failure_message: 'declined', supplier_order_id: 'ord_9' }])
            .mockResolvedValueOnce([]);

        expect(await repo.findBySession(SESSION)).toEqual({
            sessionId:       SESSION,
            userId:          'u-1',
            provider:        'duffel',
            status:          'PAYMENT_PENDING',
            paymentIntentId: 'pi_1',
            captureMethod:   'manual',
            createdAt:       ROW.created_at,
            updatedAt:       ROW.updated_at,
            failureCode:     'CAPTURE_FAILED',
            failureMessage:  'declined',
            supplierOrderId: 'ord_9',
        });
        expect(await repo.findByPaymentIntent('pi_nope')).toBeNull();
    });

    it('reads failure detail and the order from the latest event that recorded them', async () => {
        db.$queryRawUnsafe.mockResolvedValueOnce([ROW]);
        await repo.findBySession(SESSION);
        const statement = db.$queryRawUnsafe.mock.calls[0][0] as string;
        expect(statement).toMatch(/LATERAL/);
        expect(statement).toMatch(/'failureCode'/);
        expect(statement).toMatch(/'supplierOrderId'/);
        expect(statement).toMatch(/ORDER BY e\.created_at DESC, e\.id DESC/);
    });

    it('drops a row whose status it does not recognise rather than guessing', async () => {
        db.$queryRawUnsafe.mockResolvedValueOnce([{ ...ROW, lifecycle_status: 'processing' }]);
        expect(await repo.findBySession(SESSION)).toBeNull();
    });

    it('returns null, never throws, when the column is missing', async () => {
        db.$queryRawUnsafe.mockRejectedValue(MISSING_COLUMN);
        expect(await repo.findBySession(SESSION)).toBeNull();
        expect(await repo.findByPaymentIntent('pi_1')).toBeNull();
    });

    it('warns once, not per call, while the migration is missing, and names it', async () => {
        db.$queryRawUnsafe.mockRejectedValue(MISSING_COLUMN);
        db.$queryRaw.mockRejectedValue(MISSING_TABLE);
        await repo.findBySession(SESSION);
        await repo.findByPaymentIntent('pi_1');
        await repo.transition(SESSION, 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', { actor: 'webhook' });

        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(vi.mocked(console.warn).mock.calls[0][0]).toMatch(/20261016000001_flight_booking_lifecycle/);
        expect(console.error).not.toHaveBeenCalled();
    });

    it('logs any other failure as an error every time', async () => {
        db.$queryRawUnsafe.mockRejectedValue(new Error('connection refused'));
        await repo.findBySession(SESSION);
        await repo.findBySession(SESSION);
        expect(console.error).toHaveBeenCalledTimes(2);
    });

    it('lists the events of an attempt in order', async () => {
        const at = new Date('2026-10-19T00:00:00Z');
        db.$queryRaw.mockResolvedValueOnce([
            { from_status: null, to_status: 'PAYMENT_PENDING', actor: 'browser', reason: 'payment created', payload: null, created_at: at },
        ]);
        expect(await repo.events(SESSION)).toEqual([
            { from: null, to: 'PAYMENT_PENDING', actor: 'browser', reason: 'payment created', payload: null, at },
        ]);
        expect(sql(db.$queryRaw.mock.calls[0])).toMatch(/ORDER BY created_at, id/);
    });
});

describe('the sweeper\'s queries', () => {
    it('only offers what the airline was never asked about', async () => {
        db.$queryRawUnsafe.mockResolvedValueOnce([ROW]);
        const out = await repo.findAbandoned(['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED'], new Date('2026-10-19T00:00:00Z'), 50);

        expect(out).toHaveLength(1);
        const statement = db.$queryRawUnsafe.mock.calls[0][0] as string;
        expect(statement).toMatch(/NOT EXISTS[\s\S]*supplier_booking_attempts/);
        expect(statement).toMatch(/client_reference = s\.id::text/);
    });

    it('only offers sessions the new flow wrote — an automatic-capture payment is never a hold to release', async () => {
        // Between the migration being applied and the new code deploying, old code writes
        // sessions that default to PAYMENT_PENDING. Their PaymentIntents capture automatically.
        db.$queryRawUnsafe.mockResolvedValueOnce([]);
        await repo.findAbandoned(['PAYMENT_PENDING'], new Date());
        const statement = db.$queryRawUnsafe.mock.calls[0][0] as string;
        expect(statement).toMatch(/s\.provider = 'duffel'/);
        expect(statement).toMatch(/s\.capture_method = 'manual'/);
    });

    it('reports attempts stuck where the airline may hold an order', async () => {
        db.$queryRawUnsafe.mockResolvedValueOnce([{ ...ROW, lifecycle_status: 'NEEDS_REVIEW' }]);
        const out = await repo.findNeedingAttention(new Date('2026-10-19T00:00:00Z'));
        expect(out.map((r) => r.status)).toEqual(['NEEDS_REVIEW']);
        expect(db.$queryRawUnsafe.mock.calls[0][0]).toMatch(/'SUPPLIER_BOOKING', 'NEEDS_REVIEW'/);
    });

    it('returns empty lists, never throws, when a read fails', async () => {
        db.$queryRawUnsafe.mockRejectedValue(new Error('boom'));
        db.$queryRaw.mockRejectedValue(new Error('boom'));
        expect(await repo.findAbandoned(['PAYMENT_PENDING'], new Date())).toEqual([]);
        expect(await repo.findNeedingAttention(new Date())).toEqual([]);
        expect(await repo.events(SESSION)).toEqual([]);
    });
});
