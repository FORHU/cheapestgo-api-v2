// src/__tests__/hotelProvider.travelgatex.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/hotels/search', () => ({ runTgxSearch: vi.fn() }));
vi.mock('@/lib/hotels/travelgatex', () => ({ quoteTgx: vi.fn(), bookTgx: vi.fn(), cancelTgx: vi.fn() }));

import { runTgxSearch } from '@/lib/hotels/search';
import { quoteTgx, bookTgx, cancelTgx } from '@/lib/hotels/travelgatex';
import {
    TravelgateXProvider, classifyTgxFailure, parseTgxOptionToken, roomNamesMatch,
} from '@/lib/hotels/providers/travelgatex.provider';
import { HotelProviderError } from '@/lib/hotels/providers/types';
import type { HotelProvider, HotelProviderErrorCode } from '@/lib/hotels/providers/types';

// `d` hotel · `b` check-in · `c` check-out · `h` guest nationality
const TOKEN = 'd10000352[b261110[c261112[hPH';

const provider = new TravelgateXProvider({ propagationDelayMs: 0, retryDelayMs: 0 });

const quote = (over: Record<string, unknown> = {}) => ({
    optionRefId: 'book-token',
    hotelCode:   '10000352',
    boardCode:   'BB',
    paymentType: 'MERCHANT',
    status:      'OK',
    price:       { net: 100, gross: 110, currency: 'USD' },
    surcharges:  [],
    rooms:       [{ code: 'DBL', description: 'Deluxe Room', occupancyRefId: 1 }],
    cancelPolicy: {
        refundable: true,
        cancelPenalties: [{ deadline: '2026-11-07T10:00:00Z', hoursBefore: 72, penaltyType: 'AMOUNT', currency: 'USD', value: 55 }],
    },
    ...over,
});

const freshRooms = (...names: string[]) => ({
    data: [{
        roomTypes: names.map((n, i) => ({
            offerId: `TGX:${TOKEN}-${i}`, roomName: n, boardCode: 'BB',
            rates: [{ _tgx: { id: `id-${i}`, token: `native-${i}` } }],
        })),
    }],
});

const prebookInput = { offerId: `TGX:${TOKEN}`, roomName: 'Deluxe Room', adults: 2, children: 0, currency: 'USD' };

async function codeOf(p: Promise<unknown>): Promise<HotelProviderErrorCode | undefined> {
    const err = await p.then(() => null, (e: unknown) => e);
    return err instanceof HotelProviderError ? err.code : undefined;
}

beforeEach(() => {
    vi.mocked(runTgxSearch).mockReset();
    vi.mocked(quoteTgx).mockReset();
    vi.mocked(bookTgx).mockReset();
    vi.mocked(cancelTgx).mockReset();
});

describe('TravelgateXProvider — identity', () => {
    it('owns TGX: references, cannot read bookings back, and holds no content', async () => {
        expect(provider.id).toBe('travelgatex');
        expect(provider.ownsRef('TGX:abc')).toBe(true);
        expect(provider.ownsRef('MOCK:abc')).toBe(false);
        expect(provider.capabilities).toEqual({ bookingRead: false, providesContent: false });
        // Absent from the class on purpose, so it is read through the interface that declares it.
        expect((provider as HotelProvider).getBooking).toBeUndefined();
        expect(await provider.getHotelDetails('10000352')).toBeNull();
    });
});

