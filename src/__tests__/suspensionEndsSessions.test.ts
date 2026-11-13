import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * Suspending an account ends the sessions it already has.
 *
 * `banned_at` used to be read in exactly one place, `login()`, so a suspension only stopped the
 * next password sign-in. A customer already signed in kept a working session for the life of
 * their tokens, and `/auth/refresh` kept minting new ones for a week; Google sign-in never looked
 * at the column at all. Found by the e2e suite (`a suspension ends the sessions the Customer
 * already has`).
 *
 * These run the real auth router, the real admin router and the real `authenticate`; only Redis
 * and the database are stood in for.
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
        del: vi.fn(async () => 0),
    },
}));
vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
        API_URL: 'http://localhost:4000', SITE_URL: 'http://localhost:3000', NODE_ENV: 'test',
        GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret',
    },
}));
vi.mock('@/middleware/rate-limit.middleware', () => ({
    authRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('bcryptjs', () => ({
    default: { hash: vi.fn(async () => 'hashed'), compare: vi.fn(async () => true) },
}));

// One in-memory `users` table behind both the repository and the prisma client, so a ban written
// by the admin route is what the refresh later reads back.
type UserRow = { id: string; email: string; role: string; banned_at: Date | null };
const users = vi.hoisted(() => new Map<string, UserRow>());
const db = vi.hoisted(() => ({
    users: {
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
            const row = users.get(where.id);
            if (!row) throw new Error('Record not found');
            Object.assign(row, data);
            return row;
        }),
        upsert: vi.fn(async ({ where }: { where: { email: string } }) =>
            [...users.values()].find((u) => u.email === where.email)),
    },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/repositories/auth.repository', () => ({
    AuthRepository: class {
        findById = async (id: string) => users.get(id) ?? null;
    },
}));

// The admin router imports half the API. None of it is under test here.
vi.mock('@/services/adminContent.service',   () => ({ adminContentService: {} }));
vi.mock('@/services/adminSettings.service',  () => ({ adminSettingsService: {} }));
vi.mock('@/services/adminStripe.service',    () => ({ adminStripeService: {} }));
vi.mock('@/services/adminRevenue.service',   () => ({ adminRevenueService: {} }));
vi.mock('@/services/adminMobile.service',    () => ({ adminMobileService: {} }));
vi.mock('@/services/adminTravelgatex.service', () => ({ adminTravelgatexService: {} }));
vi.mock('@/services/adminPayments.service',  () => ({ adminPaymentsService: {} }));
vi.mock('@/services/paymentEvidence.service', () => ({ paymentEvidenceService: {} }));
vi.mock('@/services/hotels.service',         () => ({ HotelsService: class {} }));
vi.mock('@/services/flights.service',        () => ({ FlightsService: class {} }));
vi.mock('@/services/bookingRebuild.service', () => ({ bookingRebuildService: {}, REBUILD_STATUSES: [] }));
vi.mock('@/lib/admin/reconciliation',        () => ({ findUnrecordedReservations: vi.fn(), findBookingsMissingBrand: vi.fn() }));
vi.mock('@/lib/admin/audit',                 () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/admin/notify',                () => ({ createNotification: vi.fn() }));
vi.mock('@/repositories/paymentEvidenceExport.repository', () => ({ saveEvidenceExport: vi.fn(), findEvidenceExport: vi.fn() }));
vi.mock('@/components/EvidencePdfDocument',  () => ({ EvidencePdfDocument: () => null }));
vi.mock('@react-pdf/renderer',               () => ({ renderToBuffer: vi.fn() }));

import authRouter from '@/routes/auth.route';
import adminRouter from '@/routes/admin.route';
import { errorMiddleware } from '@/middleware/error.middleware';

const NOW = Math.floor(Date.now() / 1000);
const tokenFor = (sub: string, role: string, iat: number, secret = 'test-secret') =>
    jwt.sign({ sub, email: `${sub}@example.com`, role, iat }, secret);
const ADMIN = tokenFor('admin-1', 'admin', NOW - 5);

// Google is the only outside call the callback makes; the test's own requests pass straight through.
const realFetch = globalThis.fetch;
const google = { email: 'c@example.com' };

let server: Server;
let url = '';

beforeAll(async () => {
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
        const target = String(input instanceof Request ? input.url : input);
        if (target.startsWith('http://127.0.0.1')) return realFetch(input, init);
        if (target.includes('oauth2.googleapis.com/token')) return Promise.resolve(Response.json({ access_token: 'g', id_token: 'i' }));
        if (target.includes('googleapis.com/oauth2/v2/userinfo')) return Promise.resolve(Response.json({ id: 'g1', email: google.email }));
        throw new Error(`unexpected outbound fetch: ${target}`);
    });

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', authRouter);
    app.use('/admin', adminRouter);
    app.use(errorMiddleware);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
    store.clear();
    redisState.down = false;
    users.clear();
    users.set('u1', { id: 'u1', email: 'c@example.com', role: 'user', banned_at: null });
    users.set('u2', { id: 'u2', email: 'other@example.com', role: 'user', banned_at: null });
});

