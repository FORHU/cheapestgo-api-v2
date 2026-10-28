// src/__tests__/hotelProvider.mock.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MockHotelProvider } from '@/lib/hotels/providers/mock/MockHotelProvider';
import { HotelProviderError } from '@/lib/hotels/providers/types';
import type { HotelProviderErrorCode } from '@/lib/hotels/providers/types';

const NOW     = Date.parse('2026-10-14T00:00:00Z');
const WEEKDAY = { checkIn: '2026-11-10', checkOut: '2026-11-12' }; // Tue → Thu, two nights
const WEEKEND = { checkIn: '2026-11-13', checkOut: '2026-11-15' }; // Fri → Sun, two nights
const HOTEL   = 'MOCK-MNL-001';                                    // base 120 USD, 5 stars

let mock: MockHotelProvider;
beforeEach(() => { mock = new MockHotelProvider({ now: () => NOW }); });

const search = (p: MockHotelProvider, cityName = 'Manila', dates = WEEKDAY) =>
    p.searchHotels({ cityName, checkin: dates.checkIn, checkout: dates.checkOut, adults: 2, children: 0 });

async function rateOf(p: MockHotelProvider, hotelId: string, board: 'RO' | 'BB' | 'HB', dates = WEEKDAY) {
    const rates = await p.getRates(hotelId, { ...dates, adults: 2, children: 0 });
    const found = rates.find((r) => r.roomName === 'Standard Double Room' && r.boardCode === board);
    if (!found) throw new Error(`no ${board} rate for ${hotelId}`);
    return found;
}

async function prebookOf(p: MockHotelProvider, hotelId: string, board: 'RO' | 'BB' | 'HB' = 'BB', dates = WEEKDAY) {
    const rate = await rateOf(p, hotelId, board, dates);
    return p.prebook({ offerId: rate.offerId, roomName: rate.roomName, adults: 2, children: 0, currency: 'USD' });
}

const bookInput = (prebookRef: string, clientRef = 'CG-TEST01') => ({
    prebookRef,
    clientRef,
    holder: { firstName: 'Juan', lastName: 'dela Cruz', email: 'juan@example.com' },
    guests: [{ firstName: 'Juan', lastName: 'dela Cruz', age: 30, type: 'adult' as const }],
    stay:   { adults: 1, children: 0, currency: 'USD' },
});

async function expectCode(p: Promise<unknown>, code: HotelProviderErrorCode) {
    const err = await p.then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(HotelProviderError);
    expect((err as HotelProviderError).code).toBe(code);
}

describe('MockHotelProvider — identity', () => {
    it('owns MOCK: references and nothing else', () => {
        expect(mock.ownsRef('MOCK:abc')).toBe(true);
        expect(mock.ownsRef('TGX:abc')).toBe(false);
        expect(mock.ownsRef('')).toBe(false);
    });

    it('is the authority on content and can read bookings back', () => {
        expect(mock.id).toBe('mock');
        expect(mock.capabilities).toEqual({ bookingRead: true, providesContent: true });
    });
});

describe('MockHotelProvider — search', () => {
    it('finds the hotels of a city, as supplier-neutral listings priced per night', async () => {
        const out = await search(mock);
        const ids = out.data.map((h: { id: string }) => h.id);
        expect(ids).toContain(HOTEL);
        expect(ids.every((id: string) => id.startsWith('MOCK-MNL') || id.startsWith('MOCK-QA'))).toBe(true);

        const grand = out.data.find((h: { id: string }) => h.id === HOTEL);
        expect(grand.provider).toBe('mock');
        expect(grand.currency).toBe('USD');
        expect(mock.ownsRef(grand.offerId)).toBe(true);
        // cheapest rate is room-only, 120 × 0.88 × 2 nights = 211.20 for the stay
        expect(grand.price).toBeCloseTo(105.6, 2);
        expect(grand.roomTypes[0].gross).toBeCloseTo(211.2, 2);
        expect(out.totalCount).toBe(out.data.length);
    });

    it('is deterministic', async () => {
        expect(await search(mock)).toEqual(await search(mock));
    });

    it('matches the way a traveller types a place', async () => {
        const ncr = (await search(mock, 'Metro Manila')).data.map((h: { id: string }) => h.id);
        expect(ncr).toContain('MOCK-MKT-001');
        expect(ncr).toContain('MOCK-BGC-001');

        const bgc = (await search(mock, 'BGC')).data.map((h: { id: string }) => h.id);
        expect(bgc.sort()).toEqual(['MOCK-BGC-001', 'MOCK-BGC-002']);

        const withCountry = (await search(mock, 'Boracay, Philippines')).data.map((h: { id: string }) => h.id);
        expect(withCountry.sort()).toEqual(['MOCK-BOR-001', 'MOCK-BOR-002']);
    });

    it('falls back to distance when the name is not recognised', async () => {
        const out = await mock.searchHotels({
            cityName: 'Somewhere Else', lat: 10.3157, lng: 123.8854, // central Cebu
            checkin: WEEKDAY.checkIn, checkout: WEEKDAY.checkOut, adults: 2, children: 0,
        });
        expect(out.data.map((h: { id: string }) => h.id)).toEqual(
            expect.arrayContaining(['MOCK-CEB-001', 'MOCK-CEB-003']),
        );
    });

    it('finds one hotel by code, and nothing for an unknown place', async () => {
        const one = await mock.searchHotels({ hotelCode: HOTEL, checkin: WEEKDAY.checkIn, checkout: WEEKDAY.checkOut });
        expect(one.data).toHaveLength(1);

        const none = await search(mock, 'Atlantis');
        expect(none.data).toEqual([]);
        expect(none.totalCount).toBe(0);
    });
});

