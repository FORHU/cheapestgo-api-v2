import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';

/**
 * Every privileged action, written down. The one writer (#118) — `adminSettingsService.logAction`
 * used to duplicate this with its own inline `prisma.admin_audit_log.create`; it now delegates
 * here instead of keeping a second copy of the same write to drift from.
 *
 * Two destinations on purpose. The structured stdout line is the reliable one — it survives a
 * database that is down, which is exactly when an action is most likely to be worth recording.
 * The `admin_audit_log` row is what a console can query and filter afterwards.
 *
 * Safe to call fire-and-forget: it never throws, because an action must not fail because its
 * audit row did.
 */

export interface AuditEvent {
    action:         string;
    adminId?:       string;
    adminEmail?:    string;
    /** The actor's role at the time — `adminId` alone goes stale the moment a role changes. */
    actorRole?:     string;
    targetId?:      string;
    details?:       Record<string, unknown>;
    /** Why, for an action that asks the actor to say (a refund override, a manual intervention). */
    reason?:        string;
    ip?:            string;
    userAgent?:     string;
    /** Groups every row one request produced. Generated when the caller doesn't have one yet. */
    correlationId?: string;
    previousValue?: unknown;
    newValue?:      unknown;
}

export async function logAdminAction(event: AuditEvent): Promise<void> {
    const correlationId = event.correlationId ?? randomUUID();

    console.log(JSON.stringify({ _event: 'admin_action', ...event, correlationId, timestamp: new Date().toISOString() }));

    await prisma.admin_audit_log.create({
        data: {
            action:         event.action,
            admin_id:       event.adminId ?? null,
            admin_email:    event.adminEmail ?? null,
            actor_role:     event.actorRole ?? null,
            target_id:      event.targetId ?? null,
            details:        (event.details ?? {}) as any,
            reason:         event.reason ?? null,
            ip:             event.ip ?? null,
            user_agent:     event.userAgent ?? null,
            correlation_id: correlationId,
            previous_value: (event.previousValue ?? null) as any,
            new_value:      (event.newValue ?? null) as any,
        },
    }).catch((err: any) => console.error('[audit] could not write admin_audit_log:', err?.message));
}
