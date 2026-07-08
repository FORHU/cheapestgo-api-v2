/**
 * Cron endpoints — all require Bearer <CRON_SECRET> authorization.
 *
 * Designed to be called by GitHub Actions, AWS EventBridge, or any scheduler
 * that can pass the Authorization header.
 */

import { Router, Request, Response, NextFunction } from 'express';
import zlib from 'zlib';
import { config } from '@/config';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { getDuffelBalances, duffelHeaders } from '@/lib/flights/duffel';
import { searchFlights } from '@/lib/flights/search';
import { FlightOffer } from '@/types/flights';

const router = Router();

// ── Auth guard ────────────────────────────────────────────────────────────────

function requireCronSecret(req: Request, res: Response, next: NextFunction) {
    const cronSecret = config.CRON_SECRET;
    if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

router.use(requireCronSecret);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createNotification(title: string, description: string) {
    await prisma.notifications.create({
        data: { title, description, type: 'alert', user_id: null } as any,
    }).catch(err => console.error('[cron] notification create failed:', err.message));
}

async function sendEmail(to: string, subject: string, html: string) {
    if (!config.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not set' };
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: 'CheapestGo <no-reply@mail.cheapestgo.com>', to: [to], subject, html }),
    });
    return res.ok ? { ok: true } : { ok: false, error: await res.text().catch(() => 'unknown') };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/cleanup-sessions
// Schedule: daily at 04:00 UTC  (0 4 * * *)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/cleanup-sessions', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [sessionsDeleted, tokensDeleted] = await Promise.all([
            prisma.$executeRaw`DELETE FROM sessions WHERE expires_at < NOW()`,
            prisma.$executeRaw`DELETE FROM password_reset_tokens WHERE expires_at < NOW()`,
        ]);
        console.log(`[cron/cleanup-sessions] Deleted ${sessionsDeleted} sessions, ${tokensDeleted} reset tokens`);
        return res.json({ ok: true, sessionsDeleted, tokensDeleted });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/cache-cleanup
// Schedule: daily at 03:00 UTC  (0 3 * * *)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/cache-cleanup', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [cacheDeleted, reviewsDeleted] = await Promise.all([
            // Delete expired hotel search cache rows
            prisma.$executeRaw`DELETE FROM hotel_search_cache WHERE expires_at < NOW()`,

            // Delete hotel review items not refreshed in the last 7 days
            prisma.$executeRaw`
                DELETE FROM hotel_review_items
                WHERE synced_at < NOW() - INTERVAL '7 days'
            `,
        ]);

        console.log(`[cron/cache-cleanup] Deleted ${cacheDeleted} cache rows, ${reviewsDeleted} stale review items`);
        return res.json({ ok: true, cacheDeleted, reviewsDeleted });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/duffel-balance-check
// Schedule: every 6 hours  (0 */6 * * *)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/duffel-balance-check', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const ALERT_THRESHOLD = parseFloat(process.env.DUFFEL_BALANCE_ALERT_THRESHOLD ?? '500');

        if (!config.DUFFEL_ACCESS_TOKEN) {
            return res.status(500).json({ error: 'DUFFEL_ACCESS_TOKEN not configured' });
        }

        const balances = await getDuffelBalances(config.DUFFEL_ACCESS_TOKEN, true);
        const low = balances.filter(b => b.available < ALERT_THRESHOLD);

        if (low.length > 0) {
            const summary = low.map(b => `${b.currency} ${b.available.toFixed(2)}`).join(', ');
            await createNotification(
                'Duffel balance low',
                `Balance below $${ALERT_THRESHOLD} threshold: ${summary}. Top up to avoid flight booking failures.`
            );
            console.warn(`[cron/duffel-balance-check] LOW BALANCE ALERT: ${summary}`);
        } else {
            console.log('[cron/duffel-balance-check] All balances OK');
        }

        return res.json({ ok: true, balances, alertsFired: low.length, threshold: ALERT_THRESHOLD });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/check-price-alerts
