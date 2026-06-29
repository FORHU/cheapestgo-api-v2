import './config'; // validates env vars on startup
import app from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

async function main() {
    await prisma.$connect();
    logger.info('[db] connected');

    await redis.connect();

    app.listen(config.PORT, () => {
        logger.info(`[server] running on port ${config.PORT} (${config.NODE_ENV})`);
    });
}

main().catch((err) => {
    logger.error('[startup] fatal error', { err });
    process.exit(1);
});
