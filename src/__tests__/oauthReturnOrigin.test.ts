import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/config', () => ({
    config: { SITE_URL: 'https://cheapestgo.com', NODE_ENV: 'production' },
}));

import { originOfRequest, resolveReturnOrigin } from '@/lib/auth/returnOrigin';

/**
 * Where a Google sign-in is allowed to send the browser afterwards.
 *
 * The callback used to end in one baked `SITE_URL`, so a sign-in begun on the staff host
 * finished on the storefront with the session on the wrong origin. Carrying the origin
 * through the flow fixes that and introduces the risk worth testing: a return URL that is
 * obeyed because it was supplied is an open redirect, and this is the one flow where that
 * would be handed to an attacker wrapped in a legitimate-looking Google consent screen.
 */
describe('resolveReturnOrigin', () => {
    const ORIGINAL = process.env.OAUTH_RETURN_ORIGINS;
    beforeEach(() => { process.env.OAUTH_RETURN_ORIGINS = 'https://admin.cheapestgo.com'; });
    afterEach(() => {
        if (ORIGINAL === undefined) delete process.env.OAUTH_RETURN_ORIGINS;
        else process.env.OAUTH_RETURN_ORIGINS = ORIGINAL;
    });

    it('allows an origin on the list', () => {
        expect(resolveReturnOrigin('https://admin.cheapestgo.com')).toBe('https://admin.cheapestgo.com');
    });

    it('allows SITE_URL even when the list does not name it', () => {
        expect(resolveReturnOrigin('https://cheapestgo.com')).toBe('https://cheapestgo.com');
    });

    it.each([
        ['an attacker-controlled host',      'https://evil.example.com'],
        ['a lookalike subdomain',            'https://admin.cheapestgo.com.evil.example'],
        ['a prefix of an allowed host',      'https://cheapestgo.com.evil.example'],
        ['an unlisted sibling subdomain',    'https://staging.cheapestgo.com'],
        ['a javascript URL',                 'javascript:alert(1)'],
        ['a protocol-relative URL',          '//evil.example.com'],
        ['a path pretending to be a host',   '/\\evil.example.com'],
        ['nonsense',                         'not a url'],
        ['nothing',                          null],
    ])('falls back to SITE_URL for %s', (_label, candidate) => {
        expect(resolveReturnOrigin(candidate)).toBe('https://cheapestgo.com');
    });

    it('ignores a path, query or fragment on an allowed origin', () => {
        // Only the origin is honoured, so a crafted path cannot ride along.
        expect(resolveReturnOrigin('https://admin.cheapestgo.com/evil?x=1#y'))
            .toBe('https://admin.cheapestgo.com');
    });

    it('matches the host case-insensitively', () => {
        expect(resolveReturnOrigin('https://ADMIN.CheapestGo.com')).toBe('https://admin.cheapestgo.com');
    });
});

describe('originOfRequest', () => {
    it('trusts the forwarded scheme, because TLS ends at the proxy', () => {
        expect(originOfRequest({ host: 'admin.cheapestgo.com', 'x-forwarded-proto': 'https' }))
            .toBe('https://admin.cheapestgo.com');
    });

    it('takes the first scheme when the proxy chain supplies several', () => {
        expect(originOfRequest({ host: 'cheapestgo.com', 'x-forwarded-proto': 'https,http' }))
            .toBe('https://cheapestgo.com');
    });

    it('is null without a host, rather than guessing one', () => {
        expect(originOfRequest({})).toBeNull();
    });
});

/**
 * The API is not a place to send a person.
 *
 * `API_URL` used to sit in the same allowlist as the return origins, because one list answered
 * two questions. Where the API and the site share an origin — every deployed environment — that
 * conflation is invisible. Split them across ports, as local development does, and it is not:
 * the Google button navigates the browser to the API's `/auth/google`, so the origin carried
 * through the flow is the API's own. The session was set correctly and the person was then
 * redirected to the API root, which serves no pages. Sign-in read as broken while working.
 */
describe('resolveReturnOrigin, when the API and the site are different origins', () => {
    const ORIGINAL = process.env.OAUTH_RETURN_ORIGINS;
    beforeEach(() => { delete process.env.OAUTH_RETURN_ORIGINS; });
    afterEach(() => {
        if (ORIGINAL === undefined) delete process.env.OAUTH_RETURN_ORIGINS;
        else process.env.OAUTH_RETURN_ORIGINS = ORIGINAL;
    });

    it('never returns the browser to the API, and falls back to the site', async () => {
        vi.resetModules();
        vi.doMock('@/config', () => ({
            config: { SITE_URL: 'http://localhost:3002', API_URL: 'http://localhost:4000', NODE_ENV: 'development' },
        }));
        const { resolveReturnOrigin: resolve } = await import('@/lib/auth/returnOrigin');

        expect(resolve('http://localhost:4000')).toBe('http://localhost:3002');
    });

    /** The callback still has to be served from the API — that is where the route lives. */
    it('still serves the callback from the API origin', async () => {
        vi.resetModules();
        vi.doMock('@/config', () => ({
            config: { SITE_URL: 'http://localhost:3002', API_URL: 'http://localhost:4000', NODE_ENV: 'development' },
        }));
        const { resolveCallbackOrigin: resolve } = await import('@/lib/auth/returnOrigin');

        expect(resolve('http://localhost:4000')).toBe('http://localhost:4000');
    });

    /** Where the two share an origin, nothing about this changes. */
    it('is unchanged when the API and the site are the same origin', async () => {
        vi.resetModules();
        vi.doMock('@/config', () => ({
            config: { SITE_URL: 'https://dev.cheapestgo.com', API_URL: 'https://dev.cheapestgo.com', NODE_ENV: 'production' },
        }));
        const { resolveReturnOrigin: resolve } = await import('@/lib/auth/returnOrigin');

        expect(resolve('https://dev.cheapestgo.com')).toBe('https://dev.cheapestgo.com');
    });
});
