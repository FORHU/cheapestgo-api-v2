import type {
  RoomGroupEntry, AmenityGroup, MetapolicyStruct, MetapolicyEntry,
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
