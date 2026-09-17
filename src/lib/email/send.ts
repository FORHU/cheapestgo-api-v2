/**
 * Sending a transactional email, once.
 *
 * Every customer email in v2 goes through here so that three things hold everywhere rather
 * than in whichever call site remembered them:
 *
 *  - **It is sent once.** A booking can be confirmed by the checkout call, by the Stripe
 *    webhook and by the recovery cron, and each of those is meant to be safe to repeat. The
 *    `email_logs` row is what makes them safe: a confirmation already sent or queued for a
 *    booking is not sent again.
 *  - **A failure is recoverable.** A send that fails keeps its rendered HTML in the log row,
 *    which is exactly what `POST /api/internal/retry-emails` looks for. Without the row the
 *    traveller simply never hears from us and nothing knows it.
 *  - **It is from the brand the customer used.** See `fromNoReply()` — a confirmation signed
 *    by a company the recipient has never heard of reads as phishing.
 *
 * The send is never allowed to break a booking: callers treat it as fire-and-forget, and this
 * function resolves rather than throws.
 */

import { prisma } from '@/lib/prisma';
import { fromNoReply } from '@/lib/brand';
import { config } from '@/config';

/** Constrained by the `email_logs_email_type_check` constraint on the table. */
export type EmailType =
    | 'confirmation'
    | 'ticketed'
    | 'refund'
    | 'cancellation'
    | 'awaiting_ticket'
    | 'price_alert';

export interface SendEmailParams {
    /** The booking this email is about. Omitted only for mail not tied to one. */
    bookingId?: string | null;
    to:        string;
    subject:   string;
    html:      string;
    emailType: EmailType;
    metadata?: Record<string, unknown>;
}

export interface SendEmailResult {
    success:    boolean;
    /** True when an email of this type had already gone out for this booking. */
    duplicate?: boolean;
    error?:     string;
}

/**
 * Has this booking already been told this?
 *
 * This read alone races — the checkout call, the Stripe webhook and the recovery cron can all
 * pass it before any of them writes. `db/migrations/20260917000001_email_logs_dedup.sql` adds
 * the partial unique index that settles it; the read stays because it gives a clean log line
 * rather than a constraint violation. A database without that index still works, and still
 * loses the race occasionally: the cost is a duplicate email, never a duplicate booking.
 */
async function alreadySent(bookingId: string, emailType: EmailType): Promise<boolean> {
    const existing = await prisma.email_logs.findFirst({
        where:  { booking_id: bookingId, email_type: emailType, status: { in: ['sent', 'queued'] } },
        select: { id: true },
    }).catch(() => null);
    return existing !== null;
}

async function logEmail(p: {
    bookingId?: string | null;
    recipient:  string;
    subject:    string;
    emailType:  EmailType;
    status:     'queued' | 'sent' | 'failed';
    errorMessage?: string;
    metadata?:  Record<string, unknown>;
    /** Kept on anything not yet delivered, so the retry job can re-send without re-rendering. */
    htmlBody?:  string;
}): Promise<void> {
    await prisma.email_logs.create({
        data: {
            booking_id:    p.bookingId ?? null,
            recipient:     p.recipient,
            subject:       p.subject,
            email_type:    p.emailType,
            status:        p.status,
            error_message: p.errorMessage ?? null,
            metadata:      { ...(p.metadata ?? {}), ...(p.htmlBody ? { htmlBody: p.htmlBody } : {}) } as any,
            sent_at:       p.status === 'sent' ? new Date() : null,
        },
    }).catch((err: any) => {
        // P2002 is the partial unique index doing its job: another caller won the race and
        // this booking has already been told. Not an error, and not worth a stack trace.
        if (err?.code === 'P2002') {
            console.warn(`[email] Duplicate ${p.emailType} for ${p.bookingId} rejected by the database`);
            return;
        }
        // Any other log failure must not take the email with it, but it does mean the retry
        // job will never see this one.
        console.error('[email] Could not write email_logs row:', err?.message);
    });
}

export async function sendTransactionalEmail(p: SendEmailParams): Promise<SendEmailResult> {
    if (!p.to) return { success: false, error: 'No recipient' };

    if (p.bookingId && await alreadySent(p.bookingId, p.emailType)) {
        console.warn(`[email] Suppressed duplicate ${p.emailType} for ${p.bookingId}`);
        return { success: true, duplicate: true };
    }

    // Queued rather than dropped: an unconfigured key is a deployment problem, and the mail is
    // still owed to the customer once it is fixed.
    if (!config.RESEND_API_KEY) {
        await logEmail({ ...p, recipient: p.to, status: 'queued', htmlBody: p.html, errorMessage: 'RESEND_API_KEY not configured' });
        return { success: false, error: 'Email service is not configured' };
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method:  'POST',
            headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ from: fromNoReply(), to: [p.to], subject: p.subject, html: p.html }),
        });

        if (res.ok) {
            await logEmail({ ...p, recipient: p.to, status: 'sent' });
            return { success: true };
        }

        const errText = await res.text().catch(() => '');
        console.error(`[email] Resend rejected ${p.emailType} (${res.status}):`, errText.slice(0, 300));
        await logEmail({ ...p, recipient: p.to, status: 'failed', errorMessage: `${res.status}: ${errText.slice(0, 200)}`, htmlBody: p.html });
        return { success: false, error: `Resend returned ${res.status}` };
    } catch (err: any) {
        console.error(`[email] Send threw for ${p.emailType}:`, err?.message);
        await logEmail({ ...p, recipient: p.to, status: 'failed', errorMessage: String(err?.message ?? err).slice(0, 200), htmlBody: p.html });
        return { success: false, error: String(err?.message ?? err) };
    }
}
