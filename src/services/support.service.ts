import { AppError } from '@/middleware/error.middleware';
import { randomUUID } from 'node:crypto';
import {
    ATTACHMENT_RETENTION_DAYS, MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_BYTES,
    attachmentStorageKey, sanitiseFileName, sniffContentType,
} from '@/lib/support/attachments';
import { deleteObject, putObject, signedUrlFor } from '@/lib/support/attachmentStorage';
import type { SupportAttachmentView } from '@/lib/support/attachments';
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
    /**
     * The stored rendering beside the author's words, which are never replaced (ADR-0033).
     *
     * Both are sent because who the rendering is *for* is decided by the language it is in,
     * not by who sent the message: a translation into English is for the inbox, one into
     * anything else is for the customer. A Korean-speaking Agent answering in Korean has
     * their reply rendered into English for colleagues, and the customer must still read the
     * Korean as typed. The reader decides; the payload only has to carry enough to decide on.
     *
     * `translationStatus` is carried for the same reason: "not translated yet" and "could not
     * be translated" look identical in the body and mean different things to the reader.
     */
    translatedBody:     string | null;
    translatedLang:     string | null;
    translationStatus:  string | null;
    /** Named by id only: the storage key never leaves the server (ADR-0040). */
    attachments:        SupportAttachmentView[];
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
        translatedBody:    row.translated_body ?? null,
        translatedLang:    row.translated_lang ?? null,
        translationStatus: row.translation_status ?? null,
        // Filled by whoever read the transcript; a message read on its own has none to show.
        attachments:       [],
    };
}

/**
 * Longer than any translation takes. The worst honest case — a long message whose pieces each
 * exhaust their attempts and are then halved — is a little over two minutes, so a row still
 * pending past this was abandoned by a process that stopped, not one still working.
 */
