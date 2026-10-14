import { describe, it, expect } from 'vitest';
import { hotelLocationNames } from '@/lib/geo/hotelLocation';

/**
 * Which rows of `hotel_content` a search actually looks at. Both corrections below cost a
 * city hotels when they are missing — the territory one costs it all of them.
 */
describe('hotelLocationNames', () => {
    it('asks for every spelling the catalog files a city under', () => {
        // Seoul is stored as "Seoul" and "Seúl"; one name finds roughly half the city.
        const { cityNames } = hotelLocationNames('Seoul', 'KR');
        expect(cityNames.length).toBeGreaterThan(1);
        expect(cityNames.map(n => n.toLowerCase())).toContain('seoul');
    });

    it('drops anything after a comma, so "Cebu City, Philippines" is a city', () => {
        const { cityNames } = hotelLocationNames('Cebu City, Philippines', 'PH');
        expect(cityNames.every(n => !n.includes(','))).toBe(true);
    });

    it('looks for Hong Kong hotels under CN as well as HK', () => {
        // QA BG-8: every Hong Kong hotel is stored with country CN, so a search matching
        // country = 'HK' alone found none of them.
        const { countryCodes } = hotelLocationNames('Hong Kong', 'HK');
        expect(countryCodes).toContain('hk');
        expect(countryCodes).toContain('cn');
    });

    it('and under every district it is filed as, not just "Hong Kong"', () => {
        const { cityNames } = hotelLocationNames('Hong Kong', 'HK');
        expect(cityNames).toContain('kowloon');
        expect(cityNames).toContain('tsim sha tsui');
    });

    it('treats a Hong Kong district searched on its own the same way', () => {
        const { cityNames, countryCodes } = hotelLocationNames('Kowloon', 'HK');
        expect(cityNames).toContain('hong kong');
        expect(countryCodes).toContain('cn');
    });

    it('does not widen an ordinary city to its neighbours', () => {
        const { countryCodes } = hotelLocationNames('Tokyo', 'JP');
        expect(countryCodes).toEqual(['jp']);
    });

    it('puts no country in scope when the search names none', () => {
        expect(hotelLocationNames('Paris').countryCodes).toBeNull();
    });

    it('ignores a country that is not an ISO code', () => {
        // The search bar sends free text as often as a code.
        expect(hotelLocationNames('Paris', 'France').countryCodes).toBeNull();
    });
});
