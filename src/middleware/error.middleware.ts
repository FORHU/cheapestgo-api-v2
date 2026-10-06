import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '@/lib/logger';

export class AppError extends Error {
    /**
     * @param details  Fields the client needs to act on the error — the new price to
     *   re-confirm, the booking a duplicate collides with. Sent in the response body
     *   beside `error` and `message`.
     */
    constructor(
        public statusCode: number,
        message: string,
        public code?: string,
        public details?: Record<string, unknown>,
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
        // Details go out, where an error carries them. Six call sites attached fields with
        // Object.assign — the price a customer had to re-confirm, the booking a duplicate
        // collided with, the offer that replaced an expired one — and this handler sent
        // none of them, so every one of those prompts reached the client with nothing to
        // show. Written first so `error` and `message` cannot be overwritten by a detail.
        return res.status(err.statusCode).json({
            ...(err.details ?? {}),
            error: err.code ?? 'APP_ERROR',
            message: err.message,
        });
    }

    logger.error('[unhandled]', { err });
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
}
