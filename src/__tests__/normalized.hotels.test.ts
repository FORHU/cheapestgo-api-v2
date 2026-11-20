import { describe, it, expect } from 'vitest';

import { boardBasis, cancellation, etgHotel, hotelSupplierOf, mockHotel, normalizeHotel, travelgatexHotel } from '@/lib/normalized/hotels';
import { MockHotelProvider } from '@/lib/hotels/providers/mock/MockHotelProvider';
import type { HotelListing, RoomType } from '@/types/hotels';
import tgx from './fixtures/travelgatex-seoul-listing-and-rates.json';
import etg from './fixtures/etg-region-listings.json';
import { supplierLeaks } from './helpers/supplierLeaks';

/**
 * Hotel listings into the one shape the assistant sees (#53).
 *
 * TravelgateX is a live capture (Seoul, 2 adults, 15–17 Dec 2026). ETG is constructed from the
 * code — its keys were refused when the fixtures were taken; see the fixture's note. The mock is
 * asked live, since it is our own supplier.
 */

const tgxListing = tgx.listing as unknown as HotelListing;
const tgxRates = tgx.rates as unknown as RoomType[];
const etgListings = etg.listings as unknown as HotelListing[];

describe('travelgatexHotel', () => {
    it('maps a live listing with its rates', () => {
        const h = travelgatexHotel(tgxListing, tgxRates);

        expect(h).toMatchObject({
            id:          '10110462',
            supplier:    'travelgatex',
            name:        'Guro Namyangjang',
            starRating:  3,
            nightlyFrom: { amount: 1853, currency: 'PHP' },
            location: {
                address: '28 Digital Ro 19 Gil Guro Gu, Seoul',
                city:    'Seoul',
                country: 'KR',
                lat:     37.481,
                lng:     126.89,
                neighborhood:       null,
                distanceToCenterKm: null,
                distanceToMetroKm:  null,
            },
            checkInTime:  null,
            checkOutTime: null,
        });
        expect(h.image).toMatch(/^https:\/\/cdn\.worldota\.net\//);

        expect(h.rooms).toEqual([{
            id:    'TGX:tgx-option-2',
            name:  'Standard room (full double bed) (queen size bed)',
            board: 'room_only',
            total: { amount: 3706, currency: 'PHP' },
            cancellation: {
                refundable: true,
                freeUntil:  '2026-12-11T15:00:00Z',
                penalties: [
                    { from: '2026-12-11T15:00:00Z', amount: { amount: 701, currency: 'PHP' }, percent: null, nights: null },
                    { from: '2026-12-13T15:00:00Z', amount: { amount: 3706, currency: 'PHP' }, percent: null, nights: null },
                ],
            },
        }]);
    });

    it('says nothing it does not know: no reviews is no rating, not a rating of 0', () => {
        const h = travelgatexHotel(tgxListing, tgxRates);
        expect(h.guestRating).toBeNull();
        expect(h.reviewCount).toBeNull();
        expect(h.amenities).toEqual([]);
    });

    it('a city-search listing alone has its cheapest room, refundable but without penalty steps', () => {
        const h = travelgatexHotel(tgxListing);
        expect(h.rooms).toHaveLength(1);
        expect(h.rooms[0].cancellation).toEqual({ refundable: true, freeUntil: null, penalties: [] });
    });

    it('passes no supplier field through', () => {
        expect(supplierLeaks(travelgatexHotel(tgxListing, tgxRates))).toEqual([]);
    });
});

describe('etgHotel', () => {
    it('maps a region listing, with no rooms and refundability unknown', () => {
        const [kayon] = etgListings;
        const h = etgHotel(kayon);

        expect(h).toMatchObject({
            id:          'the_kayon_resort',
            supplier:    'etg',
            starRating:  5,
            guestRating: 9.2,
            reviewCount: 418,
            nightlyFrom: { amount: 142.5, currency: 'USD' },
            rooms:       [],
        });
        // ETG repeats an amenity across its groups; the assistant needs it once.
        expect(h.amenities).toEqual(['Swimming Pool', 'Spa', 'Free WiFi', 'Airport Shuttle']);
    });

    it('a bare listing reports nulls, not zeros and empty strings', () => {
        const h = etgHotel(etgListings[1]);
        expect(h).toMatchObject({
            starRating:  null,
            guestRating: null,
            reviewCount: null,
            image:       null,
            location:    { address: null, lat: null, lng: null, city: 'Bali', country: 'ID' },
        });
    });

    it('passes no supplier field through', () => {
        for (const l of etgListings) expect(supplierLeaks(etgHotel(l))).toEqual([]);
    });
});

describe('mockHotel', () => {
    const NOW = Date.parse('2026-11-20T00:00:00Z');
    const stay = { checkin: '2026-12-15', checkout: '2026-12-17', adults: 2, children: 0, cityName: 'Manila', countryCode: 'PH' };

    it('maps what the mock supplier answers, with every rate', async () => {
        const mock = new MockHotelProvider({ now: () => NOW, persist: false });
        const { data } = await mock.searchHotels(stay as any);
        expect(data.length).toBeGreaterThan(0);

        const listing = data[0] as HotelListing;
        const rates = await mock.getRates(listing.hotelId, { checkIn: stay.checkin, checkOut: stay.checkout, adults: 2, children: 0 });
        const h = mockHotel(listing, rates);

        expect(h.supplier).toBe('mock');
        expect(h.rooms.length).toBe(rates.length);
        expect(h.guestRating).toBeGreaterThan(0);
        for (const r of h.rooms) {
            expect(['room_only', 'breakfast', 'half_board']).toContain(r.board);
            expect(typeof r.cancellation.refundable).toBe('boolean');
            // A non-refundable room has no free window, whatever its steps say.
            if (r.cancellation.refundable === false) expect(r.cancellation.freeUntil).toBeNull();
        }
        // The mock's tiered plan charges by percentage — said as a percentage, not as an amount.
        const percents = h.rooms.flatMap((r) => r.cancellation.penalties).filter((p) => p.percent !== null);
        for (const p of percents) expect(p.amount).toBeNull();
        expect(supplierLeaks(h)).toEqual([]);
    });
});

describe('normalizeHotel', () => {
    it('picks the mapper by what the adapter stamped on the listing', () => {
        expect(hotelSupplierOf(tgxListing)).toBe('travelgatex');
        expect(hotelSupplierOf(etgListings[0])).toBe('etg');
        expect(hotelSupplierOf({ provider: 'mock', offerId: 'MOCK:abc' })).toBe('mock');
        expect(normalizeHotel(etgListings[0]).supplier).toBe('etg');
        expect(normalizeHotel(tgxListing, tgxRates).rooms).toHaveLength(1);
    });
});

describe('boardBasis', () => {
    it.each([
        ['nomeal', 'room_only'], ['RO', 'room_only'],
        ['breakfast', 'breakfast'], ['BB', 'breakfast'],
        ['half-board', 'half_board'], ['HB', 'half_board'],
        ['full_board', 'full_board'], ['all-inclusive', 'all_inclusive'],
        ['something-new', null], ['', null],
    ])('%s → %s', (code, expected) => {
        expect(boardBasis(code)).toBe(expected);
    });
});

describe('cancellation', () => {
    it('"UNKNOWN" is unknown, not non-refundable', () => {
        expect(cancellation({ refundable: false, refundableTag: 'UNKNOWN' }).refundable).toBeNull();
    });

    it('orders penalty steps and reads NIGHTS and PERCENT as what they are', () => {
        const c = cancellation({
            refundable: true,
            refundableTag: 'RFN',
            cancelPolicy: {
                refundable: true,
                cancelPenalties: [
                    { deadline: '2026-12-14T00:00:00Z', hoursBefore: 24, penaltyType: 'PERCENT', currency: 'USD', value: 100 },
                    { deadline: '2026-12-10T00:00:00Z', hoursBefore: 120, penaltyType: 'NIGHTS', currency: 'USD', value: 1 },
                ],
            },
        });
        expect(c.freeUntil).toBe('2026-12-10T00:00:00Z');
        expect(c.penalties.map((p) => [p.nights, p.percent])).toEqual([[1, null], [null, 100]]);
    });
});
