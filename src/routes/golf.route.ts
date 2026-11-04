import { Router } from 'express';
import { GolfController } from '@/controllers/golf.controller';

/**
 * The storefront's golf catalogue (CONTEXT.md, "Golf Course"). No session needed; published courses
 * only, which GolfService decides. Covered by the app-wide defaultRateLimit.
 */
const router: Router = Router();
const golf = new GolfController();

router.get('/courses',                 golf.list);
router.get('/courses/:slug',           golf.get);
router.get('/courses/:slug/tee-times', golf.teeTimesOnDay);

export default router;
