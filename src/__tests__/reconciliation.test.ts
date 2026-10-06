import { describe, it, expect, vi, beforeEach } from 'vitest';

const { stripeMock, prismaMock } = vi.hoisted(() => ({
    stripeMock: {
        accounts:       { retrieve: vi.fn() },
        paymentIntents: { list: vi.fn() },
    },
    prismaMock: {
        bookings:      { findMany: vi.fn() },
        notifications: { findMany: vi.fn() },
    },
}));
vi.mock('@/lib/stripe', () => ({ stripe: stripeMock }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
    findUnrecordedReservations,
    filterAlreadyNotified,
    assertStripeAccount,
    UNRECORDED_NOTIFICATION_TITLE,
} from '@/lib/admin/reconciliation';

/**
 * An Unrecorded Reservation is a stay someone paid for that this system has no row for — they
 * are holding a room we cannot show them or cancel. What matters here is that the job finds a
 * real one, and that it does not cry wolf: the first run produced seven false positives
 * against one real finding, which is the alert fatigue the whole design exists to avoid.
 */

const pi = (over: Record<string, any> = {}) => ({
    id: 'pi_1', status: 'succeeded', amount: 12_500_00, currency: 'php', created: 1_780_000_000,
    description: 'Hotel Naru — Deluxe Twin',
    metadata: { type: 'hotel', bookingReference: 'FORHU-1', holderEmail: 'ana@example.test', brand: 'CheapestGo' },
    latest_charge: null,
    ...over,
});

const listing = (...items: any[]) => ({ [Symbol.asyncIterator]: async function* () { yield* items; } });

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STRIPE_EXPECTED_ACCOUNT;
    stripeMock.accounts.retrieve.mockResolvedValue({ id: 'acct_live' });
    prismaMock.bookings.findMany.mockResolvedValue([]);
    prismaMock.notifications.findMany.mockResolvedValue([]);
});

describe('assertStripeAccount', () => {
    it('refuses when the key belongs to a different account than the deployment expects', async () => {
        // The compose file points the container at live RDS while leaving test Stripe keys in
        // place — scanning there reports every test intent as unrecorded and hides the real one.
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_expected';

        const result = await assertStripeAccount();

        expect(result.ok).toBe(false);
        expect((result as any).reason).toContain('acct_live');
    });

    it('is unenforced when no account is named, which is right for local work', async () => {
        await expect(assertStripeAccount()).resolves.toMatchObject({ ok: true, account: 'acct_live' });
    });
});

describe('findUnrecordedReservations', () => {
    it('reports a paid hotel charge with no booking row', async () => {
        stripeMock.paymentIntents.list.mockReturnValue(listing(pi()));

        const result = await findUnrecordedReservations();

        expect(result.ok).toBe(true);
        expect(result.unrecorded).toHaveLength(1);
        expect(result.unrecorded[0]).toMatchObject({ bookingReference: 'FORHU-1', paymentIntentId: 'pi_1' });
    });

    it('does not report a charge whose booking exists', async () => {
        stripeMock.paymentIntents.list.mockReturnValue(listing(pi()));
        prismaMock.bookings.findMany.mockResolvedValue([{ booking_id: 'FORHU-1', payment_intent_id: null }]);

        const result = await findUnrecordedReservations();

        expect(result.unrecorded).toHaveLength(0);
    });

    it('matches on payment_intent_id too, for charges taken before references existed', async () => {
        // Matching on the reference alone is what produced seven false positives.
        stripeMock.paymentIntents.list.mockReturnValue(listing(pi({ metadata: { type: 'hotel' } })));
        prismaMock.bookings.findMany.mockResolvedValue([{ booking_id: 'OLD-1', payment_intent_id: 'pi_1' }]);

        const result = await findUnrecordedReservations();

        expect(result.unrecorded).toHaveLength(0);
    });

    it('ignores charges that are not this platform’s hotel sales', async () => {
        // Sibling FORHU products settle into the same Stripe account.
        stripeMock.paymentIntents.list.mockReturnValue(listing(
            pi({ id: 'pi_other', metadata: { type: 'something_else' } }),
            pi({ id: 'pi_pending', status: 'requires_payment_method' }),
        ));

        const result = await findUnrecordedReservations();

        expect(result.scanned).toBe(0);
        expect(result.unrecorded).toHaveLength(0);
    });

    it('marks a refunded charge as such rather than hiding it', async () => {
        // Still unrecorded — still worth knowing about — but no longer money owed.
        stripeMock.paymentIntents.list.mockReturnValue(listing(
            pi({ latest_charge: { amount_refunded: 12_500_00 } }),
        ));

        const result = await findUnrecordedReservations();

        expect(result.unrecorded[0].refunded).toBe(true);
    });

    it('refuses rather than reporting nothing when the environments do not match', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_expected';

        const result = await findUnrecordedReservations();

        expect(result.ok).toBe(false);
        expect(result.refusedReason).toBeTruthy();
        expect(stripeMock.paymentIntents.list).not.toHaveBeenCalled();
    });
});

describe('filterAlreadyNotified', () => {
    const item = { bookingReference: 'FORHU-1', paymentIntentId: 'pi_1' } as any;

    it('drops one that has already been announced', async () => {
        prismaMock.notifications.findMany.mockResolvedValue([
            { description: 'FORHU-1 — PHP 12,500 charged 2026-05-28 …' },
        ]);

        await expect(filterAlreadyNotified([item])).resolves.toHaveLength(0);
        expect(prismaMock.notifications.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { title: UNRECORDED_NOTIFICATION_TITLE } }),
        );
    });

    it('keeps one nobody has been told about', async () => {
        prismaMock.notifications.findMany.mockResolvedValue([{ description: 'FORHU-99 — …' }]);

        await expect(filterAlreadyNotified([item])).resolves.toHaveLength(1);
    });
});
