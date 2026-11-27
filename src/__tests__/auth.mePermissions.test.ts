import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * `/auth/me` returns the caller's permissions (#107), read fresh from `role_permissions` every
 * time — not from the session token, which predates `support_agent` and would say nothing
 * useful about permissions at all.
 */

vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
        API_URL: 'http://localhost:4000', SITE_URL: 'http://localhost:3000', NODE_ENV: 'test',
    },
}));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(async () => null) } }));
vi.mock('@/middleware/rate-limit.middleware', () => ({
    authRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

type UserRow = { id: string; email: string; role: string };
const users = vi.hoisted(() => new Map<string, UserRow>());
const grants = vi.hoisted(() => new Map<string, string[]>());

vi.mock('@/lib/prisma', () => ({
    prisma: {
        users: {
            findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
                const row = users.get(where.id);
                return row ? { role: row.role } : null;
            }),
        },
        role_permissions: {
            findMany: vi.fn(async ({ where }: { where: { role: string } }) =>
                (grants.get(where.role) ?? []).map(permission => ({ permission }))),
        },
    },
}));
vi.mock('@/repositories/auth.repository', () => ({
    AuthRepository: class { findById = async (id: string) => users.get(id) ?? null; },
}));

import authRouter from '@/routes/auth.route';
import { errorMiddleware } from '@/middleware/error.middleware';

let server: Server;
let url = '';

beforeAll(async () => {
    const app = express();
    app.use('/auth', authRouter);
    app.use(errorMiddleware);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
    users.clear();
    grants.clear();
    users.set('admin-1', { id: 'admin-1', email: 'admin@x.com', role: 'admin' });
    users.set('agent-1', { id: 'agent-1', email: 'agent@x.com', role: 'support_agent' });
    users.set('cust-1',  { id: 'cust-1',  email: 'cust@x.com',  role: 'user' });
    grants.set('admin', ['users.manage', 'payments.refund.approve']);
    grants.set('support_agent', ['support.conversations.reply']);
});

const tokenFor = (sub: string) => jwt.sign({ sub }, 'test-secret');
const me = (sub: string) => fetch(`${url}/auth/me`, { headers: { Authorization: `Bearer ${tokenFor(sub)}` } });

describe('GET /auth/me', () => {
    it('returns the permissions the role actually holds', async () => {
        const body = await (await me('admin-1')).json() as { user: { permissions: string[] } };
        expect(body.user.permissions).toEqual(expect.arrayContaining(['users.manage', 'payments.refund.approve']));
        expect(body.user.permissions).toHaveLength(2);
    });

    it('returns a different list for a different role, not a leftover from another caller', async () => {
        const body = await (await me('agent-1')).json() as { user: { permissions: string[] } };
        expect(body.user.permissions).toEqual(['support.conversations.reply']);
    });

    it('returns an empty list for a customer, not an error', async () => {
        const body = await (await me('cust-1')).json() as { user: { permissions: string[] } };
        expect(body.user.permissions).toEqual([]);
    });

    it('reflects a permission grant immediately — no redeploy, no re-sign-in, just the next request', async () => {
        const before = await (await me('agent-1')).json() as { user: { permissions: string[] } };
        expect(before.user.permissions).not.toContain('support.conversations.assign');

        grants.set('support_agent', ['support.conversations.reply', 'support.conversations.assign']);

        const after = await (await me('agent-1')).json() as { user: { permissions: string[] } };
        expect(after.user.permissions).toContain('support.conversations.assign');
    });

    it('never includes the password hash alongside the permissions', async () => {
        const body = await (await me('admin-1')).json() as { user: Record<string, unknown> };
        expect(body.user.password_hash).toBeUndefined();
    });
});