describe('TravelgateXProvider — search', () => {
    it('passes the query through untouched', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue({ data: [], totalCount: 0 } as never);
        const q = { cityName: 'Bangkok', checkin: '2026-11-10', checkout: '2026-11-12', adults: 2 };
        await provider.searchHotels(q);
        expect(runTgxSearch).toHaveBeenCalledWith(q);
    });

    it('leaves TravelgateX listings alone — search.ts already prices them per night', async () => {
        const result = { data: [{ id: '1', provider: undefined, price: 50 }], totalCount: 1 };
        vi.mocked(runTgxSearch).mockResolvedValue(result as never);
        const out = await provider.searchHotels({ cityName: 'Bangkok', checkin: '2026-11-10', checkout: '2026-11-12' });
        expect(out).toEqual(result);
        expect('allMappable' in out).toBe(false);
    });

    it('divides ETG listings by the nights, once, because they arrive as stay totals', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue({
            data:        [{ id: 'e1', provider: 'etg', price: 300 }, { id: 't1', price: 80 }],
            allMappable: [{ id: 'e1', provider: 'etg', price: 300 }],
            totalCount:  2,
        } as never);

        const out = await provider.searchHotels({ cityName: 'Palawan', checkin: '2026-11-10', checkout: '2026-11-13' });

        expect(out.data[0].price).toBe(100);   // 300 over three nights
        expect(out.data[1].price).toBe(80);    // untouched
        expect(out.allMappable?.[0].price).toBe(100);
    });
});

describe('TravelgateXProvider — rates', () => {
    it('asks for one hotel and returns its flat rate options', async () => {
        const roomTypes = [{ offerId: 'TGX:x', roomName: 'Room', price: 200 }];
        vi.mocked(runTgxSearch).mockResolvedValue({ data: [{ roomTypes }] } as never);

        const out = await provider.getRates('10000352', { checkIn: '2026-11-10', checkOut: '2026-11-12', adults: 2, children: 1 });

        expect(out).toEqual(roomTypes);
        expect(runTgxSearch).toHaveBeenCalledWith({
            hotelCode: '10000352', checkin: '2026-11-10', checkout: '2026-11-12',
            adults: 2, children: 1, currency: 'USD', guest_nationality: 'US',
        });
    });

    it('returns nothing when the supplier has nothing', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue({ data: [] } as never);
        expect(await provider.getRates('1', { checkIn: '2026-11-10', checkOut: '2026-11-12', adults: 2, children: 0 })).toEqual([]);
    });
});

