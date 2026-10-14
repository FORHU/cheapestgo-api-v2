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

    // ── Assignment: who a chat can be given to, and what each of them holds ──────

    /** Everyone who may answer a chat. Admins first, then by name, as v1 orders them. */
    async listAssignableAgents(): Promise<Array<{ id: string; name: string; role: string }>> {
        return prisma.$queryRaw(Prisma.sql`
            SELECT id,
                   COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), email) AS name,
                   role
              FROM users
             WHERE role IN ('support_agent', 'admin') AND banned_at IS NULL
             ORDER BY role = 'admin', name
        `);
    }

    /**
     * Per person: what they hold now, and what they have handled since `since`.
     *
     * `handled` is read from the recorded resolutions in `support_assignment_events`, never
     * from who holds a chat now — a chat reassigned after it was resolved would otherwise
     * move the credit with it, and this is the figure pay is worked out from.
     */
    async handledTally(since: Date): Promise<Array<{
        adminId: string; name: string; role: string; open: number; handled: number;
    }>> {
        return prisma.$queryRaw(Prisma.sql`
            SELECT u.id AS "adminId",
                   COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email) AS name,
                   u.role,
                   (SELECT count(*)::int FROM support_conversations c
                     WHERE c.assigned_admin_id = u.id AND c.status <> 'resolved') AS open,
                   (SELECT count(*)::int FROM support_assignment_events e
                     WHERE e.kind = 'resolved' AND e.to_admin_id = u.id AND e.created_at >= ${since}) AS handled
              FROM users u
             WHERE u.role IN ('support_agent', 'admin')
             ORDER BY u.role = 'admin', handled DESC, name
        `);
    }

    /**
     * The two integers the sidebar badge polls for.
     *
     * Separate from the conversations query because the badge renders on every admin page:
     * it wants counts, not a page of rows it will throw away.
     *
     * Unassigned counts only chats a customer has actually written in. A conversation that
     * reached `waiting_human` without a guest message is a widget someone opened and left.
     */
    async inboxCounts(actorId: string): Promise<{ unassigned: number; mine: number; mineWaiting: number }> {
        const rows = await prisma.$queryRaw<Array<{ unassigned: bigint; mine: bigint; mineWaiting: bigint }>>(Prisma.sql`
            SELECT
                count(*) FILTER (WHERE c.assigned_admin_id IS NULL
                                   AND c.status IN ('waiting_human', 'human_active')
                                   AND EXISTS (SELECT 1 FROM support_messages m
                                                WHERE m.conversation_id = c.id AND m.sender_type = 'guest')) AS unassigned,
                count(*) FILTER (WHERE c.assigned_admin_id = ${actorId}::uuid AND c.status <> 'resolved') AS mine,
                count(*) FILTER (WHERE c.assigned_admin_id = ${actorId}::uuid AND c.status = 'waiting_human') AS "mineWaiting"
              FROM support_conversations c
        `);
        const r = rows[0];
        return {
            unassigned:  Number(r?.unassigned ?? 0),
            mine:        Number(r?.mine ?? 0),
            mineWaiting: Number(r?.mineWaiting ?? 0),
        };
    }

    /**
     * Override computed **Urgency**, or hand it back.
     *
     * `null` is a value, not an absence: it restores the rule that keeps moving on its own
     * as a departure approaches, which is a different thing from pinning the chat at
     * `normal`. Returns whether the conversation existed.
     */
    async setPriority(conversationId: string, priority: string | null): Promise<boolean> {
        const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            UPDATE support_conversations
               SET priority = ${priority}
             WHERE id = ${conversationId}::uuid
            RETURNING id
        `);
        return rows.length > 0;
    }

    // ── Internal Notes ───────────────────────────────────────────────────────────

    /**
     * Notes are read only here, and only by staff.
     *
     * They live in their own table rather than as a `sender_type` on `support_messages`,
     * and that is a safety property rather than a taxonomy: the customer's read paths —
     * including the live stream — cannot return a Note because they never query this
     * table. The failure being designed out is a customer watching an Agent's private
     * assessment of them arrive in real time.
     */
    async listNotes(conversationId: string): Promise<Array<{
        id: string; conversationId: string; authorAdminId: string; authorName: string | null;
        body: string; createdAt: Date;
    }>> {
        return prisma.$queryRaw(Prisma.sql`
            SELECT n.id,
                   n.conversation_id AS "conversationId",
                   n.author_admin_id AS "authorAdminId",
                   COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email) AS "authorName",
                   n.body,
                   n.created_at AS "createdAt"
              FROM support_notes n
              LEFT JOIN users u ON u.id = n.author_admin_id
             WHERE n.conversation_id = ${conversationId}::uuid
             ORDER BY n.created_at
        `);
    }

    /**
     * Write a Note.
     *
     * Deliberately does not touch `last_message_at`. The Waiting queue sorts on it, so
     * bumping it here would push a customer down the queue because an Agent wrote
     * something *about* them — the chat would look freshly active while being no closer to
     * an answer.
     */
    async addNote(conversationId: string, authorAdminId: string, body: string): Promise<{
        id: string; conversationId: string; authorAdminId: string; body: string; createdAt: Date;
    } | null> {
        const rows = await prisma.$queryRaw<Array<{
            id: string; conversationId: string; authorAdminId: string; body: string; createdAt: Date;
        }>>(Prisma.sql`
            INSERT INTO support_notes (conversation_id, author_admin_id, body)
            SELECT ${conversationId}::uuid, ${authorAdminId}::uuid, ${body}
             WHERE EXISTS (SELECT 1 FROM support_conversations WHERE id = ${conversationId}::uuid)
            RETURNING id,
                      conversation_id AS "conversationId",
                      author_admin_id AS "authorAdminId",
                      body,
                      created_at AS "createdAt"
        `);
        return rows[0] ?? null;
    }

    // ── Asking for a person, and reading back a finished chat ───────────────────

    /**
     * Move a chat into the human queue, if it is not already there.
     *
     * Conditional in the statement rather than read-then-write: two taps on "talk to a
     * person" arrive together often enough, and the second must not reset a chat an Agent
     * has already picked up. Returns null when nothing moved, which the caller reads as
     * "already queued" rather than as a failure.
     */
    async requestHuman(conversationId: string): Promise<SupportConversationRow | null> {
        const rows = await prisma.$queryRaw<SupportConversationRow[]>(Prisma.sql`
            UPDATE support_conversations
               SET status = 'waiting_human'
             WHERE id = ${conversationId}::uuid
               AND status = 'ai_active'
            RETURNING *
        `);
        return rows[0] ?? null;
    }

    /**
     * The caller's finished chats, newest first.
     *
     * Resolved only. A resolved chat is never reopened, so this is how someone reads back
     * an earlier answer without it mixing into the topic they are on now.
     */
    async listPastConversations(userId: string, limit = 10): Promise<Array<{
        reference: string; createdAt: Date; lastMessageAt: Date | null;
    }>> {
        return prisma.$queryRaw(Prisma.sql`
            SELECT reference, created_at AS "createdAt", last_message_at AS "lastMessageAt"
              FROM support_conversations
             WHERE user_id = ${userId}::uuid AND status = 'resolved'
             ORDER BY last_message_at DESC
             LIMIT ${limit}
        `);
    }

    /**
     * One of the caller's own finished chats, by its **Chat Reference**.
     *
     * The reference names a conversation and grants nothing (ADR-0038) — what grants the
     * read is that the chat belongs to the signed-in caller. Someone else's reference, or
     * one that is still open, is simply not found, and indistinguishable from a reference
     * that never existed.
     */
    async findPastByReference(userId: string, reference: string): Promise<SupportConversationRow | null> {
        const rows = await prisma.$queryRaw<SupportConversationRow[]>(Prisma.sql`
            SELECT * FROM support_conversations
             WHERE user_id = ${userId}::uuid
               AND reference = ${reference}
               AND status = 'resolved'
             LIMIT 1
        `);
        return rows[0] ?? null;
    }

    // ── Linked Bookings ──────────────────────────────────────────────────────────

    /**
     * The caller's own trips, soonest first, for the picker to show.
     *
     * Four fields, not whole rows: a support widget is not a booking screen, and pulling
     * the itinerary here would put it into a payload that exists to render a label and a
     * date. Trips with no date sort last — the one someone is about to take is the one
     * they are most likely writing about.
     */
    async listCustomerTrips(userId: string): Promise<Array<{
        bookingReference: string; kind: string; label: string; startsAt: Date | null;
    }>> {
        return prisma.$queryRaw(Prisma.sql`
            SELECT booking_reference AS "bookingReference",
                   'stay'            AS kind,
                   COALESCE(property_name, 'Hotel booking') AS label,
                   check_in::timestamptz AS "startsAt"
              FROM bookings
             WHERE user_id = ${userId}::uuid AND booking_reference IS NOT NULL
            UNION ALL
            SELECT fb.booking_reference AS "bookingReference",
                   'flight'             AS kind,
                   COALESCE(MIN(fs.origin) || ' → ' || MAX(fs.destination), 'Flight booking') AS label,
                   MIN(fs.departure) AS "startsAt"
              FROM flight_bookings fb
              LEFT JOIN flight_segments fs ON fs.booking_id = fb.id
             WHERE fb.user_id = ${userId}::uuid AND fb.booking_reference IS NOT NULL
             GROUP BY fb.booking_reference
             ORDER BY "startsAt" ASC NULLS LAST
             LIMIT 20
        `);
    }

    /**
     * Whether a reference is this person's own trip.
     *
     * The whole of the customer's link path rests on this: without it a customer could
     * attach any reference they had seen or guessed, and an Agent would discuss a
     * stranger's trip in good faith believing the system had vouched for it.
     */
    async bookingBelongsTo(bookingReference: string, userId: string): Promise<boolean> {
        const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>(Prisma.sql`
            SELECT TRUE AS ok FROM bookings
             WHERE booking_reference = ${bookingReference} AND user_id = ${userId}::uuid
            UNION ALL
            SELECT TRUE AS ok FROM flight_bookings
             WHERE booking_reference = ${bookingReference} AND user_id = ${userId}::uuid
            LIMIT 1
        `);
        return rows.length > 0;
    }

    /**
     * The trips on one conversation, in the order they were attached.
     *
     * `known` is computed against the booking tables so the screen can mark a reference
     * that resolves to nothing — an Agent typing one from a phone call gets it wrong
     * sometimes, and a silent miss is worse than a visible one.
     */
    async listLinkedBookings(conversationId: string): Promise<Array<{
        bookingReference: string; linkedBy: string | null; linkedAt: Date; known: boolean;
    }>> {
        return prisma.$queryRaw(Prisma.sql`
            SELECT scb.booking_reference AS "bookingReference",
                   scb.linked_by         AS "linkedBy",
                   scb.linked_at         AS "linkedAt",
                   EXISTS (
                       SELECT 1 FROM bookings b  WHERE b.booking_reference  = scb.booking_reference
                       UNION ALL
                       SELECT 1 FROM flight_bookings fb WHERE fb.booking_reference = scb.booking_reference
                   ) AS known
              FROM support_conversation_bookings scb
             WHERE scb.conversation_id = ${conversationId}::uuid
             ORDER BY scb.linked_at ASC
        `);
    }

    /** Idempotent: attaching a trip twice is the same end state as attaching it once. */
    async linkBooking(conversationId: string, bookingReference: string, linkedBy: string | null): Promise<void> {
        await prisma.$executeRaw(Prisma.sql`
            INSERT INTO support_conversation_bookings (conversation_id, booking_reference, linked_by)
            VALUES (${conversationId}::uuid, ${bookingReference}, ${linkedBy}::uuid)
            ON CONFLICT (conversation_id, booking_reference) DO NOTHING
        `);
    }

    /** Silent when it was not linked — the end state is what was asked for. */
    async unlinkBooking(conversationId: string, bookingReference: string): Promise<void> {
        await prisma.$executeRaw(Prisma.sql`
            DELETE FROM support_conversation_bookings
             WHERE conversation_id = ${conversationId}::uuid
               AND booking_reference = ${bookingReference}
        `);
    }

    /**
     * Remove one of your own notes.
     *
     * Scoped to the author in the statement, so an Agent cannot tidy away a colleague's
     * account of what they thought at the time.
     */
    async deleteNote(noteId: string, authorAdminId: string): Promise<boolean> {
        const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            DELETE FROM support_notes
             WHERE id = ${noteId}::uuid AND author_admin_id = ${authorAdminId}::uuid
            RETURNING id
        `);
        return rows.length > 0;
    }
}
