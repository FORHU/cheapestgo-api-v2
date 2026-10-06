import { Router, Request, Response, NextFunction } from 'express';
import { ExchangeRatesService } from '@/services/exchange-rates.service';

const router = Router();
const svc = new ExchangeRatesService();

/**
 * GET /api/v2/exchange-rates
 *
 * Live rates in "1 unit = X USD" format. The provider chain, cache and fallback
 * behaviour live in the service; this route only shapes the response.
 *
 * 503 is reserved for the case where no rates exist at all — never fetched and
 * nothing cached. A stale cache is still an answer, and the client is told so
 * through `source` rather than by being handed an error.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const force  = req.query.force === '1' || req.query.force === 'true';
        const result = await svc.getLiveRates(force);

        if (!result) {
            return res.status(503).json({ success: false, error: 'Unable to fetch exchange rates' });
        }

        return res.json({
            success:  true,
            rates:    result.rates,
            cachedAt: new Date(result.fetchedAt).toISOString(),
            source:   result.source,
            provider: result.provider,
            missing:  result.missing,
        });
    } catch (err) { next(err); }
});

export default router;
