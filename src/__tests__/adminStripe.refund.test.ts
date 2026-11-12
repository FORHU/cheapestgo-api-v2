import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `POST /admin/stripe` — the emergency lever (ADR-0004).
 *
 * This is **not** the path support uses. Cancelling goes through the customer's own path, where
 * the policy is applied, the supplier is told and the lifecycle is recorded. This route moves
 * money and nothing else, and it has no button anywhere in the admin. It is kept for the case
 * where the booking record itself is too broken for the normal path to run.
 *
 * It was kept deliberately, so it was also made honest. Three defects are pinned here:
 *
 *  - it looked in `bookings` only, so every flight booking returned 404 and always had;
 *  - it passed no idempotency key, so a retried request could refund twice;
 *  - it wrote no refund record, so money issued here was invisible to the back office.
 *
 * And one behaviour that is deliberately unchanged: it does not cancel with the supplier.
 */

const db = vi.hoisted(() => ({
    hotelFindFirst:  vi.fn(),
    flightFindFirst: vi.fn(),
    hotelUpdateMany: vi.fn(),
    flightUpdateMany: vi.fn(),
}));

const sdk = vi.hoisted(() => ({
    piRetrieve:   vi.fn(),
    piSearch:     vi.fn(),
    refundCreate: vi.fn(),
}));

const refundLog = vi.hoisted(() => ({
    openRefund:   vi.fn().mockResolvedValue('refund-log-1'),
    closeRefund:  vi.fn().mockResolvedValue(undefined),
    recordRefund: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        bookings:        { findFirst: db.hotelFindFirst,  updateMany: db.hotelUpdateMany },
        flight_bookings: { findFirst: db.flightFindFirst, updateMany: db.flightUpdateMany },
    },
}));

vi.mock('@/lib/stripe', () => ({
    getStripe: () => ({
        paymentIntents: { retrieve: sdk.piRetrieve, search: sdk.piSearch },
        refunds:        { create: sdk.refundCreate },
    }),
    stripe: {},
}));

vi.mock('@/lib/refundLog', () => refundLog);

import { adminStripeService } from '@/services/adminStripe.service';

const HOTEL_REF  = 'CG-HOTEL-1';
const FLIGHT_ID  = 'bk-flight-1';
const OWNER      = '22222222-2222-2222-2222-222222222222';
const ADMIN      = { id: 'admin-1', email: 'agent@cheapestgo.com' };

beforeEach(() => {
    vi.clearAllMocks();
    refundLog.openRefund.mockResolvedValue('refund-log-1');
    db.hotelFindFirst.mockResolvedValue(null);
    db.flightFindFirst.mockResolvedValue(null);
    sdk.piRetrieve.mockResolvedValue({ amount: 50_000, latest_charge: { id: 'ch_1', refunded: false } });
    sdk.refundCreate.mockResolvedValue({ id: 're_1', amount: 50_000, currency: 'php', status: 'succeeded' });
});

const aHotel = () => db.hotelFindFirst.mockResolvedValue({
    payment_intent_id: 'pi_1', user_id: OWNER, total_price: 500, currency: 'PHP',
});
const aFlight = () => db.flightFindFirst.mockResolvedValue({
    payment_intent_id: 'pi_2', user_id: OWNER, total_price: 300, payment_currency: 'USD',
});

describe('finding the booking', () => {
    /** The defect. Flights live in `flight_bookings`; this route only ever looked in `bookings`. */
    it('refunds a flight booking instead of reporting it missing', async () => {
        aFlight();

        const result = await adminStripeService.refundBooking(FLIGHT_ID, 'requested_by_customer', ADMIN);

        expect(result.refundId).toBe('re_1');
        expect(sdk.refundCreate).toHaveBeenCalledWith(
            expect.objectContaining({ payment_intent: 'pi_2' }),
            expect.anything(),
        );
    });

    it('still refunds a hotel booking, and does not go looking for a flight', async () => {
        aHotel();

        await adminStripeService.refundBooking(HOTEL_REF, 'requested_by_customer', ADMIN);

        expect(db.flightFindFirst).not.toHaveBeenCalled();
        expect(sdk.refundCreate).toHaveBeenCalledWith(
            expect.objectContaining({ payment_intent: 'pi_1' }),
            expect.anything(),
        );
    });

    it('404s only when neither table has it', async () => {
        await expect(adminStripeService.refundBooking('nope', 'requested_by_customer', ADMIN))
            .rejects.toMatchObject({ statusCode: 404 });
    });

    it('reports an already-refunded charge instead of refunding it twice', async () => {
        aHotel();
        sdk.piRetrieve.mockResolvedValue({ amount: 50_000, latest_charge: { id: 'ch_1', refunded: true } });

        const result = await adminStripeService.refundBooking(HOTEL_REF, 'requested_by_customer', ADMIN);

        expect(result).toMatchObject({ alreadyRefunded: true });
        expect(sdk.refundCreate).not.toHaveBeenCalled();
    });
});

