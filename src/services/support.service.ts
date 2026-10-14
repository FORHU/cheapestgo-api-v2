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
import { urgencyFromRank, isUrgency } from '@/lib/support/urgency';

/**
 * A Note is written in the same box an Agent answers in, so it gets the same room — the
 * 4,000 the message routes cap at.
 */
const MAX_NOTE_LENGTH = 4000;
import { publish } from '@/lib/support/events';
import { getSupportAvailability } from '@/lib/support/availability';
import { nextOpening } from '@/lib/support/hours';
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

    // ── Assignment support: who, how many, how urgent (ADR-0041) ────────────────

    /**
     * Who a chat can be given to, and what each of them is carrying.
     *
     * Admins only. ADR-0041 has a chat *given* by an admin and never taken, so the list of
     * people it could be given to is an admin's view — an Agent offered it would be looking
     * at a control they are not allowed to use.
     *
     * The month is the calendar month in UTC, the same clock the resolutions are recorded
     * on, because `handled` is the figure pay is worked out from.
     */
    async assignableAgents(actor: SupportActor) {
        if (actor.role !== 'admin') {
            throw new AppError(403, 'Only an admin can see who a chat can be given to.', 'SUPPORT_ADMIN_ONLY');
        }
        const now = new Date();
        const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const [agents, tally] = await Promise.all([
            this.repo.listAssignableAgents(),
            this.repo.handledTally(since),
        ]);
        return { agents, tally, since: since.toISOString() };
    }

    /**
     * The sidebar badge's two numbers.
     *
     * `waiting` is what the badge shows, and it means a different thing per role on
     * purpose: an admin is waiting on the unassigned queue, because handing chats out is
     * their job, while an Agent is waiting on their own chats, because nobody else will
     * answer them.
     */
    async counts(actor: SupportActor) {
        await this.assertCanAnswer(actor);
        const { unassigned, mine, mineWaiting } = await this.repo.inboxCounts(actor.id);
        return { unassigned, mine, waiting: actor.role === 'admin' ? unassigned : mineWaiting };
    }

    /**
     * Overrule computed **Urgency**, or hand it back to the rule.
     *
     * A Support Agent re-ranks only their own chats; an admin, any (ADR-0041).
     *
     * `null` restores the computed value and is a real argument, not a missing one:
     * clearing an override hands the chat back to a rule that keeps climbing as a
     * departure nears, whereas setting `normal` freezes it at ordinary however close the
     * flight gets. The caller has to be able to say which it meant.
     */
    async setPriority(actor: SupportActor, conversationId: string, priority: string | null) {
        await this.assertCanAnswer(actor);
        const row = await this.repo.findById(conversationId);
        if (!row) throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
        if (!canWriteIn(actor, row.assigned_admin_id)) {
            throw new AppError(403, 'Only whoever holds this chat can re-rank it.', 'SUPPORT_NOT_YOURS');
        }
        if (priority !== null && !isUrgency(priority)) {
            throw new AppError(400, 'priority must be low, normal, high, critical, or null.', 'VALIDATION_ERROR');
        }
        await this.repo.setPriority(conversationId, priority);
        // The queue's order changed, not its content — the inbox refetches on this.
        await publish({ conversationId, messageId: null });
        return { priority };
    }

    // ── Internal Notes ───────────────────────────────────────────────────────────

    /** Staff only, and never part of the transcript — see the repository's note. */
    async listNotes(actor: SupportActor, conversationId: string) {
        await this.assertCanAnswer(actor);
        return { notes: await this.repo.listNotes(conversationId) };
    }

    /**
     * Write a Note.
     *
     * The author is the signed-in Agent and never anything the client sent: a note nobody
     * can be asked about is worse than no note. Nothing is published — a Note is not a
     * message, and waking the customer's stream for one would be the bug this table exists
     * to prevent.
     */
    async addNote(actor: SupportActor, conversationId: string, body: string) {
        await this.assertCanAnswer(actor);
        const text = body.trim();
        if (!text) throw new AppError(400, 'A note cannot be empty.', 'VALIDATION_ERROR');
        if (text.length > MAX_NOTE_LENGTH) {
            throw new AppError(400, `A note cannot exceed ${MAX_NOTE_LENGTH} characters.`, 'VALIDATION_ERROR');
        }
        const note = await this.repo.addNote(conversationId, actor.id, text);
        if (!note) throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
        return { note };
    }

    /**
     * Remove one of your own.
     *
     * A note that was never yours reads as 404 rather than 403: the distinction would
     * confirm that a note exists, which is the thing you are not entitled to act on.
     */
    async deleteNote(actor: SupportActor, noteId: string) {
        await this.assertCanAnswer(actor);
        if (!await this.repo.deleteNote(noteId, actor.id)) {
            throw new AppError(404, 'Note not found.', 'NOT_FOUND');
        }
        return { deleted: true };
    }

    // ── Asking for a person ──────────────────────────────────────────────────────

    /**
     * Ask for a person.
     *
     * Support Hours do not gate this. They decide what the customer is *promised*, not
     * whether the queue accepts the conversation — a question asked at 3am is queued at
     * 3am and waits for the morning, rather than being refused and lost. The reply carries
     * the availability and the next opening so the widget can say which of the two it is.
     *
     * v1's branch for collecting a guest's name and email is deliberately not ported:
     * ADR-0032 requires an account from the first message, so there is no caller here
     * without one and that branch was already unreachable.
     *
     * Pressing twice is not an error. An already-queued chat returns its current state,
     * because the second tap should show the same thing as the first rather than a
     * failure — and must not reset a chat an Agent has since picked up.
     */
    async escalate(userId: string) {
        const row = await this.repo.findLatestByUser(userId);
        if (!row) throw new AppError(404, 'No conversation.', 'NOT_FOUND');

        const { humanAvailable, hours } = await getSupportAvailability();
        const opening = nextOpening(hours, new Date());

        const moved = await this.repo.requestHuman(row.id);
        if (!moved) {
            // Already queued, already being answered, or something else moved it between
            // the read and the write. Report where it actually is.
            const current = await this.repo.findById(row.id);
            return {
                conversation: current ? toPublicConversation(current) : null,
                humanAvailable,
                nextOpening: opening,
                alreadyQueued: true,
            };
        }

        // A row in the transcript, so the Agent who picks this up sees where the handover
        // happened rather than guessing which half the model wrote — and so the customer
        // sees an acknowledgement rather than the panel going quiet.
        await this.repo.appendMessage({
            conversationId: moved.id,
            sender:         'system',
            body:           humanAvailable
                ? 'You asked for a person. Someone will be with you shortly.'
                : 'You asked for a person. The desk is closed, so someone will reply when it opens.',
            noticeCode:     humanAvailable ? 'asked_for_person' : 'asked_for_person_out_of_hours',
        });
        await publish({ conversationId: moved.id, messageId: null });

        return {
            conversation: toPublicConversation(moved),
            humanAvailable,
            nextOpening: opening,
            alreadyQueued: false,
        };
    }

    // ── Chat Reference: reading back a finished chat ────────────────────────────

    /** The caller's resolved chats, newest first — the widget's "Previous conversation". */
    async pastConversations(userId: string) {
        return { conversations: await this.repo.listPastConversations(userId) };
    }

    /**
     * One finished chat, read-only, named by its **Chat Reference**.
     *
     * The reference grants nothing (ADR-0038). What allows the read is that the chat
     * belongs to the signed-in caller; anything else is a 404 indistinguishable from a
     * reference that never existed, so the endpoint cannot be used to discover whether
     * someone else's reference is real.
     */
    async pastConversation(userId: string, reference: string) {
        const row = await this.repo.findPastByReference(userId, reference.trim().toUpperCase());
        if (!row) throw new AppError(404, 'Not found.', 'NOT_FOUND');
        const messages = await this.repo.listMessages(row.id);
        return { conversation: toPublicConversation(row), messages: await this.withAttachments(messages) };
    }

    // ── Linked Bookings ──────────────────────────────────────────────────────────

    /** The customer's own trips, and whatever is already attached to their chat. */
    async customerTrips(userId: string) {
        const conversation = await this.repo.findLatestByUser(userId);
        const [trips, linked] = await Promise.all([
            this.repo.listCustomerTrips(userId),
            conversation ? this.repo.listLinkedBookings(conversation.id) : Promise.resolve([]),
        ]);
        return { trips, linked };
    }

    /**
     * The customer saying which of their trips the chat is about.
     *
     * Ownership is enforced here and deliberately *not* on the Agent's path below. A
     * customer may attach only their own booking, because the point of attaching one is
     * that an Agent can then trust it without asking. An Agent may attach any reference,
     * because investigating a travelling companion's flight is their job.
     */
    async linkOwnBooking(userId: string, bookingReference: string) {
        const conversation = await this.repo.findLatestByUser(userId);
        if (!conversation) throw new AppError(404, 'No conversation.', 'NOT_FOUND');

        const reference = bookingReference.trim().toUpperCase();
        if (!reference) throw new AppError(400, 'A booking reference is required.', 'VALIDATION_ERROR');
        if (!await this.repo.bookingBelongsTo(reference, userId)) {
            throw new AppError(400, 'That booking does not belong to this customer.', 'VALIDATION_ERROR');
        }

        await this.repo.linkBooking(conversation.id, reference, null);
        return { linked: await this.repo.listLinkedBookings(conversation.id) };
    }

    /** Undo a choice, on one's own conversation only. */
    async unlinkOwnBooking(userId: string, bookingReference: string) {
        const conversation = await this.repo.findLatestByUser(userId);
        if (!conversation) throw new AppError(404, 'No conversation.', 'NOT_FOUND');
        await this.repo.unlinkBooking(conversation.id, bookingReference.trim().toUpperCase());
        return { linked: await this.repo.listLinkedBookings(conversation.id) };
    }

    /** What an Agent sees attached to a chat they are reading. */
    async linkedBookings(actor: SupportActor, conversationId: string) {
        await this.assertCanAnswer(actor);
        return { linked: await this.repo.listLinkedBookings(conversationId) };
    }

    /**
     * An Agent attaching a trip.
     *
     * No ownership check, by design — see `linkOwnBooking`. The attachment records who
     * made it, which is what lets the screen show an Agent's guess differently from a
     * customer's own choice.
     */
    async linkBookingAsAgent(actor: SupportActor, conversationId: string, bookingReference: string) {
        await this.assertCanAnswer(actor);
        const row = await this.repo.findById(conversationId);
        if (!row) throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
        if (!canWriteIn(actor, row.assigned_admin_id)) {
            throw new AppError(403, 'Only whoever holds this chat can attach a trip.', 'SUPPORT_NOT_YOURS');
        }
        const reference = bookingReference.trim().toUpperCase();
        if (!reference) throw new AppError(400, 'A booking reference is required.', 'VALIDATION_ERROR');

        await this.repo.linkBooking(conversationId, reference, actor.id);
        return { linked: await this.repo.listLinkedBookings(conversationId) };
    }

    async unlinkBookingAsAgent(actor: SupportActor, conversationId: string, bookingReference: string) {
        await this.assertCanAnswer(actor);
        const row = await this.repo.findById(conversationId);
        if (!row) throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
        if (!canWriteIn(actor, row.assigned_admin_id)) {
            throw new AppError(403, 'Only whoever holds this chat can detach a trip.', 'SUPPORT_NOT_YOURS');
        }
        await this.repo.unlinkBooking(conversationId, bookingReference.trim().toUpperCase());
        return { linked: await this.repo.listLinkedBookings(conversationId) };
    }

    private async assertCanAnswer(actor: SupportActor): Promise<void> {
        if (actor.role === 'admin') return;
        if (await this.repo.canAnswerSupport(actor.id)) return;
        throw new AppError(403, 'You cannot answer Support Chats.', 'SUPPORT_ADMIN_ONLY');
    }
}
