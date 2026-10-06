/**
 * What a city is called at home, when that differs from what it is called in English.
 *
 * Distinct from `CITY_ALIASES`, and deliberately a separate map. An alias is a **Sub-Area** —
 * a smaller place inside another, like Gangnam inside Seoul — which searches its parent's
 * inventory and is presented within its own bounds. An **Endonym** is the *same place* under
 * another name: Roma is not part of Rome, it is Rome. It has no parent, no district framing,
 * and no bounds of its own to be clipped to.
 *
 * The two would also collide. `CITY_ALIASES` already holds `'roma': 'Mexiko-Stadt'`, because
 * Roma is a colonia of Mexico City, so Rome could not be added there without evicting it.
 * Kept apart, both survive and the traveller is offered Rome first and the colonia below.
 *
 * Why this is needed at all: the geocoder is queried in English and ranks an exact match on
 * its English index above a famous city whose English name differs. Measured 2026-09-22, the
 * top suggestion for each of these was a different place entirely:
 *
 *     Milano  -> Milanowek, Poland            Sevilla -> Sevilla, Colombia
 *     Torino  -> Torino di Sangro, Chieti     Munchen -> Munchen, Thuringia
 *     Roma    -> Romania (the country)        Wien    -> Wiener Neustadt
 *
 * Bounded on purpose. The Sub-Area dictionary has 20,121 entries and could never be complete;
 * the cities whose English name differs from the local one are a list you can finish. Entries
 * earn their place by being somewhere a traveller books a hotel, not by being a translation.
 *
 * Keys are matched on letters alone, so an entry covers its accented and unaccented spellings
 * at once: 'munchen' answers "München", "Munchen" and "MUNCHEN".
 */

export interface CityEndonym {
    /** The English name, which is what the catalog, the suppliers and the cache are keyed on. */
    city: string;
    countryCode: string;
}

const ENDONYMS: Record<string, CityEndonym> = {
    // Italy
    roma:            { city: 'Rome',            countryCode: 'IT' },
    milano:          { city: 'Milan',           countryCode: 'IT' },
    torino:          { city: 'Turin',           countryCode: 'IT' },
    napoli:          { city: 'Naples',          countryCode: 'IT' },
    firenze:         { city: 'Florence',        countryCode: 'IT' },
    venezia:         { city: 'Venice',          countryCode: 'IT' },
    genova:          { city: 'Genoa',           countryCode: 'IT' },
    padova:          { city: 'Padua',           countryCode: 'IT' },
    siracusa:        { city: 'Syracuse',        countryCode: 'IT' },
    mantova:         { city: 'Mantua',          countryCode: 'IT' },

    // German-speaking
    wien:            { city: 'Vienna',          countryCode: 'AT' },
    munchen:         { city: 'Munich',          countryCode: 'DE' },
    koln:            { city: 'Cologne',         countryCode: 'DE' },
    nurnberg:        { city: 'Nuremberg',       countryCode: 'DE' },
    hannover:        { city: 'Hanover',         countryCode: 'DE' },
    braunschweig:    { city: 'Brunswick',       countryCode: 'DE' },
    luzern:          { city: 'Lucerne',         countryCode: 'CH' },
    zurich:          { city: 'Zurich',          countryCode: 'CH' },
    genf:            { city: 'Geneva',          countryCode: 'CH' },

    // France and the Low Countries
    geneve:          { city: 'Geneva',          countryCode: 'CH' },
    bruxelles:       { city: 'Brussels',        countryCode: 'BE' },
    brussel:         { city: 'Brussels',        countryCode: 'BE' },
    antwerpen:       { city: 'Antwerp',         countryCode: 'BE' },
    gent:            { city: 'Ghent',           countryCode: 'BE' },
    brugge:          { city: 'Bruges',          countryCode: 'BE' },
    luik:            { city: 'Liege',           countryCode: 'BE' },
    denhaag:         { city: 'The Hague',       countryCode: 'NL' },
    sgravenhage:     { city: 'The Hague',       countryCode: 'NL' },

    // Iberia
    sevilla:         { city: 'Seville',         countryCode: 'ES' },
    lisboa:          { city: 'Lisbon',          countryCode: 'PT' },
    donostia:        { city: 'San Sebastian',   countryCode: 'ES' },

    // Nordics
    kobenhavn:       { city: 'Copenhagen',      countryCode: 'DK' },
    goteborg:        { city: 'Gothenburg',      countryCode: 'SE' },

    // Central and Eastern Europe
    praha:           { city: 'Prague',          countryCode: 'CZ' },
    plzen:           { city: 'Pilsen',          countryCode: 'CZ' },
    warszawa:        { city: 'Warsaw',          countryCode: 'PL' },
    krakow:          { city: 'Krakow',          countryCode: 'PL' },
    wroclaw:         { city: 'Wroclaw',         countryCode: 'PL' },
    bucuresti:       { city: 'Bucharest',       countryCode: 'RO' },
    beograd:         { city: 'Belgrade',        countryCode: 'RS' },
    moskva:          { city: 'Moscow',          countryCode: 'RU' },
    sanktpeterburg:  { city: 'Saint Petersburg', countryCode: 'RU' },

    // Greece
    athina:          { city: 'Athens',          countryCode: 'GR' },
    thira:           { city: 'Santorini',       countryCode: 'GR' },
    iraklio:         { city: 'Heraklion',       countryCode: 'GR' },
    kerkyra:         { city: 'Corfu',           countryCode: 'GR' },

    // Ireland
    baileathacliath: { city: 'Dublin',          countryCode: 'IE' },
    corcaigh:        { city: 'Cork',            countryCode: 'IE' },

    // Middle East and Africa
    alqahirah:       { city: 'Cairo',           countryCode: 'EG' },
    yerushalayim:    { city: 'Jerusalem',       countryCode: 'IL' },
    dareelbeida:     { city: 'Casablanca',      countryCode: 'MA' },

    // Asia
    krungthep:       { city: 'Bangkok',         countryCode: 'TH' },
    hanoi:           { city: 'Hanoi',           countryCode: 'VN' },
    saigon:          { city: 'Ho Chi Minh City', countryCode: 'VN' },
    bengaluru:       { city: 'Bangalore',       countryCode: 'IN' },
    jogja:           { city: 'Yogyakarta',      countryCode: 'ID' },
};

/** Letters and digits only: one entry then covers every accent and spacing of a name. */
function normalise(name: string): string {
    return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The city a traveller means when they type its local name.
 *
 * Matched whole, never as a prefix. A prefix rule would answer "Roman" with Rome and, worse,
 * "Genoa" is four letters away from half of Italy — the failure this exists to fix was itself
 * a loose match winning over an exact one.
 */
export function matchCityEndonym(query: string): CityEndonym | undefined {
    return ENDONYMS[normalise(query)];
}

/** Whether an English city name is one an endonym resolves to, used to avoid offering it twice. */
export function isEndonymTarget(city: string, countryCode: string): boolean {
    const c = normalise(city);
    return Object.values(ENDONYMS).some(e => normalise(e.city) === c && e.countryCode === countryCode);
}
