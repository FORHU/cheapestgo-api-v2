import { Router, Request, Response, NextFunction } from 'express';
import { config } from '@/config';
import { redis } from '@/lib/redis';

const router = Router();

// ─── Geocode ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v2/google/geocode
 * ?lat=&lng=   — reverse geocode coordinates to address
 * ?latlng=lat,lng — alternate combined format
 * ?place_id=   — place_id → geometry + address
 */
router.get('/geocode', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const key = config.GOOGLE_PLACES_API_KEY;
        if (!key) return res.status(500).json({ error: 'Google API key not configured' });

        let lat = req.query.lat as string | undefined;
        let lng = req.query.lng as string | undefined;
        const latlng   = req.query.latlng as string | undefined;
        const place_id = req.query.place_id as string | undefined;

        if (latlng && !lat && !lng) {
            const [rawLat, rawLng] = latlng.split(',');
            lat = rawLat?.trim();
            lng = rawLng?.trim();
        }

        let url: string;
        if (lat && lng) {
            url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
        } else if (place_id) {
            url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=geometry,formatted_address,name&key=${key}`;
        } else {
            return res.status(400).json({ error: 'Missing parameters: lat+lng, latlng, or place_id required' });
        }

        const googleRes = await fetch(url);
        const data      = await googleRes.json();
        return res.json(data);
    } catch (err) { next(err); }
});

// ─── Places Discover ─────────────────────────────────────────────────────────

const GOOGLE_TYPE_MAP: Record<string, string[]> = {
    all:        ['tourist_attraction', 'restaurant', 'park', 'museum'],
    restaurant: ['restaurant', 'cafe', 'bakery', 'bar'],
    attraction: ['tourist_attraction', 'museum', 'art_gallery', 'amusement_park', 'zoo', 'aquarium'],
    grocery:    ['supermarket', 'grocery_or_supermarket', 'convenience_store'],
    medical:    ['hospital', 'pharmacy', 'doctor', 'dentist'],
    transit:    ['bus_station', 'train_station', 'subway_station', 'transit_station'],
};

/**
 * GET /api/v2/google/discover
 * ?lat=&lng=&category=all&radius=3000
 * Finds nearby POIs by category. Results are cached in Redis for 1 hour.
 */
router.get('/discover', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const key = config.GOOGLE_PLACES_API_KEY;
        if (!key) return res.json({ features: [], error: 'No API key' });

        const lat      = req.query.lat as string;
        const lng      = req.query.lng as string;
        const category = (req.query.category as string) || 'all';
        const radius   = (req.query.radius as string) || '3000';

        if (!lat || !lng) return res.status(400).json({ features: [], error: 'Missing lat/lng' });

        const latKey   = parseFloat(lat).toFixed(2);
        const lngKey   = parseFloat(lng).toFixed(2);
        const cacheKey = `discover|${latKey}|${lngKey}|${category}|${radius}`;

        const cached = await redis.get(cacheKey).catch(() => null);
        if (cached) {
            try {
                return res.json(JSON.parse(cached));
            } catch { /* fall through */ }
        }

        const types    = GOOGLE_TYPE_MAP[category] || GOOGLE_TYPE_MAP['all'];
        const promises = types.map(async (type) => {
            const url     = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${key}&language=en`;
            const apiRes  = await fetch(url);
            const data: any = await apiRes.json();
            if (data.status !== 'OK') return [];
            return (data.results || []).map((place: any) => ({
                type:     'Feature',
                geometry: { type: 'Point', coordinates: [place.geometry.location.lng, place.geometry.location.lat] },
                properties: {
                    name:             place.name,
                    place_id:         place.place_id,
                    category:         place.types?.[0] || type,
                    rating:           place.rating,
                    userRatingsTotal: place.user_ratings_total,
                    vicinity:         place.vicinity,
                    photoReference:   place.photos?.[0]?.photo_reference || null,
                    source:           'google',
                },
            }));
        });

        const results = await Promise.all(promises);
        const allFeatures = results.flat();

        const unique = new Map<string, any>();
        allFeatures.forEach(f => { if (!unique.has(f.properties.place_id)) unique.set(f.properties.place_id, f); });

        const features = Array.from(unique.values())
            .filter(f => (f.properties.rating || 0) >= 3.5)
            .sort((a, b) => {
                const diff = (b.properties.rating || 0) - (a.properties.rating || 0);
                return diff !== 0 ? diff : (b.properties.userRatingsTotal || 0) - (a.properties.userRatingsTotal || 0);
            })
            .slice(0, 25);

        const payload = { features };
        await redis.setex(cacheKey, 3600, JSON.stringify(payload)).catch(() => {});

        return res.json(payload);
    } catch (err) { next(err); }
});

export default router;
