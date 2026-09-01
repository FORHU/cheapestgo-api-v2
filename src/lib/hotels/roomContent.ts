import type { EtgContent, MetapolicyStruct, MetapolicyEntry, RoomGroupEntry } from './etgContent.types';
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

/** ETG sends price as a string ("600", "0"). Coerce; non-numeric → 0. */
const priceNum = (e: MetapolicyEntry): number => {
  const n = Number(e.price);
  return Number.isFinite(n) ? n : 0;
};

/** cot/extra_bed/internet inclusion values that mean "the hotel offers this". */
const NOT_OFFERED = new Set(['not_available', 'unavailable', 'unspecified', '']);
const isOffered = (e: MetapolicyEntry): boolean => !!e.inclusion && !NOT_OFFERED.has(e.inclusion);

/** ETG free-text policy fields are sometimes HTML. Flatten headings + list items
 *  to lines, strip remaining tags, decode the common entities. */
function htmlToText(s: string): string {
  if (!/[<&]/.test(s)) return s.trim();
  return s
    .replace(/<\s*(p|div|h[1-6])[^>]*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
 * already lists free Wi-Fi, so `included` adds nothing here.
 */
function internetFact(mp: MetapolicyStruct | null): DetailItem | null {
  const e = mp?.internet?.[0];
  if (!e) return null;
  if (e.inclusion === 'included') return null;              // section already lists free Wi-Fi
  if (e.inclusion === 'not_available' || e.inclusion === 'unavailable') {
    return { label: 'No internet in the room', icon: 'wifi' };
  }
  if (priceNum(e) > 0) {
    return { label: `Paid Wi-Fi (${money(e)})`, icon: 'wifi' };
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
 * policy explicitly carries cot/extra_bed entries that are none of them offered
 * (`not_available` / `unavailable` / `unspecified` / ``). Absent metapolicy, or a
 * policy that simply doesn't mention them, says nothing (a missing policy is not
 * evidence of unavailability). When one IS offered, this stays silent too — the
 * `beds-extra` section renders the priced row.
 */
export function buildBedsExtraSummary(mp: MetapolicyStruct | null): string | undefined {
  if (!mp) return undefined;
  const cot = mp.cot ?? [];
  const extra = mp.extra_bed ?? [];
  if (!cot.length && !extra.length) return undefined;
  return cot.some(isOffered) || extra.some(isOffered)
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

/** "THB 600 per guest per night" — currency + numeric price + humanised unit. */
function money(e: MetapolicyEntry): string {
  const n = priceNum(e);
  const unit = e.price_unit ? ` ${e.price_unit.replace(/_/g, ' ')}` : '';
  return `${[e.currency, n || null].filter(Boolean).join(' ')}${unit}`.trim();
}

export function buildPolicySections(mp: MetapolicyStruct | null): DetailSection[] {
  if (!mp) return [];
  const out: DetailSection[] = [];

  const childItems: DetailItem[] = (mp.children ?? []).map((e) => {
    const range = e.age_start != null && e.age_end != null ? `${e.age_start}–${e.age_end}` : 'any age';
    if (e.inclusion === 'included')  return { label: `Children ${range} stay free`, icon: 'child' };
    if (priceNum(e) > 0)             return { label: `Children ${range}: ${money(e)}`, icon: 'child' };
    return { label: `Children ${range} welcome`, icon: 'child' };
  });
  for (const e of mp.children_meal ?? []) {
    if (e.inclusion === 'included') childItems.push({ label: "Children's meals included", icon: 'child' });
  }
  if (childItems.length) {
    out.push({ id: 'child-policy', title: SECTION_TITLES['child-policy'], scope: 'property', items: childItems });
  }

  const bedItems: DetailItem[] = [];
  const bedRow = (kind: 'Cot' | 'Extra bed', e: MetapolicyEntry): DetailItem => ({
    label: e.inclusion === 'included' ? `${kind} available free`
         : priceNum(e) > 0            ? `${kind}: ${money(e)}`
         :                              `${kind} available`,
    icon: 'bed',
  });
  for (const e of mp.cot ?? [])       if (isOffered(e)) bedItems.push(bedRow('Cot', e));
  for (const e of mp.extra_bed ?? []) if (isOffered(e)) bedItems.push(bedRow('Extra bed', e));
  if (bedItems.length) {
    out.push({ id: 'beds-extra', title: SECTION_TITLES['beds-extra'], scope: 'property', items: bedItems });
  }

  return out;
}

export function buildAdditionalInfo(
  importantInfo: string | null,
  mp: MetapolicyStruct | null,
  extraInfo: string | null,
): string {
  const parts: string[] = [];
  if (importantInfo?.trim()) parts.push(htmlToText(importantInfo));
  if (extraInfo?.trim()) parts.push(htmlToText(extraInfo));

  const pet = mp?.pets?.[0];
  if (pet) {
    if (pet.inclusion === 'not_allowed') parts.push('Pets are not allowed.');
    else if (priceNum(pet) > 0) parts.push(`Pets are allowed for ${money(pet)}.`);
    else if (pet.inclusion === 'included') parts.push('Pets are allowed free of charge.');
  }
  const dep = mp?.deposit?.[0];
  if (dep && priceNum(dep) > 0) parts.push(`A deposit of ${[dep.currency, priceNum(dep)].filter(Boolean).join(' ')} may be required.`);
  const park = mp?.parking?.[0];
  if (park) {
    if (park.inclusion === 'included') parts.push('Free parking is available.');
    else if (priceNum(park) > 0) parts.push(`Parking is available for ${money(park)}.`);
  }
  return parts.join('\n\n');
}
