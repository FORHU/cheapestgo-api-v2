import Redis from 'ioredis';
import { config } from '@/config';
import { logger } from '@/lib/logger';

export const redis = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null, // no retries — fail fast, server.ts logs the result
});

// Must listen to suppress Node's unhandled-error crash; server.ts owns the log.
redis.on('error', () => {});
redis.on('connect', () => { logger.info('[redis] connected'); });
