import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted: vi.mock is lifted above the file, so the spy has to be created with it.
const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { hotel_content: { findMany: db.findMany } } }));
vi.mock('@/lib/maintenance', () => ({ staysUnderMaintenance: vi.fn().mockResolvedValue(false) }));

import { getInstantHotelCatalog } from '@/lib/hotels/search';

/** Tokyo, as the destination picker resolves it. */
const TOKYO = { lat: 35.688985, lng: 139.692912 };

/** Real coordinates, measured against this anchor on 2026-11-06. */
const ROWS = [
    { hotel_id: 'h-edogawa',  name: 'Rembrandt Nishikasai', lat: 35.6760, lng: 139.8030, city: 'Tokyo', country: 'JP', address: 'Nishikasai, Tokyo',  images: ['a.jpg'] }, // 10.0km
    { hotel_id: 'h-hachioji', name: 'Hachioji Sky Hotel',   lat: 35.6560, lng: 139.3390, city: 'Tokyo', country: 'JP', address: 'Youkamachi, Tokyo',  images: ['b.jpg'] }, // ~32km
    { hotel_id: 'h-shinjuku', name: 'Shinjuku Inn',         lat: 35.6896, lng: 139.6917, city: 'Tokyo', country: 'JP', address: 'Shinjuku, Tokyo',    images: ['c.jpg'] }, // ~0.1km
];

const byId = (out: any[], id: string) => out.find(h => h.id === id);

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    db.findMany.mockResolvedValue(ROWS);
});

/**
 * ADR-0051. The hotels a Tokyo search returns are all genuinely Tokyo — Hachioji is Tokyo
 * Metropolis — so nothing is filtered out. What the card gains is the distance, and only where
 * that distance is far for the rung the traveller picked.
 */
describe('the instant catalog carries how far each hotel is', () => {
    it('speaks for a far hotel and stays quiet for a central one, on a city search', async () => {
        const out = await getInstantHotelCatalog({ ...TOKYO, cityName: 'Tokyo', rung: 'city' } as any);

        expect(out).toHaveLength(3);
        expect(byId(out, 'h-hachioji').distanceKm).toBeGreaterThan(25);   // ~32km, past the 15km city threshold
        expect(byId(out, 'h-edogawa').distanceKm).toBeNull();             // 10km, inside the 15km threshold
        expect(byId(out, 'h-shinjuku').distanceKm).toBeNull();            // next door
    });

    /**
     * `rung` is downgraded to 'city' for a sub-area search and `areaRung` keeps what was picked.
     * Judged at the city threshold, a district search would never say anything.
     */
    it('judges a sub-area search by the rung the traveller actually picked', async () => {
        const city     = await getInstantHotelCatalog({ ...TOKYO, cityName: 'Tokyo', rung: 'city' } as any);
        const district = await getInstantHotelCatalog({ ...TOKYO, cityName: 'Tokyo', rung: 'city', areaRung: 'district' } as any);

        // 10km: quiet against a city's 15km, loud against a district's 5km.
        expect(byId(city, 'h-edogawa').distanceKm).toBeNull();
        expect(byId(district, 'h-edogawa').distanceKm).toBeGreaterThan(5);
    });

    it('says nothing on a rung with no anchor worth measuring from', async () => {
        const out = await getInstantHotelCatalog({ ...TOKYO, cityName: 'Tokyo', rung: 'country' } as any);
        expect(out.map(h => h.distanceKm)).toEqual([null, null, null]);
    });

    it('says nothing when the search carried no coordinates', async () => {
        const out = await getInstantHotelCatalog({ cityName: 'Tokyo', rung: 'city' } as any);
        expect(out.every(h => h.distanceKm === null)).toBe(true);
    });

    /** The distance is added to the card, never used to drop one. */
    it('removes no hotel that the search already returned', async () => {
        const out = await getInstantHotelCatalog({ ...TOKYO, cityName: 'Tokyo', rung: 'city' } as any);
        expect(out.map(h => h.id).sort()).toEqual(['h-edogawa', 'h-hachioji', 'h-shinjuku']);
    });
});
