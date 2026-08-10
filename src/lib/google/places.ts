/**
 * Google Places + Geocoding client.
 * Wraps the REST APIs used by the monolith's autocomplete, place-details,
 * places/discover, google/geocode, and google/places routes.
 */

import { config } from '@/config';
import { prisma } from '@/lib/prisma';
import { CITY_ALIASES, resolveHotelDbCity } from '@/lib/cityAliases';

function getKey(): string {
    const key = config.GOOGLE_PLACES_API_KEY;
    if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not configured');
    return key;
}

// ─── Place Details (with DB cache) ────────────────────────────────────────────

export async function getPlaceDetails(placeId: string): Promise<any> {
    // Check DB cache (24h TTL)
    const cached = await prisma.place_cache.findUnique({ where: { place_id: placeId } });
    if (cached) {
        const ageMs = Date.now() - new Date(cached.cached_at).getTime();
        if (ageMs < 86_400_000) return cached.data;
    }

    const key    = getKey();
    const fields = 'name,rating,photos,formatted_address,geometry,opening_hours,price_level';
    const url    = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${key}`;
    const res    = await fetch(url);
    const data: any   = await res.json();

    if (!res.ok || data.status !== 'OK') {
        throw new Error(`Google Places API error: ${data.status ?? res.status}`);
    }

    const placeDetails = data.result;

    // Upsert cache (fire-and-forget)
    prisma.place_cache.upsert({
        where:  { place_id: placeId },
        create: { place_id: placeId, data: placeDetails, cached_at: new Date() },
        update: { data: placeDetails, cached_at: new Date() },
    }).catch(() => {});

    return placeDetails;
}

// ─── Autocomplete (Mapbox-based in monolith; we expose the same shape) ────────

export interface AutocompleteResult {
    type: 'city' | 'country';
    title: string;
    subtitle: string;
    countryCode: string;
    id?: string;
    code?: string;
}

const COUNTRY_SEARCH_LIST = [
    // Asia Pacific
    { name: 'Philippines', code: 'PH' }, { name: 'Indonesia', code: 'ID' },
    { name: 'Japan', code: 'JP' }, { name: 'Thailand', code: 'TH' },
    { name: 'South Korea', code: 'KR' }, { name: 'Vietnam', code: 'VN' },
    { name: 'Cambodia', code: 'KH' }, { name: 'Singapore', code: 'SG' },
    { name: 'Malaysia', code: 'MY' }, { name: 'Myanmar', code: 'MM' },
    { name: 'Laos', code: 'LA' }, { name: 'India', code: 'IN' },
    { name: 'China', code: 'CN' }, { name: 'Hong Kong', code: 'HK' },
    { name: 'Taiwan', code: 'TW' }, { name: 'Maldives', code: 'MV' },
    { name: 'Sri Lanka', code: 'LK' }, { name: 'Nepal', code: 'NP' },
    { name: 'Australia', code: 'AU' }, { name: 'New Zealand', code: 'NZ' },
    // Middle East & Gulf
    { name: 'United Arab Emirates', code: 'AE' }, { name: 'Saudi Arabia', code: 'SA' },
    { name: 'Qatar', code: 'QA' }, { name: 'Kuwait', code: 'KW' },
    { name: 'Bahrain', code: 'BH' }, { name: 'Jordan', code: 'JO' },
    { name: 'Turkey', code: 'TR' },
    // Europe
    { name: 'France', code: 'FR' }, { name: 'Italy', code: 'IT' },
    { name: 'Spain', code: 'ES' }, { name: 'Germany', code: 'DE' },
    { name: 'Greece', code: 'GR' }, { name: 'United Kingdom', code: 'GB' },
    { name: 'Ireland', code: 'IE' }, { name: 'Portugal', code: 'PT' },
    { name: 'Netherlands', code: 'NL' }, { name: 'Switzerland', code: 'CH' },
    { name: 'Austria', code: 'AT' }, { name: 'Norway', code: 'NO' },
    { name: 'Sweden', code: 'SE' }, { name: 'Denmark', code: 'DK' },
    { name: 'Iceland', code: 'IS' },
    // Africa
    { name: 'Egypt', code: 'EG' }, { name: 'Morocco', code: 'MA' },
    { name: 'South Africa', code: 'ZA' }, { name: 'Kenya', code: 'KE' },
    // Americas
    { name: 'United States', code: 'US' }, { name: 'Canada', code: 'CA' },
    { name: 'Mexico', code: 'MX' }, { name: 'Brazil', code: 'BR' },
    { name: 'Argentina', code: 'AR' }, { name: 'Peru', code: 'PE' },
];

function matchCountries(query: string): AutocompleteResult[] {
    const q = query.toLowerCase().trim();
    return COUNTRY_SEARCH_LIST
        .filter(c => c.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map(c => ({
            type:        'country' as const,
            title:       c.name,
            subtitle:    'Country · Browse all hotels',
            countryCode: c.code,
        }));
}

async function fetchCitiesFromMapbox(query: string): Promise<AutocompleteResult[]> {
    const token = process.env.MAPBOX_TOKEN;
    if (!token) return [];

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=place,locality,region&limit=8&language=en&proximity=126.9780,37.5665&access_token=${token}`;
    try {
        const res  = await fetch(url);
        if (!res.ok) return [];
        const data: any = await res.json();

        return (data.features ?? []).map((feature: any) => {
            const cityName     = feature.text ?? '';
            const placeName    = feature.place_name ?? '';
            const countryCtx   = (feature.context ?? []).find((c: any) => c.id?.startsWith('country.'));
            const rawCode      = countryCtx?.short_code ?? '';
            const countryCode  = rawCode ? rawCode.toUpperCase().slice(0, 2) : '';
            return {
                type:        'city' as const,
                title:       cityName,
                subtitle:    placeName,
                countryCode,
                id:          feature.id ?? undefined,
            };
        });
    } catch {
        return [];
    }
}

