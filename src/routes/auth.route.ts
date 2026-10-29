import { Router, Request, Response, NextFunction } from 'express';
import { clampName } from '@/lib/users/names';
import { fromNoReply } from '@/lib/brand';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthController } from '@/controllers/auth.controller';
import { authRateLimit } from '@/middleware/rate-limit.middleware';
import { authenticate } from '@/middleware/auth.middleware';
import { AppError } from '@/middleware/error.middleware';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { config } from '@/config';
import { BASE_COOKIE_OPTIONS, SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/cookie';
import { originOfRequest, resolveCallbackOrigin, resolveReturnOrigin } from '@/lib/auth/returnOrigin';

const router: Router = Router();

/**
 * Where Google sends the browser back, quoted identically by both legs of the exchange.
 *
 * Google rejects the token exchange unless the authorize call and the token call name the
 * same redirect_uri, so this is one function rather than the same string written twice — v1
 * broke exactly this way when one of its two copies was edited.
 *
 * The router mounts at /api/v2, so the callback lives there too; building this without the
 * version prefix points Google at a path that 404s.
 *
 * The origin follows the request rather than being baked: the callback is where the session
 * cookie is set, and `__Host-` scopes it to that host alone, so a sign-in begun on the staff
 * host has to come back to the staff host, or the session lands somewhere the staff host
 * cannot read and `/admin` bounces to `/login` forever. `resolveCallbackOrigin` allowlists it.
 */
function googleRedirectUri(req: Request): string {
    return `${resolveCallbackOrigin(originOfRequest(req.headers))}/api/v2/auth/google/callback`;
}
const controller = new AuthController();

router.post('/register', authRateLimit, controller.register);
router.post('/login',    authRateLimit, controller.login);
router.post('/logout',                  controller.logout);
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
                    // Named for the brand the recipient actually used, not a literal (v1,
                    // C4). A password reset arriving from a company they have never heard of
                    // is the one email most likely to be read as phishing and ignored, and
                    // the sending domain must match the brand or SPF/DKIM alignment fails.
                    from: fromNoReply(),
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

// `lax`, not `strict`, and this is the door that needs it: the browser arrives here on a
// top-level navigation from Google, and a strict cookie set on that response is not sent
// on the hop that follows. The password door uses `strict`. See `lib/auth/cookie.ts`.
const COOKIE_OPTIONS = {
    ...BASE_COOKIE_OPTIONS,
    sameSite: 'lax' as const,
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

        // Store state in Redis (10 min TTL) to survive cross-server redirects.
        //
        // The value is the origin this sign-in began on, not a placeholder `1`: the staff
        // host and the storefront are different origins, and the callback has to know which
        // one to hand the session back to. It is still validated against an allowlist when
        // it is read — Redis says what was asked for, not what is permitted.
        //
        // Best-effort, and that is the point. `lib/redis.ts` is configured to fail fast —
        // `enableOfflineQueue: false` with no retries — so an unreachable Redis rejects this
        // call instantly rather than blocking. Unhandled, that reached the error middleware
        // as a plain Error and every Google sign-in answered 500 while the rest of the API
        // was healthy, which is exactly what happened on v2 production. The cookies below
        // are what the callback actually verifies against; Redis is the cross-server spare.
        const startedOn = originOfRequest(req.headers) ?? '';
        await redis.set(`oauth:state:${state}`, startedOn || '1', 'EX', 600).catch(() => {});

        // Also cookie-store so the callback can find it on the same server
        res.cookie('oauth_state', state, { ...COOKIE_OPTIONS, maxAge: 600_000 });
        res.cookie('oauth_provider', 'google', { ...COOKIE_OPTIONS, maxAge: 600_000 });
        // The origin, carried the same way as the state it belongs to. Without this the
        // cookie path knows *that* a sign-in is legitimate but not *where* it began, so a
        // staff-host sign-in completing without Redis would land on the storefront — the
        // bug `resolveReturnOrigin` exists to prevent. Allowlisted on read, as the Redis
        // copy is: a Host header is a request, not a permission.
        if (startedOn) {
            res.cookie('oauth_origin', startedOn, { ...COOKIE_OPTIONS, maxAge: 600_000 });
        }


        const params = new URLSearchParams({
            client_id:     config.GOOGLE_CLIENT_ID,
            redirect_uri:  googleRedirectUri(req),
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
 * GET /api/v2/auth/google/callback?code=...&state=...
 *
 * Handles the redirect back from Google after the user grants consent.
 * - Verifies state against Redis (CSRF protection)
 * - Exchanges the one-time code for tokens
 * - Fetches the user's profile from Google
 * - Upserts the user in the DB
 * - Issues a JWT access_token cookie and redirects to SITE_URL
 */
router.get('/google/callback', async (req: Request, res: Response) => {
    const { code, state, error: oauthErr } = req.query as Record<string, string>;

    // The sign-in page on the host this sign-in was happening on, not a baked one: the
    // callback now runs on the staff host when the flow began there, and sending a staff
    // failure to the storefront leaves them on a site with no back office on it. Falls back
    // to SITE_URL exactly as before when the origin is not allowlisted.
    const failRedirect = (reason: string) =>
        res.redirect(`${resolveReturnOrigin(originOfRequest(req.headers))}/login?error=${reason}`);

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

        // Verify state — check Redis first, fall back to cookie. Swallowing the Redis error
        // rather than letting it throw keeps a Redis outage from turning a valid sign-in
        // into `oauth_failed`: the cookie set on the way out is sufficient on its own.
        const redisKey = `oauth:state:${state}`;
        const redisOk  = await redis.get(redisKey).catch(() => null);
        const cookieState = req.cookies?.oauth_state;

        if (!redisOk && state !== cookieState) {
            console.error('[OAuth/google] State mismatch — possible CSRF');
            return failRedirect('oauth_state');
        }

        // Where this sign-in began, as recorded when the state was issued: Redis if it
        // answered, else the cookie written beside the state, else this request's own host.
        // The last is a genuine fallback rather than a guess — it is only reached when both
        // records are gone, and resolveReturnOrigin still allowlists whatever it is handed.
        const returnOrigin = resolveReturnOrigin(
            (redisOk && redisOk !== '1' ? redisOk : null)
            ?? req.cookies?.oauth_origin
            ?? originOfRequest(req.headers),
        );

        // Consume the state so it can't be replayed
        if (redisOk) await redis.del(redisKey).catch(() => {});
        res.clearCookie('oauth_state', COOKIE_OPTIONS);
        res.clearCookie('oauth_provider', COOKIE_OPTIONS);
        res.clearCookie('oauth_origin', COOKIE_OPTIONS);

        // Exchange authorization code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id:     config.GOOGLE_CLIENT_ID,
                client_secret: config.GOOGLE_CLIENT_SECRET,
                redirect_uri:  googleRedirectUri(req),
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
                // Clamped, not refused: turning someone away from their own account over the
                // length of the name Google holds for them would be the wrong answer.
                first_name: clampName(googleUser.given_name),
                last_name:  clampName(googleUser.family_name),
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

        res.cookie(SESSION_COOKIE, accessToken, {
            ...COOKIE_OPTIONS,
            maxAge: SESSION_MAX_AGE_MS,
        });

        return res.redirect(returnOrigin);
    } catch (err: any) {
        console.error('[OAuth/google] Callback error:', err.message);
        return failRedirect('oauth_failed');
    }
});

export default router;
