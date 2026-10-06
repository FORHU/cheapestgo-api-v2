/**
 * The vocabulary the room-detail modal is drawn from.
 *
 * app-v2 mirrors this file in `src/features/hotels/types/property.types.ts` and
 * says so in a comment there. It was written against this module before this
 * module existed — the client has had the renderer (`DetailSectionGrid`,
 * `KeyFactsRow`) and the props (`roomPolicySections`, `additionalInfo`) for a
 * while, with nothing on this side filling them.
 *
 * Both unions are closed on purpose. `IconId` is `Record<IconId, LucideIcon>`
 * on the client, so adding a member here without adding its glyph there is a
 * compile error rather than a blank row; `SectionId` keeps the modal's headings
 * to a set the design accounts for, so a new supplier category has to be filed
 * under an existing heading rather than inventing one at runtime.
 */

export type SectionId =
    | 'room-layout' | 'toiletries' | 'food-drink' | 'bathroom' | 'internet-comms'
    | 'room-amenities' | 'media-tech' | 'kitchen' | 'general' | 'child-policy' | 'beds-extra';

/** Icon vocabulary shared with the FE renderer. Every member must have an entry
 *  in the FE `SECTION_ICONS` map (frontend Task 12). */
export type IconId =
    | 'bath' | 'shower' | 'toiletries' | 'fridge' | 'coffee' | 'kitchen' | 'wifi'
    | 'phone' | 'tv' | 'wardrobe' | 'desk' | 'window' | 'safe' | 'ac' | 'heating'
    | 'smoking' | 'bed' | 'view' | 'child' | 'check';

export interface DetailItem {
    label: string;
    icon?: IconId;
    /** The trailing qualifier the client draws in a lighter weight — a price,
     *  "on request", "included in the rate". */
    note?: string;
}

export interface DetailSection {
    id: SectionId;
    title: string;
    /** `room` sections describe the room that was matched; `property` sections
     *  are the hotel's and are shown whether or not a room matched. */
    scope: 'room' | 'property';
    items: DetailItem[];
}

export interface AmenityGroup { groupName: string; amenities: string[]; nonFree: string[] }

export interface RoomContent {
    gallery: string[];
    matchedRoomName?: string;
    keyFacts: DetailItem[];
    bedLine?: string;
    bedsExtraSummary?: string;
    sections: DetailSection[];        // room-scoped only
}

export const SECTION_ORDER: SectionId[] = [
    'room-layout', 'toiletries', 'food-drink', 'bathroom', 'internet-comms',
    'room-amenities', 'media-tech', 'kitchen', 'general', 'child-policy', 'beds-extra',
];

export const SECTION_TITLES: Record<SectionId, string> = {
    'room-layout':    'Room layout and furnishings',
    'toiletries':     'Toiletries',
    'food-drink':     'Food and drink',
    'bathroom':       'Bathroom',
    'internet-comms': 'Internet and communications',
    'room-amenities': 'Room amenities',
    'media-tech':     'Media and technology',
    'kitchen':        'Kitchen facilities',
    'general':        'General amenities',
    'child-policy':   'Child policies',
    'beds-extra':     'Cribs and extra beds',
};

export const ROOM_SCOPED = new Set<SectionId>([
    'room-layout', 'toiletries', 'food-drink', 'bathroom', 'internet-comms',
    'room-amenities', 'media-tech', 'kitchen', 'general',
]);