const adminHeaders = { Authorization: `Bearer ${ADMIN}` };
const banViaUsersRoute = (id: string) =>
    fetch(`${url}/admin/users/${id}/ban`, { method: 'POST', headers: adminHeaders });
const banViaCustomersRoute = (id: string) =>
    fetch(`${url}/admin/customers`, {
        method: 'POST',
        headers: { ...adminHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ban', userId: id }),
    });

const me = (token: string) => fetch(`${url}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
const refresh = (token: string) =>
    fetch(`${url}/auth/refresh`, { method: 'POST', headers: { Cookie: `refresh_token=${token}` } });

describe.each([
    ['POST /admin/users/:id/ban', banViaUsersRoute],
    ['POST /admin/customers {action: ban}', banViaCustomersRoute],
])('%s', (_name, ban) => {
    it('ends the sessions the customer already has: /auth/me and /auth/refresh both refuse', async () => {
        const access = tokenFor('u1', 'user', NOW - 60);
        const renew = tokenFor('u1', 'user', NOW - 60, 'test-refresh');
        expect((await me(access)).status).toBe(200);
        expect((await refresh(renew)).status).toBe(200);

        expect((await ban('u1')).status).toBe(200);

        expect((await me(access)).status).toBe(401);
        expect((await refresh(renew)).status).toBe(401);
    });

    // The revocation used for a password change spares a token minted in the very second of the
    // change, because the sign-in that follows it is that second's. Nothing follows a suspension,
    // so the same rule would leave a session opened a moment before the ban working for a day.
    it('ends a session opened in the same second as the ban', async () => {
        const justNow = tokenFor('u1', 'user', Math.floor(Date.now() / 1000));
        expect((await ban('u1')).status).toBe(200);
        expect((await me(justNow)).status).toBe(401);
    });

    it('leaves every other account signed in', async () => {
        const other = tokenFor('u2', 'user', NOW - 60);
        expect((await ban('u1')).status).toBe(200);
        expect((await me(other)).status).toBe(200);
    });

    it('does not refuse a session minted after the suspension, so a reinstated customer can sign back in', async () => {
        expect((await ban('u1')).status).toBe(200);
        users.get('u1')!.banned_at = null; // what /unban does
        expect((await me(tokenFor('u1', 'user', NOW + 5))).status).toBe(200);
    });

    // Redis is a spare, not the record: the ban is, and the refresh reads it.
    it('still stops the refresh when Redis is down, because the refresh reads the account itself', async () => {
        const renew = tokenFor('u1', 'user', NOW - 60, 'test-refresh');
        redisState.down = true;

        expect((await ban('u1')).status).toBe(200);
        expect(users.get('u1')!.banned_at).not.toBeNull();
        expect((await refresh(renew)).status).toBe(401);
    });
});

describe('POST /auth/refresh', () => {
    // Every account suspended before this fix has no revocation marker at all.
    it('refuses an account that is suspended, with no revocation record to say so', async () => {
        users.get('u1')!.banned_at = new Date();
        expect((await refresh(tokenFor('u1', 'user', NOW - 60, 'test-refresh'))).status).toBe(401);
    });

    it('still renews an account in good standing', async () => {
        expect((await refresh(tokenFor('u1', 'user', NOW - 60, 'test-refresh'))).status).toBe(200);
    });
});

describe('GET /auth/google/callback', () => {
    const callback = () =>
        fetch(`${url}/auth/google/callback?code=c&state=s`, { redirect: 'manual', headers: { Cookie: 'oauth_state=s' } });
    const sessionCookie = (res: Response) => res.headers.getSetCookie().find((c) => /^access_token=[^;]+/.test(c));

    it('signs in an account in good standing', async () => {
        const res = await callback();
        expect(res.status).toBe(302);
        expect(sessionCookie(res)).toBeDefined();
    });

    it('does not sign in a suspended account: no session, and the sign-in page says why', async () => {
        users.get('u1')!.banned_at = new Date();
        const res = await callback();

        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toMatch(/\/login\?error=account_banned$/);
        expect(sessionCookie(res)).toBeUndefined();
    });
});
