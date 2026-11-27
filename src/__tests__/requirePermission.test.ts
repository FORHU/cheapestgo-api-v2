import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

/**
 * `requirePermission` (#106), and the 401-not-403 fix to `requireRole` beside it.
 *
 * Unit-level, not through an Express app (`roleIsReadFromDatabase.test.ts` already covers the
 * router-mounted path for `requireRole`) — what's new here is `requirePermission` itself and
 * one corrected branch, so these call the middleware functions directly.
 */

vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
        API_URL: 'http://localhost:4000', SITE_URL: 'http://localhost:3000', NODE_ENV: 'test',
    },
}));

const roleOf = vi.hoisted(() => new Map<string, string | null>());
vi.mock('@/lib/prisma', () => ({
    prisma: { users: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const role = roleOf.get(where.id);
        return role === undefined ? null : { role };
    }) } },
}));

const permissions = vi.hoisted(() => new Map<string, Set<string>>());
vi.mock('@/lib/auth/permissions', () => ({
    hasPermission: vi.fn(async (role: string, permission: string) => permissions.get(role)?.has(permission) ?? false),
}));

const refusals = vi.hoisted(() => [] as unknown[]);
vi.mock('@/lib/auth/permissionLog', () => ({
    logPermissionRefusal: vi.fn(async (...args: unknown[]) => { refusals.push(args); }),
}));

import { requirePermission, requireRole } from '@/middleware/auth.middleware';
import { AppError } from '@/middleware/error.middleware';

beforeEach(() => {
    roleOf.clear();
    permissions.clear();
    refusals.length = 0;
    roleOf.set('u1', 'admin');
    permissions.set('admin', new Set(['users.manage']));
});

const reqFor = (sub: string | undefined, role = 'admin') =>
    ({ user: sub ? { sub, email: `${sub}@x.com`, role } : undefined, originalUrl: '/admin/users/1/promote' }) as unknown as Request;

async function run(mw: (req: Request, res: Response, next: (err?: unknown) => void) => Promise<void>, req: Request) {
    let error: unknown;
    await mw(req, {} as Response, (err?: unknown) => { error = err; });
    return error;
}

describe('requirePermission', () => {
    it('is 401, not 403, with no session', async () => {
        const err = await run(requirePermission('users.manage'), reqFor(undefined));
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(401);
        expect((err as AppError).code).toBe('AUTH_REQUIRED');
    });

    it('passes through when the role holds the permission', async () => {
        const err = await run(requirePermission('users.manage'), reqFor('u1'));
        expect(err).toBeUndefined();
    });

    it('is 403 with the required permission named, when the role does not hold it', async () => {
        const err = await run(requirePermission('payments.refund.approve'), reqFor('u1'));
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(403);
        expect((err as AppError).details).toEqual({ required: 'payments.refund.approve' });
        expect(refusals).toHaveLength(1);
        expect(refusals[0]).toEqual(expect.arrayContaining(['permission']));
    });

    it('checks the resource only after the permission passes, and refuses distinguishably', async () => {
        const resourceCheck = vi.fn(async () => false);
        const err = await run(requirePermission('users.manage', resourceCheck), reqFor('u1'));
        expect(resourceCheck).toHaveBeenCalledTimes(1);
        expect((err as AppError).statusCode).toBe(403);
        expect(refusals[0]).toEqual(expect.arrayContaining(['resource']));
    });

    it('never reaches the resource check when the permission itself is missing', async () => {
        const resourceCheck = vi.fn(async () => true);
        await run(requirePermission('payments.refund.approve', resourceCheck), reqFor('u1'));
        expect(resourceCheck).not.toHaveBeenCalled();
    });

    it('passes through when both the permission and the resource check pass', async () => {
        const err = await run(requirePermission('users.manage', async () => true), reqFor('u1'));
        expect(err).toBeUndefined();
    });

    it('reads the role fresh — a role changed since sign-in is what gets checked', async () => {
        permissions.set('support_agent', new Set());
        roleOf.set('u1', 'support_agent'); // demoted since the token was issued
        const err = await run(requirePermission('users.manage'), reqFor('u1', 'admin'));
        expect((err as AppError).statusCode).toBe(403);
    });
});

describe('requireRole (401/403 fix)', () => {
    it('is 401, not 403, with no session', async () => {
        const err = await run(requireRole('admin'), reqFor(undefined));
        expect((err as AppError).statusCode).toBe(401);
        expect((err as AppError).code).toBe('AUTH_REQUIRED');
    });

    it('is still 403 for a signed-in caller holding the wrong role', async () => {
        roleOf.set('u2', 'user');
        const err = await run(requireRole('admin'), reqFor('u2', 'user'));
        expect((err as AppError).statusCode).toBe(403);
    });
});
