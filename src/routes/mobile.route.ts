/**
 * /api/mobile — mobile-app-specific endpoints
 *
 * version-check    GET  public  — startup version gate
 * landing          GET  public  — home screen data (deals, destinations)
 * register-device  POST X-Mobile-Api-Key — Expo push token registration
 * trips            GET  auth    — user's hotel + flight bookings
 * log              POST public  — client-side error/event logging
 * flights/book     POST X-Mobile-Api-Key — the same booking service the website uses
 * flights/confirm  POST X-Mobile-Api-Key — the same confirmation
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, optionalAuth } from '@/middleware/auth.middleware';
import { searchRateLimit as mobileSearchRateLimit } from '@/middleware/rate-limit.middleware';
import { FlightsService } from '@/services/flights.service';
import { prisma } from '@/lib/prisma';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAdminSetting(key: string): Promise<string | null> {
    try {
        const row = await prisma.admin_settings.findUnique({ where: { key } });
        const val = row?.value;
        if (val === null || val === undefined) return null;
        if (typeof val === 'string') return val;
        // Prisma returns JSON — strip outer quotes when value was stored as a JSON string
        return typeof val === 'object' ? JSON.stringify(val) : String(val);
    } catch { return null; }
}

// ── GET /api/mobile/version-check ─────────────────────────────────────────────

router.get('/version-check', async (_req: Request, res: Response) => {
    const [min, latest, force, msg] = await Promise.all([
        getAdminSetting('mobile_min_version'),
        getAdminSetting('mobile_latest_version'),
        getAdminSetting('mobile_force_update'),
        getAdminSetting('mobile_update_message'),
    ]);

    res.json({
        minVersion:    min    ?? '1.0.0',
        latestVersion: latest ?? '1.0.0',
        forceUpdate:   force === 'true' || force === '"true"',
        updateMessage: msg ?? 'A new version of CheapestGo is available.',
    });
});

// ── GET /api/mobile/landing ───────────────────────────────────────────────────

router.get('/landing', async (req: Request, res: Response) => {
    try {
        const proto  = req.headers['x-forwarded-proto'] ?? req.protocol;
        const host   = req.headers.host;
        const origin = host ? `${proto}://${host}` : '';

        const absolutize = (url: string | null | undefined) => {
            if (!url) return '';
            if (/^https?:\/\//i.test(url)) return url;
            return url.startsWith('/') ? `${origin}${url}` : `${origin}/${url}`;
        };

        // Hotel deals from DB
        const hotelDeals = await prisma.hotel_deals.findMany({
            take: 12,
            orderBy: { updated_at: 'desc' },
        }).catch(() => []);

        const weekendDeals = hotelDeals.map((d: any) => ({
            hotelCode:   d.hotel_code,
            name:        d.name,
            location:    d.location,
            destination: d.destination,
            price:       d.price ? Number(d.price) : null,
            currency:    d.currency,
            image:       d.hotel_code
                ? absolutize(`/api/v2/hotels/photo?hotelCode=${encodeURIComponent(d.hotel_code)}`)
                : absolutize(d.image_url),
            rating:      d.rating ? Number(d.rating) : null,
            badge:       d.badge,
        }));

        // Popular destinations from DB
        const destRows = await prisma.popular_destinations.findMany({
            take: 10,
            orderBy: { created_at: 'desc' },
        }).catch(() => []);

        const popularDestinations = destRows.map((d: any) => ({
            city:    d.city,
            country: d.country,
            image:   absolutize(d.image_url),
        }));

        res.json({
            flightDeals:         [],   // populated by flight search cache when available
            weekendDeals,
            popularDestinations,
            uniqueStays:         [],
            travelStyles:        [],
        });
    } catch (err) {
        console.error('[mobile/landing]', err);
        res.json({ flightDeals: [], weekendDeals: [], popularDestinations: [], uniqueStays: [], travelStyles: [] });
    }
});

// ── POST /api/mobile/register-device ─────────────────────────────────────────

router.post('/register-device', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Auth via X-Mobile-Api-Key header checked against admin_settings
        const apiKey    = req.headers['x-mobile-api-key'] as string | undefined;
        const activeKey = await getAdminSetting('mobile_api_key');

        if (!apiKey || !activeKey || apiKey !== activeKey) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { expoPushToken, platform = 'ios', appVersion, userId } = z.object({
            expoPushToken: z.string().startsWith('ExponentPushToken['),
            platform:      z.enum(['ios', 'android', 'web']).default('ios'),
            appVersion:    z.string().optional(),
            userId:        z.string().uuid().optional(),
        }).parse(req.body);

        await prisma.device_push_tokens.upsert({
            where:  { expo_push_token: expoPushToken },
            update: { platform: platform as any, app_version: appVersion ?? null, updated_at: new Date(), ...(userId ? { user_id: userId } : {}) },
            create: { expo_push_token: expoPushToken, platform: platform as any, app_version: appVersion ?? null, user_id: userId ?? null },
        } as any);

        return res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ── GET /api/mobile/trips ─────────────────────────────────────────────────────

router.get('/trips', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;

        const [hotels, flights] = await Promise.all([
            prisma.bookings.findMany({
                where:   { user_id: userId },
                orderBy: { created_at: 'desc' },
            }).catch(() => []),
            prisma.flight_bookings.findMany({
                where:   { user_id: userId },
                orderBy: { created_at: 'desc' },
            }).catch(() => []),
        ]);

        res.json({ hotels, flights });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/mobile/log ──────────────────────────────────────────────────────

router.post('/log', async (req: Request, res: Response) => {
    try {
        const { level = 'info', message, context } = req.body as {
            level?: string;
            message?: string;
            context?: Record<string, any>;
        };
        console.log(JSON.stringify({ _mobile_log: true, level, message, context, ts: new Date().toISOString() }));
    } catch { /* never fail on logging */ }
    res.json({ success: true });
});

