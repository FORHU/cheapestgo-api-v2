import { prisma } from '@/lib/prisma';

/**
 * The role an account holds now, or null if the account no longer exists.
 *
 * `users.role` is the authority (ADR-0003). The role in a session token is a copy made at
 * sign-in, good for as long as the token lives — a day — so taking a role away, or giving one,
 * does nothing to a session that already exists. Staff gates read this instead.
 *
 * One lookup by primary key. It is not cached: the point is that a change applies to the very
 * next request, and a cache would put back the delay this removes.
 */
export async function currentRole(userId: string): Promise<string | null> {
    const row = await prisma.users.findUnique({ where: { id: userId }, select: { role: true } });
    return row?.role ?? null;
}
