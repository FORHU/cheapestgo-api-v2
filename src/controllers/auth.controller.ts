import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '@/services/auth.service';
import { config } from '@/config';

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

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure:   config.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path:     '/',
};

export class AuthController {
    private service = new AuthService();

    register = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = registerSchema.parse(req.body);
            const result = await this.service.register(data);
            res.cookie('access_token', result.accessToken, { ...COOKIE_OPTIONS, maxAge: 86400_000 });
            res.cookie('refresh_token', result.refreshToken, { ...COOKIE_OPTIONS, maxAge: 604800_000 });
            res.status(201).json({ user: result.user });
        } catch (err) { next(err); }
    };

    login = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = loginSchema.parse(req.body);
            const result = await this.service.login(data.email, data.password);
            res.cookie('access_token', result.accessToken, { ...COOKIE_OPTIONS, maxAge: 86400_000 });
            res.cookie('refresh_token', result.refreshToken, { ...COOKIE_OPTIONS, maxAge: 604800_000 });
            res.json({ user: result.user });
        } catch (err) { next(err); }
    };

    logout = async (_req: Request, res: Response, next: NextFunction) => {
        try {
            res.clearCookie('access_token', COOKIE_OPTIONS);
            res.clearCookie('refresh_token', COOKIE_OPTIONS);
            res.json({ success: true });
        } catch (err) { next(err); }
    };

    refresh = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const token = req.cookies?.refresh_token;
            const result = await this.service.refresh(token);
            res.cookie('access_token', result.accessToken, { ...COOKIE_OPTIONS, maxAge: 86400_000 });
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
