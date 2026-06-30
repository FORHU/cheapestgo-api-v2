import { Router, Request, Response, NextFunction } from 'express';
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

        if (!profile) {
            throw new AppError(404, 'Profile not found', 'NOT_FOUND');
        }

        return res.json({ preferences: profile.preferences ?? {} });
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

        const profile = await prisma.profiles.update({
            where: { id: userId },
            data: { preferences: body },
            select: { preferences: true },
        });

        return res.json({ preferences: profile.preferences ?? {} });
    } catch (err) {
        next(err);
    }
});

export default router;
