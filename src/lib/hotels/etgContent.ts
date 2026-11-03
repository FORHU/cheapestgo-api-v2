import { prisma } from '@/lib/prisma';
import type {
  RoomGroupEntry, AmenityGroup, MetapolicyStruct, MetapolicyEntry, EtgContent,
} from './etgContent.types';

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.length > 0) : [];

function resolveImageUrl(u: unknown): string | null {
  if (typeof u === 'string') return u.replace(/\{size\}/g, '1024x768');
  if (u && typeof u === 'object') {
    const s = (u as any).url ?? (u as any).src;
    return typeof s === 'string' ? s.replace(/\{size\}/g, '1024x768') : null;
  }
  return null;
}

export function parseRoomGroups(raw: unknown): RoomGroupEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((rg: any): RoomGroupEntry => {
      const entry: RoomGroupEntry = {
        name: typeof rg?.name === 'string' ? rg.name : '',
        images: (Array.isArray(rg?.images) ? rg.images : [])
          .map(resolveImageUrl)
          .filter((s: string | null): s is string => !!s)
          .slice(0, 10),
        roomAmenities: strings(rg?.room_amenities),
      };
      const bedding = rg?.name_struct?.bedding_type;
      if (typeof bedding === 'string' && bedding) entry.beddingType = bedding;
      const bathroom = rg?.name_struct?.bathroom;
      if (typeof bathroom === 'string' && bathroom) entry.bathroomType = bathroom;
      if (typeof rg?.room_group_id === 'number') entry.roomGroupId = rg.room_group_id;
      return entry;
    })
    .filter((rg) => rg.name);
}

export function parseAmenityGroups(raw: unknown): AmenityGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g: any): AmenityGroup => ({
      groupName: typeof g?.group_name === 'string' ? g.group_name : '',
      amenities: strings(g?.amenities),
      nonFree: strings(g?.non_free_amenities),
    }))
    .filter((g) => g.groupName);
}

const MP_KEYS: (keyof MetapolicyStruct)[] = [
  'children', 'children_meal', 'cot', 'extra_bed', 'internet',
  'parking', 'pets', 'deposit', 'no_show',
];

export function parseMetapolicy(raw: unknown): MetapolicyStruct | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: MetapolicyStruct = {};
  for (const key of MP_KEYS) {
    const v = src[key];
    if (!Array.isArray(v)) continue;
    const entries = v.filter((e): e is MetapolicyEntry => !!e && typeof e === 'object' && !Array.isArray(e));
    if (entries.length) out[key] = entries;
  }
  return Object.keys(out).length ? out : null;
}

const FRESH_MS = 30 * 24 * 3600 * 1000;

/** The subset of hotel_content ensureEtgContent reads. Blobs hold the RAW ETG
 *  `hotel/info` shape (snake_case) — `fromRow` parses them on every read. */
export interface EtgContentRow {
  hotel_id: string;
  ratehawk_hid: string | null;
  etg_content_seeded_at: Date | null;
  /**
   * Stamped by the bulk dump (`etgDump`) and the room-group repository writers, which seed
   * `room_groups` without ever touching `etg_content_seeded_at`. Reading only the latter
   * treated every dump-seeded hotel as unseeded.
   */
  room_groups_seeded_at?: Date | null;
  room_groups?: unknown;
  amenity_groups?: unknown;
  metapolicy_struct?: unknown;
  metapolicy_extra_info?: string | null;
  important_information?: string | null;
}

function etgToken(): string {
  const keyId  = process.env.ETG_KEY_ID  ?? '';
  const apiKey = process.env.ETG_API_KEY ?? '';
  return Buffer.from(`${keyId}:${apiKey}`).toString('base64');
}

/** Both halves, or there is no point dialling. See `ensureEtgContent`. */
function hasEtgCredentials(): boolean {
  return Boolean(process.env.ETG_KEY_ID && process.env.ETG_API_KEY);
}

/** Once per process: the condition is a deployment fact, not a per-hotel event. */
let warnedNoEtgCredentials = false;
function warnMissingEtgCredentialsOnce(): void {
  if (warnedNoEtgCredentials) return;
  warnedNoEtgCredentials = true;
  console.warn(
    '[etg-content] ETG_KEY_ID / ETG_API_KEY are not set — serving stored room content only. '
    + 'Nothing will refresh until they are.',
  );
}

