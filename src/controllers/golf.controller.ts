import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@/middleware/error.middleware';
import { logAdminAction } from '@/lib/admin/audit';
import { GOLF_COURSE_STATUSES, golfCourseInputSchema } from '@/lib/golf/courseInput';
import { scheduleInputSchema } from '@/lib/golf/scheduleInput';
import { isIsoDate } from '@/lib/golf/time';
import { DEFAULT_PLAYERS } from '@/lib/golf/rules';
import { SlugTakenError } from '@/repositories/golf.repository';
import { GolfService } from '@/services/golf.service';
import { GolfTeeTimesService } from '@/services/golfTeeTimes.service';

/**
 * The golf catalogue over HTTP. Bodies are parsed here with the course schema rather than by the
 * `validate()` middleware, which checks a body but throws the parsed (trimmed, defaulted) value away.
 */

/** What the storefront sends. A malformed value is ignored rather than refused: it only narrows. */
const storefrontQuery = z.object({
    country:  z.string().trim().min(1).max(100).optional().catch(undefined),
    currency: z.string().trim().max(3).optional().catch(undefined),
});

const statusBody = z.object({ status: z.enum(GOLF_COURSE_STATUSES) });

/** The picker's query. A party size outside 1–4 reads as the default rather than being refused. */
const teeTimesQuery = z.object({
    date:     z.string().trim().optional().catch(undefined),
    players:  z.coerce.number().int().min(1).max(4).catch(DEFAULT_PLAYERS).default(DEFAULT_PLAYERS),
    currency: z.string().trim().max(3).optional().catch(undefined),
});

const notFound = () => new AppError(404, 'Golf course not found', 'NOT_FOUND');

/** A taken slug is a mistake in one field, so it is reported against that field. */
function asHttp(err: unknown): unknown {
    if (err instanceof SlugTakenError) {
        return new AppError(409, err.message, 'SLUG_TAKEN', { details: { slug: [err.message] } });
    }
    return err;
}

/** Never awaited and never throws: an action must not fail because its audit row did. */
function audit(req: Request, action: string, targetId: string, details?: Record<string, unknown>) {
    void logAdminAction({ action, adminId: req.user!.sub, adminEmail: req.user!.email, targetId, details });
}

export class GolfController {
    constructor(
        private readonly svc = new GolfService(),
        private readonly teeTimes = new GolfTeeTimesService(),
    ) {}

    teeTimesOnDay = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { date, players, currency } = teeTimesQuery.parse(req.query);
            if (date !== undefined && !isIsoDate(date)) {
                throw new AppError(422, 'Invalid request data', 'VALIDATION_ERROR', { details: { date: ['A date like 2026-11-15'] } });
            }
            const day = await this.teeTimes.availability(req.params.slug, { date, players, currency });
            if (!day) throw notFound();
            res.json({ success: true, data: day });
        } catch (err) { next(err); }
    };

    adminListSchedules = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const schedules = await this.teeTimes.listSchedules(req.params.id);
            if (!schedules) throw notFound();
            res.json({ success: true, data: schedules });
        } catch (err) { next(err); }
    };

    adminAddSchedule = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const added = await this.teeTimes.addSchedule(req.params.id, scheduleInputSchema.parse(req.body ?? {}));
            if (!added) throw notFound();
            audit(req, 'golf_schedule_create', added.schedule.id, { courseId: req.params.id, created: added.created });
            res.status(201).json({ success: true, data: added });
        } catch (err) { next(err); }
    };

    adminRemoveSchedule = async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!(await this.teeTimes.removeSchedule(req.params.id, req.params.scheduleId))) throw notFound();
            audit(req, 'golf_schedule_delete', req.params.scheduleId, { courseId: req.params.id });
            res.json({ success: true });
        } catch (err) { next(err); }
    };

    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { country, currency } = storefrontQuery.parse(req.query);
            res.json({ success: true, data: await this.svc.listPublished({ country, currency }) });
        } catch (err) { next(err); }
    };

    get = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { currency } = storefrontQuery.parse(req.query);
            const course = await this.svc.getPublished(req.params.slug, currency);
            if (!course) throw notFound();
            res.json({ success: true, data: course });
        } catch (err) { next(err); }
    };

    adminList = async (req: Request, res: Response, next: NextFunction) => {
        try { res.json({ success: true, ...(await this.svc.listForAdmin(req.query)) }); }
        catch (err) { next(err); }
    };

    adminCreate = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const course = await this.svc.create(golfCourseInputSchema.parse(req.body ?? {}));
            audit(req, 'golf_course_create', course.id, { slug: course.slug });
            res.status(201).json({ success: true, data: course });
        } catch (err) { next(asHttp(err)); }
    };

    adminUpdate = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const course = await this.svc.update(req.params.id, golfCourseInputSchema.parse(req.body ?? {}));
            if (!course) throw notFound();
            audit(req, 'golf_course_update', course.id, { slug: course.slug });
            res.json({ success: true, data: course });
        } catch (err) { next(asHttp(err)); }
    };

    adminSetStatus = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { status } = statusBody.parse(req.body ?? {});
            const course = await this.svc.setStatus(req.params.id, status);
            if (!course) throw notFound();
            audit(req, status === 'published' ? 'golf_course_publish' : 'golf_course_unpublish', course.id, { slug: course.slug });
            res.json({ success: true, data: course });
        } catch (err) { next(err); }
    };

    // 200 with a body rather than 204: app-v2's http client parses every response.
    adminDelete = async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!(await this.svc.delete(req.params.id))) throw notFound();
            audit(req, 'golf_course_delete', req.params.id);
            res.json({ success: true });
        } catch (err) { next(err); }
    };
}
