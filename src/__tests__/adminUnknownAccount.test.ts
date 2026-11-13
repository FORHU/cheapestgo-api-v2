import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Prisma } from '@prisma/client';

/**
 * An admin action on an account that does not exist answers 404, not 500.
 *
 * `prisma.users.update` / `.delete` throw P2025 when no row matches, and nothing mapped it, so the
 * error middleware called it an internal error. Found by the e2e suite (`suspending an account
 * that does not exist is a 404`).
 *
 * The real admin router and error middleware; only the database and the services the router
 * imports are stood in for. The stand-in throws Prisma's own P2025 error, as the client does.
 */

vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
        API_URL: 'http://localhost:4000', SITE_URL: 'http://localhost:3000', NODE_ENV: 'test',
    },
}));
vi.mock('@/lib/redis', () => ({ redis: { set: vi.fn(), get: vi.fn(async () => null), del: vi.fn() } }));

type UserRow = { id: string; role: string; banned_at: Date | null };
const users = vi.hoisted(() => new Map<string, UserRow>());
const notFound = () => new Prisma.PrismaClientKnownRequestError(
    'An operation failed because it depends on one or more records that were required but not found.',
    { code: 'P2025', clientVersion: 'test' },
);
const db = vi.hoisted(() => ({
    users: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
            const row = users.get(where.id);
            return row ? { role: row.role } : null;
        }),
        update: vi.fn(),
        delete: vi.fn(),
    },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));

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

import adminRouter from '@/routes/admin.route';
import { errorMiddleware } from '@/middleware/error.middleware';

const MISSING = '00000000-0000-4000-8000-000000000000';
const ADMIN = jwt.sign({ sub: 'admin-1', email: 'admin-1@example.com', role: 'admin', iat: Math.floor(Date.now() / 1000) - 5 }, 'test-secret');

let server: Server;
let url = '';

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/admin', adminRouter);
    app.use(errorMiddleware);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
    users.clear();
    users.set('admin-1', { id: 'admin-1', role: 'admin', banned_at: null });
    users.set('u1', { id: 'u1', role: 'user', banned_at: null });
    const write = async ({ where, data }: { where: { id: string }; data?: Partial<UserRow> }) => {
        const row = users.get(where.id);
        if (!row) throw notFound();
        Object.assign(row, data ?? {});
        return row;
    };
    db.users.update.mockImplementation(write);
    db.users.delete.mockImplementation(write);
});

const post = (path: string, body?: unknown) => fetch(`${url}/admin${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});

describe.each([
    ['POST /admin/users/:id/ban',     (id: string) => post(`/users/${id}/ban`)],
    ['POST /admin/users/:id/unban',   (id: string) => post(`/users/${id}/unban`)],
    ['POST /admin/users/:id/promote', (id: string) => post(`/users/${id}/promote`, { role: 'admin' })],
    ['POST /admin/customers {ban}',   (id: string) => post('/customers', { action: 'ban', userId: id })],
    ['POST /admin/customers {unban}', (id: string) => post('/customers', { action: 'unban', userId: id })],
    ['POST /admin/customers {hard_delete}', (id: string) => post('/customers', { action: 'hard_delete', userId: id })],
])('%s', (_name, act) => {
    it('answers 404 NOT_FOUND for an account that does not exist', async () => {
        const res = await act(MISSING);
        expect(res.status).toBe(404);
        expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
    });

    it('still succeeds for an account that does', async () => {
        expect((await act('u1')).status).toBe(200);
    });
});
