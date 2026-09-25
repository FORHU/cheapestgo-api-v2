import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { URGENCY_SQL } from '@/lib/support/urgency';
import type { SupportAttachmentView } from '@/lib/support/attachments';

/**
 * Where a Support Chat has got to.
 *
 * `ai_active` is in the column's history and nothing writes it any more: ADR-0031 settled that
 * support is answered only by people, so a new conversation opens already waiting for one. It
 * stays in the union because rows written before that decision still carry it and a reader
 * must not choke on them.
 */
export type SupportStatus = 'ai_active' | 'waiting_human' | 'human_active' | 'resolved';

export type SupportSender = 'guest' | 'ai' | 'agent' | 'system';

export interface SupportConversationRow {
    id:                 string;
    user_id:            string | null;
    status:             SupportStatus;
    locale:             string;
    source_brand:       string | null;
    assigned_admin_id:  string | null;
    reference:          string;
    priority:           string | null;
    created_at:         Date;
    last_message_at:    Date;
}

export interface SupportMessageRow {
    id:              string;
    conversation_id: string;
    sender_type:     SupportSender;
    sender_admin_id: string | null;
    body:            string;
    notice_code:     string | null;
    created_at:      Date;
    /** The stored rendering, never recomputed on read — ADR-0033. */
    translated_body:    string | null;
    translated_lang:    string | null;
    translation_status: string | null;
}

/** Every column a conversation is read through, so the shape cannot drift between queries. */
const CONVERSATION_COLUMNS = Prisma.sql`
    id, user_id, status, locale, source_brand, assigned_admin_id,
    reference, priority, created_at, last_message_at
`;

/** The queues an Agent works from. */
export type InboxFilter = 'unassigned' | 'mine' | 'assigned' | 'resolved';

export interface InboxRow extends SupportConversationRow {
    urgency_rank:   number;
    customer_email: string | null;
    message_count:  number;
}

export class SupportRepository {
    /**
     * The caller's most recent conversation, resolved or not.
     *
     * A resolved one is still returned, because someone whose chat was just closed should be
     * able to read the end of it. Deciding that a resolved conversation is finished, and that
     * the next message starts a new one, belongs to the service above.
     */
    async findLatestByUser(userId: string): Promise<SupportConversationRow | null> {
        const rows = await prisma.$queryRaw<SupportConversationRow[]>(Prisma.sql`
            SELECT ${CONVERSATION_COLUMNS}
              FROM support_conversations
             WHERE user_id = ${userId}::uuid
             ORDER BY last_message_at DESC
             LIMIT 1
        `);
        return rows[0] ?? null;
    }

    async findById(conversationId: string): Promise<SupportConversationRow | null> {
        const rows = await prisma.$queryRaw<SupportConversationRow[]>(Prisma.sql`
            SELECT ${CONVERSATION_COLUMNS}
              FROM support_conversations
             WHERE id = ${conversationId}::uuid
             LIMIT 1
        `);
        return rows[0] ?? null;
    }

    /**
     * Start a conversation for an account holder.
     *
     * `status` and `reference` are left to their column defaults on purpose: the status
     * default is what ADR-0031 changed, and the reference is minted by `mint_chat_reference()`
     * in the database, so every Chat Reference in the system comes from one place whichever
     * application inserted the row.
     */
    async createForUser(userId: string, locale: string, brand: string | null): Promise<SupportConversationRow> {
        const rows = await prisma.$queryRaw<SupportConversationRow[]>(Prisma.sql`
            INSERT INTO support_conversations (user_id, source_brand, locale)
            VALUES (${userId}::uuid, ${brand}, ${locale})
            RETURNING ${CONVERSATION_COLUMNS}
        `);
        return rows[0];
    }

    /** Oldest first: a transcript is read in the order it was said. */
    async listMessages(conversationId: string, limit = 200): Promise<SupportMessageRow[]> {
        return prisma.$queryRaw<SupportMessageRow[]>(Prisma.sql`
            SELECT id, conversation_id, sender_type, sender_admin_id, body, notice_code, created_at,
                   translated_body, translated_lang, translation_status
              FROM support_messages
             WHERE conversation_id = ${conversationId}::uuid
             ORDER BY created_at ASC, id ASC
             LIMIT ${limit}
        `);
    }

