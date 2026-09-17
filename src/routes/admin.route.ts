/**
 * Admin routes — all protected by requireAuth + requireRole('admin')
 *
 * GET /api/admin/stats    — aggregate counts and revenue
 * GET /api/admin/bookings — paginated list with optional search
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';
import { adminContentService } from '@/services/adminContent.service';
import { adminSettingsService } from '@/services/adminSettings.service';
import { adminStripeService } from '@/services/adminStripe.service';
import { adminRevenueService } from '@/services/adminRevenue.service';
import { adminMobileService } from '@/services/adminMobile.service';
import { AppError } from '@/middleware/error.middleware';
import { mergeAdminBookings } from '@/lib/admin/normaliseBooking';
import { prisma } from '@/lib/prisma';
import { validateRoleChange } from '@/lib/auth/roleChange';
import { roleLabel } from '@/lib/auth/roles';
import { logAdminAction } from '@/lib/admin/audit';
import { createNotification } from '@/lib/admin/notify';

const router = Router();

// All admin routes below require a valid JWT AND the 'admin' role
router.use(requireAuth, requireRole('admin'));

/** The legs of a flight booking, oldest first, as JSON on the booking row. */
const SEGMENTS_SUBQUERY = `(
    SELECT COALESCE(json_agg(json_build_object(
        'airline', s.airline, 'flight_number', s.flight_number,
        'origin', s.origin, 'destination', s.destination, 'departure', s.departure
    ) ORDER BY s.departure), '[]'::json)
    FROM flight_segments s WHERE s.booking_id = f.id
) AS segments`;

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
                              b.created_at, b.property_name, b.room_name, b.check_in, b.check_out
                         FROM bookings b
                        WHERE b.id::text ILIKE $1 OR b.user_id::text ILIKE $1
                           OR b.booking_id ILIKE $1 OR b.property_name ILIKE $1
                           OR b.holder_email ILIKE $1
                        ORDER BY b.created_at DESC LIMIT 500`
                    : `SELECT b.id, b.user_id, b.booking_id, b.status, b.total_price::float8 AS total_price, b.currency,
                              b.created_at, b.property_name, b.room_name, b.check_in, b.check_out
                         FROM bookings b
                        ORDER BY b.created_at DESC LIMIT 500`,
                ...(search ? [like] : []),
            ).catch(() => []),

            prisma.$queryRawUnsafe<any[]>(
                search
                    // The segments ride along so the list can name the journey rather than
                    // print a PNR. Aggregated in the same query: 500 bookings would otherwise
                    // be 500 follow-up reads to fill one column.
                    ? `SELECT f.id, f.user_id, f.pnr, f.status, f.total_price::float8 AS total_price, f.charged_price::float8 AS charged_price,
                              f.currency, f.created_at, ${SEGMENTS_SUBQUERY}
                         FROM flight_bookings f
                        WHERE f.id::text ILIKE $1 OR f.user_id::text ILIKE $1 OR f.pnr ILIKE $1
                        ORDER BY f.created_at DESC LIMIT 500`
                    : `SELECT f.id, f.user_id, f.pnr, f.status, f.total_price::float8 AS total_price, f.charged_price::float8 AS charged_price,
                              f.currency, f.created_at, ${SEGMENTS_SUBQUERY}
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

/**
 * Change an account's role.
 *
 * The rule lives in `validateRoleChange` so it can be read and tested without a session.
 * This route used to coerce instead of validate — `role === 'admin' || role === 'user' ?
 * role : 'admin'` — so any value it did not recognise granted administrator, a typo
 * included. It also let an admin demote themselves, which locks them out of the console
 * with nothing left that can let them back in.
 *
 * Recorded either way: who changed whose role, and to what.
 */
router.post('/users/:id/promote', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const actor = req.user!;
        const change = validateRoleChange({
            actorId:  actor.sub,
            targetId: req.params.id,
            newRole:  (req.body as { role?: unknown })?.role,
        });
        if (!change.ok) {
            throw new AppError(400, change.error, 'VALIDATION_ERROR');
        }

        await prisma.users.update({
            where: { id: change.targetId },
            data:  { role: change.newRole },
        });

        void logAdminAction({
            action:     'promote_user',
            adminId:    actor.sub,
            adminEmail: actor.email,
            targetId:   change.targetId,
            details:    { newRole: change.newRole },
        });

        await createNotification(
            'User role changed',
            // Named rather than "promoted" or "demoted": which of the two it is depends
            // on where the account started, and the log should not guess.
            `User ${change.targetId} is now ${roleLabel(change.newRole)} (changed by ${actor.email}).`,
        );

        return res.json({ ok: true, role: change.newRole });
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

// ── GET /api/admin/revenue ───────────────────────────────────────────────────
// What each booking earned and what it cost to take. app-v2's revenue screen has been
// calling this since it was written; it did not exist until now.
router.get('/revenue', async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await adminRevenueService.read({ page: req.query.page, pageSize: req.query.pageSize })); }
    catch (err) { next(err); }
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

