import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config', () => ({ config: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn() } }));
vi.mock('@/lib/support/events', () => ({ publish: vi.fn() }));

// The desk's clock is its own concern and has its own tests. What matters here is that
// escalation queues the chat either way, so the hours are pinned rather than consulted.
vi.mock('@/lib/support/availability', () => ({
    getSupportAvailability: vi.fn(async () => ({ humanAvailable: false, hours: [] })),
}));
vi.mock('@/lib/support/hours', () => ({
    nextOpening: vi.fn(() => '2026-10-10T09:00:00.000Z'),
}));

import { SupportService, type SupportActor } from '@/services/support.service';
import { SupportRepository } from '@/repositories/support.repository';

/**
 * The rules around giving a chat out, and the notes Agents keep about one.
 *
 * ADR-0041: a Support Chat is **given** by an admin and never taken. Everything here is a
 * consequence of that — who may see the list of people a chat could go to, who may re-rank
 * one, and whose notes an Agent may remove.
 */

const admin: SupportActor = { id: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'admin' };
const agent: SupportActor = { id: 'bbbbbbbb-0000-4000-8000-000000000002', role: 'support_agent' };
const CHAT = 'cccccccc-0000-4000-8000-000000000003';

let svc: SupportService;
let repo: SupportRepository;

beforeEach(() => {
    svc = new SupportService();
    repo = (svc as unknown as { repo: SupportRepository }).repo;
    vi.spyOn(repo, 'canAnswerSupport').mockResolvedValue(true);
});