    /**
     * Append a message and move the conversation's clock in the same breath.
     *
     * `last_message_at` orders the Agent's inbox and decides which conversation
     * `findLatestByUser` returns, so a message written without it is a message that did not
     * happen as far as either is concerned. One transaction, so they cannot disagree.
     */
    async appendMessage(input: {
        conversationId: string;
        sender:         SupportSender;
        body:           string;
        senderAdminId?: string | null;
        noticeCode?:    string | null;
    }): Promise<SupportMessageRow> {
        const [message] = await prisma.$transaction([
            prisma.$queryRaw<SupportMessageRow[]>(Prisma.sql`
                INSERT INTO support_messages (conversation_id, sender_type, sender_admin_id, body, notice_code)
                VALUES (
                    ${input.conversationId}::uuid,
                    ${input.sender},
                    ${input.senderAdminId ?? null}::uuid,
                    ${input.body},
                    ${input.noticeCode ?? null}
                )
                RETURNING id, conversation_id, sender_type, sender_admin_id, body, notice_code, created_at,
                          translated_body, translated_lang, translation_status
            `),
            prisma.$executeRaw(Prisma.sql`
                UPDATE support_conversations
                   SET last_message_at = now(), updated_at = now()
                 WHERE id = ${input.conversationId}::uuid
            `),
        ]);
        return (message as SupportMessageRow[])[0];
    }

    /**
     * One queue of the Agent inbox.
     *
     * Waiting is ordered by urgency and then by how long they have waited; every other view is
     * ordered by what happened last, because those are being followed rather than triaged.
     *
     * Waiting also requires the customer to have actually said something. The widget creates a
     * conversation the moment the panel opens, so without this the queue fills with chats
     * nobody ever wrote in.
     */
    async listInbox(filter: InboxFilter, adminId: string): Promise<InboxRow[]> {
        const written = Prisma.sql`EXISTS (SELECT 1 FROM support_messages m
                                            WHERE m.conversation_id = c.id AND m.sender_type = 'guest')`;
        const where =
            filter === 'unassigned' ? Prisma.sql`c.assigned_admin_id IS NULL
                                                 AND c.status IN ('waiting_human', 'human_active')
                                                 AND ${written}`
          : filter === 'mine'       ? Prisma.sql`c.assigned_admin_id = ${adminId}::uuid AND c.status <> 'resolved'`
          : filter === 'assigned'   ? Prisma.sql`c.assigned_admin_id IS NOT NULL AND c.status <> 'resolved'`
          :                           Prisma.sql`c.status = 'resolved'`;

        const order = filter === 'unassigned'
            ? Prisma.raw(`${URGENCY_SQL} DESC, c.last_message_at ASC`)
            : Prisma.raw('c.last_message_at DESC');

        return prisma.$queryRaw<InboxRow[]>(Prisma.sql`
            SELECT ${CONVERSATION_COLUMNS},
                   ${Prisma.raw(URGENCY_SQL)} AS urgency_rank,
                   (SELECT u.email FROM users u WHERE u.id = c.user_id) AS customer_email,
                   (SELECT count(*)::int FROM support_messages m
                     WHERE m.conversation_id = c.id) AS message_count
              FROM support_conversations c
             WHERE ${where}
             ORDER BY ${order}
             LIMIT 100
        `);
    }