function fromRow(row: {
  room_groups?: unknown; amenity_groups?: unknown; metapolicy_struct?: unknown;
  metapolicy_extra_info?: string | null; important_information?: string | null;
}): EtgContent {
  return {
    roomGroups: parseRoomGroups(row.room_groups),
    amenityGroups: parseAmenityGroups(row.amenity_groups),
    metapolicy: parseMetapolicy(row.metapolicy_struct),
    metapolicyExtraInfo: row.metapolicy_extra_info ?? null,
    importantInformation: row.important_information ?? null,
  };
}

/**
 * Returns parsed ETG content for a hotel, fetching hotel/info and caching it to
 * hotel_content when the stored copy is missing or older than 30 days. The RAW
 * ETG blobs are what's stored; parsing happens on read, so a parser change takes
 * effect without a re-fetch.
 *
 * **Stored content is the floor, a refetch only an upgrade.** Returning null whenever the
 * refetch could not run threw away room groups already sitting in the row, so every room on
 * the property page fell back to the hotel's exterior shot. Two ways that happened at once:
 * the dump stamps `room_groups_seeded_at` and never `etg_content_seeded_at`, so dump-seeded
 * hotels always read as unseeded; and with the content crons down nothing has refreshed since
 * 2026-08-20, putting every hotel past FRESH_MS. Stale photographs of the actual room beat a
 * fresh photograph of the lobby. Null now means only that we hold nothing at all.
 */
export async function ensureEtgContent(
  hotelId: string,
  row: EtgContentRow,
): Promise<EtgContent | null> {
  const seededAt = Math.max(
    row.etg_content_seeded_at?.getTime() ?? 0,
    row.room_groups_seeded_at?.getTime() ?? 0,
  );
  const fresh = seededAt > 0 && Date.now() - seededAt < FRESH_MS;
  const cached = Array.isArray(row.room_groups) && row.room_groups.length ? fromRow(row) : null;
  if (fresh && cached) return cached;

  if (!row.ratehawk_hid) return cached;

  // Without both halves of the key the request can only come back 401, and it did: production
  // ran without them, so every property view paid a round trip to worldota.net to be refused,
  // and wrote a line about it. Serve what is stored and say so once rather than per hotel.
  if (!hasEtgCredentials()) {
    warnMissingEtgCredentialsOnce();
    return cached;
  }

  try {
    const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
      method: 'POST',
      headers: { Authorization: `Basic ${etgToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.ratehawk_hid, language: 'en' }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(`[etg-content] hotel/info ${res.status} for ${hotelId} (hid ${row.ratehawk_hid})`);
      return cached;
    }
    const json: any = await res.json();
    const d = json?.data;
    if (!d) {
      console.warn(`[etg-content] hotel/info: no data for ${hotelId}`);
      return cached;
    }

    // An empty `room_groups` is not a correction, it is an absence — during the 2026-10-26
    // availability blackout ETG answered content calls while serving nothing. Writing that
    // over a good row would blank the room photographs permanently and stamp the blank fresh.
    const groups = Array.isArray(d.room_groups) && d.room_groups.length
      ? d.room_groups
      : (row.room_groups ?? []);

    const metapolicyExtraInfo =
      typeof d.metapolicy_extra_info === 'string' ? d.metapolicy_extra_info : null;
    const importantInformation =
      typeof d.important_information === 'string' ? d.important_information : (row.important_information ?? null);

    await prisma.hotel_content.update({
      where: { hotel_id: hotelId },
      data: {
        room_groups: groups as any,
        amenity_groups: (d.amenity_groups ?? []) as any,
        metapolicy_struct: (d.metapolicy_struct ?? null) as any,
        metapolicy_extra_info: metapolicyExtraInfo,
        etg_content_seeded_at: new Date(),
        ...(typeof d.important_information === 'string' ? { important_information: d.important_information } : {}),
        ...(typeof d.check_in_time === 'string' ? { check_in_time: d.check_in_time } : {}),
        ...(typeof d.check_out_time === 'string' ? { check_out_time: d.check_out_time } : {}),
      },
    }).catch(() => {});

    return fromRow({
      room_groups: groups,
      amenity_groups: d.amenity_groups,
      metapolicy_struct: d.metapolicy_struct,
      metapolicy_extra_info: metapolicyExtraInfo,
      important_information: importantInformation,
    });
  } catch (e: any) {
    console.warn(`[etg-content] hotel/info error for ${hotelId}:`, e?.message ?? e);
    return cached;
  }
}
