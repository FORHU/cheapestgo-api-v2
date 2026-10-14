import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import { defaultRateLimit } from '@/middleware/rate-limit.middleware';
import { errorMiddleware } from '@/middleware/error.middleware';
import routes from '@/routes';
import webhookRoutes from '@/routes/webhooks.route';
import internalRouter from '@/routes/internal.route';

const app = express();

app.use(helmet());

// SITE_URL is always allowed. It is the frontend this API exists to serve, and
// leaving it to CORS_ORIGIN means every port change needs the same edit made
// twice — which is how the app-v2 move to 3002 broke every request from it.
// CORS_ORIGIN keeps its own job: additional origins (production domains, LAN
// addresses, mobile web) that SITE_URL does not describe.
const allowedOrigins = Array.from(new Set(
    [config.SITE_URL, ...config.CORS_ORIGIN.split(',')]
        .map(o => o.trim())
        .filter(Boolean),
));

app.use(cors({
    origin: (origin, cb) => {
        // A missing Origin header is a same-origin or non-browser caller (curl,
        // server-to-server, health checks) — there is nothing to police.
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        // Refusing an origin is this policy working, not the process failing.
        // Passing an Error here would surface it as an unhandled 500 with a
        // stack; the request is instead answered 403 by the handler below.
        return cb(null, false);
    },
    credentials: true,
}));

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
        logger.warn({ message: `[cors] refused origin ${origin}`, path: req.path });
        return res.status(403).json({ success: false, error: 'Origin not allowed', code: 'CORS_ORIGIN_REFUSED' });
    }
    return next();
});

// IMPORTANT: Stripe webhooks need the raw request body for signature verification.
// Mount the webhook router BEFORE express.json() so that express.raw() inside
// the webhook handler receives the unmodified buffer.
app.use('/api/v2/webhooks', webhookRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(config.COOKIE_SECRET));
app.use(defaultRateLimit);

app.use('/api/v2', routes);

app.use(errorMiddleware);

// Internal routes — unified handler for both Duffel and Mystifly providers.
app.use('/api/internal', internalRouter);

export default app;