describe('who a chat can be given to', () => {
    it('is an admin-only view', async () => {
        // An Agent offered this list is looking at a control they may not use.
        await expect(svc.assignableAgents(agent)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('counts a month from the first of the month, in UTC', async () => {
        // `handled` is the figure pay is worked out from, and the resolutions it reads are
        // recorded on the UTC clock — a local month boundary would move the total.
        vi.spyOn(repo, 'listAssignableAgents').mockResolvedValue([]);
        const tally = vi.spyOn(repo, 'handledTally').mockResolvedValue([]);

        const out = await svc.assignableAgents(admin);

        const since = tally.mock.calls[0][0];
        expect(since.getUTCDate()).toBe(1);
        expect(since.getUTCHours()).toBe(0);
        expect(since.getUTCMinutes()).toBe(0);
        expect(out.since).toBe(since.toISOString());
    });
});

describe('the badge counts', () => {
    it('shows an admin what nobody is holding', async () => {
        // Handing chats out is the admin's job, so the unassigned queue is what they wait on.
        vi.spyOn(repo, 'inboxCounts').mockResolvedValue({ unassigned: 7, mine: 2, mineWaiting: 1 });
        await expect(svc.counts(admin)).resolves.toEqual({ unassigned: 7, mine: 2, waiting: 7 });
    });

    it('shows an Agent what is waiting on them', async () => {
        // Nobody else will answer an Agent's own chats, so that is their waiting number.
        vi.spyOn(repo, 'inboxCounts').mockResolvedValue({ unassigned: 7, mine: 2, mineWaiting: 1 });
        await expect(svc.counts(agent)).resolves.toEqual({ unassigned: 7, mine: 2, waiting: 1 });
    });
});

describe('re-ranking a chat', () => {
    const held = (by: string | null) => vi.spyOn(repo, 'findById')
        .mockResolvedValue({ id: CHAT, assigned_admin_id: by } as never);

    it('lets an admin re-rank a chat held by someone else', async () => {
        held(agent.id);
        const set = vi.spyOn(repo, 'setPriority').mockResolvedValue(true);
        await svc.setPriority(admin, CHAT, 'high');
        expect(set).toHaveBeenCalledWith(CHAT, 'high');
    });

    it('refuses an Agent re-ranking a chat that is not theirs', async () => {
        held('someone-else');
        await expect(svc.setPriority(agent, CHAT, 'high')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('accepts null, which restores the computed value', async () => {
        // Not the same as `normal`: null hands the chat back to a rule that keeps climbing
        // as a departure nears, where `normal` freezes it however close the flight gets.
        held(admin.id);
        const set = vi.spyOn(repo, 'setPriority').mockResolvedValue(true);
        await svc.setPriority(admin, CHAT, null);
        expect(set).toHaveBeenCalledWith(CHAT, null);
    });

    it('refuses a rank that is not one of the five', async () => {
        held(admin.id);
        await expect(svc.setPriority(admin, CHAT, 'urgent')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('is a 404 for a chat that does not exist', async () => {
        vi.spyOn(repo, 'findById').mockResolvedValue(null as never);
        await expect(svc.setPriority(admin, CHAT, 'high')).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('internal notes', () => {
    it('attributes a note to the signed-in Agent, never to the request', async () => {
        // A note nobody can be asked about is worse than no note.
        const add = vi.spyOn(repo, 'addNote').mockResolvedValue({
            id: 'n1', conversationId: CHAT, authorAdminId: agent.id, body: 'called the hotel', createdAt: new Date(),
        });
        await svc.addNote(agent, CHAT, '  called the hotel  ');
        expect(add).toHaveBeenCalledWith(CHAT, agent.id, 'called the hotel');
    });

    it('refuses an empty note, including one that is only spaces', async () => {
        await expect(svc.addNote(agent, CHAT, '   ')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('refuses a note longer than a message may be', async () => {
        await expect(svc.addNote(agent, CHAT, 'x'.repeat(4001))).rejects.toMatchObject({ statusCode: 400 });
    });

    it('is a 404 when the chat does not exist, rather than an orphan note', async () => {
        vi.spyOn(repo, 'addNote').mockResolvedValue(null);
        await expect(svc.addNote(agent, CHAT, 'hello')).rejects.toMatchObject({ statusCode: 404 });
    });

    it("reads a stranger's note as 404, not 403", async () => {
        // A 403 would confirm the note exists, which is the thing you may not act on.
        vi.spyOn(repo, 'deleteNote').mockResolvedValue(false);
        await expect(svc.deleteNote(agent, 'n1')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('refuses anyone who cannot answer chats at all', async () => {
        vi.spyOn(repo, 'canAnswerSupport').mockResolvedValue(false);
        const customer: SupportActor = { id: 'dddddddd-0000-4000-8000-000000000004', role: 'user' };
        await expect(svc.listNotes(customer, CHAT)).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe('asking for a person', () => {
    // A whole row: `toPublicConversation` reads the dates, so a partial stub fails on
    // shape rather than on the rule under test.
    const CONV = {
        id: CHAT, reference: 'CG-ABC123', status: 'ai_active', locale: 'en',
        assigned_admin_id: null, created_at: new Date(), last_message_at: new Date(),
    } as never;

    it('queues the chat even when the desk is shut', async () => {
        // Support Hours decide what the customer is promised, not whether the queue takes
        // them. A question asked at 3am waits for the morning; refusing it loses it.
        vi.spyOn(repo, 'findLatestByUser').mockResolvedValue(CONV);
        const moved = vi.spyOn(repo, 'requestHuman').mockResolvedValue({ ...(CONV as object), status: 'waiting_human' } as never);
        const append = vi.spyOn(repo, 'appendMessage').mockResolvedValue({} as never);

        const out = await svc.escalate('user-1');

        expect(moved).toHaveBeenCalledWith(CHAT);
        expect(out.alreadyQueued).toBe(false);
        // And the transcript says which of the two it was, so the customer is not promised
        // a reply that is not coming for nine hours.
        const code = append.mock.calls[0][0].noticeCode;
        expect(['asked_for_person', 'asked_for_person_out_of_hours']).toContain(code);
    });

    it('is not an error when the chat is already queued', async () => {
        // Two taps arrive together often enough, and the second must not read as a failure
        // — nor reset a chat an Agent has since picked up.
        vi.spyOn(repo, 'findLatestByUser').mockResolvedValue(CONV);
        vi.spyOn(repo, 'requestHuman').mockResolvedValue(null);
        vi.spyOn(repo, 'findById').mockResolvedValue({ ...(CONV as object), status: 'human_active' } as never);
        const append = vi.spyOn(repo, 'appendMessage').mockResolvedValue({} as never);

        const out = await svc.escalate('user-1');

        expect(out.alreadyQueued).toBe(true);
        // No second handover line in the transcript.
        expect(append).not.toHaveBeenCalled();
    });

    it('is a 404 for someone with no conversation', async () => {
        vi.spyOn(repo, 'findLatestByUser').mockResolvedValue(null);
        await expect(svc.escalate('user-1')).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('reading back a finished chat by its Chat Reference', () => {
    it("is a 404 for a reference that is not the caller's", async () => {
        // ADR-0038: the reference names a conversation and grants nothing. The read is
        // allowed because the chat is yours — and a 403 here would confirm the reference
        // is real, which is exactly what must not leak.
        vi.spyOn(repo, 'findPastByReference').mockResolvedValue(null);
        await expect(svc.pastConversation('user-1', 'CG-ABC123')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('looks the reference up case-insensitively, as it is read off a screen', async () => {
        const find = vi.spyOn(repo, 'findPastByReference').mockResolvedValue(null);
        await expect(svc.pastConversation('user-1', ' cg-abc123 ')).rejects.toMatchObject({ statusCode: 404 });
        expect(find).toHaveBeenCalledWith('user-1', 'CG-ABC123');
    });
});
