import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted: vi.mock is lifted above the file, so the spy has to be created with it.
const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { hotel_content: { findMany: db.findMany } } }));
vi.mock('@/lib/maintenance', () => ({ staysUnderMaintenance: vi.fn().mockResolvedValue(false) }));

import { getInstantHotelCatalog } from '@/lib/hotels/search';

/**
 * What a search is allowed to be anchored to.
 *
 * The catalogue is where candidates come from — the supplier only prices what this returns —
 * so every way of asking "where" is a shape of this query, not a separate integration. Until
 * a country and a single property were accepted, the picker's own "Country · Browse all
 * hotels" reached TravelgateX with a country's name in the city field and came back a bare
 * 500, live, on both brands.
 *
 * What is asserted here is the `where` that is built, because the rows are a mock: whether the
 * right hotels come back is a property of the data, whether the right question is asked is a
 * property of this code.
 */
const ROW = {
    hotel_id: 'h-1', name: 'A Hotel', lat: 35.68, lng: 139.69,
    city: 'Tokyo', country: 'JP', address: 'Tokyo', images: ['a.jpg'],
};

const lastWhere = () => db.findMany.mock.calls.at(-1)![0].where;
const lastTake  = () => db.findMany.mock.calls.at(-1)![0].take;

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    db.findMany.mockResolvedValue([ROW]);
});

describe('what a search can be anchored to', () => {
    it('asks for nothing when nothing says where', async () => {
        const out = await getInstantHotelCatalog({ checkin: '2026-12-10', checkout: '2026-12-11' } as any);

        expect(out).toEqual([]);
        expect(db.findMany).not.toHaveBeenCalled();
    });

    it('a country alone is a browse, not a dead end', async () => {
        await getInstantHotelCatalog({ countryCode: 'JP' } as any);

        expect(db.findMany).toHaveBeenCalledTimes(1);
        expect(lastWhere().country).toMatchObject({ mode: 'insensitive' });
        // The catalogue stores the code lowercase; the query is case-insensitive either way.
        expect(lastWhere().country.in.map((c: string) => c.toUpperCase())).toContain('JP');
        // No city was named, so nothing may narrow it to one.
        expect(lastWhere().OR).toBeUndefined();
    });

    /**
     * Tokyo alone holds 4,590 hotels and Japan tens of thousands, against a hard cap. A country
     * can therefore never be a complete list, and the cap is stated rather than discovered —
     * whatever presents this has to say it is a selection.
     */
    it('a country browse is capped, and says so by taking the ordered head', async () => {
        await getInstantHotelCatalog({ countryCode: 'JP' } as any);

        expect(lastTake()).toBe(300);
        expect(db.findMany.mock.calls.at(-1)![0].orderBy).toEqual({
            review_count: { sort: 'desc', nulls: 'last' },
        });
    });

    it('a named property asks for that property and no geography', async () => {
        await getInstantHotelCatalog({ hotelCode: 'h-1', cityName: 'Tokyo', countryCode: 'JP' } as any);

        expect(lastWhere().hotel_id).toBe('h-1');
        expect(lastWhere().OR).toBeUndefined();
        expect(lastWhere().country).toBeUndefined();
        expect(lastTake()).toBe(1);
    });

    /**
     * Naming a country is the weakest thing a traveller can say, so anything more specific
     * wins. "Japan" with a Kyoto pin is a Kyoto search, not forty thousand hotels.
     */
    it('coordinates beat a country', async () => {
        await getInstantHotelCatalog({ countryCode: 'JP', lat: 35.0, lng: 135.76 } as any);

        expect(lastWhere().lat).toMatchObject({ gte: expect.any(Number), lte: expect.any(Number) });
        expect(lastWhere().country).toBeUndefined();
        expect(lastTake()).toBe(1000);
    });

    it('a city beats a country', async () => {
        await getInstantHotelCatalog({ countryCode: 'JP', cityName: 'Kyoto' } as any);

        expect(lastWhere().OR).toBeDefined();
        expect(lastWhere().country).toMatchObject({ mode: 'insensitive' });
    });
});
