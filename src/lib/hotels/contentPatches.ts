import { getTgxConfig, tgxGraphQL } from '@/lib/hotels/travelgatex';

/**
 * Images and names for hotels the catalog has none for.
 *
 * A search answers from `hotel_content`, and a row there can be thin — a hotel OTV has only
 * just started selling, or one seeded by an earlier search before its content was fetched. The
 * card then renders with no picture at all, which reads as a broken listing rather than a
 * missing photo.
 *
 * v1 solves this by streaming the content in *after* the hotels, in two phases, so nothing
 * waits on it; this is the same fetch for api-v2. It is deliberately not part of the search:
 * a content call that is slow or down must cost a search its pictures, never its results.
 */
export interface HotelContentPatch {
    images?: string[];
    name?:   string;
    lat?:    number;
    lng?:    number;
}

/** TGX types its media loosely, so anything that is not obviously moving counts as a photo. */
const VIDEO_TYPES = new Set(['video', 'VIDEO', 'panoramic', 'PANORAMIC', 'virtual_tour']);

/**
 * A name that is really an identifier — "hotel-oscar-daegu", "PH12345".
 *
 * Patching one of these over a real name would replace something a person wrote with something
 * a system generated, so a slug is treated as no name at all.
 */
function isSlugName(name: string): boolean {
    return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(name.trim()) || /^[A-Z]{2}\d+$/.test(name.trim());
}

export async function fetchHotelContentPatches(
    hotelIds: string[],
    timeoutMs = 30_000,
): Promise<Map<string, HotelContentPatch>> {
    if (!hotelIds.length) return new Map();

    try {
        const cfg = getTgxConfig();
        const result = await tgxGraphQL(
            `query HotelContent($criteria: HotelXHotelListInput!) {
               hotelX {
                 hotels(criteria: $criteria) {
                   edges {
                     node {
                       hotelData {
                         code hotelName
                         medias { url type }
                         location { coordinates { latitude longitude } }
                       }
                     }
                   }
                 }
               }
             }`,
            {
                criteria: {
                    access:     cfg.accessCode,
                    hotelCodes: hotelIds.slice(0, 500),
                    maxSize:    Math.min(500, hotelIds.length),
                },
            },
            timeoutMs,
        );

        const edges: any[] = result?.data?.hotelX?.hotels?.edges ?? [];
        const patches = new Map<string, HotelContentPatch>();

        for (const edge of edges) {
            const data = edge?.node?.hotelData;
            if (!data?.code) continue;

            const patch: HotelContentPatch = {};

            const images: string[] = (data.medias ?? [])
                .filter((m: any) => m.url && !VIDEO_TYPES.has(m.type))
                .map((m: any) => m.url as string)
                .slice(0, 5);
            if (images.length) patch.images = images;

            if (data.hotelName && !isSlugName(data.hotelName)) patch.name = data.hotelName;

            const lat = Number(data.location?.coordinates?.latitude ?? 0);
            const lng = Number(data.location?.coordinates?.longitude ?? 0);
            if (lat && lng) { patch.lat = lat; patch.lng = lng; }

            if (patch.images || patch.name || patch.lat) patches.set(data.code, patch);
        }

        if (patches.size > 0) {
            console.log(`[content-api] asked ${hotelIds.length}, patched ${patches.size}`);
        }
        return patches;
    } catch (err: any) {
        // Pictures are worth less than results: a failure here leaves the cards as they are.
        console.warn('[content-api] patch fetch failed:', String(err?.message).slice(0, 120));
        return new Map();
    }
}
