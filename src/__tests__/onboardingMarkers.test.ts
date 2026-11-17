import { describe, it, expect } from 'vitest';
import { initialPreferences, readOnboarding, ONBOARDING_KEY } from '@/lib/users/onboarding';

/**
 * The markers that decide whether a traveller is shown onboarding. See mobile #62 and ADR-0005.
 *
 * Three states, told apart by two markers. Getting the "neither" case wrong is the expensive
 * one in both directions: read as unfinished, every existing account is walled out of an app
 * it already uses; read as finished, every account made through Google skips onboarding for
 * good, because `/auth/google/native` never says it just created the row.
 */
describe('onboarding markers', () => {
    it('a new account starts with a start and no completion', () => {
        const prefs = initialPreferences(new Date('2026-11-16T02:00:00.000Z'));

        expect(prefs[ONBOARDING_KEY].startedAt).toBe('2026-11-16T02:00:00.000Z');
        expect(readOnboarding(prefs)).toEqual({ startedAt: '2026-11-16T02:00:00.000Z' });
        expect(readOnboarding(prefs).completedAt).toBeUndefined();
    });

    it('an account from before onboarding existed carries neither marker', () => {
        // What every existing row looks like: preferences the web wrote, and nothing else.
        expect(readOnboarding({ displayCurrency: 'PHP', language: 'en' })).toEqual({});
        expect(readOnboarding({})).toEqual({});
        expect(readOnboarding(null)).toEqual({});
    });

    it('a finished account carries both', () => {
        const prefs = {
            displayCurrency: 'PHP',
            [ONBOARDING_KEY]: { startedAt: '2026-11-16T02:00:00.000Z', completedAt: '2026-11-16T02:04:00.000Z' },
        };
        expect(readOnboarding(prefs)).toEqual({
            startedAt:   '2026-11-16T02:00:00.000Z',
            completedAt: '2026-11-16T02:04:00.000Z',
        });
    });

    it('treats a malformed value as nothing stated rather than throwing', () => {
        // Preferences are a blob any client may replace wholesale, so this is reachable.
        expect(readOnboarding({ [ONBOARDING_KEY]: 'yes' })).toEqual({});
        expect(readOnboarding({ [ONBOARDING_KEY]: ['started'] })).toEqual({});
        expect(readOnboarding({ [ONBOARDING_KEY]: { startedAt: 12345 } })).toEqual({});
        expect(readOnboarding('not an object')).toEqual({});
    });

    it('does not carry an empty string through as a marker', () => {
        // An empty string is falsy but is still a string: without the second check it would
        // read as "started", and that traveller would be asked to resume a flow forever.
        expect(readOnboarding({ [ONBOARDING_KEY]: { startedAt: '' } })).toEqual({});
    });
});
