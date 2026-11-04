import { Router } from 'express';
import { optionalAuth, requireAuth } from '@/middleware/auth.middleware';
import { golfBookingRateLimit } from '@/middleware/rate-limit.middleware';
import { GolfController } from '@/controllers/golf.controller';
import { GolfBookingsController } from '@/controllers/golfBookings.controller';

/**
 * The storefront's golf: the catalogue (CONTEXT.md, "Golf Course"), which needs no session and shows
 * published courses only, and bookings ("Golf Booking"), which are a signed-in customer's own. Covered
 * by the app-wide defaultRateLimit.
 */
const router: Router = Router();
const golf = new GolfController();
const bookings = new GolfBookingsController();

router.get('/courses',                 golf.list);
router.get('/courses/:slug',           golf.get);
router.get('/courses/:slug/tee-times', golf.teeTimesOnDay);

// Open to anyone, like the prices on the course page; a session only counts the caller's own hold.
router.get('/tee-times/:id/quote',  optionalAuth, bookings.quote);
router.post('/bookings',            requireAuth, golfBookingRateLimit, bookings.start);
router.get('/bookings',             requireAuth, bookings.list);
router.get('/bookings/:reference',  requireAuth, bookings.get);
router.post('/bookings/:reference/cancel', requireAuth, golfBookingRateLimit, bookings.cancel);

export default router;