describe('MockHotelProvider — details and rates', () => {
    it('returns the content of a known hotel and null for an unknown one', async () => {
        const c = await mock.getHotelDetails(HOTEL);
        expect(c).toMatchObject({ hotelId: HOTEL, name: 'Bayside Grand Manila', city: 'Manila', starRating: 5 });
        expect(c?.images).toHaveLength(4);
        expect(await mock.getHotelDetails('NOPE')).toBeNull();
    });

    it('prices a stay as a whole-stay total, with a weekend uplift', async () => {
        const weekday = await rateOf(mock, HOTEL, 'BB', WEEKDAY);
        const weekend = await rateOf(mock, HOTEL, 'BB', WEEKEND);
        expect(weekday.price).toBe(240);
        expect(weekday.gross).toBe(240);
        expect(weekday.net).toBe(216);
        expect(weekend.price).toBe(276);
        expect(mock.ownsRef(weekday.offerId)).toBe(true);
    });

    it('offers every room with the rate plans its star rating allows', async () => {
        const rates = await mock.getRates(HOTEL, { ...WEEKDAY, adults: 2, children: 0 });
        // 2-adult party fits all three rooms; a 5-star has all three plans
        expect(rates).toHaveLength(9);
        const budget = await mock.getRates('MOCK-CEB-003', { ...WEEKDAY, adults: 2, children: 0 });
        expect(budget.map((r) => r.boardCode).includes('HB')).toBe(false);
    });

    it('drops rooms too small for the party', async () => {
        const rates = await mock.getRates(HOTEL, { ...WEEKDAY, adults: 4, children: 0 });
        expect(new Set(rates.map((r) => r.roomName))).toEqual(new Set(['Family Suite']));
    });

    it('returns no rates for an unknown hotel', async () => {
        expect(await mock.getRates('NOPE', { ...WEEKDAY, adults: 2, children: 0 })).toEqual([]);
    });

    it('describes refundability in the neutral rate shape', async () => {
        const ro = await rateOf(mock, HOTEL, 'RO');
        const bb = await rateOf(mock, HOTEL, 'BB');
        expect(ro.refundable).toBe(false);
        expect(ro.refundableTag).toBe('NRFN');
        expect(bb.refundable).toBe(true);
        expect(bb.refundableTag).toBe('RFN');
        expect(bb.cancelPolicy?.cancelPenalties?.[0].deadline).toBe('2026-11-07T10:00:00.000Z');
    });
});