    /**
     * Hand a conversation to someone, and record who did it.
     *
     * The row is locked while the move is decided, so two admins assigning at the same moment
     * cannot each read the old owner and write a different new one.
     */
    async assign(conversationId: string, toAdminId: string, actorAdminId: string): Promise<'moved' | 'already' | 'resolved' | 'missing'> {
        return prisma.$transaction(async (tx) => {
            const [before] = await tx.$queryRaw<{ assigned_admin_id: string | null; status: string }[]>(Prisma.sql`
                SELECT assigned_admin_id, status FROM support_conversations
                 WHERE id = ${conversationId}::uuid FOR UPDATE
            `);
            if (!before) return 'missing' as const;
            if (before.status === 'resolved') return 'resolved' as const;
            if (before.assigned_admin_id === toAdminId) return 'already' as const;

            await tx.$executeRaw(Prisma.sql`
                UPDATE support_conversations
                   SET assigned_admin_id = ${toAdminId}::uuid, updated_at = now()
                 WHERE id = ${conversationId}::uuid
            `);
            await tx.$executeRaw(Prisma.sql`
                INSERT INTO support_assignment_events
                    (conversation_id, kind, from_admin_id, to_admin_id, actor_admin_id)
                VALUES (${conversationId}::uuid, 'assigned', ${before.assigned_admin_id}::uuid,
                        ${toAdminId}::uuid, ${actorAdminId}::uuid)
            `);
            return 'moved' as const;
        });
    }

    /** Back to the queue, never to a named colleague. */
    async returnToQueue(conversationId: string, actorAdminId: string): Promise<void> {
        await prisma.$transaction([
            prisma.$executeRaw(Prisma.sql`
                UPDATE support_conversations SET assigned_admin_id = NULL, updated_at = now()
                 WHERE id = ${conversationId}::uuid
            `),
            prisma.$executeRaw(Prisma.sql`
                INSERT INTO support_assignment_events
                    (conversation_id, kind, from_admin_id, to_admin_id, actor_admin_id)
                VALUES (${conversationId}::uuid, 'returned', ${actorAdminId}::uuid, NULL, ${actorAdminId}::uuid)
            `),
        ]);
    }

    async setStatus(conversationId: string, status: SupportStatus): Promise<void> {
        await prisma.$executeRaw(Prisma.sql`
            UPDATE support_conversations SET status = ${status}, updated_at = now()
             WHERE id = ${conversationId}::uuid
        `);
    }

    /**
     * Say that a rendering has been asked for.
     *
     * The status is a state machine the database enforces: `pending` while the engine is being
     * asked, then `translated` or `untranslated`. Marking it before the call is what lets a
     * reader show "translating…" rather than a message that changes under them, and what makes
     * the settles below idempotent — two runs of the same message cannot both land.
     */
    async markTranslationPending(messageId: string, lang: string): Promise<void> {
        await prisma.$executeRaw(Prisma.sql`
            UPDATE support_messages
               SET translation_status = 'pending', translated_lang = ${lang}
             WHERE id = ${messageId}::uuid AND translation_status IS NULL
        `);
    }

