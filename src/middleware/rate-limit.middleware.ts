import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * The nearby-place lookup carries its own limit (photosRateLimit): one property page sends ~50
 * requests to it, which would exhaust the global budget. The global limiter runs before the
 * router, so the full URL is checked, minus its query string.
 */
export function isPoiPhotoRequest(req: Pick<Request, 'originalUrl'>): boolean {
    const path = req.originalUrl.split('?')[0].replace(/\/+$/, '');
    return path === '/api/v2/photos/poi';
}

export const defaultRateLimit = rateLimit({
    skip: isPoiPhotoRequest,
    windowMs: 15 * 60 * 1000,
    max: isDev ? 10_000 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Too many requests, please try again later.' },
});

export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 10_000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Too many auth attempts, please try again later.' },
});

/**
 * Rendering a PDF is real CPU on the request path, and the receipt route is reachable
 * without a session, so it carries its own limit rather than the default one. Keyed by the
 * caller when there is one, so a household behind a single address is not rate-limited by
 * its neighbours. Generous: a receipt is downloaded once or twice.
 */
export const invoiceRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: isDev ? 10_000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.sub ?? req.ip ?? 'unknown',
    message: { error: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' },
});

export const searchRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: isDev ? 10_000 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Too many search requests.' },
});

/**
 * Nearby-place lookup (/photos/poi) only. Its Google lookups are cached in Redis with in-flight
 * dedup and its photos are kept by the browser for a day, so it can take far more than the global
 * budget. The other photo routes have no server-side cache and stay on the global limit.
 */
export const photosRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: isDev ? 10_000 : 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' },
});
