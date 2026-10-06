/**
 * Telling the traveller their flight is booked, from wherever that becomes true.
 *
 * Three places can make a flight booking real: the checkout's create-booking call, the
 * supplier webhook that later issues the ticket, and the recovery cron. v1 wrote the email
 * separately at each one, and they drifted — one copy sent every confirmation with a total of
 * `0 USD`, another described the itinerary the traveller *selected* rather than the one the
 * airline ticketed.
 *
 * So this takes a booking id and nothing else, and reads what it needs. The row is the truth;
 * anything a caller passed in is a second copy of it waiting to disagree.
 *
 * The two emails are distinct types in `email_logs`, which is what lets a booking legitimately
 * receive both: "booked, ticket to follow" when the PNR exists, and "ticketed" when the
 * documents are issued minutes or hours later. A repeat of either is suppressed.
 */

import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail, type SendEmailResult } from '@/lib/email/send';
import { buildFlightConfirmationHtml } from '@/lib/email/templates';

/** Statuses that mean the ticket itself exists, as opposed to just the airline booking. */
const TICKETED_STATUSES = new Set(['ticketed', 'confirmed']);

export async function sendFlightConfirmationEmail(bookingId: string): Promise<SendEmailResult> {
    const booking = await prisma.flight_bookings.findUnique({
        where:   { id: bookingId },
        include: {
            flight_segments: { orderBy: { departure: 'asc' } },
            passengers:      true,
        },
    }).catch(() => null);

    if (!booking) return { success: false, error: 'Booking not found' };
    if (!booking.pnr) return { success: false, error: 'Booking has no PNR' };

    // The contact address lives on the session the booking came from — a flight booking row
    // carries no email of its own. A booking with neither is one nobody can be told about.
    const session = booking.session_id
        ? await prisma.booking_sessions.findUnique({
              where:  { id: booking.session_id },
              select: { contact: true },
          }).catch(() => null)
        : null;

    const email = (session?.contact as any)?.email ?? '';
    if (!email) {
        console.warn(`[email] No contact address for flight booking ${bookingId} — nothing sent`);
        return { success: false, error: 'No contact email' };
    }

    const lead     = booking.passengers[0];
    const tickets  = Array.isArray(booking.ticket_numbers)
        ? (booking.ticket_numbers as any[]).filter((t): t is string => typeof t === 'string' && t.length > 0)
        : [];
    const awaitingTicket = !TICKETED_STATUSES.has(String(booking.status ?? ''));

    return sendTransactionalEmail({
        bookingId,
        to:        email,
        subject:   awaitingTicket ? `Flight booked — ${booking.pnr}` : `Flight ticketed — ${booking.pnr}`,
        emailType: awaitingTicket ? 'awaiting_ticket' : 'ticketed',
        html: buildFlightConfirmationHtml({
            bookingId,
            pnr:           booking.pnr,
            passengerName: `${lead?.first_name ?? ''} ${lead?.last_name ?? ''}`.trim(),
            provider:      booking.provider ?? undefined,
            segments: booking.flight_segments.map((s) => ({
                airline:      s.airline ?? '',
                flightNumber: s.flight_number,
                origin:       s.origin ?? '',
                destination:  s.destination ?? '',
                departure:    s.departure,
            })),
            // The charged figure, not zero and not the pre-markup supplier price: this is the
            // number the traveller will compare against their card statement.
            totalPrice:    Number(booking.charged_price ?? booking.confirmed_price ?? booking.total_price ?? 0),
            currency:      booking.confirmed_currency ?? booking.currency ?? 'USD',
            ticketNumbers: tickets,
            awaitingTicket,
        }),
    });
}
