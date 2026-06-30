import { Router } from 'express';
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

export default router;
