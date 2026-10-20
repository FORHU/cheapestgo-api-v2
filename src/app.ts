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

// Caddy on the dev host proxies /api/v2 to this container, so every request arrives from
// 127.0.0.1 with the real address in X-Forwarded-For. Left unset, express-rate-limit keys
// all four limiters on the proxy's address — one shared bucket, so in production mode the
// 10-per-15-minutes auth limit is spent by whoever logs in first and everyone else is
// locked out. express-rate-limit says so on boot: ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
//
// A hop count, not `true`: `true` trusts the leftmost X-Forwarded-For entry, which the
// client writes, so anyone could forge an address and get a fresh bucket per request.
//
// ponytail: 1 is right for one reverse proxy. Put Cloudflare or an ALB in front and this
// becomes 2 — req.ip would otherwise be the CDN's address and the shared bucket is back.
app.set('trust proxy', 1);

app.use(helmet());

// SITE_URL is always allowed. It is the frontend this API exists to serve, and
// leaving it to CORS_ORIGIN means every port change needs the same edit made
// twice — which is how the app-v2 move to 3002 broke every request from it.
// CORS_ORIGIN keeps its own job: additional origins (production domains, LAN
// addresses, mobile web) that SITE_URL does not describe.
const allowedOrigins = Array.from(new Set(
    [config.SITE_URL, ...config.CORS_ORIGIN]
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
