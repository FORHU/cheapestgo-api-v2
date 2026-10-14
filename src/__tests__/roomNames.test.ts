import { describe, it, expect } from 'vitest';
import {
    normalizeRoomName,
    isMeaningfulRoomName,
    extractRoomVariantLabel,
    pickBaseTitle,
} from '@/lib/hotels/roomNames';

/**
 * The rules from v1's `roomUtils`, which api-v2 had none of — it displayed and deduped
 * on TGX's raw name, so the rate leaked into card titles and a supplier code could title
 * a card outright. Only the rules crossed; v1's file is typed on LiteAPI's model.
 */

describe('normalizeRoomName', () => {
    it('strips the rate TGX appends to the name', () => {
        expect(normalizeRoomName('Standard Double room - Non-refundable')).toBe('Standard Double room');
        expect(normalizeRoomName('Standard Double room - Breakfast included')).toBe('Standard Double room');
        expect(normalizeRoomName('Standard Double room - Room only')).toBe('Standard Double room');
    });

    it('strips the parenthetical qualifiers, which are variants not identities', () => {
        expect(normalizeRoomName('Standard Single room (smoking, extra bed not included)'))
            .toBe('Standard Single room');
    });

    it('keeps the whole name when stripping would leave a supplier code', () => {
        // "U (Superior Double room)" — the identity is inside the parentheses, so
        // stripping them titles the card "U" and nobody can book from that.
        expect(normalizeRoomName('U (Superior Double room)')).toBe('U (Superior Double room)');
        expect(normalizeRoomName('S (Twin room)')).toBe('S (Twin room)');
    });

    it('leaves a genuinely short room name alone', () => {
        expect(normalizeRoomName('Loft')).toBe('Loft');
        expect(normalizeRoomName('Twin')).toBe('Twin');
    });

    it('handles both a qualifier and a rate suffix together', () => {
        expect(normalizeRoomName('Deluxe Double room (city view) - Non refundable'))
            .toBe('Deluxe Double room');
    });
});

describe('isMeaningfulRoomName', () => {
    it('rejects bare supplier codes', () => {
        expect(isMeaningfulRoomName('U')).toBe(false);
        expect(isMeaningfulRoomName(' S ')).toBe(false);
    });

    it('accepts a real name, however short', () => {
        expect(isMeaningfulRoomName('Loft')).toBe(true);
        expect(isMeaningfulRoomName('Bed')).toBe(true);
    });
});

describe('extractRoomVariantLabel', () => {
    it('returns what distinguishes one bookable variant from another', () => {
        expect(extractRoomVariantLabel('Standard Single room (smoking, extra bed not included)'))
            .toBe('smoking, extra bed not included');
    });

    it('joins several parentheticals', () => {
        expect(extractRoomVariantLabel('Deluxe (sea view) (smoking)')).toBe('sea view, smoking');
    });

    it('returns undefined when there is no variant', () => {
        expect(extractRoomVariantLabel('Deluxe Double room')).toBeUndefined();
    });
});

describe('pickBaseTitle', () => {
    it('prefers the shortest name, as the most general', () => {
        expect(pickBaseTitle(['Deluxe Double room', 'Deluxe Double room, city view']))
            .toBe('Deluxe Double room');
    });

    it('passes over a supplier code even though it is shortest', () => {
        expect(pickBaseTitle(['U', 'Superior Double room'])).toBe('Superior Double room');
    });

    it('falls back to a code only when every name is one', () => {
        expect(pickBaseTitle(['U', 'S'])).toBe('U');
    });

    it('handles an empty set', () => {
        expect(pickBaseTitle([])).toBe('');
    });
});
