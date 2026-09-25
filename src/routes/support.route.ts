import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth.middleware';
import { canonicalBrandName } from '@/lib/brand';
import { SupportService } from '@/services/support.service';
import { openEventStream } from '@/lib/support/stream';
import { searchRateLimit } from '@/middleware/rate-limit.middleware';
import { getSupportAvailability } from '@/lib/support/availability';
import { nextOpening } from '@/lib/support/hours';

/**
 * The customer's side of a Support Chat.
 *
 * Authenticated throughout, which is ADR-0032 rather than a default: a Support Chat is
 * answered inside the app, so one started by someone with no account is one an Agent answers
 * into a void. The Agent's inbox and the Support Desk are a separate surface under /admin and
 * are not reachable from here.
 */
const router = Router();
const svc = new SupportService();

/**
 * Whether a person can be reached right now, and the published hours.
 *
 * Public, and before the auth gate: it says nothing about any conversation, only when the desk
 * is open, which is the same answer for everyone. `nextOpening` is carried whether open or
 * shut, so the widget can say when someone will pick up a message written overnight.
 */
router.get('/availability', searchRateLimit, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const { humanAvailable, hours } = await getSupportAvailability();
        return res.json({ success: true, data: { humanAvailable, hours, nextOpening: nextOpening(hours, new Date()) } });
    } catch (err) { next(err); }
});

router.use(requireAuth);

/** Open a conversation, or resume the one already open. Idempotent by design. */
router.post('/conversation', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { locale } = z.object({ locale: z.string().optional() }).parse(req.body ?? {});
        const result = await svc.openConversation(
            req.user!.sub,
            locale ?? req.headers['accept-language'],
            canonicalBrandName(process.env.BRAND_NAME ?? process.env.NEXT_PUBLIC_BRAND_NAME),
        );
        return res.status(result.created ? 201 : 200).json({ success: true, data: result.conversation });
    } catch (err) { next(err); }
});

/** The caller's conversation and its transcript. `null` when they have never opened one. */
router.get('/conversation', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const found = await svc.getConversation(req.user!.sub);
        return res.json({ success: true, data: found });
    } catch (err) { next(err); }
});

/**
 * The customer's live stream.
 *
 * Scoped to their own conversation, and resolved here rather than taken from the query string:
 * a stream is a subscription, and one a caller can point at any id is a way to read a stranger's
 * chat as it is written.
 */
router.get('/stream', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const found = await svc.getConversation(req.user!.sub);
        if (!found) {
            // Nothing to follow yet. Said plainly so the widget can wait rather than retry.
            return res.status(204).end();
        }
        await openEventStream(res, {
            conversationId: found.conversation.id,
            // A conversation-scoped stream already only hears its own, but the customer has no
            // use for assignment events either — they name staff movements, not their chat.
            relay: (e) => e.messageId !== null,
        });
    } catch (err) { next(err); }
});

router.post('/conversation/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id }   = z.object({ id: z.string().uuid() }).parse(req.params);
        const { body } = z.object({ body: z.string().min(1).max(4000) }).parse(req.body ?? {});
        const message  = await svc.sendMessage(req.user!.sub, id, body);
        return res.status(201).json({ success: true, data: message });
    } catch (err) { next(err); }
});

export default router;
