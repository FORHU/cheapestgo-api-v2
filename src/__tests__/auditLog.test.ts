import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `logAdminAction` (#118) — the one writer, now carrying the fields the ticket actually asks
 * for. Nothing wrote to `admin_audit_log` under test before this; these are the first.
 */

const writes = vi.hoisted(() => [] as any[]);
const dbState = vi.hoisted(() => ({ down: false }));
vi.mock('@/lib/prisma', () => ({
    prisma: {
        admin_audit_log: {
            create: vi.fn(async ({ data }: { data: any }) => {
                if (dbState.down) throw new Error('database unreachable');
                writes.push(data);
                return { id: 'row-1', ...data };
            }),
        },
    },
}));

import { logAdminAction } from '@/lib/admin/audit';

beforeEach(() => {
    writes.length = 0;
    dbState.down = false;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('logAdminAction', () => {
    it('writes every field the event carries', async () => {
        await logAdminAction({
            action: 'refund_booking', adminId: 'u1', adminEmail: 'a@x.com', actorRole: 'admin',
            targetId: 'pi_1', reason: 'duplicate charge', ip: '203.0.113.9', userAgent: 'Mozilla/5',
            previousValue: { status: 'pending' }, newValue: { status: 'refunded' },
        });

        expect(writes).toHaveLength(1);
        expect(writes[0]).toMatchObject({
            action: 'refund_booking', admin_id: 'u1', admin_email: 'a@x.com', actor_role: 'admin',
            target_id: 'pi_1', reason: 'duplicate charge', ip: '203.0.113.9', user_agent: 'Mozilla/5',
            previous_value: { status: 'pending' }, new_value: { status: 'refunded' },
        });
    });

    it('defaults every optional field to null rather than undefined, so a filter sees it absent', async () => {
        await logAdminAction({ action: 'run_cron' });
        expect(writes[0]).toMatchObject({
            admin_id: null, admin_email: null, actor_role: null, target_id: null,
            reason: null, ip: null, user_agent: null, previous_value: null, new_value: null,
        });
    });

    it('generates a correlation id when the caller has none', async () => {
        await logAdminAction({ action: 'run_cron' });
        expect(writes[0].correlation_id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('keeps the correlation id the caller already has, instead of replacing it', async () => {
        await logAdminAction({ action: 'refund_booking', correlationId: 'c0ffee00-0000-4000-8000-000000000000' });
        expect(writes[0].correlation_id).toBe('c0ffee00-0000-4000-8000-000000000000');
    });

    it('never throws when the write fails — the action it logged must not fail because of it', async () => {
        dbState.down = true;
        await expect(logAdminAction({ action: 'run_cron' })).resolves.toBeUndefined();
    });
});
