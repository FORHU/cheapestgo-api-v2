import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * The reading end of #118 — filtered, paginated, and read-only (no route here writes).
 */

vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
    },
}));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(async () => null) } }));

type Row = {
    id: string; action: string; admin_id: string | null; admin_email: string | null;
    actor_role: string | null; target_id: string | null; reason: string | null;
    ip: string | null; user_agent: string | null; correlation_id: string | null;
    previous_value: unknown; new_value: unknown; details: unknown; created_at: Date;
};
const findMany = vi.hoisted(() => vi.fn());
const count = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({
    prisma: {
        users: { findUnique: vi.fn(async () => ({ role: 'admin' })) },
        admin_audit_log: { findMany, count },
    },
}));

import router from '@/routes/admin-audit.route';
import { errorMiddleware } from '@/middleware/error.middleware';

const row = (overrides: Partial<Row>): Row => ({
    id: 'r1', action: 'refund_booking', admin_id: 'admin-1', admin_email: 'admin@x.com',
    actor_role: 'admin', target_id: 'pi_1', reason: null, ip: null, user_agent: null,
    correlation_id: 'c1', previous_value: null, new_value: null, details: {},
    created_at: new Date('2026-11-27T00:00:00.000Z'), ...overrides,
});

let server: Server;
let url = '';

beforeAll(async () => {
    const app = express();
    app.use('/admin/audit-logs', router);
    app.use(errorMiddleware);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
    findMany.mockReset().mockResolvedValue([row({})]);
    count.mockReset().mockResolvedValue(1);
});

const TOKEN = jwt.sign({ sub: 'admin-1', email: 'admin@x.com', role: 'admin' }, 'test-secret');
const get = (qs = '') => fetch(`${url}/admin/audit-logs${qs}`, { headers: { Authorization: `Bearer ${TOKEN}` } });

describe('GET /admin/audit-logs', () => {
    it('returns the list, mapped to camelCase, with total and page', async () => {
        const res = await get();
        expect(res.status).toBe(200);
        const body = await res.json() as { success: boolean; total: number; page: number; items: any[] };
        expect(body).toMatchObject({ success: true, total: 1, page: 1 });
        expect(body.items[0]).toMatchObject({
            id: 'r1', action: 'refund_booking', adminId: 'admin-1', adminEmail: 'admin@x.com',
            actorRole: 'admin', targetId: 'pi_1', correlationId: 'c1',
        });
    });

    it('filters by staff email', async () => {
        await get('?staff=admin%40x.com');
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                OR: expect.arrayContaining([{ admin_email: { contains: 'admin@x.com', mode: 'insensitive' } }]),
            }),
        }));
    });

    it('also matches staff by exact admin id when it looks like a uuid', async () => {
        const id = 'aaaaaaaa-0000-4000-8000-000000000001';
        await get(`?staff=${id}`);
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ OR: expect.arrayContaining([{ admin_id: id }]) }),
        }));
    });

    it('filters by action and resource', async () => {
        await get('?action=refund_booking&resource=pi_1');
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ action: 'refund_booking', target_id: 'pi_1' }),
        }));
    });

    it('filters by a date range', async () => {
        await get('?from=2026-11-01T00:00:00.000Z&to=2026-11-30T00:00:00.000Z');
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                created_at: { gte: new Date('2026-11-01T00:00:00.000Z'), lte: new Date('2026-11-30T00:00:00.000Z') },
            }),
        }));
    });

    it('paginates, newest first', async () => {
        await get('?page=2&limit=10');
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
            take: 10, skip: 10, orderBy: { created_at: 'desc' },
        }));
    });

    it('refuses a bad date with a validation error, not a 500', async () => {
        const res = await get('?from=not-a-date');
        expect(res.status).toBe(422);
    });

    it('has no write route at all — GET is the only method this router answers', async () => {
        const res = await fetch(`${url}/admin/audit-logs`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` },
        });
        expect(res.status).toBe(404);
    });
});
