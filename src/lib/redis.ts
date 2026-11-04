import Redis from 'ioredis';
import { config } from '@/config';
import { logger } from '@/lib/logger';

/**
 * Backs off and keeps trying, rather than giving up on the first refusal.
 *
 * This used to return `null` — one attempt at boot, then never again. Caching was therefore not
 * a function of whether Redis was running but of whether it happened to be running at the moment
 * this process started: a blip during a deploy, or Redis starting a second later than the API,
 * left every search going to the supplier until somebody redeployed. On 2026-11-03 production
 * had been in exactly that state, and with OTV counting our calls it is not a free one to be in.
 *
 * Ten seconds between attempts is six a minute against a Redis that genuinely is not there —
 * cheap enough to leave running, and it means one coming up later is picked up on its own.
 * `enableOfflineQueue: false` stays: while it is down, commands fail immediately rather than
 * queueing, so a reconnecting cache cannot turn into a stalled request.
 */
export const redis = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
});

/**
 * Logged on the edges only. The retry loop above means a Redis that is down produces an error
 * every ten seconds forever, and a line each time would bury everything else in the log — so
 * this reports the transitions, which is the part anyone reading the log needs.
 */
let connected = false;

// Must listen to suppress Node's unhandled-error crash; the transition logs below are the record.
redis.on('error', () => {});

redis.on('connect', () => {
    if (!connected) logger.info('[redis] connected — caching enabled');
    connected = true;
});

redis.on('end', () => {
    if (connected) logger.warn('[redis] connection lost — caching disabled until it returns');
    connected = false;
});
