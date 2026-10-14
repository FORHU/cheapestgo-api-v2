import { Response } from 'express';
import { subscribe, type SupportEvent } from '@/lib/support/events';

/**
 * One Server-Sent Events stream, held open until the client goes away.
 *
 * Deliberately plain: an event carries ids, not content. Whoever receives one fetches the
 * conversation it names, so a reader that connects late sees current rows instead of replaying
 * whatever happened to be in a buffer, and a long message never has to fit down the wire twice.
 *
 * A heartbeat every 25 seconds, because the thing between the browser and this process is
 * usually a proxy with an idle timeout, and a silent stream looks identical to a dead one. The
 * comment form is used so a client that only listens for named events ignores it.
 */
const HEARTBEAT_MS = 25_000;

export interface StreamOptions {
    /** A conversation to follow, or null to follow every one — which is what the inbox wants. */
    conversationId: string | null;
    /** Decides whether an event is this reader's business. */
    relay?: (event: SupportEvent) => boolean;
}

export async function openEventStream(res: Response, opts: StreamOptions): Promise<void> {
    res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection':    'keep-alive',
        // Nginx buffers a response body by default, which for a stream means holding every
        // event until the connection ends — the one shape this must not take.
        'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
        if (res.writableEnded) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const relay = opts.relay ?? (() => true);
    let unsubscribe: (() => void) | null = null;

    try {
        unsubscribe = await subscribe(opts.conversationId, (event) => {
            if (!relay(event)) return;
            send('support', event);
        });
        // Announced only now, because a client is entitled to read it as "I am listening" and
        // act — and anything it triggers before the subscription exists is delivered to nobody.
        // Sending it first made the whole stream look broken under a client that replied
        // immediately, while passing whenever anything at all happened in between.
        send('open', { at: new Date().toISOString() });
    } catch {
        // The bus is unreachable. Close rather than hold a stream that will never say anything:
        // the client reconnects and refetches, which is visibly slow instead of silently stale.
        send('error', { message: 'stream unavailable' });
        res.end();
        return;
    }

    const heartbeat = setInterval(() => {
        if (res.writableEnded) return;
        res.write(': keep-alive\n\n');
    }, HEARTBEAT_MS);

    const close = () => {
        clearInterval(heartbeat);
        unsubscribe?.();
        unsubscribe = null;
        if (!res.writableEnded) res.end();
    };

    // Both, because a client that navigates away and a socket that dies are different events
    // and only one of them fires per disconnection.
    res.on('close', close);
    res.on('error', close);
}
