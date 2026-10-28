import type { Request } from 'express';
import { config } from '@/config';

/**
 * The session cookie's name, and the one place that decides it.
 *
 * `__Host-` is a browser-enforced prefix: a cookie carrying it is rejected outright unless it
 * is `Secure`, `Path=/`, and has **no `Domain` attribute**. That turns host-only scoping from
 * a convention someone can undo into something the browser refuses to let them undo — adding
 * `domain=.cheapestgo.com` later makes the cookie visibly fail to set rather than silently
 * widening the session to every subdomain. It is the guarantee the staff host rests on
 * (app-v2 ADR-0006).
 *
 * The prefix requires `Secure`, which is not available over plain http, so the name follows
 * the same condition as the flag. Development keeps the bare name; anywhere the cookie is
 * `Secure` gets the enforced one.
 */
const SECURE = config.NODE_ENV === 'production';

export const SESSION_COOKIE = SECURE ? '__Host-access_token' : 'access_token';

/**
 * The name sessions were issued under before the prefix.
 *
 * Read, never written. Without it, deploying the rename would sign out everyone holding a
 * valid session — the cookie would still be in their browser under a name nothing looks for.
 * Removable once the longest-lived token issued under the old name has expired: that is
 * `JWT_EXPIRES_IN` after the deploy, not a date anyone needs to guess at.
 */
export const LEGACY_SESSION_COOKIE = 'access_token';

/**
 * The session token on a request: cookie first, then a bearer header.
 *
 * The header path is for callers that are not browsers — the mobile app — and is why the
 * cookie rename cannot break them.
 */
export function readSessionToken(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[SESSION_COOKIE]
        ?? cookies?.[LEGACY_SESSION_COOKIE]
        ?? req.headers.authorization?.replace('Bearer ', '');
}

/**
 * Attributes every session cookie carries.
 *
 * `sameSite` is deliberately not here. Password sign-in sets the cookie `strict` and the
 * Google callback sets it `lax`, so the same session is protected differently depending on
 * which door the person came through. That difference predates this module and is left
 * where each caller can see it rather than averaged into one value here — changing it is a
 * security decision, not a refactor.
 *
 * `domain` must never be added: `__Host-` forbids it, and the cookie would stop setting.
 */
export const BASE_COOKIE_OPTIONS = {
    httpOnly: true,
    secure:   SECURE,
    path:     '/' as const,
};

/** One day, matching the token's own lifetime. */
export const SESSION_MAX_AGE_MS = 86_400_000;
