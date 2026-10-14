import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { findEtgHidByName } from '@/lib/hotels/roomGroups';

/**
 * Resolving a hotel to its ETG slug by name.
 *
 * `hotel_content` is keyed by TGX's numeric code; ETG files the same hotel under a slug,
 * and only ETG's bulk dump carries both. A hotel the dump has not reached therefore has no
 * route to its room photographs at all — 81,758 live hotels on 2026-10-02 — and this is
 * what closes that gap between dump runs.
 *
 * Every test here is really the same test: that it would rather return nothing than return
 * the wrong hotel. The result is written to the shared catalog and rendered on a page
 * somebody books from, so a near miss is not a smaller version of a hit.
 */

const ETG_MULTICOMPLETE = 'https://api.worldota.net/api/b2b/v3/search/multicomplete/';

const respondWith = (hotels: unknown[], ok = true) => {
    const fetchMock = vi.fn(async () => ({
        ok,
        status: ok ? 200 : 500,
        json: async () => ({ data: { hotels } }),
    }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

beforeEach(() => {
    process.env.ETG_KEY_ID = 'test-key';
    process.env.ETG_API_KEY = 'test-secret';
});

afterEach(() => vi.unstubAllGlobals());

describe('findEtgHidByName', () => {
    it('finds the hotel whose name matches', async () => {
        respondWith([
            { id: 'other_hotel', name: 'Somewhere Else' },
            { id: 'parque_espana_residence_hotel', name: 'Parque Espana Residence Hotel' },
        ]);

        await expect(findEtgHidByName('Parque Espana Residence Hotel'))
            .resolves.toBe('parque_espana_residence_hotel');
    });

    it('looks past punctuation and spacing, which the two suppliers disagree about', async () => {
        respondWith([{ id: 'hotel_sogo_alabang', name: 'Hotel  SOGO - Alabang' }]);

        await expect(findEtgHidByName('Hotel Sogo Alabang')).resolves.toBe('hotel_sogo_alabang');
    });

    it('refuses a near match rather than guessing', async () => {
        // A different property, and its photographs are of a different building.
        respondWith([{ id: 'parque_espana_hotel_cebu', name: 'Parque Espana Hotel Cebu' }]);

        await expect(findEtgHidByName('Parque Espana Residence Hotel')).resolves.toBeNull();
    });

    it('refuses when two hotels share the name, because that choice cannot be made here', async () => {
        // A chain's two branches in one city. Picking either is wrong half the time.
        respondWith([
            { id: 'go_hotels_north_edsa', name: 'Go Hotels' },
            { id: 'go_hotels_mandaluyong', name: 'Go Hotels' },
        ]);

        await expect(findEtgHidByName('Go Hotels')).resolves.toBeNull();
    });

    it('returns nothing when ETG finds nothing', async () => {
        respondWith([]);
        await expect(findEtgHidByName('A Hotel That Does Not Exist')).resolves.toBeNull();
    });

    it('returns nothing, rather than throwing, when ETG refuses', async () => {
        respondWith([], false);
        await expect(findEtgHidByName('Parque Espana Residence Hotel')).resolves.toBeNull();
    });

    it('does not call the supplier at all without a name', async () => {
        const fetchMock = respondWith([]);
        await expect(findEtgHidByName('')).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not call the supplier without credentials', async () => {
        delete process.env.ETG_KEY_ID;
        delete process.env.ETG_API_KEY;
        delete process.env.RATEHAWK_KEY_ID;
        delete process.env.RATEHAWK_API_KEY;
        const fetchMock = respondWith([]);

        await expect(findEtgHidByName('Parque Espana Residence Hotel')).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('asks ETG for the hotel by name', async () => {
        const fetchMock = respondWith([]);
        await findEtgHidByName('Roynet Hotel Seoul Mapo');

        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(ETG_MULTICOMPLETE);
        expect(JSON.parse(String(init.body))).toMatchObject({ query: 'Roynet Hotel Seoul Mapo' });
    });
});
