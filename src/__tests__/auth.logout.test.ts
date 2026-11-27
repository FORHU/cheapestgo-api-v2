import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

vi.mock('@/services/auth.service', () => ({ AuthService: class {} }));
vi.mock('@/middleware/rate-limit.middleware', () => ({
    authRateLimit: ((_req, _res, next) => next()) as RequestHandler,
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));

const audit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: audit }));

vi.mock('@/config', () => ({
    config: {
        API_URL: 'http://localhost:4000',
        NODE_ENV: 'test',
        SITE_URL: 'http://localhost:3002',
        JWT_SECRET: 'test-secret',
        GOOGLE_CLIENT_ID: undefined,
    },
}));

import authRouter from '@/routes/auth.route';

let server: Server;
let baseUrl = '';

beforeAll(async () => {
    const app = express();
    app.use('/auth', authRouter);
    await new Promise<void>((resolve) => {
        server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => { audit.mockClear(); });

describe('POST /auth/logout', () => {
    it.each([
        ['missing', undefined],
        ['expired', `access_token=${jwt.sign({ sub: 'user-1' }, 'test-secret', { expiresIn: -1 })}`],
    ])('clears session cookies when the access token is %s', async (_scenario, cookie) => {
        const response = await fetch(`${baseUrl}/logout`, {
            method: 'POST',
            headers: cookie ? { cookie } : undefined,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(response.headers.get('set-cookie')).toContain('access_token=');
        expect(response.headers.get('set-cookie')).toContain('refresh_token=');
        expect(audit).not.toHaveBeenCalled();
    });

    it('logs the logout for a staff session (#118)', async () => {
        // No cookie-parser mounted on this bare test app — the bearer-header path
        // `readSessionToken` falls back to is what `/logout` actually sees here.
        const token = jwt.sign({ sub: 'admin-1', email: 'a@x.com', role: 'admin' }, 'test-secret');
        const response = await fetch(`${baseUrl}/logout`, {
            method: 'POST', headers: { authorization: `Bearer ${token}` },
        });

        expect(response.status).toBe(200);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'logout', adminId: 'admin-1', adminEmail: 'a@x.com', actorRole: 'admin',
        }));
    });

    it('does not log an ordinary customer logging out', async () => {
        const token = jwt.sign({ sub: 'user-1', email: 'c@x.com', role: 'user' }, 'test-secret');
        await fetch(`${baseUrl}/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });

        expect(audit).not.toHaveBeenCalled();
    });
});
