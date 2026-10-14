import { Router } from 'express';
import { requireAuth } from '@/middleware/auth.middleware';
import { usersController } from '@/controllers/users.controller';

/**
 * The account holder's own account: preferences, password, name.
 *
 * Routing only. The rules moved into UsersService and the writes into UsersRepository when C4
 * was ported (Layer Contract, docs/port-status.md) — this file previously held the validation
 * and four raw Prisma calls, which is how a name-length rule could exist in v1's form, v1's
 * route and nowhere here.
 */
const router = Router();

// Every route below acts on the caller's own account, so all of them need a verified caller.
router.use(requireAuth);

router.get('/preferences', usersController.getPreferences);
router.patch('/preferences', usersController.savePreferences);
router.patch('/password', usersController.changePassword);
router.patch('/profile', usersController.updateProfile);

export default router;
