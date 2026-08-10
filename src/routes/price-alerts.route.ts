import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '@/middleware/auth.middleware';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/middleware/error.middleware';

const router = Router();
router.use(requireAuth);

const VALID_CABINS = new Set(['economy', 'premium_economy', 'business', 'first']);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const alerts = await prisma.price_alerts.findMany({
            where:   { user_id: userId },
            orderBy: { created_at: 'desc' },
        });
        return res.json({ success: true, data: alerts });
    } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const { origin, destination, cabin_class = 'economy', adults = 1, target_price } = req.body as Record<string, unknown>;

        if (typeof origin !== 'string' || !/^[A-Z]{3}$/.test(origin)) {
            throw new AppError(400, 'Invalid origin IATA code', 'VALIDATION_ERROR');
        }
        if (typeof destination !== 'string' || !/^[A-Z]{3}$/.test(destination)) {
            throw new AppError(400, 'Invalid destination IATA code', 'VALIDATION_ERROR');
        }
        if (!VALID_CABINS.has(cabin_class as string)) {
            throw new AppError(400, 'Invalid cabin class', 'VALIDATION_ERROR');
        }
        const adultsNum = typeof adults === 'number' ? adults : parseInt(String(adults));
        if (isNaN(adultsNum) || adultsNum < 1 || adultsNum > 9) {
            throw new AppError(400, 'adults must be 1–9', 'VALIDATION_ERROR');
        }

        const count = await prisma.price_alerts.count({ where: { user_id: userId, is_active: true } });
        if (count >= 10) throw new AppError(422, 'Maximum 10 active alerts allowed', 'VALIDATION_ERROR');

        const user = await prisma.users.findUnique({ where: { id: userId }, select: { email: true } });

        const alert = await prisma.price_alerts.create({
            data: {
                user_id:     userId,
                email:       user!.email,
                origin,
                destination,
                cabin_class: cabin_class as string,
                adults:      adultsNum,
                target_price: typeof target_price === 'number' && target_price > 0 ? target_price : null,
            },
        });

        return res.status(201).json({ success: true, data: alert });
    } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const { id } = req.params;
        await prisma.price_alerts.deleteMany({ where: { id, user_id: userId } });
        return res.json({ success: true });
    } catch (err) { next(err); }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const { id } = req.params;
        const body = req.body as Record<string, unknown>;

        const patch: Record<string, unknown> = {};
        if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
        if (typeof body.target_price === 'number' && body.target_price > 0) patch.target_price = body.target_price;
        if (body.target_price === null) patch.target_price = null;

        if (!Object.keys(patch).length) throw new AppError(400, 'Nothing to update', 'VALIDATION_ERROR');

        const existing = await prisma.price_alerts.findFirst({ where: { id, user_id: userId } });
        if (!existing) throw new AppError(404, 'Alert not found', 'NOT_FOUND');

        const updated = await prisma.price_alerts.update({ where: { id }, data: patch });
        return res.json({ success: true, data: updated });
    } catch (err) { next(err); }
});

export default router;
