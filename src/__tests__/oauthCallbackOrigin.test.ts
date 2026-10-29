import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `redirect_uri` used to be one baked `API_URL`, so a sign-in begun on the staff host came
 * back to the storefront — and the callback is where the session cookie is set. `__Host-`
 * scopes that cookie to the host that set it, so the staff host was redirected to with no
 * session on it and `/admin` bounced to `/login` forever. These cases pin the origin.
 */
vi.mock('@/config', () => ({
    config: {
        SITE_URL: 'https://v2.cheapestgo.com',
        API_URL:  'https://v2.cheapestgo.com',
        NODE_ENV: 'production',
    },
}));

const STAFF = 'https://staff.cheapestgo.com';
const STORE = 'https://v2.cheapestgo.com';

async function load() {
    vi.resetModules();
    return import('@/lib/auth/returnOrigin');
}

describe('resolveCallbackOrigin', () => {
    beforeEach(() => { delete process.env.OAUTH_RETURN_ORIGINS; });

    it('keeps a sign-in on the host it began on, once that host is allowlisted', async () => {
        process.env.OAUTH_RETURN_ORIGINS = STAFF;
        const { resolveCallbackOrigin } = await load();
        expect(resolveCallbackOrigin(STAFF)).toBe(STAFF);
    });

    it('recognises the API origin without it being listed', async () => {
        const { resolveCallbackOrigin } = await load();
        expect(resolveCallbackOrigin(STORE)).toBe(STORE);
    });

    // A Host header is a request, not a permission. Google rejects an unregistered
    // redirect_uri too, so this is the second lock rather than the only one.
    it.each([
        'https://evil.example.com',
        'https://staff.cheapestgo.com.evil.example',
        'not-a-url',
        null,
        undefined,
    ])('refuses %p and falls back to the API origin', async (candidate) => {
        const { resolveCallbackOrigin } = await load();
        expect(resolveCallbackOrigin(candidate)).toBe(STORE);
    });

    it('falls back when the staff host is not allowlisted', async () => {
        const { resolveCallbackOrigin } = await load();
        expect(resolveCallbackOrigin(STAFF)).toBe(STORE);
    });

    // Both legs of the exchange must name an identical redirect_uri or Google refuses the
    // token call. They read the same header on the same origin, so they agree by construction.
    it('agrees between the authorize leg and the callback leg', async () => {
        process.env.OAUTH_RETURN_ORIGINS = STAFF;
        const { resolveCallbackOrigin, originOfRequest } = await load();
        const headers = { host: 'staff.cheapestgo.com', 'x-forwarded-proto': 'https' };
        const uri = () => `${resolveCallbackOrigin(originOfRequest(headers))}/api/v2/auth/google/callback`;
        expect(uri()).toBe(`${STAFF}/api/v2/auth/google/callback`);
        expect(uri()).toBe(uri());
    });
});
