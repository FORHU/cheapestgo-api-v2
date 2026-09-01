export type SectionId =
  | 'room-layout' | 'toiletries' | 'food-drink' | 'bathroom' | 'internet-comms'
  | 'room-amenities' | 'media-tech' | 'kitchen' | 'general' | 'child-policy' | 'beds-extra';

/** Icon vocabulary shared with the FE renderer. Every member must have an entry
 *  in the FE `SECTION_ICONS` map (frontend Task 12). */
export type IconId =
  | 'bath' | 'shower' | 'toiletries' | 'fridge' | 'coffee' | 'kitchen' | 'wifi'
  | 'phone' | 'tv' | 'wardrobe' | 'desk' | 'window' | 'safe' | 'ac' | 'heating'
  | 'smoking' | 'bed' | 'view' | 'child' | 'check';

export interface DetailItem { label: string; icon?: IconId; note?: string }

export interface DetailSection {
  id: SectionId;
  title: string;
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
