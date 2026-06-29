import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '@/lib/logger';

export class AppError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public code?: string,
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export function errorMiddleware(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction,
) {
    if (err instanceof ZodError) {
        return res.status(422).json({
            error: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: err.flatten().fieldErrors,
        });
    }

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.code ?? 'APP_ERROR',
            message: err.message,
        });
    }

    logger.error('[unhandled]', { err });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
}
