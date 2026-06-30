import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

// Currencies matching the monolith's EXCHANGE_RATES list
const SUPPORTED = [
    'USD', 'PHP', 'KRW', 'JPY', 'EUR', 'GBP', 'AUD', 'SGD',
    'MYR', 'THB', 'VND', 'IDR', 'CNY', 'TWD', 'HKD', 'INR', 'AED', 'CAD',
];

// Server-side in-memory cache (1-hour TTL)
let cachedRates: Record<string, number> | null = null;
let cachedAt = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * GET /api/exchange-rates
 *
 * Returns live exchange rates in "1 unit = X USD" format with 1-hour server-side cache.
 * Uses the free Frankfurter API (ECB data, no API key needed).
 * Falls back to stale cache on error; returns 503 if no cache exists.
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const now = Date.now();

        // Return fresh cached rates immediately
        if (cachedRates && now - cachedAt < CACHE_TTL) {
            return res.json({
                success: true,
                rates: cachedRates,
                cachedAt: new Date(cachedAt).toISOString(),
                source: 'cache',
            });
        }

        // Fetch live rates from Frankfurter (base=USD → "1 USD = X units")
        const symbols = SUPPORTED.filter(c => c !== 'USD').join(',');
        const upstream = await fetch(
            `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols}`,
            { signal: AbortSignal.timeout(5000) },
        );

        if (!upstream.ok) {
            throw new Error(`Frankfurter API returned ${upstream.status}`);
        }

        const data = await upstream.json() as { rates: Record<string, number> };
        const apiRates: Record<string, number> = data.rates;

        // Convert to "1 unit = Y USD" (what the frontend expects)
        const converted: Record<string, number> = { USD: 1.0 };
        for (const [currency, rate] of Object.entries(apiRates)) {
            if (rate > 0) converted[currency] = 1 / rate;
        }

        cachedRates = converted;
        cachedAt = now;

        return res.json({
            success: true,
            rates: converted,
            cachedAt: new Date(cachedAt).toISOString(),
            source: 'live',
        });
    } catch (err) {
        console.error('[exchange-rates] Failed to fetch live rates:', err);

        // Return stale cache if available
        if (cachedRates) {
            return res.json({
                success: true,
                rates: cachedRates,
                cachedAt: new Date(cachedAt).toISOString(),
                source: 'stale-cache',
            });
        }

        // No cache at all — client should fall back to static rates
        return res.status(503).json({ success: false, error: 'Unable to fetch exchange rates' });
    }
});

export default router;
