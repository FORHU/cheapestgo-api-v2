import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { HotelsService } from '@/services/hotels.service';
import { autocompleteDestinations, getPlaceDetails, geocode as geoCodePlace } from '@/lib/google/places';
import { config } from '@/config';
import { resolveTgxDestinationCode } from '@/lib/hotels/travelgatex';
import { getInstantHotelCatalog, runTgxSearch } from '@/lib/hotels/search';
import { prisma } from '@/lib/prisma';
import { CITY_ALIASES, resolveHotelDbCity } from '@/lib/cityAliases';

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
            const body = z.object({
                offerId:  z.string().min(1),
                currency: z.string().length(3).optional(),
                roomName: z.string().optional(),
                adults:   z.coerce.number().int().min(1).optional(),
                children: z.coerce.number().int().min(0).optional(),
            }).parse(req.body);
            const result = await svc.preBook(body);
            res.json(result);
        } catch (err) { next(err); }
    };

    createPayment = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = z.object({
                prebookId:      z.string().min(1),
                amount:         z.coerce.number().positive(),
                currency:       z.string().length(3),
                holderEmail:    z.string().email().optional(),
                propertyName:   z.string().optional(),
                roomName:       z.string().optional(),
                checkIn:        z.string().optional(),
                checkOut:       z.string().optional(),
                bundleFlightId: z.string().optional(),
            }).parse(req.body);
            const result = await svc.createPayment({ ...body, userId: req.user!.sub });
            res.json(result);
        } catch (err) { next(err); }
    };

    confirmBooking = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = z.object({
                paymentIntentId:       z.string().min(1),
                prebookId:             z.string().min(1),
                holder:                z.object({ firstName: z.string(), lastName: z.string(), email: z.string().email() }),
                guests:                z.array(z.object({ firstName: z.string(), lastName: z.string(), age: z.number().optional() })).optional(),
                propertyName:          z.string().optional(),
                propertyImage:         z.string().optional(),
                roomName:              z.string().optional(),
                checkIn:               z.string(),
                checkOut:              z.string(),
                adults:                z.coerce.number().int().min(1).optional(),
                children:              z.coerce.number().int().min(0).optional(),
                currency:              z.string().length(3).optional(),
                specialRequests:       z.string().optional(),
                voucherCode:           z.string().optional(),
                discountAmount:        z.coerce.number().optional(),
                cancellationPolicies:  z.any().optional(),
                quotedPrice:           z.coerce.number().optional(),
            }).parse(req.body);
            const result = await svc.confirmBooking({ ...body, userId: req.user!.sub });
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

    // ── Destination code resolver ─────────────────────────────────────────────

    resolveDestination = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { city } = z.object({ city: z.string().min(1) }).parse(req.body);
            const code = await resolveTgxDestinationCode(city, prisma);
            res.json({ city, code: code ?? null });
        } catch (err) { next(err); }
    };

    // ── SSE streaming search ──────────────────────────────────────────────────

    searchStream = async (req: Request, res: Response) => {
        const body: any = { ...req.body };

        // ── Normalize city name (strip country suffix "Tokyo, Japan" → "Tokyo") ──
        const COUNTRY_NAME_TO_ISO: Record<string, string> = {
            'indonesia': 'ID', 'france': 'FR', 'italy': 'IT', 'spain': 'ES', 'germany': 'DE',
            'japan': 'JP', 'thailand': 'TH', 'greece': 'GR', 'united states': 'US', 'usa': 'US',
            'australia': 'AU', 'philippines': 'PH', 'south korea': 'KR', 'korea': 'KR',
            'vietnam': 'VN', 'cambodia': 'KH', 'singapore': 'SG', 'malaysia': 'MY',
            'india': 'IN', 'china': 'CN', 'hong kong': 'HK', 'taiwan': 'TW',
            'peru': 'PE', 'mexico': 'MX', 'brazil': 'BR', 'argentina': 'AR',
            'egypt': 'EG', 'tanzania': 'TZ', 'south africa': 'ZA', 'kenya': 'KE',
            'iceland': 'IS', 'norway': 'NO', 'sweden': 'SE', 'denmark': 'DK',
            'portugal': 'PT', 'netherlands': 'NL', 'switzerland': 'CH', 'austria': 'AT',
            'united kingdom': 'GB', 'uk': 'GB', 'maldives': 'MV', 'sri lanka': 'LK',
            'nepal': 'NP', 'uae': 'AE', 'united arab emirates': 'AE', 'turkey': 'TR',
            'morocco': 'MA', 'jordan': 'JO', 'new zealand': 'NZ', 'canada': 'CA',
        };
        const resolveIso = (raw?: string) => {
            if (!raw) return null;
            if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
            return COUNTRY_NAME_TO_ISO[raw.toLowerCase()] ?? null;
        };

        const rawCity: string = body.cityName ?? body.destination ?? '';
        const normalizedCity  = rawCity.split(',')[0].trim();
        if (normalizedCity) {
            body.cityName    = normalizedCity;
            body.destination = normalizedCity;
            if (normalizedCity !== rawCity && !body.countryCode) {
                const suffix   = rawCity.slice(normalizedCity.length).replace(/^,\s*/, '').trim();
                const resolved = resolveIso(suffix);
                if (resolved) body.countryCode = resolved;
            }
        }
        if (body.countryCode && body.countryCode.length > 2) {
            const resolved = resolveIso(body.countryCode);
            if (resolved) body.countryCode = resolved;
        }

        // ── City alias resolution (borough/neighbourhood → canonical city) ──────
        if (body.cityName) {
            const nameLower = body.cityName.toLowerCase();
            if (body.countryCode) {
                const alias = CITY_ALIASES[body.countryCode]?.[nameLower];
                if (alias) {
                    body.cityName = alias; body.destination = alias;
                    body.rung = 'city';
                    delete body.destinationCode;
                }
            } else {
                for (const [cc, aliases] of Object.entries(CITY_ALIASES)) {
                    const alias = (aliases as Record<string, string>)[nameLower];
                    if (alias) {
                        body.cityName = alias; body.destination = alias;
                        body.countryCode = cc; body.rung = 'city';
                        delete body.destinationCode;
                        break;
                    }
                }
            }
        }

        // ── Parse geographic params ───────────────────────────────────────────────
        if (body.lat != null && body.lat !== '') body.lat = Number(body.lat);
        if (body.lng != null && body.lng !== '') body.lng = Number(body.lng);
        if (typeof body.bbox === 'string' && body.bbox.includes(',')) {
            const parts = body.bbox.split(',').map(Number);
            body.bbox = parts.length === 4 && parts.every((n: number) => Number.isFinite(n)) ? parts : undefined;
        }

        // ── Default check-in dates (next Friday → Sunday) ────────────────────────
        if (!body.checkin && !body.checkIn) {
            const now = new Date();
            const daysUntilFriday = ((5 - now.getDay() + 7) % 7) || 7;
            const checkin  = new Date(now); checkin.setDate(now.getDate() + daysUntilFriday);
            const checkout = new Date(checkin); checkout.setDate(checkin.getDate() + 2);
            const fmt = (d: Date) => d.toISOString().slice(0, 10);
            body.checkin = fmt(checkin); body.checkout = fmt(checkout);
        }

        const city = rawCity || '(unknown)';

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const emit = (data: object) => {
            if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        let closed = false;
        req.on('close', () => { closed = true; });

        try {
            // ── Phase 1: instant catalog ──────────────────────────────────────────
            const catalogParams: any = {
                cityName:    body.cityName ?? body.destination,
                countryCode: body.countryCode,
                checkin:     body.checkin ?? body.checkIn,
                checkout:    body.checkout ?? body.checkOut,
                adults:      Number(body.adults)   || 2,
                children:    Number(body.children) || 0,
            };
            const catalogHotels = await Promise.race([
                getInstantHotelCatalog(catalogParams),
                new Promise<any[]>(resolve => setTimeout(() => resolve([]), 8000)),
            ]);

            if (!closed && catalogHotels.length > 0) {
                const mappable = catalogHotels.filter((h: any) => h.lat && h.lng);
                emit({ type: 'hotels', data: catalogHotels, allMappable: mappable, totalCount: catalogHotels.length, source: 'catalog' });

                // Infer countryCode from catalog when unknown
                if (!body.countryCode) {
                    const freq: Record<string, number> = {};
                    for (const h of catalogHotels) {
                        const c = (h.country as string | undefined)?.toUpperCase().slice(0, 2);
                        if (c?.length === 2) freq[c] = (freq[c] || 0) + 1;
                    }
                    const dominant = Object.entries(freq).sort(([, a], [, b]) => b - a)[0]?.[0];
                    if (dominant) body.countryCode = dominant;
                }
            }

            if (closed) return;

            // ── Phase 2: live TGX search ──────────────────────────────────────────
            const catalogIdSet = new Set(catalogHotels.map((h: any) => h.id as string));

            let tgxFailed = false;
            console.log('[stream] Starting TGX search for', body.cityName ?? body.destination);
            const tgxResult = await runTgxSearch({
                cityName:    body.cityName ?? body.destination,
                checkin:     body.checkin  ?? body.checkIn,
                checkout:    body.checkout ?? body.checkOut,
                adults:      Number(body.adults)   || 2,
                children:    Number(body.children) || 0,
                countryCode: body.countryCode,
                currency:    body.currency,
                rung:        body.rung,
                lat:         body.lat,
                lng:         body.lng,
                bbox:        body.bbox,
            }).catch((err: any) => {
                tgxFailed = true;
                console.warn(`[stream] TGX failed for "${city}": ${err.message}`, err.stack?.split('\n').slice(0,3).join(' | '));
                return { data: [] as any[], allMappable: [] as any[], totalCount: 0 };
            });

            const tgxHotels: any[]   = Array.isArray(tgxResult.data) ? tgxResult.data : [];
            const tgxMappable: any[] = tgxResult.allMappable ?? [];
            const tgxHotelIdSet      = new Set(tgxHotels.map((h: any) => h.hotelId || h.id));
            const newTgxHotels       = tgxHotels.filter((h: any) => !catalogIdSet.has(h.hotelId || h.id));

            if (!closed && catalogHotels.length > 0) {
                const prices = tgxHotels.map((h: any) => ({
                    hotelId:       h.hotelId || h.id,
                    price:         h.price,
                    currency:      h.currency,
                    offerId:       h.offerId,
                    refundableTag: h.refundableTag,
                    boardCode:     h.boardCode,
                    boardTypes:    h.boardCode ? [h.boardCode] : [],
                }));
                const unavailableIds = catalogHotels
                    .filter((h: any) => !tgxHotelIdSet.has(h.id))
                    .map((h: any) => h.id);

                if (prices.length > 0) emit({ type: 'prices', data: prices });
                if (!tgxFailed && unavailableIds.length > 0) emit({ type: 'remove', ids: unavailableIds });
                if (!closed && newTgxHotels.length > 0) {
                    emit({ type: 'hotels', data: newTgxHotels, allMappable: newTgxHotels.filter((h: any) => h.lat && h.lng), totalCount: newTgxHotels.length });
                }
            } else if (!closed && tgxHotels.length > 0) {
                emit({ type: 'hotels', data: tgxHotels, allMappable: tgxMappable, totalCount: tgxHotels.length });
            }

            const finalCount = tgxHotels.length > 0 ? tgxHotels.length : catalogHotels.length;
            if (!closed) emit({ type: 'done', totalCount: finalCount, tgxCount: tgxHotels.length, tgxFailed });

        } catch (err: any) {
            if (!closed) emit({ type: 'error', message: err.message ?? 'Search failed' });
        } finally {
            if (!res.writableEnded) res.end();
        }
    };
}
