import { Router } from 'express';
import { AuthController } from '@/controllers/auth.controller';
import { authRateLimit } from '@/middleware/rate-limit.middleware';
import { authenticate } from '@/middleware/auth.middleware';

const router = Router();
const controller = new AuthController();

router.post('/register', authRateLimit, controller.register);
router.post('/login',    authRateLimit, controller.login);
router.post('/logout',   authenticate,  controller.logout);
router.post('/refresh',  authRateLimit, controller.refresh);
router.get('/me',        authenticate,  controller.me);

export default router;
