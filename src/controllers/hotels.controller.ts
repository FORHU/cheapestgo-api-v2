import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { HotelsService } from '@/services/hotels.service';
import { autocompleteDestinations, getPlaceDetails, geocode as geoCodePlace } from '@/lib/google/places';
import { config } from '@/config';

const svc = new HotelsService();

export class HotelsController {

    search = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = z.object({
                destination:  z.string(),
                checkIn:      z.string(),
                checkOut:     z.string(),
                adults:       z.coerce.number().int().min(1).default(1),
                children:     z.coerce.number().int().min(0).default(0),
                rooms:        z.coerce.number().int().min(1).default(1),
                lat:          z.coerce.number().optional(),
                lng:          z.coerce.number().optional(),
                countryCode:  z.string().optional(),
                currency:     z.string().optional(),
                occupancies:  z.array(z.any()).optional(),
                filters:      z.record(z.any()).optional(),
            }).parse(req.body);
            const result = await svc.search(body);
            res.json(result);
        } catch (err) { next(err); }
    };

    property = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = z.object({ id: z.string() }).parse(req.params);
            const result = await svc.getProperty(id);
            res.json(result);
        } catch (err) { next(err); }
    };

    deals = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { limit } = z.object({ limit: z.coerce.number().optional().default(12) }).parse(req.query);
            const result = await svc.getDeals(limit);
            res.json({ deals: result });
        } catch (err) { next(err); }
    };

    // ── Nearby POI discovery ──────────────────────────────────────────────────

    nearbyPlaces = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { lat, lng, category, radius } = z.object({
                lat:      z.coerce.number(),
                lng:      z.coerce.number(),
                category: z.string().default('all'),
                radius:   z.coerce.number().default(3000),
            }).parse(req.query);

            const key = config.GOOGLE_PLACES_API_KEY;
            if (!key) return res.json({ features: [] });

            const TYPE_MAP: Record<string, string[]> = {
                all:        ['tourist_attraction', 'restaurant', 'park', 'museum'],
                restaurant: ['restaurant', 'cafe', 'bakery', 'bar'],
                attraction: ['tourist_attraction', 'museum', 'art_gallery', 'amusement_park', 'zoo', 'aquarium'],
                grocery:    ['supermarket', 'grocery_or_supermarket', 'convenience_store'],
                medical:    ['hospital', 'pharmacy', 'doctor', 'dentist'],
                transit:    ['bus_station', 'train_station', 'subway_station', 'transit_station'],
            };
            const types = TYPE_MAP[category] ?? TYPE_MAP['all'];

            const results = await Promise.all(
                types.map(async (type) => {
                    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${key}&language=en`;
                    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
                    const d = await r.json() as { status: string; results?: any[] };
                    if (d.status !== 'OK') return [];
                    return (d.results ?? []).map((place: any) => ({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [place.geometry.location.lng, place.geometry.location.lat] },
                        properties: {
                            name:            place.name,
                            place_id:        place.place_id,
                            category:        place.types?.[0] || type,
                            rating:          place.rating,
                            userRatingsTotal: place.user_ratings_total,
                            vicinity:        place.vicinity,
                            photoReference:  place.photos?.[0]?.photo_reference ?? null,
                            source:          'google',
                        },
                    }));
                })
            );

            const unique = new Map<string, any>();
            results.flat().forEach((f) => {
                if (!unique.has(f.properties.place_id)) unique.set(f.properties.place_id, f);
            });

            const features = Array.from(unique.values())
                .filter((f) => (f.properties.rating ?? 0) >= 3.5)
                .sort((a, b) => {
                    const diff = (b.properties.rating ?? 0) - (a.properties.rating ?? 0);
                    return diff !== 0 ? diff : (b.properties.userRatingsTotal ?? 0) - (a.properties.userRatingsTotal ?? 0);
                })
                .slice(0, 25);

            res.json({ features });
        } catch (err) { next(err); }
    };

    // ── Places / autocomplete ─────────────────────────────────────────────────

    autocomplete = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { query } = z.object({ query: z.string().min(1) }).parse(req.body);
            const result = await autocompleteDestinations(query);
            res.json(result);
        } catch (err) { next(err); }
    };

    placeDetails = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { placeId } = z.object({ placeId: z.string() }).parse(req.query as any);
            const result = await getPlaceDetails(placeId);
            res.json(result);
        } catch (err) { next(err); }
    };

    geocode = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { lat, lng, address } = z.object({
                lat:     z.coerce.number().optional(),
                lng:     z.coerce.number().optional(),
                address: z.string().optional(),
            }).parse(req.query as any);
            const result = await geoCodePlace({ lat, lng, address } as any);
            res.json(result);
        } catch (err) { next(err); }
    };

    // ── Hotel payment / prebook ───────────────────────────────────────────────

    preBook = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await svc.preBook(req.body);
            res.json(result);
        } catch (err) { next(err); }
    };

    createPayment = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await svc.createPayment({ ...req.body, userId: req.user!.sub });
            res.json(result);
        } catch (err) { next(err); }
    };

    confirmBooking = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await svc.confirmBooking({ ...req.body, userId: req.user!.sub });
            res.json(result);
        } catch (err) { next(err); }
    };

    cancelBooking = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await svc.cancelBooking({ ...req.body, userId: req.user!.sub });
            res.json(result);
        } catch (err) { next(err); }
    };

    // ── Amenities ─────────────────────────────────────────────────────────────

    amenitiesByDestination = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { destination } = z.object({ destination: z.string().min(1) }).parse(req.query);
            const result = await svc.getAmenitiesByDestination(destination);
            res.json({ destination, hotels: result, count: result.length });
        } catch (err) { next(err); }
    };

    amenitiesByHotelIds = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { ids } = z.object({
                ids: z.union([z.string(), z.array(z.string())]).transform(v =>
                    Array.isArray(v) ? v : v.split(',').map(s => s.trim()).filter(Boolean)
                ),
            }).parse(req.query);
            const result = await svc.getAmenitiesByHotelIds(ids);
            res.json({ hotels: result, count: result.length });
        } catch (err) { next(err); }
    };
}
