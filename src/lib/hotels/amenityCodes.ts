/**
 * Maps OTV (RateHawk/TravelgateX) amenity codes to user-facing labels.
 * Codes come from the hotelX.hotels portfolio query AmenityStatic.code field.
 * Fallback: unknown codes are prettified (underscores → spaces, title-cased).
 */
const OTV_AMENITY_MAP: Record<string, string> = {
    // Wi-Fi
    FREE_WIFI: 'Free WiFi',
    WIFI_GRATIS: 'Free WiFi',
    WIFI: 'WiFi',
    WIRELESS_INTERNET: 'Free WiFi',
    INTERNET: 'Internet',
    HIGH_SPEED_INTERNET: 'High-Speed Internet',

    // Parking
    FREE_PARKING: 'Free Parking',
    PARKING_GRATIS: 'Free Parking',
    PARKING: 'Parking',
    VALET_PARKING: 'Valet Parking',
    SECURE_PARKING: 'Secure Parking',
    UNDERGROUND_PARKING: 'Underground Parking',
    CAR_PARK: 'Parking',

    // Pool
    SWIMMING_POOL: 'Swimming Pool',
    POOL: 'Swimming Pool',
    INDOOR_POOL: 'Indoor Pool',
    OUTDOOR_POOL: 'Outdoor Pool',
    HEATED_POOL: 'Heated Pool',
    ROOFTOP_POOL: 'Rooftop Pool',

    // Fitness
    GYM: 'Fitness Center',
    FITNESS_CENTER: 'Fitness Center',
    FITNESS_ROOM: 'Fitness Center',
    FITNESS: 'Fitness Center',
    SAUNA: 'Sauna',
    SPA: 'Spa',
    HOT_TUB: 'Hot Tub',
    JACUZZI: 'Jacuzzi',
    STEAM_ROOM: 'Steam Room',

    // Food & Drink
    RESTAURANT: 'Restaurant',
    BAR: 'Bar',
    HOTEL_BAR: 'Bar',
    BREAKFAST: 'Breakfast Available',
    BREAKFAST_INCLUDED: 'Breakfast Included',
    BREAKFAST_BUFFET: 'Buffet Breakfast',
    ROOM_SERVICE: 'Room Service',
    MINIBAR: 'Minibar',
    KITCHEN: 'Kitchen',
    KITCHENETTE: 'Kitchenette',
    COFFEE_MAKER: 'Coffee Maker',
    SNACK_BAR: 'Snack Bar',

    // Rooms
    AIR_CONDITIONING: 'Air Conditioning',
    AIR_COND: 'Air Conditioning',
    HEATING: 'Heating',
    BALCONY: 'Balcony',
    TERRACE: 'Terrace',
    SEA_VIEW: 'Sea View',
    CITY_VIEW: 'City View',
    GARDEN_VIEW: 'Garden View',
    IN_ROOM_SAFE: 'In-Room Safe',
    SAFE: 'In-Room Safe',
    TV: 'TV',
    FLAT_SCREEN_TV: 'Flat-Screen TV',

    // Services
    CONCIERGE: 'Concierge',
    RECEPTION_24H: '24/7 Reception',
    RECEPTION_24_HOURS: '24/7 Reception',
    FRONT_DESK_24H: '24/7 Reception',
    LAUNDRY: 'Laundry Service',
    LAUNDRY_SERVICE: 'Laundry Service',
    DRY_CLEANING: 'Dry Cleaning',
    LUGGAGE_STORAGE: 'Luggage Storage',
    AIRPORT_TRANSFER: 'Airport Transfer',
    SHUTTLE: 'Shuttle Service',
    TOUR_DESK: 'Tour Desk',
    ROOM_CLEANING: 'Daily Housekeeping',

    // Business
    BUSINESS_CENTER: 'Business Center',
    MEETING_ROOMS: 'Meeting Rooms',
    CONFERENCE: 'Conference Facilities',

    // Accessibility
    WHEELCHAIR: 'Wheelchair Accessible',
    WHEELCHAIR_ACCESSIBLE: 'Wheelchair Accessible',
    DISABLED_FACILITIES: 'Disabled Facilities',
    ELEVATOR: 'Elevator',
    LIFT: 'Elevator',

    // Policies
    NON_SMOKING: 'Non-Smoking Rooms',
    PET_FRIENDLY: 'Pet Friendly',
    PETS_ALLOWED: 'Pet Friendly',
    FAMILY_ROOMS: 'Family Rooms',
    SMOKE_FREE: 'Smoke-Free Property',

    // Outdoors
    GARDEN: 'Garden',
    BBQ: 'BBQ Facilities',
    SUN_TERRACE: 'Sun Terrace',
    BEACH_ACCESS: 'Beach Access',
    PRIVATE_BEACH: 'Private Beach',

    // Misc
    EXPRESS_CHECKIN: 'Express Check-in',
    EARLY_CHECKIN: 'Early Check-in',
    LATE_CHECKOUT: 'Late Check-out',
    LOCKER: 'Lockers',
    ATM: 'ATM on Site',
    GIFT_SHOP: 'Gift Shop',
    NEWSSTAND: 'Newsstand',
    MULTILINGUAL_STAFF: 'Multilingual Staff',

    // Spanish TGX supplier codes
    AIRE_ACONDICIONADO: 'Air Conditioning',
    ASCENSOR: 'Elevator',
    ZONAS_PARA_FUMADORES: 'Smoking Areas',
    ALOJAMIENTO_PARA_NO_FUMADORES: 'Non-Smoking Rooms',
    GUARDIA_DE_SEGURIDAD: 'Security Guard',
    TELEVISION_EN_EL_VESTIBULO: 'Lobby TV',
    PISCINA: 'Swimming Pool',
    PISCINA_CUBIERTA: 'Indoor Pool',
    PISCINA_AL_AIRE_LIBRE: 'Outdoor Pool',
    RESTAURANTE: 'Restaurant',
    GIMNASIO: 'Fitness Center',
    RECEPCION_24_HORAS: '24/7 Reception',
    ESTACIONAMIENTO: 'Parking',
    APARCAMIENTO: 'Parking',
    APARCAMIENTO_GRATUITO: 'Free Parking',
    SERVICIO_DE_HABITACIONES: 'Room Service',
    JARDIN: 'Garden',
    TERRAZA: 'Terrace',
    CAJA_FUERTE: 'In-Room Safe',
    CAJA_DE_SEGURIDAD: 'In-Room Safe',
    SERVICIO_DE_LAVANDERIA: 'Laundry Service',
    LAVANDERIA: 'Laundry Service',
    DESAYUNO_INCLUIDO: 'Breakfast Included',
    DESAYUNO_DISPONIBLE: 'Breakfast Available',
    COCINA: 'Kitchen',
    COCINA_AMERICANA: 'Kitchenette',
    INTERNET_GRATUITO: 'Free WiFi',
    INTERNET_DE_ALTA_VELOCIDAD: 'High-Speed Internet',
    CALEFACCION: 'Heating',
    BALCON: 'Balcony',
    VISTA_AL_MAR: 'Sea View',
    VISTA_A_LA_CIUDAD: 'City View',
    VISTA_AL_JARDIN: 'Garden View',
    ACCESO_A_LA_PLAYA: 'Beach Access',
    PLAYA_PRIVADA: 'Private Beach',
    CONSERJERIA: 'Concierge',
    TRASLADO_AL_AEROPUERTO: 'Airport Transfer',
    ALMACENAMIENTO_DE_EQUIPAJE: 'Luggage Storage',
    ACCESO_PARA_SILLA_DE_RUEDAS: 'Wheelchair Accessible',
    INSTALACIONES_PARA_DISCAPACITADOS: 'Disabled Facilities',
    INSTALACIONES_DE_NEGOCIOS: 'Business Center',
    SALA_DE_REUNIONES: 'Meeting Rooms',
    LIMPIEZA_DIARIA: 'Daily Housekeeping',
    TV_PANTALLA_PLANA: 'Flat-Screen TV',
    MASCOTAS_PERMITIDAS: 'Pet Friendly',
    HABITACIONES_FAMILIARES: 'Family Rooms',
    BARBACOA: 'BBQ Facilities',
    TERRAZA_DE_SOL: 'Sun Terrace',

    // Italian TGX supplier codes
    ARIA_CONDIZIONATA: 'Air Conditioning',
    ASCENSORE: 'Elevator',
    RISCALDAMENTO: 'Heating',
    AREE_FUMATORI: 'Smoking Areas',
    STRUTTURA_NON_FUMATORI: 'Non-Smoking Property',
    GUARDIA: 'Security Guard',
    GIARDINO: 'Garden',
    TERRAZZA: 'Terrace',
    SERVIZIO_DI_RECEPTION: 'Reception',
    FRIGO: 'Refrigerator',
    CAMERA_FAMILY: 'Family Room',
    ASCIUGACAPELLI: 'Hair Dryer',
    DOCCIA_VASCA: 'Shower/Bath',
    DOCCIA: 'Shower',
    PER_OSPITI_CON_DISABILITA: 'Disabled Facilities',
    DEPOSITO_BAGAGLI: 'Luggage Storage',
    SERVIZI_DI_CONCIERGE: 'Concierge',
    LAVANDERIA_A_SECCO: 'Dry Cleaning',
    CUCINA_IN_COMUNE: 'Shared Kitchen',
    CUCINA: 'Kitchen',
    RISTORANTE: 'Restaurant',
    FORNO_A_MICROONDE: 'Microwave',
    WI_FI_GRATUITO: 'Free WiFi',
    TV_NELLA_HALL: 'Lobby TV',
    ASSISTENZA_BIGLIETTI: 'Ticket Assistance',
    PRENOTAZIONE_TAXI: 'Taxi Service',
    ASSISTENZA_TURISTICA: 'Tourist Assistance',
    INGLESE: 'English Speaking Staff',
    COREANO: 'Korean Speaking Staff',
    PARCHEGGIO_NON_DISPONIBILE: 'No Parking',
    ANIMALI_NON_AMMESSI: 'No Pets Allowed',
    KIT_PRIMO_SOCCORSO: 'First Aid Kit',
    CHECK_IN_CHECK_OUT_EXPRESS: 'Express Check-in/Out',
    CHECK_IN_E_O_CHECK_OUT_SENZA_CONTATTO: 'Contactless Check-in/Out',
    CONTROLLO_DELLA_TEMPERATURA_PER_LO_STAFF: 'Temperature Screening (Staff)',
    CONTROLLO_DELLA_TEMPERATURA_PER_GLI_OSPITI: 'Temperature Screening (Guests)',
    DISPOSITIVI_DI_PROTEZIONE_PERSONALE_PER_LO_STAFF: 'PPE for Staff',
    MISURE_DI_SANIFICAZIONE_EXTRA: 'Extra Sanitation Measures',
    MISURE_AGGIUNTIVE_CONTRO_IL_COVID_19: 'Additional COVID-19 Measures',
    PARCHEGGIO: 'Parking',
    BAR_RISTORANTE: 'Bar & Restaurant',
    COLAZIONE_INCLUSA: 'Breakfast Included',
    COLAZIONE_DISPONIBILE: 'Breakfast Available',
    PALESTRA: 'Fitness Center',
    SPA_E_CENTRO_BENESSERE: 'Spa & Wellness',
    SALA_RIUNIONI: 'Meeting Rooms',
    CENTRO_BUSINESS: 'Business Center',
    CASSAFORTE: 'In-Room Safe',
    BALCONE: 'Balcony',
    VISTA_SUL_MARE: 'Sea View',
    VISTA_SULLA_CITTA: 'City View',
    SERVIZIO_IN_CAMERA: 'Room Service',
    PULIZIE_GIORNALIERE: 'Daily Housekeeping',
    TRANSFER_AEROPORTO: 'Airport Transfer',
    ANIMALI_AMMESSI: 'Pet Friendly',
    ACCESSO_SPIAGGIA: 'Beach Access',
    SPIAGGIA_PRIVATA: 'Private Beach',
    PORTINERIA: 'Concierge',

    // German TGX supplier codes
    AUFZUG: 'Elevator',
    KLIMAANLAGE: 'Air Conditioning',
    KOSTENLOSER_PARKPLATZ: 'Free Parking',
    PARKPLATZ: 'Parking',
    SCHWIMMBAD: 'Swimming Pool',
    FITNESSCENTER: 'Fitness Center',
    FRUHSTUCK: 'Breakfast Available',
    FRUHSTUCK_INKLUSIVE: 'Breakfast Included',
    ZIMMERSERVICE: 'Room Service',
    KUCHE: 'Kitchen',
    KUCHENZEILE: 'Kitchenette',
    KOSTENLOSES_WLAN: 'Free WiFi',
    WLAN: 'WiFi',
    HEIZUNG: 'Heating',
    BALKON: 'Balcony',
    MEERBLICK: 'Sea View',
    STADTBLICK: 'City View',
    GARTENBLICK: 'Garden View',
    NICHTRAUCHERZIMMER: 'Non-Smoking Rooms',
    HAUSTIERE_ERLAUBT: 'Pet Friendly',
    FAMILIENZIMMER: 'Family Rooms',
    GEPACK_AUFBEWAHRUNG: 'Luggage Storage',
    FLUGHAFENTRANSFER: 'Airport Transfer',
    ROLLSTUHLGERECHT: 'Wheelchair Accessible',
    BEHINDERTENGERECHTE_EINRICHTUNGEN: 'Disabled Facilities',
    BUSINESSCENTER: 'Business Center',
    KONFERENZRAUME: 'Meeting Rooms',
    TAGLICHE_ZIMMERREINIGUNG: 'Daily Housekeeping',
    WASCHESERVICE: 'Laundry Service',
    GARTENANLAGE: 'Garden',
    SONNENTERRASSE: 'Sun Terrace',
    STRANDLAGE: 'Beach Access',
    PRIVATSTRAND: 'Private Beach',
    CONCIERGE_SERVICE: 'Concierge',
    GELDAUTOMAT: 'ATM on Site',

    // Russian TGX supplier codes
    // Note: Cyrillic й decomposes via NFD → и + combining breve → combining mark stripped → И
    //       e.g. "стойка" → СТОИКА, "семейные" → СЕМЕИНЫЕ, "бассейн" → БАССЕИН
    //       «» angle quotes are stripped by normalizeStoredAmenity before lookup
    МАГАЗИНЫ: 'Shops',
    ТЕЛЕВИЗОР_В_ЛОББИ: 'Lobby TV',
    ТЕЛЕВИЗОР: 'TV',
    НОМЕРА_ДЛЯ_НЕКУРЯЩИХ: 'Non-Smoking Rooms',
    ОТЕЛЬ_ДЛЯ_НЕКУРЯЩИХ: 'Non-Smoking Hotel',
    ОГНЕТУШИТЕЛЬ: 'Fire Extinguisher',
    СТОИКА_РЕГИСТРАЦИИ: 'Reception',
    КРУГЛОСУТОЧНАЯ_СТОИКА_РЕГИСТРАЦИИ: '24/7 Reception',
    СЕМЕИНЫЕ_НОМЕРА: 'Family Rooms',
    ПРАЧЕЧНАЯ: 'Laundry Service',
    СЕИФ: 'In-Room Safe',
    УСЛУГА_ЗВОНОК_БУДИЛЬНИК: 'Wake-up Call',
    ХРАНЕНИЕ_БАГАЖА: 'Luggage Storage',
    РЕСТОРАН: 'Restaurant',
    БЕСПЛАТНЫИ_WI_FI: 'Free WiFi',
    БЕСПЛАТНЫИ_ИНТЕРНЕТ: 'Free WiFi',
    НА_АНГЛИИСКОМ: 'English Speaking Staff',
    ПАРКОВКА_РЯДОМ_С_ОТЕЛЕМ: 'Parking Nearby',
    БЕСПЛАТНАЯ_ПАРКОВКА: 'Free Parking',
    ПАРКОВКА: 'Parking',
    РЯДОМ_С_ПЛЯЖЕМ: 'Near Beach',
    ОБЩЕСТВЕННЫИ_ПЛЯЖ: 'Public Beach',
    СНОРКЛИНГ: 'Snorkeling',
    ДАИВИНГ: 'Diving',
    СПА_ЦЕНТР: 'Spa',
    СПА: 'Spa',
    БАССЕИН: 'Swimming Pool',
    ТРЕНАЖЕРНЫИ_ЗАЛ: 'Fitness Center',
    КОНДИЦИОНЕР: 'Air Conditioning',
    ЛИФТ: 'Elevator',
    РАЗМЕЩЕНИЕ_С_ДОМАШНИМИ_ЖИВОТНЫМИ_НЕ_ДОПУСКАЕТСЯ: 'No Pets Allowed',
    ДОПОЛНИТЕЛЬНЫЕ_МЕРЫ_ПРОТИВ_COVID_19: 'Additional COVID-19 Measures',
    УСИЛЕННЫЕ_МЕРЫ_ДЕЗИНФЕКЦИИ: 'Enhanced Disinfection',
    ПРОДАЖА_БИЛЕТОВ: 'Ticket Sales',
    КОНФЕРЕНЦ_ЗАЛ: 'Conference Room',
    'КОНФЕРЕНЦ-ЗАЛ': 'Conference Room',
    МАССАЖ: 'Massage',
    ИНДИВИДУАЛЬНЫЕ_СРЕДСТВА_ЗАЩИТЫ_ДЛЯ_ПЕРСОНАЛА: 'PPE for Staff',
    ПОЛОТЕНЦА_ДЛЯ_ПЛЯЖА_БАССЕИНА: 'Beach/Pool Towels',
    ТРАНСФЕРНЫЕ_УСЛУГИ: 'Transfer Services',
    ТРАНСФЕР_ОТ_ДО_АЭРОПОРТА: 'Airport Transfer',
    ТРАНСФЕР_ИЗ_АЭРОПОРТА: 'Airport Transfer',
    ЭКСКУРСИОННОЕ_БЮРО: 'Tour Desk',
    ЗАВТРАК: 'Breakfast Available',
    ЗАВТРАК_ВКЛЮЧЕН: 'Breakfast Included',
    ПИТАНИЕ_ВКЛЮЧЕНО: 'Meal Plan Included',
    УСЛУГИ_КОНСЬЕРЖА: 'Concierge',
    УДОБСТВА_ДЛЯ_ГОСТЕИ_С_ОГРАНИЧЕННЫМИ_ФИЗИЧЕСКИМИ_ВОЗМОЖНОСТЯМИ: 'Disabled Facilities',
    ОБСЛУЖИВАНИЕ_НОМЕРОВ: 'Room Service',
    ХИМЧИСТКА: 'Dry Cleaning',
    БАНКОМАТЫ: 'ATM on Site',

    // ─── Non-English supplier codes ───────────────────────────────────────────
    // OTV sends amenity codes in the property's own language for a large minority of
    // hotels — German, Spanish, Italian and Dutch all observed, 22% of all stored
    // amenity labels. Unmapped, the fallback prettifier turned them into user-facing
    // text ("GepäCklagerung", "RecepcióN Las 24 Horas"), which is what customers saw
    // on the property page.
    //
    // Mapping the codes fixes both directions at once: otvCodeToLabel for new ingests,
    // and normalizeStoredAmenity for the ~178k labels already stored, because the
    // prettifier is reversible. No backfill and no re-fetch needed.
    //
    // Keys are post-normalisation: accents stripped, uppercased, spaces and slashes
    // collapsed to underscores — the exact form toAmenityKey produces.

    // German
    GEPACKLAGERUNG: 'Luggage Storage',
    WASCHEREI: 'Laundry',
    ZUSATZLICHE_DESINFEKTIONSMASSNAHMEN: 'Extra Disinfection Measures',
    FUR_GASTE_MIT_BEHINDERUNGEN: 'Accessible for Guests with Disabilities',
    FEUERLOSCHER: 'Fire Extinguisher',
    KEINE_AUFZUGE: 'No Elevators',
    FON: 'Hairdryer',
    FOHN: 'Hairdryer',
    ZUSATZLICHE_MASSNAHMEN_GEGEN_COVID_19: 'Additional COVID-19 Measures',
    FRUHSTUCKSBUFFET: 'Buffet Breakfast',
    FRUHSTUCK_IM_ZIMMER: 'Breakfast in Room',
    KAFFEE_TEE_FUR_GASTE: 'Coffee/Tea for Guests',
    PARKPLATZ_IN_DER_NAHE: 'Parking Nearby',
    KOSTENLOSER_PARKPLATZ_IN_DER_NAHE: 'Free Parking Nearby',
    KOSTENLOSER_PARKPLATZ_AUF_DEM_GELANDE: 'Free On-Site Parking',
    KONTAKTLOSER_CHECK_IN_UND_ODER_CHECK_OUT: 'Contactless Check-In/Out',
    KUHLSCHRANK: 'Refrigerator',
    FLUGHAFENBEFORDERUNG: 'Airport Transfer',
    FAX_UND_KOPIERER: 'Fax and Photocopying',
    GESCHAFTSZENTRUM: 'Business Centre',
    TICKETUNTERSTUTZUNG: 'Ticket Assistance',
    GARTENMOBEL: 'Garden Furniture',
    TEMPERATURSTEUERUNG_FUR_GASTE: 'Temperature Control for Guests',
    TEMPERATURSTEUERUNG_FUR_PERSONAL: 'Temperature Control for Staff',
    WAHRUNGSTAUSCH: 'Currency Exchange',
    GEMEINSCHAFTSKUCHE: 'Shared Kitchen',
    PERSONLICHE_SCHUTZAUSRUSTUNG_FUR_GASTE: 'PPE for Guests',
    PERSONLICHE_SCHUTZAUSRUSTUNG_FUR_PERSONAL: 'PPE for Staff',
    STRAND_POOLHANDTUCHER: 'Beach/Pool Towels',
    BUGELN: 'Ironing',
    BUGELEISEN: 'Iron',
    BUGELEISEN_UND_BRETT: 'Iron and Ironing Board',
    'ALLE_(OFFENTLICHEN_UND_PRIVATEN)_BEREICHE_SIND_RAUCHFREI': 'Entirely Non-Smoking',
    KONFERENZ_UND_PRASENTATIONSEINRICHTUNGEN: 'Meeting and Presentation Facilities',
    BABYSITTING_UND_KINDERBETREUUNG: 'Babysitting and Childcare',
    SCHONHEITSBEHANDLUNGEN: 'Beauty Treatments',
    'DIATMENU_(AUF_ANFRAGE)': 'Dietary Menu (On Request)',
    ZUGANG_ZU_OBEREN_STOCKWERKEN_MIT_AUFZUG: 'Elevator to Upper Floors',

    // Spanish
    HABITACIONES_PARA_NO_FUMADORES: 'Non-Smoking Rooms',
    CONSIGNA_DE_EQUIPAJES: 'Luggage Storage',
    TINTORERIA: 'Dry Cleaning',
    RECEPCION_LAS_24_HORAS: '24-Hour Reception',
    MOSTRADOR_DE_RECEPCION: 'Reception Desk',
    SERVICIO_DE_PLANCHADO: 'Ironing Service',
    SERVICIO_DE_DESPERTADOR: 'Wake-Up Service',
    ACCESIBLE_PARA_SILLAS_DE_RUEDAS: 'Wheelchair Accessible',
    HABITACION_FAMILIAR: 'Family Rooms',
    ARTICULOS_DE_ASEO_PERSONAL: 'Toiletries',
    INGLES: 'English Spoken',
    SERVICIOS_DE_CONSERJERIA: 'Concierge Service',
    SALA_DE_CONFERENCIAS: 'Conference Room',
    'PARRILLA(S)_PARA_BARBACOA(S)': 'Barbecue Facilities',
    TELEVISION_POR_CABLE: 'Cable TV',
    TELEVISOR_CON_PANTALLA_PLANA: 'Flat-Screen TV',
    MEDIDAS_DE_DESINFECCION_ADICIONALES: 'Extra Disinfection Measures',
    MEDIDAS_ADICIONALES_CONTRA_LA_COVID_19: 'Additional COVID-19 Measures',
    ASISTENCIA_PARA_TOURS: 'Tour Assistance',
    ASISTENCIA_PARA_RESERVAS: 'Booking Assistance',
    CAFE_TE_PARA_LOS_HUESPEDES: 'Coffee/Tea for Guests',
    CHECK_IN_CHECK_OUT_RAPIDO: 'Express Check-In/Out',
    CENTRO_DE_NEGOCIOS: 'Business Centre',
    TELEFONO: 'Telephone',
    BOTIQUIN_DE_PRIMEROS_AUXILIOS: 'First Aid Kit',
    PERIODICOS: 'Newspapers',
    'NO_ESTA_PERMITIDO_FUMAR_(ESPACIOS_COMPARTIDOS_NI_PRIVADOS)': 'Entirely Non-Smoking',
    HORNO_DE_MICROONDAS: 'Microwave',
    CAMBIO_DE_DIVISAS: 'Currency Exchange',
    PERSONAL_PLURILINGUE: 'Multilingual Staff',
    DUCHA_BANERA: 'Shower/Bathtub',
    CONTROL_DE_TEMPERATURA_PARA_LOS_HUESPEDES: 'Temperature Control for Guests',
    CONTROL_DE_TEMPERATURA_PARA_EL_PERSONAL: 'Temperature Control for Staff',
    COCINA_COMUN: 'Shared Kitchen',
    DETECTOR_DE_HUMOS: 'Smoke Detector',
    INSTALACIONES_PARA_REUNIONES_Y_PRESENTACIONES: 'Meeting and Presentation Facilities',
    ZONA_DE_COMPRAS_EN_LAS_INSTALACIONES: 'On-Site Shopping',
    ALQUILER_DE_COCHES: 'Car Rental',
    CAJERO_AUTOMATICO: 'ATM',
    TOALLAS_DE_PLAYA_PISCINA: 'Beach/Pool Towels',
    CAFETERIA: 'Cafe',
    ARMARIO_CLOSET: 'Wardrobe/Closet',
    EQUIPO_DE_PROTECCION_PERSONAL_PARA_LOS_HUESPEDES: 'PPE for Guests',
    ZONA_DE_BRONCEADO: 'Sun Terrace',
    ZONA_PARA_PICNICS: 'Picnic Area',

    // Italian
    CAMERE_NON_FUMATORI: 'Non-Smoking Rooms',
    "ARTICOLI_PER_L'IGIENE_PERSONALE": 'Toiletries',
    COLAZIONE: 'Breakfast',
    CAFFE_TE_PER_GLI_OSPITI: 'Coffee/Tea for Guests',
    BANCOMAT: 'ATM',
    CAMBIO_VALUTA: 'Currency Exchange',
    GIORNALI: 'Newspapers',
    SHOPPING_IN_LOCO: 'On-Site Shopping',
    NEGOZIO_DI_SOUVENIR: 'Souvenir Shop',

    // Dutch
    TELEVISIE_IN_DE_LOBBY: 'TV in Lobby',
    'ALLE_RUIMTES_NIET_ROKEN_(OPENBAAR_EN_PRIVE)': 'Entirely Non-Smoking',

    // English the supplier sends with inconsistent punctuation
    'NON-SMOKING_ROOMS': 'Non-Smoking Rooms',
    NON_SMOKING_ROOMS: 'Non-Smoking Rooms',
    'ALL_SPACES_NON_SMOKING_(PUBLIC_AND_PRIVATE)': 'Entirely Non-Smoking',
};

