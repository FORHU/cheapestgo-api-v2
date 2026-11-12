import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ emailFindMany: vi.fn() }));
const repo = vi.hoisted(() => ({ findPaymentSources: vi.fn(), timelineFor: vi.fn(), keysFrom: vi.fn() }));
const pay = vi.hoisted(() => ({ retrieve: vi.fn(), refundList: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: { email_logs: { findMany: db.emailFindMany } } }));
vi.mock('@/lib/stripe', () => ({ stripe: {
    paymentIntents: { retrieve: pay.retrieve },
    refunds:        { list: pay.refundList },
} }));
vi.mock('@/repositories/payments.repository', () => ({ findPaymentSources: repo.findPaymentSources }));
vi.mock('@/repositories/paymentTimeline.repository', () => ({
    keysFrom: repo.keysFrom, timelineFor: repo.timelineFor,
}));

import { PaymentEvidenceService } from '@/services/paymentEvidence.service';

const service = new PaymentEvidenceService();
const at = new Date('2026-10-26T09:14:00Z');

const hotelSource = {
    paymentIntentId: 'pi_1', source: 'hotel_bookings', internalId: 'hb-1', product: 'hotel',
    bookingReference: 'CG-ABC123', bookingStatus: 'CONFIRMED', supplierReference: '31489968',
    provider: 'travelgatex', customerEmail: 'juan@example.com', customerName: 'Juan',
    userId: 'u1', amount: null, currency: 'PHP', createdAt: at,
};

const paymentIntent = {
    id: 'pi_1', status: 'succeeded', amount: 855736, amount_received: 855736,
    currency: 'php', created: 1761468840,
    latest_charge: {
        id: 'ch_1',
        receipt_url: 'https://pay.stripe.com/receipts/x',
        payment_method_details: { card: { brand: 'visa', last4: '4242', three_d_secure: { result: 'authenticated', version: '2.2.0' } } },
    },
};

const find = (items: any[], key: string) => items.find(i => i.key === key);

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    repo.findPaymentSources.mockResolvedValue([hotelSource]);
    repo.keysFrom.mockReturnValue({ hotelBookingIds: ['hb-1'], sessionIds: [], bookingReferences: ['CG-ABC123'] });
    repo.timelineFor.mockResolvedValue([]);
    pay.retrieve.mockResolvedValue(paymentIntent);
    pay.refundList.mockResolvedValue({ data: [] });
    db.emailFindMany.mockResolvedValue([]);
});

/**
 * ADR-0003. The pack is read by a card network, and the platform cannot see a reservation
 * cancelled in the supplier's own dashboard. So no item may claim a service was delivered.
 */
describe('what the pack is allowed to claim', () => {
    it('calls Stripe facts verified, because Stripe answered just now', async () => {
        const pack = await service.gather('pi_1');
        expect(find(pack.items, 'pi_status')?.provenance).toBe('verified');
        expect(find(pack.items, 'pi_status')?.value).toBe('succeeded');
    });

    it('never calls a hotel supplier reference verified, and says why', async () => {
        const pack = await service.gather('pi_1');
        const ref = find(pack.items, 'supplier_ref_hotel_bookings');

        expect(ref?.provenance).toBe('provider_recorded');
        expect(ref?.provenance).not.toBe('verified');
        expect(ref?.note).toMatch(/no booking-read/i);
    });

    it('labels our own booking status as internal, not as confirmation', async () => {
        const pack = await service.gather('pi_1');
        const ours = find(pack.items, 'status_hotel_bookings');

        expect(ours?.provenance).toBe('internal');
        expect(ours?.note).toMatch(/not of what the supplier did/i);
    });

    it('states the hotel re-check limitation on the pack itself', async () => {
        const pack = await service.gather('pi_1');
        expect(pack.limitations.join(' ')).toMatch(/TravelgateX/);
    });
});

describe('money and card details', () => {
    it('formats minor units without arithmetic that could drift', async () => {
        const pack = await service.gather('pi_1');
        expect(find(pack.items, 'pi_amount')?.value).toBe('8557.36 PHP');
        expect(find(pack.items, 'pi_captured')?.value).toBe('8557.36 PHP');
    });

    /** §14: never the full number, never the CVV. Brand and last four is the whole allowance. */
    it('carries only the brand and last four of the card', async () => {
        const pack = await service.gather('pi_1');
        const card = find(pack.items, 'card');
        expect(card?.value).toBe('visa ···· 4242');
        expect(JSON.stringify(pack)).not.toMatch(/cvv|cvc/i);
    });

    it('records a 3D Secure result when the card carried one', async () => {
        const pack = await service.gather('pi_1');
        expect(find(pack.items, '3ds')?.value).toBe('authenticated (v2.2.0)');
    });

    it('says the card was never captured rather than omitting the charge', async () => {
        pay.retrieve.mockResolvedValue({ ...paymentIntent, latest_charge: null });
        const pack = await service.gather('pi_1');
        const charge = find(pack.items, 'charge_id');
        expect(charge?.provenance).toBe('unavailable');
        expect(charge?.note).toMatch(/never captured/i);
    });
});

