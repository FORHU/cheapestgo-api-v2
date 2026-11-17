/**
 * The two markers that say where an account stands with onboarding. See mobile #62.
 *
 * They live in `profiles.preferences`, the JSON the account already carries, rather than in a
 * column of their own: this project has no migration pipeline that runs, and the blob is
 * already created, read and written for exactly this kind of account state.
 *
 * Two markers and not one, because three states have to be told apart and a single boolean
 * only tells two:
 *
 *   - neither        an account made before onboarding existed. It goes straight in.
 *   - start only     somebody who registered and closed the app partway. It resumes.
 *   - both           finished. It is never shown again.
 *
 * The start is written here, as the account is created, and never by the client. A phone
 * cannot tell a first Google sign-in from a returning one — `/auth/google/native` answers with
 * the user and nothing about having just made the row — so an app that wrote the marker itself
 * would leave every Google account with neither marker, which reads as "made before onboarding
 * existed", and those travellers would skip it for good.
 */

export interface OnboardingMarkers {
    /** ISO 8601, written when the account row is created. */
    startedAt?: string;
    /** ISO 8601, written when the last mandatory step is answered. */
    completedAt?: string;
}

/** The key the markers sit under inside `profiles.preferences`. */
export const ONBOARDING_KEY = 'onboarding';

/**
 * The preferences a newly created account starts with: the start marker and nothing else.
 *
 * Returned as the value to nest into the `profiles` row at creation, so the marker and the
 * account are written in one statement and no account can exist without it.
 */
export function initialPreferences(now: Date = new Date()): { onboarding: { startedAt: string } } {
    return { [ONBOARDING_KEY]: { startedAt: now.toISOString() } };
}

/**
 * What the markers in a preferences blob say, for anything that needs to read them back.
 *
 * Tolerant of a blob that holds something else under the key: these are preferences, which any
 * client may replace wholesale, so a malformed value means "not stated" rather than an error.
 */
export function readOnboarding(preferences: unknown): OnboardingMarkers {
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return {};
    const raw = (preferences as Record<string, unknown>)[ONBOARDING_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    const { startedAt, completedAt } = raw as Record<string, unknown>;
    return {
        ...(typeof startedAt   === 'string' && startedAt   ? { startedAt }   : {}),
        ...(typeof completedAt === 'string' && completedAt ? { completedAt } : {}),
    };
}
