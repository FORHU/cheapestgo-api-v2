/**
 * Verifying a Google ID token presented by a native app. See mobile #45.
 *
 * The browser flow in `routes/auth.route.ts` never needs this: it exchanges a one-time code
 * over a back channel, so the token it gets is one Google handed *us*. A phone has no such
 * channel. `google_sign_in` completes the dance on the device and the app sends us the ID
 * token it was given — a string from an untrusted client, which is only worth anything once
 * checked.
 *
 * **Four things make a token ours**, and all four are checked here:
 *
 *   1. Google signed it, and it has not expired — `tokeninfo` answers for this.
 *   2. `iss` is Google. A token from elsewhere is not a Google sign-in.
 *   3. `aud` is one of *our* client IDs. This is the one people skip, and it is the whole
 *      attack: an ID token minted for any other app is a perfectly valid Google token, so
 *      without this a sign-in to somebody else's app signs you in here as that user.
 *   4. The email is verified. Google will mint a token for an unverified address, and
 *      matching on an unverified email is how an account gets taken over by registering it
 *      elsewhere first.
 *
 * Verified through Google's `tokeninfo` endpoint rather than a JWKS library: the codebase
 * already talks to Google over `fetch` in the callback, this adds no dependency, and Google
 * does the signature work. The cost is a round trip per sign-in — acceptable on a path that
 * already waits on Google twice — and the checks above are done here regardless, because
 * `tokeninfo` reports those fields, it does not police them for us.
 */

import { config } from '@/config';
import { AppError } from '@/middleware/error.middleware';

export interface GoogleIdentity {
    email: string;
    givenName: string | null;
    familyName: string | null;
    picture: string | null;
}

/** Google's own, and the only two it signs ID tokens as. */
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

interface TokenInfo {
    iss?: string;
    aud?: string;
    exp?: string;
    email?: string;
    email_verified?: string | boolean;
    given_name?: string;
    family_name?: string;
    picture?: string;
    error_description?: string;
}

/** The client IDs a native sign-in may present. */
export function nativeAudiences(): string[] {
    return (config.GOOGLE_NATIVE_CLIENT_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
    const allowed = nativeAudiences();
    if (allowed.length === 0) {
        // Said plainly rather than failing every sign-in with a vague 401: this is a
        // deployment that has not been given its client IDs, not a bad token.
        throw new AppError(500, 'Native Google sign-in is not configured', 'OAUTH_NOT_CONFIGURED');
    }

    let info: TokenInfo;
    try {
        const res = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
        );
        info = (await res.json()) as TokenInfo;
        // A bad token is a 400 here, which is a refusal and not an outage.
        if (!res.ok) {
            throw new AppError(401, 'Google sign-in could not be verified', 'INVALID_CREDENTIALS');
        }
    } catch (err) {
        if (err instanceof AppError) throw err;
        // The request itself failed: Google is unreachable, not the traveller's fault.
        throw new AppError(503, 'Could not reach Google to verify sign-in', 'UPSTREAM_UNAVAILABLE');
    }

    if (!info.iss || !GOOGLE_ISSUERS.has(info.iss)) {
        throw new AppError(401, 'Google sign-in could not be verified', 'INVALID_CREDENTIALS');
    }

    // The check that matters most. See the note at the top of this file.
    if (!info.aud || !allowed.includes(info.aud)) {
        throw new AppError(401, 'This app is not allowed to sign in', 'INVALID_CREDENTIALS');
    }

    // `tokeninfo` rejects an expired token, so this is belt and braces — and cheap.
    const expiresAt = Number(info.exp) * 1000;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new AppError(401, 'That sign-in has expired — please try again', 'INVALID_CREDENTIALS');
    }

    const verified = info.email_verified === true || info.email_verified === 'true';
    if (!info.email || !verified) {
        throw new AppError(401, 'That Google account has no verified email', 'INVALID_CREDENTIALS');
    }

    return {
        email: info.email.toLowerCase(),
        givenName: info.given_name ?? null,
        familyName: info.family_name ?? null,
        picture: info.picture ?? null,
    };
}
