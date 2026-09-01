import type { IconId, SectionId } from './roomContent.types';

export interface Classified { label: string; section: SectionId; icon: IconId }

function prettify(slug: string): string {
  const s = slug.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Exact slug → { label, section, icon }. Specific entries first.
const MAP: Record<string, Classified> = {
  // bathroom
  'private-bathroom':  { label: 'Private bathroom', section: 'bathroom', icon: 'bath' },
  'shared-bathroom':   { label: 'Shared bathroom',  section: 'bathroom', icon: 'bath' },
  'shower':            { label: 'Shower',           section: 'bathroom', icon: 'shower' },
  'bath':             { label: 'Bathtub',          section: 'bathroom', icon: 'bath' },
  'bathtub':          { label: 'Bathtub',          section: 'bathroom', icon: 'bath' },
  'bidet':            { label: 'Bidet',            section: 'bathroom', icon: 'bath' },
  'jacuzzi':          { label: 'Jacuzzi',          section: 'bathroom', icon: 'bath' },
  'hot-tub':          { label: 'Hot tub',          section: 'bathroom', icon: 'bath' },
  'toilet':          { label: 'Private toilet',   section: 'bathroom', icon: 'bath' },
  'toilet-paper':    { label: 'Toilet paper',     section: 'bathroom', icon: 'toiletries' },
  // toiletries
  'toiletries':      { label: 'Free toiletries',  section: 'toiletries', icon: 'toiletries' },
  'free-toiletries': { label: 'Free toiletries',  section: 'toiletries', icon: 'toiletries' },
  'shampoo':         { label: 'Shampoo',          section: 'toiletries', icon: 'toiletries' },
  'soap':            { label: 'Soap',             section: 'toiletries', icon: 'toiletries' },
  'conditioner':     { label: 'Conditioner',      section: 'toiletries', icon: 'toiletries' },
  'body-wash':       { label: 'Body wash',        section: 'toiletries', icon: 'toiletries' },
  'towels':          { label: 'Towels',           section: 'toiletries', icon: 'toiletries' },
  'slippers':        { label: 'Slippers',         section: 'toiletries', icon: 'toiletries' },
  'bathrobe':        { label: 'Bathrobe',         section: 'toiletries', icon: 'toiletries' },
  'hairdryer':       { label: 'Hair dryer',       section: 'bathroom',   icon: 'check' },
  'hair-dryer':      { label: 'Hair dryer',       section: 'bathroom',   icon: 'check' },
  'dental-kit':      { label: 'Dental kit',       section: 'toiletries', icon: 'toiletries' },
  // food & drink
  'minibar':         { label: 'Minibar',          section: 'food-drink', icon: 'fridge' },
  'coffee':          { label: 'Coffee maker/teapot', section: 'food-drink', icon: 'coffee' },
  'coffee-machine':  { label: 'Coffee machine',   section: 'food-drink', icon: 'coffee' },
  'tea-or-coffee':   { label: 'Coffee/tea for guests', section: 'food-drink', icon: 'coffee' },
  'kettle':          { label: 'Kettle',           section: 'food-drink', icon: 'coffee' },
  'electric-kettle': { label: 'Electric kettle',  section: 'food-drink', icon: 'coffee' },
  'bottled-water':   { label: 'Bottled water',    section: 'food-drink', icon: 'check' },
  // kitchen
  'kitchen':         { label: 'Kitchen',          section: 'kitchen', icon: 'kitchen' },
  'kitchenette':     { label: 'Kitchenette',      section: 'kitchen', icon: 'kitchen' },
  'fridge':          { label: 'Refrigerator',     section: 'kitchen', icon: 'fridge' },
  'refrigerator':    { label: 'Refrigerator',     section: 'kitchen', icon: 'fridge' },
  'microwave':       { label: 'Microwave',        section: 'kitchen', icon: 'kitchen' },
  'dishwasher':      { label: 'Dishwasher',       section: 'kitchen', icon: 'kitchen' },
  'toaster':         { label: 'Toaster',          section: 'kitchen', icon: 'kitchen' },
  'oven':            { label: 'Oven',             section: 'kitchen', icon: 'kitchen' },
  'stove':           { label: 'Stovetop',         section: 'kitchen', icon: 'kitchen' },
  'stovetop':        { label: 'Stovetop',         section: 'kitchen', icon: 'kitchen' },
  'cookware':        { label: 'Kitchenware',      section: 'kitchen', icon: 'kitchen' },
  'kitchenware':     { label: 'Kitchenware',      section: 'kitchen', icon: 'kitchen' },
  'dining-table':    { label: 'Dining table',     section: 'kitchen', icon: 'kitchen' },
  // internet & comms
  'wi-fi':           { label: 'Free Wi-Fi',       section: 'internet-comms', icon: 'wifi' },
  'wifi':            { label: 'Free Wi-Fi',       section: 'internet-comms', icon: 'wifi' },
  'wired-internet':  { label: 'Wired internet',   section: 'internet-comms', icon: 'wifi' },
  'internet':        { label: 'Internet access',  section: 'internet-comms', icon: 'wifi' },
  'telephone':       { label: 'Telephone',        section: 'internet-comms', icon: 'phone' },
  // media & tech
  'tv':              { label: 'TV',               section: 'media-tech', icon: 'tv' },
  'television':      { label: 'TV',               section: 'media-tech', icon: 'tv' },
  'cable-tv':        { label: 'Cable channels',   section: 'media-tech', icon: 'tv' },
  'satellite-tv':    { label: 'Satellite channels', section: 'media-tech', icon: 'tv' },
  'flat-screen-tv':  { label: 'Flat-screen TV',   section: 'media-tech', icon: 'tv' },
  'streaming':       { label: 'Streaming service', section: 'media-tech', icon: 'tv' },
  'dvd-player':      { label: 'DVD player',       section: 'media-tech', icon: 'tv' },
  'radio':           { label: 'Radio',            section: 'media-tech', icon: 'tv' },
  // room layout
  'wardrobe':        { label: 'Wardrobe/closet',  section: 'room-layout', icon: 'wardrobe' },
  'closet':          { label: 'Wardrobe/closet',  section: 'room-layout', icon: 'wardrobe' },
  'desk':            { label: 'Desk',             section: 'room-layout', icon: 'desk' },
  'sofa':            { label: 'Sofa',             section: 'room-layout', icon: 'check' },
  'sofa-bed':        { label: 'Sofa bed',         section: 'room-layout', icon: 'bed' },
  'seating-area':    { label: 'Seating area',     section: 'room-layout', icon: 'check' },
  'clothes-rack':    { label: 'Clothes rack',     section: 'room-layout', icon: 'wardrobe' },
  'blackout-curtains': { label: 'Blackout curtains', section: 'room-layout', icon: 'window' },
  'soundproofing':   { label: 'Soundproofing',    section: 'room-layout', icon: 'check' },
  'connecting-rooms': { label: 'Connecting rooms available', section: 'room-layout', icon: 'check' },
  'private-entrance': { label: 'Private entrance', section: 'room-layout', icon: 'check' },
  'balcony':         { label: 'Balcony',          section: 'room-layout', icon: 'window' },
  'terrace':         { label: 'Terrace',          section: 'room-layout', icon: 'window' },
  'patio':           { label: 'Patio',            section: 'room-layout', icon: 'window' },
  // general
  'safe':            { label: 'Safe in room',     section: 'general', icon: 'safe' },
  'in-room-safe':    { label: 'Safe in room',     section: 'general', icon: 'safe' },
  'safe-deposit-box': { label: 'Safe-deposit box', section: 'general', icon: 'safe' },
  'alarm-clock':     { label: 'Alarm clock',      section: 'general', icon: 'check' },
  'wake-up-service': { label: 'Wake-up service',  section: 'general', icon: 'check' },
  'hypoallergenic':  { label: 'Hypoallergenic',   section: 'general', icon: 'check' },
  // room amenities (climate / bedding / policy)
  'air-conditioning': { label: 'Air conditioning', section: 'room-amenities', icon: 'ac' },
  'heating':         { label: 'Heating',          section: 'room-amenities', icon: 'heating' },
  'fan':             { label: 'Fan',              section: 'room-amenities', icon: 'ac' },
  'fireplace':       { label: 'Fireplace',        section: 'room-amenities', icon: 'heating' },
  'iron':            { label: 'Iron',             section: 'room-amenities', icon: 'check' },
  'ironing-board':   { label: 'Ironing facilities', section: 'room-amenities', icon: 'check' },
  'carpeted':        { label: 'Carpeted',         section: 'room-amenities', icon: 'check' },
  'non-smoking':     { label: 'Non-smoking',      section: 'room-amenities', icon: 'smoking' },
  'smoking':         { label: 'Smoking allowed',  section: 'room-amenities', icon: 'smoking' },
};

// Regex fallbacks for slugs not in MAP, evaluated in order, before the
// room-amenities default. Tokens are hyphen/boundary-anchored so a compound
// slug ("desktop-computer", "bath-products") is not captured by a substring.
// Toiletries runs before bathroom so "bathrobe" lands in toiletries.
const RULES: [RegExp, SectionId, IconId][] = [
  [/toiletr|towel|slipper|bathrobe|shampoo|soap/i,           'toiletries',     'toiletries'],
  [/bathroom|shower|bidet|(^|-)(bath|bathtub|toilet)(-|$)/i, 'bathroom',       'bath'],
  [/coffee-(maker|machine|pot)|\bkettle\b|minibar|\btea\b/i, 'food-drink',     'coffee'],
  [/kitchen|fridge|refrigerat|microwave|oven|stove|dishwash/i, 'kitchen',      'kitchen'],
  [/wi-?fi|internet|telephone|(^|-)phone(-|$)/i,             'internet-comms', 'wifi'],
  [/\btv\b|television|channels|streaming|dvd/i,              'media-tech',     'tv'],
  [/-view$|\bview\b|balcony|terrace|patio|wardrobe|(^|-)closet(-|$)|(^|-)desk(-|$)|curtain/i, 'room-layout', 'view'],
  [/safe|deposit-box/i,                                      'general',        'safe'],
  [/air.?condition|heating|\bfan\b/i,                        'room-amenities', 'ac'],
];

export function classifyRoomAmenity(slug: string): Classified {
  const key = slug.toLowerCase().trim();
  // Spread so callers can never mutate the shared MAP entry.
  if (MAP[key]) return { ...MAP[key] };
  for (const [re, section, icon] of RULES) {
    if (re.test(key)) return { label: prettify(key), section, icon };
  }
  return { label: prettify(key), section: 'room-amenities', icon: 'check' };
}
