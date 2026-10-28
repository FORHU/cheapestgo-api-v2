// src/__tests__/hotelProvider.contract.test.ts
import { describe, it, expect, vi } from 'vitest';

// A fake TravelgateX world, so the real adapter can be held to the same contract as the mock.
const world = vi.hoisted(() => {
    const TOKEN = 'd10000352[b261110[c261112[hKR';
    const gross = 220;
    const option = (suffix: string) => ({
        offerId: `TGX:${TOKEN}-${suffix}`, roomName: 'Deluxe Room', roomCode: 'DBL', boardCode: 'BB',
        price: gross, net: 200, gross, currency: 'USD', refundable: true, refundableTag: 'RFN',
        cancelPolicy: { refundable: true, cancelPenalties: [{ deadline: '2026-11-07T10:00:00Z', hoursBefore: 72, penaltyType: 'AMOUNT', currency: 'USD', value: 110 }] },
        rates: [{ _tgx: { id: `id-${suffix}`, token: `native-${suffix}` } }],
    });
    return { TOKEN, gross, option };
});

vi.mock('@/lib/hotels/search', () => ({
    runTgxSearch: vi.fn(async (p: { hotelCode?: string }) => p.hotelCode
        ? { data: [{ roomTypes: [world.option('a'), world.option('b')] }] }
        : {
            data: [{
                hotelId: '10000352', id: '10000352', name: 'The Grand', price: world.gross / 2, currency: 'USD',
                offerId: `TGX:${world.TOKEN}-a`, roomTypes: [world.option('a')],
            }],
            totalCount: 1,
        }),
}));

vi.mock('@/lib/hotels/travelgatex', () => ({
    quoteTgx: vi.fn(async () => ({
        optionRefId: 'book-token', hotelCode: '10000352', boardCode: 'BB', paymentType: 'MERCHANT', status: 'OK',
        price: { net: 200, gross: 220, currency: 'USD' }, surcharges: [],
        rooms: [{ code: 'DBL', description: 'Deluxe Room', occupancyRefId: 1 }],
        cancelPolicy: { refundable: true, cancelPenalties: [] },
    })),
    bookTgx: vi.fn(async (i: { clientReference: string }) => ({
        status: 'OK', supplierRef: 'SUP-1', clientRef: i.clientReference, hotelCode: '10000352', hotelName: 'The Grand',
        price: { net: 200, gross: 220, currency: 'USD' }, cancelPolicy: { refundable: true, cancelPenalties: [] },
    })),
    cancelTgx: vi.fn(async (i: { clientReference?: string }) => ({
        status: 'CANCELLED', supplierRef: 'SUP-1', clientRef: i.clientReference, refundAmount: 220, currency: 'USD',
    })),
}));

import { MockHotelProvider } from '@/lib/hotels/providers/mock/MockHotelProvider';
import { TravelgateXProvider } from '@/lib/hotels/providers/travelgatex.provider';
import { HotelProviderError, type HotelProvider } from '@/lib/hotels/providers/types';
import { nightsBetween } from '@/lib/hotels/nights';

interface Fixture {
    name:        string;
    make:        () => HotelProvider;
    hotelId:     string;
    cityName:    string;
    foreignRef:  string;
}

const STAY = { checkIn: '2026-11-10', checkOut: '2026-11-12', adults: 2, children: 0 };

const FIXTURES: Fixture[] = [
    {
        name: 'MockHotelProvider',
        make: () => new MockHotelProvider({ now: () => Date.parse('2026-10-14T00:00:00Z') }),
        hotelId: 'MOCK-MNL-001', cityName: 'Manila', foreignRef: 'TGX:d1[b261110[c261112[hKR',
    },
    {
        name: 'TravelgateXProvider',
        make: () => new TravelgateXProvider({ propagationDelayMs: 0, retryDelayMs: 0 }),
        hotelId: '10000352', cityName: 'Bangkok', foreignRef: 'MOCK:abc',
    },
];

