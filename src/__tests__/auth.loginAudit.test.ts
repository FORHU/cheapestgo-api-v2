import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

/**
 * Login/failed-login logging for staff accounts (#118). Not for customers — see the comment
 * beside `isStaff` in `auth.service.ts`: a row per customer login would be most of this
 * table's volume for none of its purpose.
 */

vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
    },
}));

const audit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: audit }));

const users = vi.hoisted(() => new Map<string, any>());
vi.mock('@/repositories/auth.repository', () => ({
    AuthRepository: class {
        findByEmail = async (email: string) => [...users.values()].find(u => u.email === email) ?? null;
    },
}));

import { AuthService } from '@/services/auth.service';
import { AppError } from '@/middleware/error.middleware';

const service = new AuthService();

beforeEach(async () => {
    audit.mockClear();
    users.clear();
    const password_hash = await bcrypt.hash('correct-password', 4);
    users.set('admin-1', { id: 'admin-1', email: 'admin@x.com', role: 'admin', password_hash, banned_at: null });
    users.set('agent-1', { id: 'agent-1', email: 'agent@x.com', role: 'support_agent', password_hash, banned_at: null });
    users.set('cust-1',  { id: 'cust-1',  email: 'cust@x.com',  role: 'user',  password_hash, banned_at: null });
    users.set('banned-admin', { id: 'banned-admin', email: 'banned@x.com', role: 'admin', password_hash, banned_at: new Date() });
});

describe('login (#118)', () => {
    it('logs a successful staff login, with the role', async () => {
        await service.login('admin@x.com', 'correct-password');
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'login', adminId: 'admin-1', adminEmail: 'admin@x.com', actorRole: 'admin',
        }));
    });

    it('logs a successful support_agent login too, not just admin', async () => {
        await service.login('agent@x.com', 'correct-password');
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actorRole: 'support_agent' }));
    });

    it('does not log an ordinary customer login', async () => {
        await service.login('cust@x.com', 'correct-password');
        expect(audit).not.toHaveBeenCalled();
    });

    it('logs a failed staff login with the wrong password', async () => {
        await expect(service.login('admin@x.com', 'wrong')).rejects.toThrow(AppError);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'login_failed', adminId: 'admin-1', reason: 'wrong password',
        }));
    });

    it('does not log a failed customer login', async () => {
        await expect(service.login('cust@x.com', 'wrong')).rejects.toThrow(AppError);
        expect(audit).not.toHaveBeenCalled();
    });

    it('never logs an unknown email — indistinguishable from a typo, and loggable by anyone', async () => {
        await expect(service.login('nobody@x.com', 'whatever')).rejects.toThrow(AppError);
        expect(audit).not.toHaveBeenCalled();
    });

    it('logs a suspended staff account trying to sign in, distinguishably from a bad password', async () => {
        await expect(service.login('banned@x.com', 'correct-password')).rejects.toThrow(AppError);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'login_failed', reason: 'account suspended',
        }));
    });
});
