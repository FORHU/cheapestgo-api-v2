import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthController } from '@/controllers/auth.controller';
import { authRateLimit } from '@/middleware/rate-limit.middleware';
import { authenticate } from '@/middleware/auth.middleware';
import { AppError } from '@/middleware/error.middleware';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
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

// ─── Google OAuth ────────────────────────────────────────────────────────────

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure:   config.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path:     '/',
};

/**
 * GET /api/auth/google
 *
 * Redirects the user to Google's OAuth consent screen.
 * Generates a random state token, stores it in Redis with a 10-minute TTL,
 * and also sets it as an httpOnly cookie for the callback to verify.
 */
router.get('/google', async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!config.GOOGLE_CLIENT_ID) {
            throw new AppError(500, 'Google OAuth is not configured', 'OAUTH_NOT_CONFIGURED');
        }

        const state = crypto.randomUUID();

        // Store state in Redis (10 min TTL) to survive cross-server redirects
        await redis.set(`oauth:state:${state}`, '1', 'EX', 600);

        // Also cookie-store so the callback can find it on the same server
        res.cookie('oauth_state', state, { ...COOKIE_OPTIONS, maxAge: 600_000 });
        res.cookie('oauth_provider', 'google', { ...COOKIE_OPTIONS, maxAge: 600_000 });

        const redirectUri = `${config.API_URL}/api/auth/google/callback`;

        const params = new URLSearchParams({
            client_id:     config.GOOGLE_CLIENT_ID,
            redirect_uri:  redirectUri,
            response_type: 'code',
            scope:         'openid email profile',
            state,
            access_type:   'offline',
            prompt:        'select_account',
        });

        return res.redirect(
            `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
        );
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/auth/google/callback?code=...&state=...
 *
 * Handles the redirect back from Google after the user grants consent.
 * - Verifies state against Redis (CSRF protection)
 * - Exchanges the one-time code for tokens
 * - Fetches the user's profile from Google
 * - Upserts the user in the DB
 * - Issues a JWT access_token cookie and redirects to SITE_URL
 */
router.get('/google/callback', async (req: Request, res: Response, next: NextFunction) => {
    const { code, state, error: oauthErr } = req.query as Record<string, string>;

    const failRedirect = (reason: string) =>
        res.redirect(`${config.SITE_URL}/login?error=${reason}`);

    try {
        if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
            return failRedirect('oauth_not_configured');
        }

        if (oauthErr) {
            console.error('[OAuth/google] Google returned error:', oauthErr);
            return failRedirect('oauth_denied');
        }

        if (!code || !state) {
            return failRedirect('oauth_missing_params');
        }

        // Verify state — check Redis first, fall back to cookie
        const redisKey = `oauth:state:${state}`;
        const redisOk  = await redis.get(redisKey);
        const cookieState = req.cookies?.oauth_state;

        if (!redisOk && state !== cookieState) {
            console.error('[OAuth/google] State mismatch — possible CSRF');
            return failRedirect('oauth_state');
        }

        // Consume the state so it can't be replayed
        if (redisOk) await redis.del(redisKey);
        res.clearCookie('oauth_state', COOKIE_OPTIONS);
        res.clearCookie('oauth_provider', COOKIE_OPTIONS);

        // Exchange authorization code for tokens
        const redirectUri = `${config.API_URL}/api/auth/google/callback`;
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id:     config.GOOGLE_CLIENT_ID,
                client_secret: config.GOOGLE_CLIENT_SECRET,
                redirect_uri:  redirectUri,
                grant_type:    'authorization_code',
            }),
        });

        if (!tokenRes.ok) {
            const body = await tokenRes.text();
            console.error('[OAuth/google] Token exchange failed:', body);
            return failRedirect('oauth_failed');
        }

        const tokens = await tokenRes.json() as { access_token: string; id_token: string };

        // Fetch user profile from Google
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!profileRes.ok) {
            console.error('[OAuth/google] Userinfo request failed:', profileRes.status);
            return failRedirect('oauth_failed');
        }

        const googleUser = await profileRes.json() as {
            id: string;
            email: string;
            given_name?: string;
            family_name?: string;
            picture?: string;
            verified_email?: boolean;
        };

        if (!googleUser.email) {
            return failRedirect('oauth_no_email');
        }

        // Upsert user in DB
        const user = await prisma.users.upsert({
            where:  { email: googleUser.email.toLowerCase() },
            create: {
                email:      googleUser.email.toLowerCase(),
                role:       'user',
                first_name: googleUser.given_name  ?? null,
                last_name:  googleUser.family_name ?? null,
                avatar_url: googleUser.picture     ?? null,
            },
            update: {
                // Only set avatar if the user doesn't already have one
                ...(googleUser.picture ? { avatar_url: googleUser.picture } : {}),
                updated_at: new Date(),
            },
        });

        // Issue JWT (same pattern as AuthService.generateTokens)
        const payload = { sub: user.id, email: user.email, role: user.role };
        const accessToken = jwt.sign(payload, config.JWT_SECRET, {
            expiresIn: config.JWT_EXPIRES_IN as any,
        });

        res.cookie('access_token', accessToken, {
            ...COOKIE_OPTIONS,
            maxAge: 86400_000, // 1 day
        });

        return res.redirect(config.SITE_URL);
    } catch (err: any) {
        console.error('[OAuth/google] Callback error:', err.message);
        return failRedirect('oauth_failed');
    }
});

export default router;
