/**
 * Territories with their own ISO country code, whose hotels arrive filed under the country
 * they belong to.
 *
 * Found first as QA BG-8 — every Hong Kong hotel stored as CN, so a Hong Kong search matched
 * none of its own hotels and addresses read "Hong Kong, CN" — then audited across the whole
 * catalogue on 2026-09-14 (scratch/audit-country-codes.mjs): Guam stored as US, Réunion,
 * Guadeloupe and Martinique as FR, Jersey and Guernsey as GB, Saint Eustatius as NL, Norfolk
 * Island as AU. The same pattern, so one rule set.
 *
 * Corrected where hotel content is read, never rewritten in the database: a supplier re-sync
 * would put the parent's code straight back.
 *
 * How a hotel is recognised:
 *  - **Islands and overseas territories by coordinates.** Out at sea a box is unambiguous,
 *    and the rule only ever converts a row already filed under the parent — a British
 *    Virgin Islands hotel filed GB is never mistaken for the US Virgin Islands next door.
 *  - **Land-border territories by city name.** Shenzhen shares Hong Kong's bounding box;
 *    its hotels are filed "Shenzhen" and must stay CN. Coordinates cannot tell them apart
 *    at the border; the name can.
 *
 * Disputed areas (Western Sahara, the West Bank, Abkhazia, Northern Cyprus) are deliberately
 * absent: which code they carry is a political decision, not a data error.
 */

type Box = readonly [minLat: number, maxLat: number, minLng: number, maxLng: number];

interface Territory {
    code: string;
    /** Codes its hotels are found filed under. */
    parents: readonly string[];
    boxes?: readonly Box[];
    /** Lower-case city names — for territories with a land border. */
    cities?: ReadonlySet<string>;
    /** For a name match: coordinates that prove the hotel is across the border anyway. */
    acrossBorder?: (lat: number, lng: number) => boolean;
}

/**
 * The Hong Kong–Shenzhen border (Shenzhen River, Deep Bay to Sha Tau Kok) as latitude by
 * longitude, west to east. Needed because a name is not always enough: Shenzhen hotels in
 * Luohu arrive filed under "North District", which is also a Hong Kong district — the
 * Liancheng Hotel, "518009 Shenzhen", at 22.541, 114.132.
 */
const HK_SZ_BORDER: readonly [lng: number, lat: number][] = [
    [113.83, 22.50], [114.03, 22.505], [114.08, 22.515], [114.11, 22.53],
    [114.15, 22.535], [114.19, 22.555], [114.22, 22.56], [114.30, 22.60],
];

/** ~300m of slack: supplier coordinates are not surveyed, and a hotel on the line is ambiguous. */
const BORDER_SLACK_DEG = 0.003;

function northOfShenzhenRiver(lat: number, lng: number): boolean {
    if (lng < HK_SZ_BORDER[0][0] || lng > HK_SZ_BORDER[HK_SZ_BORDER.length - 1][0]) return false;
    for (let i = 1; i < HK_SZ_BORDER.length; i++) {
        const [x0, y0] = HK_SZ_BORDER[i - 1], [x1, y1] = HK_SZ_BORDER[i];
        if (lng <= x1) {
            const borderLat = y0 + ((lng - x0) / (x1 - x0)) * (y1 - y0);
            return lat > borderLat + BORDER_SLACK_DEG;
        }
    }
    return false;
}

const HONG_KONG_CITIES = new Set([
    'hong kong', 'hongkong', 'hong kong sar', 'kowloon', 'new territories', 'lantau', 'lantau island',
    'гонконг', '香港', '九龍', '九龙', '新界',
    // The 18 districts
    'central and western', 'central & western', 'wan chai', 'eastern', 'southern',
    'yau tsim mong', 'sham shui po', 'kowloon city', 'wong tai sin', 'kwun tong',
    'kwai tsing', 'tsuen wan', 'tuen mun', 'yuen long', 'north district', 'tai po',
    'sha tin', 'sai kung', 'islands district',
    // Areas suppliers file as a city
    'tsim sha tsui', 'mong kok', 'causeway bay', 'central', 'sheung wan', 'tung chung',
    'tseung kwan o', 'discovery bay', 'cheung chau', 'lamma island',
]);

