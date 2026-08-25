import { config } from '@/config';
import { CITY_ALIASES, matchAliasQuery, resolveHotelDbCities } from '@/lib/cityAliases';
import { COUNTRY_SEARCH_LIST, extractCountryCode } from '@/lib/countries';
import { DestinationsRepository } from '@/repositories/destinations.repository';
import { logger } from '@/lib/logger';

/**
 * Destination autocomplete, ported from v1's `src/lib/server/search.ts`.
 *
 * Not to be confused with the Google Places autocomplete already in
 * HotelsController: this one returns the granularity `rung`, a `bbox`, and a
 * `canonicalCity`, which the search page needs to scope map pins to a city and
 * to run the hotel search against the right destination. See ADR-0006.
 */

// --- Types -------------------------------------------------------------------

/** Where a searched place sits on the granularity ladder (ADR-0006). Area rungs
 *  (country/province/city) resolve to a region; point rungs (district/poi)
 *  resolve to a coordinate plus a radius. */
export type DestinationRung = 'country' | 'province' | 'city' | 'district' | 'poi';

export interface AutocompleteResult {
    type:           'city' | 'country';
    rung:           DestinationRung;
    title:          string;
    subtitle:       string;
    countryCode:    string;
    id?:            string;
    code?:          string;
    lat?:           number;
    lng?:           number;
    /** Mapbox bounding box [minLng, minLat, maxLng, maxLat] - sizes a district's search circle. */
    bbox?:          [number, number, number, number];
    /** Original district name when the result is a sub-city area, e.g. "Gangnam District". */
    districtName?:  string;
    /** The canonical city the hotel search actually runs against, e.g. "Seoul" for "Gangnam". */
    canonicalCity?: string;
}

// --- Response cache ----------------------------------------------------------

// v1 wrapped this path in Next's `unstable_cache` with a 300s revalidate. There
// is no equivalent here and Redis is optional, so the cache is in-process: it
// exists to stop one user's keystrokes fanning out into repeat Mapbox calls,
// not to be shared between instances.
const CACHE_TTL_MS = 300_000;
const _cache = new Map<string, { at: number; data: AutocompleteResult[] }>();

function cacheGet(key: string): AutocompleteResult[] | undefined {
    const hit = _cache.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
        _cache.delete(key);
        return undefined;
    }
    return hit.data;
}

function cacheSet(key: string, data: AutocompleteResult[]): void {
    // Bounded so a long-running process cannot grow this without limit.
    if (_cache.size > 500) _cache.clear();
    _cache.set(key, { at: Date.now(), data });
}

// --- Mapbox helpers ----------------------------------------------------------

/** Map a Mapbox geocoder place_type to a ladder rung. */
function mapboxTypeToRung(placeType: string): DestinationRung {
    switch (placeType) {
        case 'country':      return 'country';
        case 'region':       return 'province';
        case 'place':        return 'city';
        case 'district':
        case 'locality':
        case 'neighborhood': return 'district';
        case 'poi':
        case 'poi.landmark':
        case 'address':      return 'poi';
        default:             return 'city';
    }
}

/** Map an app locale to a Mapbox geocoder language code. */
function mapboxLang(locale?: string): string {
    switch (locale) {
        case 'ko': return 'ko';
        case 'ja': return 'ja';
        case 'zh': return 'zh-Hans';
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
            subtitle:    'Country - Browse all hotels',
            countryCode: c.code,
        }));
}

