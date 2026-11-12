import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * What a password must be where one is set: 8+ characters, a capital, a digit, and no more than
 * the 72 bytes bcrypt reads. The storefront's form already asked for the first three while the
 * API asked only for eight, so `password1` was one `curl` away. And with an 80-character
 * password, anything sharing the first 72 characters signed in as correct.
 *
 * Applies to register, reset and change. Sign-in is left alone: a stored password keeps working
 * until its next change.
 */

vi.mock('bcryptjs', () => ({
    default: { hash: vi.fn(async () => 'hashed'), compare: vi.fn(async () => true) },
}));
vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
        API_URL: 'http://localhost:4000', SITE_URL: 'http://localhost:3000', NODE_ENV: 'test',
    },
}));
vi.mock('@/middleware/rate-limit.middleware', () => ({
    authRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('@/lib/redis', () => ({ redis: {} }));

const authRepo = vi.hoisted(() => ({
    findByEmail: vi.fn(async () => null),
    create: vi.fn(async (d: { email: string }) => ({ id: 'u1', email: d.email, role: 'user' })),
}));
const db = vi.hoisted(() => ({
    users: { update: vi.fn(async () => ({})) },
    password_reset_tokens: {
        findFirst: vi.fn(async () => ({ user_id: 'u1' })),
        delete: vi.fn(async () => ({})),
    },
}));
vi.mock('@/repositories/auth.repository', () => ({ AuthRepository: class { constructor() { return authRepo; } } }));
vi.mock('@/repositories/users.repository', () => ({ usersRepository: {}, UsersRepository: class {} }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));

import bcrypt from 'bcryptjs';
import { AuthService } from '@/services/auth.service';
import { UsersService } from '@/services/users.service';
import { errorMiddleware } from '@/middleware/error.middleware';
import authRouter from '@/routes/auth.route';
import { passwordProblem, PASSWORD_MAX_BYTES } from '@/lib/auth/password';

const GOOD = 'Password1';
const AT_LIMIT = 'Aa1' + 'x'.repeat(PASSWORD_MAX_BYTES - 3);
const OVER = AT_LIMIT + 'TAIL-ONE';

beforeEach(() => vi.clearAllMocks());

describe('passwordProblem', () => {
    it('accepts one that meets every rule, and one of exactly 72 bytes', () => {
        expect(passwordProblem(GOOD)).toBeNull();
        expect(passwordProblem(AT_LIMIT)).toBeNull();
    });

    it.each([
        ['Pass1',        /at least 8 characters/],
        ['password1',    /uppercase letter/],
        ['Password',     /number/],
        [OVER,           /72 bytes or fewer/],
    ])('refuses %s, saying why', (password, why) => {
        expect(passwordProblem(password)).toMatch(why);
    });

    it('counts bytes, not characters: 36 two-byte letters fit, 37 do not', () => {
        expect(passwordProblem('A1' + 'é'.repeat(35))).toBeNull();
        expect(passwordProblem('A1' + 'é'.repeat(36))).toMatch(/72 bytes/);
    });
});

describe('AuthService.register', () => {
    const service = new AuthService();

    it.each(['password1', 'Password', OVER])('refuses %s before anything is hashed or stored', async (password) => {
        await expect(service.register({ email: 'a@example.com', password })).rejects.toMatchObject({
            statusCode: 422, code: 'VALIDATION_ERROR',
        });
        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(authRepo.create).not.toHaveBeenCalled();
    });

    it('answers a weak password the same whether or not the address is taken', async () => {
        authRepo.findByEmail.mockResolvedValueOnce({ id: 'someone' } as never);
        await expect(service.register({ email: 'taken@example.com', password: 'password1' })).rejects.toMatchObject({
            statusCode: 422,
        });
        // The weak password is refused before the lookup, so the queued answer was never used.
        authRepo.findByEmail.mockReset();
        authRepo.findByEmail.mockResolvedValue(null);
    });

    it('still registers a strong password, including one at the limit', async () => {
        await service.register({ email: 'a@example.com', password: GOOD });
        await service.register({ email: 'b@example.com', password: AT_LIMIT });
        expect(authRepo.create).toHaveBeenCalledTimes(2);
    });
});

describe('UsersService.changePassword', () => {
    const repo = { findPasswordHash: vi.fn(async () => 'old-hash'), savePasswordHash: vi.fn() };
    const service = new UsersService(repo as never);

    it.each(['password1', OVER])('refuses %s as a new password and leaves the stored one alone', async (next) => {
        await expect(service.changePassword('u1', 'Current1', next)).rejects.toMatchObject({ statusCode: 422 });
        expect(repo.savePasswordHash).not.toHaveBeenCalled();
    });

    it('does not turn away the current password for breaking the rules: it may predate them', async () => {
        await service.changePassword('u1', 'password1', GOOD);
        expect(repo.savePasswordHash).toHaveBeenCalled();
    });
});

describe('PUT /auth/reset-password', () => {
    let server: Server;
    let url = '';

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/auth', authRouter);
        app.use(errorMiddleware);
        await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/reset-password`;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    const reset = (password: string) => fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'tok', password }),
    });

    it.each(['password1', 'Password', OVER])('answers 422 to %s and sets nothing', async (password) => {
        const response = await reset(password);
        expect(response.status).toBe(422);
        expect(((await response.json()) as { error: string }).error).toBe('VALIDATION_ERROR');
        expect(db.users.update).not.toHaveBeenCalled();
    });

    it('sets a strong password', async () => {
        expect((await reset(GOOD)).status).toBe(200);
        expect(db.users.update).toHaveBeenCalled();
    });
});
