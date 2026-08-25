/**
 * ETG room-group content — the source of room-level photos.
 *
 * TGX returns bookable offers but almost no room-level static content, so the
 * photos on a room card come from ETG's `room_groups`, matched to each TGX room
 * by name (see `roomMatch.ts`).
 *
 * Ported from v1's `src/lib/server/stays/etg/roomGroups.ts`.
 */

import { etgRoomAmenityToLabel } from './amenityCodes';

const ETG_BASE = 'https://api.worldota.net/api/b2b/v3';

export interface RoomGroupEntry {
    name:         string;
    images:       string[];
    amenities:    string[];
    /** Stable ETG id for this group within the hotel. */
    roomGroupId?: number;
    /** ETG `name_struct.bedding_type`, e.g. "twin beds" — the strongest matching signal. */
    beddingType?: string;
    /** Structured attribute codes from `rg_ext`, kept for future structured matching. */
    rgExt?: { bedding: number; capacity: number; quality: number; view: number; balcony: number };
}

function etgToken(): string | null {
    const keyId  = process.env.RATEHAWK_KEY_ID  ?? process.env.ETG_KEY_ID  ?? '';
    const apiKey = process.env.RATEHAWK_API_KEY ?? process.env.ETG_API_KEY ?? '';
    if (!keyId || !apiKey) return null;
    return Buffer.from(`${keyId}:${apiKey}`).toString('base64');
}

/** ETG image URLs carry a `{size}` placeholder that has to be filled before use. */
function resolveImageUrl(url: unknown): string | null {
    if (typeof url !== 'string') return null;
    return url.replace(/\{size\}/g, '1024x768');
}

export function parseRoomGroups(rawGroups: any[]): RoomGroupEntry[] {
    return (rawGroups ?? [])
        .map((rg: any) => {
            const entry: RoomGroupEntry = {
                name: rg.name ?? '',
                // Ten is enough for a gallery and keeps the stored JSON small; the
                // column is read on every property view.
                images: (rg.images ?? [])
                    .map((img: any) => resolveImageUrl(typeof img === 'string' ? img : (img?.url ?? img?.src)))
                    .filter((u: string | null): u is string => u !== null)
                    .slice(0, 10),
                amenities: Array.isArray(rg.room_amenities)
                    ? rg.room_amenities.map((s: string) => etgRoomAmenityToLabel(s)).filter(Boolean)
                    : [],
            };
            if (rg.room_group_id) entry.roomGroupId = rg.room_group_id;

            const bedding = rg.name_struct?.bedding_type;
            if (bedding) entry.beddingType = bedding;

            if (rg.rg_ext) entry.rgExt = {
                bedding:  rg.rg_ext.bedding  ?? 0,
                capacity: rg.rg_ext.capacity ?? 0,
                quality:  rg.rg_ext.quality  ?? 0,
                view:     rg.rg_ext.view     ?? 0,
                balcony:  rg.rg_ext.balcony  ?? 0,
            };
            return entry;
        })
        // A group without a name cannot be matched to anything.
        .filter((rg: RoomGroupEntry) => rg.name);
}

/**
 * ETG's hotel record for one RateHawk slug id. Throws on a bad response so the
 * caller can decide whether that is worth reporting.
 */
export async function fetchEtgHotelInfo(hid: string): Promise<any | null> {
    const token = etgToken();
    if (!token) return null;

    const res = await fetch(`${ETG_BASE}/hotel/info/`, {
        method:  'POST',
        headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: hid, language: 'en' }),
        signal:  AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`ETG HTTP ${res.status}`);
    const json = await res.json() as any;
    return json?.data ?? null;
}
