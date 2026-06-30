import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { HotelsService } from '@/services/hotels.service';
import { autocompleteDestinations, getPlaceDetails, geocode as geoCodePlace } from '@/lib/google/places';

const svc = new HotelsService();

export class HotelsController {

    search = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = z.object({
                destination:  z.string(),
                checkIn:      z.string(),
                checkOut:     z.string(),
                adults:       z.coerce.number().int().min(1).default(1),
                children:     z.coerce.number().int().min(0).default(0),
                rooms:        z.coerce.number().int().min(1).default(1),
                lat:          z.coerce.number().optional(),
                lng:          z.coerce.number().optional(),
                countryCode:  z.string().optional(),
                currency:     z.string().optional(),
                occupancies:  z.array(z.any()).optional(),
                filters:      z.record(z.any()).optional(),
            }).parse(req.body);
            const result = await svc.search(body);
            res.json(result);
        } catch (err) { next(err); }
    };

    property = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = z.object({ id: z.string() }).parse(req.params);
            const result = await svc.getProperty(id);
            res.json(result);
        } catch (err) { next(err); }
    };

    deals = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { limit } = z.object({ limit: z.coerce.number().optional().default(12) }).parse(req.query);
            const result = await svc.getDeals(limit);
            res.json({ deals: result });
        } catch (err) { next(err); }
    };

    // ── Places / autocomplete ─────────────────────────────────────────────────

    autocomplete = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { query } = z.object({ query: z.string().min(1) }).parse(req.body);
            const result = await autocompleteDestinations(query);
            res.json(result);
        } catch (err) { next(err); }
    };

    placeDetails = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { placeId } = z.object({ placeId: z.string() }).parse(req.query as any);
            const result = await getPlaceDetails(placeId);
            res.json(result);
        } catch (err) { next(err); }
    };

    geocode = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { lat, lng, address } = z.object({
                lat:     z.coerce.number().optional(),
                lng:     z.coerce.number().optional(),
                address: z.string().optional(),
            }).parse(req.query as any);
            const result = await geoCodePlace({ lat, lng, address } as any);
            res.json(result);
        } catch (err) { next(err); }
    };

    // ── Hotel payment / prebook ───────────────────────────────────────────────

    preBook = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await svc.preBook(req.body);
            res.json(result);
        } catch (err) { next(err); }
    };

    createPayment = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await svc.createPayment({ ...req.body, userId: req.user!.sub });
            res.json(result);
        } catch (err) { next(err); }
    };

    confirmBooking = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await svc.confirmBooking({ ...req.body, userId: req.user!.sub });
            res.json(result);
        } catch (err) { next(err); }
    };

    cancelBooking = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await svc.cancelBooking({ ...req.body, userId: req.user!.sub });
            res.json(result);
        } catch (err) { next(err); }
    };
}
