import { prisma } from '@/lib/prisma';

/**
 * Every permission a route can require (#106). Namespaced so a new screen is a new permission,
 * not a new role — adding one here and to `role_permissions` is the whole change; nothing that
 * checks a permission needs to know the list grew.
 */
export const PERMISSIONS = [
    'dashboard.view',
    'users.view', 'users.manage',
    'bookings.view', 'bookings.cancel', 'bookings.modify',
    'payments.view', 'payments.refund', 'payments.refund.approve',
    'suppliers.view', 'suppliers.manage',
    'support.conversations.view', 'support.conversations.reply',
    'support.conversations.assign', 'support.conversations.resolve',
    'staff.view', 'staff.invite', 'staff.manage', 'staff.permissions.manage',
    'audit_logs.view', 'reports.view',
    'system_settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Narrow an unvalidated value to a known permission, the way `isRole` narrows a role. */
export function isPermission(value: unknown): value is Permission {
    return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * What a role may do, read fresh every time.
 *
 * Same reasoning as `currentRole`: revoking a permission here must reach the very next request,
 * not wait on a cache TTL or a deploy — that immediacy is #107's "done when", and it is free as
 * long as nothing between this query and the caller holds on to the answer.
 */
export async function permissionsForRole(role: string): Promise<Set<Permission>> {
    const rows = await prisma.role_permissions.findMany({
        where: { role }, select: { permission: true },
    });
    return new Set(rows.map(r => r.permission as Permission));
}

export async function hasPermission(role: string, permission: Permission): Promise<boolean> {
    return (await permissionsForRole(role)).has(permission);
}
