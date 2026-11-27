import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { hotel_content: { findMany: db.findMany } } }));
vi.mock('@/config', () => ({ config: { MAPBOX_TOKEN: '' } }));
vi.mock('@/repositories/destinations.repository', () => ({
    DestinationsRepository: class { citiesWithHotels = vi.fn().mockResolvedValue([]); },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { DestinationsService } from '@/services/destinations.service';

/**
 * Suggesting a property by name, from the endpoint the clients actually call.
 *
 * `GET /hotels/destinations` is that endpoint — both app-v2 and the Flutter app read it, and
 * `/autocomplete` is mounted but called by nothing. Work put in the wrong one of those two is
 * invisible to every client, which is how this was first written.
 *
 * Mapbox is stubbed out (no token), so what is left is the catalogue half.
 */
const svc = new DestinationsService();
const HILTON = {
    hotel_id: 'h-99', name: 'Hilton Tokyo', city: 'Tokyo', country: 'JP', lat: 35.69, lng: 139.69,
};

beforeEach(() => {
    vi.clearAllMocks();
    db.findMany.mockResolvedValue([]);
});

describe('hotel suggestions', () => {
    it('offers a property, typed as one', async () => {
        db.findMany.mockResolvedValue([HILTON]);

        const out = await svc.autocomplete('hilton tokyo');
        const hotel = out.find(r => r.type === 'hotel');

        expect(hotel).toBeDefined();
        expect(hotel!.title).toBe('Hilton Tokyo');
        expect(hotel!.subtitle).toBe('Tokyo, JP');
    });

    /**
     * app-v2's `destination-input.tsx` pushes `/property/{d.id}` when a hotel is picked — it
     * was written for this before the API ever sent one. Putting the catalogue id anywhere
     * but `id` means the client routes to `/property/undefined`.
     */
    it('carries the catalogue id in `id`, which is what the clients read', async () => {
        db.findMany.mockResolvedValue([HILTON]);

        const hotel = (await svc.autocomplete('hilton tokyo')).find(r => r.type === 'hotel');

        expect(hotel!.id).toBe('h-99');
    });

    /**
     * With no place to lead with — Mapbox is stubbed out here — a property is the first thing
     * there is. This is the "Hilton Tokyo" case: a name that is a hotel and nothing else.
     */
    it('leads with a property when nothing else matched', async () => {
        db.findMany.mockResolvedValue([HILTON]);

        const out = await svc.autocomplete('hilton tokyo');

        expect(out[0].type).toBe('hotel');
    });

    /**
     * And does not, when something did.
     *
     * Properties ranked above every place once. "new york" matched three hotels named after the
     * city, both clients cut the list to three rows, and New York was not among them — the city
     * was in the response and off the bottom of a list the user could not scroll past. Rank here
     * decides what exists on screen, not merely what is on top of it.
     */
    it('does not bury the place a property is named after', async () => {
        db.findMany.mockResolvedValue([
            { hotel_id: 'h-1', name: 'New York-New York Hotel & Casino', city: 'Paradise', country: 'US', lat: 36.1, lng: -115.2 },
            { hotel_id: 'h-2', name: 'New York Hotel',  city: 'Johor Bahru', country: 'MY', lat: 1.49, lng: 103.74 },
            { hotel_id: 'h-3', name: 'Hostal New York', city: 'Barcelona',   country: 'ES', lat: 41.4, lng: 2.17 },
        ]);

        // Mapbox is stubbed out here, so the place that leads is the country list's own entry —
        // which is the same exit "new york" takes when the geocoder is down, and it used to put
        // all three hotels above it too.
        const out = await svc.autocomplete('united states');
        const firstHotel = out.findIndex(r => r.type === 'hotel');

        expect(out[0].type).toBe('country');
        expect(firstHotel).toBe(1);
        // All three are still offered — the fix is where they sit, not how many there are.
        expect(out.filter(r => r.type === 'hotel')).toHaveLength(3);
    });

    it('two letters are not a hotel search', async () => {
        await svc.autocomplete('to');
        expect(db.findMany).not.toHaveBeenCalled();
    });

    /**
     * The catalogue and the geocoder fail independently. Someone typing a city must still get
     * places when the hotel lookup is down — which is what the silent catch is for.
     */
    it('a catalogue failure does not take the rest of the list with it', async () => {
        db.findMany.mockRejectedValue(new Error('connection terminated'));

        const out = await svc.autocomplete('japan');

        expect(Array.isArray(out)).toBe(true);
        expect(out.some(r => r.type === 'country')).toBe(true);
    });

    /**
     * A landmark or an airport comes back from Mapbox with `rung: 'poi'` and coordinates, and
     * is typed `city` on purpose: app-v2 groups the list by country/city/hotel and drops
     * anything else, so typing them `poi` would hide airports that work today.
     */
    it('only three types are offered, so no client filters a result into nothing', async () => {
        db.findMany.mockResolvedValue([HILTON]);

        const out = await svc.autocomplete('hilton tokyo');

        for (const r of out) {
            expect(['city', 'country', 'hotel']).toContain(r.type);
        }
    });
});
