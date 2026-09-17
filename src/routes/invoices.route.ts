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
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { optionalAuth } from '@/middleware/auth.middleware';
import { invoiceRateLimit } from '@/middleware/rate-limit.middleware';
import { AppError } from '@/middleware/error.middleware';
import { prisma } from '@/lib/prisma';
import { InvoicePdfDocument } from '@/components/InvoicePdfDocument';
import { canonicalBrandName } from '@/lib/brand';

const router = Router();

function formatCurrency(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}

function calculateNights(checkIn: Date, checkOut: Date): number {
    return Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000));
}

router.get('/:id/pdf', optionalAuth, invoiceRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id }   = req.params;
        const type     = (req.query.type as string) || 'flight';
        const isHotel  = type === 'hotel';

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
            throw new AppError(404, 'Booking not found', 'NOT_FOUND');
        }

        const booking: any = isHotel
            ? await prisma.bookings.findFirst({ where: { id } }).catch(() => null)
            : await prisma.flight_bookings.findFirst({
                  where:   { id },
                  include: { flight_segments: true, passengers: true },
              }).catch(() => null);

        if (!booking) throw new AppError(404, 'Booking not found', 'NOT_FOUND');

        const currency   = booking.currency || 'PHP';
        const totalPrice = Number(booking.total_price ?? booking.charged_price ?? 0);
        const invoiceNum = `INV-${booking.id.slice(0, 8).toUpperCase()}`;
        const issuedDate = new Date(booking.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        // The only thing the session is read for: a flight booking stores no contact address,
        // so the receipt would otherwise show a blank "billed to" line for a signed-in reader
        // whose address we already know.
        const viewerEmail = req.user?.email ?? '';
        const billedTo = isHotel
            ? { name: `${booking.holder_first_name || ''} ${booking.holder_last_name || ''}`.trim(), email: booking.holder_email || viewerEmail }
            : { name: `${booking.passengers?.[0]?.first_name || ''} ${booking.passengers?.[0]?.last_name || ''}`.trim(), email: viewerEmail };

        let hotelDetails = null;
        if (isHotel) {
            const nights     = booking.check_in && booking.check_out ? calculateNights(new Date(booking.check_in), new Date(booking.check_out)) : 0;
            const checkInFmt = booking.check_in  ? new Date(booking.check_in).toLocaleDateString('en-US',  { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            const checkOutFmt = booking.check_out ? new Date(booking.check_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            hotelDetails = {
                propertyName: booking.property_name || '',
                roomName:     booking.room_name     || '',
                dates:        `${checkInFmt} → ${checkOutFmt}`,
                nights,
                guests: `${booking.guests_adults} adult${booking.guests_adults !== 1 ? 's' : ''}${booking.guests_children > 0 ? `, ${booking.guests_children} child${booking.guests_children !== 1 ? 'ren' : ''}` : ''}`,
            };
        }

        let flightDetails = null;
        if (!isHotel) {
            flightDetails = {
                segments: (booking.flight_segments ?? []).map((seg: any) => ({
                    airline: `${seg.airline || ''} ${seg.flight_number || ''}`.trim(),
                    route:   `${seg.origin || ''} → ${seg.destination || ''}`,
                    date:    seg.departure ? new Date(seg.departure).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
                })),
                passengers: (booking.passengers ?? []).map((p: any) => ({
                    name:         `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                    type:         p.type || 'ADT',
                    ticketNumber: p.ticket_number || '',
                })),
            };
        }

        const bookingRef  = isHotel ? (booking.booking_id || '') : (booking.pnr || '');
        const bookingType = isHotel ? 'Hotel' : `Flight · ${booking.trip_type ?? 'one-way'}`;
        const provider    = isHotel ? 'Hotel Partner' : (booking.provider || '');

        const pdfBuffer = await renderToBuffer(
            React.createElement(InvoicePdfDocument, {
                invoiceNumber: invoiceNum,
                issuedDate,
                billedTo,
                isHotel,
                hotelDetails,
                flightDetails,
                bookingRef,
                bookingType,
                provider,
                formattedTotal: formatCurrency(totalPrice, currency),
            }) as any,
        );

        const filename = `${canonicalBrandName(process.env.BRAND_NAME ?? process.env.NEXT_PUBLIC_BRAND_NAME)}-Receipt-${invoiceNum}.pdf`;
        res.set({
            'Content-Type':        'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length':      String(pdfBuffer.length),
        });
        return res.send(pdfBuffer);
    } catch (err) {
        next(err);
    }
});

export default router;
