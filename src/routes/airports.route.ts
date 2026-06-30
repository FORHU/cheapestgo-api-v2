import { Router, Request, Response, NextFunction } from 'express';
import { config } from '@/config';

const router = Router();

const DUFFEL_VERSION = 'v2';

interface DuffelPlace {
    id: string;
    iata_code: string | null;
    name: string;
    city_name: string | null;
    country_name: string | null;
    type: 'airport' | 'city';
}

interface AirportResult {
    iata: string;
    name: string;
    city: string;
    country: string;
}

async function searchDuffel(query: string, limit: number): Promise<AirportResult[] | null> {
    if (!config.DUFFEL_ACCESS_TOKEN) return null;

    try {
        const res = await fetch(
            `https://api.duffel.com/places/suggestions?query=${encodeURIComponent(query)}&limit=${limit}`,
            {
                headers: {
                    Authorization: `Bearer ${config.DUFFEL_ACCESS_TOKEN}`,
                    'Duffel-Version': DUFFEL_VERSION,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(4000),
            },
        );

        if (!res.ok) return null;

        const json = await res.json() as { data?: DuffelPlace[] };
        const locations: DuffelPlace[] = json.data || [];

        return locations
            .filter(loc => loc.iata_code)
            .map(loc => ({
                iata: loc.iata_code!,
                name: loc.name || loc.iata_code!,
                city: loc.city_name || loc.name || '',
                country: loc.country_name || '',
            }));
    } catch {
        return null;
    }
}

/**
 * GET /api/airports/search?q=<query>&limit=8
 *
 * Searches airports using the Duffel Places API.
 * Returns up to `limit` (max 20) matching airport records.
 */
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = (req.query.q as string) || '';
        const limit = Math.min(parseInt((req.query.limit as string) || '8', 10), 20);

        if (!query || query.length < 1) {
            return res.json({ success: true, data: [] });
        }

        const results = await searchDuffel(query, limit);

        return res.json({
            success: true,
            data: (results || []).slice(0, limit),
        });
    } catch (err) {
        console.error('[airports/search] Error:', err);
        next(err);
    }
});

export default router;
