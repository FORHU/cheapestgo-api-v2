/** Map district/borough/neighbourhood names to the canonical city TGX can resolve.
 *  Keyed by ISO-2 countryCode → { subName (lowercase) → canonicalCity }.
 *  Used in both autocomplete (to remap district suggestions) and the stream route
 *  (as a safety-net for direct API calls that bypass the autocomplete). */
export const CITY_ALIASES: Record<string, Record<string, string>> = {
    // ── North America ──────────────────────────────────────────────────────────
    US: {
        // New York City
        'manhattan': 'New York', 'brooklyn': 'New York', 'queens': 'New York',
        'bronx': 'New York', 'the bronx': 'New York', 'staten island': 'New York',
        'harlem': 'New York', 'lower east side': 'New York', 'tribeca': 'New York',
        'greenwich village': 'New York', 'east village': 'New York', 'west village': 'New York',
        'williamsburg': 'New York', 'dumbo': 'New York', 'red hook': 'New York',
        'park slope': 'New York', 'crown heights': 'New York', 'bed-stuy': 'New York',
        'bushwick': 'New York', 'astoria': 'New York', 'long island city': 'New York',
        'flushing': 'New York', 'upper east side': 'New York', 'upper west side': 'New York',
        'midtown': 'New York', 'chelsea': 'New York', "hell's kitchen": 'New York',
        'financial district': 'New York', 'battery park': 'New York', 'soho': 'New York',
        'noho': 'New York', 'nolita': 'New York', 'murray hill': 'New York',
        'gramercy': 'New York', 'flatiron': 'New York', 'kips bay': 'New York',
        'inwood': 'New York', 'washington heights': 'New York', 'morningside heights': 'New York',
        'riverdale': 'New York', 'flatbush': 'New York', 'coney island': 'New York',
        'bensonhurst': 'New York', 'sunset park': 'New York', 'bay ridge': 'New York',
        'ridgewood': 'New York', 'jackson heights': 'New York', 'jamaica': 'New York',
        // Los Angeles
        'hollywood': 'Los Angeles', 'beverly hills': 'Los Angeles', 'santa monica': 'Los Angeles',
        'venice': 'Los Angeles', 'west hollywood': 'Los Angeles', 'culver city': 'Los Angeles',
        'malibu': 'Los Angeles', 'brentwood': 'Los Angeles', 'bel air': 'Los Angeles',
        'westwood': 'Los Angeles', 'century city': 'Los Angeles', 'downtown la': 'Los Angeles',
        'arts district': 'Los Angeles', 'echo park': 'Los Angeles', 'silver lake': 'Los Angeles',
        'los feliz': 'Los Angeles', 'koreatown': 'Los Angeles', 'studio city': 'Los Angeles',
        'sherman oaks': 'Los Angeles', 'burbank': 'Los Angeles', 'glendale': 'Los Angeles',
        'pasadena': 'Los Angeles', 'pacific palisades': 'Los Angeles', 'playa vista': 'Los Angeles',
        'manhattan beach': 'Los Angeles', 'redondo beach': 'Los Angeles', 'hermosa beach': 'Los Angeles',
        'long beach': 'Los Angeles', 'inglewood': 'Los Angeles',
        // Chicago
        'magnificent mile': 'Chicago', 'wicker park': 'Chicago', 'lincoln park': 'Chicago',
        'the loop': 'Chicago', 'river north': 'Chicago', 'streeterville': 'Chicago',
        'gold coast chicago': 'Chicago', 'old town chicago': 'Chicago', 'lakeview': 'Chicago',
        'wrigleyville': 'Chicago', 'bucktown': 'Chicago', 'logan square': 'Chicago',
        'pilsen': 'Chicago', 'hyde park chicago': 'Chicago', 'bridgeport': 'Chicago',
        'andersonville': 'Chicago', 'rogers park': 'Chicago', 'ukranian village': 'Chicago',
        // San Francisco
        'the mission': 'San Francisco', 'fishermans wharf': 'San Francisco',
        'haight ashbury': 'San Francisco', 'castro': 'San Francisco',
        'soma': 'San Francisco', 'financial district sf': 'San Francisco',
        'nob hill sf': 'San Francisco', 'pacific heights': 'San Francisco',
        'noe valley': 'San Francisco', 'sunset sf': 'San Francisco',
        'richmond sf': 'San Francisco', 'tenderloin': 'San Francisco',
        'civic center sf': 'San Francisco', 'presidio': 'San Francisco',
        'marina sf': 'San Francisco', 'dogpatch': 'San Francisco',
        'potrero hill': 'San Francisco', 'bernal heights': 'San Francisco',
        // Miami
        'miami beach': 'Miami', 'south beach': 'Miami', 'brickell': 'Miami',
        'wynwood': 'Miami', 'little havana': 'Miami', 'coconut grove': 'Miami',
        'downtown miami': 'Miami', 'edgewater miami': 'Miami', 'midtown miami': 'Miami',
        'design district miami': 'Miami', 'coral gables': 'Miami', 'key biscayne': 'Miami',
        'aventura': 'Miami', 'bal harbour': 'Miami', 'surfside': 'Miami',
        // Washington DC
        'national mall': 'Washington DC', 'capitol hill': 'Washington DC',
        'georgetown': 'Washington DC', 'dupont circle': 'Washington DC',
        'adams morgan': 'Washington DC', 'columbia heights dc': 'Washington DC',
        'logan circle': 'Washington DC', 'navy yard': 'Washington DC',
        'shaw dc': 'Washington DC', 'u street': 'Washington DC',
        'woodley park': 'Washington DC', 'foggy bottom': 'Washington DC',
        'farragut': 'Washington DC', 'anacostia': 'Washington DC',
        // Boston
        'back bay': 'Boston', 'beacon hill': 'Boston', 'south end boston': 'Boston',
        'north end boston': 'Boston', 'cambridge': 'Boston', 'somerville': 'Boston',
        'fenway': 'Boston', 'allston': 'Boston', 'brighton': 'Boston',
        'jamaica plain': 'Boston', 'charlestown boston': 'Boston', 'south boston': 'Boston',
        'east boston': 'Boston', 'roxbury': 'Boston', 'dorchester': 'Boston',
        // Seattle
        'capitol hill seattle': 'Seattle', 'belltown': 'Seattle', 'pioneer square seattle': 'Seattle',
        'fremont seattle': 'Seattle', 'ballard': 'Seattle', 'queen anne': 'Seattle',
        'south lake union': 'Seattle', 'wallingford': 'Seattle', 'university district seattle': 'Seattle',
        'green lake': 'Seattle', 'columbia city': 'Seattle', 'beacon hill seattle': 'Seattle',
        // New Orleans
        'french quarter': 'New Orleans', 'garden district': 'New Orleans', 'marigny': 'New Orleans',
        'treme': 'New Orleans', 'bywater': 'New Orleans', 'uptown new orleans': 'New Orleans',
        'mid-city new orleans': 'New Orleans', 'algiers': 'New Orleans',
        // Las Vegas
        'the strip': 'Las Vegas', 'fremont street': 'Las Vegas',
        'downtown las vegas': 'Las Vegas', 'paradise': 'Las Vegas', 'henderson': 'Las Vegas',
        // Austin
        'south congress': 'Austin', 'sixth street': 'Austin',
        'east austin': 'Austin', 'domain austin': 'Austin', 'barton hills': 'Austin',
        // Nashville
        'the gulch': 'Nashville', 'east nashville': 'Nashville', '12 south': 'Nashville',
        'germantown nashville': 'Nashville', 'hillsboro village': 'Nashville',
        'sylvan park': 'Nashville', 'downtown nashville': 'Nashville',
        // Atlanta
        'midtown atlanta': 'Atlanta', 'buckhead': 'Atlanta', 'virginia-highland': 'Atlanta',
        'little five points': 'Atlanta', 'inman park': 'Atlanta', 'cabbagetown': 'Atlanta',
        'grant park atlanta': 'Atlanta', 'east atlanta': 'Atlanta', 'west midtown atlanta': 'Atlanta',
        // Denver
        'lodo': 'Denver', 'capitol hill denver': 'Denver', 'rino': 'Denver',
        'cherry creek': 'Denver', 'washington park': 'Denver', 'highlands denver': 'Denver',
        'baker denver': 'Denver', 'five points denver': 'Denver',
        // Dallas
        'uptown dallas': 'Dallas', 'deep ellum': 'Dallas', 'bishop arts': 'Dallas',
        'design district dallas': 'Dallas', 'oak cliff': 'Dallas', 'downtown dallas': 'Dallas',
        // Houston
        'midtown houston': 'Houston', 'montrose': 'Houston', 'heights houston': 'Houston',
        'museum district houston': 'Houston', 'rice village': 'Houston',
        'river oaks': 'Houston', 'downtown houston': 'Houston', 'galleria houston': 'Houston',
        // San Diego
        'gaslamp quarter': 'San Diego', 'pacific beach': 'San Diego', 'ocean beach': 'San Diego',
        'north park': 'San Diego', 'hillcrest': 'San Diego', 'la jolla': 'San Diego',
        'mission hills': 'San Diego', 'little italy san diego': 'San Diego',
        'mission valley': 'San Diego', 'old town san diego': 'San Diego',
        // Portland
        'pearl district': 'Portland', 'alberta': 'Portland', 'mississippi portland': 'Portland',
        'hawthorne': 'Portland', 'division portland': 'Portland', 'nob hill portland': 'Portland',
        'southeast portland': 'Portland', 'north portland': 'Portland',
        // Minneapolis
        'uptown minneapolis': 'Minneapolis', 'warehouse district minneapolis': 'Minneapolis',
        'northeast minneapolis': 'Minneapolis', 'north loop': 'Minneapolis',
        // Phoenix / Scottsdale
        'old town scottsdale': 'Scottsdale', 'scottsdale old town': 'Scottsdale',
        'tempe': 'Phoenix', 'mesa': 'Phoenix', 'chandler': 'Phoenix',
        'downtown phoenix': 'Phoenix', 'midtown phoenix': 'Phoenix',
        // Orlando
        'international drive': 'Orlando', 'lake buena vista': 'Orlando',
        'kissimmee': 'Orlando', 'winter park orlando': 'Orlando', 'downtown orlando': 'Orlando',
        // Tampa / St Petersburg
        'ybor city': 'Tampa', 'channelside': 'Tampa', 'soho tampa': 'Tampa',
        'hyde park tampa': 'Tampa', 'seminole heights': 'Tampa', 'downtown tampa': 'Tampa',
        'st pete beach': 'Saint Petersburg', 'downtown st pete': 'Saint Petersburg',
        // Fort Lauderdale
        'las olas': 'Fort Lauderdale', 'downtown fort lauderdale': 'Fort Lauderdale',
        // Jacksonville FL
        'san marco jacksonville': 'Jacksonville', 'avondale jacksonville': 'Jacksonville',
        // Honolulu / Oahu
        'waikiki': 'Honolulu', 'downtown honolulu': 'Honolulu', 'chinatown honolulu': 'Honolulu',
        'ala moana': 'Honolulu', 'kailua oahu': 'Honolulu', 'manoa': 'Honolulu',
        // Maui
        'lahaina': 'Maui', 'kaanapali': 'Maui', 'wailea maui': 'Maui',
        'kihei': 'Maui', 'paia maui': 'Maui', 'makawao': 'Maui',
        // Big Island Hawaii
        'kailua kona': 'Kailua-Kona', 'hilo city': 'Hilo', 'waikoloa': 'Waikoloa',
        // Kauai
        'poipu': 'Lihue', 'princeville kauai': 'Lihue', 'kapaa': 'Lihue', 'hanalei': 'Lihue',
        // Philadelphia
        'fishtown': 'Philadelphia', 'old city philly': 'Philadelphia',
        'rittenhouse square': 'Philadelphia', 'center city philly': 'Philadelphia',
        'northern liberties': 'Philadelphia', 'south philly': 'Philadelphia',
        'east passyunk': 'Philadelphia', 'manayunk': 'Philadelphia',
        'university city philly': 'Philadelphia', 'graduate hospital': 'Philadelphia',
        // Baltimore
        'inner harbor': 'Baltimore', 'fells point': 'Baltimore', 'canton baltimore': 'Baltimore',
        'federal hill baltimore': 'Baltimore', 'mount vernon baltimore': 'Baltimore',
        'hampden': 'Baltimore', 'remington': 'Baltimore',
        // Pittsburgh
        'strip district': 'Pittsburgh', 'lawrenceville pittsburgh': 'Pittsburgh',
        'shadyside': 'Pittsburgh', 'squirrel hill': 'Pittsburgh',
        'south side pittsburgh': 'Pittsburgh', 'bloomfield pittsburgh': 'Pittsburgh',
        'north shore pittsburgh': 'Pittsburgh',
        // San Antonio
        'river walk': 'San Antonio', 'king william': 'San Antonio',
        'pearl district sa': 'San Antonio', 'downtown san antonio': 'San Antonio',
        'alamo heights': 'San Antonio',
        // Salt Lake City
        'downtown slc': 'Salt Lake City', 'sugarhouse': 'Salt Lake City',
        'the avenues slc': 'Salt Lake City',
        // Park City UT
        'park city downtown': 'Park City',
        // Sedona AZ
        'sedona uptown': 'Sedona', 'tlaquepaque sedona': 'Sedona',
        // Flagstaff AZ
        'downtown flagstaff': 'Flagstaff',
        // Kansas City
        'power and light kc': 'Kansas City', 'crossroads kc': 'Kansas City',
        'country club plaza': 'Kansas City', 'westport kc': 'Kansas City',
        // St Louis
        'soulard': 'St. Louis', 'the grove stl': 'St. Louis',
        'central west end': 'St. Louis', 'downtown st louis': 'St. Louis',
        'lafayette square stl': 'St. Louis',
        // Indianapolis
        'broad ripple': 'Indianapolis', 'mass ave indy': 'Indianapolis',
        'fountain square indy': 'Indianapolis',
        // Columbus OH
        'short north': 'Columbus', 'german village columbus': 'Columbus',
        'italian village columbus': 'Columbus', 'clintonville': 'Columbus',
        // Cincinnati
        'over-the-rhine': 'Cincinnati', 'hyde park cincinnati': 'Cincinnati',
        'mount adams': 'Cincinnati', 'oakley': 'Cincinnati',
        // Louisville
        'nulu': 'Louisville', 'bardstown road': 'Louisville', 'old louisville': 'Louisville',
        // Memphis
        'beale street': 'Memphis', 'south main memphis': 'Memphis',
        'midtown memphis': 'Memphis', 'cooper young': 'Memphis',
        // Raleigh / Durham / Chapel Hill
        'glenwood south': 'Raleigh', 'downtown raleigh': 'Raleigh',
        'downtown durham': 'Durham', 'ninth street durham': 'Durham',
        // Charlotte
        'uptown charlotte': 'Charlotte', 'noda': 'Charlotte',
        'south end charlotte': 'Charlotte', 'plaza midwood': 'Charlotte',
        'dilworth': 'Charlotte',
        // Richmond VA
        'the fan': 'Richmond', 'scott s addition richmond': 'Richmond',
        'carytown': 'Richmond', 'shockoe bottom': 'Richmond',
        // Detroit
        'midtown detroit': 'Detroit', 'corktown': 'Detroit',
        'greektown detroit': 'Detroit', 'eastern market': 'Detroit',
        // Cleveland
        'ohio city': 'Cleveland', 'tremont cleveland': 'Cleveland',
        'university circle': 'Cleveland',
        // Sacramento
        'midtown sacramento': 'Sacramento', 'east sacramento': 'Sacramento',
        // San Jose CA
        'santana row': 'San Jose', 'downtown san jose': 'San Jose', 'willow glen': 'San Jose',
        // Oakland
        'grand lake': 'Oakland', 'rockridge': 'Oakland', 'temescal': 'Oakland',
        'fruitvale': 'Oakland', 'jack london square': 'Oakland',
        // Napa / Wine Country
        'napa downtown': 'Napa', 'yountville': 'Napa', 'st helena': 'Napa',
        'healdsburg': 'Santa Rosa',
        // Santa Barbara CA
        'state street sb': 'Santa Barbara', 'santa barbara waterfront': 'Santa Barbara',
        // Monterey / Carmel CA
        'cannery row': 'Monterey', 'pacific grove': 'Monterey', 'carmel village': 'Monterey',
        // Albuquerque
        'old town albuquerque': 'Albuquerque', 'nob hill abq': 'Albuquerque',
        // Tucson AZ
        'downtown tucson': 'Tucson', '4th avenue tucson': 'Tucson',
        // Savannah GA
        'historic district savannah': 'Savannah', 'forsyth park': 'Savannah',
        // Asheville NC
        'downtown asheville': 'Asheville', 'west asheville': 'Asheville',
        // Charleston SC
        'french quarter charleston': 'Charleston', 'lower king charleston': 'Charleston',
        'the battery charleston': 'Charleston',
        // Jackson Hole WY
        'jackson hole town': 'Jackson', 'town square jackson': 'Jackson',
        // Boise ID
        'downtown boise': 'Boise', 'north end boise': 'Boise',
        // Omaha NE
        'old market omaha': 'Omaha',
        // Oklahoma City
        'bricktown okc': 'Oklahoma City',
        // Madison WI
        'state street madison': 'Madison',
        // Anchorage AK
        'downtown anchorage': 'Anchorage',
    },
    CA: {
        // British Columbia
        'victoria bc': 'Victoria', 'victoria city bc': 'Victoria', 'james bay victoria': 'Victoria',
        'kelowna city': 'Kelowna', 'kelowna waterfront': 'Kelowna',
        'whistler village': 'Whistler',
        'kamloops city': 'Kamloops',
        // Saskatchewan
        'downtown saskatoon': 'Saskatoon', 'riversdale': 'Saskatoon',
        'downtown regina': 'Regina',
        // Manitoba extras
        'the forks': 'Winnipeg', 'osborne village': 'Winnipeg',
        // Atlantic Canada
        'downtown fredericton': 'Fredericton',
        'downtown charlottetown': 'Charlottetown',
        // Newfoundland
        'downtown st johns nl': "St. John's",
        'gastown': 'Vancouver', 'yaletown': 'Vancouver', 'kitsilano': 'Vancouver',
        'west end': 'Vancouver', 'granville island': 'Vancouver',
        'mount pleasant vancouver': 'Vancouver', 'commercial drive': 'Vancouver',
        'strathcona': 'Vancouver', 'chinatown vancouver': 'Vancouver',
        'fairview vancouver': 'Vancouver', 'riley park': 'Vancouver',
        'yorkville': 'Toronto', 'distillery district': 'Toronto', 'king west': 'Toronto',
        'kensington market': 'Toronto', 'annex': 'Toronto', 'queen west': 'Toronto',
        'roncesvalles': 'Toronto', 'leslieville': 'Toronto', 'little italy toronto': 'Toronto',
        'greektown toronto': 'Toronto', 'the junction': 'Toronto', 'corktown': 'Toronto',
        'st lawrence': 'Toronto', 'harbourfront toronto': 'Toronto', 'entertainment district toronto': 'Toronto',
        'old montreal': 'Montreal', 'plateau': 'Montreal', 'mile end': 'Montreal',
        'griffintown': 'Montreal', 'rosemont': 'Montreal', 'villeray': 'Montreal',
        'hochelaga': 'Montreal', 'petite-patrie': 'Montreal', 'outremont': 'Montreal',
        'westmount': 'Montreal', 'ndg': 'Montreal', 'cote-des-neiges': 'Montreal',
        'old quebec': 'Quebec City', 'saint-roch': 'Quebec City',
        'downtown calgary': 'Calgary', 'beltline calgary': 'Calgary', 'inglewood calgary': 'Calgary',
        'kensington calgary': 'Calgary', 'mission calgary': 'Calgary',
        'whyte ave': 'Edmonton', 'old strathcona': 'Edmonton',
        'downtown ottawa': 'Ottawa', 'byward market': 'Ottawa', 'glebe': 'Ottawa',
        'downtown winnipeg': 'Winnipeg', 'exchange district': 'Winnipeg',
        'north end halifax': 'Halifax', 'south end halifax': 'Halifax',
    },
    MX: {
        'polanco': 'Mexico City', 'condesa': 'Mexico City', 'roma': 'Mexico City',
        'coyoacan': 'Mexico City', 'zona rosa': 'Mexico City', 'santa fe': 'Mexico City',
        'napoles': 'Mexico City', 'del valle': 'Mexico City', 'narvarte': 'Mexico City',
        'juarez cdmx': 'Mexico City', 'tepito': 'Mexico City', 'centro historico cdmx': 'Mexico City',
        'xochimilco': 'Mexico City', 'tlalpan': 'Mexico City', 'pedregal': 'Mexico City',
        'hotel zone': 'Cancun', 'zona hotelera': 'Cancun', 'downtown cancun': 'Cancun',
        'quinta avenida': 'Playa del Carmen', '5th avenue': 'Playa del Carmen',
        'centro playa': 'Playa del Carmen',
        'old guadalajara': 'Guadalajara', 'chapultepec guadalajara': 'Guadalajara',
        'tlaquepaque': 'Guadalajara', 'zona minerva': 'Guadalajara',
        'tecnologico': 'Monterrey', 'san pedro garza garcia': 'Monterrey', 'barrio antiguo': 'Monterrey',
        'tulum town': 'Tulum', 'la veleta': 'Tulum', 'aldea zama': 'Tulum',
        'sayulita': 'Puerto Vallarta', 'old town pv': 'Puerto Vallarta', 'zona romantica': 'Puerto Vallarta',
        'bucerias': 'Puerto Vallarta', 'punta de mita': 'Puerto Vallarta',
        // Oaxaca
        'oaxaca centro': 'Oaxaca', 'jalatlaco': 'Oaxaca', 'xochimilco oaxaca': 'Oaxaca',
        // San Miguel de Allende
        'san miguel centro': 'San Miguel de Allende', 'parroquia area': 'San Miguel de Allende',
        // Los Cabos
        'cabo san lucas': 'Los Cabos', 'san jose del cabo': 'Los Cabos',
        'corridor cabo': 'Los Cabos', 'medano beach': 'Los Cabos',
        // Merida
        'paseo de montejo': 'Merida', 'merida centro': 'Merida', 'santa ana merida': 'Merida',
        // Puerto Escondido
        'zicatela': 'Puerto Escondido', 'la punta mexico': 'Puerto Escondido',
        // Huatulco
        'tangolunda': 'Huatulco', 'la crucecita': 'Huatulco',
        // Mazatlan
        'old mazatlan': 'Mazatlan', 'zona dorada mazatlan': 'Mazatlan',
        // San Cristobal de las Casas
        'san cristobal centro': 'San Cristobal de las Casas',
        // Guanajuato
        'guanajuato centro': 'Guanajuato',
        // Queretaro
        'queretaro centro': 'Queretaro',
        // Puebla
        'puebla centro': 'Puebla', 'barrio de artistas': 'Puebla',
        // Veracruz
        'veracruz malecon': 'Veracruz',
        // Acapulco
        'acapulco costera': 'Acapulco',
    },
    // ── South America ──────────────────────────────────────────────────────────
    BR: {
        'copacabana': 'Rio de Janeiro', 'ipanema': 'Rio de Janeiro', 'leblon': 'Rio de Janeiro',
        'barra da tijuca': 'Rio de Janeiro', 'lapa': 'Rio de Janeiro',
        'santa teresa': 'Rio de Janeiro', 'botafogo': 'Rio de Janeiro', 'flamengo': 'Rio de Janeiro',
        'urca': 'Rio de Janeiro', 'gavea': 'Rio de Janeiro', 'jardim botanico': 'Rio de Janeiro',
        'glorio': 'Rio de Janeiro', 'centro rio': 'Rio de Janeiro', 'tijuca': 'Rio de Janeiro',
        'jardins': 'Sao Paulo', 'pinheiros': 'Sao Paulo', 'moema': 'Sao Paulo',
        'vila olimpia': 'Sao Paulo', 'itaim bibi': 'Sao Paulo', 'liberdade': 'Sao Paulo',
        'consolacao': 'Sao Paulo', 'higienopolis': 'Sao Paulo', 'brooklin': 'Sao Paulo',
        'perdizes': 'Sao Paulo', 'vila madalena': 'Sao Paulo', 'bela vista': 'Sao Paulo',
        'bom retiro': 'Sao Paulo', 'centro sp': 'Sao Paulo',
        'savassi': 'Belo Horizonte', 'funcionarios': 'Belo Horizonte',
        'pelourinho': 'Salvador', 'barra salvador': 'Salvador',
        // Fortaleza
        'meireles': 'Fortaleza', 'iracema': 'Fortaleza', 'aldeota': 'Fortaleza',
        // Recife / Olinda
        'boa viagem': 'Recife', 'olinda old town': 'Olinda',
        // Florianopolis
        'lagoa da conceicao': 'Florianopolis', 'jurerere': 'Florianopolis',
        'jurere internacional': 'Florianopolis', 'centro floripa': 'Florianopolis',
        // Curitiba
        'batel': 'Curitiba', 'bairro alto curitiba': 'Curitiba',
        // Manaus
        'centro manaus': 'Manaus',
        // Natal
        'ponta negra natal': 'Natal',
        // Foz do Iguacu
        'foz do iguacu': 'Foz do Iguacu',
        // Gramado
        'gramado centro': 'Gramado',
        // Buzios
        'orla bardot': 'Buzios',
        // Paraty
        'paraty centro': 'Paraty',
        // Angra dos Reis
        'angra dos reis centro': 'Angra dos Reis',
    },
    AR: {
        'palermo': 'Buenos Aires', 'recoleta': 'Buenos Aires', 'san telmo': 'Buenos Aires',
        'puerto madero': 'Buenos Aires', 'microcentro': 'Buenos Aires', 'belgrano': 'Buenos Aires',
        'villa crespo': 'Buenos Aires', 'caballito': 'Buenos Aires', 'flores': 'Buenos Aires',
        'colegiales': 'Buenos Aires', 'nunez': 'Buenos Aires', 'almagro': 'Buenos Aires',
        'boedo': 'Buenos Aires', 'la boca': 'Buenos Aires', 'villa del parque': 'Buenos Aires',
        // Mendoza
        'mendoza city centre': 'Mendoza', 'chacras de coria': 'Mendoza',
        // Bariloche
        'bariloche centro': 'Bariloche', 'lago nahuel huapi': 'Bariloche',
        // Cordoba Argentina
        'nueva cordoba': 'Cordoba', 'general paz cordoba': 'Cordoba',
        // Salta
        'salta centro': 'Salta',
        // Puerto Madryn / Patagonia
        'puerto madryn city': 'Puerto Madryn',
        // El Calafate / Perito Moreno
        'el calafate city': 'El Calafate',
        // Ushuaia
        'ushuaia city': 'Ushuaia',
        // Iguazu
        'puerto iguazu': 'Puerto Iguazu',
    },
    CL: {
        'las condes': 'Santiago', 'providencia': 'Santiago', 'vitacura': 'Santiago',
        'barrio italia': 'Santiago', 'bellavista': 'Santiago', 'nunooa': 'Santiago',
        'miraflores santiago': 'Santiago', 'centro santiago': 'Santiago', 'lastarria': 'Santiago',
        'cerro alegre': 'Valparaiso', 'cerro concepcion': 'Valparaiso',
    },
    CO: {
        'chapinero': 'Bogota', 'zona rosa bogota': 'Bogota', 'usaquen': 'Bogota',
        'la candelaria': 'Bogota', 'teusaquillo': 'Bogota', 'el poblado': 'Medellin',
        'laureles': 'Medellin', 'envigado': 'Medellin', 'bello': 'Medellin',
        'getsemani': 'Cartagena', 'centro historico cartagena': 'Cartagena',
        'bocagrande': 'Cartagena', 'manga': 'Cartagena',
        // Santa Marta
        'rodadero': 'Santa Marta', 'santa marta old town': 'Santa Marta',
        'taganga': 'Santa Marta',
        // Cali
        'el poblado cali': 'Cali', 'granada cali': 'Cali', 'san antonio cali': 'Cali',
        // Salento / Coffee Region
        'salento colombia': 'Salento', 'quindio': 'Armenia',
        // Barranquilla
        'el prado barranquilla': 'Barranquilla',
        // San Andres Island
        'san andres city': 'San Andres',
    },
    PE: {
        'miraflores': 'Lima', 'barranco': 'Lima', 'san isidro': 'Lima', 'surco': 'Lima',
        'la molina': 'Lima', 'magdalena': 'Lima', 'pueblo libre': 'Lima',
        'lince': 'Lima', 'san borja': 'Lima', 'jesus maria': 'Lima',
        'central lima': 'Lima', 'callao': 'Lima',
        // Cusco / Machu Picchu
        'cusco san blas': 'Cusco', 'cusco plaza': 'Cusco', 'san pedro cusco': 'Cusco',
        'aguas calientes': 'Aguas Calientes', 'machu picchu pueblo': 'Aguas Calientes',
        // Arequipa
        'arequipa city centre': 'Arequipa', 'yanahuara': 'Arequipa',
        // Puno / Lake Titicaca
        'puno city': 'Puno', 'lake titicaca area': 'Puno',
        // Iquitos
        'iquitos city': 'Iquitos',
        // Trujillo
        'trujillo centro': 'Trujillo',
    },
    EC: {
        'la mariscal': 'Quito', 'la carolina': 'Quito', 'cumbaya': 'Quito',
        'malecon simon bolivar': 'Guayaquil', 'las penas': 'Guayaquil',
    },
    UY: {
        'pocitos': 'Montevideo', 'ciudad vieja': 'Montevideo', 'punta carretas': 'Montevideo',
        'punta del este downtown': 'Punta del Este',
    },
    // ── Europe ─────────────────────────────────────────────────────────────────
    GB: {
        'westminster': 'London', 'soho': 'London', 'chelsea': 'London',
        'kensington': 'London', 'mayfair': 'London', 'camden': 'London',
        'shoreditch': 'London', 'canary wharf': 'London', 'greenwich': 'London',
        'notting hill': 'London', 'covent garden': 'London', 'brixton': 'London',
        'islington': 'London', 'hackney': 'London', 'bethnal green': 'London',
        'elephant and castle': 'London', 'south bank': 'London', 'city of london': 'London',
        'bermondsey': 'London', 'peckham': 'London', 'dulwich': 'London',
        'crystal palace': 'London', 'stratford': 'London', 'east london': 'London',
        'angel': 'London', 'clerkenwell': 'London', 'farringdon': 'London',
        'holborn': 'London', 'bloomsbury': 'London', 'fitzrovia': 'London',
        'marylebone': 'London', 'paddington': 'London', 'bayswater': 'London',
        'shepherd s bush': 'London', 'hammersmith': 'London', 'fulham': 'London',
        'putney': 'London', 'wimbledon': 'London', 'richmond': 'London',
        'twickenham': 'London', 'kingston': 'London', 'croydon': 'London',
        'northern quarter': 'Manchester', 'ancoats': 'Manchester', 'spinningfields': 'Manchester',
        'salford': 'Manchester', 'didsbury': 'Manchester', 'chorlton': 'Manchester',
        'castlefield': 'Manchester', 'deansgate': 'Manchester',
        'old town edinburgh': 'Edinburgh', 'new town edinburgh': 'Edinburgh',
        'leith': 'Edinburgh', 'stockbridge': 'Edinburgh', 'morningside': 'Edinburgh',
        'west end edinburgh': 'Edinburgh',
        'merchant city': 'Glasgow', 'west end glasgow': 'Glasgow', 'southside glasgow': 'Glasgow',
        'jewellery quarter': 'Birmingham', 'digbeth': 'Birmingham', 'edgbaston': 'Birmingham',
        'broad street birmingham': 'Birmingham',
        'harbourside': 'Bristol', 'clifton': 'Bristol', 'stokes croft': 'Bristol',
        'bedminster': 'Bristol',
        'headingley': 'Leeds', 'chapel allerton': 'Leeds', 'holbeck urban village': 'Leeds',
        'city centre sheffield': 'Sheffield', 'kelham island': 'Sheffield',
        // Liverpool
        'ropewalks': 'Liverpool', 'albert dock': 'Liverpool', 'city centre liverpool': 'Liverpool',
        'baltic triangle': 'Liverpool', 'waterloo liverpool': 'Liverpool',
        'kensington liverpool': 'Liverpool',
        // Newcastle / Gateshead
        'jesmond': 'Newcastle', 'quayside newcastle': 'Newcastle', 'ouseburn': 'Newcastle',
        'grainger town': 'Newcastle', 'gateshead quays': 'Gateshead',
        // Brighton & Hove
        'north laine': 'Brighton', 'the lanes brighton': 'Brighton', 'kemptown': 'Brighton',
        'hove': 'Brighton', 'seven dials brighton': 'Brighton',
        // Cardiff
        'cardiff bay': 'Cardiff', 'roath': 'Cardiff', 'pontcanna': 'Cardiff',
        'canton cardiff': 'Cardiff', 'cathays': 'Cardiff',
        // Oxford
        'jericho': 'Oxford', 'cowley road': 'Oxford', 'summertown': 'Oxford',
        'oxford city centre': 'Oxford',
        // Cambridge
        'mill road cambridge': 'Cambridge', 'newnham': 'Cambridge',
        'cambridge city centre': 'Cambridge',
        // York
        'the shambles': 'York', 'york city centre': 'York',
        // Nottingham
        'hockley': 'Nottingham', 'lace market': 'Nottingham', 'hockley village': 'Nottingham',
        // Leicester
        'golden mile leicester': 'Leicester', 'de montfort': 'Leicester',
        // Exeter
        'exeter city centre': 'Exeter',
        // Norwich
        'norwich lanes': 'Norwich',
        // Swansea / Wales
        'swansea city centre': 'Swansea',
        // Belfast
        'cathedral quarter belfast': 'Belfast', 'titanic quarter': 'Belfast',
        'queen s quarter': 'Belfast',
    },
    FR: {
        'montmartre': 'Paris', 'le marais': 'Paris', 'saint-germain': 'Paris',
        'latin quarter': 'Paris', 'bastille': 'Paris', 'pigalle': 'Paris',
        'champs elysees': 'Paris', 'opera': 'Paris', 'republique': 'Paris',
        'belleville': 'Paris', 'oberkampf': 'Paris', 'batignolles': 'Paris',
        'canal saint-martin': 'Paris', 'nation': 'Paris', 'vincennes': 'Paris',
        'boulogne-billancourt': 'Paris', 'neuilly': 'Paris', 'levallois': 'Paris',
        'saint-ouen': 'Paris', 'montreuil': 'Paris', 'pantin': 'Paris',
        'vieux port': 'Marseille', 'le panier': 'Marseille', 'castellane': 'Marseille',
        'joliette': 'Marseille', 'corniche marseille': 'Marseille',
        'presquile': 'Lyon', 'croix rousse': 'Lyon', 'vieux lyon': 'Lyon',
        'confluence': 'Lyon', 'part-dieu': 'Lyon',
        'vieux nice': 'Nice', 'promenade des anglais': 'Nice', 'cimiez': 'Nice',
        'cours mirabeau': 'Aix-en-Provence',
        'saint-pierre': 'Bordeaux', 'chartrons': 'Bordeaux', 'bacalan': 'Bordeaux',
        'grande ile': 'Strasbourg', 'krutenau': 'Strasbourg',
        'ile feydeau': 'Nantes', 'bouffay': 'Nantes',
        'saint-malo old town': 'Saint-Malo',
        // Toulouse
        'capitole toulouse': 'Toulouse', 'saint-aubin toulouse': 'Toulouse',
        'carmes toulouse': 'Toulouse', 'compans toulouse': 'Toulouse',
        // Cannes
        'la croisette': 'Cannes', 'suquet': 'Cannes', 'le cannet': 'Cannes',
        // Monaco
        'monte carlo': 'Monaco', 'port hercule monaco': 'Monaco',
        // Montpellier
        'ecusson': 'Montpellier', 'antigone': 'Montpellier',
        // Rennes
        'rennes city center': 'Rennes', 'thabor': 'Rennes',
        // Tours
        'tours old town': 'Tours',
        // Lille
        'vieux lille': 'Lille', 'euralille': 'Lille',
        // Annecy
        'annecy old town': 'Annecy', 'annecy lake': 'Annecy',
        // Grenoble
        'bastille grenoble': 'Grenoble',
        // Dijon
        'dijon old town': 'Dijon',
        // Avignon
        'avignon old town': 'Avignon', 'avignon intramuros': 'Avignon',
        // Perpignan
        'perpignan city centre': 'Perpignan',
        // Biarritz
        'grande plage biarritz': 'Biarritz', 'biarritz centre': 'Biarritz',
    },
    ES: {
        'gothic quarter': 'Barcelona', 'gotico': 'Barcelona', 'el born': 'Barcelona',
        'gracia': 'Barcelona', 'eixample': 'Barcelona', 'barceloneta': 'Barcelona',
        'poblenou': 'Barcelona', 'raval': 'Barcelona', 'montjuic': 'Barcelona',
        'sarria': 'Barcelona', 'les corts': 'Barcelona', 'gaudi': 'Barcelona',
        'sant andreu': 'Barcelona', 'clot': 'Barcelona', 'glories': 'Barcelona',
        'malasana': 'Madrid', 'chueca': 'Madrid', 'lavapies': 'Madrid',
        'retiro': 'Madrid', 'salamanca madrid': 'Madrid', 'sol': 'Madrid',
        'arganzuela': 'Madrid', 'chamberi': 'Madrid', 'usera': 'Madrid',
        'carabanchel': 'Madrid', 'vallecas': 'Madrid', 'leganes': 'Madrid',
        'santa cruz': 'Seville', 'triana': 'Seville', 'arenal': 'Seville',
        'nervion': 'Seville', 'alameda': 'Seville',
        'albaicin': 'Granada', 'realejo': 'Granada', 'sacromonte': 'Granada',
        'ruzafa': 'Valencia', 'el carmen': 'Valencia', 'cabanyal': 'Valencia',
        'benimaclet': 'Valencia', 'l eixample valencia': 'Valencia',
        'casco viejo bilbao': 'Bilbao', 'abando': 'Bilbao', 'deusto': 'Bilbao',
        'parte vieja': 'San Sebastian', 'gros': 'San Sebastian', 'centro donostia': 'San Sebastian',
        'old town malaga': 'Malaga', 'soho malaga': 'Malaga', 'teatinos': 'Malaga',
        'palma old town': 'Palma de Mallorca', 'santa catalina': 'Palma de Mallorca',
        // Ibiza
        'ibiza old town': 'Ibiza', 'dalt vila': 'Ibiza', 'playa d en bossa': 'Ibiza',
        'ses salines ibiza': 'Ibiza', 'santa eulalia': 'Ibiza',
        // Mallorca (non-Palma areas)
        'alcudia': 'Alcudia', 'port de pollenca': 'Pollensa', 'magaluf': 'Palma de Mallorca',
        'can picafort': 'Alcudia',
        // Menorca
        'ciutadella': 'Ciutadella', 'es migjorn gran': 'Mahon', 'fornells': 'Mahon',
        // Tenerife
        'playa de las americas': 'Tenerife', 'los cristianos': 'Tenerife',
        'puerto de la cruz tenerife': 'Tenerife', 'santa cruz tenerife': 'Tenerife', 'santa cruz de tenerife': 'Tenerife',
        'costa adeje': 'Tenerife', 'el medano': 'Tenerife',
        // Gran Canaria
        'playa del ingles': 'Las Palmas de Gran Canaria', 'maspalomas': 'Las Palmas de Gran Canaria',
        'puerto rico gran canaria': 'Las Palmas de Gran Canaria',
        // Lanzarote
        'puerto del carmen': 'Arrecife', 'puerto calero': 'Arrecife',
        // Fuerteventura
        'corralejo': 'Puerto del Rosario', 'costa calma': 'Puerto del Rosario',
        // Costa del Sol
        'marbella old town': 'Marbella', 'puerto banus': 'Marbella',
        'estepona old town': 'Estepona', 'nerja centro': 'Nerja',
        'fuengirola': 'Fuengirola', 'benalmadena': 'Benalmadena',
        // Asturias
        'oviedo old town': 'Oviedo', 'gijon waterfront': 'Gijon',
        // Salamanca
        'salamanca city centre': 'Salamanca',
        // Toledo
        'toledo old town': 'Toledo',
        // Cordoba
        'juderia cordoba': 'Cordoba', 'mezquita area': 'Cordoba',
    },
    IT: {
        // Rome — centro storico / tourist core
        'trastevere': 'Rome', 'vatican': 'Rome', 'prati': 'Rome',
        'testaccio': 'Rome', 'pigneto': 'Rome', 'monti': 'Rome',
        'parioli': 'Rome', 'esquilino': 'Rome', 'ostiense': 'Rome',
        'garbatella': 'Rome', 'flaminio': 'Rome',
        'navona': 'Rome', 'campo de fiori': 'Rome', 'campo dei fiori': 'Rome',
        'borgo': 'Rome', 'aventino': 'Rome', 'celio': 'Rome',
        'centro storico rome': 'Rome', 'colosseo': 'Rome',
        // Rome — residential & outer districts
        'ottavia': 'Rome', 'trionfale': 'Rome', 'aurelio': 'Rome',
        'monteverde': 'Rome', 'portuense': 'Rome', 'trullo': 'Rome',
        'marconi': 'Rome', 'eur': 'Rome', 'appio': 'Rome',
        'appio claudio': 'Rome', 'tuscolano': 'Rome', 'casilino': 'Rome',
        'prenestino': 'Rome', 'centocelle': 'Rome', 'torpignattara': 'Rome',
        'tiburtino': 'Rome', 'san lorenzo rome': 'Rome',
        'nomentano': 'Rome', 'salario': 'Rome', 'africano': 'Rome',
        'coppede': 'Rome', 'balduina': 'Rome', 'vigna clara': 'Rome',
        'navigli': 'Milan', 'brera': 'Milan', 'porta nuova': 'Milan',
        'isola': 'Milan', 'porta venezia': 'Milan', 'magenta': 'Milan',
        'centro storico milan': 'Milan', 'duomo area': 'Milan', 'ticinese': 'Milan',
        'porta romana': 'Milan', 'città studi': 'Milan', 'loreto': 'Milan',
        'cannaregio': 'Venice', 'dorsoduro': 'Venice', 'san polo': 'Venice',
        'castello venice': 'Venice', 'giudecca': 'Venice', 'mestre': 'Venice',
        'lido di venezia': 'Venice',
        'oltrarno': 'Florence', 'santa croce': 'Florence', 'san giovanni': 'Florence',
        'san marco florence': 'Florence', 'santa maria novella': 'Florence',
        'spaccanapoli': 'Naples', 'chiaia': 'Naples', 'posillipo': 'Naples',
        'vomero': 'Naples', 'quartieri spagnoli': 'Naples', 'piazza garibaldi naples': 'Naples',
        'centro storico naples': 'Naples',
        'quadrilatero romano': 'Turin', 'san salvario': 'Turin', 'vanchiglia': 'Turin',
        'cit turin': 'Turin', 'aurora': 'Turin',
        'quadrilatero': 'Bologna', 'bolognina': 'Bologna', 'porto bologna': 'Bologna',
        'centro storico genoa': 'Genoa', 'boccadasse': 'Genoa',
        'catania city center': 'Catania', 'centro storico palermo': 'Palermo',
        // Verona
        'verona centro': 'Verona', 'veronetta': 'Verona', 'isolo verona': 'Verona',
        // Siena
        'il campo': 'Siena', 'siena old town': 'Siena',
        // Lecce
        'lecce old town': 'Lecce', 'lecce barocca': 'Lecce',
        // Bari
        'bari vecchia': 'Bari', 'bari centro': 'Bari',
        // Catania extras
        'catania pescheria': 'Catania',
        // Palermo extras
        'ballarò': 'Palermo', 'vucciria': 'Palermo', 'mondello': 'Palermo',
        'politeama': 'Palermo',
        // Taormina
        'taormina centro': 'Taormina',
        // Cinque Terre (nearest TGX city is La Spezia)
        'riomaggiore': 'La Spezia', 'manarola': 'La Spezia', 'corniglia': 'La Spezia',
        'vernazza': 'La Spezia', 'monterosso': 'La Spezia',
        // Amalfi Coast / Sorrentine Peninsula
        'positano': 'Positano', 'amalfi town': 'Amalfi', 'ravello': 'Ravello',
        'sorrento centro': 'Sorrento', 'sorrento old town': 'Sorrento',
        // Rimini
        'rimini old town': 'Rimini', 'rimini marina centro': 'Rimini',
        // Ferrara
        'ferrara old town': 'Ferrara',
        // Modena
        'modena centro': 'Modena',
        // Trieste
        'trieste old town': 'Trieste', 'borgo teresiano': 'Trieste',
        // Perugia
        'perugia centro': 'Perugia',
        // Assisi
        'assisi centro': 'Assisi',
        // Orvieto
        'orvieto centro': 'Orvieto',
        // Bergamo
        'bergamo alta': 'Bergamo', 'citta alta bergamo': 'Bergamo',
        // Como
        'como city centre': 'Como', 'como waterfront': 'Como',
        // Alghero (Sardinia)
        'alghero old town': 'Alghero',
        // Cagliari (Sardinia)
        'castello cagliari': 'Cagliari',
        // Agrigento (Valley of Temples)
        'valley of the temples': 'Agrigento',
        // Pisa
        'campo dei miracoli': 'Pisa', 'pisa centro': 'Pisa',
        // Lucca
        'lucca old town': 'Lucca', 'lucca intramuros': 'Lucca',
    },
    DE: {
        'mitte': 'Berlin', 'kreuzberg': 'Berlin', 'prenzlauer berg': 'Berlin',
        'friedrichshain': 'Berlin', 'charlottenburg': 'Berlin', 'schoneberg': 'Berlin',
        'neukölln': 'Berlin', 'steglitz': 'Berlin', 'tempelhof': 'Berlin',
        'spandau': 'Berlin', 'wedding': 'Berlin', 'reinickendorf': 'Berlin',
        'treptow': 'Berlin', 'pankow': 'Berlin', 'lichtenberg': 'Berlin',
        'marzahn': 'Berlin', 'tiergarten berlin': 'Berlin', 'wilmersdorf': 'Berlin',
        'schwabing': 'Munich', 'maxvorstadt': 'Munich', 'glockenbachviertel': 'Munich',
        'bogenhausen': 'Munich', 'haidhausen': 'Munich', 'giesing': 'Munich',
        'nymphenburg': 'Munich', 'neuhausen': 'Munich', 'lehel': 'Munich',
        'altstadt hamburg': 'Hamburg', 'hafencity': 'Hamburg', 'eppendorf': 'Hamburg',
        'altona': 'Hamburg', 'eimsbüttel': 'Hamburg', 'winterhude': 'Hamburg',
        'rotherbaum': 'Hamburg', 'st pauli': 'Hamburg', 'barmbek': 'Hamburg',
        'sachsenhausen': 'Frankfurt', 'bornheim': 'Frankfurt', 'nordend': 'Frankfurt',
        'westend frankfurt': 'Frankfurt', 'bockenheim': 'Frankfurt', 'bahnhofsviertel': 'Frankfurt',
        'innenstadt frankfurt': 'Frankfurt',
        'altstadt cologne': 'Cologne', 'ehrenfeld': 'Cologne', 'nippes': 'Cologne',
        'sülz': 'Cologne', 'lindenthal': 'Cologne',
        'altstadt düsseldorf': 'Dusseldorf', 'friedrichstadt duss': 'Dusseldorf',
        'gerresheim': 'Dusseldorf', 'pempelfort': 'Dusseldorf',
        'bohnenviertel': 'Stuttgart', 'west stuttgart': 'Stuttgart', 'bad cannstatt': 'Stuttgart',
        'sebald': 'Nuremberg', 'lorenz': 'Nuremberg', 'gostenhof': 'Nuremberg',
        'connewitz': 'Leipzig', 'gohlis': 'Leipzig', 'plagwitz': 'Leipzig',
        'neustadt dresden': 'Dresden', 'altstadt dresden': 'Dresden',
        // Heidelberg
        'altstadt heidelberg': 'Heidelberg', 'neuenheim': 'Heidelberg',
        // Freiburg im Breisgau
        'altstadt freiburg': 'Freiburg im Breisgau', 'wiehre': 'Freiburg im Breisgau',
        // Regensburg
        'altstadt regensburg': 'Regensburg',
        // Trier
        'trier city centre': 'Trier',
        // Mainz
        'mainz altstadt': 'Mainz',
        // Wiesbaden
        'wiesbaden city centre': 'Wiesbaden',
        // Hannover
        'hannover mitte': 'Hannover', 'linden hannover': 'Hannover',
        // Augsburg
        'augsburg altstadt': 'Augsburg',
        // Kiel
        'kiel city centre': 'Kiel',
        // Lubeck
        'lubeck altstadt': 'Lubeck',
        // Rostock
        'rostock warnemunde': 'Rostock',
        // Erfurt
        'erfurt altstadt': 'Erfurt',
        // Weimar
        'weimar city centre': 'Weimar',
        // Bamberg
        'bamberg altstadt': 'Bamberg',
        // Rothenburg
        'rothenburg ob der tauber': 'Rothenburg ob der Tauber',
        // Garmisch / Bavaria
        'garmisch-partenkirchen': 'Garmisch-Partenkirchen',
        // Oberstdorf
        'oberstdorf village': 'Oberstdorf',
    },
    NL: {
        'jordaan': 'Amsterdam', 'de pijp': 'Amsterdam', 'centrum': 'Amsterdam',
        'oud west': 'Amsterdam', 'east amsterdam': 'Amsterdam', 'westerpark': 'Amsterdam',
        'oud-oost': 'Amsterdam', 'noord amsterdam': 'Amsterdam', 'nieuw-west': 'Amsterdam',
        'buitenveldert': 'Amsterdam', 'zuidas': 'Amsterdam', 'rivierenbuurt': 'Amsterdam',
        'centrum rotterdam': 'Rotterdam', 'kop van zuid': 'Rotterdam', 'katendrecht': 'Rotterdam',
        'witte de withstraat': 'Rotterdam',
        'centrum den haag': 'The Hague', 'scheveningen': 'The Hague', 'bezuidenhout': 'The Hague',
        'oudwijk': 'Utrecht', 'lombok': 'Utrecht',
    },
    PT: {
        'alfama': 'Lisbon', 'bairro alto': 'Lisbon', 'belem': 'Lisbon',
        'chiado': 'Lisbon', 'mouraria': 'Lisbon', 'intendente': 'Lisbon',
        'avenidas novas': 'Lisbon', 'campo de ourique': 'Lisbon', 'santos': 'Lisbon',
        'alcantara': 'Lisbon', 'bica': 'Lisbon', 'principe real': 'Lisbon',
        'graça': 'Lisbon', 'estrela': 'Lisbon', 'campolide': 'Lisbon',
        'ribeira': 'Porto', 'vila nova de gaia': 'Porto', 'boavista': 'Porto',
        'bonfim': 'Porto', 'cedofeita': 'Porto', 'miragaia': 'Porto',
        'foz do douro': 'Porto',
        'albufeira old town': 'Albufeira', 'oura': 'Albufeira', 'falesia': 'Albufeira',
        'vilamoura': 'Vilamoura', 'quarteira': 'Vilamoura',
        'praia da rocha': 'Portimao', 'alvor': 'Portimao',
        'lagos algarve': 'Lagos', 'meia praia': 'Lagos',
        'tavira old town': 'Tavira',
        'faro old town': 'Faro',
    },
    GR: {
        'plaka': 'Athens', 'monastiraki': 'Athens', 'kolonaki': 'Athens',
        'psiri': 'Athens', 'thissio': 'Athens', 'exarchia': 'Athens',
        'gazi': 'Athens', 'koukaki': 'Athens', 'petralona': 'Athens',
        'glyfada': 'Athens', 'vouliagmeni': 'Athens', 'piraeus': 'Athens',
        'oia': 'Santorini', 'fira': 'Santorini', 'imerovigli': 'Santorini',
        'akrotiri': 'Santorini', 'perivolos': 'Santorini',
        'mykonos town': 'Mykonos', 'little venice': 'Mykonos', 'ornos': 'Mykonos',
        'platys gialos': 'Mykonos', 'psarou': 'Mykonos',
        'old town rhodes': 'Rhodes', 'ixia': 'Rhodes', 'faliraki': 'Rhodes',
        'hersonissos': 'Heraklion', 'chania old town': 'Chania', 'elounda': 'Agios Nikolaos',
        'agios nikolaos crete': 'Agios Nikolaos',
        'corfu town': 'Corfu', 'paleokastritsa': 'Corfu', 'dassia': 'Corfu',
        // Thessaloniki
        'ladadika': 'Thessaloniki', 'ano poli': 'Thessaloniki',
        'thessaloniki city centre': 'Thessaloniki', 'white tower': 'Thessaloniki',
        // Zakynthos
        'zakynthos town': 'Zakynthos', 'laganas': 'Zakynthos', 'navagio area': 'Zakynthos',
        'tsilivi': 'Zakynthos',
        // Kefalonia
        'argostoli': 'Kefalonia', 'fiskardo': 'Kefalonia', 'skala kefalonia': 'Kefalonia',
        'lixouri': 'Kefalonia',
        // Paros
        'naoussa paros': 'Paros', 'parikia': 'Paros', 'golden beach paros': 'Paros',
        // Naxos
        'naxos town': 'Naxos', 'agios prokopios': 'Naxos',
        // Skiathos
        'skiathos town': 'Skiathos', 'koukounaries': 'Skiathos',
        // Lefkada
        'lefkada town': 'Lefkada', 'nidri': 'Lefkada', 'agios nikitas': 'Lefkada',
        // Lesbos (Mytilene)
        'mytilini': 'Lesbos', 'molyvos': 'Lesbos', 'petra lesbos': 'Lesbos',
        // Samos
        'samos town': 'Samos', 'kokkari': 'Samos', 'pythagoreio': 'Samos',
        // Kos
        'kos town': 'Kos', 'kardamena': 'Kos', 'kefalos': 'Kos',
        // Chalkidiki / Halkidiki
        'kassandra': 'Thessaloniki', 'sithonia': 'Thessaloniki',
        // Patras
        'patras city': 'Patras',
        // Delphi
        'delphi village': 'Arachova',
        // Meteora
        'kalambaka': 'Kalambaka',
        // Hydra
        'hydra town': 'Hydra',
        // Spetses
        'spetses town': 'Spetses',
    },
    CZ: {
        'old town': 'Prague', 'mala strana': 'Prague', 'vinohrady': 'Prague',
        'zizkov': 'Prague', 'josefov': 'Prague', 'nove mesto': 'Prague',
        'holesovice': 'Prague', 'dejvice': 'Prague', 'smichov': 'Prague',
        'nusle': 'Prague', 'zbraslav': 'Prague',
    },
    PL: {
        'old town warsaw': 'Warsaw', 'praga': 'Warsaw', 'srodmiescie': 'Warsaw',
        'mokotow': 'Warsaw', 'ursynow': 'Warsaw', 'zoliborz': 'Warsaw',
        'wola': 'Warsaw', 'wlochy': 'Warsaw',
        'kazimierz': 'Krakow', 'stare miasto': 'Krakow', 'podgorze': 'Krakow',
        'krowodrza': 'Krakow', 'nowa huta': 'Krakow',
        'wrzeszcz': 'Gdansk', 'old town gdansk': 'Gdansk', 'oliwa': 'Gdansk',
        'jelitkow': 'Gdansk',
    },
    HU: {
        'buda': 'Budapest', 'pest': 'Budapest', 'castle district': 'Budapest',
        'jewish quarter': 'Budapest', 'erzsebetvaros': 'Budapest',
        'belvaros': 'Budapest', 'lipotvaros': 'Budapest', 'terezvaros': 'Budapest',
        'jozsefvaros': 'Budapest', 'ferencvaros': 'Budapest', 'ujpest': 'Budapest',
        'obuda': 'Budapest',
    },
    RU: {
        'arbat': 'Moscow', 'red square': 'Moscow', 'kitay gorod': 'Moscow',
        'tverskaya': 'Moscow', 'zamoskvorechye': 'Moscow', 'chistye prudy': 'Moscow',
        'patriarshy ponds': 'Moscow', 'khamovniki': 'Moscow',
        'nevsky prospekt': 'Saint Petersburg', 'vasilievsky island': 'Saint Petersburg',
        'petrogradsky': 'Saint Petersburg', 'vyborg side': 'Saint Petersburg',
        'sennaya': 'Saint Petersburg',
    },
    // ── Middle East ────────────────────────────────────────────────────────────
    AE: {
        'marina': 'Dubai', 'dubai marina': 'Dubai', 'jbr': 'Dubai',
        'deira': 'Dubai', 'bur dubai': 'Dubai', 'downtown dubai': 'Dubai',
        'jlt': 'Dubai', 'palm jumeirah': 'Dubai', 'difc': 'Dubai',
        'jumeirah': 'Dubai', 'business bay': 'Dubai', 'al quoz': 'Dubai',
        'creek': 'Dubai', 'festival city': 'Dubai', 'international city': 'Dubai',
        'al barsha': 'Dubai', 'motor city': 'Dubai', 'silicon oasis': 'Dubai',
        'mirdif': 'Dubai', 'rashidiya': 'Dubai', 'karama': 'Dubai',
        'satwa': 'Dubai', 'oud metha': 'Dubai', 'al nahda dubai': 'Dubai',
        'downtown abu dhabi': 'Abu Dhabi', 'corniche abu dhabi': 'Abu Dhabi',
        'al reem island': 'Abu Dhabi', 'yas island': 'Abu Dhabi', 'saadiyat island': 'Abu Dhabi',
        'al maryah island': 'Abu Dhabi', 'khalidiyah': 'Abu Dhabi',
        'sharjah city center': 'Sharjah',
    },
    TR: {
        'sultanahmet': 'Istanbul', 'taksim': 'Istanbul', 'beyoglu': 'Istanbul',
        'kadikoy': 'Istanbul', 'besiktas': 'Istanbul', 'eminonu': 'Istanbul',
        'galata': 'Istanbul', 'sisli': 'Istanbul', 'uskudar': 'Istanbul',
        'cihangir': 'Istanbul', 'balat': 'Istanbul', 'fatih': 'Istanbul',
        'bakirkoy': 'Istanbul', 'florya': 'Istanbul', 'levent': 'Istanbul',
        'etiler': 'Istanbul', 'bebek': 'Istanbul', 'ortakoy': 'Istanbul',
        'arnavutkoy': 'Istanbul', 'bosphorus': 'Istanbul',
        'kalkan': 'Kalkan', 'kas': 'Kas', 'fethiye center': 'Fethiye',
        'oludeniz': 'Fethiye', 'antalya old town': 'Antalya', 'konyaalti': 'Antalya',
        'lara beach': 'Antalya', 'bodrum peninsula': 'Bodrum', 'yalikavak': 'Bodrum',
        'turgutreis': 'Bodrum', 'bitez': 'Bodrum',
    },
    IL: {
        'jaffa': 'Tel Aviv', 'yafo': 'Tel Aviv', 'neve tzedek': 'Tel Aviv',
        'florentin': 'Tel Aviv', 'rothschild': 'Tel Aviv', 'dizengoff': 'Tel Aviv',
        'north tel aviv': 'Tel Aviv', 'ramat aviv': 'Tel Aviv', 'bat yam': 'Tel Aviv',
        'old city': 'Jerusalem', 'city center jerusalem': 'Jerusalem', 'nahlaot': 'Jerusalem',
        'german colony': 'Jerusalem', 'mamilla': 'Jerusalem',
    },
    QA: {
        'west bay': 'Doha', 'the pearl': 'Doha', 'lusail': 'Doha',
        'katara': 'Doha', 'msheireb': 'Doha', 'corniche doha': 'Doha',
        'old airport doha': 'Doha', 'al sadd': 'Doha', 'al waab': 'Doha',
    },
    SA: {
        'al olaya': 'Riyadh', 'malaz': 'Riyadh', 'diplomatic quarter': 'Riyadh',
        'king fahd road': 'Riyadh', 'exit 7': 'Riyadh', 'al wurud': 'Riyadh',
        'al balad': 'Jeddah', 'corniche jeddah': 'Jeddah', 'al hamra': 'Jeddah',
        'al rawdah': 'Jeddah', 'obhur': 'Jeddah',
        'madinah center': 'Medina',
    },
    JO: {
        'rainbow street': 'Amman', 'abdoun': 'Amman', 'shmeisani': 'Amman',
        'sweifieh': 'Amman', 'downtown amman': 'Amman', 'jabal amman': 'Amman',
        'wadi musa': 'Petra',
    },
    LB: {
        'hamra': 'Beirut', 'mar mikhael': 'Beirut', 'gemmayzeh': 'Beirut',
        'ashrafieh': 'Beirut', 'downtown beirut': 'Beirut', 'verdun': 'Beirut',
        'jnah': 'Beirut',
    },
    // ── Africa ─────────────────────────────────────────────────────────────────
    EG: {
        'zamalek': 'Cairo', 'maadi': 'Cairo', 'garden city': 'Cairo',
        'downtown cairo': 'Cairo', 'islamic cairo': 'Cairo',
        'giza': 'Cairo', 'dokki': 'Cairo', 'mohandessin': 'Cairo',
        'heliopolis': 'Cairo', 'nasr city': 'Cairo', 'rehab city': 'Cairo',
        'new cairo': 'Cairo', '5th settlement': 'Cairo',
        'stanley': 'Alexandria', 'miami alexandria': 'Alexandria', 'raml station': 'Alexandria',
        'el montaza': 'Alexandria', 'sidi bishr': 'Alexandria',
    },
    MA: {
        'medina': 'Marrakech', 'gueliz': 'Marrakech', 'hivernage': 'Marrakech',
        'palmeraie': 'Marrakech', 'mellah': 'Marrakech',
        'fez el bali': 'Fez', 'fes medina': 'Fez', 'fes el jdid': 'Fez',
        'ain diab': 'Casablanca', 'maarif': 'Casablanca', 'anfa': 'Casablanca',
        'ville nouvelle': 'Casablanca',
        'agadir beach': 'Agadir', 'talborjt': 'Agadir',
        'asilah old town': 'Asilah',
        'chefchaouen old town': 'Chefchaouen',
    },
    ZA: {
        // Wine regions near Cape Town
        'stellenbosch city': 'Stellenbosch', 'franschhoek': 'Franschhoek',
        'paarl city': 'Paarl',
        // Garden Route
        'knysna quay': 'Knysna', 'plettenberg bay': 'Plettenberg Bay',
        'george city': 'George', 'mossel bay': 'Mossel Bay',
        // Kruger area
        'hazyview': 'Hazyview', 'white river': 'White River', 'hoedspruit': 'Hoedspruit',
        // Pretoria
        'hatfield': 'Pretoria', 'brooklyn pretoria': 'Pretoria', 'arcadia': 'Pretoria',
        // Durban extras
        'point road durban': 'Durban', 'morningside durban': 'Durban',
        'waterfront': 'Cape Town', 'v&a waterfront': 'Cape Town', 'bo-kaap': 'Cape Town',
        'sea point': 'Cape Town', 'camps bay': 'Cape Town', 'green point': 'Cape Town',
        'de waterkant': 'Cape Town', 'gardens': 'Cape Town', 'oranjezicht': 'Cape Town',
        'woodstock': 'Cape Town', 'observatory': 'Cape Town', 'mowbray': 'Cape Town',
        'rondebosch': 'Cape Town', 'claremont': 'Cape Town', 'constantia': 'Cape Town',
        'hout bay': 'Cape Town', 'simons town': 'Cape Town', 'muizenberg': 'Cape Town',
        'sandton': 'Johannesburg', 'rosebank': 'Johannesburg', 'melrose arch': 'Johannesburg',
        'maboneng': 'Johannesburg', 'braamfontein': 'Johannesburg', 'parktown': 'Johannesburg',
        'soweto': 'Johannesburg', 'fourways': 'Johannesburg',
        'durban beachfront': 'Durban', 'umhlanga': 'Durban', 'berea durban': 'Durban',
        'ballito': 'Durban',
    },
    KE: {
        'westlands': 'Nairobi', 'karen': 'Nairobi', 'kilimani': 'Nairobi',
        'lavington': 'Nairobi', 'gigiri': 'Nairobi', 'parklands': 'Nairobi',
        'langata': 'Nairobi', 'upperhill': 'Nairobi', 'cbd nairobi': 'Nairobi',
        'ngong road': 'Nairobi', 'kileleshwa': 'Nairobi',
        'diani': 'Mombasa', 'nyali': 'Mombasa', 'old town mombasa': 'Mombasa',
    },
    // ── Asia Pacific ───────────────────────────────────────────────────────────
    JP: {
        // Tokyo
        'shibuya': 'Tokyo', 'shinjuku': 'Tokyo', 'ginza': 'Tokyo',
        'akihabara': 'Tokyo', 'harajuku': 'Tokyo', 'roppongi': 'Tokyo',
        'asakusa': 'Tokyo', 'ueno': 'Tokyo', 'ikebukuro': 'Tokyo', 'odaiba': 'Tokyo',
        'shimokitazawa': 'Tokyo', 'nakameguro': 'Tokyo', 'ebisu': 'Tokyo',
        'daikanyama': 'Tokyo', 'jiyugaoka': 'Tokyo', 'meguro': 'Tokyo',
        'gotanda': 'Tokyo', 'osaki': 'Tokyo', 'shinagawa': 'Tokyo',
        'yurakucho': 'Tokyo', 'marunouchi': 'Tokyo', 'otemachi': 'Tokyo',
        'nihonbashi': 'Tokyo', 'kanda': 'Tokyo', 'ochanomizu': 'Tokyo',
        'tsukiji': 'Tokyo', 'toyosu': 'Tokyo', 'kiyosumi': 'Tokyo',
        'monzen-nakacho': 'Tokyo', 'koenji': 'Tokyo', 'kagurazama': 'Tokyo',
        'yanaka': 'Tokyo', 'nezu': 'Tokyo', 'nishi-ogikubo': 'Tokyo',
        'sangenjaya': 'Tokyo', 'jungumae': 'Tokyo', 'omotesando': 'Tokyo',
        'akasaka': 'Tokyo', 'toranomon': 'Tokyo', 'shimbashi': 'Tokyo',
        'ryogoku': 'Tokyo', 'asakusabashi': 'Tokyo', 'kuramae': 'Tokyo',
        // Osaka
        'namba': 'Osaka', 'dotonbori': 'Osaka', 'umeda': 'Osaka', 'shinsaibashi': 'Osaka',
        'shinsekai': 'Osaka', 'tennoji': 'Osaka', 'amerikamura': 'Osaka',
        'nakazakicho': 'Osaka', 'kyobashi': 'Osaka', 'fukushima osaka': 'Osaka',
        'namba parks': 'Osaka', 'tanimachi': 'Osaka', 'shin-osaka': 'Osaka',
        // Kyoto
        'gion': 'Kyoto', 'arashiyama': 'Kyoto', 'fushimi': 'Kyoto',
        'nishiki': 'Kyoto', 'higashiyama': 'Kyoto', 'kawaramachi': 'Kyoto',
        'pontocho': 'Kyoto', 'kinkakuji': 'Kyoto', 'fushimi inari': 'Kyoto',
        'nijo': 'Kyoto', 'kitano': 'Kyoto',
        // Sapporo
        'susukino': 'Sapporo', 'odori sapporo': 'Sapporo', 'tanukikoji': 'Sapporo',
        // Fukuoka
        'tenjin': 'Fukuoka', 'nakasu': 'Fukuoka', 'hakata': 'Fukuoka',
        'daimyo': 'Fukuoka', 'yakuin': 'Fukuoka', 'ohori': 'Fukuoka',
        // Nagoya
        'sakae': 'Nagoya', 'nagoya station area': 'Nagoya', 'osu': 'Nagoya',
        'meiekis': 'Nagoya', 'chikusa': 'Nagoya',
        // Hiroshima
        'peace memorial': 'Hiroshima', 'hiroshima city center': 'Hiroshima',
        // Nara
        'nara park': 'Nara', 'nara city centre': 'Nara',
        // Yokohama
        'minato mirai': 'Yokohama', 'chinatown yokohama': 'Yokohama', 'kannai': 'Yokohama',
        'yamashita yokohama': 'Yokohama', 'isezakicho': 'Yokohama',
        // Kobe
        'kitano kobe': 'Kobe', 'sannomiya': 'Kobe', 'motomachi': 'Kobe',
        'meriken park': 'Kobe', 'harborland kobe': 'Kobe',
        // Kamakura
        'kamakura station area': 'Kamakura', 'kita kamakura': 'Kamakura', 'enoshima': 'Kamakura',
        // Hakone
        'hakone yumoto': 'Hakone', 'gora': 'Hakone',
        // Nikko
        'nikko area': 'Nikko',
        // Kanazawa
        'higashichaya': 'Kanazawa', 'kenrokuen': 'Kanazawa', 'kanazawa city': 'Kanazawa',
        // Nagasaki
        'dejima nagasaki': 'Nagasaki', 'glover garden': 'Nagasaki',
        // Kagoshima
        'kagoshima city': 'Kagoshima',
        // Okinawa
        'naha': 'Naha', 'kokusai dori': 'Naha', 'omoromachi': 'Naha',
        'american village okinawa': 'Naha',
        // Matsumoto
        'matsumoto castle': 'Matsumoto',
        // Takayama
        'takayama old town': 'Takayama', 'sanmachi suji': 'Takayama',
        // Beppu / Onsen areas
        'beppu onsen': 'Beppu', 'yufuin': 'Yufuin',
    },
    KR: {
        // Seoul
        'gangnam': 'Seoul', 'hongdae': 'Seoul', 'myeongdong': 'Seoul',
        'itaewon': 'Seoul', 'insadong': 'Seoul', 'bukchon': 'Seoul',
        'sinchon': 'Seoul', 'dongdaemun': 'Seoul', 'mapo': 'Seoul',
        'jongno': 'Seoul', 'namsan': 'Seoul', 'apgujeong': 'Seoul',
        'cheongdam': 'Seoul', 'hannam': 'Seoul', 'yeouido': 'Seoul',
        'hapjeong': 'Seoul', 'mangwon': 'Seoul', 'seongsu': 'Seoul',
        'euljiro': 'Seoul', 'gwanghwamun': 'Seoul', 'samcheong': 'Seoul',
        'seochon': 'Seoul', 'anguk': 'Seoul', 'noryangjin': 'Seoul',
        'yeongdeungpo': 'Seoul', 'gangdong': 'Seoul', 'songpa': 'Seoul',
        'jamsil': 'Seoul', 'nowon': 'Seoul', 'dobong': 'Seoul',
        'eunpyeong': 'Seoul', 'guro': 'Seoul', 'geumcheon': 'Seoul',
        'sillim': 'Seoul', 'gwanak': 'Seoul', 'dongjak': 'Seoul',
        'wangsimni': 'Seoul', 'majang': 'Seoul', 'yongsan': 'Seoul',
        // Busan
        'seomyeon': 'Busan', 'haeundae': 'Busan', 'gwangalli': 'Busan',
        'nampodong': 'Busan', 'jagalchi': 'Busan', 'busan station area': 'Busan',
        'oncheonjang': 'Busan', 'centum city': 'Busan', 'marine city': 'Busan',
        // Jeju
        'jeju city center': 'Jeju', 'seogwipo': 'Jeju', 'hallasan': 'Jeju',
        'jungmun': 'Jeju', 'hamdeok beach': 'Jeju',
        // Gyeongju (historic city)
        'gyeongju city': 'Gyeongju', 'bulguksa': 'Gyeongju',
        // Incheon
        'songdo': 'Incheon', 'chinatown incheon': 'Incheon', 'jung-gu incheon': 'Incheon',
        // Suwon
        'suwon hwaseong': 'Suwon',
        // Jeonju
        'jeonju hanok village': 'Jeonju',
        // Sokcho / Gangwon
        'sokcho city': 'Sokcho', 'seoraksan': 'Sokcho',
        // Yeosu
        'yeosu old town': 'Yeosu',
        // Daegu
        'dongseongno': 'Daegu', 'seomun market': 'Daegu',
        // Gwangju
        'gwangju city centre': 'Gwangju',
        // Daejeon
        'daejeon city centre': 'Daejeon',
    },
    CN: {
        'pudong': 'Shanghai', 'the bund': 'Shanghai', 'bund': 'Shanghai',
        'lujiazui': 'Shanghai', 'xintiandi': 'Shanghai', 'french concession': 'Shanghai',
        "jing'an": 'Shanghai', 'xuhui': 'Shanghai', 'changning': 'Shanghai',
        'putuo': 'Shanghai', 'hongqiao': 'Shanghai', 'minhang': 'Shanghai',
        'jiading': 'Shanghai',
        'sanlitun': 'Beijing', 'wangfujing': 'Beijing', 'hutong': 'Beijing',
        'nanluoguxiang': 'Beijing', 'dashilan': 'Beijing', 'chaoyang': 'Beijing',
        'dongcheng': 'Beijing', 'xicheng': 'Beijing', 'haidian': 'Beijing',
        'shunyi': 'Beijing', 'guomao': 'Beijing', 'cbd beijing': 'Beijing',
        'houhai': 'Beijing', 'gulou': 'Beijing', 'wudaokou': 'Beijing',
        'chunxi road': 'Chengdu', 'kuanzhai alley': 'Chengdu', 'jinli': 'Chengdu',
        'tianfu': 'Chengdu', 'wuhou': 'Chengdu', 'qingyang': 'Chengdu',
        'tianhe': 'Guangzhou', 'haizhu': 'Guangzhou', 'liwan': 'Guangzhou',
        'yuexiu': 'Guangzhou', 'zhujiang new town': 'Guangzhou',
        'futian': 'Shenzhen', 'nanshan': 'Shenzhen', 'luohu': 'Shenzhen',
        'bao an': 'Shenzhen', 'longhua': 'Shenzhen',
        'gulangyu': 'Xiamen', 'siming': 'Xiamen',
        'zhongshan road': 'Nanjing', 'xuanwu': 'Nanjing',
        'binjiang': 'Hangzhou', 'xihu': 'Hangzhou', 'west lake': 'Hangzhou',
        // Xi'an
        'bell tower xian': "Xi'an", 'muslim quarter': "Xi'an", 'datang everbright': "Xi'an",
        'xian old city': "Xi'an", 'south gate xian': "Xi'an",
        // Chongqing
        'jiefangbei': 'Chongqing', 'nanan chongqing': 'Chongqing', 'hongyadong': 'Chongqing',
        'chaotianmen': 'Chongqing', 'nanbin road': 'Chongqing',
        // Suzhou
        'pingjiang road': 'Suzhou', 'suzhou old town': 'Suzhou', 'shantang street': 'Suzhou',
        // Wuhan
        'wuchang': 'Wuhan', 'hankou': 'Wuhan', 'optics valley': 'Wuhan',
        'east lake wuhan': 'Wuhan',
        // Guilin / Yangshuo
        'yangshuo': 'Guilin', 'guilin city': 'Guilin', 'li river': 'Guilin',
        // Lijiang
        'lijiang old town': 'Lijiang', 'dayan lijiang': 'Lijiang',
        // Dali
        'dali old town': 'Dali',
        // Zhangjiajie
        'wulingyuan': 'Zhangjiajie', 'tianmen mountain': 'Zhangjiajie',
        // Qingdao
        'beer street qingdao': 'Qingdao', 'old town qingdao': 'Qingdao',
        'badaguan': 'Qingdao', 'zhongshan road qingdao': 'Qingdao',
        // Harbin
        'central street harbin': 'Harbin', 'saint sophia harbin': 'Harbin',
        // Sanya (Hainan)
        'sanya bay': 'Sanya', 'dadonghai': 'Sanya', 'yalong bay': 'Sanya',
        'haitang bay': 'Sanya',
        // Zhuhai
        'gongbei': 'Zhuhai', 'xiangzhou': 'Zhuhai',
        // Kunming
        'kunming city centre': 'Kunming', 'green lake kunming': 'Kunming',
        // Huangshan (Yellow Mountain)
        'tunxi': 'Huangshan', 'huangshan city': 'Huangshan',
        // Zhouzhuang / Water Towns
        'zhouzhuang': 'Suzhou',
        // Nanjing
        'confucius temple nanjing': 'Nanjing', 'xinjiekou': 'Nanjing',
    },
    HK: {
        'kowloon': 'Hong Kong', 'tsim sha tsui': 'Hong Kong', 'mong kok': 'Hong Kong',
        'wan chai': 'Hong Kong', 'causeway bay': 'Hong Kong', 'central': 'Hong Kong',
        'sheung wan': 'Hong Kong', 'admiralty': 'Hong Kong', 'kennedy town': 'Hong Kong',
        'jordan': 'Hong Kong', 'yau ma tei': 'Hong Kong', 'sham shui po': 'Hong Kong',
        'tai po': 'Hong Kong', 'sha tin': 'Hong Kong', 'tuen mun': 'Hong Kong',
        'north point': 'Hong Kong', 'quarry bay': 'Hong Kong', 'tai koo': 'Hong Kong',
        'happy valley': 'Hong Kong', 'wong chuk hang': 'Hong Kong',
        'aberdeen': 'Hong Kong', 'ap lei chau': 'Hong Kong',
        'stanley': 'Hong Kong', 'repulse bay': 'Hong Kong', 'shek o': 'Hong Kong',
    },
    TW: {
        'ximending': 'Taipei', 'daan': 'Taipei', 'zhongzheng': 'Taipei',
        'xinyi': 'Taipei', 'zhongshan': 'Taipei', 'datong': 'Taipei',
        'songshan': 'Taipei', 'neihu': 'Taipei', 'wenshan': 'Taipei',
        'shilin': 'Taipei', 'beitou': 'Taipei', 'wanhua': 'Taipei',
    },
    SG: {
        'orchard': 'Singapore', 'marina bay': 'Singapore', 'sentosa': 'Singapore',
        'clarke quay': 'Singapore', 'chinatown': 'Singapore', 'little india': 'Singapore',
        'kampong glam': 'Singapore', 'bugis': 'Singapore', 'tanjong pagar': 'Singapore',
        'boat quay': 'Singapore', 'robertson quay': 'Singapore',
        'novena': 'Singapore', 'tiong bahru': 'Singapore', 'lavender': 'Singapore',
        'geylang': 'Singapore', 'katong': 'Singapore', 'joo chiat': 'Singapore',
        'bedok': 'Singapore', 'tampines': 'Singapore', 'pasir ris': 'Singapore',
        'woodlands': 'Singapore', 'jurong': 'Singapore', 'clementi': 'Singapore',
        'buona vista': 'Singapore', 'one-north': 'Singapore', 'harbourfront': 'Singapore',
    },
    MY: {
        'klcc': 'Kuala Lumpur', 'bukit bintang': 'Kuala Lumpur', 'bangsar': 'Kuala Lumpur',
        'chow kit': 'Kuala Lumpur', 'chinatown kl': 'Kuala Lumpur', 'mont kiara': 'Kuala Lumpur',
        'hartamas': 'Kuala Lumpur', 'damansara': 'Kuala Lumpur', 'petaling jaya': 'Kuala Lumpur',
        'subang jaya': 'Kuala Lumpur', 'sunway': 'Kuala Lumpur', 'puchong': 'Kuala Lumpur',
        'cheras kl': 'Kuala Lumpur', 'ampang': 'Kuala Lumpur', 'wangsa maju': 'Kuala Lumpur',
        'kepong': 'Kuala Lumpur', 'sentul': 'Kuala Lumpur',
        'george town': 'Penang', 'batu ferringhi': 'Penang', 'gurney drive': 'Penang',
        'georgetown penang': 'Penang', 'air itam': 'Penang', 'jelutong': 'Penang',
        'johor bahru': 'Johor Bahru', 'jb city': 'Johor Bahru', 'iskandar': 'Johor Bahru',
        'kota kinabalu waterfront': 'Kota Kinabalu', 'likas': 'Kota Kinabalu',
        'kuching waterfront': 'Kuching',
    },
    TH: {
        'sukhumvit': 'Bangkok', 'silom': 'Bangkok', 'siam': 'Bangkok',
        'pratunam': 'Bangkok', 'khao san': 'Bangkok', 'sathorn': 'Bangkok',
        'ari': 'Bangkok', 'thonglor': 'Bangkok', 'ekkamai': 'Bangkok',
        'rattanakosin': 'Bangkok', 'old city bangkok': 'Bangkok',
        'asok': 'Bangkok', 'nana': 'Bangkok', 'phrom phong': 'Bangkok',
        'phaya thai': 'Bangkok', 'victory monument': 'Bangkok', 'mo chit': 'Bangkok',
        'chatuchak': 'Bangkok', 'lad phrao': 'Bangkok', 'on nut': 'Bangkok',
        'bearing': 'Bangkok', 'udomsuk': 'Bangkok', 'bang na': 'Bangkok',
        'riverside bangkok': 'Bangkok', 'yaowarat': 'Bangkok', 'chinatown bangkok': 'Bangkok',
        'nimman': 'Chiang Mai', 'nimmanhaemin': 'Chiang Mai', 'old city chiang mai': 'Chiang Mai',
        'santitham': 'Chiang Mai', 'chang klan': 'Chiang Mai', 'night bazaar': 'Chiang Mai',
        'ping river': 'Chiang Mai',
        'patong': 'Phuket', 'kata': 'Phuket', 'karon': 'Phuket',
        'bang tao': 'Phuket', 'kamala': 'Phuket', 'surin phuket': 'Phuket',
        'rawai': 'Phuket', 'chalong': 'Phuket', 'old town phuket': 'Phuket',
        'laguna phuket': 'Phuket', 'mai khao': 'Phuket', 'nai harn': 'Phuket',
        'jomtien': 'Pattaya', 'naklua': 'Pattaya', 'north pattaya': 'Pattaya',
        'south pattaya': 'Pattaya', 'pratumnak': 'Pattaya',
        'hua hin city': 'Hua Hin', 'cha-am': 'Hua Hin',
        'chaweng': 'Koh Samui', 'lamai': 'Koh Samui', 'bophut': 'Koh Samui',
        'maenam': 'Koh Samui', 'choengmon': 'Koh Samui',
        'haad rin': 'Koh Phangan', 'thong sala': 'Koh Phangan',
        // Krabi
        'ao nang': 'Krabi', 'railay beach': 'Krabi', 'krabi town': 'Krabi',
        'klong muang': 'Krabi', 'tubkaek': 'Krabi',
        // Koh Lanta
        'klong dao': 'Koh Lanta', 'long beach koh lanta': 'Koh Lanta',
        'koh lanta old town': 'Koh Lanta',
        // Koh Tao
        'sairee beach': 'Koh Tao', 'mae haad': 'Koh Tao', 'chalok baan kao': 'Koh Tao',
        // Koh Chang
        'white sand beach koh chang': 'Koh Chang', 'lonely beach': 'Koh Chang',
        // Kanchanaburi
        'river kwai': 'Kanchanaburi', 'kanchanaburi town': 'Kanchanaburi',
        // Ayutthaya
        'ayutthaya ruins': 'Ayutthaya', 'ayutthaya historical park': 'Ayutthaya',
        // Chiang Rai
        'chiang rai city': 'Chiang Rai', 'white temple area': 'Chiang Rai',
        // Koh Phi Phi
        'phi phi island': 'Krabi',
        // Sukhothai
        'sukhothai old city': 'Sukhothai',
        // Pai
        'pai city': 'Pai',
    },
    VN: {
        'district 1': 'Ho Chi Minh City', 'ben thanh': 'Ho Chi Minh City',
        'bui vien': 'Ho Chi Minh City', 'thao dien': 'Ho Chi Minh City',
        'phu my hung': 'Ho Chi Minh City', 'district 3': 'Ho Chi Minh City',
        'district 7': 'Ho Chi Minh City', 'binh thanh': 'Ho Chi Minh City',
        'tan binh': 'Ho Chi Minh City', 'go vap': 'Ho Chi Minh City',
        'old quarter': 'Hanoi', 'hoan kiem': 'Hanoi', 'tay ho': 'Hanoi',
        'ba dinh': 'Hanoi', 'dong da': 'Hanoi', 'cau giay': 'Hanoi',
        'long bien': 'Hanoi', 'hai ba trung': 'Hanoi',
        'hoi an old town': 'Hoi An', 'an bang beach': 'Hoi An', 'cam an': 'Hoi An',
        'da nang beach': 'Da Nang', 'my khe': 'Da Nang', 'non nuoc': 'Da Nang',
        'hue citadel': 'Hue',
        'nha trang beach': 'Nha Trang', 'tran phu': 'Nha Trang',
        'phu quoc center': 'Phu Quoc', 'long beach pq': 'Phu Quoc',
        // Mui Ne
        'mui ne beach': 'Mui Ne', 'ham tien': 'Mui Ne',
        // Sapa
        'sapa town': 'Sapa', 'sapa old town': 'Sapa',
        // Vung Tau
        'front beach vung tau': 'Vung Tau', 'back beach vung tau': 'Vung Tau',
        // Dalat
        'dalat city': 'Da Lat', 'dalat old market': 'Da Lat',
        // Can Tho
        'ninh kieu': 'Can Tho',
        // Halong extras
        'cat ba island': 'Ha Long',
    },
    ID: {
        // Bali
        'seminyak': 'Bali', 'kuta': 'Bali', 'ubud': 'Bali', 'canggu': 'Bali',
        'nusa dua': 'Bali', 'legian': 'Bali', 'jimbaran': 'Bali', 'sanur': 'Bali',
        'uluwatu': 'Bali', 'petitenget': 'Bali', 'denpasar': 'Bali',
        'berawa': 'Bali', 'pererenan': 'Bali', 'echo beach': 'Bali',
        'kedewatan': 'Bali', 'tegalalang': 'Bali', 'kerobokan': 'Bali',
        'tanjung benoa': 'Bali', 'renon': 'Bali',
        // Jakarta
        'kemang': 'Jakarta', 'scbd': 'Jakarta', 'sudirman': 'Jakarta',
        'menteng': 'Jakarta', 'kebayoran baru': 'Jakarta', 'tebet': 'Jakarta',
        'mampang': 'Jakarta', 'pancoran': 'Jakarta', 'grogol': 'Jakarta',
        'kebon jeruk': 'Jakarta', 'pluit': 'Jakarta', 'kota tua': 'Jakarta',
        'ancol': 'Jakarta', 'kelapa gading': 'Jakarta', 'puri': 'Jakarta',
        'bintaro': 'Jakarta', 'cipete': 'Jakarta', 'cilandak': 'Jakarta',
        // Yogyakarta
        'malioboro': 'Yogyakarta', 'prawirotaman': 'Yogyakarta', 'kraton': 'Yogyakarta',
        'kotagede': 'Yogyakarta',
        // Lombok
        'senggigi': 'Lombok', 'kuta lombok': 'Lombok', 'gili trawangan': 'Lombok',
        'gili meno': 'Lombok', 'gili air': 'Lombok', 'mataram': 'Lombok',
        // Surabaya
        'gubeng': 'Surabaya', 'rungkut': 'Surabaya',
        // Medan
        'polonia': 'Medan',
        // Komodo
        'labuan bajo': 'Labuan Bajo',
        // Flores
        'bajawa': 'Bajawa', 'ende': 'Ende',
        // Sumatra
        'bukit lawang': 'Medan', 'lake toba': 'Parapat', 'prapat': 'Parapat',
        'berastagi': 'Berastagi', 'banda aceh city': 'Banda Aceh',
        'padang city': 'Padang', 'bukittinggi': 'Bukittinggi',
        // Sulawesi
        'manado city': 'Manado', 'bunaken': 'Manado',
        'toraja': 'Makassar', 'makassar city': 'Makassar',
        // Raja Ampat / Papua
        'waisai': 'Sorong',
        // Gili Islands (already as gili trawangan → Lombok)
        // Bromo
        'mount bromo': 'Probolinggo', 'cemoro lawang': 'Probolinggo',
        // Ijen
        'kawah ijen': 'Banyuwangi',
    },
    IN: {
        // Mumbai
        'bandra': 'Mumbai', 'juhu': 'Mumbai', 'andheri': 'Mumbai', 'colaba': 'Mumbai',
        'lower parel': 'Mumbai', 'bkc': 'Mumbai', 'powai': 'Mumbai',
        'worli': 'Mumbai', 'prabhadevi': 'Mumbai', 'dadar': 'Mumbai',
        'chembur': 'Mumbai', 'malad': 'Mumbai', 'kandivali': 'Mumbai',
        'borivali': 'Mumbai', 'thane': 'Mumbai', 'navi mumbai': 'Mumbai',
        'fort mumbai': 'Mumbai', 'churchgate': 'Mumbai', 'marine lines': 'Mumbai',
        'versova': 'Mumbai', 'goregaon': 'Mumbai',
        // Delhi
        'connaught place': 'New Delhi', 'karol bagh': 'New Delhi', 'paharganj': 'New Delhi',
        'south delhi': 'New Delhi', 'hauz khas': 'New Delhi', 'lajpat nagar': 'New Delhi',
        'greater kailash': 'New Delhi', 'saket': 'New Delhi', 'vasant kunj': 'New Delhi',
        'gurgaon': 'New Delhi', 'gurugram': 'New Delhi', 'noida': 'New Delhi',
        'janakpuri': 'New Delhi', 'pitampura': 'New Delhi', 'rohini': 'New Delhi',
        'dwarka': 'New Delhi', 'rajouri garden': 'New Delhi', 'preet vihar': 'New Delhi',
        'laxmi nagar': 'New Delhi', 'nehru place': 'New Delhi', 'old delhi': 'New Delhi',
        // Bangalore
        'koramangala': 'Bangalore', 'indiranagar': 'Bangalore', 'whitefield': 'Bangalore',
        'jp nagar': 'Bangalore', 'hsr layout': 'Bangalore', 'btm layout': 'Bangalore',
        'jayanagar': 'Bangalore', 'malleswaram': 'Bangalore', 'hebbal': 'Bangalore',
        'yelahanka': 'Bangalore', 'marathahalli': 'Bangalore', 'electronic city': 'Bangalore',
        'sarjapur': 'Bangalore', 'bellandur': 'Bangalore', 'mg road': 'Bangalore',
        'brigade road': 'Bangalore', 'commercial street': 'Bangalore',
        // Chennai
        'anna nagar': 'Chennai', 't nagar': 'Chennai', 'mylapore': 'Chennai',
        'nungambakkam': 'Chennai', 'adyar': 'Chennai', 'velachery': 'Chennai',
        'guindy': 'Chennai', 'perambur': 'Chennai', 'egmore': 'Chennai',
        'chetpet': 'Chennai', 'kodambakkam': 'Chennai', 'teynampet': 'Chennai',
        // Hyderabad
        'banjara hills': 'Hyderabad', 'jubilee hills': 'Hyderabad', 'gachibowli': 'Hyderabad',
        'kondapur': 'Hyderabad', 'madhapur': 'Hyderabad', 'hitech city': 'Hyderabad',
        'ameerpet': 'Hyderabad', 'begumpet': 'Hyderabad', 'secunderabad': 'Hyderabad',
        'kukatpally': 'Hyderabad', 'lb nagar': 'Hyderabad', 'dilsukhnagar': 'Hyderabad',
        // Pune
        'koregaon park': 'Pune', 'kalyani nagar': 'Pune', 'baner': 'Pune',
        'viman nagar': 'Pune', 'hadapsar': 'Pune', 'kothrud': 'Pune',
        'shivajinagar': 'Pune', 'aundh': 'Pune', 'wakad': 'Pune',
        'pimple saudagar': 'Pune', 'hinjewadi': 'Pune', 'kharadi': 'Pune',
        // Goa
        'calangute': 'Goa', 'baga': 'Goa', 'anjuna': 'Goa', 'vagator': 'Goa',
        'palolem': 'Goa', 'arambol': 'Goa', 'candolim': 'Goa', 'sinquerim': 'Goa',
        'colva': 'Goa', 'benaulim': 'Goa', 'panaji': 'Goa', 'mapusa': 'Goa',
        'morjim': 'Goa', 'chapora': 'Goa', 'agonda': 'Goa', 'patnem': 'Goa',
        // Jaipur
        'bani park': 'Jaipur', 'civil lines jaipur': 'Jaipur', 'malviya nagar jaipur': 'Jaipur',
        'sindhi camp': 'Jaipur', 'old city jaipur': 'Jaipur',
        // Kolkata
        'park street': 'Kolkata', 'salt lake': 'Kolkata', 'new town kolkata': 'Kolkata',
        'ballygunge': 'Kolkata', 'behala': 'Kolkata', 'howrah': 'Kolkata',
        'lake town': 'Kolkata',
        // Ahmedabad
        'satellite': 'Ahmedabad', 'navrangpura': 'Ahmedabad', 'cg road': 'Ahmedabad',
        'prahladnagar': 'Ahmedabad',
        // Kerala
        'varkala': 'Thiruvananthapuram', 'kovalam': 'Thiruvananthapuram',
        'fort kochi': 'Kochi', 'marine drive kochi': 'Kochi',
        'alleppey': 'Alappuzha',
        // Agra / Varanasi
        'taj ganj': 'Agra',
        'assi ghat': 'Varanasi', 'dashashwamedh': 'Varanasi', 'ghats varanasi': 'Varanasi',
        // Rajasthan extras
        'clock tower jodhpur': 'Jodhpur', 'old city jodhpur': 'Jodhpur',
        'blue city jodhpur': 'Jodhpur', 'sardar market': 'Jodhpur',
        'lake pichola': 'Udaipur', 'old city udaipur': 'Udaipur', 'city palace udaipur': 'Udaipur',
        'fateh sagar': 'Udaipur',
        'jaisalmer fort': 'Jaisalmer', 'jaisalmer city': 'Jaisalmer',
        'pushkar lake': 'Pushkar',
        // Rishikesh / Haridwar
        'lakshman jhula': 'Rishikesh', 'ram jhula': 'Rishikesh', 'rishikesh town': 'Rishikesh',
        'haridwar city': 'Haridwar', 'har ki pauri': 'Haridwar',
        // Himachal Pradesh
        'manali town': 'Manali', 'old manali': 'Manali',
        'shimla mall road': 'Shimla',
        'mcleod ganj': 'Dharamsala', 'dharamsala upper': 'Dharamsala',
        // Darjeeling
        'chowrasta darjeeling': 'Darjeeling', 'darjeeling mall': 'Darjeeling',
        // Amritsar
        'golden temple area': 'Amritsar', 'hall bazaar': 'Amritsar',
        // Mysore / Mysuru
        'mysore palace area': 'Mysore', 'chamundeshwari': 'Mysore',
        // Srinagar / Kashmir
        'dal lake': 'Srinagar', 'lal chowk': 'Srinagar', 'srinagar old city': 'Srinagar',
        // Leh / Ladakh
        'leh town': 'Leh', 'main bazaar leh': 'Leh',
        // Hampi
        'hampi ruins': 'Hospet',
        // Pondicherry
        'french quarter pondicherry': 'Pondicherry', 'white town pondicherry': 'Pondicherry',
        // Coorg / Kodagu
        'madikeri': 'Madikeri',
        // Ooty / Nilgiris
        'ooty city': 'Ooty',
        // Andaman Islands
        'havelock island': 'Port Blair', 'neil island': 'Port Blair',
        // Andhra Pradesh
        'vizag beach': 'Visakhapatnam', 'rushikonda': 'Visakhapatnam',
        // Udaipur extras - already added above
        // Kolkata extras
        'esplanade kolkata': 'Kolkata', 'college street': 'Kolkata',
        // North East India
        'gangtok mg road': 'Gangtok', 'rumtek': 'Gangtok',
        'shillong police bazaar': 'Shillong',
        'kaziranga': 'Jorhat',
    },
    AU: {
        // Sydney
        'bondi': 'Sydney', 'bondi beach': 'Sydney', 'darling harbour': 'Sydney',
        'manly': 'Sydney', 'surry hills': 'Sydney', 'newtown': 'Sydney',
        'glebe': 'Sydney', 'potts point': 'Sydney', 'paddington': 'Sydney',
        'redfern': 'Sydney', 'chippendale': 'Sydney', 'pyrmont': 'Sydney',
        'balmain': 'Sydney', 'rozelle': 'Sydney', 'leichhardt': 'Sydney',
        'annandale': 'Sydney', 'ultimo': 'Sydney', 'darlinghurst': 'Sydney',
        'kings cross': 'Sydney', 'woolloomooloo': 'Sydney',
        'marrickville': 'Sydney', 'stanmore': 'Sydney', 'enmore': 'Sydney',
        'erskineville': 'Sydney', 'coogee': 'Sydney', 'bronte': 'Sydney',
        'randwick': 'Sydney', 'maroubra': 'Sydney', 'clovelly': 'Sydney',
        'neutral bay': 'Sydney', 'mosman': 'Sydney', 'north sydney': 'Sydney',
        'chatswood': 'Sydney', 'parramatta': 'Sydney', 'ryde': 'Sydney',
        'cronulla': 'Sydney', 'sutherland': 'Sydney',
        // Melbourne
        'st kilda': 'Melbourne', 'fitzroy': 'Melbourne', 'southbank': 'Melbourne',
        'collingwood': 'Melbourne', 'brunswick': 'Melbourne', 'richmond': 'Melbourne',
        'south yarra': 'Melbourne', 'toorak': 'Melbourne', 'armadale': 'Melbourne',
        'prahran': 'Melbourne', 'windsor': 'Melbourne', 'balaclava': 'Melbourne',
        'elwood': 'Melbourne', 'middle park': 'Melbourne', 'albert park': 'Melbourne',
        'port melbourne': 'Melbourne', 'docklands': 'Melbourne', 'carlton': 'Melbourne',
        'north melbourne': 'Melbourne', 'footscray': 'Melbourne', 'hawthorn': 'Melbourne',
        'malvern': 'Melbourne', 'glen iris': 'Melbourne', 'camberwell': 'Melbourne',
        'northcote': 'Melbourne', 'thornbury': 'Melbourne', 'preston': 'Melbourne',
        'box hill': 'Melbourne', 'glen waverley': 'Melbourne', 'caulfield': 'Melbourne',
        // Brisbane
        'fortitude valley': 'Brisbane', 'new farm': 'Brisbane',
        'west end brisbane': 'Brisbane', 'south brisbane': 'Brisbane',
        'spring hill': 'Brisbane', 'paddington brisbane': 'Brisbane',
        'cbd brisbane': 'Brisbane',
        // Perth
        'fremantle': 'Perth', 'northbridge': 'Perth', 'subiaco': 'Perth',
        'cottesloe': 'Perth', 'scarborough': 'Perth', 'leederville': 'Perth',
        'mount lawley': 'Perth', 'victoria park': 'Perth',
        // Adelaide
        'cbd adelaide': 'Adelaide', 'glenelg': 'Adelaide', 'norwood': 'Adelaide',
        'unley': 'Adelaide', 'prospect': 'Adelaide',
        // Gold Coast
        'surfers paradise': 'Gold Coast', 'broadbeach': 'Gold Coast',
        'burleigh heads': 'Gold Coast', 'coolangatta': 'Gold Coast',
        'main beach': 'Gold Coast',
        // Cairns / Tropical North
        'cairns esplanade': 'Cairns', 'palm cove': 'Cairns', 'port douglas': 'Cairns',
        // Other
        'manuka': 'Canberra', 'kingston canberra': 'Canberra',
        'darwin waterfront': 'Darwin',
        'hobart salamanca': 'Hobart',
    },
    NZ: {
        'ponsonby': 'Auckland', 'parnell': 'Auckland', 'newmarket': 'Auckland',
        'devonport': 'Auckland', 'mt eden': 'Auckland', 'grey lynn': 'Auckland',
        'newtown wellington': 'Wellington', 'cuba street': 'Wellington', 'te aro': 'Wellington',
        'thorndon': 'Wellington', 'karori': 'Wellington',
        'riccarton': 'Christchurch', 'merivale': 'Christchurch', 'central city christchurch': 'Christchurch',
        'queenstown bay': 'Queenstown', 'frankton': 'Queenstown', 'arrowtown': 'Queenstown',
        'wanaka township': 'Wanaka',
        'rotorua city': 'Rotorua',
    },
    // ── Philippines ────────────────────────────────────────────────────────────
    PH: {
        // Metro Manila — core districts
        'makati': 'Manila', 'bgc': 'Manila', 'bonifacio global city': 'Manila',
        'intramuros': 'Manila', 'binondo': 'Manila', 'malate': 'Manila',
        'ermita': 'Manila', 'paco': 'Manila', 'pandacan': 'Manila',
        'sampaloc': 'Manila', 'santa ana': 'Manila', 'santa cruz': 'Manila',
        'tondo': 'Manila', 'port area': 'Manila', 'san miguel manila': 'Manila',
        // Taguig / BGC
        'taguig': 'Manila', 'fort bonifacio': 'Manila', 'western bicutan': 'Manila',
        // Pasay / Entertainment City
        'pasay': 'Manila', 'entertainment city': 'Manila', 'mall of asia': 'Manila',
        'moa area': 'Manila', 'bay area manila': 'Manila',
        // Mandaluyong / Ortigas
        'mandaluyong': 'Manila', 'ortigas': 'Manila', 'ortigas center': 'Manila',
        'shaw': 'Manila', 'wack-wack': 'Manila',
        // Pasig / Eastwood
        'pasig': 'Manila', 'eastwood': 'Manila', 'kapitolyo': 'Manila',
        'ugong': 'Manila', 'bagong ilog': 'Manila',
        // Quezon City
        'quezon city': 'Manila', 'cubao': 'Manila', 'diliman': 'Manila',
        'fairview': 'Manila', 'novaliches': 'Manila', 'commonwealth': 'Manila',
        'philcoa': 'Manila', 'kamuning': 'Manila', 'araneta': 'Manila',
        'timog': 'Manila', 'scout area': 'Manila', 'west triangle': 'Manila',
        'katipunan': 'Manila', 'up diliman': 'Manila',
        // Marikina / San Juan
        'marikina': 'Manila', 'san juan': 'Manila', 'greenhills': 'Manila',
        // Parañaque / Las Piñas / Muntinlupa
        'paranaque': 'Manila', 'las pinas': 'Manila', 'muntinlupa': 'Manila',
        'alabang': 'Manila', 'bf homes': 'Manila', 'sucat': 'Manila',
        // Caloocan / Malabon / Navotas / Valenzuela
        'caloocan': 'Manila', 'malabon': 'Manila', 'navotas': 'Manila', 'valenzuela': 'Manila',
        // Antipolo (Rizal)
        'antipolo': 'Manila',
        // Cebu
        'it park': 'Cebu City', 'cebu it park': 'Cebu City', 'lahug': 'Cebu City',
        'ayala cebu': 'Cebu City', 'cebu business park': 'Cebu City',
        'colon cebu': 'Cebu City', 'carbon cebu': 'Cebu City',
        'mactan': 'Cebu City', 'lapu-lapu': 'Cebu City', 'lapu lapu': 'Cebu City',
        'mandaue': 'Cebu City', 'sm seaside': 'Cebu City',
        // Davao
        'lanang': 'Davao City', 'downtown davao': 'Davao City',
        'toril': 'Davao City', 'buhangin': 'Davao City', 'matina': 'Davao City',
        'ecoland': 'Davao City', 'agdao': 'Davao City', 'talomo': 'Davao City',
        // Boracay
        'station 1': 'Boracay', 'station 2': 'Boracay', 'station 3': 'Boracay',
        'd mall': 'Boracay', 'diniwid': 'Boracay', 'bulabog': 'Boracay',
        'white beach boracay': 'Boracay', 'puka beach': 'Boracay',
        // Palawan
        'el nido': 'El Nido', 'nacpan': 'El Nido', 'corong corong': 'El Nido',
        'coron': 'Coron', 'coron town': 'Coron', 'busuanga': 'Coron',
        'underground river': 'Puerto Princesa', 'sabang palawan': 'Puerto Princesa',
        // Bohol
        'panglao': 'Tagbilaran', 'alona beach': 'Tagbilaran', 'chocolate hills': 'Tagbilaran',
        'loboc': 'Tagbilaran',
        // Siargao
        'cloud 9': 'Siargao', 'general luna siargao': 'Siargao',
        'union siargao': 'Siargao', 'pacifico': 'Siargao',
        // Iloilo
        'smallville': 'Iloilo City', 'esplanade iloilo': 'Iloilo City',
        'festive walk': 'Iloilo City',
        // Bacolod
        'lacson': 'Bacolod', 'libertad bacolod': 'Bacolod',
        // Cagayan de Oro
        'limketkai': 'Cagayan de Oro',
        // Tagaytay / Baguio
        'tagaytay ridge': 'Tagaytay', 'taal vista': 'Tagaytay',
        'session road': 'Baguio', 'burnham park': 'Baguio', 'camp john hay': 'Baguio',
        // Zamboanga
        'fort pilar': 'Zamboanga City',
        // Batangas / Cavite
        'anilao': 'Batangas', 'nasugbu': 'Batangas',
    },
    // ── South / Southeast Asia additions ──────────────────────────────────────
    BD: {
        'gulshan': 'Dhaka', 'banani': 'Dhaka', 'dhanmondi': 'Dhaka',
        'uttara': 'Dhaka', 'motijheel': 'Dhaka', 'mirpur': 'Dhaka',
        'bashundhara': 'Dhaka', 'mohammadpur': 'Dhaka', 'rayer bazar': 'Dhaka',
        'agrabad': 'Chittagong', 'nasirabad': 'Chittagong',
    },
    LK: {
        'fort colombo': 'Colombo', 'pettah': 'Colombo', 'kollupitiya': 'Colombo',
        'bambalapitiya': 'Colombo', 'wellawatte': 'Colombo', 'mount lavinia': 'Colombo',
        'borella': 'Colombo', 'rajagiriya': 'Colombo', 'nugegoda': 'Colombo',
        'kandy city': 'Kandy', 'dalada maligawa': 'Kandy',
        'galle fort': 'Galle', 'unawatuna': 'Galle', 'mirissa': 'Galle',
        'hikkaduwa': 'Galle', 'weligama': 'Galle',
        'negombo beach': 'Negombo',
        'trincomalee beach': 'Trincomalee',
    },
    PK: {
        'gulberg': 'Lahore', 'dha lahore': 'Lahore', 'old city lahore': 'Lahore',
        'model town lahore': 'Lahore', 'johar town': 'Lahore',
        'clifton': 'Karachi', 'defence karachi': 'Karachi', 'saddar': 'Karachi',
        'gulshan-e-iqbal': 'Karachi', 'north nazimabad': 'Karachi', 'korangi': 'Karachi',
        'blue area': 'Islamabad', 'f-6': 'Islamabad', 'f-7': 'Islamabad',
        'f-8': 'Islamabad', 'f-10': 'Islamabad', 'g-9': 'Islamabad',
        'dha islamabad': 'Islamabad', 'bahria town islamabad': 'Islamabad',
    },
    MM: {
        'downtown yangon': 'Yangon', 'chinatown yangon': 'Yangon', 'dagon': 'Yangon',
        'insein': 'Yangon', 'hledan': 'Yangon', 'tamwe': 'Yangon',
        'bagan old town': 'Bagan',
        'mandalay hill': 'Mandalay',
        'inle lake': 'Nyaungshwe',
    },
    KH: {
        'bkk1': 'Phnom Penh', 'riverside phnom penh': 'Phnom Penh',
        'russian market': 'Phnom Penh', 'toul tom poung': 'Phnom Penh',
        'daun penh': 'Phnom Penh', 'boeung keng kang': 'Phnom Penh',
        'pub street': 'Siem Reap', 'angkor wat area': 'Siem Reap',
        'siem reap town': 'Siem Reap',
        'sihanoukville beach': 'Sihanoukville', 'otres': 'Sihanoukville',
        'kep beach': 'Kep',
    },
    LA: {
        'luang prabang old town': 'Luang Prabang',
        'vientiane city center': 'Vientiane',
        'vang vieng': 'Vang Vieng',
    },
    NP: {
        'thamel': 'Kathmandu', 'patan': 'Kathmandu', 'bhaktapur': 'Kathmandu',
        'boudhanath': 'Kathmandu', 'swayambhunath': 'Kathmandu',
        'lakeside pokhara': 'Pokhara',
        'namche bazaar': 'Solukhumbu',
    },
    // ── Scandinavia ────────────────────────────────────────────────────────────
    SE: {
        'gamla stan': 'Stockholm', 'sodermalm': 'Stockholm', 'ostermalm': 'Stockholm',
        'vasastan': 'Stockholm', 'kungsholmen': 'Stockholm', 'djurgarden': 'Stockholm',
        'hornstull': 'Stockholm', 'sickla': 'Stockholm', 'lidingo': 'Stockholm',
        'haga': 'Gothenburg', 'linne': 'Gothenburg', 'majorna': 'Gothenburg',
        'haga gothenburg': 'Gothenburg',
        'malmo old town': 'Malmo', 'hyllie': 'Malmo',
    },
    NO: {
        'aker brygge': 'Oslo', 'grunerlokka': 'Oslo', 'frogner': 'Oslo',
        'majorstuen': 'Oslo', 'toyen': 'Oslo', 'sentrum oslo': 'Oslo',
        'gronland': 'Oslo', 'bislett': 'Oslo', 'kampen': 'Oslo',
        'bryggen': 'Bergen', 'nordnes': 'Bergen',
        'trondheim city center': 'Trondheim',
    },
    DK: {
        'norrebro': 'Copenhagen', 'vesterbro': 'Copenhagen', 'frederiksberg': 'Copenhagen',
        'christianshavn': 'Copenhagen', 'indre by': 'Copenhagen',
        'osterbro': 'Copenhagen', 'amager': 'Copenhagen', 'sydhavn': 'Copenhagen',
        'randers': 'Aarhus',
        'aarhus city center': 'Aarhus',
    },
    FI: {
        'kallio': 'Helsinki', 'kamppi': 'Helsinki', 'kruununhaka': 'Helsinki',
        'katajanokka': 'Helsinki', 'ullanlinna': 'Helsinki',
        'toolo': 'Helsinki', 'punavuori': 'Helsinki', 'eira': 'Helsinki',
    },
    // ── Central/Eastern Europe additions ──────────────────────────────────────
    AT: {
        'innere stadt': 'Vienna', 'mariahilf': 'Vienna', 'neubau': 'Vienna',
        'leopoldstadt': 'Vienna', 'wieden': 'Vienna', 'alsergrund': 'Vienna',
        'josefstadt': 'Vienna', 'favoriten': 'Vienna', 'ottakring': 'Vienna',
        'hernals': 'Vienna', 'wahring': 'Vienna',
        'altstadt salzburg': 'Salzburg', 'parsch': 'Salzburg',
        'innsbruck city center': 'Innsbruck',
        'hallstatt village': 'Hallstatt',
    },
    CH: {
        'old town zurich': 'Zurich', 'langstrasse': 'Zurich', 'wiedikon': 'Zurich',
        'seefeld': 'Zurich', 'riesbach': 'Zurich', 'hottingen': 'Zurich',
        'old town bern': 'Bern', 'lorraine': 'Bern',
        'paquis': 'Geneva', 'eaux-vives': 'Geneva', 'plainpalais': 'Geneva',
        'ouchy': 'Lausanne', 'flon': 'Lausanne',
        'lucerne old town': 'Lucerne', 'tribschen': 'Lucerne',
        'basel city center': 'Basel', 'gundeldingen': 'Basel',
        'zermatt village': 'Zermatt',
        'interlaken west': 'Interlaken',
        'montreux waterfront': 'Montreux',
    },
    BE: {
        'grand place': 'Brussels', 'ixelles': 'Brussels', 'saint-gilles': 'Brussels',
        'molenbeek': 'Brussels', 'uccle': 'Brussels', 'schaerbeek': 'Brussels',
        'etterbeek': 'Brussels', 'laeken': 'Brussels',
        'old town bruges': 'Bruges', 'sint-anna': 'Bruges',
        'antwerp city center': 'Antwerp', 'eilandje': 'Antwerp', 'berchem': 'Antwerp',
        'ghent city center': 'Ghent', 'patershol': 'Ghent',
    },
    RO: {
        'old town bucharest': 'Bucharest', 'floreasca': 'Bucharest', 'dorobanti': 'Bucharest',
        'herastrau': 'Bucharest', 'victoriei': 'Bucharest', 'unirii': 'Bucharest',
        'cluj napoca city center': 'Cluj-Napoca', 'manastur': 'Cluj-Napoca',
        'brasov old town': 'Brasov', 'schei': 'Brasov',
    },
    HR: {
        'old town dubrovnik': 'Dubrovnik', 'lapad': 'Dubrovnik', 'babin kuk': 'Dubrovnik',
        'gornji grad': 'Zagreb', 'donji grad': 'Zagreb', 'trnje': 'Zagreb',
        'old town split': 'Split', 'varos': 'Split', 'bacvice': 'Split',
        'stari grad hvar': 'Hvar', 'jelsa': 'Hvar',
        'korcula town': 'Korcula',
        'zadar old town': 'Zadar',
        'rovinj old town': 'Rovinj',
    },
    RS: {
        'stari grad': 'Belgrade', 'savamala': 'Belgrade', 'vracar': 'Belgrade',
        'zemun': 'Belgrade', 'novi beograd': 'Belgrade', 'palilula': 'Belgrade',
        'novi sad old town': 'Novi Sad',
    },
    BG: {
        'city center sofia': 'Sofia', 'lozenets': 'Sofia', 'mladost': 'Sofia',
        'vitosha boulevard': 'Sofia', 'oborishte': 'Sofia',
        'old town plovdiv': 'Plovdiv', 'kapana': 'Plovdiv',
        'varna beach': 'Varna', 'golden sands': 'Varna',
    },
    UA: {
        'podil': 'Kyiv', 'pechersk': 'Kyiv', 'shevchenkivskyi': 'Kyiv',
        'obolon': 'Kyiv', 'svyatoshyn': 'Kyiv',
    },
    // ── Africa additions ───────────────────────────────────────────────────────
    NG: {
        'victoria island': 'Lagos', 'ikoyi': 'Lagos', 'lekki': 'Lagos',
        'vi lagos': 'Lagos', 'yaba': 'Lagos', 'ikeja': 'Lagos',
        'surulere': 'Lagos', 'maryland lagos': 'Lagos', 'ajah': 'Lagos',
        'eko atlantic': 'Lagos', 'oniru': 'Lagos',
        'wuse': 'Abuja', 'maitama': 'Abuja', 'garki': 'Abuja', 'asokoro': 'Abuja',
        'gudu': 'Abuja', 'gwarinpa': 'Abuja',
    },
    GH: {
        'airport residential': 'Accra', 'osu': 'Accra', 'labone': 'Accra',
        'cantonments': 'Accra', 'east legon': 'Accra', 'adabraka': 'Accra',
        'dzorwulu': 'Accra', 'north legon': 'Accra', 'tema': 'Accra',
        'kumasi city center': 'Kumasi',
    },
    TZ: {
        'stone town': 'Zanzibar', 'nungwi': 'Zanzibar', 'kendwa': 'Zanzibar',
        'paje': 'Zanzibar', 'jambiani': 'Zanzibar', 'kiwengwa': 'Zanzibar',
        'msasani': 'Dar es Salaam', 'oyster bay': 'Dar es Salaam',
        'kariakoo': 'Dar es Salaam',
        'arusha city': 'Arusha',
    },
    UG: {
        'kololo': 'Kampala', 'nakasero': 'Kampala', 'kabalagala': 'Kampala',
        'ntinda': 'Kampala', 'muyenga': 'Kampala',
    },
    ET: {
        'bole': 'Addis Ababa', 'kazanchis': 'Addis Ababa', 'piazza addis': 'Addis Ababa',
        'old airport addis': 'Addis Ababa',
    },
    MU: {
        'grand baie': 'Mauritius', 'flic en flac': 'Mauritius', 'trou aux biches': 'Mauritius',
        'blue bay': 'Mauritius', 'belle mare': 'Mauritius', 'mahebourg': 'Mauritius',
        'port louis waterfront': 'Port Louis',
    },
    SC: {
        'beau vallon': 'Mahe', 'victoria seychelles': 'Mahe',
        'anse lazio': 'Praslin', 'anse georgette': 'Praslin',
        'grande anse la digue': 'La Digue',
    },
    MV: {
        'male city': 'Male', 'hulhumale': 'Male',
        'maafushi': 'Maafushi',
    },
    // ── Caribbean / Central America ────────────────────────────────────────────
    DO: {
        'zona colonial': 'Santo Domingo', 'naco': 'Santo Domingo', 'piantini': 'Santo Domingo',
        'bavaro': 'Punta Cana', 'los corales': 'Punta Cana', 'cap cana': 'Punta Cana',
        'las terrenas': 'Las Terrenas',
        'cabarete': 'Cabarete',
    },
    JM: {
        'negril west end': 'Negril', 'seven mile beach': 'Negril',
        'hip strip': 'Montego Bay', 'doctors cave': 'Montego Bay',
        'new kingston': 'Kingston',
        'ocho rios': 'Ocho Rios',
    },
    BS: {
        'nassau downtown': 'Nassau', 'cable beach': 'Nassau', 'paradise island': 'Nassau',
        'grand bahama': 'Freeport',
    },
    CR: {
        'tamarindo': 'Tamarindo', 'nosara': 'Nosara',
        'manuel antonio': 'Quepos', 'la fortuna': 'La Fortuna',
        'escazu': 'San Jose', 'san pedro': 'San Jose', 'sabana': 'San Jose',
        'monteverde': 'Monteverde',
        'jaco beach': 'Jaco',
        'santa teresa cr': 'Santa Teresa',
    },
    GT: {
        'zona viva': 'Guatemala City', 'zona 10': 'Guatemala City', 'zona 4': 'Guatemala City',
        'antigua guatemala': 'Antigua',
        'san marcos la laguna': 'Lake Atitlan',
    },
    PA: {
        'casco viejo': 'Panama City', 'punta pacifica': 'Panama City',
        'marbella': 'Panama City', 'san francisco panama': 'Panama City',
        'el cangrejo': 'Panama City', 'obarrio': 'Panama City',
        'bocas del toro town': 'Bocas del Toro',
    },
    CU: {
        'habana vieja': 'Havana', 'vedado': 'Havana', 'miramar': 'Havana',
        'varadero beach': 'Varadero',
    },
    BB: {
        'bridgetown city': 'Bridgetown',
        'holetown': 'Holetown', 'speightstown': 'Speightstown',
        'oistins': 'Oistins',
    },
    // ── Oceania additions ──────────────────────────────────────────────────────
    FJ: {
        'denarau': 'Nadi', 'port denarau': 'Nadi',
        'suva city center': 'Suva',
        'coral coast': 'Sigatoka',
        'savusavu': 'Savusavu',
    },
    PF: {
        'papeete city': 'Papeete',
        'bora bora motu': 'Bora Bora', 'vaitape': 'Bora Bora',
        'moorea beach': 'Moorea',
    },
    WS: {
        'apia waterfront': 'Apia',
    },
    // ── Iceland ────────────────────────────────────────────────────────────────
    IS: {
        'old harbour reykjavik': 'Reykjavik', '101 reykjavik': 'Reykjavik',
        'laugardalur': 'Reykjavik', 'vesturbær': 'Reykjavik', 'hafnarfjordur': 'Reykjavik',
        'akureyri town': 'Akureyri',
        'blue lagoon area': 'Grindavik',
        'vik iceland': 'Vik',
    },
    // ── Monaco ────────────────────────────────────────────────────────────────
    MC: {
        'monte carlo': 'Monaco', 'port hercule': 'Monaco', 'la condamine': 'Monaco',
        'fontvieille': 'Monaco', 'monaco ville': 'Monaco',
    },
    // ── Malta ─────────────────────────────────────────────────────────────────
    MT: {
        'sliema': 'Valletta', 'st julians': 'Valletta', 'paceville': 'Valletta',
        'mdina': 'Valletta', 'marsaskala': 'Valletta', 'marsaxlokk': 'Valletta',
        'bugibba': 'St. Paul\'s Bay', 'qawra': 'St. Paul\'s Bay',
        'golden bay malta': 'Mellieha', 'mellieha bay': 'Mellieha',
        'gozo island': 'Victoria', 'victoria gozo': 'Victoria', 'xlendi': 'Victoria',
    },
    // ── Cyprus ────────────────────────────────────────────────────────────────
    CY: {
        'limassol marina': 'Limassol', 'old limassol': 'Limassol', 'germasogeia': 'Limassol',
        'old nicosia': 'Nicosia', 'laiki yitonia': 'Nicosia', 'engomi': 'Nicosia',
        'paphos old town': 'Paphos', 'kato paphos': 'Paphos', 'coral bay': 'Paphos',
        'ayia napa beach': 'Ayia Napa', 'protaras': 'Protaras', 'fig tree bay': 'Protaras',
        'larnaca city': 'Larnaca', 'finikoudes': 'Larnaca',
        'polis chrysochous': 'Polis',
    },
    // ── Baltic States ─────────────────────────────────────────────────────────
    EE: {
        'old town tallinn': 'Tallinn', 'toompea': 'Tallinn', 'kalamaja': 'Tallinn',
        'telliskivi': 'Tallinn', 'kadriorg': 'Tallinn', 'pirita': 'Tallinn',
        'tartu old town': 'Tartu', 'tartu city': 'Tartu',
        'parnu beach': 'Parnu',
    },
    LV: {
        'old riga': 'Riga', 'centre riga': 'Riga', 'agenskalns': 'Riga',
        'quiet centre riga': 'Riga', 'teika': 'Riga',
        'jurmala beach': 'Jurmala', 'majori': 'Jurmala', 'dzintari': 'Jurmala',
        'sigulda': 'Sigulda',
    },
    LT: {
        'old town vilnius': 'Vilnius', 'uzupis': 'Vilnius', 'new town vilnius': 'Vilnius',
        'gediminas avenue': 'Vilnius',
        'kaunas old town': 'Kaunas', 'laisves aleja': 'Kaunas',
        'klaipeda old town': 'Klaipeda', 'smiltyne': 'Klaipeda',
        'nida': 'Nida', 'palanga beach': 'Palanga',
    },
    // ── Slovenia ──────────────────────────────────────────────────────────────
    SI: {
        'old town ljubljana': 'Ljubljana', 'trnovo': 'Ljubljana', 'tivoli': 'Ljubljana',
        'lake bled': 'Bled', 'bled village': 'Bled',
        'lake bohinj': 'Bohinj',
        'piran old town': 'Piran', 'portoroz': 'Portoroz',
        'maribor old town': 'Maribor',
    },
    // ── Montenegro ────────────────────────────────────────────────────────────
    ME: {
        'kotor old town': 'Kotor', 'stari grad kotor': 'Kotor',
        'budva old town': 'Budva', 'budva riviera': 'Budva', 'becici': 'Budva',
        'tivat city': 'Tivat', 'porto montenegro': 'Tivat',
        'bar center': 'Bar',
        'ulcinj': 'Ulcinj',
        'podgorica center': 'Podgorica',
        'herceg novi': 'Herceg Novi',
    },
    // ── Albania ───────────────────────────────────────────────────────────────
    AL: {
        'tirana center': 'Tirana', 'blloku': 'Tirana', 'new bazaar': 'Tirana',
        'saranda waterfront': 'Saranda', 'sarande': 'Saranda',
        'gjirokastra old town': 'Gjirokaster',
        'durres beach': 'Durres',
        'berat old town': 'Berat',
        'ksamil': 'Saranda',
    },
    // ── North Macedonia ───────────────────────────────────────────────────────
    MK: {
        'skopje old bazaar': 'Skopje', 'city square skopje': 'Skopje', 'debar maalo': 'Skopje',
        'ohrid old town': 'Ohrid', 'lake ohrid': 'Ohrid',
        'struga': 'Struga',
    },
    // ── Bosnia & Herzegovina ──────────────────────────────────────────────────
    BA: {
        'bascarsija': 'Sarajevo', 'old town sarajevo': 'Sarajevo', 'kovaci': 'Sarajevo',
        'marijin dvor': 'Sarajevo',
        'old bridge mostar': 'Mostar', 'kujundziluk': 'Mostar',
    },
    // ── Slovakia ──────────────────────────────────────────────────────────────
    SK: {
        'old town bratislava': 'Bratislava', 'petrzalka': 'Bratislava',
        'kosice old town': 'Kosice',
    },
    // ── Macau ─────────────────────────────────────────────────────────────────
    MO: {
        'cotai strip': 'Macau', 'taipa village': 'Macau', 'coloane': 'Macau',
        'senado square': 'Macau', 'ruins of st paul': 'Macau',
        'galaxy macau area': 'Macau', 'venetian macau': 'Macau',
    },
    // ── Caucasus ──────────────────────────────────────────────────────────────
    GE: {
        'old tbilisi': 'Tbilisi', 'rustaveli': 'Tbilisi', 'vake': 'Tbilisi',
        'saburtalo': 'Tbilisi', 'vera': 'Tbilisi', 'abanotubani': 'Tbilisi',
        'batumi boulevard': 'Batumi', 'batumi old town': 'Batumi', 'new boulevard batumi': 'Batumi',
        'kazbegi village': 'Kazbegi', 'stepantsminda': 'Kazbegi',
        'sighnaghi': 'Sighnaghi',
        'kutaisi city': 'Kutaisi',
    },
    AM: {
        'kentron yerevan': 'Yerevan', 'north avenue': 'Yerevan', 'erebuni': 'Yerevan',
        'cascade yerevan': 'Yerevan', 'mashtots': 'Yerevan',
        'dilijan': 'Dilijan',
        'tsaghkadzor': 'Tsaghkadzor',
    },
    AZ: {
        'icherisheher': 'Baku', 'old city baku': 'Baku', 'white city baku': 'Baku',
        'fountain square baku': 'Baku', 'nizami street': 'Baku', 'narimanov baku': 'Baku',
        'gabala city': 'Gabala', 'sheki city': 'Sheki', 'quba': 'Quba',
    },
    // ── Central Asia ──────────────────────────────────────────────────────────
    KZ: {
        'almaty centre': 'Almaty', 'medeu almaty': 'Almaty', 'alatau almaty': 'Almaty',
        'arbat almaty': 'Almaty',
        'nur-sultan centre': 'Nur-Sultan', 'astana city': 'Nur-Sultan',
        'shymkent city': 'Shymkent',
    },
    UZ: {
        'samarkand registan': 'Samarkand', 'samarkand old town': 'Samarkand',
        'bukhara old town': 'Bukhara', 'lyabi-hauz': 'Bukhara', 'poi-kalyan': 'Bukhara',
        'khiva old town': 'Khiva', 'itchan kala': 'Khiva',
        'tashkent city': 'Tashkent', 'chorsu tashkent': 'Tashkent',
    },
    // ── Kuwait / Bahrain / Oman ────────────────────────────────────────────────
    KW: {
        'kuwait city centre': 'Kuwait City', 'salmiya': 'Kuwait City',
        'hawally': 'Kuwait City', 'rumaithiya': 'Kuwait City',
    },
    BH: {
        'manama city': 'Manama', 'seef': 'Manama', 'adliya': 'Manama',
        'amwaj islands': 'Manama', 'reef island': 'Manama', 'juffair': 'Manama',
    },
    OM: {
        'muscat city centre': 'Muscat', 'muttrah': 'Muscat', 'qurum': 'Muscat',
        'old muscat': 'Muscat', 'al mouj muscat': 'Muscat', 'madinat sultan': 'Muscat',
        'salalah beach': 'Salalah', 'al hafah': 'Salalah',
        'nizwa fort': 'Nizwa',
        'wahiba sands': 'Ibra',
    },
    // ── Tunisia ───────────────────────────────────────────────────────────────
    TN: {
        'tunis medina': 'Tunis', 'sidi bou said': 'Tunis', 'la marsa': 'Tunis',
        'carthage ruins': 'Tunis', 'gammarth': 'Tunis',
        'sousse medina': 'Sousse', 'port el kantaoui': 'Sousse',
        'hammamet beach': 'Hammamet', 'yasmine hammamet': 'Hammamet',
        'djerba zone touristique': 'Djerba', 'houmt souk': 'Djerba',
        'tozeur': 'Tozeur', 'douz': 'Douz',
        'monastir city': 'Monastir', 'sfax city': 'Sfax',
    },
    // ── Senegal ───────────────────────────────────────────────────────────────
    SN: {
        'plateau dakar': 'Dakar', 'almadies': 'Dakar', 'ngor': 'Dakar',
        'les mamelles dakar': 'Dakar', 'yoff': 'Dakar', 'mermoz': 'Dakar',
        'saly beach': 'Saly', 'mbour': 'Mbour',
        'saint-louis senegal': 'Saint-Louis',
        'ziguinchor': 'Ziguinchor',
    },
    // ── Rwanda ────────────────────────────────────────────────────────────────
    RW: {
        'kigali city center': 'Kigali', 'nyamirambo': 'Kigali', 'kimihurura': 'Kigali',
        'kacyiru': 'Kigali', 'remera': 'Kigali',
        'musanze': 'Musanze',
        'gisenyi': 'Rubavu',
    },
    // ── Mozambique ────────────────────────────────────────────────────────────
    MZ: {
        'polana': 'Maputo', 'baixa maputo': 'Maputo', 'sommerschield': 'Maputo',
        'tofo beach': 'Inhambane', 'barra mozambique': 'Inhambane',
        'vilanculos beach': 'Vilanculos',
        'pemba beach': 'Pemba',
    },
    // ── Puerto Rico ───────────────────────────────────────────────────────────
    PR: {
        'old san juan': 'San Juan', 'condado': 'San Juan', 'miramar pr': 'San Juan',
        'isla verde': 'San Juan', 'ocean park': 'San Juan', 'santurce': 'San Juan',
        'ponce historic center': 'Ponce',
        'rincon pr': 'Rincon',
    },
    // ── Caribbean additions ────────────────────────────────────────────────────
    CW: {
        'punda': 'Willemstad', 'otrobanda': 'Willemstad', 'jan thiel': 'Willemstad',
        'seaquarium beach': 'Willemstad', 'mambo beach': 'Willemstad',
    },
    AW: {
        'palm beach aruba': 'Oranjestad', 'eagle beach': 'Oranjestad',
        'noord': 'Oranjestad', 'santa cruz aruba': 'Oranjestad',
    },
    TC: {
        'grace bay': 'Providenciales', 'downtown provo': 'Providenciales',
        'leeward': 'Providenciales', 'turtle cove': 'Providenciales',
        'long bay beach': 'Providenciales',
    },
    KY: {
        'seven mile beach cayman': 'George Town', 'west bay cayman': 'George Town',
        'camana bay': 'George Town', 'grand cayman': 'George Town',
    },
    LC: {
        'rodney bay': 'Gros Islet', 'marigot bay': 'Marigot',
        'soufriere st lucia': 'Soufriere', 'castries city': 'Castries',
    },
    GD: {
        'grand anse grenada': "St. George's", 'lance aux epines': "St. George's",
        'gouyave': 'Gouyave',
    },
    TT: {
        'woodbrook': 'Port of Spain', 'st clair trinidad': 'Port of Spain',
        'maraval': 'Port of Spain', 'newtown trinidad': 'Port of Spain',
        'crown point tobago': 'Crown Point', 'store bay': 'Crown Point',
        'speyside': 'Speyside',
    },
    // ── Belize ────────────────────────────────────────────────────────────────
    BZ: {
        'san pedro belize': 'San Pedro', 'ambergris caye': 'San Pedro',
        'caye caulker village': 'Caye Caulker',
        'belize city centre': 'Belize City',
        'placencia village': 'Placencia',
        'san ignacio': 'San Ignacio',
    },
    // ── El Salvador / Honduras / Nicaragua ────────────────────────────────────
    SV: {
        'zona rosa san salvador': 'San Salvador', 'colonia escalon': 'San Salvador',
        'el tunco': 'La Libertad',
    },
    HN: {
        'copan ruinas': 'Copan', 'roatan west end': 'Roatan', 'west bay roatan': 'Roatan',
        'la ceiba city': 'La Ceiba',
    },
    NI: {
        'granada centro': 'Granada', 'colonia pellas': 'Managua',
        'leon colonial': 'Leon',
    },
    // ── Bolivia ───────────────────────────────────────────────────────────────
    BO: {
        'sopocachi': 'La Paz', 'miraflores la paz': 'La Paz', 'zona sur la paz': 'La Paz',
        'salar de uyuni': 'Uyuni', 'uyuni town': 'Uyuni',
        'sucre city': 'Sucre', 'potosi city': 'Potosi',
        'copacabana bolivia': 'Copacabana',
        'santa cruz city': 'Santa Cruz de la Sierra',
    },
    // ── Paraguay ──────────────────────────────────────────────────────────────
    PY: {
        'asuncion city centre': 'Asuncion', 'villa morra': 'Asuncion',
    },
    // ── Venezuela ─────────────────────────────────────────────────────────────
    VE: {
        'las mercedes': 'Caracas', 'altamira': 'Caracas', 'chacao': 'Caracas',
        'isla margarita': 'Porlamar',
    },
    // ── Mongolia ──────────────────────────────────────────────────────────────
    MN: {
        'sukhbaatar square': 'Ulaanbaatar', 'zaisan': 'Ulaanbaatar',
        'gandan': 'Ulaanbaatar', 'narantuul': 'Ulaanbaatar',
    },
    // ── Myanmar additions ──────────────────────────────────────────────────────
    // (already has MM section — leave as-is)
    // ── Sri Lanka additions ───────────────────────────────────────────────────
    // (already has LK section — extra spots)
    // ── Nepal additions ───────────────────────────────────────────────────────
    // (already has NP — extra spots below)
    // ── Additional Middle East ────────────────────────────────────────────────
    IQ: {
        'baghdad city': 'Baghdad', 'erbil city': 'Erbil', 'sulaymaniyah': 'Sulaymaniyah',
    },
    // ── Algeria ───────────────────────────────────────────────────────────────
    DZ: {
        'algiers city': 'Algiers', 'casbah algiers': 'Algiers',
        'tlemcen old town': 'Tlemcen',
        'constantine city': 'Constantine',
    },
    // ── Cameroon ──────────────────────────────────────────────────────────────
    CM: {
        'douala city': 'Douala', 'akwa': 'Douala',
        'yaounde city': 'Yaounde', 'bastos': 'Yaounde',
    },
    // ── Ivory Coast / Cote d'Ivoire ───────────────────────────────────────────
    CI: {
        'plateau abidjan': 'Abidjan', 'marcory': 'Abidjan', 'cocody': 'Abidjan',
        'yopougon': 'Abidjan',
    },
    // ── Zambia ────────────────────────────────────────────────────────────────
    ZM: {
        'livingstone city': 'Livingstone', 'victoria falls zam': 'Livingstone',
        'lusaka city': 'Lusaka', 'kabulonga': 'Lusaka',
    },
    // ── Zimbabwe ──────────────────────────────────────────────────────────────
    ZW: {
        'victoria falls town': 'Victoria Falls', 'victoria falls zimbabwe': 'Victoria Falls',
        'harare city centre': 'Harare', 'avondale harare': 'Harare',
        'bulawayo city': 'Bulawayo',
    },
    // ── Malawi ────────────────────────────────────────────────────────────────
    MW: {
        'cape maclear': 'Cape Maclear', 'lake malawi': 'Salima',
        'lilongwe old town': 'Lilongwe',
    },
    // ── Namibia ───────────────────────────────────────────────────────────────
    NA: {
        'windhoek city': 'Windhoek', 'katutura': 'Windhoek',
        'swakopmund city': 'Swakopmund',
        'sossusvlei': 'Sesriem',
    },
    // ── Botswana ──────────────────────────────────────────────────────────────
    BW: {
        'gaborone city': 'Gaborone', 'maun': 'Maun',
        'kasane': 'Kasane',
    },
    // ── Madagascar ────────────────────────────────────────────────────────────
    MG: {
        'antananarivo city': 'Antananarivo', 'nosy be': 'Nosy Be',
    },
    // ── Cambodia additions (already KH) ──────────────────────────────────────
    // ── Myanmar additions (already MM) ───────────────────────────────────────
    // ── Ecuador additions (already EC) ───────────────────────────────────────
    // (already has EC — add Galapagos)
    // ── Israel additions (already IL) ────────────────────────────────────────
    // ── Taiwan additions (already TW) ────────────────────────────────────────
    // ── Brunei ────────────────────────────────────────────────────────────────
    BN: {
        'bandar seri begawan': 'Bandar Seri Begawan', 'gadong': 'Bandar Seri Begawan',
    },
    // ── Papua New Guinea ──────────────────────────────────────────────────────
    PG: {
        'port moresby city': 'Port Moresby',
    },
    // ── Vanuatu ───────────────────────────────────────────────────────────────
    VU: {
        'port vila city': 'Port Vila', 'mele beach': 'Port Vila',
    },
    // ── Solomon Islands ───────────────────────────────────────────────────────
    SB: {
        'honiara city': 'Honiara',
    },
    // ── Tonga ─────────────────────────────────────────────────────────────────
    TO: {
        'nukualofa': "Nuku'alofa",
    },
    // ── Cook Islands ──────────────────────────────────────────────────────────
    CK: {
        'avarua': 'Avarua', 'muri beach': 'Avarua',
    },
    // ── Reunion Island ────────────────────────────────────────────────────────
    RE: {
        'saint-denis reunion': 'Saint-Denis',
        'saint-gilles': 'Saint-Gilles-les-Bains',
        'cilaos': 'Cilaos',
    },
    // ── Martinique ────────────────────────────────────────────────────────────
    MQ: {
        'fort-de-france city': 'Fort-de-France',
        'les trois-ilets': 'Les Trois-Ilets',
        'sainte-anne martinique': 'Sainte-Anne',
    },
    // ── Guadeloupe ────────────────────────────────────────────────────────────
    GP: {
        'pointe-a-pitre': 'Pointe-a-Pitre', 'gosier': 'Gosier',
        'saint-francois guadeloupe': 'Saint-Francois',
    },
    // ── Guyana ────────────────────────────────────────────────────────────────
    GY: {
        'georgetown guyana': 'Georgetown',
    },
    // ── Suriname ──────────────────────────────────────────────────────────────
    SR: {
        'paramaribo city': 'Paramaribo', 'waterkant': 'Paramaribo',
    },
};