export const STALLED_TRANSLATION_MS = 3 * 60 * 1000;

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
        return { conversation: toPublicConversation(row), messages: await this.withAttachments(messages) };
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
    async sendMessage(userId: string, conversationId: string, body: string, attachmentIds: string[] = []) {
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
        // Bound before anyone is told, so a reader never sees the message without its files.
        // Capped here as well as in the widget: five is a rule, not a nicety of the form.
        if (attachmentIds.length > 0) {
            await this.repo.attachToMessage(attachmentIds.slice(0, MAX_ATTACHMENTS_PER_MESSAGE), message.id, row.id);
        }

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
            messages:     await this.withAttachments(messages),
            canWrite:     canWriteIn(actor, row.assigned_admin_id),
        };
    }

    /**
     * Answer a customer.
     *
     * Answering does not assign the chat — ADR-0041 gives ownership by an admin, never by
     * taking it — but it does move the chat out of Waiting, because somebody is now in it.
     */
    async agentReply(actor: SupportActor, conversationId: string, body: string, attachmentIds: string[] = []) {
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
        if (attachmentIds.length > 0) {
            await this.repo.attachToMessage(attachmentIds.slice(0, MAX_ATTACHMENTS_PER_MESSAGE), message.id, row.id);
        }
        if (row.status === 'waiting_human') await this.repo.setStatus(row.id, 'human_active');
        await publish({ conversationId: row.id, messageId: message.id });
        void translateInBackground({
            messageId: message.id, conversationId: row.id, senderType: 'agent',
            body: text, customerLang: row.locale as SupportLang,
        });
        return toPublicMessage(message);
    }

    /**
     * Finish translations a stopped process left pending.
     *
     * A restart during a call leaves the row `pending` with nothing coming to settle it, and a
     * reply in that state is held back from the customer indefinitely — see
     * `isHeldForTranslation` in the widget. This is the thing that unsticks them, and it is why
     * `pending` is safe to write before the engine is called at all.
     *
     * Re-run rather than merely settled: asking again usually works, and a translation that
     * arrives late is still worth more than one marked failed for a reason that was not the
     * engine's fault. Each settles itself either way.
     *
     * @returns how many were picked up.
     */
    async resumeStalledTranslations(limit = 50): Promise<number> {
        const rows = await this.repo.findStalledTranslations(STALLED_TRANSLATION_MS, limit);
        await Promise.all(rows.map(row => translateInBackground({
            messageId:      row.id,
            conversationId: row.conversation_id,
            senderType:     row.sender_type,
            body:           row.body,
            customerLang:   row.locale as SupportLang,
            repo:           this.repo,
        })));
        return rows.length;
    }

    // ── Attachments (ADR-0040) ────────────────────────────────────────────────

    /**
     * Accept one file for a conversation the caller is part of.
     *
     * Uploaded before the message that carries it, because the bytes are the slow part and a
     * customer should be able to attach while still typing. The row is written after the object
     * exists, so a row never points at a missing file; the reverse — an object with no row — is
     * cleaned up here rather than left for a lifecycle rule, because an unreferenced copy of
     * somebody's passport page should not wait thirty days to go away.
     */
    async uploadAttachment(input: {
        actor: { id: string; role?: string };
        conversationId: string;
        fileName: string;
        bytes: Buffer;
        as: 'guest' | 'agent';
    }) {
        const row = await this.repo.findById(input.conversationId);
        if (!row) throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');

        if (input.as === 'guest') {
            if (row.user_id !== input.actor.id) throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
            if (row.status === 'resolved') {
                throw new AppError(409, 'This conversation has been resolved. Start a new one.', 'SUPPORT_RESOLVED');
            }
        } else {
            await this.assertCanAnswer(input.actor as SupportActor);
        }

        if (input.bytes.length === 0) throw new AppError(400, 'That file is empty.', 'VALIDATION_ERROR');
        if (input.bytes.length > MAX_ATTACHMENT_BYTES) {
            throw new AppError(400,
                `Files must be ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB or smaller.`,
                'VALIDATION_ERROR');
        }

        // The declared type is discarded: it is settable by anything that is not a browser.
        const contentType = sniffContentType(input.bytes);
        if (!contentType) {
            throw new AppError(400, 'That file type is not supported. Send an image or a PDF.', 'VALIDATION_ERROR');
        }

        const id         = randomUUID();
        const fileName   = sanitiseFileName(input.fileName);
        const storageKey = attachmentStorageKey(input.conversationId, id);

        await putObject({ key: storageKey, body: input.bytes, contentType });

        try {
            await this.repo.insertAttachment({
                id, conversationId: input.conversationId, storageKey, fileName, contentType,
                sizeBytes: input.bytes.length,
                uploadedByType: input.as,
                uploadedByAdminId: input.as === 'agent' ? input.actor.id : null,
            });
        } catch (err) {
            // Nothing references this object; leaving it would be an unreachable copy of a
            // customer's document. A failure to clean up must not mask the original error.
            await deleteObject(storageKey).catch(() => {});
            throw err;
        }

        // The storage key is deliberately absent from what the caller is handed back.
        return { id, fileName, contentType, sizeBytes: input.bytes.length, uploadedByType: input.as, bytesDeleted: false };
    }

    /**
     * A short-lived URL for one attachment, if this caller may read it.
     *
     * Authorisation is re-evaluated here on every fetch rather than baked into a link at send
     * time (ADR-0040): a conversation reassigned later, or an account that loses its staff role,
     * changes what can be fetched immediately rather than whenever an old link expires.
     */
    async attachmentUrl(actor: { id: string; role?: string }, attachmentId: string): Promise<string> {
        const attachment = await this.repo.findAttachment(attachmentId);
        if (!attachment) throw new AppError(404, 'Attachment not found.', 'NOT_FOUND');

        if (attachment.bytesDeleted) {
            throw new AppError(410, 'That file has passed its retention window and is no longer stored.', 'GONE');
        }

        const conversation = await this.repo.findById(attachment.conversationId);
        if (!conversation) throw new AppError(404, 'Attachment not found.', 'NOT_FOUND');

        const isOwner = conversation.user_id === actor.id;
        const isStaff = await this.repo.canAnswerSupport(actor.id);
        // Not 403: telling a stranger that an attachment exists is itself a disclosure.
        if (!isOwner && !isStaff) throw new AppError(404, 'Attachment not found.', 'NOT_FOUND');

        return signedUrlFor(attachment.storageKey, attachment.fileName);
    }

    /**
     * Remove the bytes of anything past its retention window.
     *
     * The row stays: a transcript still has to show that a file was sent, and say that it has
     * expired. Deleting the row would make the conversation read as though nothing was ever
     * attached — which is a different and untrue story.
     *
     * @returns how many had their bytes removed.
     */
    async purgeExpiredAttachments(limit = 200): Promise<number> {
        const expired = await this.repo.findExpiredAttachments(ATTACHMENT_RETENTION_DAYS, limit);
        let removed = 0;
        for (const row of expired) {
            try {
                await deleteObject(row.storageKey);
                await this.repo.markBytesDeleted(row.id);
                removed++;
            } catch {
                // Left for the next run rather than marked gone: a row saying the bytes are
                // deleted while the object is still in the bucket is the one state that cannot
                // be recovered from, because nothing would ever look at that key again.
            }
        }
        return removed;
    }

    /**
     * A transcript with each message's files on it.
     *
     * One query for the whole transcript: a conversation is read on every widget open and every
     * stream backfill, and asking per message would make that cost grow with its length.
     */
    private async withAttachments(rows: SupportMessageRow[]): Promise<PublicMessage[]> {
        const messages = rows.map(toPublicMessage);
        const grouped  = await this.repo.attachmentsByMessage(messages.map(m => m.id));
        if (grouped.size === 0) return messages;
        return messages.map(m => ({ ...m, attachments: grouped.get(m.id) ?? [] }));
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
