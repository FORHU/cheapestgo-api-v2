import { describe, it, expect, vi, beforeEach } from 'vitest';

const { stripeMock, prismaMock, lockFxMock } = vi.hoisted(() => ({
    stripeMock: {
        accounts:       { retrieve: vi.fn() },
        paymentIntents: { retrieve: vi.fn(), list: vi.fn() },
    },
    prismaMock: {
        bookings: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    },
    lockFxMock: vi.fn(),
}));
vi.mock('@/lib/stripe', () => ({ stripe: stripeMock }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/payments/fxLock', () => ({ lockFx: lockFxMock }));

import { BookingRebuildService, type RebuildInput } from '@/services/bookingRebuild.service';

/**
 * The rebuild writes the booking an Unrecorded Reservation is missing. What matters: it only
 * ever records the money that actually moved, it refuses anything that is not a paid hotel
 * charge with no row, and it fills in what the v2 attempt already knows so the admin is left
 * checking, not retyping.
 */

const pi = (over: Record<string, any> = {}) => ({
    id: 'pi_1', status: 'succeeded', amount: 1_250_000, currency: 'krw', created: 1_790_000_000,
    description: 'CG: Hotel Naru — Deluxe Twin',
    metadata: { type: 'hotel', bookingReference: 'FORHU-1', userId: 'u-1', holderEmail: 'ana@example.test' },
    latest_charge: { amount_refunded: 0 },
    ...over,
});

const attempt = {
    id: 'h1', reference: 'FORHU-1', userId: 'u-1', status: 'CONFIRMED', provider: 'travelgatex', prebookRef: 'pb',
    paymentIntentId: 'pi_1', hotelCode: 'HC-9', propertyName: 'Hotel Naru', roomName: 'Deluxe Twin',
    checkIn: '2026-12-01', checkOut: '2026-12-03', currency: 'KRW', amountMinor: 1_250_000,
    draft: { adults: 2, children: 1, board: 'BB', cancellationPolicies: { refundableTag: 'NRFN' } },
    supplierReference: 'SUP-7', failureCode: null, failureMessage: null, createdAt: new Date(), updatedAt: new Date(),
};

const input: RebuildInput = {
    propertyName: 'Hotel Naru', roomName: 'Deluxe Twin', checkIn: '2026-12-01', checkOut: '2026-12-03',
    adults: 2, children: 1, holderFirstName: 'Ana', holderLastName: 'Reyes', holderEmail: 'ana@example.test',
    supplierReference: 'SUP-7', status: 'confirmed', reason: 'Supplier dashboard shows SUP-7 confirmed.',
};

let lifecycle: any;
let hotels: any;
let service: BookingRebuildService;

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STRIPE_EXPECTED_ACCOUNT;
    stripeMock.accounts.retrieve.mockResolvedValue({ id: 'acct_live' });
    stripeMock.paymentIntents.retrieve.mockResolvedValue(pi());
    prismaMock.bookings.findFirst.mockResolvedValue(null);
    prismaMock.bookings.create.mockResolvedValue({ id: 'row-1' });
    prismaMock.bookings.update.mockResolvedValue({});
    lockFxMock.mockResolvedValue({ usd_amount: 900, fx_rate: 0.00072, fx_captured_at: new Date(), fx_source: 'live' });
    lifecycle = {
        findByReference:     vi.fn().mockResolvedValue(attempt),
        findByPaymentIntent: vi.fn().mockResolvedValue(null),
        loadGuests:          vi.fn().mockResolvedValue([{ kind: 'holder', firstName: 'Ana', lastName: 'Reyes', email: 'ana@example.test' }]),
        note:                vi.fn().mockResolvedValue(undefined),
    };
    hotels = { savePolicySnapshot: vi.fn().mockResolvedValue({}) };
    service = new BookingRebuildService(lifecycle, hotels);
});