describe.each(FIXTURES)('HotelProvider contract — $name', (fx) => {
    const holder = { firstName: 'Juan', lastName: 'dela Cruz', email: 'juan@example.com' };
    const guests = [{ firstName: 'Juan', lastName: 'dela Cruz', age: 30, type: 'adult' as const }];

    async function firstRate(p: HotelProvider) {
        const rates = await p.getRates(fx.hotelId, STAY);
        expect(rates.length).toBeGreaterThan(0);
        return rates[0];
    }

    it('declares an id, a display name and capabilities', () => {
        const p = fx.make();
        expect(p.id).toBeTruthy();
        expect(p.displayName).toBeTruthy();
        expect(typeof p.capabilities.bookingRead).toBe('boolean');
        expect(typeof p.capabilities.providesContent).toBe('boolean');
        expect(typeof p.getBooking === 'function').toBe(p.capabilities.bookingRead);
    });

    it('searches: owned offers, priced per night, consistent with the cheapest rate', async () => {
        const p = fx.make();
        const out = await p.searchHotels({
            cityName: fx.cityName, checkin: STAY.checkIn, checkout: STAY.checkOut, adults: 2, children: 0,
        });
        expect(out.data.length).toBeGreaterThan(0);

        const nights = nightsBetween(STAY.checkIn, STAY.checkOut);
        for (const listing of out.data) {
            expect(p.ownsRef(listing.offerId)).toBe(true);
            expect(listing.price).toBeGreaterThan(0);
            expect(typeof listing.currency).toBe('string');
            expect(listing.price).toBeCloseTo(listing.roomTypes[0].gross / nights, 2);
        }
    });

    it('returns rates the provider owns, priced as a stay total', async () => {
        const p = fx.make();
        for (const rate of await p.getRates(fx.hotelId, STAY)) {
            expect(p.ownsRef(rate.offerId)).toBe(true);
            expect(rate.gross).toBeGreaterThan(0);
            expect(rate.price).toBe(rate.gross);
            expect(['RFN', 'NRFN']).toContain(rate.refundableTag);
        }
    });

    it('prebooks a rate it listed', async () => {
        const p = fx.make();
        const rate = await firstRate(p);
        const q = await p.prebook({ offerId: rate.offerId, roomName: rate.roomName, adults: 2, children: 0, currency: 'USD' });

        expect(p.ownsRef(q.prebookRef)).toBe(true);
        expect(q.price.gross).toBeGreaterThan(0);
        expect(q.price.gross).toBeGreaterThanOrEqual(q.price.net);
        expect(q.price.currency).toBeTruthy();
        expect(q.checkIn).toBe(STAY.checkIn);
        expect(q.checkOut).toBe(STAY.checkOut);
        expect(Array.isArray(q.surcharges)).toBe(true);
        expect(Array.isArray(q.rooms)).toBe(true);
    });

    it('refuses to prebook a reference that is not its own', async () => {
        const p = fx.make();
        const err = await p.prebook({ offerId: fx.foreignRef, adults: 2, children: 0, currency: 'USD' }).catch((e) => e);
        expect(err).toBeInstanceOf(HotelProviderError);
        expect(err.code).toBe('INVALID_RATE');
    });

    it('books under our reference and can cancel it', async () => {
        const p = fx.make();
        const rate = await firstRate(p);
        const q = await p.prebook({ offerId: rate.offerId, roomName: rate.roomName, adults: 2, children: 0, currency: 'USD' });

        const b = await p.book({ prebookRef: q.prebookRef, clientRef: 'CG-CONTRACT', holder, guests, stay: { adults: 1, children: 0, currency: 'USD' } });
        expect(b.provider).toBe(p.id);
        expect(b.clientRef).toBe('CG-CONTRACT');
        expect(b.supplierRef).toBeTruthy();

        const c = await p.cancelBooking({ clientRef: 'CG-CONTRACT', supplierRef: b.supplierRef });
        expect(c.status).toBe('CANCELLED');
    });

    it('reads a booking back when it says it can', async () => {
        const p = fx.make();
        if (!p.capabilities.bookingRead || !p.getBooking) return;

        const rate = await firstRate(p);
        const q = await p.prebook({ offerId: rate.offerId, adults: 2, children: 0, currency: 'USD' });
        await p.book({ prebookRef: q.prebookRef, clientRef: 'CG-READBACK', holder, guests, stay: { adults: 1, children: 0, currency: 'USD' } });

        expect((await p.getBooking({ clientRef: 'CG-READBACK' }))?.clientRef).toBe('CG-READBACK');
        expect(await p.getBooking({ clientRef: 'CG-NEVER-BOOKED' })).toBeNull();
    });
});
