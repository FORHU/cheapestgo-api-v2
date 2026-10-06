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

    it('reads a double-encoded column, which is what the rows with data looked like', () => {
        // jsonb holding a JSON *string* of the array rather than the array. `Array.isArray`
        // was false for exactly the rows that had amenities, so the list came back empty
        // and the caller fell through to raw supplier text — the real reason untranslated
        // German and Italian reached the page.
        expect(normalizeAmenityList('["Aire Acondicionado","Gepäcklagerung"]'))
            .toEqual(['Air Conditioning', 'Luggage Storage']);
    });

    it('handles a double-encoded column of TGX code objects too', () => {
        expect(normalizeAmenityList('[{"code":"FREE_WIFI"}]')).toEqual(['Free WiFi']);
    });

    it('returns empty for a string that parses to something other than a list', () => {
        expect(normalizeAmenityList('{"not":"a list"}')).toEqual([]);
        expect(normalizeAmenityList('42')).toEqual([]);
    });
});

/**
 * Non-English supplier codes. OTV sends amenity codes in the property's own language
 * for 22% of stored labels, and both lookup directions used to disagree on the key
 * shape — so a supplier sending spaced text missed entries the map already held, and
 * the fallback prettifier mangled accented words into "GepäCklagerung".
 */
describe('non-English supplier codes', () => {
    it('maps German, Spanish, Italian and Dutch codes', () => {
        expect(otvCodeToLabel('GEPACKLAGERUNG')).toBe('Luggage Storage');
        expect(otvCodeToLabel('RECEPCION_LAS_24_HORAS')).toBe('24-Hour Reception');
        expect(otvCodeToLabel('CAMERE_NON_FUMATORI')).toBe('Non-Smoking Rooms');
        expect(otvCodeToLabel('TELEVISIE_IN_DE_LOBBY')).toBe('TV in Lobby');
    });

    it('matches the same amenity sent as spaced text, not just as a code', () => {
        // OTV sends both forms. Only the underscored one used to match.
        expect(otvCodeToLabel('CONSIGNA_DE_EQUIPAJES')).toBe('Luggage Storage');
        expect(otvCodeToLabel('Consigna de equipajes')).toBe('Luggage Storage');
    });

    it('matches through accents, so the accented spelling resolves too', () => {
        expect(otvCodeToLabel('Gepäcklagerung')).toBe('Luggage Storage');
        expect(otvCodeToLabel('Recepción las 24 horas')).toBe('24-Hour Reception');
    });

    it('treats a hyphen as a separator, like a space or a slash', () => {
        expect(otvCodeToLabel('NON-SMOKING ROOMS')).toBe('Non-Smoking Rooms');
    });

    it('no longer capitalises the letter after an accent when prettifying', () => {
        // The GepäCklagerung defect: `\b\w` sees an accented letter as a word
        // boundary, so the *next* character got uppercased. This code is unmapped
        // on purpose — it exercises the fallback, not the dictionary.
        expect(otvCodeToLabel('FRUHSTUCKSRAUM_TEST')).toBe('Fruhstucksraum Test');
        expect(otvCodeToLabel('FRÜHSTÜCKSRAUM_TEST')).toBe('Frühstücksraum Test');
    });
});

describe('normalizeStoredAmenity, on the labels already in hotel_content', () => {
    it('re-translates a stored non-English label without a backfill', () => {
        // The prettifier is reversible, so ~178k stored rows are fixed on read.
        expect(normalizeStoredAmenity('Gepäcklagerung')).toBe('Luggage Storage');
        expect(normalizeStoredAmenity('Recepción Las 24 Horas')).toBe('24-Hour Reception');
    });

    it('repairs mangled capitalisation on a label it cannot translate', () => {
        // Stored by the old prettifier. Unmapped, so the best it can do is stop it
        // looking broken.
        expect(normalizeStoredAmenity('FrüHstüCksraum')).toBe('Frühstücksraum');
    });

    it('leaves a deliberate inner capital in an English label alone', () => {
        expect(normalizeStoredAmenity('Free WiFi')).toBe('Free WiFi');
    });
});
