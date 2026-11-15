import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/middleware/error.middleware';
import { z } from 'zod';
import { BookingsService } from '@/services/bookings.service';

const svc = new BookingsService();

export class BookingsController {

    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { type } = z.object({
                type: z.enum(['flight', 'hotel']).optional(),
            }).parse(req.query as any);
            const result = await svc.list(req.user!.sub, type);
            res.json(result);
        } catch (err) { next(err); }
    };

    details = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = z.object({ id: z.string() }).parse(req.params);
            const result = await svc.getDetails(id, req.user!.sub);
            res.json(result);
        } catch (err) { next(err); }
    };

    // ── Saved trips ───────────────────────────────────────────────────────────

    amend = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = req.body ?? {};
            if (!body.bookingId) throw new AppError(400, 'bookingId is required', 'VALIDATION_ERROR');
            res.json(await svc.amend(req.user!.sub, body));
        } catch (err) { next(err); }
    };

    share = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email } = z.object({ email: z.string().email() }).parse(req.body ?? {});
            res.json(await svc.share(req.user!.sub, req.params.id, email));
        } catch (err) { next(err); }
    };

    getSavedTrips = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const trips = await svc.getSavedTrips(req.user!.sub);
            res.json({ trips });
        } catch (err) { next(err); }
    };

    /**
     * Shortlists a hotel or a flight. See mobile ADR-0004.
     *
     * The old schema demanded a `hotelId` that `saved_trips` has no column for, so it
     * rejected the payload V2's own flight button sends — which V2 caught and answered by
     * writing to `localStorage` instead. This takes the shape of the table.
     *
     * `snake_case` is accepted beside `camelCase` on the two fields V2 already sends that way
     * (`image_url`, `deep_link`), so the web keeps working unchanged.
     */
    saveTrip = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = z.object({
                type:      z.enum(['hotel', 'flight']),
                title:     z.string().min(1).max(200),
                subtitle:  z.string().max(300).nullish(),
                price:     z.coerce.number().nonnegative().nullish(),
                currency:  z.string().length(3).optional(),
                imageUrl:  z.string().max(2000).nullish(),
                image_url: z.string().max(2000).nullish(),
                deepLink:  z.string().min(1).max(2000).optional(),
                deep_link: z.string().min(1).max(2000).optional(),
                // Where identity lives: hotelId for a stay, provider + offerId for a flight.
                snapshot:  z.record(z.any()).default({}),
            }).parse(req.body);

            const deepLink = body.deepLink ?? body.deep_link;
            if (!deepLink) {
                throw new AppError(400, 'deepLink is required', 'VALIDATION_ERROR');
            }

            const trip = await svc.saveTrip(req.user!.sub, {
                type:     body.type,
                title:    body.title,
                subtitle: body.subtitle ?? null,
                price:    body.price ?? null,
                currency: body.currency,
                imageUrl: body.imageUrl ?? body.image_url ?? null,
                deepLink,
                snapshot: body.snapshot,
            });
            res.status(201).json({ success: true, data: trip, trip });
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