// ─── C5: the list-and-edit screens, ported from v1 ────────────────────────────
//
// Routing only. Every rule below lives in AdminContentService and every write in
// AdminContentRepository (Layer Contract) — which is the shape the rest of this file is being
// moved towards, slice by slice.

router.get('/destinations', async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, ...(await adminContentService.listDestinations(req.query)) }); }
    catch (err) { next(err); }
});

router.post('/destinations', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const body = req.body ?? {};
        switch (body.action) {
            case 'create':
                return res.status(201).json({ success: true, data: await adminContentService.createDestination(body) });
            case 'update':
                return res.json({ success: true, data: await adminContentService.updateDestination(body) });
            case 'delete':
                return res.json({ success: true, ...(await adminContentService.deleteDestinations(body)) });
            default:
                return res.status(400).json({ success: false, error: `Unknown action: ${body.action}` });
        }
    } catch (err) { next(err); }
});

router.get('/saved-trips', async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, ...(await adminContentService.listSavedTrips(req.query)) }); }
    catch (err) { next(err); }
});

router.post('/saved-trips', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const body = req.body ?? {};
        if (body.action !== 'delete') {
            return res.status(400).json({ success: false, error: `Unknown action: ${body.action}` });
        }
        res.json({ success: true, ...(await adminContentService.deleteSavedTrips(body)) });
    } catch (err) { next(err); }
});

router.get('/price-alerts', async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, ...(await adminContentService.listPriceAlerts(req.query)) }); }
    catch (err) { next(err); }
});

router.post('/price-alerts', async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, ...(await adminContentService.actOnPriceAlerts(req.body ?? {})) }); }
    catch (err) { next(err); }
});

router.get('/notifications', async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await adminContentService.listNotifications()); }
    catch (err) { next(err); }
});

router.post('/notifications', async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await adminContentService.actOnNotifications(req.body ?? {})); }
    catch (err) { next(err); }
});

// ─── C5: settings, search, brand view and supplier health ────────────────────

router.get('/settings', async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, settings: await adminSettingsService.getSettings() }); }
    catch (err) { next(err); }
});

router.post('/settings', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await adminSettingsService.saveSettings(req.body?.settings);
        await adminSettingsService.logAction({
            action: 'update_settings',
            adminId: req.user?.sub,
            adminEmail: req.user?.email,
            details: { keys: Object.keys(req.body?.settings ?? {}) },
        });
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
});

router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await adminSettingsService.search(String(req.query.q ?? ''))); }
    catch (err) { next(err); }
});

router.get('/tgx-health', async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await adminSettingsService.travelgateHealth()); }
    catch (err) { next(err); }
});

/**
 * POST /api/v2/admin/brand  { brand }
 *
 * Which brand's data the back office is looking at. The queue and the booking lists are
 * deliberately blind to brand (ADR-0030); everything else is filtered by this.
 *
 * "GeomeeGo" is accepted alongside "AirangGo", its name until the 2026-09 rebrand: an admin page
 * loaded before the rename can still send the old value, and refusing it would fail the switch
 * with no explanation.
 */
const ADMIN_BRANDS = ['CheapestGo', 'AirangGo', 'GeomeeGo', 'all'];

router.post('/brand', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const brand = String(req.body?.brand ?? '');
        if (!ADMIN_BRANDS.includes(brand)) {
            return res.status(400).json({ success: false, error: 'Invalid brand' });
        }
        // Readable by the admin screens, which show which brand is active — it selects a view,
        // it grants nothing, and every endpoint behind it still checks the caller's role.
        res.cookie('admin_brand_view', brand, {
            path:     '/',
            httpOnly: false,
            sameSite: 'lax',
            maxAge:   30 * 24 * 60 * 60 * 1000,
        });
        res.json({ success: true, brand });
    } catch (err) { next(err); }
});

