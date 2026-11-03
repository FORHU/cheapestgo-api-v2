import 'dotenv/config';
import './config'; // validates env vars on startup
import app from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

async function main() {
    await prisma.$connect()
        .then(() => logger.info('[db] connected'))
        .catch((err: any) => logger.warn('[db] unavailable — DB-dependent routes will fail', { err: err.message }));

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
