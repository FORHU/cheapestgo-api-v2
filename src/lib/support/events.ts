import postgres from 'postgres';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Delivery of new support messages to whoever is holding a stream open.
 *
 * The bus is Postgres, not the Redis that is already connected beside it. Redis here is a
 * cache and is treated as one — `server.ts` logs "unavailable, caching disabled" and carries
 * on — so a chat riding on it would stop updating the moment Redis went away, with both ends
 * still looking at a screen that appeared to be working. An in-process EventEmitter has the
 * same shape and is worse: it works perfectly in development and drops every cross-process
 * message in production. The bus has to be as available as the data, and the data is in
 * Postgres.
 *
 * It also has to cross processes, because it already does: CheapestGo and AirangGo run as
 * separate containers against one database (ADR-0005), and a customer can be on one while the
 * Agent answering them is on the other.
 *
 * Postgres is the bus, not the queue: `pg_notify` carries only the ids, and each listener
 * reads the row itself. That keeps the payload far below the 8000-byte NOTIFY ceiling a long
 * message would breach, and means a listener that connects late reads current rows rather than
 * replaying a stale copy.
 */

const CHANNEL = 'support_chat';

export interface SupportEvent {
    conversationId: string;
    /**
     * The message written, or null when the conversation itself changed — it was assigned,
     * handed back, resolved. The customer's stream only relays messages and ignores a null;
     * the inbox refetches either way.
     */
    messageId: string | null;
}

type Handler = (event: SupportEvent) => void;

/** Subscribers for one conversation, plus the bucket watching all of them. */
const byConversation = new Map<string, Set<Handler>>();
const watchingAll = new Set<Handler>();

/**
 * A connection of its own, rather than one from the pool Prisma manages.
 *
 * `sql.listen()` holds its connection for as long as it is listening, so borrowing one from a
 * working pool would spend a slot on a socket that never runs a query.
 */
let listener: postgres.Sql | null = null;
let listening: Promise<void> | null = null;

function listenerClient(): postgres.Sql {
    if (!listener) {
        listener = postgres(config.DATABASE_URL, {
            max: 1,
            idle_timeout: 0,   // A listener that is idle is a listener doing its job.
            connect_timeout: 10,
            onnotice: () => {},
        });
    }
    return listener;
}

/**
 * Attach the process-wide LISTEN, once.
 *
 * postgres.js re-issues LISTEN for every registered channel when the connection drops and
 * comes back, so a database restart does not leave this process deaf.
 */
function ensureListening(): Promise<void> {
    if (!listening) {
        listening = listenerClient()
            .listen(CHANNEL, (payload: string) => {
                let event: SupportEvent;
                try {
                    const parsed = JSON.parse(payload) as { c?: unknown; m?: unknown };
                    if (typeof parsed.c !== 'string') return;
                    if (parsed.m !== null && typeof parsed.m !== 'string') return;
                    event = { conversationId: parsed.c, messageId: parsed.m as string | null };
                } catch {
                    return;   // Not ours, or truncated. Nothing sensible to do with it.
                }

                for (const handler of byConversation.get(event.conversationId) ?? []) {
                    try { handler(event); } catch { /* one dead stream must not stop the rest */ }
                }
                for (const handler of watchingAll) {
                    try { handler(event); } catch { /* as above */ }
                }
            })
            .then(() => undefined)
            .catch((err: Error) => {
                // Let the next subscriber retry rather than caching the failure for ever.
                listening = null;
                logger.warn('[support/events] could not listen', { err: err.message });
                throw err;
            });
    }
    return listening;
}

/**
 * Watch for new messages. Pass a conversation id, or null to watch every conversation, which
 * is what the Agent inbox wants.
 *
 * Returns the unsubscribe. Callers must run it when their stream closes; the set it removes
 * from is the only thing keeping a disconnected client's closure alive.
 */
export async function subscribe(
    conversationId: string | null,
    handler: Handler,
): Promise<() => void> {
    await ensureListening();

    if (conversationId === null) {
        watchingAll.add(handler);
        return () => { watchingAll.delete(handler); };
    }

    let handlers = byConversation.get(conversationId);
    if (!handlers) {
        handlers = new Set();
        byConversation.set(conversationId, handlers);
    }
    handlers.add(handler);

    return () => {
        const current = byConversation.get(conversationId);
        if (!current) return;
        current.delete(handler);
        if (current.size === 0) byConversation.delete(conversationId);
    };
}

/**
 * Announce a message to every process, including this one.
 *
 * Deliberately not folded into the insert: NOTIFY inside a transaction fires on commit, and
 * the caller may want the row visible before anyone is told about it.
 *
 * Never throws. A chat that was saved and not announced is a chat that appears on the next
 * refresh; a save that fails because nobody could be told is a lost message.
 */
export async function publish(event: SupportEvent): Promise<void> {
    const payload = JSON.stringify({ c: event.conversationId, m: event.messageId });
    try {
        // Through Prisma's pool, not the listening connection. A connection in LISTEN mode is
        // not a connection you can also run a query on, and using it here failed quietly: the
        // message was written, nobody was told, and the only symptom was a stream that stayed
        // silent while the chat worked perfectly on refresh.
        await prisma.$executeRaw(Prisma.sql`SELECT pg_notify(${CHANNEL}, ${payload})`);
    } catch (err) {
        logger.warn('[support/events] could not publish', { err: (err as Error).message });
    }
}

/** Test seam, and what `server.ts` calls on shutdown: drop subscribers and the connection. */
export async function resetSupportEvents(): Promise<void> {
    byConversation.clear();
    watchingAll.clear();
    listening = null;
    if (listener) {
        const client = listener;
        listener = null;
        await client.end({ timeout: 1 }).catch(() => {});
    }
}
