// src/__tests__/hotels.service.mockProvider.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config', () => ({ config: { RESEND_API_KEY: '', SITE_URL: 'https://cheapestgo.com' } }));
vi.mock('@/lib/hotels/search', () => ({ runTgxSearch: vi.fn() }));
vi.mock('@/lib/hotels/travelgatex', () => ({ quoteTgx: vi.fn(), bookTgx: vi.fn(), cancelTgx: vi.fn() }));
vi.mock('@/lib/hotels/etgContent', () => ({ ensureEtgContent: vi.fn() }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

vi.mock('@/lib/stripe', () => ({
    stripe: {
        paymentIntents: { create: vi.fn(), retrieve: vi.fn(), capture: vi.fn(), cancel: vi.fn(), update: vi.fn(), search: vi.fn() },
        refunds: { create: vi.fn() },
    },
}));

vi.mock('@/repositories/hotels.repository', () => ({
    HotelsRepository: vi.fn(function (this: any) {
        this.recordSearchDemand   = vi.fn().mockResolvedValue(undefined);
        this.findHotelContent     = vi.fn();
        this.findHotelReviews     = vi.fn().mockResolvedValue(null);
        this.findHotelReviewItems = vi.fn().mockResolvedValue([]);
        this.savePrebookQuote     = vi.fn().mockResolvedValue(undefined);
        this.savePolicySnapshot   = vi.fn().mockResolvedValue(undefined);
        this.findPolicySnapshot   = vi.fn().mockResolvedValue(null);
        this.openRefund           = vi.fn().mockResolvedValue('refund-log-1');
        this.closeRefund          = vi.fn().mockResolvedValue(undefined);
        this.findPrebookQuote     = vi.fn();
    }),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: { bookings: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));

vi.mock('@/middleware/error.middleware', () => ({
    AppError: class AppError extends Error {
        constructor(public status: number, message: string, public code: string, public details?: Record<string, unknown>) {
            super(message);
        }
    },
}));

import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { runTgxSearch } from '@/lib/hotels/search';
import { bookTgx } from '@/lib/hotels/travelgatex';
import { HotelsService } from '@/services/hotels.service';
import { MockHotelProvider } from '@/lib/hotels/providers/mock/MockHotelProvider';

const NOW  = Date.parse('2026-10-14T00:00:00Z');
const STAY = { checkIn: '2026-11-10', checkOut: '2026-11-12' };
const HOTEL = 'MOCK-MNL-001';
const USER = 'user-1';
const PI   = 'pi_mock_1';

let mock: MockHotelProvider;
let service: HotelsService;

beforeEach(() => {
    vi.clearAllMocks();
    mock    = new MockHotelProvider({ now: () => NOW });
    service = new HotelsService(mock);

    vi.mocked(prisma.bookings.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.bookings.create).mockResolvedValue({ id: 'row-1' } as never);
    vi.mocked(prisma.bookings.update).mockResolvedValue({} as never);
});

async function preBook(hotelId = HOTEL, board = 'BB') {
    const rates = await mock.getRates(hotelId, { ...STAY, adults: 2, children: 0 });
    const rate  = rates.find((r) => r.roomName === 'Standard Double Room' && r.boardCode === board)!;
    return service.preBook({ offerId: rate.offerId, roomName: rate.roomName, adults: 2, children: 0, currency: 'USD' });
}

function authorised() {
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
        id: PI, status: 'requires_capture', amount: 26400, currency: 'usd',
        metadata: { userId: USER, bookingReference: 'CG-M0CK01' },
    } as never);
    vi.mocked(stripe.paymentIntents.capture).mockResolvedValue({} as never);
    vi.mocked(stripe.paymentIntents.update).mockResolvedValue({} as never);
}

const confirmParams = (prebookId: string) => ({
    paymentIntentId: PI, userId: USER, prebookId,
    holder: { firstName: 'Juan', lastName: 'dela Cruz', email: 'juan@example.com' },
    guests: [{ firstName: 'Juan', lastName: 'dela Cruz' }, { firstName: 'Maria', lastName: 'dela Cruz' }],
    propertyName: 'Bayside Grand Manila', roomName: 'Standard Double Room',
    checkIn: STAY.checkIn, checkOut: STAY.checkOut, adults: 2, children: 0, currency: 'USD',
});

describe('HotelsService with the mock provider — search and details', () => {
    it('searches the mock, never the supplier', async () => {
        const out: any = await service.search({
            destination: 'Manila', checkIn: STAY.checkIn, checkOut: STAY.checkOut, adults: 2,
        });
        expect(out.data.map((h: any) => h.id)).toContain(HOTEL);
        expect(runTgxSearch).not.toHaveBeenCalled();
    });

    it('serves a property from the provider when the provider owns the content', async () => {
        const out: any = await service.getProperty(HOTEL, { ...STAY, adults: 2, children: 0 });

        expect((service as any).repo.findHotelContent).not.toHaveBeenCalled();
        expect(out.content).toMatchObject({
            hotel_id: HOTEL, name: 'Bayside Grand Manila', city: 'Manila', star_rating: 5,
            check_in_time: '14:00', check_out_time: '12:00',
        });
        expect(out.content.images).toHaveLength(4);
        // per night: BB standard is 240 for two nights
        const standard = out.rooms.find((r: any) => r.name === 'Standard Double Room');
        expect(standard.rates.find((r: any) => r.boardCode === 'BB').price).toBe(120);
        expect(runTgxSearch).not.toHaveBeenCalled();
    });

    it('is a 404 for a hotel the provider does not know', async () => {
        await expect(service.getProperty('MOCK-NOPE', { ...STAY, adults: 2, children: 0 }))
            .rejects.toMatchObject({ status: 404 });
    });
});

describe('HotelsService with the mock provider — prebook', () => {
    it('quotes, records the quote, and answers in the same shape as before', async () => {
        const out: any = await preBook();

        expect(out.success).toBe(true);
        expect(out.data.prebookId.startsWith('MOCK:')).toBe(true);
        expect(out.data.provider).toBe('mock');
        expect(out.data.price).toEqual({ subtotal: 216, taxes: 24, total: 240 });
        expect(out.data.currency).toBe('USD');
        expect(out.data.boardCode).toBe('BB');
        expect(out.data.cancellationPolicies.refundableTag).toBe('RFN');
        expect(out.data.cancellationPolicies.cancelPolicyInfos[0]).toMatchObject({ amount: 0, type: 'AMOUNT' });
        expect(out.data.display).toMatchObject({ currency: 'USD', total: 240, converted: false });

        expect((service as any).repo.savePrebookQuote).toHaveBeenCalledWith(expect.objectContaining({
            prebookId: out.data.prebookId, gross: 240, net: 216, currency: 'USD',
            roomName: 'Standard Double Room', checkIn: STAY.checkIn, checkOut: STAY.checkOut,
        }));
    });

    it('re-prices under price_up, and the recorded quote is the new price', async () => {
        mock.setScenario('price_up');
        const out: any = await preBook();
        expect(out.data.price.total).toBeCloseTo(259.2, 2);
        expect((service as any).repo.savePrebookQuote).toHaveBeenCalledWith(expect.objectContaining({ gross: 259.2 }));
    });

    it('answers 409 UNAVAILABLE when the room has gone', async () => {
        await expect(preBook('MOCK-QA-SOLDOUT')).rejects.toMatchObject({ status: 409, code: 'UNAVAILABLE' });
    });

    it('answers 503 UPSTREAM_UNAVAILABLE when the supplier does not answer', async () => {
        await expect(preBook('MOCK-QA-PBTIMEOUT')).rejects.toMatchObject({ status: 503, code: 'UPSTREAM_UNAVAILABLE' });
    });

    it('answers 400 INVALID_OFFER for another provider\'s reference', async () => {
        await expect(service.preBook({ offerId: 'TGX:d1[b261110[c261112[hKR' }))
            .rejects.toMatchObject({ status: 400, code: 'INVALID_OFFER' });
    });
});

describe('HotelsService with the mock provider — confirm', () => {
    it('books once, captures, records the booking under the mock supplier', async () => {
        authorised();
        const q: any = await preBook();

        const out: any = await service.confirmBooking(confirmParams(q.data.prebookId));

        expect(out.success).toBe(true);
        expect(out.data.bookingId).toBe('CG-M0CK01');
        expect(mock.calls.filter((c) => c.method === 'book')).toHaveLength(1);
        expect(mock.reservations[0]).toMatchObject({ clientRef: 'CG-M0CK01', status: 'OK' });
        // One capture per booking, under a key that is the same for every replay of it.
        expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(
            PI, expect.anything(), { idempotencyKey: 'hotel-capture-CG-M0CK01' },
        );
        expect(prisma.bookings.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ booking_id: 'CG-M0CK01', provider: 'mock', status: 'confirmed' }),
        });
        expect(bookTgx).not.toHaveBeenCalled();
    });

    it('passes both guests to the supplier with the ages it always used', async () => {
        authorised();
        const q: any = await preBook();
        await service.confirmBooking({ ...confirmParams(q.data.prebookId), children: 1, guests: [
            { firstName: 'Juan', lastName: 'dela Cruz' }, { firstName: 'Maria', lastName: 'dela Cruz' }, { firstName: 'Pepe', lastName: 'dela Cruz' },
        ] });

        const booked = mock.calls.find((c) => c.method === 'book')!.input as { guests: Array<{ age: number; type: string }> };
        expect(booked.guests.map((g) => [g.type, g.age])).toEqual([['adult', 30], ['adult', 30], ['child', 10]]);
    });

    it('does not capture or record anything when the supplier refuses', async () => {
        authorised();
        const q: any = await preBook('MOCK-QA-BOOKFAIL');

        const out: any = await service.confirmBooking(confirmParams(q.data.prebookId));

        expect(out).toMatchObject({ success: false, providerConfirmed: false });
        expect(out.error).toMatch(/refused/i);
        expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
        expect(prisma.bookings.create).not.toHaveBeenCalled();
        expect(mock.reservations).toHaveLength(0);
    });

    it('does not book twice for one payment', async () => {
        authorised();
        const q: any = await preBook();
        await service.confirmBooking(confirmParams(q.data.prebookId));

        vi.mocked(prisma.bookings.findFirst).mockResolvedValue({
            booking_id: 'CG-M0CK01', status: 'confirmed', total_price: 264, currency: 'USD',
        } as never);
        const again: any = await service.confirmBooking(confirmParams(q.data.prebookId));

        expect(again.success).toBe(true);
        expect(mock.calls.filter((c) => c.method === 'book')).toHaveLength(1);
    });
});

