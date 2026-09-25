import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth.middleware';
import { SupportService, type SupportActor } from '@/services/support.service';
import { AppError } from '@/middleware/error.middleware';
import { openEventStream } from '@/lib/support/stream';
import { SupportRepository } from '@/repositories/support.repository';
import { getSupportHours, saveSupportHours } from '@/lib/support/availability';

/**
 * The Agent's side of a Support Chat: the queues, and answering.
 *
 * Authenticated but not restricted to admins at the router, unlike the rest of /admin. A
 * Support Agent is not an admin — they answer chats and cannot do anything else here — so the
 * check is per-action in the service, where it can also say *why* it refused: reading is open
 * to every Agent, writing is limited to whoever holds the chat, and assigning is an admin's
 * alone (ADR-0041).
 */
const router = Router();
const svc = new SupportService();

router.use(requireAuth);

const actorOf = (req: Request): SupportActor => ({ id: req.user!.sub, role: req.user!.role });

/** Anyone who answers chats sets the desk's hours, as in v1; a customer never does. */
const requireDeskStaff = async (req: Request) => {
    // From the database, as the service does: the token's role predates the support_agent role.
    if (!await new SupportRepository().canAnswerSupport(req.user!.sub)) {
        throw new AppError(403, 'Only support staff can change Support Hours.', 'FORBIDDEN');
    }
};

router.get('/hours', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await requireDeskStaff(req);
        return res.json({ success: true, data: { hours: await getSupportHours() } });
    } catch (err) { next(err); }
});

/**
 * Replace the schedule. A whole week rather than a patch: a partial update invites the state
 * where half of it is what you meant and half is what was there, with no way to tell.
 */
router.put('/hours', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await requireDeskStaff(req);
        const result = await saveSupportHours((req.body as { hours?: unknown } | undefined)?.hours);
        // The message names the day and the problem, so the form can show it in place.
        if (!result.ok) throw new AppError(400, result.error, 'VALIDATION_ERROR');
        return res.json({ success: true, data: { hours: result.hours } });
    } catch (err) { next(err); }
});

/** A queue. `unassigned` is the one ordered by urgency; the rest by what happened last. */
router.get('/conversations', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { filter } = z.object({
            filter: z.enum(['unassigned', 'mine', 'assigned', 'resolved']).default('unassigned'),
        }).parse(req.query);
        const data = await svc.listInbox(actorOf(req), filter);
        return res.json({ success: true, data });
    } catch (err) { next(err); }
});

/**
 * The Agent's live stream.
 *
 * Every conversation, not one: an Agent watches a queue rather than a chat, and a new message
 * in a chat they are not looking at is exactly the thing they need to be told about. Each event
 * names an id and the inbox refetches — including assignment events, because who holds a chat
 * is half of what the inbox shows.
 */
router.get('/stream', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // The same gate as reading a queue: only someone who can answer may watch them all.
        await svc.listInbox(actorOf(req), 'unassigned');
        await openEventStream(res, { conversationId: null });
    } catch (err) { next(err); }
});

router.get('/conversations/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const data = await svc.getForAgent(actorOf(req), id);
        return res.json({ success: true, data });
    } catch (err) { next(err); }
});

router.post('/conversations/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id }   = z.object({ id: z.string().uuid() }).parse(req.params);
        const { body } = z.object({ body: z.string().min(1).max(4000) }).parse(req.body ?? {});
        const message  = await svc.agentReply(actorOf(req), id, body);
        return res.status(201).json({ success: true, data: message });
    } catch (err) { next(err); }
});

/** Give a chat to someone. An admin's action, never an Agent's (ADR-0041). */
router.post('/conversations/:id/assign', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id }        = z.object({ id: z.string().uuid() }).parse(req.params);
        const { toAdminId } = z.object({ toAdminId: z.string().uuid() }).parse(req.body ?? {});
        const result = await svc.assign(actorOf(req), id, toAdminId);
        return res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

/**
 * Hand a chat back to the queue.
 *
 * There is deliberately no "assign to a colleague" here. An Agent returns a chat and an admin
 * gives it out again; letting an Agent name the next holder would be an Agent assigning.
 */
router.post('/conversations/:id/return', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        await svc.returnToQueue(actorOf(req), id);
        return res.json({ success: true });
    } catch (err) { next(err); }
});

router.post('/conversations/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        await svc.resolve(actorOf(req), id);
        return res.json({ success: true });
    } catch (err) { next(err); }
});

export default router;