// Mapbox returns titles like "Gangnam District" — try the full title, then strip
// common geographic suffixes to match alias keys like "gangnam".
const GEO_SUFFIX = /(\s+(district|county|province|prefecture|municipality|ward|borough|township|region|area|city|town|village)|[-\s]ku|[-\s]gu|[-\s]dong|[-\s]si)$/i;

function resolveAlias(title: string, countryCode: string): string {
    const aliasMap = CITY_ALIASES[countryCode.toUpperCase()] ?? {};
    const lower    = title.toLowerCase();
    if (aliasMap[lower]) return aliasMap[lower];
    const stripped = lower.replace(GEO_SUFFIX, '').trim();
    return aliasMap[stripped] ?? title;
}

async function filterCitiesWithHotels(cities: Array<{ title: string; countryCode: string }>): Promise<Set<string>> {
    if (!cities.length) return new Set();
    try {
        // Resolve district/neighbourhood names to canonical DB city names before querying.
        // e.g. "Gangnam District" (KR) → alias "gangnam" → "Seoul" → resolveHotelDbCity → "Seoul"
        const resolved = cities.map(c => {
            const canonical = resolveAlias(c.title, c.countryCode);
            const dbCity    = resolveHotelDbCity(canonical, c.countryCode).toLowerCase();
            return { title: c.title, countryCode: c.countryCode, dbCity };
        });

        const dbCityNames = [...new Set(resolved.map(r => r.dbCity))];
        const rows = await prisma.hotel_content.findMany({
            where:  { city: { in: dbCityNames, mode: 'insensitive' } },
            select: { city: true, country: true },
            distinct: ['city', 'country'],
        });
        const matched = new Set(rows.map((r: any) => `${r.city?.toLowerCase()}|${r.country?.toLowerCase()}`));
        const result  = new Set<string>();
        for (const r of resolved) {
            if (matched.has(`${r.dbCity}|${r.countryCode.toLowerCase()}`)) {
                result.add(r.title.toLowerCase());
            }
        }
        if (result.size === 0) {
            const cityOnlyMatched = new Set(rows.map((r: any) => r.city?.toLowerCase() as string));
            for (const r of resolved) {
                if (cityOnlyMatched.has(r.dbCity)) result.add(r.title.toLowerCase());
            }
        }
        return result;
    } catch {
        return new Set(cities.map(c => c.title.toLowerCase()));
    }
}

