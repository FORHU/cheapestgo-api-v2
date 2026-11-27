import { Router, Request, Response, NextFunction } from 'express';
import { config } from '@/config';
import { tgxGraphQL, getTgxConfig } from '@/lib/hotels/travelgatex';
import { searchRateLimit } from '@/middleware/rate-limit.middleware';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const router: Router = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * One thing a traveller can pick, and everything the search needs to act on it.
 *
 * `type` is what it *is*; `rung` is how wide it is. They were the same field's job while only
 * cities and countries existed, and they are not the same question: an airport and a temple
 * are both `poi` by width and nothing alike to a reader scanning a list.
 *
 * Each type carries its own anchor, and the search reads exactly one of them:
 *   country → `countryCode`     city/district → `title` + `countryCode` (+ `bbox` for an area)
 *   poi     → `lat`/`lng`        hotel         → `hotelCode`
 */
interface AutocompleteResult {
    type: 'city' | 'country' | 'poi' | 'hotel';
    rung: 'country' | 'province' | 'city' | 'district' | 'poi';
    title: string;
    subtitle: string;
    countryCode: string;
    id?: string;
    code?: string;
    /** The catalogue's `hotel_id`, on a `hotel` result. The anchor for a named property. */
    hotelCode?: string;
    lat?: number;
    lng?: number;
    bbox?: [number, number, number, number];
}

// ─── Country list ─────────────────────────────────────────────────────────────

