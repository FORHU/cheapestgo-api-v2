import { describe, it, expect } from 'vitest';
import { matchAliasQuery } from '@/lib/cityAliases';

describe('matchAliasQuery — strict tiers are unchanged', () => {
    it('still resolves an exact key', () => {
        expect(matchAliasQuery('manhattan')[0]).toMatchObject({ alias: 'manhattan', canonicalCity: 'New York', countryCode: 'US' });
    });

    it('still resolves a prefix of a key', () => {
        expect(matchAliasQuery('manhat').map((m) => m.canonicalCity)).toContain('New York');
    });

    it('collapses a destination\'s several keys into one suggestion', () => {
        const out = matchAliasQuery('clark');
        expect(out.filter((m) => m.canonicalCity === 'Angeles' && m.countryCode === 'PH')).toHaveLength(1);
    });

    it('returns nothing for a query that is too short', () => {
        expect(matchAliasQuery('m')).toEqual([]);
    });
});

describe('matchAliasQuery — typo tolerance', () => {
    it('finds a destination despite a dropped letter', () => {
        expect(matchAliasQuery('manhatan').map((m) => m.canonicalCity)).toContain('New York');
    });

    it('finds a destination despite a transposition', () => {
        expect(matchAliasQuery('manhatatn').map((m) => m.canonicalCity)).toContain('New York');
        expect(matchAliasQuery('claark').map((m) => m.canonicalCity)).toContain('Angeles');
    });

    it('only reaches for fuzziness when no strict tier matched', () => {
        const strict = matchAliasQuery('manhattan');
        expect(strict[0].alias).toBe('manhattan');
        // An exact hit is never displaced by a near miss.
        expect(strict.every((m) => m.alias !== 'manhatan')).toBe(true);
    });

    it('does not guess from the first letter being wrong', () => {
        expect(matchAliasQuery('wanhattan')).toEqual([]);
    });

    it('does not guess from short or unrelated text', () => {
        expect(matchAliasQuery('zzzzqx')).toEqual([]);
        // Three letters is too little to tell a typo from a different word.
        expect(matchAliasQuery('mxn')).toEqual([]);
    });

    it('respects the limit and keeps one suggestion per destination', () => {
        const out = matchAliasQuery('manhatan', 1);
        expect(out).toHaveLength(1);
    });

    it('is deterministic', () => {
        expect(matchAliasQuery('manhatan')).toEqual(matchAliasQuery('manhatan'));
    });
});
