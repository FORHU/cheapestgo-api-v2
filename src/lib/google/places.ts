/**
 * Google Places + Geocoding client.
 * Wraps the REST APIs used by the monolith's autocomplete, place-details,
 * places/discover, google/geocode, and google/places routes.
 */

import { config } from '@/config';
import { prisma } from '@/lib/prisma';
import { CITY_ALIASES, resolveHotelDbCities } from '@/lib/cityAliases';

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
