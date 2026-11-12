import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The shared refund record (ADR-0004).
 *
 * Before this existed only a customer's hotel cancellation wrote anything down. Flights kept a
 * JSON blob on the booking row, golf kept nothing, and the admin route kept nothing — so three of
 * the four ways money leaves the business were invisible to the back office built to find them.
 *
 * What these tests hold onto: a refund that cannot be logged is still issued, who asked is
 * recorded when a human did, and a refund that failed is never written down as processed.
 */

const db = vi.hoisted(() => ({
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        refund_logs: { create: db.create, update: db.update },
        booking_policy_snapshots: { findUnique: db.findUnique },
    },
}));

import { openRefund, closeRefund, recordRefund } from '@/lib/refundLog';

const base = {
    bookingId:       'CG-ABC123',
    userId:          '11111111-1111-1111-1111-111111111111',
    refundType:      'partial_refund',
    requestedAmount: 750,
    penaltyAmount:   250,
    currency:        'PHP',
    reason:          'cancelled by the customer',
};

beforeEach(() => {
    vi.clearAllMocks();
    db.create.mockResolvedValue({ id: 'refund-log-1' });
    db.update.mockResolvedValue({});
    db.findUnique.mockResolvedValue({ id: 'snapshot-1' });
});

describe('opening a refund', () => {
    it('names the product, so a reader knows which table the booking id points into', async () => {
        await openRefund({ ...base, product: 'flight' });

        expect(db.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status_reason: '[flight] cancelled by the customer' }),
        }));
    });

    /**
     * The difference between a customer exercising their rights and a member of staff making a
     * decision. Without it, every refund looks like the former.
     */
    it('records the admin who asked, and leaves it null when the customer did', async () => {
        await openRefund({ ...base, product: 'hotel', requestedBy: 'agent@cheapestgo.com' });
        expect(db.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ processed_by: 'agent@cheapestgo.com' }),
        }));

        db.create.mockClear();
        await openRefund({ ...base, product: 'hotel' });
        expect(db.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ processed_by: null }),
        }));
    });

    /** Only hotels have recorded terms to judge against; claiming otherwise would be a lie. */
    it('looks for a policy snapshot for a hotel and not for the others', async () => {
        await openRefund({ ...base, product: 'hotel' });
        expect(db.findUnique).toHaveBeenCalled();

        db.findUnique.mockClear();
        await openRefund({ ...base, product: 'golf' });
        expect(db.findUnique).not.toHaveBeenCalled();
        expect(db.create).toHaveBeenLastCalledWith(expect.objectContaining({
            data: expect.objectContaining({ policy_snapshot_id: null }),
        }));
    });

    /**
     * The audit trail being unavailable must not stop a customer getting their money. The caller
     * sees null and carries on; the failure is on the console, not in the customer's way.
     */
    it('returns null instead of throwing when the row cannot be written', async () => {
        db.create.mockRejectedValue(new Error('deadlock detected'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(openRefund({ ...base, product: 'hotel' })).resolves.toBeNull();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('truncates a reason too long for the column rather than failing the write', async () => {
        await openRefund({ ...base, product: 'hotel', reason: 'x'.repeat(900) });

        const written = db.create.mock.calls[0][0].data.status_reason;
        expect(written.length).toBe(500);
    });
});

describe('closing a refund', () => {
    it('marks it processed with the amount that actually came back', async () => {
        await closeRefund('refund-log-1', { issued: true, approvedAmount: 750, externalRef: 're_123' });

        expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'refund-log-1' },
            data: expect.objectContaining({
                status: 'processed', approved_amount: 750, external_ref: 're_123',
            }),
        }));
    });

    /**
     * v1 marked the row `processed` with the full amount approved whether or not Stripe had
     * refunded anything, so the booking and the log disagreed about the one fact the log exists
     * to record. `failed` is the point of this function.
     */
    it('marks it failed when no refund was issued, and never approves an amount', async () => {
        await closeRefund('refund-log-1', { issued: false, reason: 'card_declined' });

        const data = db.update.mock.calls[0][0].data;
        expect(data.status).toBe('failed');
        expect(data.status_reason).toBe('card_declined');
        expect(data).not.toHaveProperty('approved_amount');
    });

    /** Stripe has already done whatever it did; a log that will not close does not undo it. */
    it('swallows a failure to close, because the money has already moved', async () => {
        db.update.mockRejectedValue(new Error('connection reset'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(closeRefund('refund-log-1', { issued: true, approvedAmount: 1, externalRef: 're_1' }))
            .resolves.toBeUndefined();
        spy.mockRestore();
    });
});

describe('recording a settled refund in one call', () => {
    it('opens and closes together', async () => {
        await recordRefund({ ...base, product: 'flight' }, { issued: true, approvedAmount: 750, externalRef: 're_9' });

        expect(db.create).toHaveBeenCalledTimes(1);
        expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ external_ref: 're_9' }),
        }));
    });

    it('does not try to close a row that was never opened', async () => {
        db.create.mockRejectedValue(new Error('nope'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await recordRefund({ ...base, product: 'golf' }, { issued: true, approvedAmount: 1, externalRef: 're_1' });

        expect(db.update).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
