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

export interface EtgGroup {
    name:         string;
    images:       string[];
    amenities?:   string[];
    beddingType?: string;
    roomGroupId?: number;
}

export interface EtgRoomGroupMatch {
    images:      string[];
    amenities:   string[];
    matchedName: string;
}

/** Room-identity words: they say what kind of room it is. */
const BED_TYPES = new Set([
    'twin', 'single', 'triple', 'quadruple', 'quintuple', 'sextuple',
    'suite', 'villa', 'loft', 'cottage', 'bungalow', 'dormitory',
]);

/** Grade words. Shared across many different rooms, so never a match on their own. */
const TIER_WORDS = new Set([
    'deluxe', 'standard', 'superior', 'executive', 'premium', 'premier', 'luxury',
]);

const BEDDING_WORDS = new Set(['double', 'twin', 'king', 'queen', 'single']);

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

export function matchEtgRoomGroup(description: string, groups: EtgGroup[]): EtgRoomGroupMatch {
    const empty: EtgRoomGroupMatch = { images: [], amenities: [], matchedName: '' };
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    // ETG often repeats a group name: the first is hotel-specific, later ones are
    // generic catalog entries carrying stock photos. First-wins keeps specificity.
    const seen = new Set<string>();
    const deduped = groups.filter(g => {
        const k = norm(g.name);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    const withPhotos = deduped.filter(g => (g.images?.length ?? 0) > 0);

    // Two readings of the description: parentheses flattened to words, and
    // parentheses removed. TGX puts both real detail ("twin beds") and noise
    // ("bed type is subject to availability") inside them.
    const descFull     = norm(description.replace(/[()]/g, ' '));
    const descStripped = norm(description.replace(/\([^)]*\)/g, ''));

    const richest = (c: EtgGroup[]) => c.reduce((a, b) => ((b.images?.length ?? 0) > (a.images?.length ?? 0) ? b : a));
    const toMatch = (c: EtgGroup[]) => c.reduce((a, b) => ((b.images?.length ?? 0) >= (a.images?.length ?? 0) ? b : a));
    const pick = (g: EtgGroup): EtgRoomGroupMatch =>
        ({ images: g.images ?? [], amenities: g.amenities ?? [], matchedName: g.name });

    const exactMatches  = (desc: string) => deduped.filter(g => norm(g.name) === desc);
    const prefixMatches = (desc: string) => deduped.filter(g => {
        const gn = norm(g.name);
        return gn !== desc && (desc.startsWith(gn) || gn.startsWith(desc));
    });

    const words    = descFull.split(' ');
    const bedWord  = words.find(w => BED_TYPES.has(w));
    const tierWord = words.find(w => TIER_WORDS.has(w));

    // Pass 0 — structured bedding match, using ETG's own `name_struct.bedding_type`.
    // "Standard Double" and "Standard Twin" can never cross-match here even when
    // their names score identically, because they differ in bedding. Only fires
    // where ETG populated the field, which is roughly a third of hotels.
    const beddingWord = words.find(w => BEDDING_WORDS.has(w));
    if (beddingWord) {
        const byBedding = withPhotos.filter(g => g.beddingType && norm(g.beddingType).includes(beddingWord));
        if (byBedding.length === 1) return pick(byBedding[0]);
        if (byBedding.length > 1) {
            if (tierWord) {
                const byBoth = byBedding.filter(g => norm(g.name).includes(tierWord));
                if (byBoth.length) return pick(richest(byBoth));
            }
            return pick(richest(byBedding));
        }
    }

    // Pass 1 — the full description, parentheses flattened. Exact always beats
    // prefix; richest-wins only applies within an equally good tier.
    const fullExact = exactMatches(descFull);
    const fullExactPhoto = fullExact.filter(g => (g.images?.length ?? 0) > 0);
    if (fullExactPhoto.length) return pick(richest(fullExactPhoto));
    if (fullExact.length)      return pick(toMatch(fullExact));

    const fullPrefix = prefixMatches(descFull);
    const fullPrefixPhoto = fullPrefix.filter(g => (g.images?.length ?? 0) > 0);
    if (fullPrefixPhoto.length) return pick(richest(fullPrefixPhoto));
    if (fullPrefix.length)      return pick(toMatch(fullPrefix));

    // Pass 2 — the same again with parentheses removed, for TGX qualifiers that
    // carry no identity.
    if (descStripped !== descFull) {
        const strExact = exactMatches(descStripped);
        const strExactPhoto = strExact.filter(g => (g.images?.length ?? 0) > 0);
        if (strExactPhoto.length) return pick(richest(strExactPhoto));
        if (strExact.length)      return pick(toMatch(strExact));

        const strPrefix = prefixMatches(descStripped);
        const strPrefixPhoto = strPrefix.filter(g => (g.images?.length ?? 0) > 0);
        if (strPrefixPhoto.length) return pick(richest(strPrefixPhoto));
        if (strPrefix.length)      return pick(toMatch(strPrefix));
    }

    // Pass 3 — bed-type keyword only, never a tier word. Matching on "standard"
    // or "deluxe" hands the same photos to every room sharing a grade, whatever
    // its bed type or size.
    if (bedWord) {
        const byBedPhoto = withPhotos.filter(g => norm(g.name).includes(bedWord));
        if (tierWord && byBedPhoto.length > 1) {
            const byBoth = byBedPhoto.filter(g => norm(g.name).includes(tierWord));
            if (byBoth.length) return pick(richest(byBoth));
        }
        if (byBedPhoto.length) return pick(richest(byBedPhoto));
        const byBedAny = deduped.filter(g => norm(g.name).includes(bedWord));
        if (byBedAny.length) return pick(toMatch(byBedAny));
    }

    // There is deliberately no tier-word fallback. Returning nothing lets the room
    // fall back to the hotel gallery, which is honest; a wrong photo is worse than
    // no photo on a page someone books from.
    return empty;
}
