import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';
import { GolfController } from '@/controllers/golf.controller';
import { GolfBookingsController } from '@/controllers/golfBookings.controller';

/**
 * Golf's back office. Admins only: there is no supplier, so this is the one place a course is written
 * and a booking answered. Mounted before `/admin` so nothing in admin.route.ts can shadow it.
 */
const router: Router = Router();
const golf = new GolfController();
const bookings = new GolfBookingsController();

router.use(requireAuth, requireRole('admin'));

router.get('/courses',              golf.adminList);
router.post('/courses',             golf.adminCreate);
router.put('/courses/:id',          golf.adminUpdate);
router.patch('/courses/:id/status', golf.adminSetStatus);
router.delete('/courses/:id',       golf.adminDelete);

router.get('/courses/:id/schedules',                golf.adminListSchedules);
router.post('/courses/:id/schedules',               golf.adminAddSchedule);
router.delete('/courses/:id/schedules/:scheduleId', golf.adminRemoveSchedule);

router.get('/courses/:id/extras', golf.adminListExtras);
router.put('/courses/:id/extras', golf.adminSetExtras);

router.get('/bookings',                     bookings.adminList);
router.post('/bookings/:reference/confirm', bookings.adminConfirm);
router.post('/bookings/:reference/decline', bookings.adminDecline);
router.post('/bookings/:reference/cancel',  bookings.adminCancel);

export default router;
