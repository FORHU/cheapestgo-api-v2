import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';
import { prisma } from '@/lib/prisma';

/**
 * The reading end of #118. Filtered, paginated, and nothing here ever writes — the "nothing
 * in the application can modify or delete a record" requirement is partly this file simply
 * having no PUT/PATCH/DELETE, and partly the table itself (see the migration).
 *
 * `requireRole('admin')` is standing in for an `audit_logs.view` permission check (#139 — the
 * table and the middleware exist on #106's branch, not merged here), the same stand-in
 * `staff-invitations.route.ts` already uses for the same reason.
 */
const router: Router = Router();
router.use(requireAuth, requireRole('admin'));

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const listQuery = z.object({
    /** A name, an email fragment, or an exact admin id — whichever the box was given. */
    staff:    z.string().trim().min(1).max(200).optional(),
    action:   z.string().trim().min(1).max(80).optional(),
    /** `target_id` — the one thing this table calls a resource today. */
    resource: z.string().trim().min(1).max(120).optional(),
    from:     z.string().datetime().optional(),
    to:       z.string().datetime().optional(),
    page:     z.coerce.number().int().min(1).optional(),
    limit:    z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).optional(),
});

/** api-v2's own naming (snake_case columns) stays off the wire; the console reads camelCase. */
const toView = (row: {
    id: string; action: string; admin_id: string | null; admin_email: string | null;
    actor_role: string | null; target_id: string | null; reason: string | null;
    ip: string | null; user_agent: string | null; correlation_id: string | null;
    previous_value: unknown; new_value: unknown; details: unknown; created_at: Date;
}) => ({
    id:            row.id,
    action:        row.action,
    adminId:       row.admin_id,
    adminEmail:    row.admin_email,
    actorRole:     row.actor_role,
    targetId:      row.target_id,
    reason:        row.reason,
    ip:            row.ip,
    userAgent:     row.user_agent,
    correlationId: row.correlation_id,
    previousValue: row.previous_value,
    newValue:      row.new_value,
    details:       row.details,
    createdAt:     row.created_at.toISOString(),
});

/** GET /api/v2/admin/audit-logs — filtered by staff, action, resource and date (#118's own "done when"). */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const q = listQuery.parse(req.query);
        const limit = q.limit ?? PAGE_SIZE_DEFAULT;
        const page  = q.page  ?? 1;

        const where: Record<string, unknown> = {};
        if (q.staff) {
            where.OR = [
                { admin_email: { contains: q.staff, mode: 'insensitive' } },
                ...(isUuid(q.staff) ? [{ admin_id: q.staff }] : []),
            ];
        }
        if (q.action)   where.action    = q.action;
        if (q.resource) where.target_id = q.resource;
        if (q.from || q.to) {
            where.created_at = {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to   ? { lte: new Date(q.to) }   : {}),
            };
        }

        const [rows, total] = await Promise.all([
            prisma.admin_audit_log.findMany({
                where, orderBy: { created_at: 'desc' },
                take: limit, skip: (page - 1) * limit,
            }),
            prisma.admin_audit_log.count({ where }),
        ]);

        res.json({ success: true, total, page, items: rows.map(toView) });
    } catch (err) { next(err); }
});

export default router;
