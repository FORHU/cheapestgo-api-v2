import { logger } from '@/lib/logger';

/**
 * A refused permission check, logged somewhere rather than nowhere.
 *
 * #118 replaces this with a real audit row — actor and role, resource, ip, user agent,
 * correlation id, queryable and immutable. Until it lands, #106's own "done when" only asks
 * that a refusal be logged, not where; this is the smallest thing that satisfies that without
 * inventing a schema #118 would then have to migrate away from.
 */
export async function logPermissionRefusal(
    user: { sub: string; email?: string; role?: string },
    permission: string,
    path: string,
    reason: 'permission' | 'resource',
) {
    logger.warn('permission_refused', { userId: user.sub, role: user.role, permission, path, reason });
}
