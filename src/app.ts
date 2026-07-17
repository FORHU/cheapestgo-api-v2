import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { config } from '@/config';
import { defaultRateLimit } from '@/middleware/rate-limit.middleware';
import { errorMiddleware } from '@/middleware/error.middleware';
import routes from '@/routes';
import webhookRoutes from '@/routes/webhooks.route';
import internalRouter from '@/routes/internal.route';

const app = express();

app.use(helmet());
const allowedOrigins = config.CORS_ORIGIN.split(',').map(o => o.trim());
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
}));

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

app.use('/api/internal', internalRouter);

export default app;