describe('TravelgateXProvider — prebook', () => {
    it('re-reads the hotel, quotes the option and returns neutral terms', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue(freshRooms('Deluxe Room') as never);
        vi.mocked(quoteTgx).mockResolvedValue(quote() as never);

        const out = await provider.prebook(prebookInput);

        expect(runTgxSearch).toHaveBeenCalledWith({
            hotelCode: '10000352', checkin: '2026-11-10', checkout: '2026-11-12',
            adults: 2, children: 0, currency: 'USD', guest_nationality: 'PH',
        });
        expect(out).toEqual({
            prebookRef:      'TGX:book-token',
            checkIn:         '2026-11-10',
            checkOut:        '2026-11-12',
            roomName:        'Deluxe Room',
            roomSubstituted: false,
            price:           { net: 100, gross: 110, currency: 'USD' },
            surcharges:      [],
            cancellation: {
                refundable: true,
                penalties:  [{ deadline: '2026-11-07T10:00:00Z', type: 'AMOUNT', value: 55, currency: 'USD', hoursBefore: 72 }],
            },
            boardCode: 'BB',
            rooms:     [{ code: 'DBL', description: 'Deluxe Room', occupancyRefId: 1 }],
        });
    });

    it('tries the matching room first, and the option id before the native token', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue(freshRooms('Standard Room', 'Deluxe Room') as never);
        vi.mocked(quoteTgx).mockResolvedValue(quote() as never);

        await provider.prebook(prebookInput);

        // candidates are [Deluxe (matched), Standard]; the first token tried is its offer id
        expect(vi.mocked(quoteTgx).mock.calls[0][0]).toBe(`${TOKEN}-1`);
    });

    it('falls through the tokens of a room until one quotes', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue(freshRooms('Deluxe Room') as never);
        vi.mocked(quoteTgx)
            .mockRejectedValueOnce(new Error('TGX Quote errors: Option not found'))
            .mockRejectedValueOnce(new Error('TGX Quote errors: Option not found'))
            .mockResolvedValueOnce(quote({ optionRefId: 'native-quoted' }) as never);

        const out = await provider.prebook(prebookInput);

        expect(vi.mocked(quoteTgx).mock.calls.map((c) => c[0])).toEqual([`${TOKEN}-0`, 'id-0', 'native-0']);
        expect(out.prebookRef).toBe('TGX:native-quoted');
    });

    it('flags a substitution when the quoted room is not the one asked for', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue(freshRooms('Garden Bungalow') as never);
        vi.mocked(quoteTgx).mockResolvedValue(quote() as never);

        const out = await provider.prebook({ ...prebookInput, roomName: 'Deluxe Room' });

        expect(out.roomName).toBe('Garden Bungalow');
        expect(out.roomSubstituted).toBe(true);
    });

    it('is SOLD_OUT when the fresh search has no rooms', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue({ data: [{ roomTypes: [] }] } as never);
        const err = await provider.prebook(prebookInput).catch((e) => e);
        expect(err).toBeInstanceOf(HotelProviderError);
        expect(err.code).toBe('SOLD_OUT');
        expect(err.message).toBe('Room is no longer available for the selected dates');
    });

    it('is SOLD_OUT when no candidate can be quoted', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue(freshRooms('Deluxe Room') as never);
        vi.mocked(quoteTgx).mockRejectedValue(new Error('boom'));
        const err = await provider.prebook(prebookInput).catch((e) => e);
        expect(err.code).toBe('SOLD_OUT');
        expect(err.message).toBe('This room is currently unavailable for booking. Please try a different hotel or check back later.');
    });

    it('is NOT_PAYABLE_ONLINE when the supplier collects payment itself', async () => {
        vi.mocked(runTgxSearch).mockResolvedValue(freshRooms('Deluxe Room') as never);
        vi.mocked(quoteTgx).mockResolvedValue(quote({ paymentType: 'DIRECT' }) as never);
        const err = await provider.prebook(prebookInput).catch((e) => e);
        expect(err.code).toBe('NOT_PAYABLE_ONLINE');
        expect(err.message).toBe('This room is not available for online payment. Please contact support.');
    });

    it('is INVALID_RATE for a reference that is not its own or cannot be decoded', async () => {
        expect(await codeOf(provider.prebook({ ...prebookInput, offerId: 'MOCK:abc' }))).toBe('INVALID_RATE');
        expect(await codeOf(provider.prebook({ ...prebookInput, offerId: 'TGX:bad-token' }))).toBe('INVALID_RATE');
        expect(runTgxSearch).not.toHaveBeenCalled();
    });

    it('turns a supplier timeout during the fresh search into TIMEOUT', async () => {
        const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
        vi.mocked(runTgxSearch).mockRejectedValue(timeout);
        expect(await codeOf(provider.prebook(prebookInput))).toBe('TIMEOUT');
    });
});