// Schedule: daily at 08:00 UTC  (0 8 * * *)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/check-price-alerts', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const alerts = await prisma.$queryRaw<any[]>`
            SELECT * FROM price_alerts
            WHERE is_active = true
            ORDER BY last_checked_at ASC NULLS FIRST
            LIMIT 100
        `;

        const results = { checked: 0, alerted: 0, errors: 0 };

        // Use a date ~30 days out as the generic search window
        const departureDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

        for (const alert of alerts) {
            try {
                const offers = await searchFlights({
                    origin:        alert.origin,
                    destination:   alert.destination,
                    departureDate,
                    adults:        Number(alert.adults ?? 1),
                    children:      0,
                    infants:       0,
                    cabinClass:    alert.cabin_class ?? 'economy',
                }).catch(() => []);

                // Always stamp last_checked_at
                await prisma.$executeRaw`
                    UPDATE price_alerts SET last_checked_at = NOW() WHERE id = ${alert.id}::uuid
                `;

                if (!offers.length) { results.checked++; continue; }

                const cheapest = offers.reduce(
                    (min: FlightOffer, o: FlightOffer) => o.price.total < min.price.total ? o : min,
                    offers[0]
                );
                const newPrice  = Number(cheapest.price.total ?? 0);
                const currency  = cheapest.price.currency ?? alert.currency ?? 'USD';
                if (!newPrice) { results.checked++; continue; }

                const oldPrice   = alert.current_price != null ? Number(alert.current_price) : null;
                const targetPrc  = alert.target_price  != null ? Number(alert.target_price)  : null;
                const priceDrop  = oldPrice !== null && newPrice < oldPrice;
                const hitTarget  = targetPrc !== null && newPrice <= targetPrc;

                await prisma.$executeRaw`
                    UPDATE price_alerts SET current_price = ${newPrice}, currency = ${currency} WHERE id = ${alert.id}::uuid
                `;

                if (priceDrop || hitTarget) {
                    const siteUrl   = config.SITE_URL ?? 'https://cheapestgo.com';
                    const searchUrl = `${siteUrl}/flights/search?origin=${alert.origin}&destination=${alert.destination}&departure=${departureDate}&adults=${alert.adults}&cabin=${alert.cabin_class}`;

                    const html = `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2 style="color:#2563eb;">✈️ Price Drop Alert!</h2>
<p>Good news! Flights from <strong>${alert.origin}</strong> to <strong>${alert.destination}</strong> are now cheaper.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
  ${oldPrice ? `<tr><td style="padding:8px;border-bottom:1px solid #eee">Previous Price</td><td style="padding:8px;border-bottom:1px solid #eee">${currency} ${oldPrice.toFixed(2)}</td></tr>` : ''}
  <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">New Price</td><td style="padding:8px;border-bottom:1px solid #eee;color:#16a34a;font-weight:bold;">${currency} ${newPrice.toFixed(2)}</td></tr>
  <tr><td style="padding:8px;">Cabin</td><td style="padding:8px;">${alert.cabin_class ?? 'Economy'}</td></tr>
