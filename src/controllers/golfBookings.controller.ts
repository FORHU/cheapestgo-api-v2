import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@/middleware/error.middleware';
import { logAdminAction } from '@/lib/admin/audit';
import { customerExtras, extraChoicesSchema, parseExtrasParam } from '@/lib/golf/extras';
import { DEFAULT_PLAYERS, cancellationFor } from '@/lib/golf/rules';
import { isBookingReference } from '@/lib/payments/bookingReference';
import { GolfBookingsService } from '@/services/golfBookings.service';
import type { GolfBooking } from '@/repositories/golfBookings.repository';

/** Golf bookings over HTTP (CONTEXT.md, "Golf Booking"). The rules are GolfBookingsService's. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const quoteQuery = z.object({
    players:  z.coerce.number().int().min(1).max(4).catch(DEFAULT_PLAYERS).default(DEFAULT_PLAYERS),
    currency: z.string().trim().max(3).optional().catch(undefined),
    extras:   z.string().max(100).optional().catch(undefined),
});

const startBody = z.object({
    teeTimeId:  z.string().regex(UUID, 'Not a tee time'),
    players:    z.coerce.number().int().min(1, 'At least 1 player').max(4, 'At most 4 players'),
    leadName:   z.string().trim().min(1, 'Required').max(120),
    currency:   z.string().trim().max(3).optional(),
    shownTotal: z.number().nonnegative().optional(),
    extras:     extraChoicesSchema,
});

const adminQuery = z.object({
    view: z.enum(['waiting', 'upcoming', 'closed']).catch('waiting').default('waiting'),
    page: z.coerce.number().int().min(1).catch(1).default(1),
});

const notFound = () => new AppError(404, 'Golf booking not found', 'NOT_FOUND');

/** What the customer's own page needs. The payment's id and the course's own prices are ours. */
function forCustomer(b: GolfBooking) {
    const cancellation = cancellationFor(
        { status: b.status, total: b.total, freeCancelUntil: new Date(b.freeCancelUntil) },
        new Date(),
    );
    return {
        reference:     b.reference,
        // So a booking still waiting on the card can go back and finish paying.
        teeTimeId:     b.teeTimeId,
        status:        b.status,
        closeReason:   b.closeReason,
        players:       b.players,
        leadName:      b.leadName,
        contactEmail:  b.contactEmail,
        currency:      b.currency,
        greenFee:      b.greenFee,
        extras:        customerExtras(b.extras),
        extrasTotal:   b.extrasTotal,
        serviceFee:    b.serviceFee,
        total:         b.total,
        startsAt:      b.startsAt,
        holdExpiresAt: b.holdExpiresAt,
        decideBy:      b.decideBy,
        confirmedAt:   b.confirmedAt,
        createdAt:     b.createdAt,
        freeCancelUntil: b.freeCancelUntil,
        refundAmount:  b.refundAmount,
        /** Whether the cancel button works right now, so the page need not know the rule. */
        cancellable:   cancellation.allowed,
        course:        b.course,
    };
}

/** Never awaited and never throws: an action must not fail because its audit row did. */
function audit(req: Request, action: string, targetId: string) {
    void logAdminAction({ action, adminId: req.user!.sub, adminEmail: req.user!.email, targetId });
}

export class GolfBookingsController {
    constructor(private readonly svc = new GolfBookingsService()) {}

    quote = async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!UUID.test(req.params.id)) throw notFound();
            const { players, currency, extras } = quoteQuery.parse(req.query);
            const quote = await this.svc.quote(req.params.id, {
                players, currency, userId: req.user?.sub, extras: parseExtrasParam(extras),
            });
            if (!quote) throw notFound();
            res.json({ success: true, data: quote });
        } catch (err) { next(err); }
    };

    start = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = startBody.parse(req.body);
            const started = await this.svc.start({ id: req.user!.sub, email: req.user!.email }, body);
            res.status(201).json({ success: true, data: started });
        } catch (err) { next(err); }
    };

    /** The customer's own bookings, for My Bookings. */
    list = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const bookings = await this.svc.listForUser(req.user!.sub);
            res.json({ success: true, data: bookings.map(forCustomer) });
        } catch (err) { next(err); }
    };

    /** The customer's own booking. Someone else's is as absent as one that never existed. */
    get = async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!isBookingReference(req.params.reference)) throw notFound();
            const booking = await this.svc.getForUser(req.params.reference, req.user!.sub);
            if (!booking) throw notFound();
            res.json({ success: true, data: forCustomer(booking) });
        } catch (err) { next(err); }
    };

    cancel = async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!isBookingReference(req.params.reference)) throw notFound();
            const booking = await this.svc.cancelByCustomer(req.params.reference, req.user!.sub);
            if (!booking) throw notFound();
            res.json({ success: true, data: forCustomer(booking) });
        } catch (err) { next(err); }
    };

    adminList = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { view, page } = adminQuery.parse(req.query);
            res.json({ success: true, ...(await this.svc.listForAdmin(view, page)) });
        } catch (err) { next(err); }
    };

    adminConfirm = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const booking = await this.svc.confirm(req.params.reference);
            if (!booking) throw notFound();
            audit(req, 'golf_booking_confirm', booking.id);
            res.json({ success: true, data: booking });
        } catch (err) { next(err); }
    };

    adminDecline = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const booking = await this.svc.decline(req.params.reference);
            if (!booking) throw notFound();
            audit(req, 'golf_booking_decline', booking.id);
            res.json({ success: true, data: booking });
        } catch (err) { next(err); }
    };

    adminCancel = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const booking = await this.svc.cancelByTeam(req.params.reference);
            if (!booking) throw notFound();
            audit(req, 'golf_booking_cancel', booking.id);
            res.json({ success: true, data: booking });
        } catch (err) { next(err); }
    };
}
