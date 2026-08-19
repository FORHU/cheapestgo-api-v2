import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';

export const defaultRateLimit = rateLimit({
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

export const searchRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: isDev ? 10_000 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Too many search requests.' },
});