/**
 * POST /api/v2/admin/run-cron  { cron }
 *
 * Runs one scheduled job now, from the back office (C5, ported from v1). Useful when a nightly
 * job failed and nobody wants to wait until tomorrow to find out whether the fix worked.
 *
 * An allowlist rather than a free-form name: this endpoint turns an admin session into the
 * authority to call any cron, and a cron is a supplier account. The list is also the honest
 * inventory of what an admin may trigger — jobs that cost money per call are absent from it.
 *
 * Called over HTTP against this same process rather than by importing the handler, so the job
 * runs through its own auth, rate limit and error handling exactly as the scheduler runs it.
 */
const RUNNABLE_CRONS = new Set([
    'cache-cleanup',
    'check-price-alerts',
    'cleanup-sessions',
    'cleanup-orphaned-duffel-orders',
    'etg-reviews-sync',
    'fill-dest-cache',
    'geocode-hotels',
    // Both read-only reporters — they notify and stop, never repair, so running one by hand
    // is safe and is often exactly what is wanted after a suspected discrepancy.
    'hotel-reconciliation',
    'otv-credit-check',
    'platform-cost-reconciliation',
    'poll-pending-tickets',
    'refresh-hotel-content',
    'refresh-popular-flights',
    'seed-room-groups',
    'sync-dest-cache',
    'sync-flight-deals',
]);

router.post('/run-cron', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cron = String(req.body?.cron ?? '');
        if (!RUNNABLE_CRONS.has(cron)) {
            return res.status(400).json({ success: false, error: 'Unknown cron job' });
        }

        const secret = process.env.CRON_SECRET;
        if (!secret) {
            return res.status(500).json({ success: false, error: 'CRON_SECRET not configured on this environment' });
        }

        const base = `${req.protocol}://${req.get('host')}`;
        const started = Date.now();
        const result = await fetch(`${base}/api/v2/cron/${cron}`, {
            headers: { Authorization: `Bearer ${secret}` },
            // Long-running by design: a catalog job is minutes, not seconds.
            signal: AbortSignal.timeout(290_000),
        });
        const body = await result.json().catch(() => ({}));

        await adminSettingsService.logAction({
            action: 'run_cron',
            adminId: req.user?.sub,
            adminEmail: req.user?.email,
            targetId: cron,
            details: { status: result.status, ms: Date.now() - started },
        });

        res.status(result.ok ? 200 : 502).json({
            success: result.ok,
            cron,
            ms: Date.now() - started,
            result: body,
        });
    } catch (err) { next(err); }
});

/**
 * GET  /api/v2/admin/stripe          what the processor holds and has done lately
 * POST /api/v2/admin/stripe          { bookingId, reason? } — refund that booking in full
 *
 * Ported from v1 (C5). The refund is the one action in the back office that moves money out, so
 * it is logged with the admin who asked for it, and an already-refunded charge is reported
 * rather than refunded again.
 */
router.get('/stripe', async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ success: true, ...(await adminStripeService.overview()) }); }
    catch (err) { next(err); }
});

router.post('/stripe', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const bookingId = String(req.body?.bookingId ?? '');
        const reason = req.body?.reason === 'duplicate' || req.body?.reason === 'fraudulent'
            ? req.body.reason
            : 'requested_by_customer';

        const result = await adminStripeService.refundBooking(bookingId, reason);
        await adminSettingsService.logAction({
            action: result.alreadyRefunded ? 'refund_skipped_already_refunded' : 'refund_booking',
            adminId: req.user?.sub,
            adminEmail: req.user?.email,
            targetId: bookingId,
            details: result as Record<string, unknown>,
        });

        res.json({ success: true, ...result });
    } catch (err) { next(err); }
});

/**
 * The mobile app's operations screen (C5, ported from v1's /api/admin/mobile).
 *
 *   GET  /admin/mobile              bookings, devices, and whether a key is configured
 *   POST /admin/mobile              { action: 'rotateKey' | 'deleteDevice', id? }
 */
router.get('/mobile', async (req, res, next) => {
    try { res.json({ success: true, ...(await adminMobileService.overview(req.query.page)) }); }
    catch (err) { next(err); }
});

router.post('/mobile', async (req, res, next) => {
    try {
        const body = req.body ?? {};
        if (body.action === 'rotateKey') {
            const result = await adminMobileService.rotateApiKey({ id: req.user?.sub, email: req.user?.email });
            return res.json({ success: true, ...result });
        }
        if (body.action === 'deleteDevice') {
            return res.json({ success: true, ...(await adminMobileService.deleteDevice(body.id)) });
        }
        return res.status(400).json({ success: false, error: `Unknown action: ${body.action}` });
    } catch (err) { next(err); }
});

export default router;
