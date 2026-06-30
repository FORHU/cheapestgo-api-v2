import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { FlightsService } from '@/services/flights.service';

const svc = new FlightsService();

const searchSchema = z.object({
    origin:        z.string(),
    destination:   z.string(),
    departureDate: z.string(),
    returnDate:    z.string().optional().nullable(),
    adults:        z.coerce.number().int().min(1).default(1),
    children:      z.coerce.number().int().min(0).default(0),
    infants:       z.coerce.number().int().min(0).default(0),
    cabinClass:    z.string().optional().default('economy'),
    tripType:      z.enum(['one-way', 'round-trip', 'multi-city']).optional().default('one-way'),
    segments:      z.array(z.any()).optional(),
    filters:       z.record(z.any()).optional(),
});

export class FlightsController {

    search = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = searchSchema.parse(req.body);
            const { filters, ...params } = body;
            const result = await svc.search(params as any, filters as any);
            res.json(result);
        } catch (err) { next(err); }
    };

    book = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await svc.book({ ...req.body, userId: req.user!.sub });
            res.json(result);
        } catch (err) { next(err); }
    };

    confirm = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { paymentIntentId, sessionId } = z.object({
                paymentIntentId: z.string(),
                sessionId:       z.string(),
            }).parse(req.body);
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const result = await svc.confirm(paymentIntentId, sessionId, req.user!.sub, baseUrl);
            res.json(result);
        } catch (err) { next(err); }
    };

    bookingStatus = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const sessionId = z.string().parse(req.query.sessionId);
            const result = await svc.getBookingStatus(sessionId, req.user!.sub);
            res.json(result);
        } catch (err) { next(err); }
    };

    bags = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { offerId, passengerIds } = z.object({
                offerId:      z.string(),
                passengerIds: z.array(z.string()).optional().default([]),
            }).parse(req.body);
            const result = await svc.getBags(offerId, passengerIds);
            res.json(result);
        } catch (err) { next(err); }
    };

    seatMap = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { offerId, segments } = z.object({
                offerId:  z.string(),
                segments: z.array(z.object({ origin: z.string(), destination: z.string() })).optional(),
            }).parse(req.body);
            const result = await svc.getSeatMap(offerId, segments);
            res.json(result);
        } catch (err) { next(err); }
    };

    fareRules = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { fareSourceCode } = z.object({ fareSourceCode: z.string() }).parse(req.body);
            const result = await svc.getFareRules(fareSourceCode);
            res.json(result);
        } catch (err) { next(err); }
    };

    offerRefresh = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { rawOffer } = z.object({ rawOffer: z.record(z.any()) }).parse(req.body);
            const result = await svc.offerRefresh(rawOffer);
            res.json(result);
        } catch (err) { next(err); }
    };

    cancelQuote = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { bookingId } = z.object({ bookingId: z.string() }).parse(req.body);
            const result = await svc.cancelQuote(bookingId, req.user!.sub);
            res.json(result);
        } catch (err) { next(err); }
    };

    cancelBooking = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { bookingId, cancellationId } = z.object({
                bookingId:      z.string(),
                cancellationId: z.string().optional(),
            }).parse(req.body);
            const result = await svc.cancelBooking(bookingId, req.user!.sub, cancellationId);
            res.json(result);
        } catch (err) { next(err); }
    };

    priceCalendar = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const params = z.object({
                origin:      z.string(),
                destination: z.string(),
                year:        z.coerce.number().int(),
                month:       z.coerce.number().int().min(1).max(12),
                adults:      z.coerce.number().int().min(1).default(1),
                cabin:       z.string().optional().default('economy'),
                returnDate:  z.string().optional().nullable(),
                provider:    z.string().optional().nullable(),
            }).parse(req.query);
            const result = await svc.getPriceCalendar(params);
            res.json(result);
        } catch (err) { next(err); }
    };
}
