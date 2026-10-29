import { config } from '@/config';

/**
 * Where an OAuth sign-in is allowed to send the browser back to.
 *
 * The callback used to end in `res.redirect(config.SITE_URL)` — one baked origin, so a
 * sign-in begun on the staff host finished on the storefront, with the session cookie set
 * on the wrong origin and the staff host no further forward. Carrying the intended origin
 * through the flow fixes that, and an allowlist is what keeps the fix from being an open
 * redirect: the origin is matched against a list, never trusted because it arrived.
 *
 * `OAUTH_RETURN_ORIGINS` is a comma-separated list. `SITE_URL` is always permitted whether
 * or not it appears there, so the behaviour with nothing configured is exactly what it was.
 */
function configured(): string[] {
    const extra = (process.env.OAUTH_RETURN_ORIGINS ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    // `API_URL` is here because the OAuth callback is served from it — `resolveCallbackOrigin`
    // matches against this same list. Both are our own origins, so neither widens what an
    // unrecognised candidate can reach.
    return [config.SITE_URL, config.API_URL, ...extra].map(normalise).filter((o): o is string => o !== null);
}

/** An origin with no trailing slash and a lowercase host, or null if it is not one. */
function normalise(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        return `${url.protocol}//${url.host.toLowerCase()}`;
    } catch {
        return null;
    }
}

/**
 * The origin to return to, given where the sign-in started.
 *
 * Falls back to `SITE_URL` rather than refusing: an unrecognised origin means a
 * misconfiguration, and dropping the person on the storefront signed in beats showing them
 * an error — while still never sending them somewhere the allowlist does not name.
 */
export function resolveReturnOrigin(candidate: string | null | undefined): string {
    const wanted = normalise(candidate);
    if (wanted && configured().includes(wanted)) return wanted;
    return normalise(config.SITE_URL) ?? config.SITE_URL;
}

/**
 * The origin a request was made to, from its own headers.
 *
 * `x-forwarded-proto` is read because the app sits behind a proxy that terminates TLS, so
 * the scheme the browser used is not the scheme the process sees.
 */
export function originOfRequest(headers: {
    host?: string;
    'x-forwarded-proto'?: string | string[];
}): string | null {
    const host = headers.host;
    if (!host) return null;
    const fwd = headers['x-forwarded-proto'];
    const proto = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
        ?? (config.NODE_ENV === 'production' ? 'https' : 'http');
    return normalise(`${proto}://${host}`);
}

/**
 * The origin to serve the Google callback from, given where the sign-in began.
 *
 * `redirect_uri` was one baked `API_URL`, so a sign-in started on the staff host was sent
 * back to the storefront — and the callback is where `res.cookie` runs, so the session was
 * set on the storefront whatever `resolveReturnOrigin` then decided. The staff host was
 * redirected to with no cookie on it, and `/admin` bounced to `/login` forever. Carrying the
 * return origin fixed where you land; this fixes where the session lands.
 *
 * Allowlisted for the same reason as the return origin: the candidate comes from a Host
 * header, which is a request rather than a permission. Google rejects a redirect_uri it has
 * not been given, so this is the second lock rather than the only one.
 *
 * Both legs of the exchange must name an identical redirect_uri or Google refuses the token
 * call. They do: the authorize leg reads the host the browser called, and the callback leg
 * reads the host Google sent it to — which is that same origin.
 */
export function resolveCallbackOrigin(candidate: string | null | undefined): string {
    const wanted = normalise(candidate);
    if (wanted && configured().includes(wanted)) return wanted;
    return normalise(config.API_URL) ?? config.API_URL;
}
