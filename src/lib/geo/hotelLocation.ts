import { resolveHotelDbCities } from '@/lib/cityAliases';
import { landTerritoryOfCity, storedCountryCodes, territoryCityNames } from '@/lib/geo/territories';

/**
 * How to ask `hotel_content` for "the hotels in this place".
 *
 * Two corrections, both of which cost a city half its hotels or all of them when they are
 * missing, and both of which every caller needs:
 *
 *  - **Spelling.** The catalog files one city under several names, because ETG and OTV
 *    seeded it in different languages — Seoul is stored as "Seoul" and "Seúl", Rome as
 *    "Rom". Matching the name the visitor typed finds one of them.
 *  - **Territory.** A territory's hotels arrive filed under its parent's country code:
 *    every Hong Kong hotel is stored `CN` (QA BG-8), and its districts are stored as the
 *    city — 450 hotels under "Kowloon" alone. A search for `HK` matching `country = 'HK'`
 *    and `city = 'Hong Kong'` finds none of its own hotels.
 *
 * Returns the values rather than a Prisma filter: the callers ask in different shapes —
 * one counts, one selects ids, one reads whole rows — and the shared part is which names
 * and codes to ask about, not how.
 */
export function hotelLocationNames(cityName: string, countryCode?: string | null): {
    cityNames: string[];
    /** Null when the search names no country: every country is then in scope. */
    countryCodes: string[] | null;
} {
    const baseCity = cityName.split(',')[0].trim();
    const iso = countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? countryCode.toUpperCase() : null;

    // A land-border territory is recognised by city name — Shenzhen sits inside Hong Kong's
    // bounding box, so nothing about it can be decided from coordinates.
    const landTerritory = landTerritoryOfCity(baseCity, iso);

    return {
        cityNames: landTerritory
            ? territoryCityNames(landTerritory)
            : resolveHotelDbCities(baseCity, iso ?? ''),
        countryCodes: iso ? storedCountryCodes(landTerritory ?? iso) : null,
    };
}
