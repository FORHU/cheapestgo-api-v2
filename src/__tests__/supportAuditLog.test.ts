import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

/**
 * Support's reply/assign/return/resolve now write a row (#118) — this was the one category
 * with zero coverage. Through the real router and real middleware; only the service, the
 * repository `/hours` reaches for, and the audit writer are stood in for.
 */

vi.mock('@/config', () => ({
    config: {
        JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1d',
        JWT_REFRESH_SECRET: 'test-refresh', JWT_REFRESH_EXPIRES_IN: '7d',
    },
}));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn(async () => null) } }));

const roleOf = vi.hoisted(() => new Map<string, string>([['admin-1', 'admin'], ['agent-1', 'support_agent']]));
vi.mock('@/lib/prisma', () => ({
    prisma: { users: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        ({ role: roleOf.get(where.id) ?? null })) } },
}));

const audit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: audit }));

vi.mock('@/repositories/support.repository', () => ({ SupportRepository: class {} }));
vi.mock('@/lib/support/availability', () => ({ getSupportHours: vi.fn(), saveSupportHours: vi.fn() }));
vi.mock('@/lib/support/stream', () => ({ openEventStream: vi.fn() }));
vi.mock('@/lib/support/attachments', () => ({ MAX_ATTACHMENT_BYTES: 1024 }));
vi.mock('@/lib/support/attachmentStorage', () => ({ attachmentsConfigured: vi.fn() }));

const svc = vi.hoisted(() => ({
    agentReply:    vi.fn(async () => ({ id: 'msg-1' })),
    assign:        vi.fn(async () => ({ ok: true })),
    returnToQueue: vi.fn(async () => undefined),
    resolve:       vi.fn(async () => undefined),
}));
vi.mock('@/services/support.service', () => ({
    SupportService: class {
        agentReply = svc.agentReply;
        assign = svc.assign;
        returnToQueue = svc.returnToQueue;
        resolve = svc.resolve;
    },
}));

import router from '@/routes/admin-support.route';
import { errorMiddleware } from '@/middleware/error.middleware';

const CHAT = '11111111-0000-4000-8000-000000000001';
const tokenFor = (sub: string, role: string, email: string) => jwt.sign({ sub, email, role }, 'test-secret');

let server: Server;
let url = '';

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/admin/support', router);
    app.use(errorMiddleware);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => { audit.mockClear(); Object.values(svc).forEach(fn => fn.mockClear()); });

const post = (path: string, token: string, body: unknown = {}) =>
    fetch(`${url}/admin/support${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

describe('support actions write an audit row (#118)', () => {
    it('logs a reply, with the agent and the conversation', async () => {
        const token = tokenFor('agent-1', 'support_agent', 'agent@x.com');
        const res = await post(`/conversations/${CHAT}/messages`, token, { body: 'On it!' });

        expect(res.status).toBe(201);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'support_reply', adminId: 'agent-1', adminEmail: 'agent@x.com',
            actorRole: 'support_agent', targetId: CHAT,
        }));
    });

    it('logs an assignment, with who it went to', async () => {
        const token = tokenFor('admin-1', 'admin', 'admin@x.com');
        const toAdminId = '22222222-0000-4000-8000-000000000002';
        const res = await post(`/conversations/${CHAT}/assign`, token, { toAdminId });

        expect(res.status).toBe(200);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'support_conversation_assigned', targetId: CHAT, newValue: { assignedTo: toAdminId },
        }));
    });

    it('logs returning a chat to the queue', async () => {
        const token = tokenFor('agent-1', 'support_agent', 'agent@x.com');
        const res = await post(`/conversations/${CHAT}/return`, token);

        expect(res.status).toBe(200);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'support_conversation_returned', targetId: CHAT,
        }));
    });

    it('logs resolving a conversation', async () => {
        const token = tokenFor('agent-1', 'support_agent', 'agent@x.com');
        const res = await post(`/conversations/${CHAT}/resolve`, token);

        expect(res.status).toBe(200);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            action: 'support_conversation_resolved', targetId: CHAT,
        }));
    });

    it('does not log a read — only the actions that change a conversation', async () => {
        const token = tokenFor('agent-1', 'support_agent', 'agent@x.com');
        await fetch(`${url}/admin/support/conversations/${CHAT}`, { headers: { Authorization: `Bearer ${token}` } });

        expect(audit).not.toHaveBeenCalled();
    });

    it('does not write the row when the service refuses the action', async () => {
        svc.resolve.mockRejectedValueOnce(Object.assign(new Error('nope'), { statusCode: 409 }));
        const token = tokenFor('agent-1', 'support_agent', 'agent@x.com');
        const res = await post(`/conversations/${CHAT}/resolve`, token);

        expect(res.status).not.toBe(200);
        expect(audit).not.toHaveBeenCalled();
    });
});
