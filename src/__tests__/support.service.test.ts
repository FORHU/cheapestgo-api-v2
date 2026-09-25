/**
 * The rules a Support Chat keeps, independent of how it is stored or delivered.
 *
 * Each of these is a decision v1 arrived at the hard way, and the port is where they are
 * easiest to lose: they live in prose in an ADR and in a few lines of a service, and nothing
 * about the schema enforces any of them.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SupportService, normaliseLocale, toPublicConversation, canWriteIn } from '@/services/support.service';
import type { SupportConversationRow, SupportMessageRow, SupportStatus } from '@/repositories/support.repository';

const USER  = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const CONV  = '33333333-3333-3333-3333-333333333333';

function conversation(over: Partial<SupportConversationRow> = {}): SupportConversationRow {
    return {
        id:                CONV,
        user_id:           USER,
        status:            'waiting_human' as SupportStatus,
        locale:            'en',
        source_brand:      'CheapestGo',
        assigned_admin_id: null,
        reference:         'CG-CHAT-0001',
        priority:          null,
        created_at:        new Date('2026-09-21T10:00:00Z'),
        last_message_at:   new Date('2026-09-21T10:00:00Z'),
        ...over,
    };
}

/** A repository that remembers what it was asked, so the service's decisions are visible. */
class FakeRepo {
    latest: SupportConversationRow | null = null;
    byId:   SupportConversationRow | null = null;
    created: { userId: string; locale: string; brand: string | null }[] = [];
    appended: { conversationId: string; sender: string; body: string }[] = [];
    messages: SupportMessageRow[] = [];
    statuses: string[] = [];
    assigned: { to: string; by: string }[] = [];
    canAnswer = true;
    assignOutcome: 'moved' | 'already' | 'resolved' | 'missing' = 'moved';

    async canAnswerSupport() { return this.canAnswer; }
    async setStatus(_id: string, status: string) { this.statuses.push(status); }
    async assign(_id: string, to: string, by: string) {
        if (this.assignOutcome === 'moved') this.assigned.push({ to, by });
        return this.assignOutcome;
    }
    async returnToQueue() { /* recorded by the caller's assertions */ }
    async listInbox() { return []; }

    async findLatestByUser() { return this.latest; }
    async findById() { return this.byId; }
    async createForUser(userId: string, locale: string, brand: string | null) {
        this.created.push({ userId, locale, brand });
        return conversation({ user_id: userId, locale, source_brand: brand, reference: 'CG-CHAT-0002' });
    }
    async listMessages() { return this.messages; }
    async appendMessage(input: any) {
        this.appended.push(input);
        return {
            id: 'm1', conversation_id: input.conversationId, sender_type: input.sender,
            sender_admin_id: null, body: input.body, notice_code: null,
            created_at: new Date('2026-09-21T10:05:00Z'),
        } as SupportMessageRow;
    }
}

let repo: FakeRepo;
let svc: SupportService;
beforeEach(() => { repo = new FakeRepo(); svc = new SupportService(repo as any); });

describe('opening a conversation', () => {
    it('refuses someone with no account (ADR-0032)', async () => {
        // A Support Chat is answered inside the app, so a chat with no account behind it is one
        // an Agent answers into a void. v1 decided this, migrated the data, and left the create
        // path open anyway — a signed-out caller could still mint a token and start typing.
        await expect(svc.openConversation(null, 'en', 'CheapestGo')).rejects.toMatchObject({ statusCode: 401 });
        expect(repo.created).toHaveLength(0);
    });

    it('resumes an open conversation rather than starting a second', async () => {
        repo.latest = conversation({ status: 'waiting_human' });
        const { created, conversation: c } = await svc.openConversation(USER, 'en', 'CheapestGo');
        expect(created).toBe(false);
        expect(c.reference).toBe('CG-CHAT-0001');
        expect(repo.created).toHaveLength(0);
    });

    it('resumes one an Agent is already in', async () => {
        repo.latest = conversation({ status: 'human_active' });
        expect((await svc.openConversation(USER, 'en', 'CheapestGo')).created).toBe(false);
    });

    it('never reopens a resolved conversation', async () => {
        // v1 reopened on merely opening the widget, so one Chat Reference collected unrelated
        // topics across days and each was credited again to whoever resolved it next — which
        // Assignment by an admin (ADR-0041) makes a reporting problem, not just a confusing one.
        repo.latest = conversation({ status: 'resolved' });
        const { created, conversation: c } = await svc.openConversation(USER, 'en', 'CheapestGo');
        expect(created).toBe(true);
        expect(c.reference).toBe('CG-CHAT-0002');
    });

    it('opens waiting for a person, because there is no assistant to wait for (ADR-0031)', async () => {
        const { conversation: c } = await svc.openConversation(USER, 'en', 'CheapestGo');
        expect(c.status).toBe('waiting_human');
    });

    it('records the brand that the conversation was started from', async () => {
        await svc.openConversation(USER, 'ko', 'AirangGo');
        expect(repo.created[0]).toMatchObject({ locale: 'ko', brand: 'AirangGo' });
    });
});

describe('the customer view of a conversation', () => {
    it('does not carry the id of the staff member reading it', () => {
        // Shipped and fixed in v1 on 2026-09-15: the customer payload leaked staff ids.
        const shape = toPublicConversation(conversation({ assigned_admin_id: OTHER }));
        expect(JSON.stringify(shape)).not.toContain(OTHER);
        expect('assignedAdminId' in shape).toBe(false);
    });

    it('carries the Chat Reference, which is what a customer quotes', () => {
        expect(toPublicConversation(conversation()).reference).toBe('CG-CHAT-0001');
    });
});