</table>
<a href="${searchUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Book Now</a>
<p style="color:#888;font-size:12px;margin-top:24px;">You set this price alert on CheapestGo. <a href="${siteUrl}/price-alerts">Manage alerts</a></p>
</body></html>`.trim();

                    const emailRes = await sendEmail(
                        alert.email,
                        `Price Drop: ${alert.origin} → ${alert.destination} now ${currency} ${newPrice.toFixed(2)}`,
                        html
                    );
                    if (emailRes.ok) results.alerted++;
                    else console.error('[cron/check-price-alerts] Email failed:', emailRes.error);
                }

                results.checked++;
            } catch (err: any) {
                console.error(`[cron/check-price-alerts] Alert ${alert.id} error:`, err.message);
                results.errors++;
            }
        }

        return res.json({ ok: true, ...results });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/sync-flight-deals
// Schedule: every 6 hours  (0 */6 * * *)
// ─────────────────────────────────────────────────────────────────────────────

const POPULAR_ROUTES = [
    { origin: 'MNL', destination: 'SIN' },
    { origin: 'MNL', destination: 'HKG' },
    { origin: 'MNL', destination: 'NRT' },
    { origin: 'MNL', destination: 'KUL' },
    { origin: 'MNL', destination: 'BKK' },
    { origin: 'MNL', destination: 'DXB' },
    { origin: 'MNL', destination: 'ICN' },
    { origin: 'CEB', destination: 'SIN' },
    { origin: 'CEB', destination: 'HKG' },
    { origin: 'MNL', destination: 'SYD' },
    { origin: 'SIN', destination: 'NRT' },
    { origin: 'SIN', destination: 'LHR' },
] as const;

router.get('/sync-flight-deals', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        if (!config.DUFFEL_ACCESS_TOKEN) {
            return res.json({ ok: true, skipped: true, reason: 'DUFFEL_ACCESS_TOKEN not configured' });
        }

        const departureDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        let synced = 0;
        const errors: string[] = [];

        for (const route of POPULAR_ROUTES) {
            try {
                const offers = await searchFlights({
                    origin:        route.origin,
                    destination:   route.destination,
                    departureDate,
                    adults:        1,
                    children:      0,
                    infants:       0,
                    cabinClass:    'economy',
                }).catch(() => []);

                if (!offers.length) continue;

                // Pick cheapest offer
                const cheapest = offers.reduce(
                    (min: FlightOffer, o: FlightOffer) => o.price.total < min.price.total ? o : min,
                    offers[0]
                );
                const price    = Number(cheapest.price.total ?? 0);
                const currency = cheapest.price.currency ?? 'USD';
                const airline  = cheapest.segments?.[0]?.airline?.name ?? null;
                const imageUrl = null; // populated separately if needed

                if (!price) continue;

                // Upsert by origin+destination (one deal per route)
                await prisma.$executeRaw`
                    INSERT INTO flight_deals (id, origin, destination, price, currency, airline, image_url, departure_date, updated_at)
                    VALUES (
                        gen_random_uuid(),
                        ${route.origin}, ${route.destination},
                        ${price}::numeric, ${currency}, ${airline}, ${imageUrl},
                        ${departureDate}::date,
                        NOW()
                    )
                    ON CONFLICT (origin, destination)
                    DO UPDATE SET
                        price        = EXCLUDED.price,
                        currency     = EXCLUDED.currency,
                        airline      = EXCLUDED.airline,
                        departure_date = EXCLUDED.departure_date,
                        updated_at   = NOW()
                `;
                synced++;
            } catch (err: any) {
                errors.push(`${route.origin}→${route.destination}: ${err.message}`);
            }
        }

        console.log(`[cron/sync-flight-deals] Synced ${synced} routes`);
        return res.json({ ok: true, synced, total: POPULAR_ROUTES.length, errors: errors.length ? errors : undefined });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/refresh-popular-flights
// Schedule: every 30 minutes  (*/30 * * * *)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/refresh-popular-flights', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        if (!config.DUFFEL_ACCESS_TOKEN) {
            return res.json({ ok: true, skipped: true, reason: 'DUFFEL_ACCESS_TOKEN not configured' });
        }

        // Pre-warm cache for the next 3 departure dates (today +1, +2, +7)
        const offsets = [1, 2, 7];
        const ROUTES = POPULAR_ROUTES.slice(0, 6); // top 6 routes only
        let warmed = 0;
        const errors: string[] = [];

        for (const offset of offsets) {
            const departureDate = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
            for (const route of ROUTES) {
                try {
                    await searchFlights({
                        origin:        route.origin,
                        destination:   route.destination,
                        departureDate,
                        adults:        1,
                        children:      0,
                        infants:       0,
                        cabinClass:    'economy',
                    }).catch(() => []);
                    warmed++;
                } catch (err: any) {
                    errors.push(`${route.origin}→${route.destination} +${offset}d: ${err.message}`);
                }
            }
        }

        console.log(`[cron/refresh-popular-flights] Warmed ${warmed} searches`);
        return res.json({ ok: true, warmed, errors: errors.length ? errors : undefined });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/cleanup-orphaned-duffel-orders
// Schedule: every 10 minutes  (*/10 * * * *)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/cleanup-orphaned-duffel-orders', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        if (!config.DUFFEL_ACCESS_TOKEN) {
            return res.json({ ok: true, skipped: true, reason: 'DUFFEL_ACCESS_TOKEN not configured' });
        }

        const CUTOFF_MINUTES = 35;
        const cutoff = new Date(Date.now() - CUTOFF_MINUTES * 60 * 1000).toISOString();

        // Flight bookings that have a provider_order_id but are still in payment-pending states
        // and were created > 35 min ago (Stripe PI has likely expired)
        const candidates = await prisma.$queryRaw<any[]>`
            SELECT id, provider_order_id, payment_intent_id, status, created_at
            FROM flight_bookings
            WHERE provider = 'duffel'
              AND provider_order_id IS NOT NULL
              AND payment_intent_id IS NOT NULL
              AND status IN ('payment_initiated', 'initiated', 'pending')
              AND created_at < ${cutoff}::timestamptz
            LIMIT 20
        `;

        if (!candidates.length) {
            return res.json({ ok: true, cancelled: 0, message: 'No orphaned orders found' });
        }

        let cancelled = 0;
        let skipped   = 0;
        const errs: string[] = [];
        const hdrs = duffelHeaders();

        for (const fb of candidates) {
            try {
                // Verify PI was not paid — if it succeeded, webhook will handle cleanup
                let piStatus = 'unknown';
                try {
                    const pi = await stripe.paymentIntents.retrieve(fb.payment_intent_id);
                    piStatus = pi.status;
                } catch { /* PI retrieval failure is non-fatal */ }

                if (piStatus === 'succeeded') { skipped++; continue; }

                // Two-step Duffel cancel: create quote → confirm
                const quoteRes = await fetch('https://api.duffel.com/air/order_cancellations', {
                    method:  'POST',
                    headers: hdrs,
                    body:    JSON.stringify({ data: { order_id: fb.provider_order_id } }),
                    signal:  AbortSignal.timeout(8000),
                });

                if (!quoteRes.ok) {
                    const txt = await quoteRes.text().catch(() => '');
                    throw new Error(`Duffel quote failed (${quoteRes.status}): ${txt.slice(0, 200)}`);
                }

                const quoteData = await quoteRes.json() as any;
                const cancellationId: string = quoteData?.data?.id;
                if (!cancellationId) throw new Error('No cancellationId in Duffel response');

                const confirmRes = await fetch(
                    `https://api.duffel.com/air/order_cancellations/${cancellationId}/actions/confirm`,
                    { method: 'POST', headers: hdrs, signal: AbortSignal.timeout(8000) }
                );
                if (!confirmRes.ok) {
                    const txt = await confirmRes.text().catch(() => '');
                    throw new Error(`Duffel confirm failed (${confirmRes.status}): ${txt.slice(0, 200)}`);
                }

                await prisma.$executeRaw`
                    UPDATE flight_bookings SET status = 'expired' WHERE id = ${fb.id}::uuid
                `;
                cancelled++;
                console.log(`[cron/cleanup-orphaned] Cancelled order ${fb.provider_order_id} (fb ${fb.id})`);
            } catch (err: any) {
                errs.push(`fb ${fb.id}: ${err.message}`);
                console.error('[cron/cleanup-orphaned] Failed:', err.message);
            }
        }

        return res.json({ ok: true, cancelled, skipped, errors: errs.length ? errs : undefined });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/poll-pending-tickets
