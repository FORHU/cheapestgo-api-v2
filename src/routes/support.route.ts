import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth.middleware';
import { canonicalBrandName } from '@/lib/brand';
import { SupportService } from '@/services/support.service';
import { SupportRepository } from '@/repositories/support.repository';
import { AppError } from '@/middleware/error.middleware';
import { openEventStream } from '@/lib/support/stream';
import multer from 'multer';
import { MAX_ATTACHMENT_BYTES } from '@/lib/support/attachments';
import { attachmentsConfigured } from '@/lib/support/attachmentStorage';

/**
 * In memory, not on disk.
 *
 * The file is checked by its own bytes and handed straight to S3, so writing it to the
 * container's filesystem first would only create a second copy of a customer's passport page
 * for a temp-file cleaner to worry about. Capped at the same size the service enforces, so an
 * oversized upload is refused before it is buffered rather than after.
 */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } });
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
        return res.json({ success: true, data: {
            humanAvailable, hours, nextOpening: nextOpening(hours, new Date()),
            // So the widget can hide the paperclip rather than offer an upload that would be
            // refused: a bucket is deployment configuration, not something a customer can fix.
            attachments: attachmentsConfigured(),
        } });
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

/**
 * What the widget offered, and what the customer did with it (ADR-0043).
 *
 * A counter, and answered like one: 204 whether or not it stored anything. A customer is asking
 * a question, not filing a report, and a widget that surfaced "could not save" for bookkeeping
 * would be telling them about our problems. The ids are checked so the table cannot be filled
 * with arbitrary strings, but a rejected one is still not the customer's business.
 */
router.post('/suggestions', async (req: Request, res: Response) => {
    try {
        const { articleId, outcome, locale } = z.object({
            articleId: z.enum(['confirmation', 'refunds', 'changes', 'priceGap', 'payment']),
            outcome:   z.enum(['shown', 'opened', 'solved', 'sent_anyway']),
            locale:    z.string().max(10),
        }).parse(req.body ?? {});

        const found = await svc.getConversation(req.user!.sub);
        if (found) {
            await new SupportRepository().recordSuggestionEvent({
                conversationId: found.conversation.id, articleId, outcome, locale,
            });
        }
    } catch {
        // Deliberately swallowed; see above.
    }
    return res.status(204).end();
});

/**
 * Attach a file to a conversation, before the message that carries it.
 *
 * Uploaded first because the bytes are the slow part: a customer should be able to attach while
 * they are still typing, and the send that follows only names the ids.
 */
router.post('/conversation/:id/attachments', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!attachmentsConfigured()) {
            throw new AppError(503, 'Attachments are not available right now.', 'SUPPORT_ATTACHMENTS_OFF');
        }
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const file = (req as Request & { file?: { buffer: Buffer; originalname: string } }).file;
        if (!file) throw new AppError(400, 'No file was sent.', 'VALIDATION_ERROR');

        const stored = await svc.uploadAttachment({
            actor: { id: req.user!.sub }, conversationId: id,
            fileName: file.originalname, bytes: file.buffer, as: 'guest',
        });
        return res.status(201).json({ success: true, data: stored });
    } catch (err) { next(err); }
});

/**
 * The bytes, by way of a redirect to a five-minute signed URL (ADR-0040).
 *
 * Nothing is served from the bucket directly and no URL is ever stored: what is in the
 * transcript is an id, and whether this caller may read it is decided here, now — so a
 * conversation reassigned later changes what can be fetched immediately.
 */
router.get('/attachments/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const url = await svc.attachmentUrl({ id: req.user!.sub }, id);
        return res.redirect(302, url);
    } catch (err) { next(err); }
});

router.post('/conversation/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id }   = z.object({ id: z.string().uuid() }).parse(req.params);
        const { body, attachmentIds } = z.object({
            body:          z.string().min(1).max(4000),
            attachmentIds: z.array(z.string().uuid()).max(5).optional(),
        }).parse(req.body ?? {});
        const message = await svc.sendMessage(req.user!.sub, id, body, attachmentIds ?? []);
        return res.status(201).json({ success: true, data: message });
    } catch (err) { next(err); }
});

export default router;
