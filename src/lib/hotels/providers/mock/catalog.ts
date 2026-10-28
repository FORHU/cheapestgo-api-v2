// src/lib/hotels/providers/mock/catalog.ts
/**
 * The mock supplier's inventory: invented properties in real Philippine areas.
 *
 * Names are fictional on purpose — a mock must never be mistaken for a real property's data —
 * but the coordinates, cities and the way a traveller would type them are real, so search,
 * the map and the destination autocomplete behave as they would on live inventory.
 */

import type { MockScenario } from './scenarios';

export interface MockHotel {
    id:           string;
    name:         string;
    city:         string;
    region:       string;
    /** Lower-case names a traveller might type for this hotel's area. */
    terms:        string[];
    address:      string;
    lat:          number;
    lng:          number;
    stars:        1 | 2 | 3 | 4 | 5;
    /** USD per night for the standard room, midweek, two adults. */
    baseNightly:  number;
    description:  string;
    amenities:    string[];
    checkInTime:  string;
    checkOutTime: string;
    /** QA hotels carry the failure they exist to provoke. */
    scenario?:    MockScenario;
}

export interface MockRoomType {
    code:      string;
    name:      string;
    /** Price multiplier over the standard room. */
    tier:      number;
    maxAdults: number;
}

export type MockPolicy = 'non_refundable' | 'free_until_3d' | 'tiered';

export interface MockRatePlan {
    code:       string;
    boardCode:  'RO' | 'BB' | 'HB';
    multiplier: number;
    policy:     MockPolicy;
    minStars:   number;
}

export const MOCK_ROOM_TYPES: readonly MockRoomType[] = [
    { code: 'STD', name: 'Standard Double Room', tier: 1.0,  maxAdults: 2 },
    { code: 'DLX', name: 'Deluxe King Room',     tier: 1.35, maxAdults: 3 },
    { code: 'FAM', name: 'Family Suite',         tier: 1.9,  maxAdults: 5 },
];

export const MOCK_RATE_PLANS: readonly MockRatePlan[] = [
    { code: 'RO-NR', boardCode: 'RO', multiplier: 0.88, policy: 'non_refundable', minStars: 1 },
    { code: 'BB-FC', boardCode: 'BB', multiplier: 1.0,  policy: 'free_until_3d',  minStars: 1 },
    { code: 'HB-TR', boardCode: 'HB', multiplier: 1.28, policy: 'tiered',         minStars: 4 },
];

export function mockImages(hotelId: string): string[] {
    return [1, 2, 3, 4].map((n) => `https://picsum.photos/seed/${hotelId}-${n}/1200/800`);
}

const BASIC = ['Free WiFi', 'Air conditioning', '24-hour front desk'];
const MID   = [...BASIC, 'Restaurant', 'Room service', 'Breakfast available'];
const HIGH  = [...MID, 'Swimming pool', 'Fitness centre', 'Spa', 'Airport shuttle'];
const BEACH = [...HIGH, 'Beachfront', 'Water sports'];

const QA_DESCRIPTION =
    'A test property. It behaves as its name says when you book it, and never reaches a real supplier.';

const NCR = ['metro manila', 'ncr', 'national capital region'];

