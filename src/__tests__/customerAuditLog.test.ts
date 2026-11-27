import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Prisma } from '@prisma/client';

/**
 * Hard-deleting a customer account, logged (#118) — the last of the four silent categories.
 *
 * Ban/unban/suspend already gets logged once #125 merges (`suspend_user`/`reactivate_user`,
 * added there, on the very same routes) — this doesn't duplicate that. `hard_delete` is the
 * one branch #125 leaves untouched, and the only admin-facing action on a customer's account
 * this codebase actually has beyond ban/unban (there is no "update a customer's profile" admin
 * endpoint to log — same situation as suppliers having no credential-change endpoint).
 */

vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
        API_URL: 'http://localhost:4000', SITE_URL: 'http://localhost:3000', NODE_ENV: 'test',
    },
}));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(async () => null) } }));

type UserRow = { id: string; role: string; email: string; banned_at: Date | null };
const users = vi.hoisted(() => new Map<string, UserRow>());
const db = vi.hoisted(() => ({
    users: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
            const row = users.get(where.id);
            return row ? { role: row.role } : null;
        }),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
            const row = users.get(where.id);
            if (!row) {
                throw new Prisma.PrismaClientKnownRequestError('No record', { code: 'P2025', clientVersion: 'test' });
            }
            users.delete(where.id);
            return row;
        }),
    },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));

const audit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: audit }));

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
vi.mock('@/lib/admin/notify',                () => ({ createNotification: vi.fn() }));
vi.mock('@/repositories/paymentEvidenceExport.repository', () => ({ saveEvidenceExport: vi.fn(), findEvidenceExport: vi.fn() }));
vi.mock('@/components/EvidencePdfDocument',  () => ({ EvidencePdfDocument: () => null }));
vi.mock('@react-pdf/renderer',               () => ({ renderToBuffer: vi.fn() }));

import adminRouter from '@/routes/admin.route';
import { errorMiddleware } from '@/middleware/error.middleware';

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
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
    users.clear();
    users.set('admin-1', { id: 'admin-1', role: 'admin', email: 'admin-1@example.com', banned_at: null });
    users.set('cust-1',  { id: 'cust-1',  role: 'user',  email: 'cust@example.com',    banned_at: null });
    audit.mockClear();
});

const hardDelete = (userId: string) => fetch(`${url}/admin/customers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'hard_delete', userId }),
});

describe('hard-deleting a customer (#118)', () => {
    it('logs the deletion with the account it removed, captured before the row is gone', async () => {
        const res = await hardDelete('cust-1');

        expect(res.status).toBe(200);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'customer_hard_deleted', adminId: 'admin-1', adminEmail: 'admin-1@example.com',
            targetId: 'cust-1', previousValue: { email: 'cust@example.com', role: 'user' },
        }));
    });

    it('does not log when the account does not exist', async () => {
        const res = await hardDelete('00000000-0000-4000-8000-000000000000');
        expect(res.status).toBe(404);
        expect(audit).not.toHaveBeenCalled();
    });
});