describe('MockHotelProvider — prebook', () => {
    it('re-prices the rate and returns the terms it was quoted with', async () => {
        const q = await prebookOf(mock, HOTEL, 'BB');
        expect(mock.ownsRef(q.prebookRef)).toBe(true);
        expect(q.price).toEqual({ net: 216, gross: 240, currency: 'USD' });
        expect(q.checkIn).toBe('2026-11-10');
        expect(q.checkOut).toBe('2026-11-12');
        expect(q.roomName).toBe('Standard Double Room');
        expect(q.roomSubstituted).toBe(false);
        expect(q.boardCode).toBe('BB');
        expect(q.cancellation?.refundable).toBe(true);
        expect(q.cancellation?.penalties).toHaveLength(2);
        expect(q.rooms[0]).toMatchObject({ code: 'STD', occupancyRefId: 1 });
    });

    it('refuses a reference that is not its own, or is unreadable', async () => {
        await expectCode(mock.prebook({ offerId: 'TGX:d1[b261110[c261112', adults: 2, children: 0, currency: 'USD' }), 'INVALID_RATE');
        await expectCode(mock.prebook({ offerId: 'MOCK:!!!', adults: 2, children: 0, currency: 'USD' }), 'INVALID_RATE');
    });

    it('re-prices up 8% under the price_up scenario', async () => {
        mock.setScenario('price_up');
        expect((await prebookOf(mock, HOTEL)).price.gross).toBeCloseTo(259.2, 2);
    });

    it('re-prices down 5% under price_down', async () => {
        mock.setScenario('price_down');
        expect((await prebookOf(mock, HOTEL)).price.gross).toBeCloseTo(228, 2);
    });

    it('says sold out under sold_out, and times out under prebook_timeout', async () => {
        mock.setScenario('sold_out');
        await expectCode(prebookOf(mock, HOTEL), 'SOLD_OUT');
        mock.setScenario('prebook_timeout');
        await expectCode(prebookOf(mock, HOTEL), 'TIMEOUT');
    });

    it('lets a QA hotel carry its own scenario, which a forced scenario overrides', async () => {
        await expectCode(prebookOf(mock, 'MOCK-QA-SOLDOUT'), 'SOLD_OUT');
        mock.setScenario('ok');
        expect((await prebookOf(mock, 'MOCK-QA-SOLDOUT')).price.gross).toBeGreaterThan(0);
    });
});

describe('MockHotelProvider — book', () => {
    it('makes a reservation filed under our client reference', async () => {
        const q = await prebookOf(mock, HOTEL);
        const b = await mock.book(bookInput(q.prebookRef));

        expect(b).toMatchObject({
            provider: 'mock', status: 'OK', clientRef: 'CG-TEST01',
            hotelCode: HOTEL, hotelName: 'Bayside Grand Manila',
        });
        expect(b.supplierRef).toMatch(/^MOCKSUP-\d{6}$/);
        expect(b.price).toEqual({ net: 216, gross: 240, currency: 'USD' });
        expect(b.cancellation?.refundable).toBe(true);
        expect(mock.reservations).toHaveLength(1);
    });

    it('can be read back by either reference', async () => {
        const q = await prebookOf(mock, HOTEL);
        const b = await mock.book(bookInput(q.prebookRef));
        expect((await mock.getBooking({ clientRef: 'CG-TEST01' }))?.supplierRef).toBe(b.supplierRef);
        expect((await mock.getBooking({ supplierRef: b.supplierRef }))?.clientRef).toBe('CG-TEST01');
        expect(await mock.getBooking({ clientRef: 'CG-NOPE' })).toBeNull();
    });

    it('is a naive supplier: a repeated client reference books twice unless told to dedupe', async () => {
        const q = await prebookOf(mock, HOTEL);
        await mock.book(bookInput(q.prebookRef, 'CG-DUP'));
        await mock.book(bookInput(q.prebookRef, 'CG-DUP'));
        expect(mock.reservations).toHaveLength(2);

        const strict = new MockHotelProvider({ now: () => NOW, dedupeByClientRef: true });
        const q2 = await prebookOf(strict, HOTEL);
        const first  = await strict.book(bookInput(q2.prebookRef, 'CG-DUP'));
        const second = await strict.book(bookInput(q2.prebookRef, 'CG-DUP'));
        expect(strict.reservations).toHaveLength(1);
        expect(second.supplierRef).toBe(first.supplierRef);
    });

    it('refuses a reference that is not a prebook', async () => {
        const rate = await rateOf(mock, HOTEL, 'BB');
        await expectCode(mock.book(bookInput(rate.offerId)), 'INVALID_RATE');
        await expectCode(mock.book(bookInput('TGX:abc')), 'INVALID_RATE');
    });

    it('refuses a booking with no guests', async () => {
        const q = await prebookOf(mock, HOTEL);
        await expectCode(mock.book({ ...bookInput(q.prebookRef), guests: [] }), 'REJECTED');
    });

    it('rejects under book_rejected and books nothing', async () => {
        const q = await prebookOf(mock, 'MOCK-QA-BOOKFAIL');
        await expectCode(mock.book(bookInput(q.prebookRef)), 'REJECTED');
        expect(mock.reservations).toHaveLength(0);
    });

    it('times out under book_timeout — and the reservation exists', async () => {
        const q = await prebookOf(mock, 'MOCK-QA-BOOKTIMEOUT');
        await expectCode(mock.book(bookInput(q.prebookRef)), 'UNKNOWN_OUTCOME');
        expect(mock.reservations).toHaveLength(1);
        expect(await mock.getBooking({ clientRef: 'CG-TEST01' })).toMatchObject({ status: 'OK' });
    });
});

