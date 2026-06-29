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

export function requireRole(...roles: string[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return next(new AppError(403, 'Forbidden', 'FORBIDDEN'));
        }
        next();
    };
}
