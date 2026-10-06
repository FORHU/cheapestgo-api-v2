import { describe, it, expect } from 'vitest';
import { isConfirmedOutOfCountry } from '@/lib/geo/countryBoxes';

/**
 * Which hotels a search drops as "confirmed out of country". The box alone used to decide,
 * and the 2026-09-14 audit found it dropping real hotels in popular places. Every hotel
 * below is a real row pattern from that audit.
 */

describe('hotels the old boxes dropped are kept', () => {
    it.each([
        ['Montevideo', 'UY', -34.91, -56.19],
        ['Punta del Este', 'UY', -34.96, -54.94],
        ['Puerto Ayora (Galápagos)', 'EC', -0.74, -90.31],
        ['Montego Bay', 'JM', 18.47, -77.92],
        ['Dakar', 'SN', 14.69, -17.47],
        ['Magong (Penghu)', 'TW', 23.57, 119.58],
        ['Hanga Roa (Easter Island)', 'CL', -27.15, -109.43],
        ['Byron Bay', 'AU', -28.64, 153.61],
    ])('%s', (city, country, lat, lng) => {
        expect(isConfirmedOutOfCountry({ country, city, lat, lng }, country)).toBe(false);
    });

    it('Guam searched as GU, though stored as US', () => {
        expect(isConfirmedOutOfCountry({ country: 'US', city: 'Tumon', lat: 13.51, lng: 144.8 }, 'GU')).toBe(false);
    });

    it('a hotel just past a box edge with no country stored (within the buffer)', () => {
        expect(isConfirmedOutOfCountry({ country: null, city: 'Montevideo', lat: -34.91, lng: -56.19 }, 'UY')).toBe(false);
    });
});

describe('hotels that really are elsewhere are dropped', () => {
    it('Paris, Texas in a Paris, France search', () => {
        expect(isConfirmedOutOfCountry({ country: 'US', city: 'Paris', lat: 33.66, lng: -95.55 }, 'FR')).toBe(true);
    });

    it('no country stored, but coordinates on another continent', () => {
        expect(isConfirmedOutOfCountry({ country: '', city: 'Paris', lat: 33.66, lng: -95.55 }, 'FR')).toBe(true);
    });

    it('Shenzhen in a Hong Kong search, though it sits inside Hong Kong\'s box', () => {
        expect(isConfirmedOutOfCountry({ country: 'CN', city: 'Shenzhen', lat: 22.53, lng: 114.05 }, 'HK')).toBe(true);
    });
});

describe('unknowns are kept — one signal is never enough', () => {
    it('no country and no coordinates', () => {
        expect(isConfirmedOutOfCountry({}, 'FR')).toBe(false);
    });

    it('a different country, but no coordinates to agree with it', () => {
        // `hotel_content` rows carry a country seeded by whatever search first saw them.
        expect(isConfirmedOutOfCountry({ country: 'US', city: 'Paris' }, 'FR')).toBe(false);
    });

    it('a different country in one of the 32 countries with no box', () => {
        expect(isConfirmedOutOfCountry({ country: 'ZW', city: 'Harare', lat: -17.8, lng: 31.0 }, 'ZM')).toBe(false);
    });

    it('no searched country', () => {
        expect(isConfirmedOutOfCountry({ country: 'US', lat: 33.66, lng: -95.55 }, '')).toBe(false);
    });
});