const MACAO_CITIES = new Set(['macau', 'macao', 'taipa', 'cotai', 'coloane', '澳门', '澳門', 'макао']);

const TERRITORIES: readonly Territory[] = [
    // Land borders — by name
    { code: 'HK', parents: ['CN'], cities: HONG_KONG_CITIES, acrossBorder: northOfShenzhenRiver },
    { code: 'MO', parents: ['CN'], cities: MACAO_CITIES },

    // United States
    { code: 'GU', parents: ['US'], boxes: [[13.2, 13.7, 144.6, 145.0]] },
    { code: 'MP', parents: ['US'], boxes: [[14.0, 20.6, 144.8, 146.1]] },
    { code: 'PR', parents: ['US'], boxes: [[17.8, 18.6, -67.35, -65.2]] },
    { code: 'VI', parents: ['US'], boxes: [[17.6, 18.45, -65.1, -64.55]] },
    { code: 'AS', parents: ['US'], boxes: [[-14.6, -11.0, -171.2, -168.1]] },

    // France
    { code: 'RE', parents: ['FR'], boxes: [[-21.45, -20.85, 55.2, 55.85]] },
    { code: 'YT', parents: ['FR'], boxes: [[-13.05, -12.6, 44.95, 45.35]] },
    { code: 'GP', parents: ['FR'], boxes: [[15.8, 16.55, -61.85, -60.95]] },
    { code: 'MQ', parents: ['FR'], boxes: [[14.35, 14.9, -61.25, -60.8]] },
    { code: 'GF', parents: ['FR'], boxes: [[2.1, 5.8, -54.65, -51.6]] },
    { code: 'BL', parents: ['FR'], boxes: [[17.85, 17.97, -62.96, -62.78]] },
    { code: 'MF', parents: ['FR'], boxes: [[18.04, 18.13, -63.16, -62.96]] },
    { code: 'PM', parents: ['FR'], boxes: [[46.75, 47.15, -56.45, -56.1]] },
    { code: 'PF', parents: ['FR'], boxes: [[-28.0, -7.8, -155.0, -134.0]] },
    { code: 'NC', parents: ['FR'], boxes: [[-23.0, -19.5, 163.5, 168.2]] },
    { code: 'WF', parents: ['FR'], boxes: [[-14.4, -13.1, -178.3, -176.1]] },

    // United Kingdom
    { code: 'JE', parents: ['GB'], boxes: [[49.15, 49.28, -2.27, -2.0]] },
    { code: 'GG', parents: ['GB'], boxes: [[49.4, 49.75, -2.72, -2.15]] },
    { code: 'IM', parents: ['GB'], boxes: [[54.03, 54.43, -4.85, -4.3]] },
    // A land border: by name. By box, La Línea de la Concepción (Spain) became Gibraltar.
    { code: 'GI', parents: ['GB', 'ES'], cities: new Set(['gibraltar']) },
    { code: 'BM', parents: ['GB'], boxes: [[32.2, 32.45, -64.95, -64.6]] },
    { code: 'KY', parents: ['GB'], boxes: [[19.2, 19.8, -81.45, -79.7]] },
    { code: 'VG', parents: ['GB'], boxes: [[18.3, 18.8, -64.85, -64.25]] },
    { code: 'TC', parents: ['GB'], boxes: [[21.0, 22.0, -72.5, -71.0]] },
    { code: 'AI', parents: ['GB'], boxes: [[18.15, 18.3, -63.2, -62.9]] },
    { code: 'MS', parents: ['GB'], boxes: [[16.65, 16.85, -62.25, -62.13]] },
    { code: 'FK', parents: ['GB'], boxes: [[-52.5, -51.0, -61.5, -57.6]] },

    // Netherlands
    { code: 'BQ', parents: ['NL'], boxes: [[12.0, 12.35, -68.45, -68.15], [17.6, 17.66, -63.27, -63.21], [17.45, 17.53, -63.0, -62.93]] },
    { code: 'CW', parents: ['NL'], boxes: [[12.0, 12.4, -69.2, -68.7]] },
    { code: 'AW', parents: ['NL'], boxes: [[12.4, 12.65, -70.1, -69.85]] },
    { code: 'SX', parents: ['NL'], boxes: [[18.0, 18.065, -63.15, -62.98]] },

    // Denmark
    { code: 'FO', parents: ['DK'], boxes: [[61.3, 62.45, -7.7, -6.2]] },
    { code: 'GL', parents: ['DK'], boxes: [[59.5, 83.7, -73.5, -11.0]] },

    // Australia
    { code: 'NF', parents: ['AU'], boxes: [[-29.15, -28.95, 167.9, 168.05]] },
    { code: 'CX', parents: ['AU'], boxes: [[-10.6, -10.4, 105.5, 105.75]] },
    { code: 'CC', parents: ['AU'], boxes: [[-12.25, -11.8, 96.8, 96.95]] },
];