/**
 * The one key shape OTV_AMENITY_MAP is indexed by.
 *
 * Both directions must agree on it: `otvCodeToLabel` looking up a supplier code, and
 * `normalizeStoredAmenity` reversing a label that the prettifier already produced. They
 * disagreed — the first did not collapse spaces — so a supplier sending spaced text
 * missed entries the map already contained.
 */
function toAmenityKey(raw: string): string {
    return raw
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents (Cyrillic й/ё decompose too)
        .toUpperCase()
        .replace(/[«»""‹›]/g, '')  // typographic quotes, e.g. «звонок будильник»
        .replace(/[\s/-]+/g, '_')  // spaces, slashes and hyphens → underscore
        .replace(/_+/g, '_')       // collapse runs
        .replace(/^_|_$/g, '');    // trim
}

/** Convert an OTV amenity code to a display label. Unknown codes are prettified. */
export function otvCodeToLabel(code: string | null | undefined): string {
    if (!code) return '';
    const upper = code.toUpperCase().trim();
    if (OTV_AMENITY_MAP[upper]) return OTV_AMENITY_MAP[upper];

    // Look up the canonical form as well. OTV sends the same amenity as a code
    // (`ARIA_CONDIZIONATA`) *and* as spaced text (`Aria Condizionata`), and only the
    // first matched — the second uppercased to `ARIA CONDIZIONATA`, missed a map that
    // already held the underscored key, and fell through to the prettifier below.
    // That is why Italian and German reached the property page while the dictionary
    // had known those words all along. Same normalisation normalizeStoredAmenity uses,
    // so both directions agree on one key shape.
    const canonical = toAmenityKey(upper);
    if (OTV_AMENITY_MAP[canonical]) return OTV_AMENITY_MAP[canonical];

    // Still unmapped. Prettify — but note this is how "GepäCklagerung" reached the
    // property page: `\b\w` treats an accented letter as a word boundary, so it
    // capitalised the character *after* every accent. Match Unicode letters instead,
    // and only uppercase one that actually follows a separator or starts the string.
    return upper
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .replace(/(^|[\s/(-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Re-translates already-stored amenity display strings that were prettified
 * from non-English codes (e.g. "Aire Acondicionado" → "Air Conditioning").
 * Reverses the fallback prettifier through `toAmenityKey`, the one key shape both
 * directions share, then looks up in the map. A label the map does not know still
 * gets its mangled capitalisation repaired.
 */
// ─── ETG room-level amenity slugs ─────────────────────────────────────────────

/**
 * Maps ETG (WorldOTA/RateHawk) room_amenities slug strings to user-facing labels.
 * Slugs come from hotel/info room_groups[].room_amenities — lowercase hyphen-separated.
 */
export const ETG_ROOM_AMENITY_MAP: Record<string, string> = {
    // Bathroom
    'private-bathroom':     'Private Bathroom',
    'shared-bathroom':      'Shared Bathroom',
    'shower':               'Shower',
    'bath':                 'Bathtub',
    'bathtub':              'Bathtub',
    'bidet':                'Bidet',
    'jacuzzi':              'Jacuzzi',
    'hot-tub':              'Hot Tub',

    // Sleeping
    'sofa-bed':             'Sofa Bed',
    'extra-bed':            'Extra Bed',

    // Climate
    'air-conditioning':     'Air Conditioning',
    'fan':                  'Fan',
    'heating':              'Heating',
    'fireplace':            'Fireplace',

    // Entertainment
    'tv':                   'TV',
    'cable-tv':             'Cable TV',
    'satellite-tv':         'Satellite TV',
    'dvd-player':           'DVD Player',

    // Connectivity
    'wi-fi':                'WiFi',
    'wifi':                 'WiFi',
    'telephone':            'Telephone',

    // Kitchen / Food
    'kitchen':              'Kitchen',
    'kitchenette':          'Kitchenette',
    'fridge':               'Refrigerator',
    'minibar':              'Minibar',
    'microwave':            'Microwave',
    'dishwasher':           'Dishwasher',
    'washing-machine':      'Washing Machine',
    'kettle':               'Kettle',
    'coffee':               'Coffee Machine',
    'coffee-machine':       'Coffee Machine',
    'tea-or-coffee':        'Coffee & Tea',
    'toaster':              'Toaster',
    'oven':                 'Oven',
    'stove':                'Stove',

    // In-room items
    'hairdryer':            'Hair Dryer',
    'hair-dryer':           'Hair Dryer',
    'iron':                 'Iron',
    'ironing-board':        'Ironing Board',
    'safe':                 'In-Room Safe',
    'desk':                 'Work Desk',
    'wardrobe':             'Wardrobe',
    'mirror':               'Vanity Mirror',
    'sofa':                 'Sofa',
    'seating-area':         'Seating Area',
    'dining-area':          'Dining Area',
    'alarm-clock':          'Alarm Clock',

    // Toiletries & linens
    'toiletries':           'Toiletries',
    'towels':               'Towels',
    'slippers':             'Slippers',
    'bathrobe':             'Bathrobe',
    'linens':               'Bed Linen',

    // Outdoor / view
    'balcony':              'Balcony',
    'terrace':              'Terrace',
    'patio':                'Patio',
    'garden-view':          'Garden View',
    'city-view':            'City View',
    'sea-view':             'Sea View',
    'pool-view':            'Pool View',
    'mountain-view':        'Mountain View',
    'river-view':           'River View',

    // Policy
    'non-smoking':          'Non-Smoking',
    'smoking':              'Smoking Allowed',
    'pet-friendly':         'Pets Allowed',

    // Accessibility
    'wheelchair-accessible': 'Wheelchair Accessible',
};

/** Convert an ETG room amenity slug to a display label. Unknown slugs are prettified. */
export function etgRoomAmenityToLabel(slug: string): string {
    if (!slug) return '';
    const mapped = ETG_ROOM_AMENITY_MAP[slug.toLowerCase()];
    if (mapped) return mapped;
    // Fallback: capitalize words, replace hyphens with spaces
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Turn whatever `hotel_content.amenities` holds into display labels.
 *
 * The column is heterogeneous by history: some rows hold plain strings that were
 * prettified from a non-English supplier code ("Aire Acondicionado", Cyrillic
 * entries), others hold `{ code }` objects straight from TGX. Returned raw, the
 * first kind renders in Spanish or Russian on an English page.
 *
 * Mirrors what v1 does in `fetchPropertyData` before returning a property.
 */
export function normalizeAmenityList(raw: unknown): string[] {
    // `hotel_content.amenities` is jsonb in two shapes: a real array, and — for rows
    // written double-encoded — a JSON *string* containing the array. `Array.isArray`
    // is false for exactly the rows that have data, so this returned nothing and the
    // caller silently fell back to un-normalised live supplier text. That fallback is
    // how untranslated German and Italian reached the property page while the amenity
    // map had known those words all along. Migration `20260901000001` repaired the
    // stored rows; this accepts both shapes so a survivor cannot reopen the hole.
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? normalizeAmenityList(parsed) : [];
        } catch {
            return [];
        }
    }
    if (!Array.isArray(raw)) return [];
    return raw
        .flatMap((a: any) =>
            typeof a === 'string'
                ? [normalizeStoredAmenity(a)]
                : a?.code
                    ? [otvCodeToLabel(a.code)]
                    : [],
        )
        .filter(Boolean);
}

export function normalizeStoredAmenity(label: string): string {
    if (!label) return label;
    const mapped = OTV_AMENITY_MAP[toAmenityKey(label)];
    if (mapped) return mapped;
    // Unmapped: repair the mangled capitalisation the old prettifier left behind
    // ("GepäCklagerung", "RecepcióN") so an untranslated label is at least not broken.
    return label.replace(/(\p{L})(\p{Lu})/gu, (m, prev, up) =>
        /[\p{Lu}]/u.test(prev) ? m : prev + up.toLowerCase());
}
