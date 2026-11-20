import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePdfDocument, type InvoicePdfProps } from '@/components/InvoicePdfDocument';
import { canonicalBrandName } from '@/lib/brand';
import { prisma } from '@/lib/prisma';

export type InvoiceBookingType = 'hotel' | 'flight';

export interface BookingInvoicePdf {
    buffer: Buffer;
    filename: string;
}

function formatCurrency(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}

function formatDate(value: Date | string): string {
    return new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
    });
}

function calculateNights(checkIn: Date, checkOut: Date): number {
    return Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000));
}

async function renderPdf(props: InvoicePdfProps): Promise<BookingInvoicePdf> {
    const buffer = await renderToBuffer(InvoicePdfDocument(props));
    const invoiceNumber = props.invoiceNumber;
    const brand = canonicalBrandName(process.env.BRAND_NAME ?? process.env.NEXT_PUBLIC_BRAND_NAME);
    return { buffer, filename: `${brand}-Receipt-${invoiceNumber}.pdf` };
}

export async function createBookingInvoicePdf(
    id: string,
    type: InvoiceBookingType,
): Promise<BookingInvoicePdf | null> {
    if (type === 'hotel') {
        const booking = await prisma.bookings.findUnique({ where: { id } });
        if (!booking) return null;

        const currency = booking.currency || 'PHP';
        const totalPaid = Number(booking.charged_price ?? booking.total_price ?? 0);
        const invoiceNumber = `INV-${booking.id.slice(0, 8).toUpperCase()}`;
        const issuedDate = booking.created_at ? formatDate(booking.created_at) : 'Not recorded';
        return renderPdf({
            invoiceNumber,
            issuedDate,
            billedTo: {
                name: `${booking.holder_first_name || ''} ${booking.holder_last_name || ''}`.trim(),
                email: booking.holder_email || '',
            },
            isHotel: true,
            hotelDetails: {
                propertyName: booking.property_name || '',
                roomName: booking.room_name || '',
                dates: `${booking.check_in ? formatDate(booking.check_in) : ''} → ${booking.check_out ? formatDate(booking.check_out) : ''}`,
                nights: booking.check_in && booking.check_out
                    ? calculateNights(new Date(booking.check_in), new Date(booking.check_out))
                    : 0,
                guests: `${booking.guests_adults ?? 1} adult${booking.guests_adults !== 1 ? 's' : ''}${(booking.guests_children ?? 0) > 0 ? `, ${booking.guests_children} child${booking.guests_children !== 1 ? 'ren' : ''}` : ''}`,
            },
            flightDetails: null,
            bookingRef: booking.booking_id || '',
            bookingType: 'Hotel',
            provider: 'Hotel Partner',
            formattedTotal: formatCurrency(totalPaid, currency),
        });
    }

    const booking = await prisma.flight_bookings.findUnique({
        where: { id },
        include: {
            flight_segments: true,
            passengers: true,
            booking_sessions: { select: { contact: true } },
        },
    });
    if (!booking) return null;

    const currency = booking.confirmed_currency || booking.payment_currency || booking.currency || 'PHP';
    const totalPaid = Number(booking.charged_price ?? booking.confirmed_price ?? booking.total_price ?? 0);
    const invoiceNumber = `INV-${booking.id.slice(0, 8).toUpperCase()}`;
    const issuedDate = formatDate(booking.created_at);
    return renderPdf({
        invoiceNumber,
        issuedDate,
        billedTo: {
            name: `${booking.passengers[0]?.first_name || ''} ${booking.passengers[0]?.last_name || ''}`.trim(),
            email: (booking.booking_sessions?.contact as { email?: string } | null)?.email || '',
        },
        isHotel: false,
        hotelDetails: null,
        flightDetails: {
            segments: booking.flight_segments.map((segment) => ({
                airline: `${segment.airline || ''} ${segment.flight_number || ''}`.trim(),
                route: `${segment.origin || ''} → ${segment.destination || ''}`,
                date: segment.departure ? formatDate(segment.departure) : '',
            })),
            passengers: booking.passengers.map((passenger) => ({
                name: `${passenger.first_name || ''} ${passenger.last_name || ''}`.trim(),
                type: passenger.type || 'ADT',
                ticketNumber: passenger.ticket_number || '',
            })),
        },
        bookingRef: booking.pnr || '',
        bookingType: `Flight · ${booking.trip_type ?? 'one-way'}`,
        provider: booking.provider || '',
        formattedTotal: formatCurrency(totalPaid, currency),
    });
}
