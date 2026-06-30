/**
 * Maps OTV (RateHawk/TravelgateX) amenity codes to user-facing labels.
 */
const OTV_AMENITY_MAP: Record<string, string> = {
    FREE_WIFI: 'Free WiFi', WIFI_GRATIS: 'Free WiFi', WIFI: 'WiFi',
    WIRELESS_INTERNET: 'Free WiFi', INTERNET: 'Internet', HIGH_SPEED_INTERNET: 'High-Speed Internet',
    FREE_PARKING: 'Free Parking', PARKING_GRATIS: 'Free Parking', PARKING: 'Parking',
    VALET_PARKING: 'Valet Parking', SECURE_PARKING: 'Secure Parking',
    UNDERGROUND_PARKING: 'Underground Parking', CAR_PARK: 'Parking',
    SWIMMING_POOL: 'Swimming Pool', POOL: 'Swimming Pool', INDOOR_POOL: 'Indoor Pool',
    OUTDOOR_POOL: 'Outdoor Pool', HEATED_POOL: 'Heated Pool', ROOFTOP_POOL: 'Rooftop Pool',
    GYM: 'Fitness Center', FITNESS_CENTER: 'Fitness Center', FITNESS_ROOM: 'Fitness Center',
    FITNESS: 'Fitness Center', SAUNA: 'Sauna', SPA: 'Spa', HOT_TUB: 'Hot Tub',
    JACUZZI: 'Jacuzzi', STEAM_ROOM: 'Steam Room',
    RESTAURANT: 'Restaurant', BAR: 'Bar', HOTEL_BAR: 'Bar',
    BREAKFAST: 'Breakfast Available', BREAKFAST_INCLUDED: 'Breakfast Included',
    BREAKFAST_BUFFET: 'Buffet Breakfast', ROOM_SERVICE: 'Room Service',
    MINIBAR: 'Minibar', KITCHEN: 'Kitchen', KITCHENETTE: 'Kitchenette',
    COFFEE_MAKER: 'Coffee Maker', SNACK_BAR: 'Snack Bar',
    AIR_CONDITIONING: 'Air Conditioning', AIR_COND: 'Air Conditioning', HEATING: 'Heating',
    BALCONY: 'Balcony', TERRACE: 'Terrace', SEA_VIEW: 'Sea View', CITY_VIEW: 'City View',
    GARDEN_VIEW: 'Garden View', IN_ROOM_SAFE: 'In-Room Safe', SAFE: 'In-Room Safe',
    TV: 'TV', FLAT_SCREEN_TV: 'Flat-Screen TV',
    CONCIERGE: 'Concierge', RECEPTION_24H: '24/7 Reception',
    RECEPTION_24_HOURS: '24/7 Reception', FRONT_DESK_24H: '24/7 Reception',
    LAUNDRY: 'Laundry Service', LAUNDRY_SERVICE: 'Laundry Service',
    DRY_CLEANING: 'Dry Cleaning', LUGGAGE_STORAGE: 'Luggage Storage',
    AIRPORT_TRANSFER: 'Airport Transfer', SHUTTLE: 'Shuttle Service',
    TOUR_DESK: 'Tour Desk', ROOM_CLEANING: 'Daily Housekeeping',
    BUSINESS_CENTER: 'Business Center', MEETING_ROOMS: 'Meeting Rooms',
    CONFERENCE: 'Conference Facilities',
    WHEELCHAIR: 'Wheelchair Accessible', WHEELCHAIR_ACCESSIBLE: 'Wheelchair Accessible',
    DISABLED_FACILITIES: 'Disabled Facilities', ELEVATOR: 'Elevator', LIFT: 'Elevator',
    NON_SMOKING: 'Non-Smoking Rooms', PET_FRIENDLY: 'Pet Friendly', PETS_ALLOWED: 'Pet Friendly',
    FAMILY_ROOMS: 'Family Rooms', SMOKE_FREE: 'Smoke-Free Property',
    GARDEN: 'Garden', BBQ: 'BBQ Facilities', SUN_TERRACE: 'Sun Terrace',
    BEACH_ACCESS: 'Beach Access', PRIVATE_BEACH: 'Private Beach',
    EXPRESS_CHECKIN: 'Express Check-in', EARLY_CHECKIN: 'Early Check-in',
    LATE_CHECKOUT: 'Late Check-out', LOCKER: 'Lockers', ATM: 'ATM on Site',
    GIFT_SHOP: 'Gift Shop', NEWSSTAND: 'Newsstand', MULTILINGUAL_STAFF: 'Multilingual Staff',
};

export function otvCodeToLabel(code: string | null | undefined): string {
    if (!code) return '';
    const upper = code.toUpperCase().trim();
    if (OTV_AMENITY_MAP[upper]) return OTV_AMENITY_MAP[upper];
    return upper
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
}
