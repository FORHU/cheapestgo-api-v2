import type { EtgContent, MetapolicyStruct, RoomGroupEntry } from './etgContent.types';
import { matchEtgRoomGroup } from './roomMatch';
import { classifyRoomAmenity } from './roomAmenities';
import {
  type SectionId, type DetailItem, type DetailSection, type RoomContent,
  SECTION_ORDER, SECTION_TITLES, ROOM_SCOPED,
} from './roomContent.types';

export * from './roomContent.types';

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Bed line: prefer ETG bedding_type, else a bed phrase or TGX noise string from the name. */
function buildBedLine(roomName: string, match: RoomGroupEntry | null): string | undefined {
  if (match?.beddingType) return cap(match.beddingType);
  const paren = /\(([^)]*bed[^)]*)\)/i.exec(roomName);
  if (paren) return cap(paren[1].trim());
  const phrase = /\b(\d+\s+)?(king|queen|double|twin|single|sofa)\s*beds?\b/i.exec(roomName);
  if (phrase) return cap(phrase[0].trim());
  return undefined;
}

/**
 * A key fact only when internet has a *catch* — the `internet-comms` section
 * already lists free Wi-Fi, so `included` adds nothing here. Driven off
 * `inclusion`, never `price`: ETG sends `price: 0` as a default even on
 * `not_available`, so a price test would stamp "Free Wi-Fi" onto hotels with none.
 */
function internetFact(mp: MetapolicyStruct | null): DetailItem | null {
  const e = mp?.internet?.[0];
  if (!e) return null;
  if (e.inclusion === 'included') return null;
  if (e.inclusion === 'not_available') return { label: 'No internet in the room', icon: 'wifi' };
  if (e.inclusion === 'paid') {
    const price = [e.currency, e.price].filter(Boolean).join(' ');
    const unit  = e.price_unit ? ` ${e.price_unit.replace(/_/g, ' ')}` : '';
    return { label: price ? `Paid Wi-Fi (${price}${unit})` : 'Paid Wi-Fi', icon: 'wifi' };
  }
  return { label: 'Internet: contact hotel', icon: 'wifi' };
}

function buildKeyFacts(match: RoomGroupEntry | null, mp: MetapolicyStruct | null): DetailItem[] {
  const facts: DetailItem[] = [];
  const slugs = new Set(match?.roomAmenities ?? []);
  if (slugs.has('window') || slugs.has('has-window')) facts.push({ label: 'Has window(s)', icon: 'window' });
  if (slugs.has('non-smoking')) facts.push({ label: 'Non-smoking', icon: 'smoking' });
  else if (slugs.has('smoking')) facts.push({ label: 'Smoking allowed', icon: 'smoking' });
  const net = internetFact(mp);
  if (net) facts.push(net);
  if (slugs.has('air-conditioning')) facts.push({ label: 'Air conditioning', icon: 'ac' });
  if (match?.bathroomType === 'private' || slugs.has('private-bathroom')) {
    facts.push({ label: 'Private bathroom', icon: 'bath' });
  } else if (match?.bathroomType === 'shared' || slugs.has('shared-bathroom')) {
    facts.push({ label: 'Shared bathroom', icon: 'bath' });
  }
  return facts;
}

/**
 * "Extra beds and cribs are unavailable for this room type" — but ONLY when the
 * policy explicitly carries cot/extra_bed entries that are all `not_available`.
 * Absent metapolicy, or a policy that simply doesn't mention them, says nothing
 * (a missing policy is not evidence of unavailability). When one IS available,
 * this stays silent too — Task 6's `beds-extra` section renders the priced row.
 */
export function buildBedsExtraSummary(mp: MetapolicyStruct | null): string | undefined {
  if (!mp) return undefined;
  const cot = mp.cot ?? [];
  const extra = mp.extra_bed ?? [];
  if (!cot.length && !extra.length) return undefined;
  const available = (arr: typeof cot) => arr.some((e) => e.inclusion && e.inclusion !== 'not_available');
  return available(cot) || available(extra)
    ? undefined
    : 'Extra beds and cribs are unavailable for this room type';
}

export function buildRoomContent(roomName: string, etg: EtgContent): RoomContent {
  const match = matchEtgRoomGroup(roomName, etg.roomGroups);

  const bySection = new Map<SectionId, DetailItem[]>();
  for (const slug of match?.roomAmenities ?? []) {
    const { label, section, icon } = classifyRoomAmenity(slug);
    const list = bySection.get(section) ?? [];
    if (!list.some((i) => i.label === label)) list.push({ label, icon });
    bySection.set(section, list);
  }

  const sections: DetailSection[] = SECTION_ORDER.flatMap((id) => {
    const items = bySection.get(id);
    return ROOM_SCOPED.has(id) && items?.length
      ? [{ id, title: SECTION_TITLES[id], scope: 'room' as const, items }]
      : [];
  });

  return {
    gallery: match?.images ?? [],
    matchedRoomName: match?.name,
    keyFacts: buildKeyFacts(match, etg.metapolicy),
    bedLine: buildBedLine(roomName, match),
    bedsExtraSummary: buildBedsExtraSummary(etg.metapolicy),
    sections,
  };
}
