import { config } from '@/config';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

/**
 * Ending every session an account holds, which a stateless token cannot do on its own.
 *
 * A JWT is valid until it expires: changing the password changes what sign-in accepts, and
 * leaves every token already issued — on the phone, in the café, in a thief's browser — working
 * for up to the refresh lifetime. So a password change records *when*, and a token issued before
 * that moment is refused, on every request and at the refresh.
 *
 * The record is one Redis key per account, expiring when the longest token that could predate it
 * has expired anyway, so nothing accumulates and nothing needs cleaning up. It is not a schema
 * change: the cost is a Redis read per authenticated request, which the app already pays.
 *
 * **Redis down.** Both ends fail soft, as the Google sign-in's state does. A read that errors lets
 * the request through, because refusing every signed-in customer on a cache outage is worse than
 * a short window in which a revoked token still works. A write that errors is logged loudly and
 * does not undo the password change, which has already happened: this browser is signed out
 * regardless, because the cookies are cleared in the response.
 */
const key = (userId: string) => `session:revoked-before:${userId}`;

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

/** `7d` → 604800. Anything unrecognised is read as 30 days, longer than any sane token. */
function ttlSeconds(): number {
    const match = /^(\d+)([smhd])$/.exec(config.JWT_REFRESH_EXPIRES_IN ?? '');
    return match ? Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS] : 30 * 86_400;
}

/**
 * Sign out everything the account has, everywhere, as of now.
 *
 * `includeThisSecond` is for an account that must not sign back in. By default a token minted in
 * the very second of the change survives, because after a password change that is the sign-in
 * that follows it. After a suspension nothing follows, so that second's tokens are the ones a
 * customer opened just before being suspended, and sparing them would leave that session working
 * for the life of its token. The marker is set one second on to cover them. Nothing can mint a
 * token in that extra second for a suspended account: sign-in, refresh and Google all refuse it.
 */
export async function revokeSessions(
    userId: string,
    { includeThisSecond = false }: { includeThisSecond?: boolean } = {},
): Promise<void> {
    const nowSeconds = Math.floor(Date.now() / 1000) + (includeThisSecond ? 1 : 0);
    try {
        await redis.set(key(userId), String(nowSeconds), 'EX', ttlSeconds());
    } catch (err) {
        logger.error('[auth] could not record session revocation; older sessions stay valid until they expire', {
            userId, err,
        });
    }
}

/** Whether a token was issued before the account's sessions were last revoked. */
export async function isRevoked(payload: { sub: string; iat?: number }): Promise<boolean> {
    try {
        const since = await redis.get(key(payload.sub));
        if (!since) return false;
        // A token with no `iat` cannot be placed in time, so it is treated as older.
        // Strictly before: a token minted in the very second of the change is the new
        // sign-in that follows it, never one of the sessions it ended.
        return (payload.iat ?? 0) < Number(since);
    } catch {
        return false;
    }
}
