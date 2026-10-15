// src/__tests__/hotels.searchStream.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('@/config', () => ({ config: { GOOGLE_PLACES_API_KEY: '' } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/cityAliases', () => ({ CITY_ALIASES: {} }));
vi.mock('@/lib/google/places', () => ({ getPlaceDetails: vi.fn(), geocode: vi.fn() }));
vi.mock('@/lib/hotels/property', () => ({ resolveStayDates: vi.fn() }));
vi.mock('@/lib/hotels/travelgatex', () => ({ resolveTgxDestinationCode: vi.fn() }));
vi.mock('@/lib/hotels/contentPatches', () => ({ fetchHotelContentPatches: vi.fn() }));
vi.mock('@/lib/hotels/search', () => ({ getInstantHotelCatalog: vi.fn(), runTgxSearch: vi.fn() }));
vi.mock('@/services/hotels.service', () => ({ HotelsService: class {} }));
vi.mock('@/services/destinations.service', () => ({ DestinationsService: class {} }));
vi.mock('@/middleware/error.middleware', () => ({
    AppError: class extends Error { constructor(public status: number, m: string, public code?: string) { super(m); } },
}));

import { getInstantHotelCatalog } from '@/lib/hotels/search';
import { fetchHotelContentPatches } from '@/lib/hotels/contentPatches';
import { HotelsController } from '@/controllers/hotels.controller';
import { setHotelProviderForTests } from '@/lib/hotels/providers/factory';
import type { HotelProvider } from '@/lib/hotels/providers/types';

function fakeRes() {
    const chunks: string[] = [];
    const res: any = {
        writableEnded: false,
        setHeader: vi.fn(), flushHeaders: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(),
        write: vi.fn((s: string) => { chunks.push(s); return true; }),
        end: vi.fn(() => { res.writableEnded = true; }),
    };
    const events = () => chunks.join('').split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')));
    return { res, events };
}

function fakeReq(body: Record<string, unknown>) {
    const req: any = new EventEmitter();
    req.body = body;
    return req;
}

function fakeProvider(over: { providesContent: boolean; data: any[] }) {
    const searchHotels = vi.fn().mockResolvedValue({ data: over.data, allMappable: [], totalCount: over.data.length });
    const provider = {
        id: 'mock', displayName: 'mock', capabilities: { bookingRead: false, providesContent: over.providesContent },
        ownsRef: () => true, searchHotels,
    } as unknown as HotelProvider;
    return { provider, searchHotels };
}

const BODY = { destination: 'Manila', checkIn: '2026-11-10', checkOut: '2026-11-13', adults: 2 }; // three nights

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInstantHotelCatalog).mockResolvedValue([]);
    vi.mocked(fetchHotelContentPatches).mockResolvedValue(new Map());
});

describe('HotelsController.searchStream', () => {
    it('sends listing prices exactly as the provider priced them — per night, not divided again', async () => {
        const { provider, searchHotels } = fakeProvider({
            providesContent: false,
            data: [{ hotelId: 'H1', id: 'H1', name: 'The Grand', price: 100, currency: 'USD', images: ['x'], image: 'x', lat: 14.5, lng: 121 }],
        });
        setHotelProviderForTests(provider);

        const { res, events } = fakeRes();
        await new HotelsController().searchStream(fakeReq(BODY), res);

        const hotels = events().filter((e) => e.type === 'hotels').flatMap((e) => e.data);
        expect(hotels.map((h: any) => h.price)).toEqual([100]);
        expect(searchHotels).toHaveBeenCalledTimes(1);
        expect(events().some((e) => e.type === 'done')).toBe(true);
        expect(res.end).toHaveBeenCalled();
    });

    it('asks the provider, with the traveller\'s stay', async () => {
        const { provider, searchHotels } = fakeProvider({ providesContent: false, data: [] });
        setHotelProviderForTests(provider);

        await new HotelsController().searchStream(fakeReq(BODY), fakeRes().res);

        expect(searchHotels).toHaveBeenCalledWith(expect.objectContaining({
            cityName: 'Manila', checkin: '2026-11-10', checkout: '2026-11-13', adults: 2,
        }));
    });

    it('skips the database catalog and ETG pictures when the provider owns the content', async () => {
        const { provider } = fakeProvider({
            providesContent: true,
            data: [{ hotelId: 'M1', id: 'M1', name: 'Mock', price: 50, currency: 'USD', images: [], image: '', lat: 14.5, lng: 121 }],
        });
        setHotelProviderForTests(provider);

        const { res, events } = fakeRes();
        await new HotelsController().searchStream(fakeReq(BODY), res);

        expect(getInstantHotelCatalog).not.toHaveBeenCalled();
        expect(fetchHotelContentPatches).not.toHaveBeenCalled();
        expect(events().filter((e) => e.type === 'hotels').flatMap((e) => e.data)).toHaveLength(1);
    });

    it('still reads the catalog and fills missing pictures for a supplier that has none of its own', async () => {
        const { provider } = fakeProvider({
            providesContent: false,
            data: [{ hotelId: 'H2', id: 'H2', name: 'No Photo', price: 70, currency: 'USD', images: [], image: '', lat: 14.5, lng: 121 }],
        });
        setHotelProviderForTests(provider);

        await new HotelsController().searchStream(fakeReq(BODY), fakeRes().res);

        expect(getInstantHotelCatalog).toHaveBeenCalledTimes(1);
        expect(fetchHotelContentPatches).toHaveBeenCalledWith(['H2'], 8_000);
    });

    it('reports a supplier that did not answer, with the catalog left alone', async () => {
        const { provider, searchHotels } = fakeProvider({ providesContent: false, data: [] });
        const err = Object.assign(new Error('no answer'), { name: 'UnansweredSearchError' });
        searchHotels.mockRejectedValue(err);
        setHotelProviderForTests(provider);

        const { res, events } = fakeRes();
        await new HotelsController().searchStream(fakeReq(BODY), res);

        const done = events().find((e) => e.type === 'done');
        expect(done).toMatchObject({ tgxFailed: true, tgxUnanswered: true });
    });
});