export async function autocompleteDestinations(
    query: string,
): Promise<{ success: true; data: AutocompleteResult[] } | { success: false; error: string }> {
    if (!query || query.length < 2) return { success: true, data: [] };

    try {
        const countryResults = matchCountries(query);
        const q              = query.toLowerCase().trim();
        const isExactCountry = countryResults.some(
            c => c.title.toLowerCase() === q || (c.title.toLowerCase().startsWith(q) && q.length >= 4)
        );
        if (isExactCountry) return { success: true, data: countryResults };

        const cityResults = await fetchCitiesFromMapbox(query);
        if (!cityResults.length) return { success: true, data: countryResults };

        const citiesWithHotels = await filterCitiesWithHotels(cityResults);
        const sorted = [
            ...cityResults.filter(c => citiesWithHotels.has(c.title.toLowerCase())),
            ...cityResults.filter(c => !citiesWithHotels.has(c.title.toLowerCase())),
        ];
        return { success: true, data: [...countryResults, ...sorted] };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Autocomplete failed',
        };
    }
}

// ─── Geocode (reverse or place_id → coords) ───────────────────────────────────

export async function geocode(params: {
    lat?: string;
    lng?: string;
    latlng?: string;
    placeId?: string;
}): Promise<any> {
    const key = getKey();
    let url   = '';

    if (params.latlng) {
        url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${params.latlng}&key=${key}`;
    } else if (params.lat && params.lng) {
        url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${params.lat},${params.lng}&key=${key}`;
    } else if (params.placeId) {
        url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${params.placeId}&fields=geometry,formatted_address,name&key=${key}`;
    } else {
        throw new Error('Missing parameters: provide lat+lng, latlng, or place_id');
    }

    const res  = await fetch(url);
    const data: any = await res.json();
    return data;
}

// ─── Nearby places by city ────────────────────────────────────────────────────

export async function getNearbyPlacesByCity(city: string): Promise<{ lat: number; lng: number; places: any[] }> {
    const key = getKey();

    const geoRes  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${key}`);
    const geoData: any = await geoRes.json();
    const location = geoData?.results?.[0]?.geometry?.location;
    if (!location) throw new Error(`Could not find location for: ${city}`);

    const { lat, lng } = location;
    const types = ['restaurant', 'tourist_attraction', 'park', 'cafe'];
    const results = await Promise.all(
        types.map(type =>
            fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=1500&type=${type}&key=${key}`)
                .then(r => r.json() as any)
                .then(d =>
                    (d.results || []).slice(0, 3).map((p: any) => ({
                        name:     p.name,
                        category: type,
                        rating:   p.rating || null,
                        vicinity: p.vicinity || '',
                    }))
                )
        )
    );

    return { lat, lng, places: results.flat() };
}

// ─── Google Place type map (for discover endpoint) ────────────────────────────

const GOOGLE_TYPE_MAP: Record<string, string[]> = {
    all:        ['tourist_attraction', 'restaurant', 'park', 'museum'],
    restaurant: ['restaurant', 'cafe', 'bakery', 'bar'],
    attraction: ['tourist_attraction', 'museum', 'art_gallery', 'amusement_park', 'zoo', 'aquarium'],
    grocery:    ['supermarket', 'grocery_or_supermarket', 'convenience_store'],
    medical:    ['hospital', 'pharmacy', 'doctor', 'dentist'],
    transit:    ['bus_station', 'train_station', 'subway_station', 'transit_station'],
};

export async function discoverNearbyPlaces(params: {
    lat: string;
    lng: string;
    category?: string;
    radius?: string;
}): Promise<{ features: any[] }> {
    const key      = getKey();
    const { lat, lng } = params;
    const category = params.category || 'all';
    const radius   = params.radius   || '3000';
    const types    = GOOGLE_TYPE_MAP[category] || GOOGLE_TYPE_MAP['all'];

    const promises = types.map(async type => {
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${key}&language=en`;
        const res  = await fetch(url);
        const data: any = await res.json();
        if (data.status !== 'OK') {
            console.warn(`[places/discover] Google status=${data.status} for type=${type}`);
            return [];
        }
        return (data.results || []).map((place: any) => ({
            type: 'Feature',
            geometry: {
                type:        'Point',
                coordinates: [place.geometry.location.lng, place.geometry.location.lat],
            },
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
    allFeatures.forEach((f: any) => {
        const id = f.properties.place_id;
        if (!unique.has(id)) unique.set(id, f);
    });

    const features = Array.from(unique.values())
        .filter(f => (f.properties.rating || 0) >= 3.5)
        .sort((a, b) => {
            const diff = (b.properties.rating || 0) - (a.properties.rating || 0);
            if (diff !== 0) return diff;
            return (b.properties.userRatingsTotal || 0) - (a.properties.userRatingsTotal || 0);
        })
        .slice(0, 25);

    return { features };
}
