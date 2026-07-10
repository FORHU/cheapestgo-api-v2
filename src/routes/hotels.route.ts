import { Router } from 'express';
import { HotelsController } from '@/controllers/hotels.controller';
import { requireAuth } from '@/middleware/auth.middleware';

const router = Router();
const ctrl   = new HotelsController();

// Public
router.post('/search',                  ctrl.search);
router.post('/search/stream',           ctrl.searchStream);
router.get( '/property/:id',            ctrl.property);
router.get( '/deals',                   ctrl.deals);
router.post('/autocomplete',            ctrl.autocomplete);
router.post('/autocomplete/resolve',    ctrl.resolveDestination);
router.get( '/place-details',           ctrl.placeDetails);
router.get( '/geocode',                 ctrl.geocode);
router.post('/prebook',                 ctrl.preBook);
router.get( '/amenities',               ctrl.amenitiesByDestination);
router.get( '/amenities/by-ids',        ctrl.amenitiesByHotelIds);
router.get( '/nearby',                  ctrl.nearbyPlaces);

// Auth-protected
router.post('/create-payment',  requireAuth, ctrl.createPayment);
router.post('/confirm',         requireAuth, ctrl.confirmBooking);
router.post('/cancel',          requireAuth, ctrl.cancelBooking);

export default router;