// ── Mobile flight booking ────────────────────────────────────────────────────
//
// The app books through the same service the website does, so every rule that protects a
// booking — the same-journey match on an expired offer, the pre-order reuse that stops a second
// ticket being bought, the passport details, the guard that cancels an order nothing can pay
// for — applies here too. v1 kept a second copy of the whole flow for mobile and had to fix
// each of those twice; it had still not caught up on the order timeout.
//
// Authentication is the only real difference: the app sends a shared key rather than a session
// cookie, and CSRF does not apply to it. A signed-in traveller is identified by their JWT when
// the app has one; otherwise the booking is attributed to the guest account.

/** The app's shared key, from admin settings or the environment. */
async function mobileKeyValid(req: Request): Promise<boolean> {
    const sent = req.headers['x-mobile-api-key'] as string | undefined;
    if (!sent) return false;
    const active = (await getAdminSetting('mobile_api_key')) ?? process.env.MOBILE_API_KEY ?? null;
    return !!active && sent === active;
}

/**
 * Who a mobile booking belongs to.
 *
 * The app may carry a real session; when it does not, the booking is attributed to the guest
 * account so the row is never orphaned. Refused outright when neither exists, because a
 * booking with no owner cannot be shown to anyone afterwards.
 */
function mobileUserId(req: Request): string | null {
    return req.user?.sub ?? process.env.MOBILE_GUEST_USER_ID ?? null;
}

router.post('/flights/book', optionalAuth, mobileSearchRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!(await mobileKeyValid(req))) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const userId = mobileUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Invalid session. Please log in again.' });
        }

        const result = await new FlightsService().book({ ...req.body, userId });
        return res.json({ success: true, ...result });
    } catch (err) { next(err); }
});

router.post('/flights/confirm', optionalAuth, mobileSearchRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!(await mobileKeyValid(req))) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const userId = mobileUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Invalid session. Please log in again.' });
        }

        const { paymentIntentId, sessionId } = z.object({
            paymentIntentId: z.string().min(1),
            sessionId:       z.string().min(1),
        }).parse(req.body);

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const result  = await new FlightsService().confirm(paymentIntentId, sessionId, userId, baseUrl);
        return res.json({ success: true, ...result });
    } catch (err) { next(err); }
});

export default router;
