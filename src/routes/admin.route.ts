/**
 * Admin routes — all protected by requireAuth + requireRole('admin')
 *
 * GET /api/admin/stats    — aggregate counts and revenue
 * GET /api/admin/bookings — paginated list with optional search
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';
import { AppError } from '@/middleware/error.middleware';
import { prisma } from '@/lib/prisma';

const router = Router();

// All admin routes require a valid JWT AND the 'admin' role
router.use(requireAuth, requireRole('admin'));

const PAGE_SIZE = 20;

// ── GET /api/admin/stats ──────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [bookingCount, revenueAgg, userCount] = await Promise.all([
            (prisma as any).bookings.count().catch(async () => {
                const rows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::int AS count FROM bookings`;
                return Number(rows[0]?.count ?? 0);
            }),

            (prisma as any).bookings.aggregate({
                _sum:  { total_price: true },
                where: { status: 'confirmed' },
            }).catch(async () => {
                const rows = await prisma.$queryRaw<{ total: string | null }[]>`
                    SELECT SUM(total_price)::text AS total
                    FROM bookings
                    WHERE status = 'confirmed'
                `;
                return { _sum: { total_price: rows[0]?.total ? Number(rows[0].total) : null } };
            }),

            (prisma as any).users.count().catch(async () => {
                const rows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::int AS count FROM users`;
                return Number(rows[0]?.count ?? 0);
            }),
        ]);

        return res.json({
            bookingCount,
            revenue:   revenueAgg._sum?.total_price ?? 0,
            userCount,
        });
    } catch (err) {
        next(err);
    }
});

// ── GET /api/admin/bookings ───────────────────────────────────────────────────

router.get('/bookings', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page   = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
        const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const skip   = (page - 1) * PAGE_SIZE;

        // Build a where clause that searches booking ID or user ID
        const where = search
            ? {
                OR: [
                    { id:      { contains: search } },
                    { user_id: { contains: search } },
                ],
            }
            : {};

        const [bookings, total] = await Promise.all([
            (prisma as any).bookings.findMany({
                where,
                skip,
                take:    PAGE_SIZE,
                orderBy: { created_at: 'desc' },
                include: {
                    users: {
                        select: { id: true, email: true, first_name: true, last_name: true },
                    },
                },
            }).catch(async () => {
                // Raw fallback if model not in generated types
                if (search) {
                    return prisma.$queryRaw<any[]>`
                        SELECT b.*, u.email, u.first_name, u.last_name
                        FROM bookings b
                        LEFT JOIN users u ON u.id = b.user_id
                        WHERE b.id ILIKE ${'%' + search + '%'}
                           OR b.user_id ILIKE ${'%' + search + '%'}
                        ORDER BY b.created_at DESC
                        LIMIT ${PAGE_SIZE} OFFSET ${skip}
                    `;
                }
                return prisma.$queryRaw<any[]>`
                    SELECT b.*, u.email, u.first_name, u.last_name
                    FROM bookings b
                    LEFT JOIN users u ON u.id = b.user_id
                    ORDER BY b.created_at DESC
                    LIMIT ${PAGE_SIZE} OFFSET ${skip}
                `;
            }),

            (prisma as any).bookings.count({ where }).catch(async () => {
                if (search) {
                    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
                        SELECT COUNT(*)::int AS count FROM bookings
                        WHERE id ILIKE ${'%' + search + '%'}
                           OR user_id ILIKE ${'%' + search + '%'}
                    `;
                    return Number(rows[0]?.count ?? 0);
                }
                const rows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::int AS count FROM bookings`;
                return Number(rows[0]?.count ?? 0);
            }),
        ]);

        const totalPages = Math.ceil(total / PAGE_SIZE);

        if (page > totalPages && totalPages > 0) {
            throw new AppError(400, 'Page out of range', 'VALIDATION_ERROR');
        }

        return res.json({ bookings, total, page, totalPages });
    } catch (err) {
        next(err);
    }
});

export default router;
