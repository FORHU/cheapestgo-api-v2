/**
 * Telling the team about golf requests (CONTEXT.md, "Golf Booking").
 *
 * A request nobody answers is declined at its deadline, so a request nobody hears about is a sale
 * lost and a customer let down. Three moments need a person, and only these three, because mail that
 * arrives on every run is mail nobody reads (see `lib/admin/notify.ts`): a new request to answer, one
 * about to run out of time, and one that did.
 *
 * It goes by email, since the back office has no feed of its own that anyone watches: to
 * `GOLF_TEAM_EMAIL` when that is set, otherwise to every admin account. The admin notification is
 * written too, as the record.
 *
 * Never throws. These are messages about a booking that has already moved, and a mail outage must not
 * undo that.
 */

import { config } from '@/config';
import { createNotification } from '@/lib/admin/notify';
import { sendTransactionalEmail } from '@/lib/email/send';
import { money, renderGolfEmail, when } from '@/lib/golf/emailParts';
import { EXTRA_NAMES_EN, extrasCourseTotal } from '@/lib/golf/extras';
import { prisma } from '@/lib/prisma';
import type { GolfBooking } from '@/repositories/golfBookings.repository';

export interface GolfTeamAlerts {
    newRequest(b: GolfBooking): Promise<void>;
    reminder(b: GolfBooking): Promise<void>;
    lapsed(b: GolfBooking): Promise<void>;
}

/** The team address if there is one, otherwise every admin. Empty when neither can be read. */
async function recipients(): Promise<string[]> {
    const team = process.env.GOLF_TEAM_EMAIL?.trim();
    if (team) return [team];
    try {
        const admins = await prisma.users.findMany({ where: { role: 'admin' }, select: { email: true } });
        return admins.map((a) => a.email).filter(Boolean);
    } catch (err) {
        console.error('[golf] could not read who to alert:', (err as Error)?.message);
        return [];
    }
}

function render(heading: string, lead: string, b: GolfBooking, action: string): string {
    const rows: Array<[string, string]> = [
        ['Reference', b.reference],
        ['Course', `${b.course.name}, ${b.course.city}`],
        ['Tee time', `${when(b.startsAt, b.course.timezone)} (course time)`],
        ['Players', String(b.players)],
        ['Lead player', b.leadName],
        ['Customer email', b.contactEmail],
        // What to arrange with the course, at what it asks.
        ...b.extras.map((e): [string, string] => [`${EXTRA_NAMES_EN[e.code]} × ${e.quantity}`, money(e.unitPrice * e.quantity, b.courseCurrency)]),
        ['Course price', money(b.pricePerPlayer * b.players + extrasCourseTotal(b.extras), b.courseCurrency)],
        ['Customer pays', money(b.total, b.currency)],
        ...(b.decideBy ? [['Answer by', `${when(b.decideBy, b.course.timezone)} (course time)`] as [string, string]] : []),
    ];
    return renderGolfEmail({
        heading,
        lead,
        rows,
        link: `${config.SITE_URL.replace(/\/$/, '')}/admin/golf/bookings`,
        action,
    });
}

/**
 * One alert. Not tied to the booking in `email_logs`: its duplicate guard is per booking and type, and
 * would let only the first admin be told. "Once" is already settled by the caller, which alerts only
 * from the one transition that actually moved the booking.
 */
async function alert(b: GolfBooking, subject: string, heading: string, lead: string, action: string): Promise<void> {
    const html = render(heading, lead, b, action);
    await createNotification(subject, `${b.reference}: ${lead}`, 'booking').catch(() => undefined);
    for (const to of await recipients()) {
        await sendTransactionalEmail({
            to,
            subject,
            html,
            emailType: 'golf_team_alert',
            metadata:  { reference: b.reference },
        }).catch((err: unknown) => console.error(`[golf] could not alert ${to}:`, (err as Error)?.message));
    }
}

export const golfTeamAlerts: GolfTeamAlerts = {
    newRequest: (b) => alert(
        b,
        `New golf request ${b.reference} — ${b.course.name}`,
        'A golf request needs an answer',
        `Check this tee time with ${b.course.name}, then confirm or decline it. The card is authorised and is charged only when you confirm.`,
        'Answer this request',
    ),
    reminder: (b) => alert(
        b,
        `Reminder: answer golf request ${b.reference} — ${b.course.name}`,
        'A golf request is running out of time',
        `Nobody has answered this request yet. If it is not answered by its deadline it is declined automatically and the customer loses the tee time.`,
        'Answer this request',
    ),
    lapsed: (b) => alert(
        b,
        `Missed golf request ${b.reference} — ${b.course.name}`,
        'A golf request lapsed unanswered',
        `Nobody answered this request by its deadline, so it was declined automatically. The customer was not charged and the spots went back on sale.`,
        'See golf bookings',
    ),
};