describe('when a source cannot be reached', () => {
    /**
     * A thin pack must never read as "there was no payment". The absence is recorded as an
     * absence, with the reason.
     */
    it('records a Stripe outage as unavailable rather than returning nothing', async () => {
        pay.retrieve.mockRejectedValue(new Error('connection reset'));
        const pack = await service.gather('pi_1');

        const stripeItem = find(pack.items, 'stripe');
        expect(stripeItem?.provenance).toBe('unavailable');
        expect(stripeItem?.note).toMatch(/connection reset/);
        // The rest of the pack still arrives.
        expect(find(pack.items, 'supplier_ref_hotel_bookings')).toBeDefined();
    });

    it('says no email was logged rather than leaving the section empty', async () => {
        const pack = await service.gather('pi_1');
        const email = find(pack.items, 'email');
        expect(email?.provenance).toBe('unavailable');
        expect(email?.note).toMatch(/no email was logged/i);
    });
});

/**
 * ADR-0026's Unrecorded Reservation: money taken for a booking nobody wrote down. The pack has
 * to name it, because a reader seeing only Stripe facts would otherwise assume a clerical gap.
 */
describe('a payment with no internal record at all', () => {
    it('states plainly that nothing here references the payment', async () => {
        repo.findPaymentSources.mockResolvedValue([]);
        repo.keysFrom.mockReturnValue({ hotelBookingIds: [], sessionIds: [], bookingReferences: [] });

        const pack = await service.gather('pi_orphan');

        expect(pack.sources).toEqual([]);
        expect(pack.limitations.join(' ')).toMatch(/never written down/i);
        // Stripe still answers, so the money is still evidenced.
        expect(find(pack.items, 'pi_status')?.provenance).toBe('verified');
    });
});


// ─── Refunds, read from Stripe ───────────────────────────────────────────────
//
// ADR-0004. "Where is the money" could not be answered from our own tables: `refund_logs` was
// written by one of the four paths that move money, and by none of the refunds issued by hand in
// the Stripe dashboard, which is how most of them have been issued. Stripe knows about all of
// them, so the pack asks Stripe.

describe('where the money actually is', () => {
    const refund = (over: Record<string, unknown> = {}) => ({
        id: 're_1', amount: 855736, currency: 'php', status: 'succeeded', created: 1761472440, ...over,
    });

    it('says plainly that there is no refund, rather than leaving the question open', async () => {
        const pack = await service.gather('pi_1');

        const item = find(pack.items, 'refunds');
        expect(item?.value).toBe('None');
        expect(item?.provenance).toBe('verified');
    });

    it('reads refunds from Stripe, not from our own tables', async () => {
        pay.refundList.mockResolvedValue({ data: [refund()] });

        const pack = await service.gather('pi_1');

        expect(pay.refundList).toHaveBeenCalledWith({ payment_intent: 'pi_1', limit: 100 });
        expect(find(pack.items, 're_re_1'.replace('re_re', 'refund_re'))?.value).toContain('8557.36 PHP');
    });

    /**
     * The distinction the customer is actually asking about. A refund reads `pending` until the
     * card network completes it, which takes days, and during those days nothing has reached
     * their statement. Flattening that to "refunded" is how support ends up promising a payment
     * that has not happened.
     */
    it('does not let a pending refund read as money the customer has', async () => {
        pay.refundList.mockResolvedValue({ data: [refund({ status: 'pending' })] });

        const pack = await service.gather('pi_1');

        const item = find(pack.items, 'refund_re_1');
        expect(item?.value).toContain('pending');
        expect(item?.note).toMatch(/not yet settled/i);
    });

    it('says outright that the customer has not been paid when a refund failed', async () => {
        pay.refundList.mockResolvedValue({
            data: [refund({ status: 'failed', failure_reason: 'expired_or_canceled_card' })],
        });

        const pack = await service.gather('pi_1');

        const item = find(pack.items, 'refund_re_1');
        expect(item?.note).toContain('expired_or_canceled_card');
        expect(item?.note).toMatch(/NOT been paid/);
    });

    /** Partial refunds stack. The total is the question behind the question. */
    it('totals only the refunds Stripe reports as succeeded', async () => {
        pay.refundList.mockResolvedValue({
            data: [
                refund({ id: 're_a', amount: 500000, status: 'succeeded' }),
                refund({ id: 're_b', amount: 355736, status: 'pending' }),
            ],
        });

        const pack = await service.gather('pi_1');

        const total = find(pack.items, 'refund_total');
        expect(total?.value).toBe('5000.00 PHP');
        expect(total?.note).toMatch(/1 refund\(s\) Stripe reports as succeeded, of 2 issued/);
    });

    it('numbers several refunds so the order the money moved is readable', async () => {
        pay.refundList.mockResolvedValue({
            data: [
                refund({ id: 're_late', created: 1761472440 }),
                refund({ id: 're_early', created: 1761468900 }),
            ],
        });

        const pack = await service.gather('pi_1');

        expect(find(pack.items, 'refund_re_early')?.label).toBe('Refund 1 of 2');
        expect(find(pack.items, 'refund_re_late')?.label).toBe('Refund 2 of 2');
    });

    /** A Stripe outage must degrade the pack, not empty it (ADR-0003). */
    it('records a Stripe outage instead of reporting no refunds', async () => {
        pay.retrieve.mockRejectedValue(new Error('503 Service Unavailable'));

        const pack = await service.gather('pi_1');

        expect(find(pack.items, 'stripe')?.provenance).toBe('unavailable');
        expect(find(pack.items, 'refunds')).toBeUndefined();
        expect(pack.items.length).toBeGreaterThan(1);
    });
});

