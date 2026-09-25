import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { URGENCY_SQL } from '@/lib/support/urgency';

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
            SELECT id, conversation_id, sender_type, sender_admin_id, body, notice_code, created_at
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
                RETURNING id, conversation_id, sender_type, sender_admin_id, body, notice_code, created_at
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

    /** Whether this person may answer Support Chats at all. */
    async canAnswerSupport(userId: string): Promise<boolean> {
        const rows = await prisma.$queryRaw<{ role: string }[]>(Prisma.sql`
            SELECT role FROM users WHERE id = ${userId}::uuid LIMIT 1
        `);
        return rows.length > 0 && (rows[0].role === 'admin' || rows[0].role === 'support_agent');
    }
}
