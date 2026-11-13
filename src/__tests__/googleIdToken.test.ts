import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyGoogleIdToken, nativeAudiences } from '@/lib/auth/googleIdToken';

/**
 * What makes a Google ID token ours. See mobile #45.
 *
 * This is the boundary where a string from an untrusted phone becomes a signed-in account,
 * so each refusal gets its own case — above all the audience check, which is the difference
 * between "Google says this person is who they say" and "this person signed in to our app".
 */

vi.mock('@/config', () => ({
    config: { GOOGLE_NATIVE_CLIENT_IDS: 'ours.apps.googleusercontent.com,ios.apps.googleusercontent.com' },
}));

/** A token info body as Google's `tokeninfo` returns it. */
function info(over: Record<string, unknown> = {}) {
    return {
        iss: 'https://accounts.google.com',
        aud: 'ours.apps.googleusercontent.com',
        exp: String(Math.floor(Date.now() / 1000) + 3600),
        email: 'Traveller@Example.com',
        email_verified: 'true',
        given_name: 'Billy',
        family_name: 'Busilan',
        picture: 'https://pic',
        ...over,
    };
}

function answers(body: unknown, ok = true) {
    return vi.fn().mockResolvedValue({ ok, json: async () => body });
}

beforeEach(() => { vi.stubGlobal('fetch', answers(info())); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('verifyGoogleIdToken', () => {
    it('accepts a good token and lowercases the email', async () => {
        const identity = await verifyGoogleIdToken('tok');
        expect(identity).toEqual({
            email: 'traveller@example.com',
            givenName: 'Billy',
            familyName: 'Busilan',
            picture: 'https://pic',
        });
    });

    it('accepts any of the configured client IDs', async () => {
        expect(nativeAudiences()).toHaveLength(2);
        vi.stubGlobal('fetch', answers(info({ aud: 'ios.apps.googleusercontent.com' })));
        await expect(verifyGoogleIdToken('tok')).resolves.toMatchObject({ email: 'traveller@example.com' });
    });

    // The one that matters. A token minted for another app is a real, unexpired, Google-signed
    // token — so without this check, signing in to any app would sign you in here.
    it('refuses a token minted for somebody else’s app', async () => {
        vi.stubGlobal('fetch', answers(info({ aud: 'someone-else.apps.googleusercontent.com' })));
        await expect(verifyGoogleIdToken('tok')).rejects.toMatchObject({
            statusCode: 401,
            code: 'INVALID_CREDENTIALS',
        });
    });

    it('refuses a token that did not come from Google', async () => {
        vi.stubGlobal('fetch', answers(info({ iss: 'https://evil.example.com' })));
        await expect(verifyGoogleIdToken('tok')).rejects.toMatchObject({ statusCode: 401 });
    });

    // Matching on an unverified address is how an account is taken over by claiming the
    // email somewhere else first.
    it('refuses an unverified email', async () => {
        vi.stubGlobal('fetch', answers(info({ email_verified: 'false' })));
        await expect(verifyGoogleIdToken('tok')).rejects.toMatchObject({ statusCode: 401 });
    });

    it('refuses an expired token', async () => {
        vi.stubGlobal('fetch', answers(info({ exp: String(Math.floor(Date.now() / 1000) - 10) })));
        await expect(verifyGoogleIdToken('tok')).rejects.toMatchObject({ statusCode: 401 });
    });

    it('treats a rejected token as a refusal, not an outage', async () => {
        vi.stubGlobal('fetch', answers({ error_description: 'Invalid Value' }, false));
        await expect(verifyGoogleIdToken('tok')).rejects.toMatchObject({
            statusCode: 401,
            code: 'INVALID_CREDENTIALS',
        });
    });

    it('treats an unreachable Google as an outage, not the traveller’s fault', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));
        await expect(verifyGoogleIdToken('tok')).rejects.toMatchObject({
            statusCode: 503,
            code: 'UPSTREAM_UNAVAILABLE',
        });
    });
});

describe('without client IDs configured', () => {
    it('says so rather than failing every sign-in as a bad token', async () => {
        vi.resetModules();
        vi.doMock('@/config', () => ({ config: { GOOGLE_NATIVE_CLIENT_IDS: undefined } }));
        const mod = await import('@/lib/auth/googleIdToken');
        await expect(mod.verifyGoogleIdToken('tok')).rejects.toMatchObject({
            statusCode: 500,
            code: 'OAUTH_NOT_CONFIGURED',
        });
    });
});
