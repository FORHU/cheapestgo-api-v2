import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * A password change signs the account out everywhere. Tokens are stateless, so each one issued
 * before the change is refused by comparing its `iat` with a per-account marker in Redis — on
 * ordinary requests, and at the refresh, which would otherwise mint a fresh session from the old
 * one. The browser that changed it is signed out through its cookies, whatever Redis does.
 */

const store = vi.hoisted(() => new Map<string, string>());
const redisState = vi.hoisted(() => ({ down: false }));
vi.mock('@/lib/redis', () => ({
    redis: {
        set: vi.fn(async (k: string, v: string) => {
            if (redisState.down) throw new Error("Stream isn't writeable");
            store.set(k, v);
        }),
        get: vi.fn(async (k: string) => {
            if (redisState.down) throw new Error("Stream isn't writeable");
            return store.get(k) ?? null;
        }),
    },
}));
vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
        API_URL: 'http://localhost:4000', SITE_URL: 'http://localhost:3000', NODE_ENV: 'test',
    },
}));
vi.mock('@/middleware/rate-limit.middleware', () => ({
    authRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('bcryptjs', () => ({
    default: { hash: vi.fn(async () => 'hashed'), compare: vi.fn(async () => true) },
}));

const db = vi.hoisted(() => ({
    users: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => ({ id: 'u1', role: 'user', email: 'a@example.com' })) },
    password_reset_tokens: {
        findFirst: vi.fn(async () => ({ user_id: 'u1' })),
        delete: vi.fn(async () => ({})),
    },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
const usersRepo = vi.hoisted(() => ({
    findPasswordHash: vi.fn(async () => 'old-hash'),
    savePasswordHash: vi.fn(async () => {}),
}));
vi.mock('@/repositories/users.repository', () => ({
    usersRepository: usersRepo, UsersRepository: class { constructor() { return usersRepo; } },
}));
vi.mock('@/repositories/auth.repository', () => ({
    AuthRepository: class {
        findById = async (id: string) => ({ id, email: 'a@example.com', role: 'user' });
    },
}));

import { revokeSessions, isRevoked } from '@/lib/auth/sessionRevocation';
import { authenticate } from '@/middleware/auth.middleware';
import { errorMiddleware } from '@/middleware/error.middleware';
import authRouter from '@/routes/auth.route';
import usersRouter from '@/routes/users.route';

const NOW = Math.floor(Date.now() / 1000);
const tokenIssuedAt = (iat: number, secret = 'test-secret') => jwt.sign({ sub: 'u1', role: 'user', iat }, secret);
const GOOD = 'Password1';

beforeEach(() => {
    store.clear();
    redisState.down = false;
    vi.clearAllMocks();
});

describe('revokeSessions / isRevoked', () => {
    it('refuses a token issued before the change and accepts one issued after it', async () => {
        await revokeSessions('u1');
        expect(await isRevoked({ sub: 'u1', iat: NOW - 60 })).toBe(true);
        expect(await isRevoked({ sub: 'u1', iat: NOW + 5 })).toBe(false);
    });

    it('does not touch another account, or an account that never changed its password', async () => {
        await revokeSessions('u1');
        expect(await isRevoked({ sub: 'u2', iat: NOW - 60 })).toBe(false);
    });

    it('expires the marker with the longest token it could outlive: the 7-day refresh', async () => {
        const { redis } = await import('@/lib/redis');
        await revokeSessions('u1');
        expect(redis.set).toHaveBeenCalledWith('session:revoked-before:u1', expect.any(String), 'EX', 7 * 86_400);
    });

    it('fails soft with Redis down: reads let the request through, writes do not throw', async () => {
        redisState.down = true;
        await expect(revokeSessions('u1')).resolves.toBeUndefined();
        expect(await isRevoked({ sub: 'u1', iat: NOW - 60 })).toBe(false);
    });
});

describe('with the endpoints running', () => {
    let server: Server;
    let url = '';

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use(cookieParser());
        app.use('/auth', authRouter);
        app.use('/users', usersRouter);
        app.get('/whoami', authenticate, (req, res) => { res.json({ sub: req.user!.sub }); });
        app.use(errorMiddleware);
        await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    const whoami = (token: string) => fetch(`${url}/whoami`, { headers: { Authorization: `Bearer ${token}` } });
    const clearedNames = (response: Response) =>
        response.headers.getSetCookie().filter((c) => /=;|Expires=Thu, 01 Jan 1970/.test(c)).map((c) => c.split('=')[0]);

    it('lets a session through until the password changes, then refuses it', async () => {
        const token = tokenIssuedAt(NOW - 60);
        expect((await whoami(token)).status).toBe(200);

        await revokeSessions('u1');
        const after = await whoami(token);
        expect(after.status).toBe(401);
        expect(((await after.json()) as { error: string }).error).toBe('AUTH_INVALID');
    });

    it('refuses to renew a revoked session at the refresh', async () => {
        const refresh = (t: string) => fetch(`${url}/auth/refresh`, { method: 'POST', headers: { Cookie: `refresh_token=${t}` } });
        const old = tokenIssuedAt(NOW - 60, 'test-refresh');
        expect((await refresh(old)).status).toBe(200);

        await revokeSessions('u1');
        expect((await refresh(old)).status).toBe(401);
    });

    it('PATCH /users/password ends every session and signs this browser out', async () => {
        const mine = tokenIssuedAt(NOW - 60);
        const response = await fetch(`${url}/users/password`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mine}` },
            body: JSON.stringify({ currentPassword: 'Current1', newPassword: GOOD }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, signedOut: true });
        expect(clearedNames(response)).toEqual(expect.arrayContaining(['access_token', 'refresh_token']));
        // Every token issued before it, this one included, is now refused.
        expect((await whoami(mine)).status).toBe(401);
        expect((await whoami(tokenIssuedAt(NOW - 3600))).status).toBe(401);
    });

    it('a rejected change signs nobody out', async () => {
        const mine = tokenIssuedAt(NOW - 60);
        const response = await fetch(`${url}/users/password`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mine}` },
            body: JSON.stringify({ currentPassword: 'Current1', newPassword: 'password1' }),
        });
        expect(response.status).toBe(422);
        expect((await whoami(mine)).status).toBe(200);
    });

    it('PUT /auth/reset-password ends every session the account has and clears this browser', async () => {
        const response = await fetch(`${url}/auth/reset-password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'tok', password: GOOD }),
        });
        expect(response.status).toBe(200);
        expect(clearedNames(response)).toEqual(expect.arrayContaining(['access_token', 'refresh_token']));
        expect((await whoami(tokenIssuedAt(NOW - 60))).status).toBe(401);
    });
});
