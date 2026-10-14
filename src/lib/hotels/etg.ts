/**
 * ETG (WorldOTA / RateHawk) B2B content client.
 *
 * ETG and OTV share the same underlying RateHawk data, but ETG reliably carries
 * richer content — a description and a filter vocabulary that OTV's search
 * response does not include.
 *
 * Ported from v1's `src/lib/server/stays/travelgatex/search.ts`. api-v2 already
 * called this API in two places, for names and for `amenity_groups`, but took
 * neither the description nor `serp_filters`, and never wrote any of it back —
 * so the same hotel was re-fetched on every request that touched it.
 */

export interface EtgHotelContent {
    name?:        string;
    description?: string;
    amenities?:   string[];
}

/**
 * ETG `serp_filters` are the flags its own search UI facets on. They are a
 * smaller, cleaner vocabulary than `amenity_groups` and are present on far more
 * hotels, which is why v1 reads them.
 */
export const ETG_FILTER_TO_LABEL: Record<string, string> = {
    has_internet:             'Free WiFi',
    has_parking:              'Parking',
    has_pool:                 'Swimming Pool',
    has_gym:                  'Gym',
    has_meal:                 'Restaurant',
    has_breakfast:            'Breakfast Included',
    has_pets:                 'Pets Allowed',
    has_airport_transfer:     'Airport Shuttle',
    has_laundry:              'Laundry Service',
    has_spa:                  'Spa',
    has_bar:                  'Bar',
    has_casino:               'Casino',
    has_beach:                'Beach Access',
    has_tennis:               'Tennis Court',
    has_air_conditioner:      'Air Conditioning',
    has_conference_hall:      'Conference Room',
    has_ski:                  'Ski-in/Ski-out',
    has_jacuzzi:              'Jacuzzi',
    has_disability_friendly:  'Accessible',
    has_children_facilities:  'Kids Facilities',
    has_kitchen:              'Kitchen',
    has_safe:                 'Safe',
    has_sauna:                'Sauna',
};

/**
 * Pull the useful fields out of one ETG `hotel/info` hotel object.
 *
 * Shared by both lookup paths. ETG is addressed either by slug id (batched) or by
 * numeric `hid` (one at a time), but both return the same hotel shape — and the
 * hid path was reading only `amenity_groups` from it, discarding the description
 * that arrives in the very same response.
 *
 * Absent fields are left absent rather than written as empty. An entry claiming
 * an empty description would overwrite a good one on upsert.
 */
export function parseEtgHotel(h: any): EtgHotelContent {
    const entry: EtgHotelContent = {};
    if (!h) return entry;

    const name = (h.name ?? h.title ?? '') as string;
    if (name) entry.name = name;

    // ETG splits a description into titled sections; the paragraphs flattened
    // together are what reads as prose on a property page.
    const descStruct: any[] = h.description_struct ?? [];
    if (descStruct.length > 0) {
        const paragraphs = descStruct
            .flatMap((s: any) => (s.paragraphs ?? []) as string[])
            .filter(Boolean);
        if (paragraphs.length > 0) entry.description = paragraphs.join('\n\n');
    }

    // `amenity_groups` is the richer list where ETG provides it; `serp_filters`
    // is its own facet vocabulary and covers hotels the groups do not.
    const grouped: string[] = (h.amenity_groups ?? [])
        .flatMap((g: any) => g.amenities ?? [])
        .filter((a: any) => typeof a === 'string' && a.length > 0);

    const fromFilters = ((h.serp_filters ?? []) as string[])
        .map(f => ETG_FILTER_TO_LABEL[f])
        .filter(Boolean);

    const amenities = grouped.length ? grouped : fromFilters;
    if (amenities.length > 0) entry.amenities = amenities;

    return entry;
}

function etgToken(): string | null {
    const keyId  = process.env.ETG_KEY_ID;
    const apiKey = process.env.ETG_API_KEY;
    if (!keyId || !apiKey) return null;
    return Buffer.from(`${keyId}:${apiKey}`).toString('base64');
}

/**
 * Name, description and amenities for a batch of ETG hotel ids, in one call each
 * rather than the separate name and amenity round-trips api-v2 was making.
 *
 * Never throws: content enrichment is an improvement on the response, not a
 * precondition for it, so a batch that fails is skipped and the rest proceed.
 */
export async function fetchEtgHotelContent(hotelIds: string[]): Promise<Map<string, EtgHotelContent>> {
    const contentMap = new Map<string, EtgHotelContent>();
    if (!hotelIds.length) return contentMap;

    const token = etgToken();
    if (!token) return contentMap;

    const BATCH = 500;
    for (let i = 0; i < hotelIds.length; i += BATCH) {
        const batch = hotelIds.slice(i, i + BATCH);
        try {
            const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
                method:  'POST',
                headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ ids: batch, language: 'en' }),
                signal:  AbortSignal.timeout(5_000),
            });
            if (!res.ok) {
                console.warn(`[etg-content] hotel/info ${res.status}`);
                continue;
            }

            const json = await res.json() as any;
            const hotels: any[] = json?.data?.hotels ?? json?.hotels ?? [];

            for (const h of hotels) {
                const id = String(h.id ?? h.hotel_id ?? '');
                if (!id) continue;
                const entry = parseEtgHotel(h);
                if (Object.keys(entry).length > 0) contentMap.set(id, entry);
            }
        } catch (e: any) {
            if (e?.name !== 'TimeoutError' && e?.name !== 'AbortError') {
                console.warn('[etg-content] batch failed:', e?.message);
            }
        }
    }

    console.log(`[etg-content] enriched ${contentMap.size}/${hotelIds.length} hotels`);
    return contentMap;
}