export const MOCK_HOTELS: readonly MockHotel[] = [
    // ── Metro Manila ─────────────────────────────────────────────────────────
    {
        id: 'MOCK-MNL-001', name: 'Bayside Grand Manila', city: 'Manila', region: 'Metro Manila',
        terms: ['manila', 'manila city', 'ermita', 'roxas boulevard', ...NCR],
        address: 'Roxas Boulevard, Ermita, Manila', lat: 14.5832, lng: 120.9794, stars: 5, baseNightly: 120,
        description: 'A waterfront hotel on Manila Bay with a rooftop pool and sunset views over the bay.',
        amenities: HIGH, checkInTime: '14:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-MKT-001', name: 'Ayala Triangle Suites', city: 'Makati', region: 'Metro Manila',
        terms: ['makati', 'makati city', 'ayala', 'ayala triangle', 'greenbelt', ...NCR],
        address: 'Paseo de Roxas, Makati', lat: 14.5547, lng: 121.0244, stars: 5, baseNightly: 160,
        description: 'Serviced suites in the heart of the Makati business district, a short walk from Greenbelt.',
        amenities: HIGH, checkInTime: '15:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-MKT-002', name: 'Salcedo Village Residences', city: 'Makati', region: 'Metro Manila',
        terms: ['makati', 'makati city', 'salcedo village', 'legazpi village', ...NCR],
        address: 'Tordesillas Street, Salcedo Village, Makati', lat: 14.5608, lng: 121.0198, stars: 4, baseNightly: 95,
        description: 'A quiet residential-style hotel among the cafés and restaurants of Salcedo Village.',
        amenities: MID, checkInTime: '14:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-BGC-001', name: 'Fort Bonifacio Skyline Hotel', city: 'Taguig City', region: 'Metro Manila',
        terms: ['taguig', 'taguig city', 'bgc', 'bonifacio global city', 'fort bonifacio', 'the fort', ...NCR],
        address: '5th Avenue, Bonifacio Global City, Taguig', lat: 14.5509, lng: 121.0503, stars: 5, baseNightly: 150,
        description: 'A high-rise hotel in Bonifacio Global City with a sky lounge and a tree-lined high street below.',
        amenities: HIGH, checkInTime: '15:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-BGC-002', name: 'Uptown Bonifacio Inn', city: 'Taguig City', region: 'Metro Manila',
        terms: ['taguig', 'taguig city', 'bgc', 'bonifacio global city', 'uptown bonifacio', ...NCR],
        address: '36th Street, Uptown Bonifacio, Taguig', lat: 14.5586, lng: 121.056, stars: 3, baseNightly: 55,
        description: 'A compact, good-value inn a few minutes from the Uptown Mall.',
        amenities: BASIC, checkInTime: '14:00', checkOutTime: '12:00',
    },

    // ── Cebu ─────────────────────────────────────────────────────────────────
    {
        id: 'MOCK-CEB-001', name: 'Cebu IT Park Plaza Hotel', city: 'Cebu City', region: 'Cebu',
        terms: ['cebu', 'cebu city', 'it park', 'lahug'],
        address: 'Jose Maria del Mar Street, Cebu IT Park, Cebu City', lat: 10.328, lng: 123.9055, stars: 4, baseNightly: 80,
        description: 'A business hotel at Cebu IT Park with a pool deck and a 24-hour café.',
        amenities: HIGH, checkInTime: '14:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-CEB-002', name: 'Mactan Shoreline Resort', city: 'Lapu-Lapu City', region: 'Cebu',
        terms: ['mactan', 'lapu-lapu', 'lapu lapu', 'lapu-lapu city', 'cebu'],
        address: 'Punta Engaño Road, Mactan Island, Lapu-Lapu City', lat: 10.2760, lng: 124.0210, stars: 5, baseNightly: 140,
        description: 'A beachfront resort on Mactan Island with a lagoon pool and a dive centre.',
        amenities: BEACH, checkInTime: '14:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-CEB-003', name: 'Colon Heritage Lodge', city: 'Cebu City', region: 'Cebu',
        terms: ['cebu', 'cebu city', 'colon', 'downtown cebu'],
        address: 'Colon Street, Cebu City', lat: 10.295, lng: 123.902, stars: 2, baseNightly: 35,
        description: 'Simple rooms on the oldest street in the Philippines, close to Basilica del Santo Niño.',
        amenities: BASIC, checkInTime: '13:00', checkOutTime: '11:00',
    },

    // ── Visayas and Palawan ──────────────────────────────────────────────────
    {
        id: 'MOCK-BOR-001', name: 'White Beach Station 2 Resort', city: 'Malay', region: 'Aklan',
        terms: ['boracay', 'malay', 'white beach', 'station 2', 'boracay island'],
        address: 'Station 2, White Beach, Boracay Island, Malay', lat: 11.9674, lng: 121.9248, stars: 4, baseNightly: 130,
        description: 'A beachfront resort on White Beach with an open-air restaurant on the sand.',
        amenities: BEACH, checkInTime: '14:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-BOR-002', name: 'Bulabog Surf Hostel', city: 'Malay', region: 'Aklan',
        terms: ['boracay', 'malay', 'bulabog', 'boracay island'],
        address: 'Bulabog Beach, Boracay Island, Malay', lat: 11.974, lng: 121.933, stars: 2, baseNightly: 28,
        description: 'A relaxed hostel on the windward side of the island, popular with kitesurfers.',
        amenities: BASIC, checkInTime: '13:00', checkOutTime: '11:00',
    },
    {
        id: 'MOCK-ELN-001', name: 'El Nido Cliffside Villas', city: 'El Nido', region: 'Palawan',
        terms: ['el nido', 'palawan', 'bacuit bay'],
        address: 'Corong-Corong, El Nido, Palawan', lat: 11.1784, lng: 119.393, stars: 4, baseNightly: 150,
        description: 'Villas on a cliff over Bacuit Bay, with private terraces and an infinity pool.',
        amenities: BEACH, checkInTime: '14:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-COR-001', name: 'Coron Bay View Lodge', city: 'Coron', region: 'Palawan',
        terms: ['coron', 'palawan', 'busuanga'],
        address: 'Barangay 2, Coron, Palawan', lat: 11.9986, lng: 120.2043, stars: 3, baseNightly: 70,
        description: 'A hillside lodge overlooking Coron Bay and the limestone islands beyond it.',
        amenities: MID, checkInTime: '14:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-SGU-001', name: 'Cloud 9 Surf Camp & Villas', city: 'General Luna', region: 'Siargao',
        terms: ['siargao', 'general luna', 'cloud 9', 'siargao island'],
        address: 'Tourism Road, General Luna, Siargao', lat: 9.8146, lng: 126.158, stars: 3, baseNightly: 85,
        description: 'Garden villas a short walk from the Cloud 9 boardwalk, with a surf school on site.',
        amenities: MID, checkInTime: '14:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-BOH-001', name: 'Alona Beach Panglao Resort', city: 'Panglao', region: 'Bohol',
        terms: ['panglao', 'bohol', 'alona beach', 'tagbilaran'],
        address: 'Alona Beach, Tawala, Panglao, Bohol', lat: 9.5476, lng: 123.7838, stars: 4, baseNightly: 110,
        description: 'A beach resort on Alona Beach with a dive shop and a poolside bar.',
        amenities: BEACH, checkInTime: '14:00', checkOutTime: '12:00',
    },

    // ── Mindanao and Luzon highlands ─────────────────────────────────────────
    {
        id: 'MOCK-DVO-001', name: 'Davao Riverfront Hotel', city: 'Davao City', region: 'Davao',
        terms: ['davao', 'davao city'],
        address: 'R. Castillo Street, Davao City', lat: 7.0644, lng: 125.6074, stars: 4, baseNightly: 75,
        description: 'A modern city hotel beside the river with a rooftop pool and a durian-free lobby.',
        amenities: HIGH, checkInTime: '14:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-BAG-001', name: 'Camp John Hay Pine Lodge', city: 'Baguio', region: 'Benguet',
        terms: ['baguio', 'baguio city', 'camp john hay'],
        address: 'Loakan Road, Camp John Hay, Baguio', lat: 16.4023, lng: 120.596, stars: 3, baseNightly: 60,
        description: 'A pine-forest lodge with fireplaces and cool mountain air year round.',
        amenities: MID, checkInTime: '14:00', checkOutTime: '12:00',
    },
    {
        id: 'MOCK-TAG-001', name: 'Taal Lake Ridge Hotel', city: 'Tagaytay', region: 'Cavite',
        terms: ['tagaytay', 'taal', 'taal lake'],
        address: 'Tagaytay-Nasugbu Highway, Tagaytay', lat: 14.1119, lng: 120.962, stars: 4, baseNightly: 90,
        description: 'A ridge-top hotel with a view of Taal Volcano from every room.',
        amenities: HIGH, checkInTime: '14:00', checkOutTime: '12:00',
    },

    // ── QA properties: each one provokes a failure ───────────────────────────
    qa('MOCK-QA-SOLDOUT',    'QA Sold-Out Inn',          'sold_out',        14.5701, 120.9902),
    qa('MOCK-QA-PRICEUP',    'QA Price-Rise Hotel',      'price_up',        14.5712, 120.9911),
    qa('MOCK-QA-PRICEDOWN',  'QA Price-Drop Hotel',      'price_down',      14.5689, 120.9893),
    qa('MOCK-QA-PBTIMEOUT',  'QA Prebook-Timeout Hotel', 'prebook_timeout', 14.5722, 120.9921),
    qa('MOCK-QA-BOOKFAIL',   'QA Booking-Rejected Hotel','book_rejected',   14.5679, 120.9884),
    qa('MOCK-QA-BOOKTIMEOUT','QA Booking-Timeout Hotel', 'book_timeout',    14.5732, 120.9931),
    qa('MOCK-QA-CANCELFAIL', 'QA Cancel-Rejected Hotel', 'cancel_rejected', 14.5669, 120.9874),
];

function qa(id: string, name: string, scenario: MockScenario, lat: number, lng: number): MockHotel {
    return {
        id, name, city: 'Manila', region: 'Metro Manila',
        terms: ['manila', 'manila city', 'qa', 'mock qa', ...NCR],
        address: 'Malate, Manila', lat, lng, stars: 4, baseNightly: 70,
        description: QA_DESCRIPTION, amenities: MID, checkInTime: '14:00', checkOutTime: '12:00',
        scenario,
    };
}
