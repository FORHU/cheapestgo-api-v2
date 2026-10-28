import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '@/services/auth.service';
import {
    BASE_COOKIE_OPTIONS, SESSION_COOKIE, LEGACY_SESSION_COOKIE, SESSION_MAX_AGE_MS,
} from '@/lib/auth/cookie';

const registerSchema = z.object({
    email:      z.string().email(),
    password:   z.string().min(8),
    first_name: z.string().optional(),
    last_name:  z.string().optional(),
});

const loginSchema = z.object({
    email:    z.string().email(),
    password: z.string().min(1),
});

// `sameSite` is this door's own: password sign-in has no cross-site step to survive, so it
// takes the stricter value. The Google callback sets `lax` for the opposite reason. Name,
// `secure`, `path` and the ban on `domain` come from the shared module.
const COOKIE_OPTIONS = {
    ...BASE_COOKIE_OPTIONS,
    sameSite: 'strict' as const,
};

export class AuthController {
    private service = new AuthService();

    register = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = registerSchema.parse(req.body);
            const result = await this.service.register(data);
            res.cookie(SESSION_COOKIE, result.accessToken, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_MS });
            res.cookie('refresh_token', result.refreshToken, { ...COOKIE_OPTIONS, maxAge: 604800_000 });
            res.status(201).json({ user: result.user });
        } catch (err) { next(err); }
    };

    login = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = loginSchema.parse(req.body);
            const result = await this.service.login(data.email, data.password);
            res.cookie(SESSION_COOKIE, result.accessToken, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_MS });
            res.cookie('refresh_token', result.refreshToken, { ...COOKIE_OPTIONS, maxAge: 604800_000 });
            res.json({ user: result.user });
        } catch (err) { next(err); }
    };

    logout = async (_req: Request, res: Response, next: NextFunction) => {
        try {
            // Both names: a session issued before the rename is still in the browser under
            // the old one, and clearing only the new one would leave someone signed in
            // after they asked to be signed out.
            res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
            res.clearCookie(LEGACY_SESSION_COOKIE, COOKIE_OPTIONS);
            res.clearCookie('refresh_token', COOKIE_OPTIONS);
            res.json({ success: true });
        } catch (err) { next(err); }
    };

    refresh = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const token = req.cookies?.refresh_token;
            const result = await this.service.refresh(token);
            res.cookie(SESSION_COOKIE, result.accessToken, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_MS });
            res.json({ success: true });
        } catch (err) { next(err); }
    };

    me = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = await this.service.getUser(req.user!.sub);
            res.json({ user });
        } catch (err) { next(err); }
    };
}
