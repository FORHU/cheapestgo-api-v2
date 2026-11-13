import { describe, it, expect, vi, beforeEach } from 'vitest';

const { stripeMock, prismaMock } = vi.hoisted(() => ({
    stripeMock: {
        accounts:       { retrieve: vi.fn() },
        paymentIntents: { list: vi.fn() },
    },
    prismaMock: {
        bookings:        { findMany: vi.fn(), count: vi.fn() },
        flight_bookings: { findMany: vi.fn() },
        notifications:   { findMany: vi.fn() },
        $queryRaw:       vi.fn(),
        $queryRawUnsafe: vi.fn(),
    },
}));
vi.mock('@/lib/stripe', () => ({ stripe: stripeMock }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
    findUnrecordedReservations,
    findBookingsMissingBrand,
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
    prismaMock.flight_bookings.findMany.mockResolvedValue([]);
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.$queryRawUnsafe.mockResolvedValue([]);
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

describe('findUnrecordedReservations — every product', () => {
    it('asks Stripe to expand the charge, because the refund flag reads it', async () => {
        // Unexpanded, latest_charge is a bare id and every refunded charge read as owed.
        stripeMock.paymentIntents.list.mockReturnValue(listing());

        await findUnrecordedReservations();

        expect(stripeMock.paymentIntents.list).toHaveBeenCalledWith(
            expect.objectContaining({ expand: ['data.latest_charge'] }),
        );
    });

    it('reports a captured flight charge with no flight_bookings row, keyed on the PaymentIntent', async () => {
        stripeMock.paymentIntents.list.mockReturnValue(listing(
            pi({ id: 'pi_f', metadata: { type: 'flight', bookingSessionId: 'sess_9', passengerEmail: 'p@example.test' } }),
        ));

        const result = await findUnrecordedReservations();

        expect(result.unrecorded).toEqual([expect.objectContaining({
            product: 'flight', paymentIntentId: 'pi_f', hasReference: false,
            holderEmail: 'p@example.test', lookup: { bookingSessionId: 'sess_9' },
        })]);
    });

    it('does not report a flight whose sale row exists', async () => {
        stripeMock.paymentIntents.list.mockReturnValue(listing(pi({ id: 'pi_f', metadata: { type: 'flight_bundle' } })));
        prismaMock.flight_bookings.findMany.mockResolvedValue([{ payment_intent_id: 'pi_f' }]);

        await expect(findUnrecordedReservations()).resolves.toMatchObject({ unrecorded: [] });
    });

    it('matches golf on the PaymentIntent or on the booking id the charge was made for', async () => {
        stripeMock.paymentIntents.list.mockReturnValue(listing(
            pi({ id: 'pi_g1', metadata: { type: 'golf', bookingReference: 'GO-1', golfBookingId: 'gb-1' } }),
            pi({ id: 'pi_g2', metadata: { type: 'golf', bookingReference: 'GO-2', golfBookingId: 'gb-2' } }),
            pi({ id: 'pi_g3', metadata: { type: 'golf', bookingReference: 'GO-3', golfBookingId: 'gb-3' } }),
        ));
        prismaMock.$queryRaw.mockResolvedValue([
            { payment_intent_id: 'pi_g1', id: 'gb-1' },
            { payment_intent_id: null,    id: 'gb-2' },
        ]);

        const result = await findUnrecordedReservations();

        expect(result.unrecorded.map((u) => u.paymentIntentId)).toEqual(['pi_g3']);
        expect(result.unrecorded[0]).toMatchObject({ product: 'golf', lookup: { golfBookingId: 'gb-3' } });
    });

    it('skips a product whose table cannot be read, and says so, rather than reporting all of it', async () => {
        stripeMock.paymentIntents.list.mockReturnValue(listing(pi({ id: 'pi_g', metadata: { type: 'golf' } })));
        prismaMock.$queryRaw.mockRejectedValue(new Error('relation "golf_bookings" does not exist'));

        const result = await findUnrecordedReservations();

        expect(result.unrecorded).toHaveLength(0);
        expect(result.warnings[0]).toMatch(/^golf: could not read/);
    });

    it('still ignores charges from sibling products in the same Stripe account', async () => {
        stripeMock.paymentIntents.list.mockReturnValue(listing(pi({ metadata: { type: 'hotel_cancellation' } })));

        await expect(findUnrecordedReservations()).resolves.toMatchObject({ scanned: 0, unrecorded: [] });
    });

    it('carries the v2 attempt onto a hotel item, since that is what a rebuild starts from', async () => {
        stripeMock.paymentIntents.list.mockReturnValue(listing(pi()));
        prismaMock.$queryRawUnsafe.mockResolvedValue([{
            id: 'h1', booking_reference: 'FORHU-1', user_id: 'u1', status: 'CONFIRMED', provider: 'travelgatex',
            prebook_ref: 'pb', payment_intent_id: 'pi_1', hotel_code: 'H', property_name: 'Hotel Naru', room_name: 'Twin',
            check_in: '2026-12-01', check_out: '2026-12-03', currency: 'PHP', amount_minor: 1250000, draft: {},
            supplier_reference: 'SUP-7', failure_code: null, failure_message: null, created_at: new Date(), updated_at: new Date(),
        }]);

        const result = await findUnrecordedReservations();

        expect(result.unrecorded[0].attempt).toEqual({
            status: 'CONFIRMED', supplierReference: 'SUP-7', checkIn: '2026-12-01', checkOut: '2026-12-03', propertyName: 'Hotel Naru',
        });
    });
});

describe('findBookingsMissingBrand', () => {
    it('lists bookings whose brand write never landed, newest first, with a total', async () => {
        prismaMock.bookings.findMany.mockResolvedValue([
            { booking_id: 'FORHU-2', payment_intent_id: 'pi_2', status: 'confirmed', created_at: new Date('2026-11-01T00:00:00Z') },
        ]);
        prismaMock.bookings.count.mockResolvedValue(7);

        const result = await findBookingsMissingBrand();

        expect(result).toEqual({ total: 7, items: [{
            bookingReference: 'FORHU-2', paymentIntentId: 'pi_2', status: 'confirmed', createdAt: '2026-11-01T00:00:00.000Z',
        }] });
        expect(prismaMock.bookings.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { source_brand: null } }));
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

    it('recognises an announcement by its PaymentIntent, which flight items need', async () => {
        const flight = { bookingReference: '(no reference — pi_f)', hasReference: false, paymentIntentId: 'pi_f' } as any;
        prismaMock.notifications.findMany.mockResolvedValue([{ description: '[flight] … PaymentIntent: pi_f. …' }]);

        await expect(filterAlreadyNotified([flight])).resolves.toHaveLength(0);
    });
});
