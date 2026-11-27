import { logAdminAction } from '@/lib/admin/audit';

/**
 * A refused permission check, written to the audit log (#118) rather than only a stdout line.
 *
 * `logAdminAction` already mirrors every row to stdout as a structured line, so this doesn't
 * keep a separate logger beside it — that would be the exact duplicate-writer problem #118
 * already consolidated away once, in `adminSettingsService.logAction`.
 */
export async function logPermissionRefusal(
    user: { sub: string; email?: string; role?: string },
    permission: string,
    path: string,
    reason: 'permission' | 'resource',
) {
    await logAdminAction({
        action:     'permission_refused',
        adminId:    user.sub,
        adminEmail: user.email,
        targetId:   path,
        details:    { permission, role: user.role, reason },
    });
}