    /**
     * Store a rendering beside the author's words, which are never touched.
     *
     * Only onto a row still pending, and the caller is told whether it landed: a second run
     * that finished first has already said what this one would, and a back-translation must
     * not be made of a rendering that was not the one stored.
     */
    async settleTranslated(messageId: string, translated: string, lang: string): Promise<boolean> {
        const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
            UPDATE support_messages
               SET translated_body    = ${translated},
                   translated_lang    = ${lang},
                   translation_status = 'translated'
             WHERE id = ${messageId}::uuid AND translation_status = 'pending'
            RETURNING id
        `);
        return rows.length > 0;
    }

    /**
     * Refused, wrapped past recovery, timed out or unreachable.
     *
     * The body is cleared rather than left behind: the schema allows one only on a translated
     * row, and a reader is entitled to the original with nothing posing as a rendering of it.
     */
    async settleUntranslated(messageId: string): Promise<void> {
        await prisma.$executeRaw(Prisma.sql`
            UPDATE support_messages
               SET translation_status = 'untranslated', translated_body = NULL
             WHERE id = ${messageId}::uuid AND translation_status = 'pending'
        `);
    }

    /**
     * What the customer actually read, put back into English for the Agent.
     *
     * Stored as '' when it could not be checked, so the inbox stops saying it is checking.
     */
    async storeBackTranslation(messageId: string, back: string): Promise<void> {
        await prisma.$executeRaw(Prisma.sql`
            UPDATE support_messages
               SET back_translated_body = ${back}
             WHERE id = ${messageId}::uuid AND translation_status = 'translated'
        `);
    }

    /**
     * Translations a stopped process left in flight.
     *
     * `pending` is written before the engine is called, so a deploy or a crash mid-call leaves
     * a row that nothing is coming back to settle — and a reply held for its translation is
     * held forever, which the reader experiences as a message that never arrived.
     *
     * Old enough to be abandoned rather than merely slow: the worst honest case is a long
     * message whose pieces each exhaust their attempts and are then halved, a little over two
     * minutes, so three is past anything still working.
     */
    async findStalledTranslations(olderThanMs: number, limit = 50): Promise<{
        id: string; conversation_id: string; sender_type: string; body: string; locale: string;
    }[]> {
        return prisma.$queryRaw`
            SELECT m.id, m.conversation_id, m.sender_type, m.body, c.locale
              FROM support_messages m
              JOIN support_conversations c ON c.id = m.conversation_id
             WHERE m.translation_status = 'pending'
               AND m.created_at < now() - (${olderThanMs} * interval '1 millisecond')
             ORDER BY m.created_at
             LIMIT ${limit}
        `;
    }

    /**
     * What the widget offered a customer, and what they did with it (ADR-0043).
     *
     * A counter. Nothing anyone sees depends on it, which is why the caller does not wait on it
     * and a failure is answered like a success — a customer who cannot record that a card was
     * shown must still be able to ask their question.
     */
    async recordSuggestionEvent(input: {
        conversationId: string; articleId: string; locale: string; outcome: string;
    }): Promise<void> {
        await prisma.$executeRaw(Prisma.sql`
            INSERT INTO support_suggestion_events (conversation_id, article_id, locale, outcome)
            VALUES (${input.conversationId}::uuid, ${input.articleId}, ${input.locale}, ${input.outcome})
        `);
    }

    /**
     * The articles this customer was already shown, newest first.
     *
     * The Agent opening the chat reads this as "they have been given these answers and wrote
     * anyway" — both a shortcut past repeating one, and the signal that an article is matching
     * questions it cannot answer.
     */
    async suggestionsShownFor(conversationId: string): Promise<string[]> {
        const rows = await prisma.$queryRaw<{ article_id: string }[]>(Prisma.sql`
            SELECT DISTINCT article_id
              FROM support_suggestion_events
             WHERE conversation_id = ${conversationId}::uuid
               AND outcome IN ('shown', 'opened')
             LIMIT 10
        `);
        return rows.map(r => r.article_id);
    }

    // ── Attachments (ADR-0040) ────────────────────────────────────────────────

    /**
     * Record a file whose bytes are already in the bucket.
     *
     * The id is minted here rather than by the column default, because the storage key is built
     * from it and the object has to exist before the row does — a row must never point at a
     * missing file. The reverse, an object with no row, is the caller's to clean up.
     */
    async insertAttachment(input: {
        id: string; conversationId: string; storageKey: string; fileName: string;
        contentType: string; sizeBytes: number; uploadedByType: string; uploadedByAdminId?: string | null;
    }): Promise<void> {
        await prisma.$executeRaw(Prisma.sql`
            INSERT INTO support_message_attachments
                (id, conversation_id, storage_key, file_name, content_type, size_bytes,
                 uploaded_by_type, uploaded_by_admin_id)
            VALUES (${input.id}::uuid, ${input.conversationId}::uuid, ${input.storageKey},
                    ${input.fileName}, ${input.contentType}, ${input.sizeBytes},
                    ${input.uploadedByType}, ${input.uploadedByAdminId ?? null}::uuid)
        `);
    }

    /** Bind uploaded files to the message that carries them, once that message exists. */
    async attachToMessage(attachmentIds: string[], messageId: string, conversationId: string): Promise<number> {
        if (attachmentIds.length === 0) return 0;
        return prisma.$executeRaw(Prisma.sql`
            UPDATE support_message_attachments
               SET message_id = ${messageId}::uuid
             WHERE id IN (${Prisma.join(attachmentIds.map(id => Prisma.sql`${id}::uuid`))})
               -- Scoped to the conversation, so an id belonging to someone else's chat cannot
               -- be bound into this one by guessing it.
               AND conversation_id = ${conversationId}::uuid
               AND message_id IS NULL
        `);
    }

    /**
     * The attachments on a set of messages, grouped by message.
     *
     * One query for a whole transcript rather than one per message: a conversation is read on
     * every widget open and every stream backfill, and a per-message read would make that cost
     * grow with the length of the conversation.
     */
    async attachmentsByMessage(messageIds: string[]): Promise<Map<string, SupportAttachmentView[]>> {
        const grouped = new Map<string, SupportAttachmentView[]>();
        if (messageIds.length === 0) return grouped;

        const rows = await prisma.$queryRaw<(SupportAttachmentView & { messageId: string })[]>(Prisma.sql`
            SELECT id,
                   message_id       AS "messageId",
                   file_name        AS "fileName",
                   content_type     AS "contentType",
                   size_bytes::int  AS "sizeBytes",
                   uploaded_by_type AS "uploadedByType",
                   (bytes_deleted_at IS NOT NULL) AS "bytesDeleted"
              FROM support_message_attachments
             WHERE message_id IN (${Prisma.join(messageIds.map(id => Prisma.sql`${id}::uuid`))})
             ORDER BY created_at
        `);

        for (const row of rows) {
            const list = grouped.get(row.messageId) ?? [];
            list.push(row);
            grouped.set(row.messageId, list);
        }
        return grouped;
    }

    /**
     * One attachment, with the key — for the download route only.
     *
     * The key never reaches a response (ADR-0040): a message is serialised into HTTP, a stream
     * frame and the Agent's inbox, and none of those need to name an object in a bucket.
     */
    async findAttachment(id: string): Promise<{
        id: string; conversationId: string; storageKey: string; fileName: string;
        contentType: string; bytesDeleted: boolean;
    } | null> {
        const rows = await prisma.$queryRaw<{
            id: string; conversationId: string; storageKey: string; fileName: string;
            contentType: string; bytesDeleted: boolean;
        }[]>(Prisma.sql`
            SELECT id,
                   conversation_id AS "conversationId",
                   storage_key     AS "storageKey",
                   file_name       AS "fileName",
                   content_type    AS "contentType",
                   (bytes_deleted_at IS NOT NULL) AS "bytesDeleted"
              FROM support_message_attachments
             WHERE id = ${id}::uuid
             LIMIT 1
        `);
        return rows[0] ?? null;
    }

    /** Files whose bytes are past the retention window and have not been removed yet. */
    async findExpiredAttachments(days: number, limit = 200): Promise<{ id: string; storageKey: string }[]> {
        return prisma.$queryRaw`
            SELECT id, storage_key AS "storageKey"
              FROM support_message_attachments
             WHERE bytes_deleted_at IS NULL
               AND created_at < now() - (${days} * interval '1 day')
             ORDER BY created_at
             LIMIT ${limit}
        `;
    }

    /**
     * Mark the bytes gone, keeping the row.
     *
     * The transcript still shows that a file was sent and says it has expired. Deleting the row
     * would make a conversation read as though nothing was ever attached.
     */
    async markBytesDeleted(id: string): Promise<void> {
        await prisma.$executeRaw(Prisma.sql`
            UPDATE support_message_attachments SET bytes_deleted_at = now() WHERE id = ${id}::uuid
        `);
    }

    /** Whether this person may answer Support Chats at all. */
    async canAnswerSupport(userId: string): Promise<boolean> {
        const rows = await prisma.$queryRaw<{ role: string }[]>(Prisma.sql`
            SELECT role FROM users WHERE id = ${userId}::uuid LIMIT 1
        `);
        return rows.length > 0 && (rows[0].role === 'admin' || rows[0].role === 'support_agent');
    }
}
