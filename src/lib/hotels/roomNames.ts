/**
 * Room-name rules, ported from v1's `roomUtils`.
 *
 * v1's file is typed on LiteAPI's room-and-offer model — a supplier that no longer
 * exists (see CONTEXT.md) — so only the rules cross, not the shapes. Every function
 * here takes a string and returns one, which is what makes them portable: they were
 * always about the text a supplier sends, never about which supplier sent it.
 */

/**
 * A stripped name this short is a supplier code, not a room type. "U" and "S" have
 * both been seen on a live room card; a guest cannot book from that, so the name it
 * came from is kept instead. Three characters keeps real names that are genuinely
 * short — "Loft", "Twin" — while rejecting bare codes.
 */
export const MIN_MEANINGFUL_ROOM_NAME = 3;

/**
 * The qualifiers that describe an **Offer** rather than a Room, and the chip each is shown
 * as. `chip` is short because it sits in a rate row beside a price.
 *
 * Measured against 24 live Seoul properties on 2026-11-04: of everything TGX hangs in
 * parentheses, only this one is a term. `full double bed` (28), `twin beds` (15), `bunk bed`
 * and `queen size bed` are how a traveller chooses; `shared bathroom` (5), `smoking` and
 * `kitchen` are identity — merging a shared-bathroom room into its private-bathroom sibling
 * sells someone the wrong thing.
 *
 * **Widen this list when a supplier words the same promise differently.** The symptom is a
 * pair of cards a reader cannot tell apart.
 */
const OFFER_QUALIFIERS: readonly { match: RegExp; chip: string }[] = [
    { match: /^bed\s+type\s+is\s+subject\s+to\s+availability$/i, chip: 'bed not guaranteed' },
];

function offerQualifier(qualifier: string): string | null {
    const q = qualifier.trim();
    return OFFER_QUALIFIERS.find(o => o.match.test(q))?.chip ?? null;
}

/** A supplier's room name, separated into what the room is and what the offer promises. */
export interface RoomNameParts {
    /** The Room's identity, and the key it is grouped by. */
    name: string;
    /** The bed, or whatever else the supplier left in the final parenthetical. Per Offer. */
    bed: string | null;
    /** Offer qualifiers lifted off the name, as chips. Empty in the common case. */
    offerTerms: string[];
}

/**
 * Split a supplier's room name into the Room and its Offer's terms. See ADR-0007.
 *
 * TGX hangs variant text in parentheses rather than in fields, and sends more than one, so
 * `Deluxe Twin room (twin beds) (bed type is subject to availability)` and `Deluxe Twin room
 * (twin beds)` are the same Room sold on different terms. Offer qualifiers come off first and
 * separately: they are not the room and must not title it — a card headed "Deluxe Twin room
 * (twin beds)" whose own bullet read "Bed Type Is Subject To Availability" contradicted
 * itself on screen — but they do tell one Offer from another, so they are returned.
 *
 * What is left of the final parenthetical is the bed, lifted onto the Offer.
 *
 * What this replaced: stripping everything from the first `(` onward. That was measured
 * against the same 24 properties and is wrong — it merges a shared-bathroom room into its
 * private-bathroom sibling, and it reads `no window` as noise.
 *
 * Stripping is skipped when it would leave nothing to read: a supplier that files a room as
 * `U (Superior Double room)` has put the identity inside the parentheses, and taking them off
 * leaves a card titled "U". Better a long name than an unbookable one.
 */
export function splitRoomName(roomName: string): RoomNameParts {
    const withoutRateSuffix = roomName
        .replace(/\s*-\s*(non[- ]?refundable|refundable|room only|breakfast included).*$/i, '')
        .trim();

    const offerTerms: string[] = [];
    const withoutTerms = withoutRateSuffix
        .replace(/\s*\(([^)]*)\)/g, (_match, inner: string) => {
            // Comma-separated, because a supplier packs several into one parenthetical:
            // "(bed type is subject to availability, lounge access)". Classifying the whole
            // parenthetical matches neither and leaves those rooms split.
            const kept: string[] = [];
            for (const part of inner.split(',')) {
                const chip = offerQualifier(part);
                if (chip) offerTerms.push(chip);
                else if (part.trim()) kept.push(part.trim());
            }
            return kept.length ? ` (${kept.join(', ')})` : '';
        })
        .replace(/\s+/g, ' ')
        .trim();

    const trailing = /\(([^)]+)\)\s*$/.exec(withoutTerms);
    if (!trailing) return { name: withoutTerms, bed: null, offerTerms };

    const heading = withoutTerms.replace(/\s*\([^)]+\)\s*$/, '').trim();
    return heading.length >= MIN_MEANINGFUL_ROOM_NAME
        ? { name: heading, bed: trailing[1].trim(), offerTerms }
        : { name: withoutTerms, bed: null, offerTerms };
}

/**
 * The Room's identity alone — [splitRoomName]'s heading, and the key rooms are grouped by.
 */
export function normalizeRoomName(roomName: string): string {
    return splitRoomName(roomName).name;
}

/**
 * Whether a room name says enough to choose a room by. Used when picking which of
 * several names should title a merged card — the shortest is normally the most
 * general, but not when it is a supplier code.
 */
export function isMeaningfulRoomName(name: string): boolean {
    return name.trim().length >= MIN_MEANINGFUL_ROOM_NAME;
}

/**
 * The parenthetical portion of a TGX room name — what distinguishes one bookable
 * variant from another once `normalizeRoomName` has taken it off the title.
 *
 * "Standard Single room (smoking, extra bed not included)" → "smoking, extra bed not
 * included". Returns undefined when there is nothing in parentheses.
 *
 * Normalising a name without surfacing this would leave two genuinely different
 * offers looking like the same card twice.
 */
export function extractRoomVariantLabel(roomName: string): string | undefined {
    const matches = [...roomName.matchAll(/\(([^)]+)\)/g)].map(m => m[1].trim());
    return matches.length > 0 ? matches.join(', ') : undefined;
}

/**
 * Pick the title for a set of names that describe the same room.
 *
 * The shortest is normally the most general — "Deluxe Double room" over "Deluxe Double
 * room, city view" — but a supplier code would win that contest outright and title the
 * whole card "U", so codes are passed over unless every name in the set is one.
 */
export function pickBaseTitle(names: string[]): string {
    if (!names.length) return '';
    const shortest = (list: string[]) => list.reduce((a, b) => (a.length <= b.length ? a : b));
    const readable = names.filter(isMeaningfulRoomName);
    return shortest(readable.length ? readable : names);
}