describe('TravelgateXProvider — book', () => {
    const input = {
        prebookRef: 'TGX:book-token',
        clientRef:  'CG-ABC123',
        holder:     { firstName: 'Juan', lastName: 'dela Cruz', email: 'juan@example.com' },
        guests: [
            { firstName: 'Juan',  lastName: 'dela Cruz', age: 30, type: 'adult' as const },
            { firstName: 'Maria', lastName: 'dela Cruz', age: 8,  type: 'child' as const },
        ],
        stay: { adults: 1, children: 1, currency: 'USD' },
    };

    const bookedRaw = {
        status: 'OK', supplierRef: 'SUP-1', clientRef: 'CG-ABC123', hotelRef: 'H-1',
        hotelCode: '10000352', hotelName: 'The Grand',
        price: { net: 100, gross: 110, currency: 'USD' },
        cancelPolicy: { refundable: false, cancelPenalties: [] },
    };

    it('sends the token without its prefix, with pax names uppercased downstream', async () => {
        vi.mocked(bookTgx).mockResolvedValue(bookedRaw as never);
        await provider.book(input);
        expect(bookTgx).toHaveBeenCalledWith({
            quoteToken:      'book-token',
            clientReference: 'CG-ABC123',
            holder:          { firstName: 'Juan', lastName: 'dela Cruz', email: 'juan@example.com' },
            rooms: [{
                occupancyRefId: 1,
                paxes: [
                    { name: 'Juan',  surname: 'dela Cruz', age: 30 },
                    { name: 'Maria', surname: 'dela Cruz', age: 8 },
                ],
            }],
        });
    });

    it('returns the booking in neutral terms', async () => {
        vi.mocked(bookTgx).mockResolvedValue(bookedRaw as never);
        expect(await provider.book(input)).toEqual({
            provider: 'travelgatex', status: 'OK', clientRef: 'CG-ABC123', supplierRef: 'SUP-1',
            hotelRef: 'H-1', hotelCode: '10000352', hotelName: 'The Grand',
            price: { net: 100, gross: 110, currency: 'USD' },
            cancellation: { refundable: false, penalties: [] },
        });
    });

    it('re-quotes and re-books once when the option has expired', async () => {
        vi.mocked(bookTgx)
            .mockRejectedValueOnce(new Error('TGX Book errors: Option not found'))
            .mockResolvedValueOnce(bookedRaw as never);
        vi.mocked(runTgxSearch).mockResolvedValue(freshRooms('Deluxe Room') as never);
        vi.mocked(quoteTgx).mockResolvedValue(quote({ optionRefId: 'fresh-token' }) as never);

        const out = await provider.book({ ...input, prebookRef: `TGX:${TOKEN}` });

        expect(out.clientRef).toBe('CG-ABC123');
        expect(bookTgx).toHaveBeenCalledTimes(2);
        expect(vi.mocked(bookTgx).mock.calls[1][0].quoteToken).toBe('fresh-token');
    });

    it('does not retry a refusal', async () => {
        vi.mocked(bookTgx).mockRejectedValue(new Error('TGX Book errors: Holder name is invalid'));
        expect(await codeOf(provider.book(input))).toBe('REJECTED');
        expect(bookTgx).toHaveBeenCalledTimes(1);
    });

    it('does not retry — or call it a refusal — when the request may have landed', async () => {
        vi.mocked(bookTgx).mockRejectedValue(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));
        expect(await codeOf(provider.book(input))).toBe('UNKNOWN_OUTCOME');
        expect(bookTgx).toHaveBeenCalledTimes(1);
    });

    it('does not mistake a 503 that says "unavailable" for a vanished option', async () => {
        vi.mocked(bookTgx).mockRejectedValue(new Error('TravelgateX API error 503: Service unavailable'));
        expect(await codeOf(provider.book(input))).toBe('UNKNOWN_OUTCOME');
        expect(bookTgx).toHaveBeenCalledTimes(1);
    });

    it('is SOLD_OUT when the expired option cannot be re-quoted', async () => {
        vi.mocked(bookTgx).mockRejectedValue(new Error('TGX Book errors: Option not found'));
        vi.mocked(runTgxSearch).mockResolvedValue({ data: [{ roomTypes: [] }] } as never);
        const err = await provider.book({ ...input, prebookRef: `TGX:${TOKEN}` }).catch((e) => e);
        expect(err.code).toBe('SOLD_OUT');
        expect(err.message).toBe('Room is no longer available for these dates');
    });
});

