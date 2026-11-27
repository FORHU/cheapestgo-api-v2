import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `permissionsForRole` / `hasPermission` (#106) — the data half of replacing a role check with
 * a permission check. One in-memory table, so a row added or removed is what the very next
 * lookup sees, the same guarantee `currentRole` gives for a role.
 */

type Row = { role: string; permission: string };
const rows = vi.hoisted(() => [] as Row[]);
const db = vi.hoisted(() => ({
    role_permissions: {
        findMany: vi.fn(async ({ where }: { where: { role: string } }) =>
            rows.filter(r => r.role === where.role)),
    },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));

import { hasPermission, isPermission, permissionsForRole } from '@/lib/auth/permissions';

beforeEach(() => {
    rows.length = 0;
    rows.push(
        { role: 'admin', permission: 'users.manage' },
        { role: 'admin', permission: 'payments.refund.approve' },
        { role: 'support_agent', permission: 'support.conversations.reply' },
    );
    db.role_permissions.findMany.mockClear();
});

describe('permissionsForRole', () => {
    it('returns only the permissions granted to that role', async () => {
        const admin = await permissionsForRole('admin');
        expect(admin.has('users.manage')).toBe(true);
        expect(admin.has('support.conversations.reply')).toBe(false);
    });

    it('is empty for a role with no rows, not an error', async () => {
        const result = await permissionsForRole('auditor');
        expect(result.size).toBe(0);
    });

    it('reads fresh — a row added between calls is seen on the next one, no cache in front', async () => {
        expect((await permissionsForRole('support_agent')).has('support.conversations.assign')).toBe(false);
        rows.push({ role: 'support_agent', permission: 'support.conversations.assign' });
        expect((await permissionsForRole('support_agent')).has('support.conversations.assign')).toBe(true);
    });
});

describe('hasPermission', () => {
    it('is true for a granted permission and false for one that was never granted', async () => {
        expect(await hasPermission('admin', 'payments.refund.approve')).toBe(true);
        expect(await hasPermission('support_agent', 'payments.refund.approve')).toBe(false);
    });

    it('is false for a role that holds no rows at all', async () => {
        expect(await hasPermission('user', 'dashboard.view')).toBe(false);
    });
});

describe('isPermission', () => {
    it('accepts a real permission and refuses anything it does not recognise', () => {
        expect(isPermission('users.manage')).toBe(true);
        expect(isPermission('users.delete')).toBe(false);
        expect(isPermission(42)).toBe(false);
    });
});
