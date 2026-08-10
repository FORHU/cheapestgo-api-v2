/**
 * GET /api/v2/invoices/:id/pdf?type=hotel|flight
 *
 * Generates a PDF receipt for a hotel or flight booking and streams it as
 * an attachment. Auth required; ownership enforced (admin bypasses).
 */

import { Router, Request, Response, NextFunction } from 'express';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { requireAuth } from '@/middleware/auth.middleware';
import { AppError } from '@/middleware/error.middleware';
import { prisma } from '@/lib/prisma';
import { InvoicePdfDocument } from '@/components/InvoicePdfDocument';

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

router.get('/:id/pdf', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id }   = req.params;
        const type     = (req.query.type as string) || 'flight';
        const userId   = req.user!.sub;
        const isAdmin  = req.user!.role === 'admin';
        const isHotel  = type === 'hotel';

        let booking: any = null;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

        if (isHotel) {
            if (isUuid) {
                booking = await prisma.bookings.findFirst({
                    where: { id, ...(isAdmin ? {} : { user_id: userId }) },
                }).catch(() => null);
            }
            if (!booking) {
                booking = await prisma.bookings.findFirst({
                    where: { booking_id: id, ...(isAdmin ? {} : { user_id: userId }) },
                }).catch(() => null);
            }
        } else {
            if (isUuid) {
                booking = await prisma.flight_bookings.findFirst({
                    where: { id, ...(isAdmin ? {} : { user_id: userId }) },
                    include: { flight_segments: true, passengers: true },
                }).catch(() => null);
            }
            if (!booking) {
                booking = await prisma.flight_bookings.findFirst({
                    where: { pnr: id, ...(isAdmin ? {} : { user_id: userId }) },
                    include: { flight_segments: true, passengers: true },
                }).catch(() => null);
            }
        }

        if (!booking) throw new AppError(404, 'Booking not found', 'NOT_FOUND');

        const currency   = booking.currency || 'PHP';
        const totalPrice = Number(booking.total_price ?? booking.charged_price ?? 0);
        const invoiceNum = `INV-${booking.id.slice(0, 8).toUpperCase()}`;
        const issuedDate = new Date(booking.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        const billedTo = isHotel
            ? { name: `${booking.holder_first_name || ''} ${booking.holder_last_name || ''}`.trim(), email: booking.holder_email || '' }
            : { name: `${booking.passengers?.[0]?.first_name || ''} ${booking.passengers?.[0]?.last_name || ''}`.trim(), email: '' };

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

        const filename = `CheapestGo-Receipt-${invoiceNum}.pdf`;
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