/**
 * Maps canonical city names (used in CITY_ALIASES and Mapbox) to the actual
 * city name stored in hotel_content. ETG seeds hotel_content with German-localized
 * city names ("Rom", "Athen", "Prag"), which don't match our English canonical names.
 * Key format: "CanonicalCity|CC" (country code uppercase).
 * Used in filterCitiesWithHotels (autocomplete ranking) and getInstantHotelCatalog (Phase 1).
 */
export const HOTEL_DB_CITY_MAP: Record<string, string> = {
    // ETG German localizations — "und Umgebung" = "and surroundings"
    'Rome|IT':                      'Rom',
    'Athens|GR':                    'Athen',
    'Prague|CZ':                    'Prag',
    'Belgrade|RS':                  'Belgrad',
    'Algiers|DZ':                   'Algier',
    'Sorrento|IT':                  'Sorrent',
    'Trieste|IT':                   'Triest',
    'Phuket|TH':                    'Phuket Stadt',
    'Fukuoka|JP':                   'Fukuoka (und Umgebung)',
    'Daegu|KR':                     'Daegu (und Umgebung)',
    'Barranquilla|CO':              'Barranquilla (und Umgebung)',
    'Guayaquil|EC':                 'Guayaquil (und Umgebung)',
    'Iquitos|PE':                   'Iquitos (und Umgebung)',
    'Ljubljana|SI':                 'Ljubljana (Laibach)',
    'Cluj-Napoca|RO':               'Cluj-Napoca (Klausenburg)',
    'Mahe|SC':                      'Insel Mahe',
    'Praslin|SC':                   'Insel Praslin',
    // City name differs from DB value
    'Antwerp|BE':                   'Antwerpen',
    'Suzhou|CN':                    'Suzhou (Jiangsu)',
    'Washington DC|US':             'Washington',
    'Panama City|PA':               'Panama',
    'Cebu City|PH':                 'Cebu',
    'Davao City|PH':                'Davao',
    'Iloilo City|PH':               'Iloilo',
    'Zamboanga City|PH':            'Zamboanga',
    'Santorini|GR':                 'Santorini Island',
    'Antigua|GT':                   'Antigua Guatemala',
    'Copan|HN':                     'Copan Ruinas',
    'Ibiza|ES':                     'Ibiza-Stadt',
    'Ciutadella|ES':                'Ciutadella de Menorca',
    'Tenerife|ES':                  'Santa Cruz de Tenerife',
    'San Ignacio|BZ':               'San Ignacio & Santa Elena',
    'Arachova|GR':                  'Distomo-Arachova-Antikyra',
    'Vik|IS':                       'Vik I Myrdal',
    'Bohinj|SI':                    'Bohinjska Bistrica',
    'Yufuin|JP':                    'Yufu',
    'Bodrum|TR':                    'Bodrum (Region)',
    'Huatulco|MX':                  'Santa Cruz Huatulco',
    'Los Cabos|MX':                 'Puerto Los Cabos',
    'Apia|WS':                      'Apia-Fagali',
    // OTV CSV uses alternative spellings for these cities
    'Marrakech|MA':                 'Marrakes',   // DB uses "Marrakesch" (German); "Marrakes" prefix matches both spellings
    'Koh Lanta|TH':                 'Ko Lanta',
    'Ho Chi Minh City|VN':          'Ho-Chi-Minh-Stadt',
    // ── German city names (other European capitals / cities) ────────────────
    'Vienna|AT':                    'Wien',
    'Copenhagen|DK':                'Kopenhagen',
    'Zurich|CH':                    'Zürich',
    'Geneva|CH':                    'Genf',
    'Lucerne|CH':                   'Luzern',
    'Brussels|BE':                  'Brüssel',
    'Bruges|BE':                    'Brügge',
    'Ghent|BE':                     'Gent',
    'The Hague|NL':                 'Den Haag',
    'Kyiv|UA':                      'Kiew',
    'Gothenburg|SE':                'Göteborg',
    'Malmo|SE':                     'Malmö',
    'Krakow|PL':                    'Krakau',
    'Gdansk|PL':                    'Danzig',
    'Bucharest|RO':                 'Bukarest',
    'Tbilisi|GE':                   'Tiflis',
    'Yerevan|AM':                   'Jerewan',
    'Tashkent|UZ':                  'Taschkent',
    'Macau|MO':                     'Macao',
    'Kathmandu|NP':                 'Katmandu',
    // ── German names for German cities ──────────────────────────────────────
    'Munich|DE':                    'München',
    'Cologne|DE':                   'Köln',
    'Dusseldorf|DE':                'Düsseldorf',
    'Nuremberg|DE':                 'Nürnberg',
    // ── German names for French/Italian/Greek cities ─────────────────────────
    'Nice|FR':                      'Nizza',
    'Strasbourg|FR':                'Straßburg',
    'Genoa|IT':                     'Genua',
    'Rhodes|GR':                    'Rhodos',
    'Corfu|GR':                     'Korfu',
    // ── German names for Middle East / Africa / Americas ────────────────────
    'Riyadh|SA':                    'Riad',
    'Jeddah|SA':                    'Djiddah',
    'Cairo|EG':                     'Kairo',
    'Kuwait City|KW':               'Kuwait-Stadt',
    'Guatemala City|GT':            'Guatemala-Stadt',
    'Yaounde|CM':                   'Jaunde',
    'Windhoek|NA':                  'Windhuk',
    // ── Spanish/Portuguese accent variants ───────────────────────────────────
    'Seville|ES':                   'Sevilla',
    'San Sebastian|ES':             'San Sebastián',
    'Malaga|ES':                    'Málaga',
    'Gijon|ES':                     'Gijón',
    'Cordoba|ES':                   'Córdoba',
    'Mahon|ES':                     'Maó',
    'Pollensa|ES':                  'Pollença',
    'Las Palmas de Gran Canaria|ES':'Las Palmas, Gran Canaria',
    'Portimao|PT':                  'Portimão',
    // ── Mexican/Latin American accent variants ───────────────────────────────
    'Mexico City|MX':               'Mexiko-Stadt',
    'Cancun|MX':                    'Cancún',
    'Merida|MX':                    'Mérida',
    'Queretaro|MX':                 'Querétaro',
    'Mazatlan|MX':                  'Mazatlán',
    'San Cristobal de las Casas|MX':'San Cristóbal de las Casas',
    'Bogota|CO':                    'Bogotá',
    'Medellin|CO':                  'Medellín',
    'Armenia|CO':                   'Armenien',
    'San Andres|CO':                'San Andrés',
    'Florianopolis|BR':             'Florianópolis',
    'Foz do Iguacu|BR':             'Foz do Iguaçu',
    'Cusco|PE':                     'Cuzco',
    'Asuncion|PY':                  'Asunción (und Umgebung)',
    'Cordoba|AR':                   'Córdoba',
    // ── Asian name variants ──────────────────────────────────────────────────
    'Bangalore|IN':                 'Bengaluru',
    'Kolkata|IN':                   'Kalkutta',
    'Ooty|IN':                      'Udagamandalam',
    'Jorhat|IN':                    'Jorhãt',
    'Incheon|KR':                   "Inch'on",
    'Bali|ID':                      'Kuta',
    'Lombok|ID':                    'Mataram',
    'Koh Tao|TH':                   'Ko Tao',
    'Johor Bahru|MY':               'Johore Baharu',
    'Penang|MY':                    'George Town',
    'Vung Tau|VN':                  'Vung Tàu',
    // ── Other name variants ──────────────────────────────────────────────────
    'Larnaca|CY':                   'Larnaka',
    'Parnu|EE':                     'Pärnu',
    'Mauritius|MU':                 'Grand Baie',
    'Saint Petersburg|US':          'St. Petersburg',
};

/** Resolve the canonical city name to its actual hotel_content DB value.
 *  Returns the input unchanged when no mapping exists. */
export function resolveHotelDbCity(city: string, countryCode: string): string {
    return HOTEL_DB_CITY_MAP[`${city}|${countryCode.toUpperCase()}`] ?? city;
}