describe('issuing the refund', () => {
    /** Without a key, a retry after a lost response issues a second refund. */
    it('keys the request on the booking and the amount', async () => {
        aHotel();

        await adminStripeService.refundBooking(HOTEL_REF, 'requested_by_customer', ADMIN);

        expect(sdk.refundCreate).toHaveBeenCalledWith(
            expect.anything(),
            { idempotencyKey: `admin-refund-${HOTEL_REF}-50000` },
        );
    });

    it('names the admin on the Stripe refund as well as in our own record', async () => {
        aHotel();

        await adminStripeService.refundBooking(HOTEL_REF, 'duplicate', ADMIN);

        expect(sdk.refundCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({ issuedBy: 'agent@cheapestgo.com', via: 'admin_stripe_route' }),
            }),
            expect.anything(),
        );
        expect(refundLog.openRefund).toHaveBeenCalledWith(expect.objectContaining({
            requestedBy: 'agent@cheapestgo.com',
            userId:      OWNER,
        }));
    });

    /**
     * Nobody consulted the recorded terms to get here, so the record must not imply that anyone
     * did. `admin_override` is the word for a refund that was decided rather than calculated.
     */
    it('records the refund as an override, not as a policy decision', async () => {
        aHotel();

        await adminStripeService.refundBooking(HOTEL_REF, 'requested_by_customer', ADMIN);

        expect(refundLog.openRefund).toHaveBeenCalledWith(expect.objectContaining({
            refundType: 'admin_override',
        }));
    });

    it('closes the record as processed with the amount Stripe actually returned', async () => {
        aHotel();

        await adminStripeService.refundBooking(HOTEL_REF, 'requested_by_customer', ADMIN);

        expect(refundLog.closeRefund).toHaveBeenCalledWith('refund-log-1', expect.objectContaining({
            issued: true, externalRef: 're_1',
        }));
    });

    it('closes the record as failed and rethrows when Stripe refuses', async () => {
        aHotel();
        sdk.refundCreate.mockRejectedValue(new Error('insufficient_funds'));

        await expect(adminStripeService.refundBooking(HOTEL_REF, 'requested_by_customer', ADMIN))
            .rejects.toThrow('insufficient_funds');

        expect(refundLog.closeRefund).toHaveBeenCalledWith('refund-log-1', {
            issued: false, reason: 'insufficient_funds',
        });
    });

    /**
     * The one thing this route must never be mistaken for. It takes money back; it does not tell
     * the hotel, and it does not change the booking. The caller is a human with curl, so the
     * response says so rather than leaving them to infer it.
     */
    it('says in the response that the supplier was not cancelled', async () => {
        aHotel();

        const result = await adminStripeService.refundBooking(HOTEL_REF, 'requested_by_customer', ADMIN);

        expect(result.note).toMatch(/supplier was not cancelled/i);
    });
});

describe('recovering a missing payment intent', () => {
    it('writes a recovered id back to the flight table, not the hotel one', async () => {
        db.flightFindFirst.mockResolvedValue({
            payment_intent_id: null, user_id: OWNER, total_price: 300, payment_currency: 'USD',
        });
        sdk.piSearch.mockResolvedValue({ data: [{ id: 'pi_found' }] });

        await adminStripeService.refundBooking(FLIGHT_ID, 'requested_by_customer', ADMIN);

        expect(db.flightUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: FLIGHT_ID },
            data:  { payment_intent_id: 'pi_found' },
        }));
        expect(db.hotelUpdateMany).not.toHaveBeenCalled();
    });

    it('404s with a message pointing at the dashboard when Stripe has nothing either', async () => {
        db.hotelFindFirst.mockResolvedValue({
            payment_intent_id: null, user_id: OWNER, total_price: 500, currency: 'PHP',
        });
        sdk.piSearch.mockResolvedValue({ data: [] });

        await expect(adminStripeService.refundBooking(HOTEL_REF, 'requested_by_customer', ADMIN))
            .rejects.toMatchObject({ statusCode: 404 });
    });
});
