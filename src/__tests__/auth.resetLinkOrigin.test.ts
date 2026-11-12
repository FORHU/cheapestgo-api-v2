import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * Where the link in a password-reset email points.
 *
 * It was a literal `https://cheapestgo.com` in production, which is v1. A reset asked for on
 * v2 therefore opened v1's reset page, whose back button and every other link stayed in v1.
 * The link has to return to the site that asked — and only ever to one of our own, since the
 * address it is built from arrives in a request header.
 */
vi.mock('@/services/auth.service', () => ({ AuthService: class {} }));
vi.mock('@/middleware/rate-limit.middleware', () => ({
    authRateLimit: ((_req, _res, next) => next()) as RequestHandler,
}));
vi.mock('@/lib/prisma', () => ({
    prisma: {
        users: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', email: 'billy@example.com' }) },
        password_reset_tokens: { upsert: vi.fn().mockResolvedValue({}) },
    },
}));
vi.mock('@/lib/redis', () => ({ redis: {} }));
vi.mock('@/config', () => ({
    config: {
        API_URL: 'https://v2.cheapestgo.com',
        // Production, where the literal used to apply.
        NODE_ENV: 'production',
        SITE_URL: 'https://v2.cheapestgo.com',
        JWT_SECRET: 'test-secret',
        RESEND_API_KEY: 'test-resend-key',
    },
}));

import authRouter from '@/routes/auth.route';

let server: Server;
let baseUrl = '';
const realFetch = globalThis.fetch;
/** The HTML of each email handed to Resend. */
const sent: string[] = [];

beforeAll(async () => {
    process.env.OAUTH_RETURN_ORIGINS = 'https://staff.cheapestgo.com';
    // The route sends through the global fetch, and so does this test. Only the call to
    // Resend is caught; the test's own requests go through.
    vi.stubGlobal('fetch', ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        if (String(input).startsWith('https://api.resend.com/')) {
            sent.push(JSON.parse(String(init?.body)).html);
            return Promise.resolve(new Response('{}', { status: 200 }));
        }
        return realFetch(input, init);
    }) as typeof fetch);

    const app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
    await new Promise<void>((resolve) => {
        server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`;
});

afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.OAUTH_RETURN_ORIGINS;
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => { sent.length = 0; });

const requestReset = async (origin?: string) => {
    const response = await realFetch(`${baseUrl}/request-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify({ email: 'billy@example.com' }),
    });
    expect(response.status).toBe(200);
    return sent[0];
};

describe('the link in a password-reset email', () => {
    it('returns to v2 when the reset was asked for on v2, not to v1', async () => {
        const html = await requestReset('https://v2.cheapestgo.com');
        expect(html).toContain('href="https://v2.cheapestgo.com/auth/reset-password?token=');
        expect(html).not.toContain('https://cheapestgo.com');
    });

    it('returns to another of our own sites when that is where it was asked for', async () => {
        const html = await requestReset('https://staff.cheapestgo.com');
        expect(html).toContain('href="https://staff.cheapestgo.com/auth/reset-password?token=');
    });

    it('never names a site that is not ours, whatever the request claims', async () => {
        const html = await requestReset('https://evil.example');
        expect(html).toContain('href="https://v2.cheapestgo.com/auth/reset-password?token=');
        expect(html).not.toContain('evil.example');
    });

    it('falls back to the configured site when the request names none', async () => {
        const html = await requestReset();
        expect(html).toContain('href="https://v2.cheapestgo.com/auth/reset-password?token=');
    });
});
