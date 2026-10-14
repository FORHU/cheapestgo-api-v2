import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '@/middleware/auth.middleware';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/middleware/error.middleware';
import { trip_type } from '@prisma/client';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const type = req.query.type as string | undefined;

        const where: { user_id: string; type?: trip_type } = { user_id: userId };
        if (type === 'flight' || type === 'hotel') where.type = type as trip_type;

        const trips = await prisma.saved_trips.findMany({ where, orderBy: { created_at: 'desc' } });
        return res.json({ success: true, data: trips });
    } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const { type, title, subtitle, price, currency = 'USD', image_url, deep_link, snapshot } = req.body as Record<string, unknown>;

        if (type !== 'flight' && type !== 'hotel') {
            throw new AppError(400, 'type must be flight or hotel', 'VALIDATION_ERROR');
        }
        if (typeof title !== 'string' || !title.trim()) {
            throw new AppError(400, 'title is required', 'VALIDATION_ERROR');
        }
        if (typeof deep_link !== 'string' || !deep_link.trim()) {
            throw new AppError(400, 'deep_link is required', 'VALIDATION_ERROR');
        }

        const count = await prisma.saved_trips.count({ where: { user_id: userId } });
        if (count >= 50) throw new AppError(422, 'Maximum 50 saved trips allowed', 'VALIDATION_ERROR');

        const existing = await prisma.saved_trips.findFirst({ where: { user_id: userId, deep_link: String(deep_link) } });
        if (existing) return res.json({ success: true, data: existing, duplicate: true });

        const trip = await prisma.saved_trips.create({
            data: {
                user_id:   userId,
                type:      type as trip_type,
                title:     String(title).slice(0, 200),
                subtitle:  subtitle ? String(subtitle).slice(0, 300) : null,
                price:     typeof price === 'number' ? price : null,
                currency:  String(currency).toUpperCase().slice(0, 3),
                image_url: image_url ? String(image_url).slice(0, 500) : null,
                deep_link: String(deep_link).slice(0, 1000),
                snapshot:  (snapshot ?? null) as any,
            },
        });
        return res.status(201).json({ success: true, data: trip });
    } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const { id } = req.params;
        await prisma.saved_trips.deleteMany({ where: { id, user_id: userId } });
        return res.json({ success: true });
    } catch (err) { next(err); }
});

export default router;
