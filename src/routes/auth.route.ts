import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { AuthController } from '@/controllers/auth.controller';
import { authRateLimit } from '@/middleware/rate-limit.middleware';
import { authenticate } from '@/middleware/auth.middleware';
import { AppError } from '@/middleware/error.middleware';
import { prisma } from '@/lib/prisma';
import { config } from '@/config';

const router = Router();
const controller = new AuthController();

router.post('/register', authRateLimit, controller.register);
router.post('/login',    authRateLimit, controller.login);
router.post('/logout',   authenticate,  controller.logout);
router.post('/refresh',  authRateLimit, controller.refresh);
router.get('/me',        authenticate,  controller.me);

/**
 * POST /api/auth/request-reset
 *
 * Initiates a password reset flow. Creates a 1-hour token in password_reset_tokens
 * and sends an email via Resend. Always returns 200 to prevent email enumeration.
 */
router.post('/request-reset', authRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email } = req.body;
        if (!email || typeof email !== 'string') {
            throw new AppError(400, 'Email required.', 'VALIDATION_ERROR');
        }

        const user = await prisma.users.findUnique({
            where: { email: email.toLowerCase().trim() },
            select: { id: true, email: true },
        });

        // Always return success to prevent email enumeration
        if (!user) {
            return res.json({ success: true });
        }

        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Upsert: one token per user
        await prisma.password_reset_tokens.upsert({
            where:  { user_id: user.id },
            update: { token, expires_at: expiresAt },
            create: { user_id: user.id, token, expires_at: expiresAt },
        });

        const siteUrl = config.NODE_ENV === 'production'
            ? 'https://cheapestgo.com'
            : 'http://localhost:3000';
        const resetUrl = `${siteUrl}/auth/reset-password?token=${token}`;

        if (config.RESEND_API_KEY) {
            await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: 'CheapestGo <no-reply@mail.cheapestgo.com>',
                    to:   [user.email],
                    subject: 'Reset your password',
                    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`,
                }),
            }).catch(e => console.error('[auth/request-reset] Email send failed:', e));
        }

        return res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

/**
 * PUT /api/auth/reset-password
 *
 * Consumes a reset token and sets a new password.
 * Token must exist and not be expired. Deletes the token after success.
 */
router.put('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            throw new AppError(400, 'Token and password required.', 'VALIDATION_ERROR');
        }
        if (typeof password !== 'string' || password.length < 8) {
            throw new AppError(400, 'Password must be 8+ characters.', 'VALIDATION_ERROR');
        }

        const resetToken = await prisma.password_reset_tokens.findFirst({
            where: {
                token,
                expires_at: { gt: new Date() },
            },
        });

        if (!resetToken) {
            throw new AppError(400, 'Invalid or expired reset token.', 'TOKEN_INVALID');
        }

        const password_hash = await bcrypt.hash(password, 12);

        await prisma.users.update({
            where: { id: resetToken.user_id },
            data:  { password_hash, updated_at: new Date() },
        });

        await prisma.password_reset_tokens.delete({
            where: { user_id: resetToken.user_id },
        });

        return res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

export default router;
