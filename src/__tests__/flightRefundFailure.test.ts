import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, notify, markFailed } = vi.hoisted(() => ({
    prismaMock: {
        flight_bookings: { findFirst: vi.fn(), updateMany: vi.fn() },
        notifications:   { findFirst: vi.fn() },
    },
    notify:     vi.fn(),
    markFailed: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/admin/notify', () => ({ createNotification: notify }));
vi.mock('@/lib/refundLog', () => ({ markRefundFailed: markFailed }));

import { settleFailedFlightRefund, REFUND_FAILED_TITLE } from '@/services/flightRefundFailure';

/**
 * A refund Stripe accepts can still fail days later — the card was closed, the bank returned it.
 * The booking had already been written `refunded` and the traveller told so, and nothing noticed
 * the failure: they kept paying for a flight that no longer exists (sandbox run 2026-11-11, BUG-1,
 * reproduced with Stripe's refund-fail card). These are the rules for when Stripe says so.
 */

const refund = (over: Record<string, unknown> = {}) => ({
    id: 're_1', object: 'refund', status: 'failed', amount: 24620, currency: 'usd',
    payment_intent: 'pi_1', failure_reason: 'expired_or_canceled_card', ...over,
}) as any;

const booking = (over: Record<string, unknown> = {}) => ({
    id: 'fb-1', pnr: 'ZN2F7W', status: 'refunded', user_id: 'u-1',
    cancellation_log: [{ at: '2026-11-11T07:47:03Z', oldStatus: 'refund_pending', newStatus: 'refunded', stripeRefundId: 're_1' }],
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.flight_bookings.findFirst.mockResolvedValue(booking());
    prismaMock.flight_bookings.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.notifications.findFirst.mockResolvedValue(null);
});

describe('settleFailedFlightRefund', () => {
    it('takes a refunded booking back to refund_failed, and says why in its log', async () => {
        const out = await settleFailedFlightRefund(refund());

        expect(out).toEqual({ handled: true, bookingId: 'fb-1', status: 'refund_failed' });
        const call = prismaMock.flight_bookings.updateMany.mock.calls[0][0];
        // Guarded on the status it read, so a booking someone has since settled is not overwritten.
        expect(call.where).toEqual({ id: 'fb-1', status: { in: ['refunded', 'refund_pending'] } });
        expect(call.data.status).toBe('refund_failed');
        expect(call.data.cancellation_log.at(-1)).toMatchObject({
            oldStatus: 'refunded', newStatus: 'refund_failed', stripeRefundId: 're_1', failureReason: 'expired_or_canceled_card',
        });
    });

    it('marks the refund record failed, so the back office stops counting it as paid', async () => {
        await settleFailedFlightRefund(refund());

        expect(markFailed).toHaveBeenCalledWith('fb-1', 'pi_1', expect.stringContaining('expired_or_canceled_card'));
    });

    it('tells the team once, naming the booking, the money and that the card cannot be used again', async () => {
        await settleFailedFlightRefund(refund());

        expect(notify).toHaveBeenCalledTimes(1);
        const [title, description] = notify.mock.calls[0];
        expect(title).toBe(REFUND_FAILED_TITLE);
        expect(description).toMatch(/ZN2F7W/);
        expect(description).toMatch(/USD 246\.20/);
        expect(description).toMatch(/re_1/);
        expect(description).toMatch(/another way/i);
    });

    it('does not tell the team twice about the same refund', async () => {
        prismaMock.notifications.findFirst.mockResolvedValue({ id: 'n-1' });

        await settleFailedFlightRefund(refund());

        expect(notify).not.toHaveBeenCalled();
    });

    it('reads a zero-decimal currency without dividing it by a hundred', async () => {
        await settleFailedFlightRefund(refund({ amount: 1_250_000, currency: 'krw' }));

        expect(notify.mock.calls[0][1]).toMatch(/KRW 1,250,000/);
    });

    it('ignores a refund that has not failed', async () => {
        const out = await settleFailedFlightRefund(refund({ status: 'succeeded' }));

        expect(out).toEqual({ handled: false, reason: 'not failed' });
        expect(prismaMock.flight_bookings.updateMany).not.toHaveBeenCalled();
    });

    it('leaves alone a payment no flight booking holds — hotels and golf are not settled here', async () => {
        prismaMock.flight_bookings.findFirst.mockResolvedValue(null);

        const out = await settleFailedFlightRefund(refund());

        expect(out).toEqual({ handled: false, reason: 'no flight booking' });
        expect(notify).not.toHaveBeenCalled();
    });

    it('does not move a booking that is no longer refunded, but still raises the alarm', async () => {
        // Already refund_failed (a repeat delivery), or settled by hand since: the record stays
        // as a person left it. The money is still unreturned, so the team still hears once.
        prismaMock.flight_bookings.findFirst.mockResolvedValue(booking({ status: 'refund_failed' }));

        const out = await settleFailedFlightRefund(refund());

        expect(prismaMock.flight_bookings.updateMany).not.toHaveBeenCalled();
        expect(out).toEqual({ handled: true, bookingId: 'fb-1', status: 'refund_failed' });
        expect(notify).toHaveBeenCalledTimes(1);
    });
});
