/**
 * Admin routes — all protected by requireAuth + requireRole('admin')
 *
 * GET /api/admin/stats    — aggregate counts and revenue
 * GET /api/admin/bookings — paginated list with optional search
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';
import { AppError } from '@/middleware/error.middleware';
import { mergeAdminBookings } from '@/lib/admin/normaliseBooking';
import { prisma } from '@/lib/prisma';

const router = Router();

// ── DELETE /api/admin/cache/hotels (dev-only, no auth required) ───────────────
router.delete('/cache/hotels', async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'production') {
        return next(); // fall through to the auth-protected version below
    }
    try {
        const city = typeof req.query.city === 'string' ? req.query.city.trim() : null;
        let deleted: number;
        if (city) {
            deleted = await prisma.$executeRaw`
                DELETE FROM hotel_search_cache
                WHERE cache_key ILIKE ${'%' + city.toLowerCase() + '%'}
            `;
        } else {
            deleted = await prisma.$executeRaw`DELETE FROM hotel_search_cache`;
        }
        return res.json({ ok: true, deleted, scope: city ?? 'all' });
    } catch (err) {
        next(err);
    }
});

// All admin routes below require a valid JWT AND the 'admin' role
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

        // Both kinds of booking, because admin previously queried `bookings` alone and
        // so could not show a flight at all — no PNR lookup, no ticket state. They live
        // in separate tables with different column names, so each is read on its own
        // terms and normalised below.
        const like = `%${search}%`;

        const [hotelRows, flightRows] = await Promise.all([
            prisma.$queryRawUnsafe<any[]>(
                search
                    ? `SELECT b.id, b.user_id, b.booking_id, b.status, b.total_price::float8 AS total_price, b.currency,
                              b.created_at, b.property_name
                         FROM bookings b
                        WHERE b.id::text ILIKE $1 OR b.user_id::text ILIKE $1
                           OR b.booking_id ILIKE $1 OR b.property_name ILIKE $1
                           OR b.holder_email ILIKE $1
                        ORDER BY b.created_at DESC LIMIT 500`
                    : `SELECT b.id, b.user_id, b.booking_id, b.status, b.total_price::float8 AS total_price, b.currency,
                              b.created_at, b.property_name
                         FROM bookings b
                        ORDER BY b.created_at DESC LIMIT 500`,
                ...(search ? [like] : []),
            ).catch(() => []),

            prisma.$queryRawUnsafe<any[]>(
                search
                    ? `SELECT f.id, f.user_id, f.pnr, f.status, f.total_price::float8 AS total_price, f.charged_price::float8 AS charged_price,
                              f.currency, f.created_at
                         FROM flight_bookings f
                        WHERE f.id::text ILIKE $1 OR f.user_id::text ILIKE $1 OR f.pnr ILIKE $1
                        ORDER BY f.created_at DESC LIMIT 500`
                    : `SELECT f.id, f.user_id, f.pnr, f.status, f.total_price::float8 AS total_price, f.charged_price::float8 AS charged_price,
                              f.currency, f.created_at
                         FROM flight_bookings f
                        ORDER BY f.created_at DESC LIMIT 500`,
                ...(search ? [like] : []),
            ).catch(() => []),
        ]);

        const merged = mergeAdminBookings(hotelRows, flightRows);

        const total      = merged.length;
        const totalPages = Math.ceil(total / PAGE_SIZE);
        const bookings   = merged.slice(skip, skip + PAGE_SIZE);

        return res.json({ bookings, total, page, totalPages });
    } catch (err) {
        next(err);
    }
});

// ── GET /api/admin/users ─────────────────────────────────────────────────────

router.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await prisma.$queryRaw<any[]>`
            SELECT id, email, first_name, last_name, role, banned_at, created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT 500
        `;

        const users = rows.map(u => ({
            id:        u.id,
            fullName:  [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email.split('@')[0],
            email:     u.email,
            role:      u.role ?? 'user',
            isBanned:  !!u.banned_at,
            createdAt: u.created_at,
        }));

        return res.json({ users, total: users.length });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/admin/users/:id/ban ────────────────────────────────────────────

router.post('/users/:id/ban', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        await prisma.users.update({
            where: { id },
            data:  { banned_at: new Date() },
        });
        return res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/admin/users/:id/unban ──────────────────────────────────────────

router.post('/users/:id/unban', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        await prisma.users.update({
            where: { id },
            data:  { banned_at: null },
        });
        return res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/admin/users/:id/promote ────────────────────────────────────────

router.post('/users/:id/promote', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { role } = req.body as { role?: string };
        const nextRole = role === 'admin' || role === 'user' ? role : 'admin';
        await prisma.users.update({
            where: { id },
            data:  { role: nextRole },
        });
        return res.json({ ok: true, role: nextRole });
    } catch (err) {
        next(err);
    }
});

// ── GET /api/admin/customers ──────────────────────────────────────────────────

router.get('/customers', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const rows = await prisma.$queryRaw<any[]>`
            SELECT
                u.id,
                u.email,
                u.first_name,
                u.last_name,
                u.banned_at,
                u.created_at,
                COUNT(b.id)::int          AS total_bookings,
                COALESCE(SUM(b.total_price), 0)::float AS total_spend,
                MAX(b.created_at)         AS last_booking
            FROM users u
            LEFT JOIN bookings b ON b.user_id = u.id
            GROUP BY u.id, u.email, u.first_name, u.last_name, u.banned_at, u.created_at
            ORDER BY total_spend DESC NULLS LAST, u.created_at DESC
            LIMIT 500
        `;

        const customers = rows.map(r => ({
            id:            r.id,
            name:          [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email.split('@')[0],
            email:         r.email,
            status:        r.banned_at ? 'banned' : 'active',
            totalBookings: Number(r.total_bookings ?? 0),
            totalSpend:    Number(r.total_spend ?? 0),
            lastBooking:   r.last_booking ?? null,
            joined:        r.created_at,
        }));

        return res.json({ customers, total: customers.length });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/admin/customers ─────────────────────────────────────────────────

router.post('/customers', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { action, userId } = req.body as { action: string; userId: string };
        if (!action || !userId) throw new AppError(400, 'action and userId are required', 'VALIDATION_ERROR');

        if (action === 'ban') {
            await prisma.users.update({ where: { id: userId }, data: { banned_at: new Date() } });
            return res.json({ success: true });
        }
        if (action === 'unban') {
            await prisma.users.update({ where: { id: userId }, data: { banned_at: null } });
            return res.json({ success: true });
        }
        if (action === 'hard_delete') {
            await prisma.users.delete({ where: { id: userId } });
            return res.json({ success: true });
        }

        throw new AppError(400, `Unknown action: ${action}`, 'VALIDATION_ERROR');
    } catch (err) {
        next(err);
    }
});

// ── GET /api/admin/deals ─────────────────────────────────────────────────────

router.get('/deals', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tab    = typeof req.query.tab    === 'string' ? req.query.tab    : 'vouchers';
        const search = typeof req.query.q      === 'string' ? req.query.q.trim() : '';
        const page   = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
        const limit  = 25;
        const offset = (page - 1) * limit;

        if (tab === 'vouchers') {
            const [items, total] = await Promise.all([
                search
                    ? prisma.$queryRaw<any[]>`SELECT * FROM vouchers WHERE code ILIKE ${'%' + search + '%'} OR description ILIKE ${'%' + search + '%'} ORDER BY valid_until DESC LIMIT ${limit} OFFSET ${offset}`
                    : prisma.$queryRaw<any[]>`SELECT * FROM vouchers ORDER BY valid_until DESC LIMIT ${limit} OFFSET ${offset}`,
                search
                    ? prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::int AS count FROM vouchers WHERE code ILIKE ${'%' + search + '%'} OR description ILIKE ${'%' + search + '%'}`
                    : prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::int AS count FROM vouchers`,
            ]);
            return res.json({ items, total: Number(total[0]?.count ?? 0), page });
        }

        if (tab === 'flight_deals') {
            const [items, total] = await Promise.all([
                search
                    ? prisma.$queryRaw<any[]>`SELECT * FROM flight_deals WHERE origin ILIKE ${'%' + search + '%'} OR destination ILIKE ${'%' + search + '%'} ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`
                    : prisma.$queryRaw<any[]>`SELECT * FROM flight_deals ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
                search
                    ? prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::int AS count FROM flight_deals WHERE origin ILIKE ${'%' + search + '%'} OR destination ILIKE ${'%' + search + '%'}`
                    : prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::int AS count FROM flight_deals`,
            ]);
            return res.json({ items, total: Number(total[0]?.count ?? 0), page });
        }

        if (tab === 'hotel_deals') {
            const [items, total] = await Promise.all([
                search
                    ? prisma.$queryRaw<any[]>`SELECT * FROM hotel_deals WHERE name ILIKE ${'%' + search + '%'} OR destination ILIKE ${'%' + search + '%'} ORDER BY updated_at DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
                    : prisma.$queryRaw<any[]>`SELECT * FROM hotel_deals ORDER BY updated_at DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`,
                search
                    ? prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::int AS count FROM hotel_deals WHERE name ILIKE ${'%' + search + '%'} OR destination ILIKE ${'%' + search + '%'}`
                    : prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::int AS count FROM hotel_deals`,
            ]);
            return res.json({ items, total: Number(total[0]?.count ?? 0), page });
        }

        throw new AppError(400, `Unknown tab: ${tab}`, 'VALIDATION_ERROR');
    } catch (err) {
        next(err);
    }
});

// ── POST /api/admin/deals ─────────────────────────────────────────────────────

router.post('/deals', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { action, id, ...body } = req.body as any;
        if (!action) throw new AppError(400, 'action is required', 'VALIDATION_ERROR');

        if (action === 'create_voucher') {
            const row = await prisma.vouchers.create({
                data: {
                    code:               String(body.code).toUpperCase().trim(),
                    description:        body.description ?? '',
                    discount_type:      body.discount_type ?? 'percent',
                    discount_value:     Number(body.discount_value),
                    min_booking_amount: body.min_booking_amount ? Number(body.min_booking_amount) : null,
                    usage_limit:        body.usage_limit ? Number(body.usage_limit) : null,
                    valid_until:        new Date(body.valid_until),
                    active:             true,
                },
            });
            return res.json({ success: true, item: row });
        }

        if (action === 'toggle_voucher') {
            if (!id) throw new AppError(400, 'id is required', 'VALIDATION_ERROR');
            const current = await prisma.vouchers.findUnique({ where: { id }, select: { active: true } });
            if (!current) throw new AppError(404, 'Voucher not found', 'NOT_FOUND');
            await prisma.vouchers.update({ where: { id }, data: { active: !current.active } });
            return res.json({ success: true, active: !current.active });
        }

        if (action === 'delete_voucher') {
            if (!id) throw new AppError(400, 'id is required', 'VALIDATION_ERROR');
            await prisma.vouchers.delete({ where: { id } });
            return res.json({ success: true });
        }

        throw new AppError(400, `Unknown action: ${action}`, 'VALIDATION_ERROR');
    } catch (err) {
        next(err);
    }
});

// ── DELETE /api/admin/cache/hotels ───────────────────────────────────────────

router.delete('/cache/hotels', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const city = typeof req.query.city === 'string' ? req.query.city.trim() : null;
        let deleted: number;

        if (city) {
            const rows = await prisma.$executeRaw`
                DELETE FROM hotel_search_cache
                WHERE cache_key ILIKE ${'%' + city.toLowerCase() + '%'}
            `;
            deleted = rows;
        } else {
            const rows = await prisma.$executeRaw`DELETE FROM hotel_search_cache`;
            deleted = rows;
        }

        return res.json({ ok: true, deleted, scope: city ?? 'all' });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/admin/communication/send ───────────────────────────────────────
// Send an email blast to all users, or to a single user when userId is provided.

router.post('/communication/send', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { subject, body: htmlBody, userId } = req.body as {
            subject: string;
            body: string;
            userId?: string;
        };

        if (!subject?.trim()) throw new AppError(400, 'subject is required', 'VALIDATION_ERROR');
        if (!htmlBody?.trim()) throw new AppError(400, 'body is required', 'VALIDATION_ERROR');

        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) throw new AppError(503, 'Email service not configured', 'SERVICE_UNAVAILABLE');

        let recipients: string[] = [];
        if (userId) {
            const user = await prisma.$queryRaw<{ email: string }[]>`SELECT email FROM users WHERE id = ${userId}::uuid LIMIT 1`;
            if (!user.length) throw new AppError(404, 'User not found', 'NOT_FOUND');
            recipients = [user[0].email];
        } else {
            // Fetch all non-banned user emails
            const rows = await prisma.$queryRaw<{ email: string }[]>`
                SELECT email FROM users WHERE banned_at IS NULL ORDER BY created_at DESC LIMIT 2000
            `;
            recipients = rows.map(r => r.email).filter(Boolean);
        }

        if (!recipients.length) return res.json({ ok: true, sent: 0, message: 'No recipients' });

        // Send in batches of 50 (Resend batch limit)
        const BATCH = 50;
        let sent = 0;
        const errors: string[] = [];

        for (let i = 0; i < recipients.length; i += BATCH) {
            const batch = recipients.slice(i, i + BATCH);
            const emailRes = await fetch('https://api.resend.com/emails/batch', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(
                    batch.map(to => ({
                        from:    'CheapestGo <no-reply@mail.cheapestgo.com>',
                        to:      [to],
                        subject,
                        html:    htmlBody,
                    }))
                ),
            });

            if (emailRes.ok) {
                sent += batch.length;
            } else {
                const errText = await emailRes.text().catch(() => '');
                errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${errText.slice(0, 200)}`);
            }
        }

        return res.json({ ok: true, sent, total: recipients.length, errors: errors.length ? errors : undefined });
    } catch (err) {
        next(err);
    }
});

export default router;