// Schedule: every 5 minutes  (*/5 * * * *)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/poll-pending-tickets', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        if (!config.DUFFEL_ACCESS_TOKEN) {
            return res.json({ ok: true, skipped: true, reason: 'DUFFEL_ACCESS_TOKEN not configured' });
        }

        // Find Duffel bookings with status 'booked' whose ticket_time_limit is still in future
        // (or null — no TTL means ticketing may be in progress)
        const pending = await prisma.$queryRaw<any[]>`
            SELECT id, provider_order_id, user_id
            FROM flight_bookings
            WHERE provider = 'duffel'
              AND status = 'booked'
              AND provider_order_id IS NOT NULL
              AND (ticket_time_limit IS NULL OR ticket_time_limit > NOW())
            LIMIT 50
        `;

        let ticketed = 0;
        let unchanged = 0;
        const errs: string[] = [];

        for (const fb of pending) {
            try {
                const res2 = await fetch(
                    `https://api.duffel.com/air/orders/${fb.provider_order_id}`,
                    { headers: duffelHeaders(), signal: AbortSignal.timeout(8000) }
                );
                if (!res2.ok) continue;
                const data = await res2.json() as any;
                const isTicketed = (data?.data?.metadata?.payment_status === 'fully_paid')
                    || (Array.isArray(data?.data?.documents) && data.data.documents.length > 0);

                if (isTicketed) {
                    await prisma.$executeRaw`
                        UPDATE flight_bookings SET status = 'ticketed' WHERE id = ${fb.id}::uuid
                    `;
                    ticketed++;
                    console.log(`[cron/poll-pending-tickets] Ticketed flight booking ${fb.id}`);
                } else {
                    unchanged++;
                }
            } catch (err: any) {
                errs.push(`fb ${fb.id}: ${err.message}`);
            }
        }

        return res.json({ ok: true, ticketed, unchanged, errors: errs.length ? errs : undefined });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/etg-reviews-sync
