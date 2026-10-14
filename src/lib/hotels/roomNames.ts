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
 * Remove rate-specific suffixes and TGX parenthetical qualifiers.
 *
 * TGX names follow "Base type (qualifier1, qualifier2)" — everything in parens is a
 * variant, not a room identity — and appends the rate to the name besides, so the same
 * physical room arrives as "Standard Double room - Non-refundable" and "Standard Double
 * room (smoking)". Stripping both leaves the identity a guest actually chooses by.
 *
 * Stripping is skipped when it would leave nothing to read. A supplier that files a
 * room as "U (Superior Double room)" has put the identity inside the parentheses, and
 * removing them leaves a card titled "U". Better a long name than an unbookable one.
 */
export function normalizeRoomName(roomName: string): string {
    const withoutRateSuffix = roomName
        .replace(/\s*-\s*(non[- ]?refundable|refundable|room only|breakfast included).*$/i, '')
        .trim();

    const withoutQualifiers = withoutRateSuffix
        .replace(/\s*\(.*$/, '')   // strip everything from first ( onward (TGX variant qualifiers)
        .trim();

    return withoutQualifiers.length >= MIN_MEANINGFUL_ROOM_NAME
        ? withoutQualifiers
        : withoutRateSuffix;
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
