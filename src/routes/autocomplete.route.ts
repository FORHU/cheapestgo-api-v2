import { Router, Request, Response, NextFunction } from 'express';
import { config } from '@/config';
import { tgxGraphQL, getTgxConfig } from '@/lib/hotels/travelgatex';

const router = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

interface AutocompleteResult {
    type: 'city' | 'country';
    rung: 'country' | 'province' | 'city' | 'district' | 'poi';
    title: string;
    subtitle: string;
    countryCode: string;
    id?: string;
    code?: string;
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
    const types    = 'region,place,district,locality,neighborhood';
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
                type:        'city' as const,
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

// ─── In-memory cache (300s TTL) ───────────────────────────────────────────────

const _cache = new Map<string, { data: AutocompleteResult[]; expires: number }>();

async function getCachedAutocomplete(query: string, locale?: string): Promise<AutocompleteResult[]> {
    const key    = `${query.toLowerCase()}|${locale ?? 'en'}`;
    const cached = _cache.get(key);
    if (cached && Date.now() < cached.expires) return cached.data;

    const countryResults = matchCountries(query);
    const cityResults    = await fetchCitiesFromMapbox(query, locale);
    const data           = [...countryResults, ...cityResults];

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
 * POST /api/v2/autocomplete
 * Body: { query: string, locale?: 'en'|'ko'|'cn'|'ja' }
 * Returns city + country suggestions with optional TGX dest codes.
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
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
 */
router.post('/resolve', async (req: Request, res: Response, next: NextFunction) => {
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
