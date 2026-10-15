import { Router } from 'express';
import { BookingsController } from '@/controllers/bookings.controller';
import { requireAuth } from '@/middleware/auth.middleware';

const router = Router();
const ctrl = new BookingsController();

// All booking routes require auth
router.use(requireAuth);

router.get('/', ctrl.list);

// ── POST /amend ───────────────────────────────────────────────────────────────
// Contact details and special requests on a hotel booking. Local only — see
// BookingsService.amend.
router.post('/amend', ctrl.amend);

// A traveller forwarding their own confirmation to whoever they are travelling with.
router.post('/:id/share', ctrl.share);

// Saved trips
router.get( '/saved-trips',         ctrl.getSavedTrips);
router.post('/saved-trips',         ctrl.saveTrip);
router.delete('/saved-trips/:id',   ctrl.deleteSavedTrip);

// Price alerts
router.get( '/price-alerts',        ctrl.getPriceAlerts);
router.post('/price-alerts',        ctrl.createPriceAlert);
router.delete('/price-alerts/:id',  ctrl.deletePriceAlert);

// Last, and for a reason: `/:id` matches any single segment, so declared above the two blocks
// before it, it answered `GET /saved-trips` and `GET /price-alerts` as a booking lookup for an
// id of "saved-trips" — a 404 for every client that used them.
router.get('/:id', ctrl.details);

export default router;
