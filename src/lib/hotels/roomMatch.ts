/**
 * Match a TGX room description to a seeded ETG room group.
 *
 * TGX names a room one way ("Deluxe Double room with river view") and ETG files
 * its photos under another ("Deluxe Double room with river view (full double
 * bed)"). Nothing links them but the text, so this is a cascade of increasingly
 * loose comparisons, ordered so that a confident match always beats a plausible
 * one.
 *
 * Ported from v1's `src/lib/server/stays/travelgatex/search.ts`.
 */

/** What matching reads from a group. Both ETG group shapes in this codebase carry it. */
interface MatchableGroup {
    name:         string;
    images?:      string[];
    beddingType?: string;
}

/** The room catalog's group shape (`room_groups` as seeded by the nightly job). */
export interface EtgGroup {
    name:         string;
    images:       string[];
    amenities?:   string[];
    beddingType?: string;
    roomGroupId?: number;
}

/** A match as the room catalog stores it — empty fields when nothing matched. */
export interface EtgRoomGroupMatch {
    images:      string[];
    amenities:   string[];
    matchedName: string;
}

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

const imgCount = (g: MatchableGroup) => g.images?.length ?? 0;

/**
 * Reorder each room's photos so the ones unique to it come first.
 *
 * Suppliers routinely give neighbouring rooms overlapping photo sets. Hotel Naru
 * Seoul is typical: "Deluxe Double room with river view" and "Premier Double room
 * with river view" match their own ETG groups correctly, and those groups still
 * share 7 of their 10 photos. A card shows the first few, so both rooms lead with
 * the same shots and read as identical — the guest concludes the site is broken
 * when every step upstream did its job.
 *
 * The shared photos are genuine pictures of both rooms, so they are kept; they
 * just should not lead. Ordering is stable within each part, so a room whose
 * photos are entirely shared is left exactly as it was.
 *
 * Only meaningful across a whole page, which is why this takes every room rather
 * than being a property of one.
 */
export function orderRoomPhotosByDistinctiveness<T extends { roomPhotos?: string[] }>(rooms: T[]): T[] {
    if (rooms.length < 2) return rooms;

    const usage = new Map<string, number>();
    for (const room of rooms) {
        for (const url of new Set(room.roomPhotos ?? [])) {
            usage.set(url, (usage.get(url) ?? 0) + 1);
        }
    }

    return rooms.map(room => {
        const photos = room.roomPhotos;
        if (!photos?.length) return room;

        const unique = photos.filter(url => (usage.get(url) ?? 0) === 1);
        // Nothing to promote, or nothing but unique photos: leave supplier order alone.
        if (!unique.length || unique.length === photos.length) return room;

        const shared = photos.filter(url => (usage.get(url) ?? 0) > 1);
        return { ...room, roomPhotos: [...unique, ...shared] };
    });
}

/**
 * The ETG room group a TGX room description belongs to, or null. No tier-word
 * fallback: on a page someone books from, a wrong photo is worse than no photo.
 */
export function matchEtgRoomGroup<G extends MatchableGroup>(
    description: string,
    groups: G[],
): G | null {
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

    const richest = (cs: G[]) => cs.reduce((a, b) => (imgCount(b) > imgCount(a) ? b : a));
    // Photo-less candidates only — deterministic pick, `richest` would be arbitrary.
    const firstOf = (cs: G[]) => cs.reduce((a, b) => (imgCount(b) >= imgCount(a) ? b : a));

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

/**
 * `matchEtgRoomGroup` in the shape the room catalog stores: the matched group's
 * photos, amenities and name, or empty fields when nothing matched.
 */
export function matchEtgRoomGroupForCatalog(description: string, groups: EtgGroup[]): EtgRoomGroupMatch {
    const g = matchEtgRoomGroup(description, groups);
    return g
        ? { images: g.images ?? [], amenities: g.amenities ?? [], matchedName: g.name }
        : { images: [], amenities: [], matchedName: '' };
}
