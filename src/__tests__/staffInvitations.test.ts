import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * Staff invitation, acceptance, listing and revocation. See issue #105.
 *
 * Runs the real routers and the real `requireRole` gate; only Redis, the database and mail
 * are stood in for — the same shape `suspensionEndsSessions.test.ts` uses, so a staff account
 * created here and an account suspended there are checked against one shared understanding
 * of what `users` and `requireRole` do.
 */

vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
        API_URL: 'http://localhost:4000', SITE_URL: 'http://localhost:3000', NODE_ENV: 'test',
    },
}));
vi.mock('@/lib/redis', () => ({
    redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => 0) },
}));
vi.mock('@/middleware/rate-limit.middleware', () => ({
    authRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('bcryptjs', () => ({
    default: { hash: vi.fn(async () => 'hashed'), compare: vi.fn(async () => true) },
}));

const sentEmails = vi.hoisted(() => [] as { to: string; subject: string; html: string }[]);
vi.mock('@/lib/email/mailer', () => ({
    mailConfigured: () => true,
    sendMail: vi.fn(async (m: { to: string; subject: string; html: string }) => {
        sentEmails.push(m);
        return { ok: true };
    }),
}));

const auditEvents = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('@/lib/admin/audit', () => ({
    logAdminAction: vi.fn(async (event: Record<string, unknown>) => { auditEvents.push(event); }),
}));

type UserRow = {
    id: string; email: string; password_hash: string | null; role: string;
    first_name: string | null; last_name: string | null; banned_at: Date | null;
};
const users = vi.hoisted(() => new Map<string, UserRow>());
const normaliseEmail = vi.hoisted(() => (email: string) => email.trim().toLowerCase());

vi.mock('@/lib/prisma', () => ({
    prisma: {
        // Read by `requireRole` (via `currentRole`) for whichever account the test signs in as.
        users: {
            findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
                const row = users.get(where.id);
                return row ? { role: row.role } : null;
            }),
        },
    },
}));

vi.mock('@/repositories/auth.repository', () => ({
    normaliseEmail,
    AuthRepository: class {
        findByEmail = async (email: string) => {
            const wanted = normaliseEmail(email);
            return [...users.values()].find(u => u.email === wanted) ?? null;
        };
        findById = async (id: string) => users.get(id) ?? null;
        create = async (data: { email: string; password_hash: string; role?: string; first_name?: string; last_name?: string }) => {
            const id = `user-${users.size + 1}`;
            const row: UserRow = {
                id, email: normaliseEmail(data.email), password_hash: data.password_hash,
                role: data.role ?? 'user', first_name: data.first_name ?? null, last_name: data.last_name ?? null,
                banned_at: null,
            };
            users.set(id, row);
            return row;
        };
    },
}));

type InvitationRow = {
    id: string; email: string; role: string; token_hash: string; invited_by: string;
    expires_at: Date; accepted_at: Date | null; revoked_at: Date | null; created_at: Date;
};
const invitations = vi.hoisted(() => new Map<string, InvitationRow>());

vi.mock('@/repositories/staffInvitations.repository', async () => {
    return {
        StaffInvitationsRepository: class {
            findPendingByEmail = async (email: string) => {
                const wanted = normaliseEmail(email);
                const now = new Date();
                return [...invitations.values()].find(i =>
                    i.email === wanted && !i.accepted_at && !i.revoked_at && i.expires_at > now,
                ) ?? null;
            };
            findByTokenHash = async (tokenHash: string) =>
                [...invitations.values()].find(i => i.token_hash === tokenHash) ?? null;
            findById = async (id: string) => invitations.get(id) ?? null;
            create = async (data: { email: string; role: string; tokenHash: string; invitedBy: string; expiresAt: Date }) => {
                const id = `inv-${invitations.size + 1}`;
                const row: InvitationRow = {
                    id, email: normaliseEmail(data.email), role: data.role, token_hash: data.tokenHash,
                    invited_by: data.invitedBy, expires_at: data.expiresAt,
                    accepted_at: null, revoked_at: null, created_at: new Date(),
                };
                invitations.set(id, row);
                return row;
            };
            list = async () => [...invitations.values()].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
            markAccepted = async (id: string) => {
                const row = invitations.get(id)!;
                row.accepted_at = new Date();
                return row;
            };
            markRevoked = async (id: string) => {
                const row = invitations.get(id)!;
                row.revoked_at = new Date();
                return row;
            };
        },
    };
});

import { staffInvitationsAdminRouter, staffInvitationsPublicRouter } from '@/routes/staff-invitations.route';
import { errorMiddleware } from '@/middleware/error.middleware';

const NOW = Math.floor(Date.now() / 1000);
const tokenFor = (sub: string, role: string) => jwt.sign({ sub, email: `${sub}@example.com`, role, iat: NOW - 5 }, 'test-secret');
const ADMIN_TOKEN = tokenFor('admin-1', 'admin');
const AGENT_TOKEN  = tokenFor('agent-1', 'support_agent');

let server: Server;
let url = '';

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/admin/staff/invitations', staffInvitationsAdminRouter);
    app.use('/auth/staff', staffInvitationsPublicRouter);
    app.use(errorMiddleware);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
    users.clear();
    invitations.clear();
    sentEmails.length = 0;
    auditEvents.length = 0;
    users.set('admin-1', { id: 'admin-1', email: 'admin-1@example.com', password_hash: 'x', role: 'admin', first_name: null, last_name: null, banned_at: null });
    users.set('agent-1', { id: 'agent-1', email: 'agent-1@example.com', password_hash: 'x', role: 'support_agent', first_name: null, last_name: null, banned_at: null });
});