describe('sending a message', () => {
    it('refuses a conversation belonging to someone else, as if it did not exist', async () => {
        // 404 rather than 403: a conversation id is a plain uuid that appears in a customer's
        // own payloads, and confirming that one exists is itself a disclosure.
        repo.byId = conversation({ user_id: OTHER });
        await expect(svc.sendMessage(USER, CONV, 'hello')).rejects.toMatchObject({ statusCode: 404 });
        expect(repo.appended).toHaveLength(0);
    });

    it('refuses a conversation that does not exist', async () => {
        repo.byId = null;
        await expect(svc.sendMessage(USER, CONV, 'hello')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('refuses a resolved conversation instead of quietly reopening it', async () => {
        // A reply to a resolved chat would land where nobody is looking: resolved conversations
        // are out of the Agent's queue.
        repo.byId = conversation({ status: 'resolved' });
        await expect(svc.sendMessage(USER, CONV, 'hello')).rejects.toMatchObject({ statusCode: 409 });
        expect(repo.appended).toHaveLength(0);
    });

    it('refuses a message that is only whitespace', async () => {
        repo.byId = conversation();
        await expect(svc.sendMessage(USER, CONV, '   ')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('stores the message trimmed, attributed to the guest', async () => {
        repo.byId = conversation();
        const m = await svc.sendMessage(USER, CONV, '  my flight was cancelled  ');
        expect(m.body).toBe('my flight was cancelled');
        expect(m.sender).toBe('guest');
    });
});

describe('who may write in a chat', () => {
    it('lets an admin write anywhere', () => {
        expect(canWriteIn({ id: 'a1', role: 'admin' }, null)).toBe(true);
        expect(canWriteIn({ id: 'a1', role: 'admin' }, OTHER)).toBe(true);
    });

    it('lets an Agent write only in a chat they hold', () => {
        expect(canWriteIn({ id: 'g1', role: 'support_agent' }, 'g1')).toBe(true);
        expect(canWriteIn({ id: 'g1', role: 'support_agent' }, OTHER)).toBe(false);
        // Unassigned is nobody's, not everybody's: answering would be taking it.
        expect(canWriteIn({ id: 'g1', role: 'support_agent' }, null)).toBe(false);
    });
});

describe('answering a customer', () => {
    const admin = { id: 'a1', role: 'admin' };
    const agent = { id: 'g1', role: 'support_agent' };

    it('refuses a chat held by someone else, and says who has it', async () => {
        repo.byId = conversation({ assigned_admin_id: OTHER });
        await expect(svc.agentReply(agent, CONV, 'hello')).rejects.toMatchObject({ statusCode: 403 });
        expect(repo.appended).toHaveLength(0);
    });

    it('refuses an unassigned chat, because answering is not how one is taken', async () => {
        repo.byId = conversation({ assigned_admin_id: null });
        await expect(svc.agentReply(agent, CONV, 'hello')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('lets an admin answer one nobody holds', async () => {
        repo.byId = conversation({ assigned_admin_id: null });
        const m = await svc.agentReply(admin, CONV, 'on it');
        expect(m.sender).toBe('agent');
    });

    it('refuses a resolved chat', async () => {
        repo.byId = conversation({ status: 'resolved', assigned_admin_id: 'g1' });
        await expect(svc.agentReply(agent, CONV, 'hello')).rejects.toMatchObject({ statusCode: 409 });
    });

    it('moves the chat out of Waiting, without assigning it', async () => {
        // ADR-0041: answering is not taking. The status moves because somebody is in it now;
        // ownership still has to be given by an admin.
        repo.byId = conversation({ status: 'waiting_human', assigned_admin_id: null });
        await svc.agentReply(admin, CONV, 'hello');
        expect(repo.statuses).toEqual(['human_active']);
        expect(repo.assigned).toHaveLength(0);
    });
});

describe('assignment (ADR-0041)', () => {
    const admin = { id: 'a1', role: 'admin' };
    const agent = { id: 'g1', role: 'support_agent' };

    it('is an admin action, never an Agent one', async () => {
        await expect(svc.assign(agent, CONV, 'g2')).rejects.toMatchObject({ statusCode: 403 });
        expect(repo.assigned).toHaveLength(0);
    });

    it('refuses to hand a chat to someone who cannot answer', async () => {
        repo.canAnswer = false;
        await expect(svc.assign(admin, CONV, 'someone')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('refuses to hand out a resolved chat', async () => {
        repo.assignOutcome = 'resolved';
        await expect(svc.assign(admin, CONV, 'g1')).rejects.toMatchObject({ statusCode: 409 });
    });

    it('is quiet when the chat is already theirs', async () => {
        repo.assignOutcome = 'already';
        expect(await svc.assign(admin, CONV, 'g1')).toEqual({ assigned: false });
    });

    it('lets an Agent return their own chat, but not another', async () => {
        repo.byId = conversation({ assigned_admin_id: 'g1' });
        await expect(svc.returnToQueue(agent, CONV)).resolves.toBeUndefined();

        repo.byId = conversation({ assigned_admin_id: OTHER });
        await expect(svc.returnToQueue(agent, CONV)).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe('normaliseLocale', () => {
    it('keeps the locales the widget is offered in', () => {
        for (const l of ['en', 'ko', 'ja', 'zh']) expect(normaliseLocale(l)).toBe(l);
    });

    it('reads a regional tag as its language', () => {
        expect(normaliseLocale('ko-KR')).toBe('ko');
        expect(normaliseLocale('zh-Hans')).toBe('zh');
    });

    it('falls back to English rather than refusing an unknown one', () => {
        expect(normaliseLocale('de')).toBe('en');
        expect(normaliseLocale(undefined)).toBe('en');
        expect(normaliseLocale(42)).toBe('en');
    });
});
