/**
 * Choosing the ETG region a search is run against.
 *
 * ETG's multicomplete answers a name with every region that carries it, worldwide. Asked for
 * "Bali" on 2026-11-03 it returned Bali, Indonesia as a Province (State) — and four Cities called
 * Bali elsewhere. Taking the first City regardless of country sent every Bali search to Bali,
 * Crete: ETG priced Cretan hotels, the Bali bbox then bounded every one of them away, and the map
 * came back empty as if the island had no rooms.
 *
 * The fixtures are ETG's own answers, trimmed to the fields the choice reads.
 */

import { describe, it, expect } from 'vitest';
import { pickEtgRegion } from '@/lib/hotels/search';

const BALI = [
    { id: 602651,  type: 'Province (State)', name: 'Bali',               country_code: 'ID' },
    { id: 6035278, type: 'City',             name: 'Bali, Crete Island', country_code: 'GR' },
    { id: 6155835, type: 'City',             name: 'Bali',               country_code: 'TW' },
    { id: 6271832, type: 'City',             name: 'Bali, Goa',          country_code: 'IN' },
    { id: 6307804, type: 'City',             name: 'Bali',               country_code: 'CM' },
];

const PHUKET = [
    { id: 6046393,   type: 'Province (State)', name: 'Phuket Province',                country_code: 'TH' },
    { id: 1476,      type: 'City',             name: 'Phuket Town, Phuket Province',   country_code: 'TH' },
    { id: 965888267, type: 'City',             name: 'Thalang, Phuket Province',       country_code: 'TH' },
];

describe('pickEtgRegion', () => {
    it('answers a province search with the province, in its own country', () => {
        expect(pickEtgRegion(BALI, 'Bali', { iso: 'ID', rung: 'province' })).toBe(602651);
    });

    it('never takes another country\'s city when the country is known', () => {
        // The last-resort ETG fallback of a city search reaches here too. Indonesia has no City
        // called Bali, so its own province is the honest answer, and Crete is never one.
        expect(pickEtgRegion(BALI, 'Bali', { iso: 'ID', rung: 'city' })).toBe(602651);
    });

    it('still answers a city search with the city where both exist', () => {
        expect(pickEtgRegion(PHUKET, 'Phuket', { iso: 'TH', rung: 'city' })).toBe(1476);
        expect(pickEtgRegion(PHUKET, 'Phuket', { iso: 'TH' })).toBe(1476);
    });

    it('answers a province search with the province where both exist', () => {
        expect(pickEtgRegion(PHUKET, 'Phuket', { iso: 'TH', rung: 'province' })).toBe(6046393);
    });

    it('with no country to hold it to, takes the first city of that name, as before', () => {
        expect(pickEtgRegion(BALI, 'Bali', {})).toBe(6035278);
    });

    it('finds nothing when no region of that name is in the country', () => {
        expect(pickEtgRegion(BALI, 'Bali', { iso: 'JP', rung: 'city' })).toBeNull();
    });
});
