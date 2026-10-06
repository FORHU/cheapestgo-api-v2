import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { AppError } from '@/middleware/error.middleware';
import { JwtPayload } from '@/types';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
    const token = req.cookies?.access_token
        ?? req.headers.authorization?.replace('Bearer ', '');

    if (!token) return next(new AppError(401, 'Unauthorized', 'AUTH_REQUIRED'));

    try {
        req.user = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
        next();
    } catch {
        next(new AppError(401, 'Invalid or expired token', 'AUTH_INVALID'));
    }
}

export const requireAuth = authenticate;

/**
 * Read the session when there is one, and carry on when there is not.
 *
 * For a caller authenticated by something other than a session — the mobile app sends a shared
 * key — where a signed-in traveller should still be recognised as themselves.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
    const token = req.cookies?.access_token
        ?? req.headers.authorization?.replace('Bearer ', '');
    if (token) {
        try { req.user = jwt.verify(token, config.JWT_SECRET) as JwtPayload; } catch { /* anonymous */ }
    }
    next();
}

export function requireRole(...roles: string[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return next(new AppError(403, 'Forbidden', 'FORBIDDEN'));
        }
        next();
    };
}
