import { AppError } from '@/middleware/error.middleware';
import {
    SupportRepository,
    type SupportConversationRow,
    type SupportMessageRow,
    type InboxFilter,
} from '@/repositories/support.repository';
import { urgencyFromRank } from '@/lib/support/urgency';
import { publish } from '@/lib/support/events';
import { translateInBackground } from '@/lib/support/translateInBackground';
import type { SupportLang } from '@/lib/support/translation';

/** Whoever is acting on the Agent's side: an admin, or a Support Agent. */
export interface SupportActor {
    id:   string;
    role: string;
}

/**
 * Whether this actor may write in this chat — reply, resolve, change its urgency.
 *
 * An admin may write anywhere; a Support Agent only in a chat assigned to them. Reading is
 * deliberately not gated: every Agent may read every chat, which is how one picks up where
 * another left off.
 */
export function canWriteIn(actor: SupportActor, assignedAdminId: string | null): boolean {
    return actor.role === 'admin' || assignedAdminId === actor.id;
}

/** Locales the widget is offered in. Anything else is read as English rather than refused. */
const SUPPORTED_LOCALES = ['en', 'ko', 'ja', 'zh'] as const;

export function normaliseLocale(locale: unknown): string {
    const value = typeof locale === 'string' ? locale.toLowerCase().split('-')[0] : '';
    return (SUPPORTED_LOCALES as readonly string[]).includes(value) ? value : 'en';
}

/** What a conversation looks like to the person in it — never the staff ids attached to it. */
export interface PublicConversation {
    id:        string;
    reference: string;
    status:    string;
    locale:    string;
    createdAt: string;
    updatedAt: string;
}

export interface PublicMessage {
    id:        string;
    sender:    string;
    body:      string;
    notice:    string | null;
    createdAt: string;
}

/**
 * The customer's view of their own conversation.
 *
 * `assigned_admin_id` is deliberately absent. It is in the row and it is useful to the Agent's
 * inbox, but handing it to the widget tells a customer which member of staff is reading, and
 * v1 shipped and then fixed exactly that leak on 2026-09-15.
 */
export function toPublicConversation(row: SupportConversationRow): PublicConversation {
    return {
        id:        row.id,
        reference: row.reference,
        status:    row.status,
        locale:    row.locale,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.last_message_at.toISOString(),
    };
}

export function toPublicMessage(row: SupportMessageRow): PublicMessage {
    return {
        id:        row.id,
        sender:    row.sender_type,
        body:      row.body,
        notice:    row.notice_code,
        createdAt: row.created_at.toISOString(),
    };
}

export class SupportService {
    constructor(private readonly repo = new SupportRepository()) {}

    /**
     * Open the caller's conversation, or resume the one they already have.
     *
     * A resolved conversation is finished and is never reopened. The caller gets a new one
     * with its own Chat Reference, and the resolved one becomes history they can read back.
     * v1 reopened on merely opening the widget, so a single reference accumulated unrelated
     * topics across days and each was credited again to whoever resolved it next — which
     * Assignment by an admin (ADR-0041) makes a reporting problem as well as a confusing one.
     *
     * There is no guest path. ADR-0032: a Support Chat is answered inside the app, so a chat
     * started by someone with no account is one an Agent answers into a void. Reading stays
     * open to guests elsewhere; starting does not.
     */
    async openConversation(userId: string | null, locale: unknown, brand: string | null) {
        if (!userId) {
            throw new AppError(401, 'Sign in to start a Support Chat.', 'SUPPORT_ACCOUNT_REQUIRED');
        }

        const existing = await this.repo.findLatestByUser(userId);
        if (existing && existing.status !== 'resolved') {
            return { conversation: toPublicConversation(existing), created: false };
        }

        const created = await this.repo.createForUser(userId, normaliseLocale(locale), brand);
        return { conversation: toPublicConversation(created), created: true };
    }

    /** The caller's current conversation and its transcript, or null when they have never had one. */
    async getConversation(userId: string) {
        const row = await this.repo.findLatestByUser(userId);
        if (!row) return null;
        const messages = await this.repo.listMessages(row.id);
        return { conversation: toPublicConversation(row), messages: messages.map(toPublicMessage) };
    }

    /**
     * Say something in one's own conversation.
     *
     * Ownership is checked against the row rather than trusted from the request: a conversation
     * id is a plain uuid that appears in the customer's own payloads, so without this check one
     * customer who kept an id could read and write another's chat. That is a different rule from
     * ADR-0027's Capability Link, where possession of the uuid *is* the authorisation — a
     * support transcript is not a resource we hand out links to.
     *
     * A resolved conversation does not accept messages. Reopening by replying would put a
     * message where nobody is looking: resolved chats are out of the Agent's queue.
     */
    async sendMessage(userId: string, conversationId: string, body: string) {
        const text = body.trim();
        if (!text) throw new AppError(400, 'A message cannot be empty.', 'VALIDATION_ERROR');

        const row = await this.repo.findById(conversationId);
        if (!row || row.user_id !== userId) {
            // Not 403: telling a stranger that a conversation exists is itself a disclosure.
            throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
        }
        if (row.status === 'resolved') {
            throw new AppError(409, 'This conversation has been resolved. Start a new one.', 'SUPPORT_RESOLVED');
        }

        const message = await this.repo.appendMessage({
            conversationId: row.id,
            sender:         'guest',
            body:           text,
        });
        // After the write, never inside it: whoever is holding a stream open should not be
        // told about a row that is not there yet.
        await publish({ conversationId: row.id, messageId: message.id });
        // Not awaited: the customer sees their own words immediately, and the English rendering
        // for the Agent catches up when the engine answers, if it does.
        void translateInBackground({
            messageId: message.id, conversationId: row.id, senderType: 'guest',
            body: text, customerLang: row.locale as SupportLang,
        });
        return toPublicMessage(message);
    }

