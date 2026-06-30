import { Router } from 'express';
import { BookingsController } from '@/controllers/bookings.controller';
import { requireAuth } from '@/middleware/auth.middleware';

const router = Router();
const ctrl   = new BookingsController();

// All booking routes require auth
router.use(requireAuth);

router.get( '/',                    ctrl.list);
router.get( '/:id',                 ctrl.details);

// Saved trips
router.get( '/saved-trips',         ctrl.getSavedTrips);
router.post('/saved-trips',         ctrl.saveTrip);
router.delete('/saved-trips/:id',   ctrl.deleteSavedTrip);

// Price alerts
router.get( '/price-alerts',        ctrl.getPriceAlerts);
router.post('/price-alerts',        ctrl.createPriceAlert);
router.delete('/price-alerts/:id',  ctrl.deletePriceAlert);

export default router;
