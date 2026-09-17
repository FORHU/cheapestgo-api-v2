/**
 * Whether one account may be given a role by another.
 *
 * Separated from the route so the rules can be read in one place and tested without a session.
 * Two of them carry weight:
 *
 * - **An unknown value is refused, not coerced.** The route this replaces read
 *   `role === 'admin' || role === 'user' ? role : 'admin'` — so any value it did not
 *   recognise, including a typo, granted administrator. That is the one direction a
 *   validation mistake must never fall in.
 * - **An admin cannot take their own access away.** There is no way back into a console you
 *   can no longer open, and nothing here can restore it.
 */

import { isRole, type Role } from '@/lib/auth/roles';

export interface RoleChangeInput {
    actorId:  string;
    targetId: unknown;
    newRole:  unknown;
}

export type RoleChangeResult =
    | { ok: true;  targetId: string; newRole: Role }
    | { ok: false; error: string };

export function validateRoleChange({ actorId, targetId, newRole }: RoleChangeInput): RoleChangeResult {
    if (typeof targetId !== 'string' || !targetId) {
        return { ok: false, error: 'Missing or invalid userId' };
    }
    if (!isRole(newRole)) {
        return { ok: false, error: 'Invalid role. Must be "user" or "admin".' };
    }
    if (targetId === actorId && newRole !== 'admin') {
        return { ok: false, error: 'Cannot demote yourself' };
    }
    return { ok: true, targetId, newRole };
}
