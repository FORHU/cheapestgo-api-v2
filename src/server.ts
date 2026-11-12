import 'dotenv/config';
import './config'; // validates env vars on startup
import app from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { assertStripeAccountAtBoot } from './lib/stripeAccount';

async function main() {
    await prisma.$connect()
        .then(() => logger.info('[db] connected'))
        .catch((err: any) => logger.warn('[db] unavailable — DB-dependent routes will fail', { err: err.message }));

    // The mirror of config.ts's supplier guard, and the one it could not cover: a Stripe key
    // paired with the wrong database (ADR-0002, amended). Awaited, because serving a single
    // request with the wrong key is the thing being prevented. It refuses to start only on a
    // demonstrated mismatch — an unreachable Stripe or an unset expectation lets the process up,
    // since taking the fleet down over a supplier's bad minute is the worse failure.
    if (!await assertStripeAccountAtBoot({
        info:  (msg) => logger.info(msg),
        warn:  (msg) => logger.warn(msg),
        error: (msg) => logger.error(msg),
    })) {
        process.exit(1);
    }

    // Not awaited. The client retries with a backoff now, so awaiting could hold the port shut
    // while it worked through them — and the API serves every route without a cache, just more
    // slowly. It connects in the background and `lib/redis` logs the transition when it lands.
    void redis.connect().catch((err) => {
        logger.warn('[redis] unavailable — caching disabled, will keep trying', { err: err.message });
    });

    app.listen(config.PORT, () => {
        logger.info(`[server] running on port ${config.PORT} (${config.NODE_ENV})`);
    });
}

main().catch((err) => {
    logger.error('[startup] fatal error', { err });
    process.exit(1);
});
