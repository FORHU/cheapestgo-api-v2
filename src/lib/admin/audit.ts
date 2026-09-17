/**
 * Every privileged admin action, written down.
 *
 * Two destinations on purpose. The structured stdout line is the reliable one — it survives a
 * database that is down, which is exactly when an admin is most likely to be doing something
 * worth recording. The `admin_audit_log` row is what the console can query afterwards.
 *
 * Safe to call fire-and-forget: it never throws, because an action must not fail because its
 * audit row did.
 */

import { prisma } from '@/lib/prisma';

export interface AuditEvent {
    action:      string;
    adminId:     string;
    adminEmail?: string;
    targetId?:   string;
    details?:    Record<string, unknown>;
}

export async function logAdminAction(event: AuditEvent): Promise<void> {
    console.log(JSON.stringify({ _event: 'admin_action', ...event, timestamp: new Date().toISOString() }));

    await prisma.admin_audit_log.create({
        data: {
            action:      event.action,
            admin_id:    event.adminId,
            admin_email: event.adminEmail ?? null,
            target_id:   event.targetId ?? null,
            details:     (event.details ?? {}) as any,
        },
    }).catch((err: any) => console.error('[audit] could not write admin_audit_log:', err?.message));
}