// Schedule: nightly at 02:00 UTC  (0 2 * * *)
// ─────────────────────────────────────────────────────────────────────────────

function etgAuthHeader(): string {
    const keyId  = process.env.ETG_KEY_ID ?? '';
    const apiKey = process.env.ETG_API_KEY ?? '';
    return `Basic ${Buffer.from(`${keyId}:${apiKey}`).toString('base64')}`;
}

interface EtgReviewAggregate { hotel_id: string; rating: number; reviews_count: number; synced_at: string; }
interface EtgReviewItem {
    hotel_id: string; source_id: string; reviewer_name: string | null; review_date: string | null;
    score: number | null; pros: string | null; cons: string | null; traveler_type: string | null;
    language: string | null; headline: string | null; country: string | null; synced_at: string;
}

function extractIndividualReviews(hotelId: string, rawReviews: any[], now: string): EtgReviewItem[] {
    return rawReviews.map((r: any, idx: number) => {
        const sourceId = String(r.id || r.review_id || r.uid || `${hotelId}-${idx}`);
        const score = r.rating ?? r.score ?? r.grade ?? r.mark ?? null;
        return {
            hotel_id:      hotelId,
            source_id:     sourceId,
            reviewer_name: (r.author || r.author_name || r.reviewer || null)?.toString().slice(0, 200) ?? null,
            review_date:   (r.date || r.created_at || r.review_date || null)?.toString().slice(0, 50) ?? null,
            score:         score != null ? (parseFloat(score) || null) : null,
            pros:          (r.advantages || r.pros || r.positive || null)?.toString().slice(0, 2000) ?? null,
            cons:          (r.disadvantages || r.cons || r.negative || null)?.toString().slice(0, 2000) ?? null,
            traveler_type: (r.traveler_type || r.category || r.type || null)?.toString().slice(0, 100) ?? null,
            language:      (r.language || r.lang || null)?.toString().slice(0, 10) ?? null,
            headline:      (r.headline || r.title || null)?.toString().slice(0, 500) ?? null,
            country:       (r.country || r.user_country || null)?.toString().slice(0, 100) ?? null,
            synced_at:     now,
        };
    });
}

function normalizeEtgDump(data: any): { aggregates: EtgReviewAggregate[]; individuals: EtgReviewItem[] } {
    const now = new Date().toISOString();
    const aggregates: EtgReviewAggregate[] = [];
    const individuals: EtgReviewItem[] = [];

    const processItem = (item: any) => {
        const id = String(item.id || item.hid || item.hotel_id || '');
        if (!id) return;
        const rawReviews = Array.isArray(item.reviews) ? item.reviews : [];
        const rating = parseFloat(item.rating ?? item.stars ?? 0) || 0;
        const reviews_count = parseInt(item.reviews_count ?? item.total_reviews ?? rawReviews.length) || 0;
        aggregates.push({ hotel_id: id, rating, reviews_count, synced_at: now });
        if (rawReviews.length) individuals.push(...extractIndividualReviews(id, rawReviews, now));
    };

    if (Array.isArray(data)) { for (const item of data) processItem(item); }
    else if (data && typeof data === 'object') { for (const v of Object.values(data)) { if (v) processItem(v); } }

    return { aggregates, individuals };
}

