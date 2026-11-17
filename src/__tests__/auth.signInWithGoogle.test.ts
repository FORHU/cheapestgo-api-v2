import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

/**
 * Signing in from a native app with a Google ID token: the service that turns a verified identity
 * into an account and a session. The token check has its own tests (googleIdToken.test.ts); this
 * is the step after it.
 *
 * Added when a merge dropped this file's two imports — `verifyGoogleIdToken` and `clampName` — and
 * nothing noticed: the only thing that failed was the type-check, because no test ever called
 * `signInWithGoogle`, so the first real sign-in would have been a ReferenceError.
 */

vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
    },
}));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(async () => null), set: vi.fn(async () => 'OK') } }));

const verify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/googleIdToken', () => ({ verifyGoogleIdToken: verify }));

const repo = vi.hoisted(() => ({ upsertFromGoogle: vi.fn() }));
vi.mock('@/repositories/auth.repository', () => ({
    AuthRepository: class { upsertFromGoogle = repo.upsertFromGoogle; },
}));

import { AuthService } from '@/services/auth.service';

const IDENTITY = { email: 'traveller@example.com', givenName: 'Billy', familyName: 'Busilan', picture: 'https://pic' };
const ACCOUNT = {
    id: 'u1', email: 'traveller@example.com', role: 'user', banned_at: null,
    first_name: 'Billy', last_name: 'Busilan', password_hash: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    verify.mockResolvedValue(IDENTITY);
    repo.upsertFromGoogle.mockResolvedValue(ACCOUNT);
});

describe('AuthService.signInWithGoogle', () => {
    it('signs in as the account the verified email belongs to, with the same tokens login returns', async () => {
        const result = await new AuthService().signInWithGoogle('id-token');

        expect(verify).toHaveBeenCalledWith('id-token');
        expect(repo.upsertFromGoogle).toHaveBeenCalledWith({
            email: 'traveller@example.com', first_name: 'Billy', last_name: 'Busilan', avatar_url: 'https://pic',
        });
        expect(result.user).toMatchObject({ id: 'u1', email: 'traveller@example.com' });
        expect(result.user).not.toHaveProperty('password_hash');
        expect(jwt.verify(result.accessToken, 'test-secret')).toMatchObject({ sub: 'u1', role: 'user' });
        expect(jwt.verify(result.refreshToken, 'test-refresh')).toMatchObject({ sub: 'u1' });
    });

    // A name from Google is clamped, not refused: turning someone away from their own account
    // over the length of the name Google holds for them would be the wrong answer.
    it('clamps an over-long name from Google instead of refusing the sign-in', async () => {
        verify.mockResolvedValue({ ...IDENTITY, givenName: 'x'.repeat(500), familyName: null });

        await new AuthService().signInWithGoogle('id-token');

        const stored = repo.upsertFromGoogle.mock.calls[0][0];
        expect(stored.first_name).toMatch(/^x+$/);
        expect(stored.first_name.length).toBeLessThan(500);
        expect(stored.last_name).toBeNull();
    });

    it('refuses a suspended account, whichever door it comes to', async () => {
        repo.upsertFromGoogle.mockResolvedValue({ ...ACCOUNT, banned_at: new Date() });

        await expect(new AuthService().signInWithGoogle('id-token')).rejects.toMatchObject({
            statusCode: 403, code: 'ACCOUNT_BANNED',
        });
    });

    it('does not touch an account when the token is refused', async () => {
        verify.mockRejectedValue(Object.assign(new Error('nope'), { statusCode: 401 }));

        await expect(new AuthService().signInWithGoogle('bad')).rejects.toMatchObject({ statusCode: 401 });
        expect(repo.upsertFromGoogle).not.toHaveBeenCalled();
    });
});
