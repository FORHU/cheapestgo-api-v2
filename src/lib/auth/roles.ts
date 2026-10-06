/**
 * What each role may do, in one place.
 *
 * Every guard compares against the literal `'admin'`. That is safe with two roles — anything
 * else is denied by default — but it means the answer to "what can this role reach?" is spread
 * across every route file and can only be got by reading all of them.
 *
 * `users.role` is the authority (ADR-0003); this module is only the reading of it. Every
 * function refuses a value it does not recognise, so a role invented in a newer deployment, or
 * a typo in a hand-written UPDATE, loses access rather than gaining it.
 *
 * **`support_agent` grants no back-office access.** It was absent while v2's `users_role_check`
 * admitted only `user` and `admin` — writing it then would have passed validation and failed at
 * the database as an opaque 500. The constraint now admits it, so the role is real here too.
 * What it does *not* do is administer: `canAdminister` names `admin` alone, on purpose. An agent
 * reaches the Support Desk because screens are built for them, never because a role check
 * widened underneath (ADR-0041).
 */

export const ROLES = ['user', 'admin', 'support_agent'] as const;

export type Role = (typeof ROLES)[number];

/** Narrow an unvalidated value — a session field, a request body — to a known role. */
export function isRole(value: unknown): value is Role {
    return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** May reach the back office: bookings, revenue, Stripe, settings, everyone's data. */
export function canAdminister(role: Role | null | undefined): boolean {
    return role === 'admin';
}

/**
 * Where signing in puts someone, by role.
 *
 * Null for a customer: they were already going somewhere. Staff were not — an agent
 * dropped on the marketing site has no way to find the inbox from there.
 */
export function landingFor(role: Role | null | undefined): string | null {
    if (role === 'admin') return '/admin/overview';
    if (role === 'support_agent') return '/admin/support';
    return null;
}

/** How a role is written where a person reads it. */
export function roleLabel(role: Role | null | undefined): string {
    if (role === 'admin') return 'Administrator';
    if (role === 'support_agent') return 'Support Agent';
    return 'Standard User';
}
