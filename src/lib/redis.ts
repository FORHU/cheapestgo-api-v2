import Redis from 'ioredis';
import { config } from '@/config';
import { logger } from '@/lib/logger';

export const redis = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('error', (err) => logger.error('[redis] connection error', { err }));
redis.on('connect', () => logger.info('[redis] connected'));