describe('HotelsService with the mock provider — cancel', () => {
    const row = {
        booking_id: 'CG-M0CK01', user_id: USER, payment_intent_id: PI, status: 'confirmed',
        provider: 'mock', provider_metadata: { hotelCode: HOTEL, supplierRef: 'MOCKSUP-000001' },
        property_name: 'Bayside Grand Manila', total_price: 264, currency: 'USD',
        check_in: new Date('2026-11-10T00:00:00Z'),
    };

    it('cancels at the supplier the booking was made with', async () => {
        authorised();
        const q: any = await preBook();
        await service.confirmBooking(confirmParams(q.data.prebookId));

        vi.mocked(prisma.bookings.findFirst).mockResolvedValue(row as never);
        vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ status: 'requires_capture', amount: 26400 } as never);
        vi.mocked(stripe.paymentIntents.cancel).mockResolvedValue({} as never);

        const out: any = await service.cancelBooking({ bookingRef: 'CG-M0CK01', userId: USER, paymentIntentId: PI });

        expect(out.success).toBe(true);
        expect(mock.reservations[0].status).toBe('CANCELLED');
        expect(prisma.bookings.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { booking_id: 'CG-M0CK01' },
        }));
    });
});

describe('HotelsService with the mock provider — price change since the traveller saw it', () => {
    async function preBookExpecting(expectedTotal: number | undefined, hotelId = HOTEL) {
        const rates = await mock.getRates(hotelId, { ...STAY, adults: 2, children: 0 });
        const rate  = rates.find((r) => r.roomName === 'Standard Double Room' && r.boardCode === 'BB')!;
        return service.preBook({
            offerId: rate.offerId, roomName: rate.roomName, adults: 2, children: 0, currency: 'USD', expectedTotal,
        }) as Promise<any>;
    }

    it('says nothing when the client did not say what it expected', async () => {
        const out = await preBookExpecting(undefined);
        expect(out.data.priceChange).toBeUndefined();
    });

    it('says nothing when the price is what was shown', async () => {
        const out = await preBookExpecting(240);
        expect(out.data.priceChange).toBeUndefined();
    });

    it('reports a rise, with both figures, when the supplier re-priced', async () => {
        mock.setScenario('price_up');
        const out = await preBookExpecting(240);

        expect(out.data.priceChange).toEqual({
            previous: 240, current: 259.2, direction: 'up', currency: 'USD', difference: 19.2,
        });
        // The new price is still the one quoted and recorded: this describes, it does not decide.
        expect(out.data.price.total).toBeCloseTo(259.2, 2);
    });

    it('reports a drop', async () => {
        mock.setScenario('price_down');
        const out = await preBookExpecting(240);
        expect(out.data.priceChange).toMatchObject({ direction: 'down', current: 228 });
    });
});