const invite = (body: object, token = ADMIN_TOKEN) =>
    fetch(`${url}/admin/staff/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

const list = (token = ADMIN_TOKEN) =>
    fetch(`${url}/admin/staff/invitations`, { headers: { Authorization: `Bearer ${token}` } });

const revoke = (id: string, token = ADMIN_TOKEN) =>
    fetch(`${url}/admin/staff/invitations/${id}/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });

const accept = (body: object) =>
    fetch(`${url}/auth/staff/accept-invitation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });

const json = (res: Response): Promise<any> => res.json();

const tokenFromLastEmail = () => {
    const html = sentEmails[sentEmails.length - 1].html;
    const match = /token=([A-Za-z0-9_-]+)/.exec(html);
    if (!match) throw new Error('no token in invite email');
    return match[1];
};

describe('POST /admin/staff/invitations', () => {
    it('refuses anyone but admin — support_agent included', async () => {
        const res = await invite({ email: 'new-agent@example.com', role: 'support_agent' }, AGENT_TOKEN);
        expect(res.status).toBe(403);
    });

    it('lets an admin invite a support_agent, and emails the accept link', async () => {
        const res = await invite({ email: 'new-agent@example.com', role: 'support_agent' });
        expect(res.status).toBe(201);
        const body = await json(res);
        expect(body.invitation.email).toBe('new-agent@example.com');
        expect(body.invitation.role).toBe('support_agent');
        // Never the token, never a hash of it — only what a console needs to manage invitations.
        expect(body.invitation.token).toBeUndefined();
        expect(body.invitation.tokenHash).toBeUndefined();
        expect(sentEmails).toHaveLength(1);
        expect(sentEmails[0].to).toBe('new-agent@example.com');
        expect(auditEvents.map(e => e.action)).toContain('staff_invitation_sent');
    });

    it('refuses to invite someone as a plain user — this door grants staff access only', async () => {
        const res = await invite({ email: 'x@example.com', role: 'user' });
        expect(res.status).toBe(400);
    });

    it('refuses an address that already has an account', async () => {
        const res = await invite({ email: 'admin-1@example.com', role: 'support_agent' });
        expect(res.status).toBe(409);
        expect((await json(res)).error).toBe('EMAIL_TAKEN');
    });

    it('refuses a second invitation while one is already pending', async () => {
        expect((await invite({ email: 'dup@example.com', role: 'support_agent' })).status).toBe(201);
        const second = await invite({ email: 'dup@example.com', role: 'support_agent' });
        expect(second.status).toBe(409);
    });
});

describe('POST /auth/staff/accept-invitation', () => {
    it('creates the account with the invited role and signs it in', async () => {
        await invite({ email: 'new-agent@example.com', role: 'support_agent' });
        const token = tokenFromLastEmail();

        const res = await accept({ token, password: 'Passw0rd!', first_name: 'New', last_name: 'Agent' });
        expect(res.status).toBe(201);
        const body = await json(res);
        expect(body.user.email).toBe('new-agent@example.com');
        expect(body.user.role).toBe('support_agent');
        expect(body.user.password_hash).toBeUndefined();
        expect(res.headers.getSetCookie().some(c => c.startsWith('access_token='))).toBe(true);
        expect(auditEvents.map(e => e.action)).toContain('staff_invitation_accepted');
    });

    it('refuses a token nobody sent', async () => {
        const res = await accept({ token: 'not-a-real-token', password: 'Passw0rd!' });
        expect(res.status).toBe(400);
        expect((await json(res)).error).toBe('INVITATION_NOT_FOUND');
    });

    it('refuses the same token a second time — distinguishably, as "used"', async () => {
        await invite({ email: 'once@example.com', role: 'support_agent' });
        const token = tokenFromLastEmail();
        expect((await accept({ token, password: 'Passw0rd!' })).status).toBe(201);

        const second = await accept({ token, password: 'Passw0rd!' });
        expect(second.status).toBe(400);
        expect((await json(second)).error).toBe('INVITATION_USED');
    });

    it('refuses a revoked invitation — distinguishably, as "revoked"', async () => {
        const inviteRes = await invite({ email: 'revoked@example.com', role: 'support_agent' });
        const { invitation } = await json(inviteRes);
        const token = tokenFromLastEmail();

        expect((await revoke(invitation.id)).status).toBe(200);

        const res = await accept({ token, password: 'Passw0rd!' });
        expect(res.status).toBe(400);
        expect((await json(res)).error).toBe('INVITATION_REVOKED');
    });

    it('refuses an expired invitation — distinguishably, as "expired"', async () => {
        await invite({ email: 'expired@example.com', role: 'support_agent' });
        const token = tokenFromLastEmail();
        // Reach past the service and age the row, rather than waiting seven days.
        for (const row of invitations.values()) {
            if (row.email === 'expired@example.com') row.expires_at = new Date(Date.now() - 1000);
        }

        const res = await accept({ token, password: 'Passw0rd!' });
        expect(res.status).toBe(400);
        expect((await json(res)).error).toBe('INVITATION_EXPIRED');
    });
});

describe('revoke and list', () => {
    it('cannot revoke an invitation that has already been accepted', async () => {
        const inviteRes = await invite({ email: 'taken@example.com', role: 'support_agent' });
        const { invitation } = await json(inviteRes);
        const token = tokenFromLastEmail();
        await accept({ token, password: 'Passw0rd!' });

        const res = await revoke(invitation.id);
        expect(res.status).toBe(409);
    });

    it('lists invitations for an admin', async () => {
        await invite({ email: 'a@example.com', role: 'support_agent' });
        await invite({ email: 'b@example.com', role: 'admin' });
        const res = await list();
        expect(res.status).toBe(200);
        const { invitations: rows } = await json(res);
        expect(rows).toHaveLength(2);
    });

    it('refuses a non-admin trying to list invitations', async () => {
        expect((await list(AGENT_TOKEN)).status).toBe(403);
    });
});
