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
    const brandName = process.env.BRAND_NAME ?? 'CheapestGo';
    const brandLogo = process.env.BRAND_LOGO ?? '/Web_Logo_Transparent.png';
    const siteUrl = process.env.SITE_URL ?? 'https://cheapestgo.com';
    const logoUrl = `${siteUrl}${brandLogo}`;

    const open = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
    <tr><td style="background:#ffffff;padding:28px 32px;border-radius:16px 16px 0 0;border:1px solid #e2e8f0;border-bottom:none;text-align:center;">
      <img src="${logoUrl}" alt="${brandName}" height="64" style="display:inline-block;height:64px;width:auto;" />
    </td></tr>
    <tr><td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:28px 32px;text-align:center;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
      <h1 style="color:white;margin:0;font-size:26px;font-weight:700;">Booking Confirmed!</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Your reservation is all set</p>
    </td></tr>
    <tr><td style="background:#ffffff;padding:32px;border:1px solid #e2e8f0;border-top:none;">`;

    const close = `    </td></tr>
    <tr><td style="background:#f8fafc;padding:20px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;text-align:center;">
      <img src="${logoUrl}" alt="${brandName}" height="40" style="display:inline-block;height:40px;width:auto;opacity:0.5;margin-bottom:10px;" />
      <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">This email was sent by ${brandName}<br>&copy; ${new Date().getFullYear()} All rights reserved</p>
    </td></tr>
  </table>
  </td></tr>
</table>
</body>
</html>`;

    return `${open}
    <p>Hi <strong>${travelerName ?? email}</strong>,</p>
    <p>Your booking has been confirmed. Here are your details:</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      ${bookingId    ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#6b7280;">Booking ID</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;font-family:monospace;">${bookingId}</td></tr>` : ''}
      ${propertyName ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#6b7280;">Property</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">${propertyName}</td></tr>` : ''}
      ${checkIn      ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#6b7280;">Check-in</td><td style="padding:8px;border-bottom:1px solid #eee;">${checkIn}</td></tr>` : ''}
      ${checkOut     ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#6b7280;">Check-out</td><td style="padding:8px;border-bottom:1px solid #eee;">${checkOut}</td></tr>` : ''}
      ${totalPrice != null ? `<tr><td style="padding:8px;color:#6b7280;font-weight:600;">Total</td><td style="padding:8px;font-weight:700;font-size:18px;color:#059669;">${currency ?? ''}${totalPrice}</td></tr>` : ''}
    </table>
    <p style="margin-top:24px;">Thank you for booking with ${brandName}!</p>
    <p style="color:#888;font-size:12px;">If you did not make this booking, please contact support immediately.</p>
${close}`;
}

function buildSimpleHtml(title: string, intro: string, lines: string[]): string {
    const brandName = process.env.BRAND_NAME ?? 'CheapestGo';
    const rows = lines.map(l => `<p style="margin:4px 0;color:#374151;">${l}</p>`).join('');
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f1f5f9;padding:32px 16px;">
<table width="560" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
<tr><td><h2 style="color:#1e293b;margin-top:0;">${title}</h2>
<p style="color:#374151;">${intro}</p>${rows}
<p style="margin-top:24px;color:#94a3b8;font-size:12px;">&copy; ${new Date().getFullYear()} ${brandName}</p>
</td></tr></table></body></html>`;
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

            case 'booking_amendment': {
                const { bookingId, guestName, hotelName, changes } = body;
                subject = `Booking Updated${bookingId ? ` — #${bookingId}` : ''}`;
                html    = buildSimpleHtml(
                    'Booking Updated',
                    `Hi ${guestName || toEmail}, your booking has been updated.`,
                    [
                        bookingId ? `Booking ID: ${bookingId}` : '',
                        hotelName ? `Property: ${hotelName}` : '',
                        changes   ? `Changes: ${changes}` : '',
                    ].filter(Boolean)
                );
                break;
            }

            case 'booking_refund': {
                const { bookingId, refundAmount, currency } = body;
                subject = `Refund Processed${bookingId ? ` — #${bookingId}` : ''}`;
                html    = buildSimpleHtml(
                    'Refund Processed',
                    `Your refund has been processed.`,
                    [
                        bookingId     ? `Booking ID: ${bookingId}` : '',
                        refundAmount  ? `Refund Amount: ${currency ?? ''} ${refundAmount}` : '',
                    ].filter(Boolean)
                );
                break;
            }

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
