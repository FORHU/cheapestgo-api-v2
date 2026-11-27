import { Router } from 'express';
import { StaffInvitationsController } from '@/controllers/staffInvitations.controller';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';
import { authRateLimit } from '@/middleware/rate-limit.middleware';

const controller = new StaffInvitationsController();

/**
 * Managing invitations — admin only.
 *
 * `requireRole('admin')` is standing in for a `staff.invite` permission check (#106, #107 —
 * neither exists yet). It is the correct stand-in, not a shortcut: `admin` is the only role
 * `canAdminister` names today, so it is exactly who may administer anything else in this API.
 * Mounted at `/admin/staff/invitations`, before `/admin`, the way `/admin/golf` and
 * `/admin/support` already are — see routes/index.ts.
 */
export const staffInvitationsAdminRouter: Router = Router();
staffInvitationsAdminRouter.use(requireAuth, requireRole('admin'));
staffInvitationsAdminRouter.post('/',          controller.invite);
staffInvitationsAdminRouter.get('/',           controller.list);
staffInvitationsAdminRouter.post('/:id/revoke', controller.revoke);

/** Accepting one — no session exists yet, so this cannot sit behind `requireAuth`. */
export const staffInvitationsPublicRouter: Router = Router();
staffInvitationsPublicRouter.post('/accept-invitation', authRateLimit, controller.accept);
