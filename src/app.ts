import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { config } from '@/config';
import { defaultRateLimit } from '@/middleware/rate-limit.middleware';
import { errorMiddleware } from '@/middleware/error.middleware';
import routes from '@/routes';
import webhookRoutes from '@/routes/webhooks.route';
import internalRouter from '@/routes/internal.route';
import internalDuffelRouter from '@/routes/internal-duffel.route';

const app = express();

app.use(helmet());
app.use(cors({
    origin: config.CORS_ORIGIN,
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

// Internal routes — both mount POST /create-booking at the same path.
// Mystifly router runs first; if provider !== 'mystifly' it falls through
// to the Duffel router which handles provider === 'duffel'.
const internalCombined = Router();
internalCombined.use(internalRouter);
internalCombined.use(internalDuffelRouter);
app.use('/api/internal', internalCombined);

export default app;
