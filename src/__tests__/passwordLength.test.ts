import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * bcrypt reads 72 bytes of a password and ignores the rest. With an 80-character password,
 * anything sharing the first 72 characters signed in as correct. So a password that long is
 * refused where it is set — register, reset, change — rather than accepted and half read.
 * Sign-in is left alone: a password already stored keeps working until its next reset.
 */

vi.mock('bcryptjs', () => ({
    default: { hash: vi.fn(async () => 'hashed'), compare: vi.fn(async () => true) },
}));
vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
        NODE_ENV: 'test',
    },
}));

const authRepo = vi.hoisted(() => ({
    findByEmail: vi.fn(async () => null),
    create: vi.fn(async (d: { email: string }) => ({ id: 'u1', email: d.email, role: 'user' })),
}));
vi.mock('@/repositories/auth.repository', () => ({ AuthRepository: class { constructor() { return authRepo; } } }));
vi.mock('@/repositories/users.repository', () => ({ usersRepository: {}, UsersRepository: class {} }));

import bcrypt from 'bcryptjs';
import { AuthService } from '@/services/auth.service';
import { UsersService } from '@/services/users.service';
import { assertPasswordFitsBcrypt, PASSWORD_MAX_BYTES } from '@/lib/auth/password';

const AT_LIMIT = 'Aa1' + 'x'.repeat(PASSWORD_MAX_BYTES - 3);
const OVER = AT_LIMIT + 'TAIL-ONE';

beforeEach(() => vi.clearAllMocks());

describe('assertPasswordFitsBcrypt', () => {
    it('accepts a password of exactly 72 bytes', () => {
        expect(() => assertPasswordFitsBcrypt(AT_LIMIT)).not.toThrow();
    });

    it('refuses the 80-byte password from the report, with a clear message', () => {
        expect(() => assertPasswordFitsBcrypt(OVER)).toThrow(/72 bytes or fewer/);
    });

    it('counts bytes, not characters: 37 two-byte letters are 74 bytes', () => {
        const accented = 'é'.repeat(37);
        expect(accented).toHaveLength(37);
        expect(() => assertPasswordFitsBcrypt(accented)).toThrow(/72 bytes/);
        expect(() => assertPasswordFitsBcrypt('é'.repeat(36))).not.toThrow();
    });
});

describe('AuthService.register', () => {
    const service = new AuthService();

    it('refuses an over-long password before anything is hashed or stored', async () => {
        await expect(service.register({ email: 'a@example.com', password: OVER })).rejects.toThrow(/72 bytes/);
        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(authRepo.create).not.toHaveBeenCalled();
    });

    it('still registers a password at the limit', async () => {
        await service.register({ email: 'a@example.com', password: AT_LIMIT });
        expect(authRepo.create).toHaveBeenCalled();
    });
});

describe('UsersService.changePassword', () => {
    const repo = { findPasswordHash: vi.fn(async () => 'old-hash'), savePasswordHash: vi.fn() };
    const service = new UsersService(repo as never);

    it('refuses an over-long new password and leaves the stored one alone', async () => {
        await expect(service.changePassword('u1', 'current-pass', OVER)).rejects.toThrow(/New password must be 72 bytes/);
        expect(repo.savePasswordHash).not.toHaveBeenCalled();
    });

    it('does not turn away the current password for being long: it may predate the limit', async () => {
        await service.changePassword('u1', OVER, 'a-fine-new-password');
        expect(repo.savePasswordHash).toHaveBeenCalled();
    });
});
