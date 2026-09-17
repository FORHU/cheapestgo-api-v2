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
 * **`support_agent` is deliberately absent.** v1 has it, but v2's `users_role_check` constraint
 * admits only `user` and `admin`, so writing it here would let a request pass validation and
 * then fail at the database as an opaque 500. It arrives with the Support Desk (C8), together
 * with the migration that widens the constraint.
 */

export const ROLES = ['user', 'admin'] as const;

export type Role = (typeof ROLES)[number];

/** Narrow an unvalidated value — a session field, a request body — to a known role. */
export function isRole(value: unknown): value is Role {
    return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** May reach the back office: bookings, revenue, Stripe, settings, everyone's data. */
export function canAdminister(role: Role | null | undefined): boolean {
    return role === 'admin';
}

/** How a role is written where a person reads it. */
export function roleLabel(role: Role | null | undefined): string {
    return role === 'admin' ? 'Administrator' : 'Standard User';
}
