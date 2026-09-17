/**
 * Raise something for a human to look at.
 *
 * Never throws: a notification is a message about work that has already happened, so failing
 * to send it must not undo the work. Callers treat it as fire-and-forget.
 *
 * A word of caution about volume, from the one time this failed: a genuine
 * `CRITICAL: DB Save Failed` went unread for a month, buried under 60 identical
 * `Auto-Recovery Complete` rows the flight reconciler emitted over two days. A job that
 * notifies on every run is a job nobody reads — notify on the thing that needs a decision.
 */

import { prisma } from '@/lib/prisma';

export type NotificationType = 'alert' | 'booking' | 'system';

export async function createNotification(
    title: string,
    description: string,
    type: NotificationType = 'alert',
): Promise<void> {
    await prisma.notifications.create({
        data: { title, description, type, user_id: null } as any,
    }).catch((err: any) => console.error('[notify] could not create notification:', err?.message));
}
