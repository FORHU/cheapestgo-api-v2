import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * Staff access follows `users.role`, not the role copied into the token at sign-in.
 *
 * `requireRole` compared the token's role, so taking the admin role away did nothing until the
 * token expired (a day), and a newly promoted admin had no back office until they signed in
 * again. The support desk had the same fault one step further in: its actor carried the token's
 * role into the service, whose `assertCanAnswer` lets `admin` straight through. ADR-0003 says the
 * database is the authority. Found by the e2e suite (`an Admin whose role is taken away loses the
 * back office at once`).
 *
 * These run the real `authenticate`/`requireRole`, the real admin router and its real promote
 * endpoint; only Redis and the database are stood in for.
 */

vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), del: vi.fn(async () => 0) } }));
vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
        API_URL: 'http://localhost:4000', SITE_URL: 'http://localhost:3000', NODE_ENV: 'test',
    },
}));

// One in-memory `users` table, so a role written by the promote endpoint is what the next
// request reads back.
type UserRow = { id: string; email: string; role: string; banned_at: Date | null };
const users = vi.hoisted(() => new Map<string, UserRow>());
const dbState = vi.hoisted(() => ({ down: false }));
const db = vi.hoisted(() => ({
    users: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
            if (dbState.down) throw new Error('database unreachable');
            const row = users.get(where.id);
            return row ? { role: row.role } : null;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
            const row = users.get(where.id);
            if (!row) throw new Error('Record not found');
            Object.assign(row, data);
            return row;
        }),
    },
    $queryRaw: vi.fn(async () => []),
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));

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

// The support desk: what matters is the actor it hands the service.
const support = vi.hoisted(() => ({
    listInbox: vi.fn(async (actor: { id: string; role: string }) => ({ seenBy: actor })),
}));
vi.mock('@/services/support.service',        () => ({ SupportService: class { listInbox = support.listInbox; } }));
vi.mock('@/repositories/support.repository', () => ({ SupportRepository: class {} }));
vi.mock('@/lib/support/stream',              () => ({ openEventStream: vi.fn() }));
vi.mock('@/lib/support/attachments',         () => ({ MAX_ATTACHMENT_BYTES: 1024 }));
vi.mock('@/lib/support/attachmentStorage',   () => ({ attachmentsConfigured: vi.fn() }));
vi.mock('@/lib/support/availability',        () => ({ getSupportHours: vi.fn(), saveSupportHours: vi.fn() }));

import adminRouter from '@/routes/admin.route';
import adminSupportRouter from '@/routes/admin-support.route';
import { errorMiddleware } from '@/middleware/error.middleware';

const NOW = Math.floor(Date.now() / 1000);
/** A token as sign-in made it: the role is whatever the account held at that moment. */
const tokenFor = (sub: string, role: string) =>
    jwt.sign({ sub, email: `${sub}@example.com`, role, iat: NOW - 60 }, 'test-secret');

let server: Server;
let url = '';

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/admin/support', adminSupportRouter);
    app.use('/admin', adminRouter);
    app.use(errorMiddleware);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
    dbState.down = false;
    support.listInbox.mockClear();
    users.clear();
    for (const [id, role] of [['admin-a', 'admin'], ['admin-b', 'admin'], ['user-c', 'user']] as const) {
        users.set(id, { id, email: `${id}@example.com`, role, banned_at: null });
    }
});

const A = () => tokenFor('admin-a', 'admin');
const get = (path: string, token: string) => fetch(`${url}${path}`, { headers: { Authorization: `Bearer ${token}` } });
const setRole = (id: string, role: string) =>
    fetch(`${url}/admin/users/${id}/promote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${A()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
    });
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

describe('the back office follows users.role', () => {
    it('an admin whose role is taken away loses the back office at once', async () => {
        const b = tokenFor('admin-b', 'admin');
        expect((await get('/admin/users', b)).status).toBe(200);

        expect((await setRole('admin-b', 'user')).status).toBe(200);

        const after = await get('/admin/users', b);
        expect(after.status).toBe(403);
        expect(await errorOf(after)).toBe('FORBIDDEN');
    });

    it('a newly promoted admin has the back office at once, without signing in again', async () => {
        const c = tokenFor('user-c', 'user');
        expect((await get('/admin/users', c)).status).toBe(403);

        expect((await setRole('user-c', 'admin')).status).toBe(200);

        expect((await get('/admin/users', c)).status).toBe(200);
    });

    it('leaves an unchanged admin in, and an ordinary customer out', async () => {
        expect((await get('/admin/users', tokenFor('admin-b', 'admin'))).status).toBe(200);
        expect((await get('/admin/users', tokenFor('user-c', 'user'))).status).toBe(403);
    });

    it('treats a token whose account no longer exists as signed out, not as forbidden', async () => {
        users.delete('admin-b');
        const res = await get('/admin/users', tokenFor('admin-b', 'admin'));
        expect(res.status).toBe(401);
        expect(await errorOf(res)).toBe('AUTH_INVALID');
    });

    // Falling back to the token's role when the lookup fails would hand the back office to
    // exactly the people this exists to turn away.
    it('fails closed when the database cannot answer', async () => {
        dbState.down = true;
        const res = await get('/admin/users', tokenFor('admin-a', 'admin'));
        expect(res.status).toBe(500);
    });
});

describe('the support desk acts as the current role', () => {
    const inbox = async (token: string) => {
        const res = await get('/admin/support/conversations', token);
        return { res, body: (await res.json()) as { data?: { seenBy: { id: string; role: string } }; error?: string } };
    };

    it('a demoted admin is not an admin to the service, whatever the token says', async () => {
        users.get('admin-b')!.role = 'support_agent';
        const { res, body } = await inbox(tokenFor('admin-b', 'admin'));
        expect(res.status).toBe(200);
        expect(body.data!.seenBy).toEqual({ id: 'admin-b', role: 'support_agent' });
    });

    it('someone whose staff role was removed entirely reaches the service as a customer', async () => {
        users.get('admin-b')!.role = 'user';
        const { body } = await inbox(tokenFor('admin-b', 'admin'));
        expect(body.data!.seenBy.role).toBe('user');
    });

    it('a newly promoted admin is an admin to the service at once', async () => {
        const { body } = await inbox(tokenFor('user-c', 'user'));
        expect(body.data!.seenBy.role).toBe('user');
        users.get('user-c')!.role = 'admin';
        const again = await inbox(tokenFor('user-c', 'user'));
        expect(again.body.data!.seenBy.role).toBe('admin');
    });

    it('signs out a token whose account no longer exists', async () => {
        users.delete('admin-b');
        const { res, body } = await inbox(tokenFor('admin-b', 'admin'));
        expect(res.status).toBe(401);
        expect(body.error).toBe('AUTH_INVALID');
    });
});
