/**
 * POST /api/email
 *
 * Sends transactional emails via the Resend API.
 * Protected by JWT auth. Users may only send to their own email address.
 * Rate limited to 3 sends per minute per user (in-memory sliding window).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '@/middleware/auth.middleware';
import { AppError } from '@/middleware/error.middleware';
import { config } from '@/config';

const router = Router();

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildBookingConfirmationHtml(body: Record<string, any>): string {
    const { bookingId, email, travelerName, checkIn, checkOut, propertyName, totalPrice, currency } = body;
    return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Booking Confirmation</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="color:#1a1a1a;">Booking Confirmed!</h1>
  <p>Hi ${travelerName ?? email},</p>
  <p>Your booking has been confirmed. Here are your details:</p>
  <table style="width:100%;border-collapse:collapse;margin-top:16px;">
    ${bookingId    ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Booking ID</td><td style="padding:8px;border-bottom:1px solid #eee;">${bookingId}</td></tr>` : ''}
    ${propertyName ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Property</td><td style="padding:8px;border-bottom:1px solid #eee;">${propertyName}</td></tr>` : ''}
    ${checkIn      ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Check-in</td><td style="padding:8px;border-bottom:1px solid #eee;">${checkIn}</td></tr>` : ''}
    ${checkOut     ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Check-out</td><td style="padding:8px;border-bottom:1px solid #eee;">${checkOut}</td></tr>` : ''}
    ${totalPrice != null ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Total</td><td style="padding:8px;border-bottom:1px solid #eee;">${currency ?? ''}${totalPrice}</td></tr>` : ''}
  </table>
  <p style="margin-top:24px;">Thank you for booking with CheapestGo!</p>
  <p style="color:#888;font-size:12px;">If you did not make this booking, please contact support immediately.</p>
</body>
</html>`.trim();
}

// ── Route ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const userEmail = req.user!.email;

        // Rate limit per authenticated user
        if (isEmailRateLimited(userId)) {
            throw new AppError(429, 'Too many requests. Please wait before sending another email.', 'RATE_LIMITED');
        }

        const body = req.body as {
            type: string;
            bookingId?: string;
            email?: string;
            [key: string]: any;
        };

        if (!body.type) {
            throw new AppError(400, 'Missing required field: type', 'VALIDATION_ERROR');
        }

        // Prevent impersonation — the target email must match the authenticated user
        if (body.email && body.email !== userEmail) {
            throw new AppError(403, 'Forbidden: cannot send email to a different address', 'FORBIDDEN');
        }

        // Always send to the authenticated user's email
        const toEmail = userEmail;

        if (!config.RESEND_API_KEY) {
            throw new AppError(500, 'Email service is not configured', 'EMAIL_NOT_CONFIGURED');
        }

        let subject: string;
        let html: string;

        switch (body.type) {
            case 'booking_confirmation':
                subject = `Booking Confirmation${body.bookingId ? ` — #${body.bookingId}` : ''}`;
                html    = buildBookingConfirmationHtml({ ...body, email: toEmail });
                break;

            default:
                throw new AppError(400, `Unknown email type: ${body.type}`, 'VALIDATION_ERROR');
        }

        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization:  `Bearer ${config.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from:    'CheapestGo <no-reply@mail.cheapestgo.com>',
                to:      [toEmail],
                subject,
                html,
            }),
        });

        if (!emailRes.ok) {
            const errBody = await emailRes.text();
            console.error('[/api/email] Resend error:', errBody);
            throw new AppError(502, 'Failed to send email', 'EMAIL_SEND_FAILED');
        }

        const result = await emailRes.json();
        return res.json({ success: true, id: (result as any).id });
    } catch (err) {
        next(err);
    }
});

export default router;
