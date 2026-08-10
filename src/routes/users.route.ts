import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '@/middleware/auth.middleware';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/middleware/error.middleware';

const router = Router();

// All /users routes require authentication
router.use(requireAuth);

/**
 * GET /api/users/preferences
 *
 * Returns the authenticated user's preferences JSON from their profile.
 */
router.get('/preferences', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;

        const profile = await prisma.profiles.findUnique({
            where: { id: userId },
            select: { preferences: true },
        });

        return res.json({ preferences: profile?.preferences ?? {} });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/users/preferences
 *
 * Merges/replaces the authenticated user's preferences JSON on their profile.
 * Body: any JSON object — replaces the stored preferences entirely.
 */
router.patch('/preferences', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const body = req.body;

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new AppError(400, 'Request body must be a JSON object', 'VALIDATION_ERROR');
        }

        const profile = await prisma.profiles.upsert({
            where:  { id: userId },
            update: { preferences: body },
            create: { id: userId, preferences: body },
            select: { preferences: true },
        });

        return res.json({ preferences: profile.preferences ?? {} });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/v2/users/password
 * Change password — verifies current password before updating.
 */
router.patch('/password', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

        if (!currentPassword || !newPassword) {
            throw new AppError(400, 'currentPassword and newPassword are required', 'VALIDATION_ERROR');
        }
        if (newPassword.length < 8) {
            throw new AppError(400, 'New password must be at least 8 characters', 'VALIDATION_ERROR');
        }

        const user = await prisma.users.findUnique({
            where:  { id: userId },
            select: { password_hash: true },
        });
        if (!user?.password_hash) throw new AppError(400, 'No password set on this account', 'VALIDATION_ERROR');

        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) throw new AppError(400, 'Current password is incorrect', 'INVALID_CREDENTIALS');

        const hash = await bcrypt.hash(newPassword, 10);
        await prisma.users.update({ where: { id: userId }, data: { password_hash: hash, updated_at: new Date() } });

        return res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

/**
 * PATCH /api/v2/users/profile
 * Update first and/or last name.
 */
router.patch('/profile', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const { firstName, lastName } = req.body as { firstName?: string; lastName?: string };

        if (firstName === undefined && lastName === undefined) {
            throw new AppError(400, 'Nothing to update', 'VALIDATION_ERROR');
        }
        if (firstName !== undefined && firstName.trim().length === 0) {
            throw new AppError(400, 'First name cannot be empty', 'VALIDATION_ERROR');
        }
        if (lastName !== undefined && lastName.trim().length === 0) {
            throw new AppError(400, 'Last name cannot be empty', 'VALIDATION_ERROR');
        }

        const updated = await prisma.users.update({
            where: { id: userId },
            data: {
                ...(firstName !== undefined && { first_name: firstName.trim() }),
                ...(lastName  !== undefined && { last_name:  lastName.trim()  }),
                updated_at: new Date(),
            },
            select: { first_name: true, last_name: true },
        });

        return res.json({ success: true, user: { firstName: updated.first_name, lastName: updated.last_name } });
    } catch (err) {
        next(err);
    }
});

export default router;
