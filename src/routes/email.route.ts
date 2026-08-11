/**
 * POST /api/email
 *
 * Sends transactional emails via the Resend API.
 * Protected by JWT auth. Users may only send to their own email address.
 * Rate limited to 3 sends per minute per user (in-memory sliding window).
 *
 * Booking emails are rendered from the stored booking, not the request body —
 * the caller supplies a booking reference and nothing else that reaches the
 * message. See lib/email/booking-view.ts.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth.middleware';
import { AppError } from '@/middleware/error.middleware';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import { loadBookingEmailView, type BookingEmailView } from '@/lib/email/booking-view';
import { renderBookingConfirmationHtml } from '@/lib/email/booking-confirmation.template';
import { renderBookingConfirmationPdf } from '@/lib/email/booking-confirmation.pdf';

const router = Router();

const FROM_ADDRESS = 'CheapestGo <no-reply@mail.cheapestgo.com>';

// ── In-memory sliding-window rate limiter ────────────────────────────────────
// 3 emails per minute per authenticated user.

const EMAIL_WINDOW_MS    = 60_000;
const EMAIL_MAX_PER_USER = 3;
const emailAttempts      = new Map<string, number[]>();

function isEmailRateLimited(userId: string): boolean {
    const now        = Date.now();
    const timestamps = emailAttempts.get(userId) ?? [];
    const recent     = timestamps.filter(t => now - t < EMAIL_WINDOW_MS);

    if (recent.length >= EMAIL_MAX_PER_USER) {
        emailAttempts.set(userId, recent);
        return true;
    }

    recent.push(now);
    emailAttempts.set(userId, recent);
    return false;
}

// Periodic cleanup to prevent memory leaks (every 5 minutes)
const emailCleanupTimer = setInterval(() => {
    const now = Date.now();
    emailAttempts.forEach((timestamps, userId) => {
        const recent = timestamps.filter(t => now - t < EMAIL_WINDOW_MS);
        if (recent.length === 0) emailAttempts.delete(userId);
        else emailAttempts.set(userId, recent);
    });
}, 5 * 60_000);
emailCleanupTimer.unref?.();

// ── Request shape ────────────────────────────────────────────────────────────

const bodySchema = z.object({
    type:      z.literal('booking_confirmation'),
    bookingId: z.string().min(1, 'bookingId is required'),
    email:     z.string().email().optional(),
});

// ── Composition ──────────────────────────────────────────────────────────────

interface Composed {
    subject:     string;
    html:        string;
    attachments: Array<{ filename: string; content: string }>;
}

/**
 * The PDF is best-effort. A voucher that fails to render is worth logging and
 * losing; a confirmation that never arrives because of it is not.
 */
async function composeBookingConfirmation(view: BookingEmailView): Promise<Composed> {
    const attachments: Composed['attachments'] = [];

    try {
        const pdf = await renderBookingConfirmationPdf(view);
        attachments.push({
            filename: `CheapestGo-booking-${view.reference}.pdf`,
            content:  pdf.toString('base64'),
        });
    } catch (err) {
        logger.error('[/api/email] PDF render failed; sending without attachment', {
            reference: view.reference,
            error:     err instanceof Error ? err.message : String(err),
        });
    }

    return {
        subject: `Booking confirmed — ${view.hotel.name}, ${view.stay.checkInLabel} (#${view.reference})`,
        html:    renderBookingConfirmationHtml(view),
        attachments,
    };
}

// ── Route ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId    = req.user!.sub;
        const userEmail = req.user!.email;

        // Rate limit per authenticated user
        if (isEmailRateLimited(userId)) {
            throw new AppError(429, 'Too many requests. Please wait before sending another email.', 'RATE_LIMITED');
        }

        const body = bodySchema.parse(req.body);

        // Prevent impersonation — the target email must match the authenticated user
        if (body.email && body.email !== userEmail) {
            throw new AppError(403, 'Forbidden: cannot send email to a different address', 'FORBIDDEN');
        }

        // Always send to the authenticated user's email
        const toEmail = userEmail;

        if (!config.RESEND_API_KEY) {
            throw new AppError(500, 'Email service is not configured', 'EMAIL_NOT_CONFIGURED');
        }

        // Scoped to the caller: a booking they do not own is indistinguishable
        // from one that does not exist.
        const view = await loadBookingEmailView(body.bookingId, userId);
        if (!view) {
            throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
        }

        const { subject, html, attachments } = await composeBookingConfirmation(view);

        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization:  `Bearer ${config.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from:    FROM_ADDRESS,
                to:      [toEmail],
                subject,
                html,
                ...(attachments.length > 0 ? { attachments } : {}),
            }),
        });

        if (!emailRes.ok) {
            const errBody = await emailRes.text();
            logger.error('[/api/email] Resend error', { status: emailRes.status, body: errBody });
            throw new AppError(502, 'Failed to send email', 'EMAIL_SEND_FAILED');
        }

        const result = await emailRes.json();
        return res.json({
            success:      true,
            id:           (result as any).id,
            hasAttachment: attachments.length > 0,
        });
    } catch (err) {
        next(err);
    }
});

export default router;
