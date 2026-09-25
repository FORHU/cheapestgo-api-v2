/**
 * Pictures for hotels the catalog has none for.
 *
 * Reported 2026-09-25: some hotels in v2 showed no image at all. The catalog query already
 * requires one, so the gap is the supplier's own hotels — ones OTV returns that no catalog row
 * covers yet. v1 streams these in after the results; api-v2 sent nothing at all.
 *
 * The fetch itself is mocked here: what is worth pinning is which media become a picture, which
 * names are allowed to overwrite a real one, and that a failure costs a search its photos
 * rather than its results.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const tgx = vi.hoisted(() => ({ tgxGraphQL: vi.fn(), getTgxConfig: vi.fn(() => ({ accessCode: 'ACC' })) }));
vi.mock('@/lib/hotels/travelgatex', () => tgx);

import { fetchHotelContentPatches } from '@/lib/hotels/contentPatches';

const answer = (hotelData: unknown[]) =>
    tgx.tgxGraphQL.mockResolvedValue({
        data: { hotelX: { hotels: { edges: hotelData.map(h => ({ node: { hotelData: h } })) } } },
    });

describe('fetchHotelContentPatches', () => {
    beforeEach(() => vi.clearAllMocks());

    it('asks for nothing when nothing is missing', async () => {
        expect(await fetchHotelContentPatches([])).toEqual(new Map());
        expect(tgx.tgxGraphQL).not.toHaveBeenCalled();
    });

    it('turns media into pictures', async () => {
        answer([{ code: 'H1', medias: [{ url: 'https://x/1.jpg', type: 'photo' }] }]);
        const patches = await fetchHotelContentPatches(['H1']);
        expect(patches.get('H1')?.images).toEqual(['https://x/1.jpg']);
    });

    it('leaves out the moving pictures', async () => {
        // A card shows a still. A virtual tour in an <img> is a broken image.
        answer([{ code: 'H1', medias: [
            { url: 'https://x/tour.mp4', type: 'VIDEO' },
            { url: 'https://x/spin.jpg', type: 'panoramic' },
            { url: 'https://x/room.jpg', type: 'photo' },
        ] }]);
        expect((await fetchHotelContentPatches(['H1'])).get('H1')?.images).toEqual(['https://x/room.jpg']);
    });

    it('keeps a real name and refuses a slug', async () => {
        // A patch overwrites what is on screen, and "hotel-oscar-daegu" is an identifier
        // somebody generated, not a name somebody wrote.
        answer([
            { code: 'H1', hotelName: 'Hotel Oscar', medias: [{ url: 'https://x/1.jpg' }] },
            { code: 'H2', hotelName: 'hotel-oscar-daegu', medias: [{ url: 'https://x/2.jpg' }] },
        ]);
        const patches = await fetchHotelContentPatches(['H1', 'H2']);
        expect(patches.get('H1')?.name).toBe('Hotel Oscar');
        expect(patches.get('H2')?.name).toBeUndefined();
    });

    it('carries coordinates only when they are real', async () => {
        answer([
            { code: 'H1', medias: [{ url: 'https://x/1.jpg' }], location: { coordinates: { latitude: 14.4, longitude: 121.0 } } },
            { code: 'H2', medias: [{ url: 'https://x/2.jpg' }], location: { coordinates: { latitude: 0, longitude: 0 } } },
        ]);
        const patches = await fetchHotelContentPatches(['H1', 'H2']);
        expect(patches.get('H1')?.lat).toBe(14.4);
        // Null Island is the supplier saying it does not know, not a hotel in the Atlantic.
        expect(patches.get('H2')?.lat).toBeUndefined();
    });

    it('skips a hotel that carries nothing worth patching', async () => {
        answer([{ code: 'H1', medias: [] }]);
        expect((await fetchHotelContentPatches(['H1'])).size).toBe(0);
    });

    it('costs a search its pictures, never its results', async () => {
        tgx.tgxGraphQL.mockRejectedValue(new Error('content API down'));
        await expect(fetchHotelContentPatches(['H1'])).resolves.toEqual(new Map());
    });
});
