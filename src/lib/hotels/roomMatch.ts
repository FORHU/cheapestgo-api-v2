import type { RoomGroupEntry } from './etgContent.types';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Room-identity words specific enough to match on alone (Pass 3) — unlike tier words. */
const BED_TYPES = new Set([
  'twin', 'single', 'triple', 'quadruple', 'quintuple', 'sextuple',
  'suite', 'villa', 'loft', 'cottage', 'bungalow', 'dormitory',
]);
/** Grade labels shared by many different room types — never matched on alone. */
const TIER_WORDS = new Set([
  'deluxe', 'standard', 'superior', 'executive', 'premium', 'premier', 'luxury',
]);
/** Words that ETG's `name_struct.bedding_type` also uses, so Pass 0 can join on them. */
const BEDDING_WORDS = new Set(['double', 'twin', 'king', 'queen', 'single']);

const imgCount = (g: RoomGroupEntry) => g.images?.length ?? 0;

/**
 * Match a TGX room description to one seeded ETG room-group by name. There is no
 * id linking the two, so this is a cascade of increasingly loose comparisons,
 * ordered so a confident match always beats a plausible one. No tier-word
 * fallback: on a page someone books from, a wrong photo is worse than no photo.
 */
export function matchEtgRoomGroup(
  description: string,
  groups: RoomGroupEntry[],
): RoomGroupEntry | null {
  if (!groups?.length || !description?.trim()) return null;

  // Dedupe by normalised name, keeping the FIRST occurrence. ETG often files a
  // hotel-specific group first and generic catalog entries (stock photos) after
  // it under the same name — first-wins keeps the specific one.
  const seen = new Set<string>();
  const deduped = groups.filter((g) => {
    const k = norm(g.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const withPhotos = deduped.filter((g) => imgCount(g) > 0);

  // Two readings of the description: `full` keeps a parenthetical's words
  // ("(twin beds)" → "twin beds"); `stripped` discards it entirely, for TGX
  // noise like "(bed type is subject to availability)".
  const descFull     = norm(description.replace(/[()]/g, ' '));
  const descStripped = norm(description.replace(/\([^)]*\)/g, ''));

  const richest = (cs: RoomGroupEntry[]) => cs.reduce((a, b) => (imgCount(b) > imgCount(a) ? b : a));
  // Photo-less candidates only — deterministic pick, `richest` would be arbitrary.
  const firstOf = (cs: RoomGroupEntry[]) => cs.reduce((a, b) => (imgCount(b) >= imgCount(a) ? b : a));

  const exactMatches  = (d: string) => deduped.filter((g) => norm(g.name) === d);
  const prefixMatches = (d: string) => deduped.filter((g) => {
    const gn = norm(g.name);
    return gn !== d && (d.startsWith(gn) || gn.startsWith(d));
  });

  const words       = descFull.split(' ');
  const bedWord     = words.find((w) => BED_TYPES.has(w));
  const tierWord    = words.find((w) => TIER_WORDS.has(w));
  const beddingWord = words.find((w) => BEDDING_WORDS.has(w));

  // Pass 0 — structured bedding-type. Prevents tier-word ambiguity: "Standard
  // Double" and "Standard Twin" can't cross-match because their beddingType
  // differs. Only fires where ETG populated `name_struct.bedding_type`.
  if (beddingWord) {
    const byBedding = withPhotos.filter(
      (g) => g.beddingType && norm(g.beddingType).includes(beddingWord),
    );
    if (byBedding.length === 1) return byBedding[0];
    if (byBedding.length > 1) {
      if (tierWord) {
        const byBoth = byBedding.filter((g) => norm(g.name).includes(tierWord));
        if (byBoth.length) return richest(byBoth);
      }
      return richest(byBedding);
    }
  }

  // Pass 1 — full description: exact (photos first), then prefix (photos first).
  const fullExact      = exactMatches(descFull);
  const fullExactPhoto = fullExact.filter((g) => imgCount(g) > 0);
  if (fullExactPhoto.length) return richest(fullExactPhoto);
  if (fullExact.length)      return firstOf(fullExact);
  const fullPrefix      = prefixMatches(descFull);
  const fullPrefixPhoto = fullPrefix.filter((g) => imgCount(g) > 0);
  if (fullPrefixPhoto.length) return richest(fullPrefixPhoto);
  if (fullPrefix.length)      return firstOf(fullPrefix);

  // Pass 2 — parenthetical-stripped description, same sub-cascade. Only when it
  // actually differs (a mid-string parenthetical Pass 1's prefix test can't use).
  if (descStripped !== descFull) {
    const strExact      = exactMatches(descStripped);
    const strExactPhoto = strExact.filter((g) => imgCount(g) > 0);
    if (strExactPhoto.length) return richest(strExactPhoto);
    if (strExact.length)      return firstOf(strExact);
    const strPrefix      = prefixMatches(descStripped);
    const strPrefixPhoto = strPrefix.filter((g) => imgCount(g) > 0);
    if (strPrefixPhoto.length) return richest(strPrefixPhoto);
    if (strPrefix.length)      return firstOf(strPrefix);
  }

  // Pass 3 — bed-type keyword ("twin", "suite" …), never tier words.
  if (bedWord) {
    const byBedPhoto = withPhotos.filter((g) => norm(g.name).includes(bedWord));
    if (tierWord && byBedPhoto.length > 1) {
      const byBoth = byBedPhoto.filter((g) => norm(g.name).includes(tierWord));
      if (byBoth.length) return richest(byBoth);
    }
    if (byBedPhoto.length) return richest(byBedPhoto);
    const byBedAny = deduped.filter((g) => norm(g.name).includes(bedWord));
    if (byBedAny.length) return firstOf(byBedAny);
  }

  // No tier-word fallback — an unmatched room falls back to the hotel gallery,
  // which is honest. Wrong photo > no photo is not the right trade-off here.
  return null;
}
