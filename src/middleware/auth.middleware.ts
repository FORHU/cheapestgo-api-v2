import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { AppError } from '@/middleware/error.middleware';
import { JwtPayload } from '@/types';
import { readSessionToken } from '@/lib/auth/cookie';
import { isRevoked } from '@/lib/auth/sessionRevocation';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
    const token = readSessionToken(req);

    if (!token) return next(new AppError(401, 'Unauthorized', 'AUTH_REQUIRED'));

    let payload: JwtPayload;
    try {
        payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    } catch {
        return next(new AppError(401, 'Invalid or expired token', 'AUTH_INVALID'));
    }

    // A valid token can still belong to a session the account has ended — by changing its
    // password. Same answer as an expired one, so the client signs out the same way.
    if (await isRevoked(payload)) {
        return next(new AppError(401, 'Invalid or expired token', 'AUTH_INVALID'));
    }

    req.user = payload;
    next();
}

export const requireAuth = authenticate;

/**
 * Read the session when there is one, and carry on when there is not.
 *
 * For a caller authenticated by something other than a session — the mobile app sends a shared
 * key — where a signed-in traveller should still be recognised as themselves.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
    const token = readSessionToken(req);
    if (token) {
        try {
            const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
            // A revoked session is anonymous, not an error: this door never refused anyone.
            if (!(await isRevoked(payload))) req.user = payload;
        } catch { /* anonymous */ }
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
