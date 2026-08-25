import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchEtgHotelContent, parseEtgHotel, ETG_FILTER_TO_LABEL } from '@/lib/hotels/etg';

/**
 * C1b: api-v2 fetched ETG names and amenities in two separate calls and never
 * took the description — 96.9% of the catalog has none, so property pages render
 * with no prose. This client takes all three in one call.
 */

const OLD_ENV = { ...process.env };

beforeEach(() => {
    process.env.ETG_KEY_ID  = 'test-key';
    process.env.ETG_API_KEY = 'test-secret';
});

afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.restoreAllMocks();
});

function mockEtg(hotels: unknown[]) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok:   true,
        json: async () => ({ data: { hotels } }),
    } as Response);
}

describe('parseEtgHotel', () => {
    // Both ETG lookup paths return the same hotel shape. The hid path — the only
    // one that runs, since every catalog id is numeric — read `amenity_groups`
    // alone and discarded the description arriving in the same response.
    it('prefers amenity_groups where ETG provides them', () => {
        const out = parseEtgHotel({
            name: 'X',
            amenity_groups: [{ amenities: ['Rooftop bar', 'Pillow menu'] }],
            serp_filters:   ['has_pool'],
        });
        expect(out.amenities).toEqual(['Rooftop bar', 'Pillow menu']);
    });

    it('falls back to serp_filters when the groups are empty', () => {
        // Covers hotels the richer list does not reach.
        const out = parseEtgHotel({ name: 'X', amenity_groups: [], serp_filters: ['has_pool', 'has_bar'] });
        expect(out.amenities).toEqual(['Swimming Pool', 'Bar']);
    });

    it('extracts the description the hid path used to throw away', () => {
        const out = parseEtgHotel({
            name: 'X',
            description_struct: [{ paragraphs: ['One.'] }, { paragraphs: ['Two.'] }],
        });
        expect(out.description).toBe('One.\n\nTwo.');
    });

    it('returns an empty object for a hotel with nothing usable', () => {
        expect(parseEtgHotel({})).toEqual({});
        expect(parseEtgHotel(null)).toEqual({});
    });
});

describe('fetchEtgHotelContent', () => {
    it('takes name, description and amenities from one response', async () => {
        mockEtg([{
            id:   'hotel_a',
            name: 'The Grand',
            description_struct: [
                { title: 'Location', paragraphs: ['By the river.', 'Near the station.'] },
                { title: 'Rooms',    paragraphs: ['Rooms have a view.'] },
            ],
            serp_filters: ['has_internet', 'has_pool'],
        }]);

        const out = await fetchEtgHotelContent(['hotel_a']);
        const entry = out.get('hotel_a')!;

        expect(entry.name).toBe('The Grand');
        // Sections are flattened into prose, in order, separated by blank lines.
        expect(entry.description).toBe('By the river.\n\nNear the station.\n\nRooms have a view.');
        expect(entry.amenities).toEqual(['Free WiFi', 'Swimming Pool']);
    });

    it('maps serp_filters, not amenity_groups', () => {
        // The vocabulary v1 reads: smaller, cleaner, present on more hotels.
        expect(ETG_FILTER_TO_LABEL['has_internet']).toBe('Free WiFi');
        expect(ETG_FILTER_TO_LABEL['has_air_conditioner']).toBe('Air Conditioning');
    });

    it('drops filters it has no label for rather than emitting the raw slug', async () => {
        mockEtg([{ id: 'h', name: 'X', serp_filters: ['has_pool', 'has_teleporter'] }]);
        expect((await fetchEtgHotelContent(['h'])).get('h')!.amenities).toEqual(['Swimming Pool']);
    });

    it('omits absent fields instead of writing empty ones', async () => {
        // An entry that claimed an empty description would overwrite a good one
        // on upsert, so absence has to stay absence.
        mockEtg([{ id: 'h', name: 'Only A Name' }]);
        const entry = (await fetchEtgHotelContent(['h'])).get('h')!;
        expect(entry).toEqual({ name: 'Only A Name' });
        expect('description' in entry).toBe(false);
        expect('amenities' in entry).toBe(false);
    });

    it('skips a hotel that yielded nothing at all', async () => {
        mockEtg([{ id: 'h' }]);
        expect((await fetchEtgHotelContent(['h'])).size).toBe(0);
    });

    it('returns empty without credentials rather than calling out', async () => {
        delete process.env.ETG_KEY_ID;
        const spy = vi.spyOn(globalThis, 'fetch');
        expect((await fetchEtgHotelContent(['h'])).size).toBe(0);
        expect(spy).not.toHaveBeenCalled();
    });

    it('returns empty for an empty request', async () => {
        const spy = vi.spyOn(globalThis, 'fetch');
        expect((await fetchEtgHotelContent([])).size).toBe(0);
        expect(spy).not.toHaveBeenCalled();
    });

    it('survives a failing response', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
        await expect(fetchEtgHotelContent(['h'])).resolves.toEqual(new Map());
    });

    it('survives a thrown request', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket hang up'));
        await expect(fetchEtgHotelContent(['h'])).resolves.toEqual(new Map());
    });

    it('batches in 500s', async () => {
        const spy = mockEtg([]);
        await fetchEtgHotelContent(Array.from({ length: 1100 }, (_, i) => `h${i}`));
        expect(spy).toHaveBeenCalledTimes(3);
    });
});