describe('draft', () => {
    it('pre-fills from the v2 attempt and says where each field came from', async () => {
        const draft = await service.draft('pi_1');

        expect(draft).toMatchObject({
            bookingReference: 'FORHU-1', userId: 'u-1', currency: 'KRW', suggestedStatus: 'confirmed',
            attempt: { status: 'CONFIRMED', reference: 'FORHU-1' }, hasCancellationTerms: true,
            fields: { checkIn: '2026-12-01', checkOut: '2026-12-03', adults: 2, children: 1, supplierReference: 'SUP-7', holderLastName: 'Reyes' },
        });
        expect(draft.provenance).toMatchObject({ checkIn: 'attempt', supplierReference: 'attempt', holderEmail: 'attempt' });
    });

    it('reads a zero-decimal amount without dividing it by a hundred', async () => {
        // ₩1,250,000 recorded as ₩12,500 is the v1 refund bug this codebase already paid for once.
        await expect(service.draft('pi_1')).resolves.toMatchObject({ amount: '1250000' });
    });

    it('falls back to Stripe, and marks the gaps, when there is no attempt', async () => {
        lifecycle.findByReference.mockResolvedValue(null);

        const draft = await service.draft('pi_1');

        expect(draft.fields).toMatchObject({ propertyName: 'Hotel Naru', roomName: 'Deluxe Twin', holderEmail: 'ana@example.test', checkIn: '' });
        expect(draft.provenance).toMatchObject({ propertyName: 'stripe', holderEmail: 'stripe', checkIn: 'missing', supplierReference: 'missing' });
        expect(draft.hasCancellationTerms).toBe(false);
    });

    it('suggests the refunded end state for a charge Stripe has fully refunded', async () => {
        stripeMock.paymentIntents.retrieve.mockResolvedValue(pi({ latest_charge: { amount_refunded: 1_250_000 } }));

        await expect(service.draft('pi_1')).resolves.toMatchObject({ suggestedStatus: 'refunded', amountRefunded: '1250000' });
    });

    it.each([
        ['a flight charge',            pi({ metadata: { type: 'flight', userId: 'u-1' } }), 'NOT_HOTEL'],
        ['a held, uncaptured charge',  pi({ status: 'requires_capture' }),                  'NOT_PAID'],
        ['a charge with no reference', pi({ metadata: { type: 'hotel', userId: 'u-1' } }),  'NOT_ATTRIBUTABLE'],
    ])('refuses %s', async (_label, intent, code) => {
        stripeMock.paymentIntents.retrieve.mockResolvedValue(intent);

        await expect(service.draft('pi_1')).rejects.toMatchObject({ code });
    });

    it('refuses once a booking already records the payment', async () => {
        prismaMock.bookings.findFirst.mockResolvedValue({ booking_id: 'FORHU-1' });

        await expect(service.draft('pi_1')).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_RECORDED' });
    });

    it('refuses when the Stripe key belongs to another environment', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_expected';

        await expect(service.draft('pi_1')).rejects.toMatchObject({ code: 'STRIPE_ACCOUNT_MISMATCH' });
        expect(stripeMock.paymentIntents.retrieve).not.toHaveBeenCalled();
    });
});

describe('rebuild', () => {
    it('writes the money, customer and reference from Stripe, never from the form', async () => {
        await service.rebuild('pi_1', input, { id: 'admin-1', email: 'ops@example.test' });

        const data = prismaMock.bookings.create.mock.calls[0][0].data;
        expect(data).toMatchObject({
            booking_id: 'FORHU-1', booking_reference: 'FORHU-1', user_id: 'u-1', payment_intent_id: 'pi_1',
            total_price: 1_250_000, charged_price: 1_250_000, currency: 'KRW', status: 'confirmed',
            check_in: new Date('2026-12-01'), guests_adults: 2, guests_children: 1, hotel_id: 'HC-9',
            policy_type: 'non_refundable', created_at: new Date(1_790_000_000 * 1000), source_brand: null,
        });
        expect(data.provider_metadata).toMatchObject({
            supplierRef: 'SUP-7', board: 'BB',
            rebuilt: { from: 'reconciliation', by: 'ops@example.test', reason: input.reason },
        });
    });

    it('records FX, the cancellation terms and a lifecycle note beside the booking', async () => {
        await service.rebuild('pi_1', input, { email: 'ops@example.test' });

        expect(prismaMock.bookings.update).toHaveBeenCalledWith(expect.objectContaining({ where: { booking_id: 'FORHU-1' } }));
        expect(hotels.savePolicySnapshot).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'FORHU-1', policyType: 'non_refundable' }));
        expect(lifecycle.note).toHaveBeenCalledWith('FORHU-1', 'admin', expect.stringContaining('rebuilt'), expect.any(Object));
    });

    it('keeps the booking when the FX lock fails', async () => {
        lockFxMock.mockRejectedValue(new Error('rates down'));

        await expect(service.rebuild('pi_1', input, {})).resolves.toEqual({ bookingId: 'FORHU-1', id: 'row-1' });
    });

    it('re-checks at the write: a row written since the form opened wins', async () => {
        prismaMock.bookings.findFirst.mockResolvedValue({ booking_id: 'FORHU-1' });

        await expect(service.rebuild('pi_1', input, {})).rejects.toMatchObject({ code: 'ALREADY_RECORDED' });
        expect(prismaMock.bookings.create).not.toHaveBeenCalled();
    });

    it('turns a lost insert race into the same answer', async () => {
        prismaMock.bookings.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

        await expect(service.rebuild('pi_1', input, {})).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_RECORDED' });
    });

    it('rejects a stay that ends before it starts', async () => {
        await expect(service.rebuild('pi_1', { ...input, checkOut: '2026-12-01' }, {}))
            .rejects.toMatchObject({ statusCode: 400 });
    });
});
