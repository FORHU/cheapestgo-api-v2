import { describe, it, expect } from 'vitest';
import {
    otvCodeToLabel,
    etgRoomAmenityToLabel,
    normalizeStoredAmenity,
    normalizeAmenityList,
} from '@/lib/hotels/amenityCodes';

/**
 * C1a: the amenity vocabulary was 91 of v1's 234 OTV codes, and had none of the
 * 65 ETG room slugs. Anything unmapped falls through a prettifier, so a Spanish
 * or Russian supplier label reached an English page untouched.
 */

describe('otvCodeToLabel', () => {
    it('maps known OTV codes', () => {
        expect(otvCodeToLabel('FREE_WIFI')).toBe('Free WiFi');
        expect(otvCodeToLabel('SWIMMING_POOL')).toBe('Swimming Pool');
    });

    it('is case- and whitespace-insensitive', () => {
        expect(otvCodeToLabel('  free_wifi  ')).toBe('Free WiFi');
    });

    it('prettifies an unknown code rather than dropping it', () => {
        expect(otvCodeToLabel('SOME_NEW_THING')).toBe('Some New Thing');
    });

    it('returns empty for nothing', () => {
        expect(otvCodeToLabel('')).toBe('');
        expect(otvCodeToLabel(null)).toBe('');
        expect(otvCodeToLabel(undefined)).toBe('');
    });
});

describe('etgRoomAmenityToLabel', () => {
    it('maps ETG room slugs, which api-v2 previously had none of', () => {
        expect(etgRoomAmenityToLabel('air-conditioning')).toBeTruthy();
        expect(etgRoomAmenityToLabel('air-conditioning')).not.toBe('Air-Conditioning');
    });

    it('prettifies an unknown slug', () => {
        expect(etgRoomAmenityToLabel('some-new-slug')).toBe('Some New Slug');
    });

    it('returns empty for nothing', () => {
        expect(etgRoomAmenityToLabel('')).toBe('');
    });
});

describe('normalizeStoredAmenity', () => {
    it('re-translates a stored non-English label back to English', () => {
        // The bug this exists for: rows hold labels prettified from a non-English
        // supplier code, and rendering them raw shows Spanish on an English page.
        expect(normalizeStoredAmenity('Aire Acondicionado')).toBe('Air Conditioning');
    });

    it('leaves an already-English label alone', () => {
        expect(normalizeStoredAmenity('Free WiFi')).toBe('Free WiFi');
    });

    it('passes through something it does not recognise', () => {
        expect(normalizeStoredAmenity('Rooftop Helipad')).toBe('Rooftop Helipad');
    });

    it('handles empty input', () => {
        expect(normalizeStoredAmenity('')).toBe('');
    });
});

describe('normalizeAmenityList', () => {
    it('handles the mixed shapes hotel_content actually stores', () => {
        // Plain strings from older prettified rows, `{ code }` objects from TGX.
        expect(normalizeAmenityList(['Aire Acondicionado', { code: 'FREE_WIFI' }]))
            .toEqual(['Air Conditioning', 'Free WiFi']);
    });

    it('drops entries that are neither', () => {
        expect(normalizeAmenityList([null, undefined, {}, 42, 'Free WiFi']))
            .toEqual(['Free WiFi']);
    });

    it('returns an empty list for a non-array', () => {
        expect(normalizeAmenityList(null)).toEqual([]);
        expect(normalizeAmenityList(undefined)).toEqual([]);
        expect(normalizeAmenityList('Free WiFi')).toEqual([]);
    });
});
