import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@/middleware/error.middleware';
import { HotelsService } from '@/services/hotels.service';
import { getPlaceDetails, geocode as geoCodePlace } from '@/lib/google/places';
import { config } from '@/config';
import { nightsBetween } from '@/lib/hotels/nights';
import { fetchHotelContentPatches } from '@/lib/hotels/contentPatches';
import { resolveTgxDestinationCode } from '@/lib/hotels/travelgatex';
import { getInstantHotelCatalog, runTgxSearch } from '@/lib/hotels/search';
import { prisma } from '@/lib/prisma';
import { CITY_ALIASES } from '@/lib/cityAliases';
import { DestinationsService } from '@/services/destinations.service';

/**
 * How long a first pass must take before it is worth asking again.
 *
 * The supplier budget is 12s; a pass that reaches it was cut off mid-answer, and a pass that
 * returns well inside it finished. 10s leaves room for the ones that come back just under
 * the wire without re-asking on every fast search.
 */
const SECOND_PASS_THRESHOLD_MS = 10_000;

const svc = new HotelsService();
const destinations = new DestinationsService();

export class HotelsController {

    /**
     * Destination autocomplete carrying the granularity rung, bbox and canonical
     * city. Distinct from `autocomplete` below, which is Google Places and returns
     * none of those - the search page cannot scope its map without them.
     */
    destinations = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { query, locale } = z.object({
                query:  z.string(),
                locale: z.string().optional(),
            }).parse(req.query);
            const data = await destinations.autocomplete(query, locale);
            res.json({ success: true, data });
        } catch (err) { next(err); }
    };

    count = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { city, cc } = z.object({
                city: z.string().min(1),
                cc:   z.string().length(2).optional(),
            }).parse(req.query);
            const count = await svc.countByCity(city, cc);
            res.json({ count });
        } catch (err) { next(err); }
    };

    /**
     * A stay whose check-out is on or before its check-in, which is not a stay at all.
     *
     * The calendar no longer offers such a range (QA BG-5), but a pasted or edited URL
     * still can, and sent on it reaches the suppliers as a search for dates nobody asked
     * about. Unreadable dates are left to the caller's own validation.
     */
    private static isReversedStay(checkIn?: string, checkOut?: string): boolean {
        const inTime = Date.parse(checkIn ?? ''), outTime = Date.parse(checkOut ?? '');
        return Number.isFinite(inTime) && Number.isFinite(outTime) && outTime <= inTime;
    }

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
            if (HotelsController.isReversedStay(body.checkIn, body.checkOut)) {
                throw new AppError(400, 'Check-out must be after check-in.', 'VALIDATION_ERROR');
            }
            const result = await svc.search(body);
            res.json(result);
        } catch (err) { next(err); }
    };

    property = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = z.object({ id: z.string() }).parse(req.params);
            const { checkIn, checkOut, adults, children } = z.object({
                checkIn:  z.string().optional(),
                checkOut: z.string().optional(),
                adults:   z.coerce.number().optional().default(2),
                children: z.coerce.number().optional().default(0),
            }).parse(req.query);
            const result = await svc.getProperty(id, { checkIn, checkOut, adults, children });
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
                displayedTotal: z.coerce.number().positive().optional(),
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

        // ── Parse geographic params ───────────────────────────────────────────────
        // Before anything reads them. The extent checks below ask whether bbox is an array, and
        // a browser search sends it as the "minLng,minLat,maxLng,maxLat" string from the URL.
        if (body.lat != null && body.lat !== '') body.lat = Number(body.lat);
        if (body.lng != null && body.lng !== '') body.lng = Number(body.lng);
        if (typeof body.bbox === 'string' && body.bbox.includes(',')) {
            const parts = body.bbox.split(',').map(Number);
            body.bbox = parts.length === 4 && parts.every((n: number) => Number.isFinite(n)) ? parts : undefined;
        }

        // What the traveller picked, before the normalisation below overwrites `destination`
        // with `cityName`. The results page sends the parent city as `cityName`, so afterwards
        // "Camden Town" and "London" both read "London" and the sub-area cannot be seen.
        const pickedDestination: string = typeof body.destination === 'string' ? body.destination : '';

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

        // ── The extent the traveller picked ───────────────────────────────────────
        //
        // Every rung here is a place with real administrative boundaries, whatever the local
        // word for it — a London borough, a Paris arrondissement, a German Landkreis, a Tokyo
        // ku. None of those words appear in this code and none need to: what matters is that
        // the picker typed the place as an area below a city and gave us its bounds.
        //
        // City is excluded on purpose (see `areaRung`), and so is a point rung, whose "bounds"
        // are a building.
        const BOUNDED_RUNGS = new Set(['province', 'district', 'neighborhood', 'locality', 'state', 'county']);
        if (body.rung && BOUNDED_RUNGS.has(body.rung) && Array.isArray(body.bbox) && body.bbox.length === 4) {
            body.areaRung = body.rung;
        }

        // ── A sub-area the picker already resolved ────────────────────────────────
        //
        // The picker sends both names: `destination` is what the traveller chose, and
        // `canonicalCity` is the city whose inventory has to be searched, because OTV serves
        // only the City rung (ADR-0006). Both facts are kept — the city to search, and the
        // extent to search within — because acting on the first alone answers a borough with
        // its whole city, and acting on neither answers it with nothing.
        if (body.canonicalCity && pickedDestination &&
            String(body.canonicalCity).toLowerCase() !== pickedDestination.toLowerCase()) {
            const picked = body.rung;
            console.log(`[stream] sub-area: "${pickedDestination}" (rung: ${picked ?? '?'}) ` +
                        `-> searching "${body.canonicalCity}", bounded by its own extent`);
            if (picked && picked !== 'city') body.areaRung = picked;
            body.cityName    = body.canonicalCity;
            body.destination = body.canonicalCity;
            body.rung        = 'city';
            // Resolved for the sub-area, wrong for the city.
            delete body.destinationCode;
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

        // ── Default check-in dates (next Friday → Sunday) ────────────────────────
        if (!body.checkin && !body.checkIn) {
            const now = new Date();
            const daysUntilFriday = ((5 - now.getDay() + 7) % 7) || 7;
            const checkin  = new Date(now); checkin.setDate(now.getDate() + daysUntilFriday);
            const checkout = new Date(checkin); checkout.setDate(checkin.getDate() + 2);
            const fmt = (d: Date) => d.toISOString().slice(0, 10);
            body.checkin = fmt(checkin); body.checkout = fmt(checkout);
        }

        // Refused before the stream opens: an error inside an event stream is one the
        // client has to be listening for.
        if (HotelsController.isReversedStay(body.checkin ?? body.checkIn, body.checkout ?? body.checkOut)) {
            res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Check-out must be after check-in.' });
            return;
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
                // So the pins drawn are the pins inside the place that was asked for.
                areaRung:    body.areaRung,
                bbox:        body.bbox,
                // And the coordinates, which this call never sent. Without them the catalog can
                // only match the city by name, so a spelling the traveller did not use finds
                // nothing: "Danang" drew no pins at all while 1,705 hotels sat under "Da Nang".
                // A radius does not care how the name is spelled. A sub-area still wins over it,
                // and a territory is still held to its own side of the border.
                lat:         body.lat,
                lng:         body.lng,
            };
            const catalogHotels = await Promise.race([
                getInstantHotelCatalog(catalogParams),
                new Promise<any[]>(resolve => setTimeout(() => resolve([]), 8000)),
            ]);

            if (!closed && catalogHotels.length > 0) {
                // `allMappable` used to ride along here as a filtered copy of `data` —
                // the whole hotel array a second time in the same message. app-v2's
                // stream reader takes `chunk.data` alone and maps it through
                // `toMappable`, so nothing ever read the copy.
                emit({ type: 'hotels', data: catalogHotels, totalCount: catalogHotels.length, source: 'catalog' });

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
            // An Unanswered Search is a failure the user should be told about honestly —
            // the catalog stays and prices could not be loaded — rather than one that
            // reads as the destination having no hotels.
            let tgxUnanswered = false;
            console.log('[stream] Starting TGX search for', body.cityName ?? body.destination);
            const searchArgs = {
                cityName:    body.cityName ?? body.destination,
                checkin:     body.checkin  ?? body.checkIn,
                checkout:    body.checkout ?? body.checkOut,
                adults:      Number(body.adults)   || 2,
                children:    Number(body.children) || 0,
                countryCode: body.countryCode,
                currency:    body.currency,
                rung:        body.rung,
                areaRung:    body.areaRung,
                lat:         body.lat,
                lng:         body.lng,
                bbox:        body.bbox,
            };
            const firstPassStarted = Date.now();
            const tgxResult = await runTgxSearch({
                cityName:    body.cityName ?? body.destination,
                checkin:     body.checkin  ?? body.checkIn,
                checkout:    body.checkout ?? body.checkOut,
                adults:      Number(body.adults)   || 2,
                children:    Number(body.children) || 0,
                countryCode: body.countryCode,
                currency:    body.currency,
                rung:        body.rung,
                areaRung:    body.areaRung,
                lat:         body.lat,
                lng:         body.lng,
                bbox:        body.bbox,
            }).catch((err: any) => {
                tgxFailed = true;
                tgxUnanswered = err?.name === 'UnansweredSearchError';
                console.warn(`[stream] TGX failed for "${city}": ${err.message}`, err.stack?.split('\n').slice(0,3).join(' | '));
                return { data: [] as any[], allMappable: [] as any[], totalCount: 0, truncated: false };
            });

            const firstPassMs = Date.now() - firstPassStarted;

            /**
             * Per night, because that is what a card says.
             *
             * TGX quotes the **whole stay**, and every price surface in the storefront prints
             * "/ night" beside the number. Sending the stay total and trusting each of them to
             * divide is what v1 stopped doing: the search card and the deals row never got the
             * memo, so a three-night stay was advertised at three times its nightly rate.
             *
             * Done once, here, for the same reason v1 does it here — every list below is
             * derived from this array, so dividing at the source is the only version that
             * cannot be half-applied.
             */
            const stayNights = nightsBetween(body.checkin ?? body.checkIn, body.checkout ?? body.checkOut);
            const tgxHotels: any[]   = (Array.isArray(tgxResult.data) ? tgxResult.data : [])
                .map((h: any) => ({ ...h, price: (h.price ?? 0) / stayNights }));
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
                    emit({ type: 'hotels', data: newTgxHotels, totalCount: newTgxHotels.length });
                }
            } else if (!closed && tgxHotels.length > 0) {
                emit({ type: 'hotels', data: tgxHotels, totalCount: tgxHotels.length });
            }

            // ── Phase 3: answer now, then collect what the first pass missed ──────
            //
            // OTV cannot finish a destination search inside the 12s it asks us to allow, so
            // a first search of a city it has not computed lately comes back truncated. It
            // keeps working after we stop listening, and the finished answer lands in its own
            // cache — where a second, identical search collects it almost instantly.
            //
            // Measured on three cold cities, 2026-09-18:
            //
            //     Boracay   pass 1  29s ->   3 hotels    pass 2   1s ->  97
            //     Sapporo   pass 1  32s ->  26 hotels    pass 2  14s ->  93
            //     Taipei    pass 1  33s ->  45 hotels    pass 2   0s -> 161
            //
            // Conditional on the supplier having actually stopped mid-answer, which the search
            // reports: a destination call that timed out, or hotel-code batches that never came
            // back. Elapsed time was the first signal tried and it was the wrong one — a slow
            // search is not a truncated one. Measured 2026-09-21: two cold cities whose first
            // pass took 16.8s and 17.3s and returned 263 and 158 hotels were both judged
            // truncated by the clock, and both second passes returned the same sets with
            // nothing new, buying the traveller nothing and costing OTV a second full search.
            //
            // The threshold stays as a floor so a fast cut-off answer is not re-asked either.
            const wasTruncated = !tgxFailed && tgxResult.truncated === true &&
                firstPassMs >= SECOND_PASS_THRESHOLD_MS;

            // `done` goes out before the collecting pass, not after it.
            //
            // It is what stops the spinner, and the traveller has a usable answer the moment
            // the first pass lands. Holding it until the second pass finished meant a page
            // that had already rendered its hotels still showed as searching for another ten
            // to thirty seconds — the whole cost of the second pass was charged to a wait the
            // traveller had no reason to sit through.
            //
            // The stream stays open afterwards, so the extra hotels and their prices arrive on
            // it as they are found. `collecting` tells the client to keep reading and to leave
            // the spinner off while it does; the stream closing is what ends the search.
            /**
             * Pictures for the hotels that have none, in two phases (as v1 does).
             *
             * A thin `hotel_content` row renders a card with no image at all, which reads as a
             * broken listing rather than a missing photo. Phase A covers what is already on
             * screen and goes out before `done`, so the images appear with the results; phase
             * B covers the supplier's own hotels and goes out after, so nothing waits on it.
             *
             * Only hotels that actually lack an image are asked about — a search where the
             * catalog is complete makes no content call at all.
             */
            const needsImages = (h: any) => !(h.images?.length) && !h.image;
            const missingNow  = [...catalogHotels, ...tgxHotels]
                .filter(needsImages)
                .map((h: any) => String(h.hotelId || h.id))
                .filter(Boolean);

            if (!closed && missingNow.length > 0) {
                const patches = await fetchHotelContentPatches([...new Set(missingNow)], 8_000);
                if (!closed && patches.size > 0) {
                    emit({ type: 'content', data: Object.fromEntries(patches) });
                }
            }

            const firstCount = tgxHotels.length > 0 ? tgxHotels.length : catalogHotels.length;
            if (!closed) emit({
                type: 'done',
                totalCount: firstCount,
                tgxCount:   tgxHotels.length,
                tgxFailed,
                tgxUnanswered,
                collecting: wasTruncated,
            });

            // Phase B is emitted after the collecting pass below, once its hotels are known.
            let extraHotels: any[] = [];
            if (!closed && wasTruncated) {
                console.log(`[stream] First pass took ${firstPassMs}ms and looks truncated — collecting the rest`);
                const t0 = Date.now();
                // A plain repeat: the in-flight dedup entry for the first pass is gone by now,
                // so this is a fresh call rather than a join onto the one that just finished.
                const second = await runTgxSearch(searchArgs)
                    .catch((err: any) => {
                        // Nothing is owed here: the traveller already has the first answer.
                        console.warn(`[stream] Second pass failed for "${city}": ${err?.message}`);
                        return { data: [] as any[], allMappable: [] as any[], totalCount: 0, truncated: false };
                    });

                const secondHotels: any[] = Array.isArray(second.data) ? second.data : [];
                const known = new Set([...tgxHotelIdSet, ...catalogIdSet]);
                extraHotels = secondHotels.filter((h: any) => !known.has(h.hotelId || h.id));
                console.log(`[stream] Second pass: ${secondHotels.length} hotels in ${Date.now() - t0}ms, ${extraHotels.length} of them new`);

                if (!closed && extraHotels.length > 0) {
                    // The prices ride along, so a hotel arriving now is immediately bookable
                    // rather than sitting as a pin with no rate.
                    emit({
                        type: 'prices',
                        data: extraHotels.map((h: any) => ({
                            hotelId:       h.hotelId || h.id,
                            price:         h.price,
                            currency:      h.currency,
                            offerId:       h.offerId,
                            refundableTag: h.refundableTag,
                            boardCode:     h.boardCode,
                            boardTypes:    h.boardCode ? [h.boardCode] : [],
                        })),
                    });
                    emit({ type: 'hotels', data: extraHotels, totalCount: extraHotels.length });

                    // Phase B: pictures for the ones the collecting pass just added. After
                    // their cards, never before — a card with no photo is worth more than no
                    // card, and this call must not hold the hotels up.
                    const missingLate = extraHotels
                        .filter((h: any) => !(h.images?.length) && !h.image)
                        .map((h: any) => String(h.hotelId || h.id))
                        .filter(Boolean);
                    if (!closed && missingLate.length > 0) {
                        const late = await fetchHotelContentPatches([...new Set(missingLate)], 8_000);
                        if (!closed && late.size > 0) {
                            emit({ type: 'content', data: Object.fromEntries(late) });
                        }
                    }
                }
            }

            if (wasTruncated) {
                console.log(`[stream] Collected ${extraHotels.length} extra hotels after done — closing`);
            }

        } catch (err: any) {
            if (!closed) emit({ type: 'error', message: err.message ?? 'Search failed' });
        } finally {
            if (!res.writableEnded) res.end();
        }
    };
}
