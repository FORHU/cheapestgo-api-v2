import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * Google sign-in when Redis is unreachable.
 *
 * `lib/redis.ts` is configured to fail fast — `enableOfflineQueue: false`, no retries — so a
 * Redis that is down rejects every command instantly instead of blocking. The state write in
 * `/auth/google` was unhandled, so that rejection reached the error middleware as a plain
 * Error and the endpoint answered 500 while `/health` and password sign-in stayed green. It
 * ran that way on v2 production, where it read as "Google login is broken" rather than as a
 * missing Redis.
 *
 * Redis is the cross-server spare here, not the record: the callback verifies the `oauth_state`
 * cookie. So an outage must degrade to the cookie path, never to a 500.
 */
vi.mock('@/services/auth.service', () => ({ AuthService: class {} }));
vi.mock('@/middleware/rate-limit.middleware', () => ({
    authRateLimit: ((_req, _res, next) => next()) as RequestHandler,
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({
    redis: {
        // The exact rejection ioredis raises with the offline queue disabled.
        set: vi.fn().mockRejectedValue(
            new Error("Stream isn't writeable and enableOfflineQueue options is false"),
        ),
    },
}));
vi.mock('@/config', () => ({
    config: {
        API_URL: 'http://localhost:4000',
        NODE_ENV: 'test',
        SITE_URL: 'http://localhost:3002',
        JWT_SECRET: 'test-secret',
        GOOGLE_CLIENT_ID: 'test-client-id',
    },
}));

import authRouter from '@/routes/auth.route';

let server: Server;
let baseUrl = '';
let origin = '';

beforeAll(async () => {
    const app = express();
    app.use('/auth', authRouter);
    await new Promise<void>((resolve) => {
        server = app.listen(0, resolve);
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/auth`;
    origin = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('GET /auth/google with Redis down', () => {
    it('still redirects to Google instead of failing the sign-in', async () => {
        const response = await fetch(`${baseUrl}/google`, { redirect: 'manual' });

        expect(response.status).toBe(302);
        expect(response.headers.get('location'))
            .toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    });

    it('carries the origin in a cookie, so the callback does not need Redis to find it', async () => {
        // Without this the cookie path knows the sign-in is legitimate but not where it
        // began, and a staff-host sign-in completing during an outage lands on the
        // storefront — the bug resolveReturnOrigin exists to prevent.
        const response = await fetch(`${baseUrl}/google`, { redirect: 'manual' });
        const cookies = response.headers.getSetCookie().map(decodeURIComponent);

        expect(cookies.some(c => c.startsWith('oauth_state='))).toBe(true);
        expect(cookies.some(c => c.startsWith(`oauth_origin=${origin}`))).toBe(true);
    });
});
