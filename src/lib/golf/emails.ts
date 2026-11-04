/**
 * The customer's golf emails (CONTEXT.md, "Golf Booking"): one for each status they have to hear about.
 * English, like the other booking emails. A hold that ran out gets none: nothing was paid and nothing
 * was asked of anyone.
 *
 * Sent once: `email_logs` allows one of each type per booking, so the webhook, the customer's page and
 * the sweep can all reach the same transition. Never throws (see `lib/email/send.ts`): a booking must
 * not fail because its email did.
 */

import { config } from '@/config';
import { sendTransactionalEmail } from '@/lib/email/send';
import { money, renderGolfEmail, when } from '@/lib/golf/emailParts';
import { EXTRA_NAMES_EN } from '@/lib/golf/extras';
import type { GolfBooking } from '@/repositories/golfBookings.repository';

export type GolfEmailKind = 'requested' | 'confirmed' | 'declined' | 'cancelled';

function wording(kind: GolfEmailKind, b: GolfBooking): { subject: string; lead: string; note: string } {
    const course = b.course.name;
    const tz = b.course.timezone;
    const total = money(b.total, b.currency);
    switch (kind) {
        case 'requested':
            return {
                subject: `Tee time requested – ${course}`,
                lead:    `We're asking ${course} to confirm your tee time.`,
                note:    `Your card is authorised for ${total} but won't be charged until the course confirms. We'll email you by ${when(b.decideBy ?? b.startsAt, tz)} (course time).`,
            };
        case 'confirmed':
            return {
                subject: `Tee time confirmed – ${course}`,
                lead:    `${course} has confirmed your tee time.`,
                // A tee time booked inside the course's window was never freely cancellable; promising
                // a cutoff already behind us would be a promise we cannot keep.
                note:    new Date(b.freeCancelUntil).getTime() > new Date(b.confirmedAt ?? Date.now()).getTime()
                    ? `We've charged ${total}. Free cancellation until ${when(b.freeCancelUntil, tz)} (course time).`
                    : `We've charged ${total}. Free cancellation for this tee time has passed, so it can't be cancelled online. If your plans change, please contact us.`,
            };
        case 'declined':
            return {
                subject: `We couldn't confirm your tee time – ${course}`,
                lead:    b.closeReason === 'not_confirmed_in_time'
                    ? `We couldn't get confirmation from ${course} in time.`
                    : `${course} couldn't take this booking.`,
                note:    'Your card was not charged, and the hold on it has been released.',
            };
        case 'cancelled':
            return {
                subject: `Tee time cancelled – ${course}`,
                lead:    b.closeReason === 'cancelled_by_team'
                    ? `${course} had to cancel this tee time.`
                    : 'Your tee time has been cancelled.',
                note:    b.refundAmount > 0
                    ? `We've refunded ${money(b.refundAmount, b.currency)}. It can take 5–10 business days to appear on your statement.`
                    : 'You were not charged, and the hold on your card has been released.',
            };
    }
}

export function buildGolfBookingEmail(kind: GolfEmailKind, b: GolfBooking): { subject: string; html: string } {
    const { subject, lead, note } = wording(kind, b);
    const html = renderGolfEmail({
        heading: subject,
        lead,
        note,
        rows: [
            ['Reference', b.reference],
            ['Course', `${b.course.name}, ${b.course.city}`],
            ['Tee time', `${when(b.startsAt, b.course.timezone)} (course time)`],
            ['Players', String(b.players)],
            ['Lead player', b.leadName],
            ['Green fees', money(b.greenFee, b.currency)],
            ...b.extras.map((e): [string, string] => [`${EXTRA_NAMES_EN[e.code]} × ${e.quantity}`, money(e.total, b.currency)]),
            ['Service fee', money(b.serviceFee, b.currency)],
            ['Total', money(b.total, b.currency)],
        ],
        link:   `${config.SITE_URL.replace(/\/$/, '')}/golf/bookings/${encodeURIComponent(b.reference)}`,
        action: 'View your booking',
    });
    return { subject, html };
}

export async function sendGolfBookingEmail(kind: GolfEmailKind, b: GolfBooking): Promise<void> {
    const { subject, html } = buildGolfBookingEmail(kind, b);
    await sendTransactionalEmail({
        bookingId: b.reference,
        to:        b.contactEmail,
        subject,
        html,
        emailType: `golf_${kind}`,
        metadata:  { reference: b.reference },
    });
}
