import { prisma } from '@/lib/prisma';
import { revokeSessions } from '@/lib/auth/sessionRevocation';

/**
 * Suspend an account, and end the sessions it already has.
 *
 * Setting `banned_at` alone only stops the next sign-in, and a signed-in customer carries on for
 * as long as their tokens live. So the two happen together, here, and both ban endpoints in the
 * admin API go through this rather than each remembering to do both.
 *
 * The column is written first because it is the record: `refresh()` and the Google callback read
 * it directly, so those stay closed even if Redis cannot take the revocation marker (see
 * `revokeSessions` for what that failure costs).
 */
export async function suspendUser(userId: string): Promise<void> {
    await prisma.users.update({ where: { id: userId }, data: { banned_at: new Date() } });
    await revokeSessions(userId, { includeThisSecond: true });
}
