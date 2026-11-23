import { describe, it, expect } from 'vitest';
import { buildSearchKeyForTests as buildSearchKey } from '@/lib/hotels/search';

/**
 * What makes two hotel searches the same question. See ADR-0005.
 *
 * This key has always decided which searches share one in-flight supplier call. It now also
 * decides what a cached answer is reused for, which raises the cost of getting it wrong from
 * a moment to five minutes: two travellers who asked different questions being handed the
 * same answer, and nothing on either screen looking wrong.
 *
 * Currency, children's ages and room count were all missing. Currency is the serious one — it
 * is sent to OTV as the target, so it changes the prices that come back.
 */
describe('what counts as the same search', () => {
    const base = {
        cityName: 'Seoul',
        checkin: '2026-12-01',
        checkout: '2026-12-04',
        adults: 2,
        children: 0,
        currency: 'PHP',
    } as const;

    it('the same question is the same key', () => {
        expect(buildSearchKey({ ...base })).toBe(buildSearchKey({ ...base }));
    });

    it('a different currency is a different question', () => {
        // The prices differ, so the answers must not be shared.
        expect(buildSearchKey({ ...base, currency: 'USD' }))
            .not.toBe(buildSearchKey({ ...base, currency: 'PHP' }));
    });

    it('currency is compared case-insensitively', () => {
        // Same question typed two ways; splitting it would just halve the hit rate.
        expect(buildSearchKey({ ...base, currency: 'php' }))
            .toBe(buildSearchKey({ ...base, currency: 'PHP' }));
    });

    it("children's ages are a different question", () => {
        // A 2-year-old and a 15-year-old are not priced alike.
        expect(buildSearchKey({ ...base, children: 1, childrenAges: [2] }))
            .not.toBe(buildSearchKey({ ...base, children: 1, childrenAges: [15] }));
    });

    it('the same ages in a different order are the same question', () => {
        expect(buildSearchKey({ ...base, children: 2, childrenAges: [9, 4] }))
            .toBe(buildSearchKey({ ...base, children: 2, childrenAges: [4, 9] }));
    });

    it('room count is a different question', () => {
        // Two rooms for four adults is not one room for four.
        expect(buildSearchKey({ ...base, adults: 4, rooms: 2 }))
            .not.toBe(buildSearchKey({ ...base, adults: 4, rooms: 1 }));
    });

    it('dates, party and place still separate searches', () => {
        const keys = new Set([
            buildSearchKey({ ...base }),
            buildSearchKey({ ...base, checkin: '2026-12-02' }),
            buildSearchKey({ ...base, checkout: '2026-12-05' }),
            buildSearchKey({ ...base, adults: 3 }),
            buildSearchKey({ ...base, cityName: 'Tokyo' }),
            buildSearchKey({ ...base, guest_nationality: 'PH' }),
        ]);
        expect(keys.size).toBe(6);
    });

    it('a hotel search and a city search are never the same', () => {
        expect(buildSearchKey({ ...base, hotelCode: '6791942' }))
            .not.toBe(buildSearchKey({ ...base }));
    });
});
