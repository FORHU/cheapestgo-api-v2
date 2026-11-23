/**
 * GET /api/v2/invoices/:id/pdf?type=hotel|flight
 *
 * Generates a PDF receipt for a hotel or flight booking and streams it as an attachment.
 *
 * **Possession of the booking's UUID is the authorisation.** This is the same receipt the
 * trips page renders, in another file format, so it answers to the same Capability Link
 * (ADR-0027) and no session is required. Demanding one made "Download PDF" fail for exactly
 * the people the emailed link is for: a guest opening their receipt signed out, or anyone
 * the booker forwarded it to. The session is still read when there is one, but only to fill
 * in the viewer's email where the booking itself carries none.
 *
 * The id must be the UUID. Looking a booking up by its supplier reference or PNR would be a
 * second, weaker way in to the same data — those travel on luggage tags and confirmation
 * screens and are far easier to guess than a v4 UUID.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { optionalAuth } from '@/middleware/auth.middleware';
import { invoiceRateLimit } from '@/middleware/rate-limit.middleware';
import { AppError } from '@/middleware/error.middleware';
import { createBookingInvoicePdf } from '@/services/invoicePdf.service';

const router: Router = Router();

router.get('/:id/pdf', optionalAuth, invoiceRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const requestedType = (req.query.type as string) || 'flight';

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
            throw new AppError(404, 'Booking not found', 'NOT_FOUND');
        }
        if (requestedType !== 'hotel' && requestedType !== 'flight') {
            throw new AppError(400, 'Receipt type must be hotel or flight', 'INVALID_RECEIPT_TYPE');
        }

        const invoice = await createBookingInvoicePdf(id, requestedType);
        if (!invoice) throw new AppError(404, 'Booking not found', 'NOT_FOUND');
        res.set({
            'Content-Type':        'application/pdf',
            'Content-Disposition': `attachment; filename="${invoice.filename}"`,
            'Content-Length':      String(invoice.buffer.length),
        });
        return res.send(invoice.buffer);
    } catch (err) {
        next(err);
    }
});

export default router;