/** Title-case an alias key for display: 'clark freeport' -> 'Clark Freeport'. */
function titleCaseAlias(alias: string): string {
    return alias.replace(/(^|[\s\-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Remap a Mapbox result to its canonical city when the alias dictionary knows
 * it - "Ottavia" to "Rome", "Manhattan" to "New York". Every rung is checked,
 * because Mapbox sometimes classifies a sub-city area as a 'place'.
 */
function resolveAliasedCity(cityName: string, placeName: string, countryCode: string): string | undefined {
    const countryMap = CITY_ALIASES[countryCode];
    if (!countryMap) return undefined;

    const nameLower      = cityName.toLowerCase();
    const placeNameLower = placeName.toLowerCase();

    // Context-aware qualified match: Mapbox strips city qualifiers (returning
    // "Midtown" for "Midtown Miami"), so prefer the longest alias key that both
    // starts with the name and whose qualifier appears in the full place name.
    // That maps "Midtown" in a Miami subtitle to Miami rather than New York.
    const qualifiedKey = Object.keys(countryMap)
        .filter(key => {
            if (!key.startsWith(nameLower + ' ') && !key.startsWith(nameLower + '-')) return false;
            const qualifier = key.slice(nameLower.length + 1);
            return qualifier.length > 0 && placeNameLower.includes(qualifier);
        })
        .sort((a, b) => b.length - a.length)[0];
    if (qualifiedKey) return countryMap[qualifiedKey];

    // Exact match, then longest prefix so "jamaica plain" (Boston) beats the
    // shorter "jamaica" (New York).
    const exactKey = Object.keys(countryMap).find(key => nameLower === key);
    if (exactKey) return countryMap[exactKey];

    const prefixKey = Object.keys(countryMap)
        .filter(key => nameLower.startsWith(key + ' ') || nameLower.startsWith(key + '-'))
        .sort((a, b) => b.length - a.length)[0];
    return prefixKey ? countryMap[prefixKey] : undefined;
}

export class DestinationsService {
    private repo = new DestinationsRepository();

    private async fetchCitiesFromMapbox(query: string, locale?: string): Promise<AutocompleteResult[]> {
        const token = config.MAPBOX_TOKEN;
        if (!token) return [];

        // proximity biases toward Asia. The user's language *and* English are
        // requested so non-Latin queries match while `text_en` still gives a
        // resolution-safe canonical name - destination codes, cache keys and
        // hotel_content.city are all English-keyed. types spans the whole ladder
        // except country, which comes from COUNTRY_SEARCH_LIST.
        const lang     = mapboxLang(locale);
        const language = lang === 'en' ? 'en' : `${lang},en`;
        const types    = 'region,place,district,locality,neighborhood,poi';
        const url =
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
            + `?types=${types}&limit=8&language=${language}&proximity=126.9780,37.5665&access_token=${token}`;

        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) return [];
            const data = await res.json() as { features?: any[] };

            const mapped: AutocompleteResult[] = (data.features ?? []).map((feature: any) => {
                const cityName  = feature.text_en ?? feature.text ?? '';
                const placeName = feature.place_name ?? '';

                const countryCtx  = (feature.context ?? []).find((c: any) => c.id?.startsWith('country.'));
                const rawCode     = countryCtx?.short_code ?? '';
                const countryCode = rawCode
                    ? String(rawCode).toUpperCase().slice(0, 2)
                    : extractCountryCode(placeName, cityName);

                const placeType: string = (feature.place_type ?? [])[0] ?? 'place';
                const rung = mapboxTypeToRung(placeType);

                const center: [number, number] | undefined =
                    Array.isArray(feature.center) ? feature.center as [number, number] : undefined;
                let effectiveBbox: [number, number, number, number] | undefined =
                    Array.isArray(feature.bbox) && feature.bbox.length === 4
                        ? feature.bbox as [number, number, number, number]
                        : undefined;

                const aliasedCity = resolveAliasedCity(cityName, placeName, countryCode);

                // An alias fired but Mapbox gave no bbox (common for sub-districts):
                // synthesise a ~5 km box from the centre so the search page can still
                // filter hotels to the neighbourhood.
                if (aliasedCity && !effectiveBbox && center) {
                    const [lng, lat] = center;
                    const latDelta = 0.045; // ~5 km
                    const lngDelta = latDelta / Math.cos(lat * Math.PI / 180);
                    effectiveBbox = [
                        +(lng - lngDelta).toFixed(6),
                        +(lat - latDelta).toFixed(6),
                        +(lng + lngDelta).toFixed(6),
                        +(lat + latDelta).toFixed(6),
                    ];
                }

                return {
                    type: 'city' as const,
                    rung: aliasedCity ? 'city' as const : rung,
                    // The district name is shown, not the canonical city - the user
                    // sees what they typed. canonicalCity carries the search target.
                    title:         cityName,
                    subtitle:      placeName,
                    countryCode,
                    id:            feature.id ?? undefined,
                    lat:           center ? center[1] : undefined,
                    lng:           center ? center[0] : undefined,
                    bbox:          effectiveBbox,
                    districtName:  aliasedCity ? cityName : undefined,
                    canonicalCity: aliasedCity,
                };
            });

            // Collapse multiple Mapbox features that alias to the same canonical city.
            const seen = new Set<string>();
            return mapped.filter(r => {
                const key = r.canonicalCity
                    ? `${r.canonicalCity.toLowerCase()}|${r.countryCode}`
                    : `${r.title.toLowerCase()}|${r.countryCode}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        } catch {
            return [];
        }
    }

    /** Forward-geocode a canonical city to its centre and bounds, scoped to one
     *  country. Alias entries store names only, so query-side alias hits need this
     *  to gain real geometry. */
    private async geocodeCanonicalCity(
        name: string,
        countryCode: string,
    ): Promise<{ lat: number; lng: number; bbox?: [number, number, number, number]; placeName: string } | null> {
        const token = config.MAPBOX_TOKEN;
        if (!token || !name.trim()) return null;
        const country = countryCode ? `&country=${countryCode.toLowerCase()}` : '';
        const url =
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json`
            + `?types=place,region,locality&limit=1&language=en${country}&access_token=${token}`;
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) return null;
            const feature = ((await res.json() as { features?: any[] }).features ?? [])[0];
            if (!feature || !Array.isArray(feature.center)) return null;
            return {
                lng:       feature.center[0],
                lat:       feature.center[1],
                bbox:      Array.isArray(feature.bbox) && feature.bbox.length === 4 ? feature.bbox : undefined,
                placeName: feature.place_name ?? name,
            };
        } catch {
            return null;
        }
    }

    /**
     * Suggestions derived from the alias dictionary by matching the user's query,
     * for destinations Mapbox cannot return at all ("Clark" PH resolves to Clark,
     * New Jersey). `covered` maps country code to names Mapbox already produced,
     * so a place that resolved normally is never duplicated.
     */
    private async fetchAliasSuggestions(
        query: string,
        covered: Map<string, string[]>,
    ): Promise<AutocompleteResult[]> {
        const matches = matchAliasQuery(query, 3).filter(m => {
            const canonical = m.canonicalCity.toLowerCase();
            // Suppress when Mapbox covers this under a slightly different name -
            // "Boracay" vs "Boracay Island". Compared on whole leading words only,
            // so "York" never swallows "New York".
            return !(covered.get(m.countryCode) ?? []).some(name =>
                name === canonical
                || canonical.startsWith(name + ' ')
                || name.startsWith(canonical + ' ')
            );
        });

        // Cap the extra geocodes: an uncached keystroke should not fan out into
        // several Mapbox round-trips.
        const geocoded = await Promise.all(
            matches.slice(0, 2).map(async (m): Promise<AutocompleteResult | null> => {
                const geo = await this.geocodeCanonicalCity(m.canonicalCity, m.countryCode);
                if (!geo) return null;
                const displayName    = titleCaseAlias(m.alias);
                const isSubArea      = displayName.toLowerCase() !== m.canonicalCity.toLowerCase();
                const namesCanonical = geo.placeName.toLowerCase().startsWith(m.canonicalCity.toLowerCase());
                return {
                    type: 'city' as const,
                    // Alias hits search the canonical city's inventory, matching how
                    // Mapbox-side alias remapping is rung'd above.
                    rung: 'city' as const,
                    title: displayName,
                    subtitle: isSubArea && !namesCanonical
                        ? `${m.canonicalCity} - ${geo.placeName}`
                        : geo.placeName,
                    countryCode: m.countryCode,
                    lat: geo.lat,
                    lng: geo.lng,
                    // Deliberately the canonical city's own bounds, not a synthetic
                    // circle around the alias: we do not know where the alias sits,
                    // and guessing produces a bbox that filters out every hotel.
                    bbox: geo.bbox,
                    districtName:  isSubArea ? displayName : undefined,
                    canonicalCity: m.canonicalCity,
                };
            })
        );
        return geocoded.filter((r): r is AutocompleteResult => r !== null);
    }

    /**
     * Which of these destinations we actually have hotels for, keyed by canonical
     * name. ETG stores some localized city names ("Rom", "Athen"), so the canonical
     * name is mapped to its catalog spelling before querying.
     */
    private async filterCitiesWithHotels(
        cities: Array<{
            title: string;
            countryCode: string;
            canonicalCity?: string;
            rung?: DestinationRung;
            bbox?: [number, number, number, number];
        }>,
    ): Promise<Set<string>> {
        if (!cities.length) return new Set();
        try {
            const pairs = cities.map(c => ({
                canonical: (c.canonicalCity ?? c.title).toLowerCase(),
                // A city can be filed under several spellings at once - Seoul is
                // both "Seoul" and "Seúl" - so all of them have to be searched or
                // a city we stock thousands of hotels in reports as uncovered.
                dbCities:  resolveHotelDbCities(c.canonicalCity ?? c.title, c.countryCode)
                    .map(n => n.toLowerCase()),
                country:   c.countryCode.toLowerCase(),
            }));

            const rows    = await this.repo.findCityCoverage([...new Set(pairs.flatMap(p => p.dbCities))]);
            const matched = new Set(rows.map(r => `${r.city}|${r.country}`));

            const result = new Set<string>();
            for (const p of pairs) {
                // Any one spelling having hotels means we cover the city.
                if (p.dbCities.some(n => matched.has(`${n}|${p.country}`))) result.add(p.canonical);
            }

            // Fall back to a city-only match when nothing matched on country too.
            if (result.size === 0) {
                const cityOnly = new Set(rows.map(r => r.city));
                for (const p of pairs) if (p.dbCities.some(n => cityOnly.has(n))) result.add(p.canonical);
            }

            // An area rung has no catalog row under its own name — Palawan's hotels
            // are filed as El Nido, Coron and Puerto Princesa — so the name check
            // above always calls it uncovered and it sorts below any city that
            // merely resembles the query. Ask geographically instead.
            const areas = cities.filter(c =>
                (c.rung === 'province' || c.rung === 'country') &&
                Array.isArray(c.bbox) &&
                !result.has((c.canonicalCity ?? c.title).toLowerCase())
            );
            if (areas.length) {
                const covered = await Promise.all(
                    areas.map(a => this.repo.areaHasHotels(a.bbox!, a.countryCode).catch(() => false)),
                );
                areas.forEach((a, i) => {
                    if (covered[i]) result.add((a.canonicalCity ?? a.title).toLowerCase());
                });
            }

            return result;
        } catch (err) {
            // Coverage is a ranking signal, not a filter: if the catalog cannot be
            // read, show everything rather than nothing.
            logger.warn({ err, message: '[destinations] coverage lookup failed' });
            return new Set(cities.map(c => (c.canonicalCity ?? c.title).toLowerCase()));
        }
    }

    private async fetchAutocomplete(query: string, locale?: string): Promise<AutocompleteResult[]> {
        const countryResults = matchCountries(query);
        const cityResults    = await this.fetchCitiesFromMapbox(query, locale);

        // Fill gaps in Mapbox's index from the alias dictionary, matched against
        // the raw query rather than Mapbox's output.
        const covered = new Map<string, string[]>();
        for (const c of cityResults) {
            const names = covered.get(c.countryCode) ?? [];
            names.push((c.canonicalCity ?? c.title).toLowerCase());
            // Index the display title too: an alias may collide with the raw Mapbox
            // name even when that result carries a different canonical city.
            if (c.canonicalCity) names.push(c.title.toLowerCase());
            covered.set(c.countryCode, names);
        }
        const aliasResults = await this.fetchAliasSuggestions(query, covered);

        const allCities = [...cityResults, ...aliasResults];
        if (!allCities.length) return countryResults;

        // Destinations we stock sort to the top; the rest still show, below.
        const withHotels = await this.filterCitiesWithHotels(allCities);
        const sorted = [
            ...allCities.filter(c =>  withHotels.has((c.canonicalCity ?? c.title).toLowerCase())),
            ...allCities.filter(c => !withHotels.has((c.canonicalCity ?? c.title).toLowerCase())),
        ];

        return [...countryResults, ...sorted];
    }

    /**
     * Autocomplete destinations. Countries come from the local list; cities from
     * Mapbox, remapped through the alias dictionary and ranked by whether we have
     * hotels there. A query shorter than two characters returns nothing.
     */
    async autocomplete(query: string, locale?: string): Promise<AutocompleteResult[]> {
        if (!query || query.trim().length < 2) return [];

        const key    = `${locale ?? 'en'}|${query.toLowerCase().trim()}`;
        const cached = cacheGet(key);
        if (cached) return cached;

        const data = await this.fetchAutocomplete(query.trim(), locale);
        cacheSet(key, data);
        return data;
    }
}