const COUNTRY_SEARCH_LIST: { name: string; code: string }[] = [
    { name: 'Philippines', code: 'PH' }, { name: 'South Korea', code: 'KR' },
    { name: 'Japan', code: 'JP' }, { name: 'China', code: 'CN' },
    { name: 'Taiwan', code: 'TW' }, { name: 'Hong Kong', code: 'HK' },
    { name: 'Macau', code: 'MO' }, { name: 'Thailand', code: 'TH' },
    { name: 'Vietnam', code: 'VN' }, { name: 'Indonesia', code: 'ID' },
    { name: 'Malaysia', code: 'MY' }, { name: 'Singapore', code: 'SG' },
    { name: 'Cambodia', code: 'KH' }, { name: 'Myanmar', code: 'MM' },
    { name: 'Laos', code: 'LA' }, { name: 'Brunei', code: 'BN' },
    { name: 'India', code: 'IN' }, { name: 'Sri Lanka', code: 'LK' },
    { name: 'Nepal', code: 'NP' }, { name: 'Bangladesh', code: 'BD' },
    { name: 'Pakistan', code: 'PK' }, { name: 'Maldives', code: 'MV' },
    { name: 'Australia', code: 'AU' }, { name: 'New Zealand', code: 'NZ' },
    { name: 'Fiji', code: 'FJ' }, { name: 'United Arab Emirates', code: 'AE' },
    { name: 'Saudi Arabia', code: 'SA' }, { name: 'Qatar', code: 'QA' },
    { name: 'Bahrain', code: 'BH' }, { name: 'Oman', code: 'OM' },
    { name: 'Kuwait', code: 'KW' }, { name: 'Jordan', code: 'JO' },
    { name: 'Israel', code: 'IL' }, { name: 'Turkey', code: 'TR' },
    { name: 'Lebanon', code: 'LB' }, { name: 'Egypt', code: 'EG' },
    { name: 'United Kingdom', code: 'GB' }, { name: 'France', code: 'FR' },
    { name: 'Germany', code: 'DE' }, { name: 'Italy', code: 'IT' },
    { name: 'Spain', code: 'ES' }, { name: 'Portugal', code: 'PT' },
    { name: 'Netherlands', code: 'NL' }, { name: 'Belgium', code: 'BE' },
    { name: 'Switzerland', code: 'CH' }, { name: 'Austria', code: 'AT' },
    { name: 'Czech Republic', code: 'CZ' }, { name: 'Poland', code: 'PL' },
    { name: 'Hungary', code: 'HU' }, { name: 'Greece', code: 'GR' },
    { name: 'Croatia', code: 'HR' }, { name: 'Sweden', code: 'SE' },
    { name: 'Norway', code: 'NO' }, { name: 'Denmark', code: 'DK' },
    { name: 'Finland', code: 'FI' }, { name: 'Ireland', code: 'IE' },
    { name: 'Iceland', code: 'IS' }, { name: 'Romania', code: 'RO' },
    { name: 'Bulgaria', code: 'BG' }, { name: 'Serbia', code: 'SR' },
    { name: 'Montenegro', code: 'ME' }, { name: 'Slovenia', code: 'SI' },
    { name: 'Slovakia', code: 'SK' }, { name: 'Luxembourg', code: 'LU' },
    { name: 'Malta', code: 'MT' }, { name: 'Cyprus', code: 'CY' },
    { name: 'Estonia', code: 'EE' }, { name: 'Latvia', code: 'LV' },
    { name: 'Lithuania', code: 'LT' }, { name: 'Russia', code: 'RU' },
    { name: 'Ukraine', code: 'UA' }, { name: 'Georgia', code: 'GE' },
    { name: 'United States', code: 'US' }, { name: 'Canada', code: 'CA' },
    { name: 'Mexico', code: 'MX' }, { name: 'Brazil', code: 'BR' },
    { name: 'Argentina', code: 'AR' }, { name: 'Chile', code: 'CL' },
    { name: 'Colombia', code: 'CO' }, { name: 'Peru', code: 'PE' },
    { name: 'Costa Rica', code: 'CR' }, { name: 'Panama', code: 'PA' },
    { name: 'Cuba', code: 'CU' }, { name: 'Dominican Republic', code: 'DO' },
    { name: 'Jamaica', code: 'JM' }, { name: 'Bahamas', code: 'BS' },
    { name: 'Ecuador', code: 'EC' }, { name: 'Uruguay', code: 'UY' },
    { name: 'Bolivia', code: 'BO' }, { name: 'Guatemala', code: 'GT' },
    { name: 'Honduras', code: 'HN' }, { name: 'Belize', code: 'BZ' },
    { name: 'South Africa', code: 'ZA' }, { name: 'Morocco', code: 'MA' },
    { name: 'Tunisia', code: 'TN' }, { name: 'Kenya', code: 'KE' },
    { name: 'Tanzania', code: 'TZ' }, { name: 'Nigeria', code: 'NG' },
    { name: 'Ghana', code: 'GH' }, { name: 'Ethiopia', code: 'ET' },
    { name: 'Mauritius', code: 'MU' }, { name: 'Seychelles', code: 'SC' },
    { name: 'Rwanda', code: 'RW' }, { name: 'Namibia', code: 'NA' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapboxTypeToRung(placeType: string): AutocompleteResult['rung'] {
    switch (placeType) {
        case 'country':                               return 'country';
        case 'region':                                return 'province';
        case 'place':                                 return 'city';
        case 'district': case 'locality':
        case 'neighborhood':                          return 'district';
        // A landmark, a station, an airport — a point rather than an area. Everything used to
        // fall through to 'city' here, which was true while only places were requested.
        case 'poi': case 'poi.landmark': case 'address': return 'poi';
        default:                                      return 'city';
    }
}

function mapboxLang(locale?: string): string {
    switch (locale) {
        case 'ko': return 'ko';
        case 'ja': return 'ja';
        case 'cn': return 'zh-Hans';
        default:   return 'en';
    }
}

function matchCountries(query: string): AutocompleteResult[] {
    const q = query.toLowerCase().trim();
    return COUNTRY_SEARCH_LIST
        .filter(c => c.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map(c => ({
            type:        'country' as const,
            rung:        'country' as const,
            title:       c.name,
            subtitle:    'Country · Browse all hotels',
            countryCode: c.code,
        }));
}

async function fetchCitiesFromMapbox(query: string, locale?: string): Promise<AutocompleteResult[]> {
    const token = config.MAPBOX_TOKEN;
    if (!token) return [];

    const lang     = mapboxLang(locale);
    const language = lang === 'en' ? 'en' : `${lang},en`;
    // `poi` is what makes a landmark and an airport pickable: Mapbox returns both with
    // coordinates, which is the only thing a radius search needs. Adding them here rather than
    // from a separate airport list, because `lib/airports.ts` holds IATA codes and city names
    // and no coordinates — and Narita is 60km from the Tokyo its city name would resolve to,
    // which is the one distance a transit passenger cares about.
    const types    = 'region,place,district,locality,neighborhood,poi';
    const url      = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=${types}&limit=8&language=${language}&proximity=126.9780,37.5665&access_token=${token}`;

    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data: any = await res.json();

        const results: AutocompleteResult[] = (data.features ?? []).map((feature: any) => {
            const cityName   = feature.text_en ?? feature.text ?? '';
            const placeName  = feature.place_name ?? '';
            const countryCtx = (feature.context ?? []).find((c: any) => c.id?.startsWith('country.'));
            const rawCode    = countryCtx?.short_code ?? '';
            const countryCode = rawCode ? rawCode.toUpperCase().slice(0, 2) : '';
            const placeType   = (feature.place_type ?? [])[0] ?? 'place';
            const rung        = mapboxTypeToRung(placeType);
            const center: [number, number] | undefined = Array.isArray(feature.center) ? feature.center : undefined;
            const bbox: [number, number, number, number] | undefined =
                Array.isArray(feature.bbox) && feature.bbox.length === 4 ? feature.bbox : undefined;

            return {
                // Read off the rung rather than assumed. Everything from Mapbox was labelled
                // a city, which was harmless while only places were asked for and wrong the
                // moment an airport came back.
                type:        rung === 'poi' ? ('poi' as const) : ('city' as const),
                rung,
                title:       cityName,
                subtitle:    placeName,
                countryCode,
                id:          feature.id ?? undefined,
                lat:         center ? center[1] : undefined,
                lng:         center ? center[0] : undefined,
                bbox,
            };
        });

        // Deduplicate by title+countryCode
        const seen = new Set<string>();
        return results.filter(r => {
            const key = `${r.title.toLowerCase()}|${r.countryCode}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    } catch {
        return [];
    }
}

/**
 * Properties by name, from our own catalogue.
 *
 * Not from the supplier: these are the hotels we can actually price, so a name offered here
 * always leads somewhere. Asking TravelgateX instead would cost a call per keystroke and could
 * suggest a property the catalogue has never heard of.
 *
 * A miss is silent. A traveller typing a city is not told the hotel lookup failed, and a
 * failure here must not take the cities down with it.
 */
async function matchHotels(query: string): Promise<AutocompleteResult[]> {
    const q = query.trim();
    if (q.length < 3) return [];   // "ho" matches thousands and means nothing

    try {
        const rows = await prisma.hotel_content.findMany({
            where: {
                name:   { contains: q, mode: 'insensitive' },
                images: { isEmpty: false },
            },
            orderBy: { review_count: { sort: 'desc', nulls: 'last' } },
            take: 4,
            select: { hotel_id: true, name: true, city: true, country: true, lat: true, lng: true },
        });

        return rows
            .filter(r => r.name)
            .map(r => ({
                type:        'hotel' as const,
                rung:        'poi' as const,
                title:       r.name!,
                subtitle:    [r.city, r.country].filter(Boolean).join(', ') || 'Hotel',
                countryCode: (r.country ?? '').slice(0, 2).toUpperCase(),
                hotelCode:   r.hotel_id,
                // Carried so a client can place the pin without a second call. The search
                // anchors on `hotelCode`, not on these.
                lat:         r.lat || undefined,
                lng:         r.lng || undefined,
            }));
    } catch {
        return [];
    }
}

// ─── In-memory cache (300s TTL) ───────────────────────────────────────────────

const _cache = new Map<string, { data: AutocompleteResult[]; expires: number }>();

async function getCachedAutocomplete(query: string, locale?: string): Promise<AutocompleteResult[]> {
    const key    = `${query.toLowerCase()}|${locale ?? 'en'}`;
    const cached = _cache.get(key);
    if (cached && Date.now() < cached.expires) return cached.data;

    // Side by side: the catalogue is ours and answers in milliseconds, Mapbox is a round trip,
    // and waiting for one before starting the other would add the slower to the faster.
    const [countryResults, placeResults, hotelResults] = await Promise.all([
        Promise.resolve(matchCountries(query)),
        fetchCitiesFromMapbox(query, locale),
        matchHotels(query),
    ]);

    // Ordered by how precisely each answers what was typed, not by where it came from.
    //
    // A named property first: typing a hotel's name is the least ambiguous thing a traveller
    // can do, and burying it under the city it stands in is what made people pick the city and
    // hunt. Places next, because most searches are places. A country last — it is the widest
    // thing on the list and the only one that cannot return a complete answer.
    const places = placeResults.filter(r => r.type === 'city');
    const pois   = placeResults.filter(r => r.type === 'poi');
    const data   = [...hotelResults, ...places, ...pois, ...countryResults];

    _cache.set(key, { data, expires: Date.now() + 300_000 });
    return data;
}

// ─── TGX dest code resolution ─────────────────────────────────────────────────

const _destCodeCache = new Map<string, string>();

const DEST_QUERY = `query TgxResolveCity($access: ID!, $text: String!, $maxSize: Int) {
    hotelX {
        destinationSearcher(criteria: { access: $access, text: $text, maxSize: $maxSize }) {
            ... on DestinationData { code type texts { text language } }
        }
    }
}`;

async function resolveTgxCode(cityName: string, countryCode?: string): Promise<string | undefined> {
    const key    = countryCode ? `${cityName.toLowerCase()}:${countryCode.toLowerCase()}` : cityName.toLowerCase();
    const cached = _destCodeCache.get(key);
    if (cached !== undefined) return cached === 'NONE' ? undefined : cached;

    try {
        const cfg  = getTgxConfig();
        if (!cfg.apiKey) return undefined;

        const result = await Promise.race([
            tgxGraphQL(DEST_QUERY, { access: cfg.accessCode, text: cityName, maxSize: 50 }),
            new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 8_000)),
        ]);
        if (!result) return undefined;

        const items: any[] = (result as any)?.data?.hotelX?.destinationSearcher ?? [];
        const exactName    = cityName.toLowerCase();
        const matchesName  = (i: any) => (i.texts ?? []).some((t: any) => t.language === 'en' && t.text.toLowerCase() === exactName);
        const cityItem     = items.find((i: any) => i.type === 'CITY' && matchesName(i)) ?? items.find((i: any) => i.type === 'CITY');
        const zoneItem     = items.find((i: any) => i.type === 'ZONE' && matchesName(i)) ?? items.find((i: any) => i.type === 'ZONE');
        const selected     = countryCode ? (zoneItem ?? cityItem) : (cityItem ?? zoneItem);
        const code         = selected?.code as string | undefined;

        _destCodeCache.set(key, code ?? 'NONE');
        return code;
    } catch {
        return undefined;
    }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * Deprecated, and recording whether anyone still disagrees.
 *
 * This whole router was ported from v1 and its client side never came with it. Searched on
 * 2026-11-27 across app-v2, the Flutter app and the staff console: nothing calls either
 * endpoint. Every destination suggestion a traveller sees comes from `GET /hotels/destinations`
 * and `DestinationsService`, which is the one that gained hotel suggestions, city-state
 * handling and the shared cache — work that went in here first and was invisible to every
 * client until it was moved.
 *
 * Not deleted, because "no caller in our repositories" is not "no caller": a released Android
 * build is not something we can grep, and this answers a public URL. So it is marked, and it
 * says so when used. A quiet fortnight in the logs is the evidence to remove it on; a line in
 * them is a consumer we did not know about, which is exactly what we are checking for.
 */
function recordDeprecatedUse(req: Request, endpoint: string): void {
    logger.warn({
        message: '[autocomplete] deprecated endpoint used — see the note in autocomplete.route.ts',
        endpoint,
        // Enough to identify a caller, and nothing about who was typing.
        userAgent: req.get('user-agent') ?? 'unknown',
        appVersion: req.get('x-app-version') ?? undefined,
    });
}

/**
 * POST /api/v2/autocomplete
 * Body: { query: string, locale?: 'en'|'ko'|'cn'|'ja' }
 * Returns city + country suggestions with optional TGX dest codes.
 *
 * @deprecated Use `GET /api/v2/hotels/destinations`. See `recordDeprecatedUse` above.
 */
router.post('/', searchRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    recordDeprecatedUse(req, 'POST /autocomplete');
    try {
        const { query = '', locale } = req.body as { query?: string; locale?: string };
        if (!query || query.length < 2) {
            return res.json({ success: true, data: [] });
        }

        const data = await getCachedAutocomplete(String(query).slice(0, 100), locale);

        // Enrich the first city result with a TGX destination code (background — don't block)
        const firstCity = data.find(r => r.type === 'city' && r.rung === 'city');
        if (firstCity && !firstCity.code) {
            resolveTgxCode(firstCity.title, firstCity.countryCode)
                .then(code => { if (code) firstCity.code = code; })
                .catch(() => {});
        }

        return res.json({ success: true, data });
    } catch (err) { next(err); }
});

/**
 * POST /api/v2/autocomplete/resolve
 * Body: { cityName: string, countryCode?: string }
 * Returns the TGX destination code for a given city.
 *
 * A miss reaches TravelgateX, so this costs a supplier call per unseen city name and
 * carries the search budget like the rest of the supplier-facing routes (QA BG-10).
 *
 * @deprecated Nothing calls it. Doubly worth knowing about if something does, because unlike
 * its sibling this one spends a supplier call to answer.
 */
router.post('/resolve', searchRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    recordDeprecatedUse(req, 'POST /autocomplete/resolve');
    try {
        const { cityName, countryCode } = req.body as { cityName?: string; countryCode?: string };
        if (!cityName || typeof cityName !== 'string' || cityName.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'cityName is required' });
        }
        const cc   = countryCode && typeof countryCode === 'string' && countryCode.length === 2
            ? countryCode.toUpperCase()
            : undefined;
        const code = await resolveTgxCode(cityName.trim(), cc);
        return res.json({ success: true, code: code ?? null });
    } catch (err) { next(err); }
});

export default router;
