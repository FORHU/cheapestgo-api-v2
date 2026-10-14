import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/middleware/error.middleware';
import { adminSettingsService } from '@/services/adminSettings.service';

/**
 * The mobile app's operations screen: what it has booked, which devices are registered, and the
 * key it authenticates with (C5, ported from v1's /api/admin/mobile).
 *
 * Bookings are filtered to Duffel because that is the only provider the app books through — a
 * number that silently included web bookings would make the app look busier than it is, which is
 * the opposite of what an operations screen is for.
 */

const PAGE_SIZE = 20;

/** Where the app's key lives when it is rotated rather than configured in the environment. */
const MOBILE_KEY_SETTING = 'mobile_api_key';

export class AdminMobileService {
    async overview(pageParam: unknown) {
        const page = Math.max(1, Number.parseInt(String(pageParam ?? '1'), 10) || 1);
        const skip = (page - 1) * PAGE_SIZE;

        const [bookings, total, confirmed, pending, failed, devices, deviceCount, settings] = await Promise.all([
            prisma.flight_bookings.findMany({
                where:   { provider: 'duffel' },
                orderBy: { created_at: 'desc' },
                skip,
                take: PAGE_SIZE,
                select: { id: true, pnr: true, status: true, payment_intent_id: true, created_at: true, session_id: true },
            }),
            prisma.flight_bookings.count({ where: { provider: 'duffel' } }),
            prisma.flight_bookings.count({ where: { provider: 'duffel', status: { in: ['confirmed', 'ticketed', 'booked'] } } }),
            prisma.flight_bookings.count({ where: { provider: 'duffel', status: { in: ['pending', 'awaiting_ticket'] } } }),
            prisma.flight_bookings.count({ where: { provider: 'duffel', status: { in: ['failed', 'cancelled'] } } }),
            prisma.device_push_tokens.findMany({ orderBy: { created_at: 'desc' }, take: PAGE_SIZE }),
            prisma.device_push_tokens.count(),
            adminSettingsService.getSettings(),
        ]);

        const storedKey = typeof settings[MOBILE_KEY_SETTING] === 'string' ? settings[MOBILE_KEY_SETTING] as string : null;
        const envKey = process.env.MOBILE_API_KEY ?? null;
        const activeKey = storedKey ?? envKey;

        return {
            bookings,
            counts: { total, confirmed, pending, failed },
            page,
            pageSize: PAGE_SIZE,
            totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
            devices,
            deviceCount,
            // Never the key itself: this screen says whether one is configured and which one is
            // in force, and a key printed into an admin page is a key in a screenshot.
            apiKey: {
                configured: Boolean(activeKey),
                source:     storedKey ? 'settings' : envKey ? 'environment' : 'none',
                masked:     activeKey ? `${activeKey.slice(0, 6)}…${activeKey.slice(-4)}` : null,
            },
        };
    }

    /**
     * Mint a new key for the app and store it.
     *
     * Returned once, in full, because this is the only moment it can be copied into the app's
     * configuration. Afterwards the screen shows it masked like any other.
     */
    async rotateApiKey(actor: { id?: string; email?: string }) {
        const key = `cgm_${randomBytes(24).toString('hex')}`;
        await adminSettingsService.saveSettings({ [MOBILE_KEY_SETTING]: key });
        await adminSettingsService.logAction({
            action: 'rotate_mobile_api_key',
            adminId: actor.id,
            adminEmail: actor.email,
        });
        return { key };
    }

    /** Remove a device that should no longer receive notifications. */
    async deleteDevice(id: unknown) {
        if (typeof id !== 'string' || !id) throw new AppError(400, 'id is required', 'VALIDATION_ERROR');
        const { count } = await prisma.device_push_tokens.deleteMany({ where: { id } });
        return { deleted: count };
    }
}

export const adminMobileService = new AdminMobileService();
