import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * An address is the account's identity, so `Ana@Example.com` and `ana@example.com` are one
 * person. Register and login stored and looked it up exactly as typed while request-reset and
 * the Google callback lower-cased it: a customer who registered with capitals could not sign in
 * in lower case, was never sent a reset email, and could be registered a second time.
 */

const db = vi.hoisted(() => ({
    users: {
        findUnique: vi.fn(),
        findFirst:  vi.fn(),
        create:     vi.fn(async ({ data }: { data: { email: string } }) => ({ id: 'new', ...data })),
    },
    password_reset_tokens: { upsert: vi.fn(async () => ({})) },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/redis', () => ({ redis: {} }));
vi.mock('@/middleware/rate-limit.middleware', () => ({
    authRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
        API_URL: 'http://localhost:4000', SITE_URL: 'http://localhost:3000', NODE_ENV: 'test',
    },
}));
vi.mock('bcryptjs', () => ({
    default: { hash: vi.fn(async () => 'hashed'), compare: vi.fn(async () => true) },
}));

import { AuthRepository } from '@/repositories/auth.repository';
import { errorMiddleware } from '@/middleware/error.middleware';
import authRouter from '@/routes/auth.route';

beforeEach(() => {
    vi.clearAllMocks();
    db.users.findUnique.mockResolvedValue(null);
    db.users.findFirst.mockResolvedValue(null);
});

describe('AuthRepository.findByEmail', () => {
    const repo = new AuthRepository();

    it('looks up the address trimmed and lower-cased', async () => {
        await repo.findByEmail('  Ana@Example.COM ');
        expect(db.users.findUnique).toHaveBeenCalledWith({ where: { email: 'ana@example.com' } });
    });

    it('stops at the indexed match when there is one', async () => {
        db.users.findUnique.mockResolvedValue({ id: 'u1' });
        expect(await repo.findByEmail('ana@example.com')).toEqual({ id: 'u1' });
        expect(db.users.findFirst).not.toHaveBeenCalled();
    });

    it('still finds an account stored with capitals, so the fix does not lock those customers out', async () => {
        db.users.findFirst.mockResolvedValue({ id: 'old', email: 'Ana@Example.com' });
        expect(await repo.findByEmail('ana@example.com')).toMatchObject({ id: 'old' });
        expect(db.users.findFirst).toHaveBeenCalledWith({
            where:   { email: { equals: 'ana@example.com', mode: 'insensitive' } },
            orderBy: { created_at: 'asc' },
        });
    });
});

describe('the auth endpoints', () => {
    let server: Server;
    let url = '';

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/auth', authRouter);
        app.use(errorMiddleware);
        await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    const post = (path: string, body: object) => fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    it('stores a new account under the lower-case address', async () => {
        const response = await post('/register', { email: 'Ana@Example.test', password: 'E2e-password-1' });
        expect(response.status).toBe(201);
        expect(db.users.create.mock.calls[0][0].data.email).toBe('ana@example.test');
    });

    it('answers EMAIL_TAKEN to a second registration in another case', async () => {
        db.users.findUnique.mockResolvedValue({ id: 'u1', email: 'ana@example.test' });
        const response = await post('/register', { email: 'ANA@example.test', password: 'E2e-password-1' });
        expect(response.status).toBe(409);
        expect(((await response.json()) as { error: string }).error).toBe('EMAIL_TAKEN');
        expect(db.users.create).not.toHaveBeenCalled();
    });

    it('signs in with the address in any case, and with a stray space around it', async () => {
        db.users.findUnique.mockResolvedValue({ id: 'u1', email: 'ana@example.test', password_hash: 'h', role: 'user' });
        const response = await post('/login', { email: ' Ana@Example.test ', password: 'E2e-password-1' });
        expect(response.status).toBe(200);
        expect(db.users.findUnique).toHaveBeenCalledWith({ where: { email: 'ana@example.test' } });
    });

    it('finds a capitalised account when a reset is requested, so its email is sent', async () => {
        db.users.findFirst.mockResolvedValue({ id: 'old', email: 'Ana@Example.test' });
        const response = await post('/request-reset', { email: 'ana@example.test' });
        expect(response.status).toBe(200);
        expect(db.users.findFirst).toHaveBeenCalled();
    });
});
