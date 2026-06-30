import { Router, Request, Response, NextFunction } from 'express';
import { config } from '@/config';

const router = Router();

/**
 * Simple bearer-token guard for all cron endpoints.
 * The scheduler (Vercel Cron, GitHub Actions, etc.) must pass:
 *   Authorization: Bearer <CRON_SECRET>
 */
function requireCronSecret(req: Request, res: Response, next: NextFunction) {
    const cronSecret = config.CRON_SECRET;
    const authHeader = req.headers.authorization;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

router.use(requireCronSecret);

/**
 * GET /api/cron/check-price-alerts
 * Schedule: daily (e.g. 0 8 * * *)
 *
 * Iterates active price alerts and emails users when fares drop.
 * TODO: implement logic using prisma.price_alerts + Duffel flight search.
 */
router.get('/check-price-alerts', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('[cron/check-price-alerts] not yet implemented');
        return res.json({ ok: true, message: 'not yet implemented' });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/cron/sync-hotel-deals
 * Schedule: daily at 05:00 UTC (0 5 * * *)
 *
 * Refreshes hotel_deals table with current pricing from hotel providers.
 * TODO: implement logic using TravelgateX / ONDA / RateHawk search.
 */
router.get('/sync-hotel-deals', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('[cron/sync-hotel-deals] not yet implemented');
        return res.json({ ok: true, message: 'not yet implemented' });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/cron/cleanup-sessions
 * Schedule: daily at 04:00 UTC (0 4 * * *)
 *
 * Deletes expired sessions and password reset tokens from the database.
 * TODO: implement using prisma.$executeRaw for bulk deletes.
 */
router.get('/cleanup-sessions', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('[cron/cleanup-sessions] not yet implemented');
        return res.json({ ok: true, message: 'not yet implemented' });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/cron/sync-flight-deals
 * Schedule: every 6 hours (0 *\/6 * * *)
 *
 * Searches Duffel for cheapest fares on popular routes and upserts flight_deals.
 * TODO: implement using Duffel partial search + prisma.flight_deals upsert.
 */
router.get('/sync-flight-deals', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('[cron/sync-flight-deals] not yet implemented');
        return res.json({ ok: true, message: 'not yet implemented' });
    } catch (err) {
        next(err);
    }
});

export default router;
