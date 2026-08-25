import { HotelsRepository } from '@/repositories/hotels.repository';
import { parseRoomGroups, fetchEtgHotelInfo, type RoomGroupEntry } from '@/lib/hotels/roomGroups';
import { matchEtgRoomGroup, type EtgGroup } from '@/lib/hotels/roomMatch';

/**
 * Room-level photos and amenities for the rooms of one hotel.
 *
 * TGX returns bookable offers with almost no static room content, so the photos
 * on a room card come from ETG, matched to each TGX room by name. The lookup
 * order is: stored catalog, then a live ETG seed, and the result is stored either
 * way — including when it is empty, which records that this hotel has no
 * room-level content rather than re-asking on every visit.
 *
 * Ported from `fetchTgxRoomCatalog` in v1's travelgatex/search.ts.
 */

export interface RoomCatalogEntry {
    photos:    string[];
    amenities: string[];
    roomSize?: string;
}

export class RoomCatalogService {
    private repo = new HotelsRepository();

    /**
     * @param hotelId   catalog id
     * @param roomCodes TGX room codes seen in the search result
     * @param descMap   room code to its TGX description — the only thing linking
     *                  a bookable room to an ETG group
     */
    async fetchRoomCatalog(
        hotelId: string,
        roomCodes: string[],
        descMap: Map<string, string>,
    ): Promise<Map<string, RoomCatalogEntry>> {
        const result = new Map<string, RoomCatalogEntry>();
        if (!hotelId || !roomCodes.length) return result;

        let stored: unknown;
        let ratehawkHid: string | null = null;
        let seededAt: Date | null = null;
        try {
            const row = await this.repo.findRoomGroups(hotelId);
            stored      = row?.roomGroups;
            ratehawkHid = row?.ratehawkHid ?? null;
            seededAt    = row?.seededAt ?? null;
        } catch (e: any) {
            console.warn('[room-catalog] lookup failed:', e?.message?.slice(0, 80));
        }

        const fromStored = this.applyStored(stored, seededAt, descMap, result);
        if (fromStored) {
            console.log(`[room-catalog] hotel ${hotelId}: ${result.size}/${roomCodes.length} rooms from cache`);
            return result;
        }

        // Nothing usable stored — seed from ETG and use it on this same request.
        if (!ratehawkHid) return result;

        try {
            const data   = await fetchEtgHotelInfo(ratehawkHid);
            const groups = parseRoomGroups(data?.room_groups ?? []);

            // Stored even when empty: that is the fact worth remembering.
            await this.repo.saveRoomGroups(hotelId, groups).catch(() => {});

            this.matchAll(groups, descMap, result);
            const withPhotos = groups.filter(g => g.images.length > 0).length;
            console.log(
                `[room-catalog] hotel ${hotelId}: seeded ${groups.length} ETG groups ` +
                `(${withPhotos} with photos), matched ${result.size}/${roomCodes.length} rooms`,
            );
        } catch (e: any) {
            console.warn(`[room-catalog] ETG seed failed for ${hotelId}:`, e?.message?.slice(0, 80));
        }

        return result;
    }

    /**
     * Use whatever is already stored. Returns false when the stored value cannot
     * furnish anything, so the caller knows to seed.
     */
    private applyStored(
        stored: unknown,
        seededAt: Date | null,
        descMap: Map<string, string>,
        out: Map<string, RoomCatalogEntry>,
    ): boolean {
        if (!stored) return false;

        // An empty value means "we asked and the supplier had nothing" only when
        // it was actually written. `room_groups` defaults to `[]`, so without the
        // timestamp an untouched row looks identical to a seeded-empty one — which
        // is how every hotel with the default value silently never got seeded.
        const isEmptySeeded = (empty: boolean) => empty && seededAt !== null;

        // ETG-seeded shape: an array of named groups, matched by description.
        if (Array.isArray(stored)) {
            if (!stored.length) return isEmptySeeded(true);
            this.matchAll(stored as EtgGroup[], descMap, out);
            return true;
        }

        // Older TGX shape: a map keyed by room code, already resolved.
        if (typeof stored === 'object') {
            const byCode = stored as Record<string, { photos?: string[]; amenities?: string[]; roomSize?: string }>;
            const keys = Object.keys(byCode);
            if (!keys.length) return isEmptySeeded(true);
            for (const code of descMap.keys()) {
                const entry = byCode[code];
                if (entry?.photos?.length || entry?.amenities?.length) {
                    out.set(code, {
                        photos:    entry.photos ?? [],
                        amenities: entry.amenities ?? [],
                        ...(entry.roomSize ? { roomSize: entry.roomSize } : {}),
                    });
                }
            }
            return true;
        }

        return false;
    }

    private matchAll(
        groups: EtgGroup[] | RoomGroupEntry[],
        descMap: Map<string, string>,
        out: Map<string, RoomCatalogEntry>,
    ): void {
        for (const [code, description] of descMap) {
            const match = matchEtgRoomGroup(description, groups as EtgGroup[]);
            if (match.images.length || match.amenities.length) {
                out.set(code, { photos: match.images, amenities: match.amenities });
            }
        }
    }
}
