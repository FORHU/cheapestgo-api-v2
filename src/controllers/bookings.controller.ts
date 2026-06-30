import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BookingsService } from '@/services/bookings.service';

const svc = new BookingsService();

export class BookingsController {

    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { type } = z.object({
                type: z.enum(['flight', 'hotel']).optional(),
            }).parse(req.query as any);
            const bookings = await svc.list(req.user!.sub, type);
            res.json({ bookings });
        } catch (err) { next(err); }
    };

    details = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = z.object({ id: z.string() }).parse(req.params);
            const booking = await svc.getDetails(id, req.user!.sub);
            res.json({ booking });
        } catch (err) { next(err); }
    };

    // ── Saved trips ───────────────────────────────────────────────────────────

    getSavedTrips = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const trips = await svc.getSavedTrips(req.user!.sub);
            res.json({ trips });
        } catch (err) { next(err); }
    };

    saveTrip = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = z.object({
                hotelId:   z.string(),
                hotelName: z.string().optional(),
                details:   z.record(z.any()).optional(),
            }).parse(req.body);
            const trip = await svc.saveTrip(req.user!.sub, data);
            res.status(201).json({ trip });
        } catch (err) { next(err); }
    };

    deleteSavedTrip = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = z.object({ id: z.string() }).parse(req.params);
            await svc.deleteSavedTrip(id, req.user!.sub);
            res.json({ success: true });
        } catch (err) { next(err); }
    };

    // ── Price alerts ──────────────────────────────────────────────────────────

    getPriceAlerts = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const alerts = await svc.getPriceAlerts(req.user!.sub);
            res.json({ alerts });
        } catch (err) { next(err); }
    };

    createPriceAlert = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = z.object({
                origin:      z.string().optional(),
                destination: z.string(),
                targetPrice: z.number(),
                currency:    z.string(),
                tripType:    z.string(),
                details:     z.record(z.any()).optional(),
            }).parse(req.body);
            const alert = await svc.createPriceAlert(req.user!.sub, data);
            res.status(201).json({ alert });
        } catch (err) { next(err); }
    };

    deletePriceAlert = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = z.object({ id: z.string() }).parse(req.params);
            await svc.deletePriceAlert(id, req.user!.sub);
            res.json({ success: true });
        } catch (err) { next(err); }
    };
}
