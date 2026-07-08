import { Router, Request, Response } from 'express';
import { FlightsController } from '@/controllers/flights.controller';
import { requireAuth } from '@/middleware/auth.middleware';

const router = Router();
const ctrl   = new FlightsController();

router.post('/search',          ctrl.search);
router.post('/bags',            ctrl.bags);
router.post('/seat-map',        ctrl.seatMap);
router.post('/fare-rules',      ctrl.fareRules);
router.post('/offer-refresh',   ctrl.offerRefresh);
router.get( '/price-calendar',  ctrl.priceCalendar);

// Auth-protected
router.post('/book',            requireAuth, ctrl.book);
router.post('/confirm',         requireAuth, ctrl.confirm);
router.get( '/booking-status',  requireAuth, ctrl.bookingStatus);
router.post('/cancel-quote',    requireAuth, ctrl.cancelQuote);
router.post('/cancel-booking',  requireAuth, ctrl.cancelBooking);

// ── Mystifly-only actions (stubs until live Mystifly key is active) ───────────
// All return 503 so the frontend can display a clear "not available" message
// rather than a cryptic error.

const mystiflyNotLive = (_req: Request, res: Response) =>
    res.status(503).json({ error: 'Mystifly operations not yet available', code: 'MYSTIFLY_NOT_LIVE' });

router.post('/mystifly/void-quote',  requireAuth, mystiflyNotLive);
router.post('/mystifly/void',        requireAuth, mystiflyNotLive);
router.post('/mystifly/reissue',     requireAuth, mystiflyNotLive);
router.post('/mystifly/refund',      requireAuth, mystiflyNotLive);

export default router;
