import { Router } from 'express';
import { HotelsController } from '@/controllers/hotels.controller';
import { requireAuth } from '@/middleware/auth.middleware';

const router = Router();
const ctrl   = new HotelsController();

// Public
router.post('/search',          ctrl.search);
router.get( '/property/:id',    ctrl.property);
router.get( '/deals',           ctrl.deals);
router.post('/autocomplete',    ctrl.autocomplete);
router.get( '/place-details',   ctrl.placeDetails);
router.get( '/geocode',         ctrl.geocode);
router.post('/prebook',         ctrl.preBook);

// Auth-protected
router.post('/create-payment',  requireAuth, ctrl.createPayment);
router.post('/confirm',         requireAuth, ctrl.confirmBooking);
router.post('/cancel',          requireAuth, ctrl.cancelBooking);

export default router;