const BY_CODE = new Map(TERRITORIES.map(t => [t.code, t]));

const norm = (s: string | null | undefined) => (s ?? '').trim();

function inBox([minLat, maxLat, minLng, maxLng]: Box, lat: number, lng: number): boolean {
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

/**
 * The country a hotel is really in: a parent's code corrected to the territory's when the
 * hotel is in one. Anything else is returned as stored.
 */
export function hotelCountry(
    country: string | null | undefined,
    city: string | null | undefined,
    lat?: number | string | null,
    lng?: number | string | null,
): string {
    const stored = norm(country);
    const code = stored.toUpperCase();
    if (!code) return stored;
    const cityLower = norm(city).toLowerCase();
    const la = Number(lat), ln = Number(lng);
    const hasCoords = Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0);

    for (const t of TERRITORIES) {
        if (!t.parents.includes(code)) continue;
        if (t.cities && cityLower && t.cities.has(cityLower)) {
            if (hasCoords && t.acrossBorder?.(la, ln)) continue;
            return t.code;
        }
        if (t.boxes && hasCoords && t.boxes.some(b => inBox(b, la, ln))) return t.code;
    }
    return stored;
}

/** A code on the territory list — its hotels may be stored under a parent's code. */
export function isTerritory(countryCode: string | null | undefined): boolean {
    return BY_CODE.has(norm(countryCode).toUpperCase());
}

/**
 * A territory with a land border, recognised by city name rather than coordinates. Its
 * neighbours share its bounding box, so nothing about it can be decided geographically.
 */
export function hasLandBorder(countryCode: string | null | undefined): boolean {
    return !!BY_CODE.get(norm(countryCode).toUpperCase())?.cities;
}

/** Lower-case codes to match stored content against for a searched country: a territory's
 *  hotels may be filed under its parent. The query's other conditions (city, coordinates)
 *  keep the parent's own hotels out. */
export function storedCountryCodes(countryCode: string): string[] {
    const t = BY_CODE.get(norm(countryCode).toUpperCase());
    return t ? [t.code, ...t.parents].map(c => c.toLowerCase()) : [norm(countryCode).toLowerCase()];
}

/**
 * The land-border territory a city name belongs to (HK for "Kowloon"), or null.
 *
 * `countryCode` is what the search carries, and it matters: Hong Kong's districts include
 * Central, Eastern, Southern and North District, which name places in other countries too.
 * Only a search already pointed at the territory or its parent may match on those.
 */
export function landTerritoryOfCity(city: string | null | undefined, countryCode?: string | null): string | null {
    const c = norm(city).toLowerCase();
    if (!c) return null;
    const searched = norm(countryCode).toUpperCase();
    for (const t of TERRITORIES) {
        if (!t.cities?.has(c)) continue;
        if (searched && searched !== t.code && !t.parents.includes(searched)) continue;
        return t.code;
    }
    return null;
}

/** Every stored city name of a land-border territory: a "Hong Kong" search also looks for
 *  the 450 hotels filed as "Kowloon". */
export function territoryCityNames(countryCode: string): string[] {
    return [...(BY_CODE.get(norm(countryCode).toUpperCase())?.cities ?? [])];
}
