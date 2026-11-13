import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { AppError } from '@/middleware/error.middleware';
import { JwtPayload, UserRole } from '@/types';
import { currentRole } from '@/lib/auth/currentRole';
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

/**
 * Replace the role in the session with the one the account holds now.
 *
 * The token's role was true when it was signed and is not evidence of anything later: an admin
 * demoted an hour ago still carries `admin`, and someone promoted since carries `user`. Anything
 * that decides by role must see the account's, so the staff gates go through here and everything
 * after them reads a role that is current.
 *
 * Returns false, having already answered, when there is no account behind the token. Same answer
 * as an expired token, so the client signs out the same way.
 */
async function adoptCurrentRole(req: Request, next: NextFunction): Promise<boolean> {
    const role = await currentRole(req.user!.sub);
    if (role === null) {
        next(new AppError(401, 'Invalid or expired token', 'AUTH_INVALID'));
        return false;
    }
    req.user = { ...req.user!, role: role as UserRole };
    return true;
}

/** For routes that decide by role inside, rather than at the door: make `req.user.role` current. */
export async function withCurrentRole(req: Request, _res: Response, next: NextFunction) {
    if (!req.user) return next();
    try {
        if (await adoptCurrentRole(req, next)) next();
    } catch (err) {
        // Not falling back to the token's role: when the database cannot answer, the one thing
        // that must not happen is access granted on a role that may have been taken away.
        next(err);
    }
}

export function requireRole(...roles: string[]) {
    return async (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user) return next(new AppError(403, 'Forbidden', 'FORBIDDEN'));
        try {
            if (!(await adoptCurrentRole(req, next))) return;
            if (!roles.includes(req.user.role)) return next(new AppError(403, 'Forbidden', 'FORBIDDEN'));
            next();
        } catch (err) {
            next(err);
        }
    };
}