    // ── The Agent's side ──────────────────────────────────────────────────────

    /**
     * One queue of the inbox.
     *
     * Reading is not gated: every Agent may read every chat, which is how one picks up where
     * another left off and how an admin sees what is happening without taking it over. What is
     * gated is writing, below.
     */
    async listInbox(actor: SupportActor, filter: InboxFilter) {
        await this.assertCanAnswer(actor);
        const rows = await this.repo.listInbox(filter, actor.id);
        return rows.map(r => ({
            ...toPublicConversation(r),
            urgency:         urgencyFromRank(r.urgency_rank),
            assignedAdminId: r.assigned_admin_id,
            customerEmail:   r.customer_email,
            messageCount:    Number(r.message_count),
        }));
    }

    /** A chat as an Agent sees it: the transcript, plus who it belongs to. */
    async getForAgent(actor: SupportActor, conversationId: string) {
        await this.assertCanAnswer(actor);
        const row = await this.repo.findById(conversationId);
        if (!row) throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
        const messages = await this.repo.listMessages(row.id);
        return {
            conversation: { ...toPublicConversation(row), assignedAdminId: row.assigned_admin_id },
            messages:     messages.map(toPublicMessage),
            canWrite:     canWriteIn(actor, row.assigned_admin_id),
        };
    }

    /**
     * Answer a customer.
     *
     * Answering does not assign the chat — ADR-0041 gives ownership by an admin, never by
     * taking it — but it does move the chat out of Waiting, because somebody is now in it.
     */
    async agentReply(actor: SupportActor, conversationId: string, body: string) {
        await this.assertCanAnswer(actor);
        const text = body.trim();
        if (!text) throw new AppError(400, 'A reply cannot be empty.', 'VALIDATION_ERROR');

        const row = await this.repo.findById(conversationId);
        if (!row) throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
        if (row.status === 'resolved') {
            throw new AppError(409, 'This chat is resolved.', 'SUPPORT_RESOLVED');
        }
        if (!canWriteIn(actor, row.assigned_admin_id)) {
            // Named, so the Agent knows whether to ask for it or wait for it.
            throw new AppError(403, row.assigned_admin_id
                ? 'This chat is assigned to someone else. You can read it, but only they can reply.'
                : 'This chat is not assigned yet. An admin will give it to someone.', 'SUPPORT_NOT_YOURS');
        }

        const message = await this.repo.appendMessage({
            conversationId: row.id,
            sender:         'agent',
            senderAdminId:  actor.id,
            body:           text,
        });
        if (row.status === 'waiting_human') await this.repo.setStatus(row.id, 'human_active');
        await publish({ conversationId: row.id, messageId: message.id });
        void translateInBackground({
            messageId: message.id, conversationId: row.id, senderType: 'agent',
            body: text, customerLang: row.locale as SupportLang,
        });
        return toPublicMessage(message);
    }

    /** Give a chat to someone. Admins only — ADR-0041. */
    async assign(actor: SupportActor, conversationId: string, toAdminId: string) {
        if (actor.role !== 'admin') {
            throw new AppError(403, 'Only an admin can assign a chat.', 'SUPPORT_ADMIN_ONLY');
        }
        if (!await this.repo.canAnswerSupport(toAdminId)) {
            throw new AppError(400, 'That person cannot answer Support Chats.', 'VALIDATION_ERROR');
        }

        const outcome = await this.repo.assign(conversationId, toAdminId, actor.id);
        if (outcome === 'missing')  throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
        if (outcome === 'resolved') {
            throw new AppError(409,
                'This chat is resolved. It returns to Unassigned if the customer writes again.',
                'SUPPORT_RESOLVED');
        }
        // No message id: the conversation changed rather than gaining a line. The customer's
        // stream ignores that; the inbox refetches, because who holds a chat is what it shows.
        if (outcome === 'moved') await publish({ conversationId, messageId: null });
        return { assigned: outcome === 'moved' };
    }

    /**
     * An Agent hands their own chat back for an admin to give out again.
     *
     * Back to the queue and nowhere else: passing it to a named colleague would be an Agent
     * assigning, which is the thing ADR-0041 reserves for an admin.
     */
    async returnToQueue(actor: SupportActor, conversationId: string) {
        await this.assertCanAnswer(actor);
        const row = await this.repo.findById(conversationId);
        if (!row) throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
        if (actor.role !== 'admin' && row.assigned_admin_id !== actor.id) {
            throw new AppError(403, 'You can only return a chat that is yours.', 'SUPPORT_NOT_YOURS');
        }
        await this.repo.returnToQueue(conversationId, actor.id);
        await publish({ conversationId, messageId: null });
    }

    async resolve(actor: SupportActor, conversationId: string) {
        await this.assertCanAnswer(actor);
        const row = await this.repo.findById(conversationId);
        if (!row) throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
        if (!canWriteIn(actor, row.assigned_admin_id)) {
            throw new AppError(403, 'Only whoever holds this chat can resolve it.', 'SUPPORT_NOT_YOURS');
        }
        await this.repo.setStatus(conversationId, 'resolved');
        await publish({ conversationId, messageId: null });
    }

    private async assertCanAnswer(actor: SupportActor): Promise<void> {
        if (actor.role === 'admin') return;
        if (await this.repo.canAnswerSupport(actor.id)) return;
        throw new AppError(403, 'You cannot answer Support Chats.', 'SUPPORT_ADMIN_ONLY');
    }
}
