import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';
import { GolfController } from '@/controllers/golf.controller';

/**
 * The golf catalogue's back office. Admins only: there is no supplier, so this is the one place a
 * course is written. Mounted before `/admin` so nothing in admin.route.ts can shadow it.
 */
const router: Router = Router();
const golf = new GolfController();

router.use(requireAuth, requireRole('admin'));

router.get('/courses',              golf.adminList);
router.post('/courses',             golf.adminCreate);
router.put('/courses/:id',          golf.adminUpdate);
router.patch('/courses/:id/status', golf.adminSetStatus);
router.delete('/courses/:id',       golf.adminDelete);

export default router;