describe('MockHotelProvider — cancel', () => {
    async function booked(p: MockHotelProvider, hotelId = HOTEL, board: 'RO' | 'BB' | 'HB' = 'BB') {
        const q = await prebookOf(p, hotelId, board);
        return p.book(bookInput(q.prebookRef));
    }

    it('cancels and refunds everything inside the free window', async () => {
        const b = await booked(mock);
        const c = await mock.cancelBooking({ clientRef: 'CG-TEST01', supplierRef: b.supplierRef });
        expect(c).toMatchObject({ status: 'CANCELLED', clientRef: 'CG-TEST01', refundAmount: 240, currency: 'USD' });
        expect(await mock.getBooking({ clientRef: 'CG-TEST01' })).toMatchObject({ status: 'CANCELLED' });
    });

    it('refunds nothing on a non-refundable rate', async () => {
        await booked(mock, HOTEL, 'RO');
        const c = await mock.cancelBooking({ clientRef: 'CG-TEST01' });
        expect(c.refundAmount).toBe(0);
    });

    it('charges the penalty in force once the free window has closed', async () => {
        const late = new MockHotelProvider({ now: () => Date.parse('2026-11-08T00:00:00Z') });
        await booked(late);
        const c = await late.cancelBooking({ clientRef: 'CG-TEST01' });
        // first night (120) is the penalty after 3 days out; the rest comes back
        expect(c.refundAmount).toBe(120);
    });

    it('charges a percentage on a tiered rate', async () => {
        const mid = new MockHotelProvider({ now: () => Date.parse('2026-11-05T00:00:00Z') });
        await booked(mid, HOTEL, 'HB');
        const gross = (await mid.getBooking({ clientRef: 'CG-TEST01' }))?.price?.gross ?? 0;
        const c = await mid.cancelBooking({ clientRef: 'CG-TEST01' });
        expect(c.refundAmount).toBeCloseTo(gross * 0.5, 2);
    });

    it('rejects an unknown booking and a second cancellation', async () => {
        await expectCode(mock.cancelBooking({ clientRef: 'CG-NOPE' }), 'REJECTED');
        await booked(mock);
        await mock.cancelBooking({ clientRef: 'CG-TEST01' });
        await expectCode(mock.cancelBooking({ clientRef: 'CG-TEST01' }), 'REJECTED');
    });

    it('refuses under cancel_rejected and leaves the booking standing', async () => {
        await booked(mock, 'MOCK-QA-CANCELFAIL');
        await expectCode(mock.cancelBooking({ clientRef: 'CG-TEST01' }), 'REJECTED');
        expect(await mock.getBooking({ clientRef: 'CG-TEST01' })).toMatchObject({ status: 'OK' });
    });

    it('times out under cancel_timeout — and the cancellation was applied', async () => {
        await booked(mock);
        mock.setScenario('cancel_timeout');
        await expectCode(mock.cancelBooking({ clientRef: 'CG-TEST01' }), 'UNKNOWN_OUTCOME');
        expect(await mock.getBooking({ clientRef: 'CG-TEST01' })).toMatchObject({ status: 'CANCELLED' });
    });
});

describe('MockHotelProvider — instrumentation', () => {
    it('logs each call so a test can assert a supplier was asked exactly once', async () => {
        const q = await prebookOf(mock, HOTEL);
        await mock.book(bookInput(q.prebookRef));
        expect(mock.calls.filter((c) => c.method === 'book')).toHaveLength(1);
        expect(mock.calls.map((c) => c.method)).toEqual(
            expect.arrayContaining(['getRates', 'prebook', 'book']),
        );
    });

    it('forgets everything on reset', async () => {
        const q = await prebookOf(mock, HOTEL);
        await mock.book(bookInput(q.prebookRef));
        mock.setScenario('sold_out');
        mock.reset();
        expect(mock.reservations).toHaveLength(0);
        expect(mock.calls).toHaveLength(0);
        expect((await prebookOf(mock, HOTEL)).price.gross).toBe(240);
    });
});