async function fetchEtgReviewsDump(): Promise<{ aggregates: EtgReviewAggregate[]; individuals: EtgReviewItem[] }> {
    const auth = etgAuthHeader();
    const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/reviews/dump/', {
        method:  'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ language: 'en' }),
    });
    if (!res.ok) throw new Error(`ETG reviews dump failed: ${res.status}`);
    const json = await res.json() as any;
    const dumpUrl = json?.data?.url || json?.url;

    if (dumpUrl) {
        const dlRes = await fetch(dumpUrl);
        if (!dlRes.ok) throw new Error(`ETG dump download failed: ${dlRes.status}`);
        let buf = Buffer.from(await dlRes.arrayBuffer());
        if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
        let parsed: any;
        try { parsed = JSON.parse(buf.toString('utf8')); }
        catch {
            parsed = buf.toString('utf8').split('\n').filter(Boolean).flatMap(l => {
                try { return [JSON.parse(l)]; } catch { return []; }
            });
        }
        return normalizeEtgDump(parsed);
    }

    const hotelList = json?.data?.hotels || (Array.isArray(json?.data) ? json.data : null) || json || [];
    return normalizeEtgDump(hotelList);
}

router.get('/etg-reviews-sync', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const ETG_KEY_ID  = process.env.ETG_KEY_ID;
        const ETG_API_KEY = process.env.ETG_API_KEY;
        if (!ETG_KEY_ID || !ETG_API_KEY) {
            return res.status(500).json({ error: 'ETG_KEY_ID / ETG_API_KEY not set' });
        }

        const { aggregates, individuals } = await fetchEtgReviewsDump();
        console.log(`[cron/etg-reviews-sync] Parsed ${aggregates.length} hotels, ${individuals.length} reviews`);

        if (!aggregates.length) return res.json({ ok: true, synced: 0, message: 'Empty dump' });

        // Scope to hotels we have in hotel_content to avoid unbounded growth
        const allIds = aggregates.map(r => r.hotel_id);

        // Build a temporary VALUES list to check known IDs — use raw query for large lists
        const knownRows = await prisma.$queryRaw<{ hotel_id: string }[]>`
            SELECT hotel_id FROM hotel_content WHERE hotel_id = ANY(${allIds}::text[])
        `.catch(() => [] as { hotel_id: string }[]);

        const knownIds = new Set(knownRows.map(r => r.hotel_id));
        const useAll   = knownIds.size === 0; // fresh install: upsert everything

        const toUpsertAgg = useAll ? aggregates : aggregates.filter(r => knownIds.has(r.hotel_id));
        const toUpsertInd = useAll ? individuals : individuals.filter(r => knownIds.has(r.hotel_id));

        console.log(`[cron/etg-reviews-sync] Upserting ${toUpsertAgg.length} aggregates, ${toUpsertInd.length} items`);

        const CHUNK = 500;
        let syncedAgg = 0;
        let syncedInd = 0;

        for (let i = 0; i < toUpsertAgg.length; i += CHUNK) {
            const chunk = toUpsertAgg.slice(i, i + CHUNK);
            try {
                await prisma.hotel_reviews.createMany({
                    data:           chunk as any[],
                    skipDuplicates: false,
                }).catch(async () => {
                    // Fallback: individual upserts
                    for (const row of chunk) {
                        await prisma.hotel_reviews.upsert({
                            where:  { hotel_id: row.hotel_id },
                            create: row as any,
                            update: { rating: (row as any).rating, reviews_count: row.reviews_count, synced_at: new Date(row.synced_at) } as any,
                        }).catch(() => {});
                    }
                });
                syncedAgg += chunk.length;
            } catch { /* chunk error is non-fatal */ }
        }

        for (let i = 0; i < toUpsertInd.length; i += CHUNK) {
            const chunk = toUpsertInd.slice(i, i + CHUNK);
            try {
                await prisma.$executeRaw`
                    INSERT INTO hotel_review_items
                        (hotel_id, source_id, reviewer_name, review_date, score, pros, cons, traveler_type, language, headline, country, synced_at)
                    SELECT * FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb)
                        AS x(hotel_id text, source_id text, reviewer_name text, review_date text, score numeric,
                              pros text, cons text, traveler_type text, language text, headline text, country text, synced_at timestamptz)
                    ON CONFLICT (hotel_id, source_id) DO UPDATE
                        SET reviewer_name = EXCLUDED.reviewer_name,
                            review_date   = EXCLUDED.review_date,
                            score         = EXCLUDED.score,
                            pros          = EXCLUDED.pros,
                            cons          = EXCLUDED.cons,
                            synced_at     = EXCLUDED.synced_at
                `;
                syncedInd += chunk.length;
            } catch { /* chunk error is non-fatal */ }
        }

        return res.json({ ok: true, aggregates: syncedAgg, individual_reviews: syncedInd, total_hotels: aggregates.length });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/otv-credit-check
// Schedule: every 4 hours  (0 */4 * * *)
// DB-only — no TGX API call.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/otv-credit-check', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const CREDIT_LIMIT          = parseFloat(process.env.OTV_CREDIT_LIMIT ?? '0');
        const UTILIZATION_ALERT_PCT = parseFloat(process.env.OTV_CREDIT_UTILIZATION_ALERT_PCT ?? '0.8');
        const DEADLINE_WINDOW_HOURS = parseInt(process.env.OTV_DEADLINE_ALERT_HOURS ?? '48', 10);
        const results: Record<string, any> = {};

        // 1. Credit utilization — sum total_price for confirmed/pending TGX bookings not yet checked out
        if (CREDIT_LIMIT > 0) {
            const creditRows = await prisma.$queryRaw<{ total: string | null; booking_count: bigint }[]>`
                SELECT SUM(total_price)::text AS total, COUNT(*)::int AS booking_count
                FROM bookings
                WHERE provider = 'travelgatex'
                  AND status IN ('confirmed', 'pending')
                  AND check_out > NOW()
            `;
            const outstanding   = Number(creditRows[0]?.total ?? 0);
            const bookingCount  = Number(creditRows[0]?.booking_count ?? 0);
            const utilization   = outstanding / CREDIT_LIMIT;

            results.credit = {
                outstanding:    outstanding.toFixed(2),
                limit:          CREDIT_LIMIT,
                utilizationPct: (utilization * 100).toFixed(1) + '%',
                bookingCount,
            };
            console.log('[cron/otv-credit-check] Credit utilization:', results.credit);

            if (utilization >= UTILIZATION_ALERT_PCT) {
                await createNotification(
                    'OTV credit limit warning',
                    `Outstanding OTV credit: ${outstanding.toFixed(2)} of ${CREDIT_LIMIT} limit (${results.credit.utilizationPct} used). New non-refundable bookings may be rejected.`
                );
            }
        } else {
            results.credit = { skipped: true, reason: 'OTV_CREDIT_LIMIT not set' };
        }

        // 2. Refundable deadline monitor — find confirmed TGX bookings with check_in soon
        const windowEnd = new Date(Date.now() + DEADLINE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
        const upcomingDeadlines = await prisma.$queryRaw<any[]>`
            SELECT booking_id, property_name, check_in, check_out, total_price
            FROM bookings
            WHERE provider = 'travelgatex'
              AND status = 'confirmed'
              AND check_in >= NOW()
              AND check_in <= ${windowEnd}::timestamptz
            ORDER BY check_in ASC
            LIMIT 20
        `;

        results.upcomingCheckIns = upcomingDeadlines.length;
        if (upcomingDeadlines.length > 0) {
            const list = upcomingDeadlines
                .map((r: any) => `${r.property_name} (check-in ${r.check_in})`)
                .join('\n');
            await createNotification(
                `${upcomingDeadlines.length} TGX booking(s) checking in within ${DEADLINE_WINDOW_HOURS}h`,
                `Upcoming check-ins:\n${list}`
            );
        }

        return res.json({ ok: true, checkedAt: new Date().toISOString(), ...results });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/sync-hotel-deals
// Schedule: daily at 05:00 UTC  (0 5 * * *)
// ─────────────────────────────────────────────────────────────────────────────
// Hotel deals come from TGX searches — kept as a stub until TGX sync is live.

router.get('/sync-hotel-deals', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        console.log('[cron/sync-hotel-deals] Not yet implemented — hotel deals are populated via etg-reviews-sync');
        return res.json({ ok: true, message: 'Hotel deals sync deferred to TGX batch flow' });
    } catch (err) {
        next(err);
    }
});

export default router;
