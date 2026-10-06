import { describe, it, expect } from 'vitest';
import { validateRoleChange } from '@/lib/auth/roleChange';
import { isRole, canAdminister, ROLES } from '@/lib/auth/roles';

/**
 * Who may be given which role.
 *
 * The route this guards used to coerce rather than validate — anything it did not recognise
 * became `'admin'` — and let an administrator demote themselves out of the console.
 */

const ADMIN = 'admin-1';

describe('validateRoleChange', () => {
    it('accepts a real role for another account', () => {
        expect(validateRoleChange({ actorId: ADMIN, targetId: 'user-2', newRole: 'admin' }))
            .toEqual({ ok: true, targetId: 'user-2', newRole: 'admin' });
    });

    it('refuses a role it does not recognise instead of granting admin', () => {
        // The old behaviour: `role === 'admin' || role === 'user' ? role : 'admin'`. A typo
        // in the request body promoted the target.
        for (const value of ['suport_agent', 'superuser', 'ADMIN', '', null, 42, {}]) {
            const result = validateRoleChange({ actorId: ADMIN, targetId: 'user-2', newRole: value });
            expect(result.ok, `accepted ${JSON.stringify(value)}`).toBe(false);
        }
    });

    it('accepts support_agent, which the database now admits', () => {
        // It was refused while users_role_check allowed only user and admin — accepting it
        // then meant an opaque 500 at the database. The constraint has since widened.
        expect(ROLES).toContain('support_agent');
        expect(validateRoleChange({ actorId: ADMIN, targetId: 'user-2', newRole: 'support_agent' }).ok).toBe(true);
    });

    it('still refuses a role nothing recognises', () => {
        expect(validateRoleChange({ actorId: ADMIN, targetId: 'user-2', newRole: 'superuser' as never }).ok).toBe(false);
    });

    it('will not let an admin take away their own access', () => {
        // There is nothing left that can give it back.
        const result = validateRoleChange({ actorId: ADMIN, targetId: ADMIN, newRole: 'user' });
        expect(result).toEqual({ ok: false, error: 'Cannot demote yourself' });
    });

    it('lets an admin confirm their own role, which changes nothing', () => {
        expect(validateRoleChange({ actorId: ADMIN, targetId: ADMIN, newRole: 'admin' }).ok).toBe(true);
    });

    it('refuses a missing or non-string target', () => {
        expect(validateRoleChange({ actorId: ADMIN, targetId: undefined, newRole: 'admin' }).ok).toBe(false);
        expect(validateRoleChange({ actorId: ADMIN, targetId: '', newRole: 'admin' }).ok).toBe(false);
    });
});

describe('roles', () => {
    it('denies an unrecognised value rather than admitting it', () => {
        expect(isRole('admin')).toBe(true);
        expect(isRole('superuser')).toBe(false);
        expect(canAdminister(undefined)).toBe(false);
        expect(canAdminister(null)).toBe(false);
    });

    it('does not let a Support Agent into the back office', () => {
        // The whole point of the role. An agent reaches the Support Desk because screens
        // were built for them (ADR-0041) — never because a role check widened underneath.
        expect(isRole('support_agent')).toBe(true);
        expect(canAdminister('support_agent')).toBe(false);
    });
});