describe('TravelgateXProvider — cancel', () => {
    it('cancels by client reference first and maps the answer', async () => {
        vi.mocked(cancelTgx).mockResolvedValue({
            status: 'CANCELLED', supplierRef: 'SUP-1', clientRef: 'CG-ABC123', refundAmount: 90, currency: 'USD',
        } as never);

        const out = await provider.cancelBooking({ clientRef: 'CG-ABC123', supplierRef: 'SUP-1', hotelCode: '10000352' });

        expect(cancelTgx).toHaveBeenCalledWith({
            clientReference: 'CG-ABC123', supplierReference: 'SUP-1', hotelCode: '10000352',
        });
        expect(out).toEqual({
            status: 'CANCELLED', supplierRef: 'SUP-1', clientRef: 'CG-ABC123', refundAmount: 90, currency: 'USD',
        });
    });

    it('classifies a refusal and a lost answer differently', async () => {
        vi.mocked(cancelTgx).mockRejectedValueOnce(new Error('Request not accepted by supplier'));
        expect(await codeOf(provider.cancelBooking({ clientRef: 'x' }))).toBe('UNKNOWN_OUTCOME');

        vi.mocked(cancelTgx).mockRejectedValueOnce(new Error('TGX Cancel errors: Booking already cancelled'));
        expect(await codeOf(provider.cancelBooking({ clientRef: 'x' }))).toBe('REJECTED');
    });
});

describe('classifyTgxFailure', () => {
    const cases: Array<[string, string, boolean, HotelProviderErrorCode]> = [
        ['vanished option',       'TGX Book errors: Option not found',               true,  'SOLD_OUT'],
        ['expired option',        'TGX Quote errors: option expired',                false, 'SOLD_OUT'],
        ['wrong field',           'TGX Quote errors: WRONG_FIELD',                   false, 'SOLD_OUT'],
        ['book refusal',          'TGX Book errors: Holder name is invalid',         true,  'REJECTED'],
        ['graphql refusal',       'TravelgateX GraphQL errors: bad input',           true,  'REJECTED'],
        ['client error',          'TravelgateX API error 400: bad request',          true,  'REJECTED'],
        ['server error (write)',  'TravelgateX API error 502: bad gateway',          true,  'UNKNOWN_OUTCOME'],
        ['server error (read)',   'TravelgateX API error 502: bad gateway',          false, 'UNAVAILABLE'],
        ['rate limited',          'TravelgateX API error 429: slow down',            false, 'UNAVAILABLE'],
        ['not confirmed',         'Booking not confirmed — status: CANCELLED',       true,  'REJECTED'],
        ['on request',            'Booking not confirmed — status: ON_REQUEST',      true,  'UNKNOWN_OUTCOME'],
        ['unknown (write)',       'something odd happened',                          true,  'UNKNOWN_OUTCOME'],
        ['unknown (read)',        'something odd happened',                          false, 'UNAVAILABLE'],
    ];

    it.each(cases)('%s', (_label, message, mutating, expected) => {
        expect(classifyTgxFailure(new Error(message), mutating).code).toBe(expected);
    });

    it.each([true, false])('timeouts: mutating=%s', (mutating) => {
        const err = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
        expect(classifyTgxFailure(err, mutating).code).toBe(mutating ? 'UNKNOWN_OUTCOME' : 'TIMEOUT');
    });

    it('returns an existing HotelProviderError unchanged', () => {
        const e = new HotelProviderError('REJECTED', 'x');
        expect(classifyTgxFailure(e, true)).toBe(e);
    });

    it('uses the fallback message when the error has none', () => {
        expect(classifyTgxFailure({}, true, 'fallback').message).toBe('fallback');
    });
});

describe('helpers lifted from the service', () => {
    it('decodes an option token', () => {
        expect(parseTgxOptionToken(TOKEN)).toEqual({
            hotelCode: '10000352', checkIn: '2026-11-10', checkOut: '2026-11-12', nationality: 'PH',
        });
        expect(parseTgxOptionToken('garbage')).toEqual({
            hotelCode: null, checkIn: null, checkOut: null, nationality: 'US',
        });
    });

    it('matches room names loosely', () => {
        expect(roomNamesMatch('Deluxe Room', 'deluxe room')).toBe(true);
        expect(roomNamesMatch('Deluxe Double Room - Breakfast', 'Deluxe Double Room')).toBe(true);
        expect(roomNamesMatch('Garden Bungalow', 'Deluxe Room')).toBe(false);
        expect(roomNamesMatch('', 'Deluxe Room')).toBe(false);
    });
});
