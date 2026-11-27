import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `logPermissionRefusal` now writes a real row (#118's own "done when": a refused attempt is
 * findable) instead of only `logger.warn` — this is the delegation itself.
 */

const audit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: audit }));

import { logPermissionRefusal } from '@/lib/auth/permissionLog';

beforeEach(() => { audit.mockClear(); });

describe('logPermissionRefusal', () => {
    it('writes an audit row naming the actor, the permission, and why it was refused', async () => {
        await logPermissionRefusal(
            { sub: 'agent-1', email: 'agent@x.com', role: 'support_agent' },
            'payments.refund.approve', '/admin/stripe', 'permission',
        );

        expect(audit).toHaveBeenCalledWith({
            action: 'permission_refused',
            adminId: 'agent-1',
            adminEmail: 'agent@x.com',
            targetId: '/admin/stripe',
            details: { permission: 'payments.refund.approve', role: 'support_agent', reason: 'permission' },
        });
    });

    it('distinguishes a resource refusal from a permission refusal in details.reason', async () => {
        await logPermissionRefusal(
            { sub: 'agent-1', role: 'support_agent' },
            'support.conversations.reply', '/admin/support/conversations/1/messages', 'resource',
        );

        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            details: expect.objectContaining({ reason: 'resource' }),
        }));
    });
});
