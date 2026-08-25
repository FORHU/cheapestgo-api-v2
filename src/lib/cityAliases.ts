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
        'venice': 'Los Angeles', 'venice beach': 'Los Angeles', 'west hollywood': 'Los Angeles', 'culver city': 'Los Angeles',
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
        'haight ashbury': 'San Francisco', 'castro': 'San Francisco', 'the castro': 'San Francisco',
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
        // Maui. These all pointed at Kahului, which is the airport town and holds
        // 5 hotels — while Wailea has 369 and Kaanapali 255. Sending a Maui search
        // there returned almost nothing. Resort areas now keep their own name
        // where the catalog stocks them, and the island falls to the largest.
        'maui': 'Wailea', 'maui island': 'Wailea',
        'kaanapali': 'Kaanapali', 'kaanapali beach': 'Kaanapali',
        'wailea maui': 'Wailea', 'wailea': 'Wailea',
        'lahaina': 'Kaanapali', 'kihei': 'Wailea',
        'paia maui': 'Kahului', 'makawao': 'Kahului',
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
        // Alaska extras
        'juneau city': 'Juneau (und Umgebung)', 'mendenhall juneau': 'Juneau (und Umgebung)',
        'fairbanks city': 'Fairbanks', 'denali village': 'Fairbanks',
        'ketchikan': 'Ketchikan', 'sitka': 'Sitka',
        // Florida Keys
        'key west old town': 'Stock Island', 'duval street': 'Stock Island',
        'key largo': 'Key Largo', 'islamorada': 'Islamorada',
        'marathon fl': 'Marathon',
        // More Florida
        'downtown naples fl': 'Marco Island', 'fifth avenue naples': 'Marco Island',
        'siesta key': 'Sarasota', 'longboat key': 'Sarasota',
        'sanibel island': 'Sanibel', 'fort myers beach': 'Fort Myers',
        'cape coral': 'Cape Coral',
        'pensacola beach': 'Pensacola', 'destin fl': 'Destin', '30a beach': 'Panama City Beach',
        'panama city beach': 'Panama City Beach',
        'clearwater beach': 'Clearwater',
        // Virginia
        'virginia beach boardwalk': 'Virginia Beach', 'chesapeake va': 'Virginia Beach',
        'arlington va': 'Arlington', 'alexandria va': 'Alexandria',
        'charlottesville': 'Charlottesville',
        // Maryland extras
        'ocean city md': 'Ocean City', 'annapolis': 'Annapolis',
        // New England
        'burlington vt': 'Burlington', 'stowe vt': 'Stowe', 'killington': 'Killington',
        'brattleboro': 'Brattleboro', 'woodstock vt': 'Woodstock',
        'portland me': 'Portland', 'bar harbor': 'Bar Harbor', 'acadia area': 'Bar Harbor',
        'kennebunkport': 'Kennebunkport', 'camden me': 'Camden',
        'portsmouth nh': 'Portsmouth', 'manchester nh': 'Manchester',
        'providence ri': 'Providence', 'newport ri': 'Newport',
        'mystic ct': 'Mystic',
        // National Park gateway towns
        'moab utah': 'Moab', 'arches park area': 'Moab', 'canyonlands area': 'Moab',
        'springdale ut': 'Springdale', 'zion park area': 'Springdale',
        'bryce junction': 'Bryce Canyon', 'bryce canyon area': 'Bryce Canyon',
        'monument valley': 'Bluff',
        'grand canyon village': 'Grand Canyon Village (South Rim)', 'williams az': 'Williams',
        'page az': 'Page', 'antelope canyon': 'Page',
        'bend oregon': 'Bend', 'sisters oregon': 'Sisters',
        'bozeman': 'Bozeman', 'missoula': 'Missoula', 'billings mt': 'Billings',
        'west yellowstone': 'West Yellowstone', 'gardiner mt': 'Gardiner',
        'cody wy': 'Cody',
        'rapid city sd': 'Rapid City', 'keystone sd': 'Rapid City',
        'lake tahoe': 'South Lake Tahoe', 'south lake tahoe': 'South Lake Tahoe',
        'truckee ca': 'Truckee', 'mammoth lakes': 'Mammoth Lakes',
        // More Texas
        'galveston island': 'Galveston', 'galveston beach': 'Galveston',
        'corpus christi tx': 'Corpus Christi',
        'lubbock tx': 'Lubbock', 'amarillo tx': 'Amarillo',
        'waco tx': 'Waco',
        // Midwest extras
        'ann arbor': 'Ann Arbor', 'lansing mi': 'Lansing',
        'grand rapids mi': 'Grand Rapids',
        'des moines': 'Des Moines', 'iowa city': 'Iowa City',
        'fargo nd': 'Fargo', 'sioux falls sd': 'Sioux Falls',
        'lincoln ne': 'Lincoln',
        // PNW extras
        'tacoma wa': 'Tacoma', 'olympia wa': 'Olympia',
        'spokane': 'Spokane', 'yakima': 'Yakima',
        'eugene or': 'Eugene', 'medford or': 'Medford',
        // Southeast extras
        'greenville sc': 'Greenville', 'columbia sc': 'Columbia',
        'myrtle beach': 'Myrtle Beach',
        'wilmington nc': 'Wilmington', 'outer banks': 'Kill Devil Hills',
        'mobile al': 'Mobile', 'birmingham al': 'Birmingham',
        'montgomery al': 'Montgomery', 'huntsville al': 'Huntsville',
        'jackson ms': 'Jackson', 'biloxi': 'Biloxi',
        'shreveport la': 'Shreveport', 'baton rouge': 'Baton Rouge',
        'lafayette la': 'Lafayette',
        'little rock ar': 'Little Rock',
        'tulsa ok': 'Tulsa',
        // Southwest extras
        'prescott az': 'Prescott', 'yuma az': 'Yuma',
        'las cruces nm': 'Las Cruces', 'taos nm': 'Taos',
        'reno nv': 'Reno', 'carson city': 'Carson City',
        'elko nv': 'Elko',
        'twin falls id': 'Twin Falls', 'pocatello id': 'Pocatello',
        'idaho falls': 'Idaho Falls',
        // Mountain state extras
        'durango co': 'Durango', 'pueblo co': 'Pueblo', 'fort collins': 'Fort Collins',
        'colorado springs': 'Colorado Springs', 'boulder co': 'Boulder',
        'vail co': 'Vail', 'aspen co': 'Aspen', 'steamboat springs': 'Steamboat Springs',
        'telluride co': 'Telluride',
        // Mid-Atlantic extras
        'wilmington de': 'Wilmington', 'dover de': 'Dover',
        'princeton nj': 'Princeton', 'atlantic city': 'Atlantic City',
        'hoboken': 'Hoboken', 'jersey city': 'Jersey City',
        'buffalo ny': 'Buffalo', 'rochester ny': 'Rochester', 'syracuse ny': 'Syracuse',
        'albany ny': 'Albany', 'ithaca ny': 'Ithaca', 'saratoga springs': 'Saratoga Springs',
        'the hamptons': 'Southampton', 'southampton ny': 'Southampton', 'montauk': 'Montauk',
        'hudson ny': 'Hudson', 'woodstock ny': 'Woodstock',
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
        'old quebec': 'Québec', 'saint-roch': 'Québec',
        'downtown calgary': 'Calgary', 'beltline calgary': 'Calgary', 'inglewood calgary': 'Calgary',
        'kensington calgary': 'Calgary', 'mission calgary': 'Calgary',
        'whyte ave': 'Edmonton', 'old strathcona': 'Edmonton',
        'downtown ottawa': 'Ottawa', 'byward market': 'Ottawa', 'glebe': 'Ottawa',
        'downtown winnipeg': 'Winnipeg', 'exchange district': 'Winnipeg',
        'north end halifax': 'Halifax', 'south end halifax': 'Halifax',
        // BC extras
        'north vancouver city': 'North Vancouver', 'west vancouver city': 'West Vancouver',
        'richmond bc': 'Richmond', 'burnaby city': 'Burnaby', 'surrey bc': 'Surrey',
        'langley bc': 'Langley', 'abbotsford bc': 'Abbotsford',
        'penticton city': 'Penticton', 'vernon bc': 'Vernon',
        'nelson bc': 'Nelson', 'revelstoke': 'Revelstoke',
        'tofino village': 'Victoria', 'ucluelet': 'Ucluelet',
        'nanaimo city': 'Nanaimo', 'courtney bc': 'Courtenay',
        // Alberta extras
        'banff avenue': 'Banff', 'lake louise village': 'Lake Louise',
        'jasper village': 'Jasper', 'canmore city': 'Canmore',
        'lethbridge ab': 'Lethbridge', 'red deer ab': 'Red Deer',
        'medicine hat': 'Medicine Hat',
        // Ontario extras
        'niagara falls on': 'Niagara Falls', 'niagara on the lake': 'Niagara Falls',
        'ontario stratford': 'Stratford',
        'london ontario': 'London', 'windsor ontario': 'Windsor',
        'kitchener': 'Kitchener', 'waterloo ontario': 'Waterloo',
        'guelph on': 'Guelph', 'barrie on': 'Barrie',
        'kingston on': 'Kingston', 'belleville on': 'Belleville',
        'sudbury on': 'Sudbury', 'thunder bay': 'Thunder Bay',
        // Quebec extras
        'old quebec city': 'Québec', 'petit champlain': 'Québec',
        'basse-ville': 'Québec', 'haute-ville': 'Québec',
        'tremblant village': 'Mont-Tremblant', 'mont tremblant': 'Mont-Tremblant',
        'magog city': 'Magog', 'sherbrooke qc': 'Sherbrooke',
        'trois rivieres': 'Trois-Rivières',
        // Atlantic provinces
        'moncton city': 'Moncton', 'saint john nb': 'Saint John',
        'cape breton island': 'Sydney', 'sydney ns': 'Sydney',
        'st john s nl': "St. John's",
        // Prince Edward Island
        'charlottetown city': 'Charlottetown',
        // Yukon
        'whitehorse city': 'Whitehorse',
    },
    MX: {
        'polanco': 'Mexiko-Stadt', 'condesa': 'Mexiko-Stadt', 'roma': 'Mexiko-Stadt',
        'coyoacan': 'Mexiko-Stadt', 'zona rosa': 'Mexiko-Stadt', 'santa fe': 'Mexiko-Stadt',
        'napoles': 'Mexiko-Stadt', 'del valle': 'Mexiko-Stadt', 'narvarte': 'Mexiko-Stadt',
        'juarez cdmx': 'Mexiko-Stadt', 'tepito': 'Mexiko-Stadt', 'centro historico cdmx': 'Mexiko-Stadt',
        'xochimilco': 'Mexiko-Stadt', 'tlalpan': 'Mexiko-Stadt', 'pedregal': 'Mexiko-Stadt',
        'hotel zone': 'Cancún', 'zona hotelera': 'Cancún', 'downtown cancun': 'Cancún',
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
        'cabo san lucas': 'Cabo San Lucas', 'san jose del cabo': 'San José del Cabo',
        'corridor cabo': 'Cabo San Lucas', 'medano beach': 'Cabo San Lucas',
        // Merida
        'paseo de montejo': 'Mérida', 'merida centro': 'Mérida', 'santa ana merida': 'Mérida',
        // Puerto Escondido
        'zicatela': 'Puerto Escondido', 'la punta mexico': 'Puerto Escondido',
        // Huatulco
        'tangolunda': 'Santa Cruz Huatulco', 'la crucecita': 'Crucecita',
        // Mazatlan
        'old mazatlan': 'Mazatlán', 'zona dorada mazatlan': 'Mazatlán',
        // San Cristobal de las Casas
        'san cristobal centro': 'San Cristóbal de las Casas',
        // Guanajuato
        'guanajuato centro': 'Guanajuato',
        // Queretaro
        'queretaro centro': 'Querétaro',
        // Puebla
        'puebla centro': 'Puebla', 'barrio de artistas': 'Puebla',
        // Veracruz
        'veracruz malecon': 'Veracruz',
        // Acapulco
        'acapulco costera': 'Acapulco',
        // Baja California
        'tijuana zona rio': 'Tijuana', 'ensenada city': 'Ensenada',
        'la paz baja': 'La Paz (und Umgebung)', 'loreto baja': 'Loreto',
        // Yucatan extras
        'izamal city': 'Izamal', 'valladolid yucatan': 'Valladolid',
        'chichen itza town': 'Valladolid',
        // Quintana Roo extras
        'holbox island': 'Isla Holbox', 'bacalar lake': 'Bacalar',
        'cozumel island': 'San Miguel de Cozumel', 'isla mujeres': 'Isla Mujeres',
        'akumal beach': 'Akumal', 'tulum ruins': 'Tulum',
        // Pacific extras
        'nuevo vallarta': 'Puerto Vallarta', 'rincon de guayabitos': 'Rincon de Guayabitos',
        'troncones beach': 'Zihuatanejo', 'zihuatanejo': 'Zihuatanejo',
        'ixtapa': 'Ixtapa',
        // Gulf Coast
        'veracruz port': 'Veracruz', 'xalapa city': 'Xalapa',
        // Central Highlands
        'morelia centro': 'Morelia', 'patzcuaro town': 'Pátzcuaro',
        'uruapan city': 'Uruapan del Progreso',
        'zacatecas centro': 'Zacatecas', 'aguascalientes city': 'Aguascalientes',
        'leon guanajuato': 'León',
        // Chiapas extras
        'palenque ruins': 'Palenque', 'agua azul': 'Palenque',
        'comitan': 'Comitán',
        // Sonora / Baja Sur
        'hermosillo city': 'Hermosillo', 'guaymas': 'Guaymas',
        'los mochis': 'Los Mochis (und Umgebung)', 'mazatlan centro': 'Mazatlán',
        // Durango / Chihuahua
        'chihuahua city': 'Chihuahua', 'ciudad juarez': 'Ciudad Juárez',
        'creel chihuahua': 'Creel', 'copper canyon': 'Creel',
        // Sinaloa
        'culiacan city': 'Culiacán (und Umgebung)', 'culiacán': 'Culiacán (und Umgebung)',
        // Nayarit extras
        'san blas nayarit': 'San Blas', 'tepic city': 'Tepic',
        // Colima
        'manzanillo colima': 'Manzanillo', 'colima city': 'Colima',
        // Jalisco extras
        'ajijic': 'Ajijic', 'chapala lake': 'Chapala', 'guadalajara city': 'Guadalajara',
        'tonala jalisco': 'Tonala', 'zapopan': 'Zapopan',
        // Michoacán extras
        'playa azul': 'Lazaro Cardenas', 'lazaro cardenas': 'Lazaro Cardenas',
        // Tabasco / Chiapas coastal
        'villahermosa': 'Villahermosa',
        // Yucatán extras
        'progreso beach': 'Progreso', 'progreso yucatan': 'Progreso',
        'tulum cenotes': 'Tulum', 'xel-ha': 'Tulum',
        // Quintana Roo extras
        'mahahual': 'Mahahual', 'xcalak': 'Xcalak',
        // Mexico City CDMX extra neighborhoods
        'doctores': 'Mexiko-Stadt', 'obrera': 'Mexiko-Stadt', 'guerrero cdmx': 'Mexiko-Stadt',
        'santa maria la ribera': 'Mexiko-Stadt', 'san rafael': 'Mexiko-Stadt',
        'cuauhtemoc cdmx': 'Mexiko-Stadt', 'anzures': 'Mexiko-Stadt',
        'lomas de chapultepec': 'Mexiko-Stadt', 'polanco chapultepec': 'Mexiko-Stadt',
        'bosques de las lomas': 'Mexiko-Stadt', 'interlomas': 'Mexiko-Stadt',
        'perisur': 'Mexiko-Stadt', 'insurgentes sur': 'Mexiko-Stadt',
        'ciudad universitaria': 'Mexiko-Stadt', 'coyoacan centro': 'Mexiko-Stadt',
        'san angel': 'Mexiko-Stadt', 'desierto de los leones': 'Mexiko-Stadt',
        'tepepan': 'Mexiko-Stadt', 'xochitepec': 'Mexiko-Stadt',
        // Monterrey extras
        'san pedro nl': 'Monterrey', 'santa catarina nl': 'Monterrey',
        'guadalupe nl': 'Monterrey', 'apodaca nl': 'Monterrey',
        'escobedo nl': 'Monterrey', 'cumbres monterrey': 'Monterrey',
        'centro monterrey': 'Monterrey',
    },
    // ── South America ──────────────────────────────────────────────────────────
    BR: {
        'copacabana': 'Rio de Janeiro', 'ipanema': 'Rio de Janeiro', 'leblon': 'Rio de Janeiro',
        'barra da tijuca': 'Rio de Janeiro', 'lapa': 'Rio de Janeiro',
        'santa teresa': 'Rio de Janeiro', 'botafogo': 'Rio de Janeiro', 'flamengo': 'Rio de Janeiro',
        'urca': 'Rio de Janeiro', 'gavea': 'Rio de Janeiro', 'jardim botanico': 'Rio de Janeiro',
        'glorio': 'Rio de Janeiro', 'centro rio': 'Rio de Janeiro', 'tijuca': 'Rio de Janeiro',
        'jardins': 'São Paulo', 'pinheiros': 'São Paulo', 'moema': 'São Paulo',
        'vila olimpia': 'São Paulo', 'itaim bibi': 'São Paulo', 'liberdade': 'São Paulo',
        'consolacao': 'São Paulo', 'higienopolis': 'São Paulo', 'brooklin': 'São Paulo',
        'perdizes': 'São Paulo', 'vila madalena': 'São Paulo', 'bela vista': 'São Paulo',
        'bom retiro': 'São Paulo', 'centro sp': 'São Paulo',
        'savassi': 'Belo Horizonte', 'funcionarios': 'Belo Horizonte',
        'pelourinho': 'Salvador', 'barra salvador': 'Salvador',
        // Fortaleza
        'meireles': 'Fortaleza', 'iracema': 'Fortaleza', 'aldeota': 'Fortaleza',
        // Recife / Olinda
        'boa viagem': 'Recife', 'olinda old town': 'Olinda',
        // Florianopolis
        'lagoa da conceicao': 'Florianópolis', 'jurerere': 'Florianópolis',
        'jurere internacional': 'Florianópolis', 'centro floripa': 'Florianópolis',
        // Curitiba
        'batel': 'Curitiba', 'bairro alto curitiba': 'Curitiba',
        // Manaus
        'centro manaus': 'Manaus',
        // Natal
        'ponta negra natal': 'Natal',
        // Foz do Iguacu
        'foz do iguacu': 'Foz do Iguaçu',
        // Gramado
        'gramado centro': 'Gramado',
        // Buzios
        'orla bardot': 'Armação dos Búzios',
        // Paraty
        'paraty centro': 'Paraty',
        // Angra dos Reis
        'angra dos reis centro': 'Angra dos Reis',
        // Sao Paulo extras
        'paulista avenue': 'São Paulo', 'avenida paulista': 'São Paulo',
        'campo belo sp': 'São Paulo', 'mooca': 'São Paulo', 'penha sp': 'São Paulo',
        'tatuape': 'São Paulo', 'santana sp': 'São Paulo', 'lapa sp': 'São Paulo',
        // Rio extras
        'recreio dos bandeirantes': 'Rio de Janeiro', 'vargem grande': 'Rio de Janeiro',
        'niteroi city': 'Niterói', 'icarai': 'Niterói',
        // Bahia extras
        'trancoso bahia': 'Porto Seguro', 'arraial d ajuda': 'Porto Seguro',
        'morro de sao paulo': 'Cairu', 'itacare': 'Itacaré',
        'lenois chapada': 'Lençóis',
        // Ceara extras
        'jericoacoara': 'Jijoca de Jericoacoara', 'canoa quebrada': 'Aracati',
        // Pernambuco extras
        'porto de galinhas': 'Ipojuca', 'recife historic': 'Recife',
        // Amazon extras
        'manaus opera house': 'Manaus', 'alter do chao': 'Santarem', 'santarem city': 'Santarem',
        // Rio Grande do Sul extras
        'canela rs': 'Canela', 'nova petropolis': 'Nova Petropolis',
        'torres rs': 'Torres',
        // Santa Catarina extras
        'bombinhas': 'Bombinhas', 'camboriu': 'Balneário Camboriú',
        'balnearao camboriu': 'Balneário Camboriú',
        // Goias
        'caldas novas': 'Caldas Novas', 'pirenopolis': 'Pirenópolis',
        'goiania city': 'Goiânia',
        // Minas Gerais
        'belo horizonte city': 'Belo Horizonte', 'ouro preto historic': 'Ouro Preto (und Umgebung)',
        'tiradentes mg': 'Tiradentes (und Umgebung)', 'diamantina city': 'Diamantina',
        'mariana mg': 'Mariana',
        // São Paulo city extras
        'jardim europa sp': 'São Paulo', 'jardim america sp': 'São Paulo',
        'campo eliseos': 'São Paulo', 'bela cintra': 'São Paulo',
        'oscar freire': 'São Paulo', 'cerqueira cesar': 'São Paulo',
        'paraiso sp': 'São Paulo', 'vila mariana': 'São Paulo',
        'santo amaro sp': 'São Paulo', 'interlagos': 'São Paulo',
        // Rio de Janeiro city extras
        'catete': 'Rio de Janeiro', 'largo do machado': 'Rio de Janeiro',
        'cosme velho': 'Rio de Janeiro', 'laranjeiras': 'Rio de Janeiro',
        'saude rj': 'Rio de Janeiro', 'gamboa': 'Rio de Janeiro',
        'madureira': 'Rio de Janeiro', 'campo grande rj': 'Rio de Janeiro',
        // Belo Horizonte extras
        'lourdes bh': 'Belo Horizonte', 'savassi bh': 'Belo Horizonte',
        'santa lucia bh': 'Belo Horizonte', 'boa viagem bh': 'Belo Horizonte',
        'pampulha': 'Belo Horizonte', 'barreiro bh': 'Belo Horizonte',
        // Salvador extras
        'ondina salvador': 'Salvador', 'rio vermelho': 'Salvador',
        'paralela salvador': 'Salvador', 'caminho das arvores': 'Salvador',
        'itapua salvador': 'Salvador', 'piatã': 'Salvador',
        // Northeast extras
        'natal parnamirim': 'Natal', 'praia do forte': 'Mata de São João Bahia',
        'ilheus city': 'Ilhéus', 'ilhéus': 'Ilhéus',
        // Paraná
        'curitiba city': 'Curitiba', 'curitiba historic': 'Curitiba',
        'foz do iguacu city': 'Foz do Iguaçu', 'londrina city': 'Londrina',
        'maringa city': 'Maringá', 'ponta grossa': 'Ponta Grossa',
        // Rio Grande do Sul
        'porto alegre city': 'Porto Alegre', 'centro historico poa': 'Porto Alegre',
        'moinhos de vento': 'Porto Alegre', 'bela vista poa': 'Porto Alegre',
        'caxias do sul': 'Caxias do Sul', 'pelotas rs': 'Pelotas',
        // Pernambuco extras
        'olinda': 'Olinda', 'caruaru': 'Caruaru', 'garanhuns': 'Garanhuns',
        'petrolina city': 'Petrolina', 'fernando de noronha': 'Fernando de Noronha',
        // Ceará extras
        'fortaleza meireles': 'Fortaleza', 'fortaleza iracema': 'Fortaleza',
        'sobral ceara': 'Sobral', 'juazeiro do norte': 'Juazeiro do Norte',
        // Maranhão
        'sao luis': 'Sao Luis', 'são luís': 'Sao Luis', 'lencois maranhenses': 'Barreirinhas',
        'barreirinhas': 'Barreirinhas', 'atins maranhao': 'Barreirinhas',
        // Para
        'belem para': 'Belem (und Umgebung)', 'belém': 'Belem (und Umgebung)', 'ilha do marajó': 'Soure',
        // Rondonia / Roraima
        'porto velho rondonia': 'Porto Velho', 'boa vista roraima': 'Boa Vista',
        // Acre
        'rio branco acre': 'Rio Branco',
        // Mato Grosso / Pantanal
        'cuiaba': 'Cuiabá', 'cuiabá': 'Cuiabá', 'pantanal': 'Cuiabá',
        'mato grosso do sul': 'Campo Grande', 'campo grande ms': 'Campo Grande',
        'bonito ms': 'Bonito', 'corumba': 'Corumbá',
    },
    AR: {
        'palermo': 'Buenos Aires', 'recoleta': 'Buenos Aires', 'san telmo': 'Buenos Aires',
        'puerto madero': 'Buenos Aires', 'microcentro': 'Buenos Aires', 'belgrano': 'Buenos Aires',
        'villa crespo': 'Buenos Aires', 'caballito': 'Buenos Aires', 'flores': 'Buenos Aires',
        'colegiales': 'Buenos Aires', 'nunez': 'Buenos Aires', 'almagro': 'Buenos Aires',
        'boedo': 'Buenos Aires', 'la boca': 'Buenos Aires', 'villa del parque': 'Buenos Aires',
        // Mendoza
        'mendoza city centre': 'Mendoza', 'chacras de coria': 'Chacras de Coria',
        // Bariloche
        'bariloche centro': 'Bariloche', 'lago nahuel huapi': 'Bariloche',
        // Cordoba Argentina
        'nueva cordoba': 'Córdoba', 'general paz cordoba': 'Córdoba',
        // Salta
        'salta centro': 'Salta',
        // Puerto Madryn / Patagonia
        'puerto madryn city': 'Puerto Madryn',
        // El Calafate / Perito Moreno
        'el calafate city': 'El Calafate',
        // Ushuaia
        'ushuaia city': 'Ushuaia',
        // Iguazu
        'puerto iguazu': 'Puerto Iguazú',
        // Buenos Aires extras
        'palermo soho': 'Buenos Aires', 'palermo hollywood': 'Buenos Aires',
        'palermo chico': 'Buenos Aires', 'palermo viejo': 'Buenos Aires',
        'villa urquiza': 'Buenos Aires', 'liniers': 'Buenos Aires',
        'tigre delta': 'Tigre',
        // Mendoza wine region
        'mendoza wine region': 'Mendoza', 'maipú mendoza': 'Mendoza',
        'lujan de cuyo': 'Mendoza',
        // Patagonia extras
        'san carlos de bariloche': 'Bariloche', 'villa la angostura': 'Villa La Angostura',
        'san martin de los andes': 'San Martin de los Andes',
        'perito moreno glacier': 'El Calafate', 'el chalten': 'El Chaltén',
        // Northern Argentina
        'cafayate salta': 'Cafayate', 'tilcara': 'Tilcara (und Umgebung)', 'purmamarca': 'Purmamarca',
        'jujuy city': 'Jujuy',
        // Wine routes
        'san juan argentina': 'San Juan',
        // Other cities
        'rosario city': 'Rosario', 'mar del plata': 'Mar del Plata',
        'cordoba centro': 'Córdoba',
        // Buenos Aires extra neighborhoods
        'monserrat': 'Buenos Aires', 'retiro buenos aires': 'Buenos Aires', 'constitucion ba': 'Buenos Aires',
        'chacarita': 'Buenos Aires', 'barracas': 'Buenos Aires', 'parque patricios': 'Buenos Aires',
        'saavedra': 'Buenos Aires', 'palermo las canitas': 'Buenos Aires', 'agronomia': 'Buenos Aires',
        'villa urquiza norte': 'Buenos Aires', 'parque centenario': 'Buenos Aires',
        'villa ortuzar': 'Buenos Aires', 'parque chacabuco': 'Buenos Aires',
        // Córdoba extras
        'alberdi cordoba': 'Córdoba', 'guemes cordoba': 'Córdoba', 'centro cordoba': 'Córdoba',
        'cerro las rosas': 'Córdoba', 'villa carlos paz': 'Villa Carlos Paz',
        // Mendoza metro
        'godoy cruz mendoza': 'Mendoza', 'las heras mendoza': 'Mendoza', 'guaymallen': 'Mendoza',
        // Rosario extras
        'pichincha rosario': 'Rosario', 'centro rosario': 'Rosario', 'puerto norte rosario': 'Rosario',
        // Mar del Plata extras
        'la perla mar del plata': 'Mar del Plata', 'centro mar del plata': 'Mar del Plata',
        'punta mogotes': 'Mar del Plata',
        // Patagonia extras
        'neuquen city': 'Neuquen', 'rio gallegos city': 'Rio Gallegos', 'comodoro rivadavia': 'Comodoro Rivadavia',
        'viedma city': 'Viedma', 'rawson chubut': 'Puerto Madryn', 'trelew city': 'Trelew',
        // Northern Argentina extras
        'humahuaca quebrada': 'Jujuy', 'iruya village': 'Iruya',
        // Mesopotamia
        'corrientes city': 'Corrientes', 'posadas city': 'Posadas',
        'resistencia chaco': 'Resistencia', 'formosa city': 'Formosa',
        // Buenos Aires Province
        'la plata city': 'La Plata', 'quilmes city': 'Buenos Aires', 'lanus city': 'Buenos Aires',
        'moron city': 'Buenos Aires', 'merlo buenos aires': 'Merlo', 'san isidro argentina': 'San Isidro',
        'san fernando argentina': 'Buenos Aires', 'pilar buenos aires': 'Pilar',
    },
    CL: {
        'las condes': 'Santiago', 'providencia': 'Santiago', 'vitacura': 'Santiago',
        'barrio italia': 'Santiago', 'bellavista': 'Santiago', 'nunooa': 'Santiago',
        'miraflores santiago': 'Santiago', 'centro santiago': 'Santiago', 'lastarria': 'Santiago',
        'cerro alegre': 'Valparaiso', 'cerro concepcion': 'Valparaiso',
        // Chile extras
        'vina del mar city': 'Viña del Mar', 'reñaca': 'Viña del Mar',
        'san pedro atacama': 'San Pedro de Atacama (und Umgebung)', 'atacama salt flat': 'San Pedro de Atacama (und Umgebung)',
        'torres del paine area': 'Puerto Natales', 'puerto natales city': 'Puerto Natales',
        'punta arenas city': 'Punta Arenas', 'tierra del fuego chile': 'Punta Arenas',
        'puerto montt city': 'Puerto Montt', 'puerto varas city': 'Puerto Varas',
        'chiloe island': 'Castro', 'castro chiloe': 'Castro', 'ancud': 'Ancud',
        'osorno city': 'Osorno', 'temuco city': 'Temuco',
        'concepcion chile': 'Concepción',
        'iquique city': 'Iquique (und Umgebung)', 'antofagasta city': 'Antofagasta',
        'arica city': 'Arica',
        // Santiago extra neighborhoods
        'nunoa': 'Santiago', 'macul': 'Santiago', 'la reina': 'Santiago', 'la florida': 'Santiago',
        'penalolen': 'Santiago', 'lo barnechea': 'Lo Barnechea', 'san miguel santiago': 'Santiago',
        'maipu santiago': 'Santiago', 'estacion central': 'Santiago', 'san joaquin': 'Santiago',
        'pedro aguirre cerda': 'Santiago', 'lo prado': 'Santiago', 'cerro navia': 'Santiago',
        'pudahuel': 'Santiago', 'quilicura': 'Santiago', 'conchali': 'Santiago',
        // Valparaíso extras
        'cerro bellavista': 'Valparaiso', 'el almendral': 'Valparaiso', 'cerro florida': 'Valparaiso',
        // Northern Chile / Atacama
        'la serena city': 'La Serena', 'coquimbo city': 'Coquimbo', 'ovalle city': 'Ovalle',
        'valle del elqui': 'Vicuña', 'pisco elqui': 'La Serena', 'vicuna city': 'Vicuña',
        'calama city': 'Calama', 'san pedro atacama desert': 'San Pedro de Atacama (und Umgebung)',
        // Lake District
        'pucon city': 'Pucón', 'villarrica city': 'Villarrica', 'valdivia city': 'Valdivia',
        'frutillar town': 'Frutillar', 'llanquihue lake': 'Puerto Montt', 'puerto octay': 'Puerto Montt',
        // Easter Island
        'easter island': 'Hanga Roa', 'hanga roa': 'Hanga Roa', 'rapa nui': 'Hanga Roa',
        // Aysen / Patagonia
        'coyhaique city': 'Coyhaique (und Umgebung)', 'cochrane chile': 'Cochrane', 'caleta tortel': 'Puerto Montt',
        'villa o higgins': 'Villa O\'Higgins',
        // Chiloé extras
        'dalcahue': 'Dalcahue', 'quemchi': 'Ancud', 'achao chiloe': 'Castro',
        // Central Valley
        'rancagua city': 'Rancagua', 'talca city': 'Talca', 'linares city': 'Linares',
        'chillan city': 'Chillán', 'los angeles chile': 'Los Angeles',
    },
    CO: {
        'chapinero': 'Bogotá', 'zona rosa bogota': 'Bogotá', 'usaquen': 'Bogotá',
        'la candelaria': 'Bogotá', 'teusaquillo': 'Bogotá', 'el poblado': 'Medellín',
        'laureles': 'Medellín', 'envigado': 'Medellín', 'bello': 'Medellín',
        'getsemani': 'Cartagena', 'centro historico cartagena': 'Cartagena',
        'bocagrande': 'Cartagena', 'manga': 'Cartagena',
        // Santa Marta
        'rodadero': 'Santa Marta', 'santa marta old town': 'Santa Marta',
        'taganga': 'Santa Marta',
        // Cali
        'el poblado cali': 'Cali', 'granada cali': 'Cali', 'san antonio cali': 'Cali',
        // Salento / Coffee Region
        'salento colombia': 'Salento', 'quindio': 'Armenien',
        // Barranquilla
        'el prado barranquilla': 'Barranquilla (und Umgebung)',
        // San Andres Island
        'san andres city': 'San Andrés',
        // Colombia extras
        'minca sierra': 'Minca', 'tayrona park area': 'Santa Marta',
        'isla rosario': 'Cartagena', 'playa blanca colombia': 'Cartagena',
        'pereira city': 'Pereira', 'manizales city': 'Manizales',
        'armenia quindio': 'Armenien',
        'bucaramanga city': 'Bucaramanga', 'cucuta city': 'Cúcuta',
        'villa de leyva': 'Villa de Leyva', 'guatape': 'Guatape',
        'jardin antioquia': 'Jardin',
        'nuqui choco': 'Nuqui',
        // More Medellin metro
        'belen medellin': 'Medellín', 'floresta medellin': 'Medellín',
        'sabaneta': 'Sabaneta', 'itaguí': 'Itagui', 'itagui': 'Itagui',
        'rionegro antioquia': 'Rionegro', 'la ceja': 'La Ceja', 'marinilla': 'Marinilla',
        'santa elena medellin': 'Medellín', 'guayabal medellin': 'Medellín',
        'el centro medellin': 'Medellín', 'aranjuez medellin': 'Medellín',
        // More Bogota neighborhoods
        'santa barbara bogota': 'Bogotá', 'el chico bogota': 'Bogotá',
        'parque 93': 'Bogotá', 'cedritos bogota': 'Bogotá', 'el lago bogota': 'Bogotá',
        'salitre bogota': 'Bogotá', 'modelia bogota': 'Bogotá', 'fontibon bogota': 'Bogotá',
        'kennedy bogota': 'Bogotá', 'suba bogota': 'Bogotá', 'engativa bogota': 'Bogotá',
        'barrios unidos bogota': 'Bogotá', 'santa fe bogota': 'Bogotá',
        'chapinero alto': 'Bogotá', 'gran sabana bogota': 'Bogotá',
        // More Caribbean
        'monteria city': 'Monteria', 'sincelejo city': 'Sincelejo',
        'lorica colombia': 'Barranquilla (und Umgebung)', 'covenas beach': 'Coveñas',
        'san onofre beach': 'Cartagena', 'tolu beach': 'Tolú',
        // Pacific coast
        'bahia solano': 'Bahía Solano', 'buenaventura city': 'Buenaventura',
        'guapi city': 'Buenaventura', 'tumaco city': 'Tumaco',
        // Amazon
        'leticia amazon': 'Leticia', 'puerto narino': 'Puerto Narino',
        // Llanos / Casanare
        'yopal city': 'Yopal', 'villavicencio city': 'Villavicencio',
        'granada meta': 'Villavicencio', 'acacias meta': 'Acacias',
        // More inland cities
        'neiva city': 'Neiva', 'florencia colombia': 'Florencia',
        'popayan city': 'Popayan', 'san agustin colombia': 'San Agustin',
        'pasto city': 'Pasto', 'ipiales city': 'Ipiales',
        'tunja city': 'Tunja', 'duitama city': 'Duitama', 'sogamoso city': 'Sogamoso',
        'barichara colonial': 'Barichara', 'giron city': 'Girón',
        'ibague city': 'Ibague', 'espinal tolima': 'Ibague',
        'armenia centro': 'Armenien', 'buga city': 'Buga',
    },
    PE: {
        'miraflores': 'Lima', 'barranco': 'Lima', 'san isidro': 'Lima', 'surco': 'Lima',
        'la molina': 'Lima', 'magdalena': 'Lima', 'pueblo libre': 'Lima',
        'lince': 'Lima', 'san borja': 'Lima', 'jesus maria': 'Lima',
        'central lima': 'Lima', 'callao': 'Lima',
        // Cusco / Machu Picchu
        'cusco san blas': 'Cuzco', 'cusco plaza': 'Cuzco', 'san pedro cusco': 'Cuzco',
        'aguas calientes': 'Aguas Calientes', 'machu picchu pueblo': 'Aguas Calientes',
        // Arequipa
        'arequipa city centre': 'Arequipa', 'yanahuara': 'Arequipa',
        // Puno / Lake Titicaca
        'puno city': 'Puno', 'lake titicaca area': 'Puno',
        // Iquitos
        'iquitos city': 'Iquitos (und Umgebung)',
        // Trujillo
        'trujillo centro': 'Trujillo',
        // Peru extras
        'huaraz city': 'Huaraz', 'santa cruz trek area': 'Huaraz',
        'nazca lines area': 'Nazca', 'paracas beach': 'Paracas',
        'ica city': 'Ica', 'huacachina oasis': 'Ica',
        'chiclayo city': 'Chiclayo (und Umgebung)', 'chan chan ruins': 'Trujillo',
        'tarapoto city': 'Tarapoto', 'moyobamba': 'Moyobamba',
        'chachapoyas': 'Chachapoyas', 'kuelap fortress': 'Chachapoyas',
        'puno lago titicaca': 'Puno', 'copacabana peru bolivia': 'Puno',
        'ollantaytambo ruins': 'Ollantaytambo', 'pisac village': 'Pisac',
        'urubamba valley': 'Urubamba',
        // Lima neighborhoods
        'san miguel lima': 'Lima', 'ate vitarte': 'Lima', 'chorrillos': 'Lima',
        'san juan de lurigancho': 'Lima', 'los olivos lima': 'Lima', 'comas lima': 'Lima',
        'villa el salvador': 'Lima', 'surquillo': 'Lima', 'breña lima': 'Lima',
        'rimac lima': 'Lima', 'san martin de porres': 'Lima', 'independencia lima': 'Lima',
        'carabayllo lima': 'Lima', 'san bartolo lima': 'Lima', 'pachacamac lima': 'Lima',
        'lurin lima': 'Lima', 'punta hermosa': 'Lima', 'pucusana': 'Lima',
        // Cusco extras
        'chinchero': 'Chinchero', 'moray salt mines': 'Maras', 'maras cusco': 'Maras',
        'salineras de maras': 'Maras', 'san sebastian cusco': 'Cuzco', 'san jeronimo cusco': 'Cuzco',
        // Arequipa extras
        'cayma arequipa': 'Arequipa', 'cerro colorado arequipa': 'Arequipa', 'miraflores arequipa': 'Arequipa',
        'jose luis bustamante': 'Arequipa', 'hunter arequipa': 'Arequipa',
        'colca canyon': 'Chivay', 'chivay arequipa': 'Chivay',
        // Puno extras
        'juli puno': 'Puno', 'pomata lake': 'Puno', 'ilave puno': 'Puno',
        // Amazon
        'nauta loreto': 'Nauta', 'requena loreto': 'Iquitos (und Umgebung)', 'yurimaguas': 'Yurimaguas',
        // Northern coast
        'mancora beach': 'Máncora (und Umgebung)', 'los organos beach': 'Los Organos', 'vichayito beach': 'Piura',
        'zorritos tumbes': 'Zorritos', 'tumbes city': 'Tumbes',
        // Southern coast
        'camana arequipa': 'Arequipa', 'mollendo beach': 'Arequipa', 'matarani port': 'Arequipa',
        // Highlands extras
        'ayacucho city': 'Ayacucho', 'wari ruins': 'Ayacucho',
        'cajamarca city': 'Cajamarca (und Umgebung)', 'ventanillas de otuzco': 'Cajamarca (und Umgebung)',
        'piura city': 'Piura', 'catacaos piura': 'Piura',
        'lambayeque city': 'Chiclayo (und Umgebung)', 'sipan museum': 'Chiclayo (und Umgebung)',
        // Junin / Central
        'huancayo city': 'Huancayo', 'tarma city': 'Tarma', 'la oroya': 'Huancayo',
        'junin lake': 'Huancayo', 'cerro de pasco': 'Huancayo',
    },
    EC: {
        'la mariscal': 'Quito', 'la carolina': 'Quito', 'cumbaya': 'Quito',
        'malecon simon bolivar': 'Guayaquil (und Umgebung)', 'las penas': 'Guayaquil (und Umgebung)',
        // Ecuador extras
        'quito historic center': 'Quito', 'quito old town': 'Quito',
        'guayaquil malecon': 'Guayaquil (und Umgebung)', 'salinas ecuador': 'Salinas',
        'montanita beach': 'Montanita', 'canoa beach': 'Canoa',
        'banos de agua santa': 'Banos', 'puyo city': 'Puyo',
        'cuenca city': 'Cuenca', 'cuenca old town': 'Cuenca',
        'galapagos santa cruz': 'Puerto Ayora', 'galapagos san cristobal': 'Puerto Baquerizo Moreno',
        'otavalo market': 'Otavalo', 'cotacachi': 'Cotacachi',
        // ── extended coverage ──
        'centro historico quito': 'Quito', 'la floresta': 'Quito',
        'guapulo': 'Quito', 'mitad del mundo': 'Quito',
        'galapagos': 'Puerto Ayora', 'puerto ayora': 'Puerto Ayora',
        'santa cruz galapagos': 'Puerto Ayora', 'san cristobal galapagos': 'Puerto Baquerizo Moreno',
        'isabela galapagos': 'Puerto Villamil', 'puerto villamil': 'Puerto Villamil',
        'cuenca ecuador': 'Cuenca', 'banos ecuador': 'Banos',
        'montanita': 'Montanita', 'manta': 'Manta',
        'puerto lopez': 'Puerto Lopez', 'canoa ecuador': 'Canoa',
        'otavalo': 'Otavalo', 'mindo': 'Mindo',
        'cotopaxi': 'Latacunga', 'latacunga': 'Latacunga',
        'quilotoa': 'Latacunga', 'riobamba': 'Riobamba',
        'vilcabamba': 'Vilcabamba', 'loja': 'Loja',
        'tena': 'Tena', 'puyo': 'Puyo',
        'coca ecuador': 'Coca',
    },
    UY: {
        'pocitos': 'Montevideo', 'ciudad vieja': 'Montevideo', 'punta carretas': 'Montevideo',
        'punta del este downtown': 'Punta del Este',
        // Uruguay extras
        'parque rodo': 'Montevideo', 'buceo': 'Montevideo', 'carrasco': 'Montevideo',
        'malvin': 'Montevideo', 'la blanqueada': 'Montevideo',
        'colonia del sacramento': 'Colonia del Sacramento',
        'la paloma uy': 'La Paloma', 'piriapolis': 'Piriápolis',
        'salto uruguay': 'Salto',
        // More Montevideo neighborhoods
        'centro montevideo': 'Montevideo', 'barrio sur': 'Montevideo',
        'tres cruces': 'Montevideo', 'goes': 'Montevideo',
        'cordon montevideo': 'Montevideo', 'palermo montevideo': 'Montevideo',
        'punta gorda uy': 'Montevideo', 'bella vista montevideo': 'Montevideo',
        'union montevideo': 'Montevideo', 'colon uy': 'Montevideo',
        'cerro montevideo': 'Montevideo', 'aguada montevideo': 'Montevideo',
        'ciudad vieja uy': 'Montevideo',
        // More Uruguay cities
        'jose ignacio': 'José Ignacio', 'punta del diablo': 'Punta del Diablo',
        'rocha uruguay': 'La Paloma', 'maldonado uy': 'Maldonado',
        'pan de azucar': 'Piriápolis', 'treinta y tres': 'Treinta-y-Tres',
        'mercedes uruguay': 'Mercedes', 'paysandu': 'Paysandú',
        'fray bentos': 'Fray Bentos', 'canelones': 'Montevideo',
        'las piedras uy': 'Montevideo', 'san jose de mayo': 'Montevideo',
        'florida uruguay': 'Montevideo', 'minas uy': 'Piriápolis',
        'melo uruguay': 'Rivera', 'rivera uruguay': 'Rivera',
        'tacuarembo': 'Paso De Los Toros', 'artigas uy': 'Rivera',
        // ── extended coverage ──
        'rambla montevideo': 'Montevideo', 'punta del este': 'Punta del Este',
        'playa brava': 'Punta del Este', 'playa mansa': 'Punta del Este',
        'la barra': 'La Barra', 'manantiales': 'Punta del Este',
        'punta ballena': 'Punta Ballena', 'barrio historico colonia': 'Colonia del Sacramento',
        'carmelo': 'Carmelo', 'cabo polonio': 'Cabo Polonio',
        'la paloma uruguay': 'La Paloma', 'la pedrera': 'La Pedrera',
        'termas del dayman': 'Salto',
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
        'salford': 'Salford', 'didsbury': 'Manchester', 'chorlton': 'Manchester',
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
        'hove': 'Hove', 'seven dials brighton': 'Brighton',
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
        // Scotland Highlands & Islands
        'inverness city': 'Inverness', 'loch ness area': 'Inverness',
        'fort william highlands': 'Fort William', 'ben nevis area': 'Fort William',
        'glencoe': 'Fort William', 'ballachulish': 'Fort William',
        'oban city': 'Oban', 'mull island': 'Oban', 'iona island': 'Oban',
        'st andrews fife': 'Dundee', 'golf course st andrews': 'Dundee',
        'stirling city': 'Stirling', 'stirling castle area': 'Stirling',
        'perth scotland': 'Perth', 'dundee city': 'Dundee',
        'aberdeen city': 'Aberdeen', 'union street aberdeen': 'Aberdeen',
        'kyle of lochalsh': 'Kyle of Lochalsh', 'skye island': 'Inverness', 'portree': 'Inverness',
        'isle of arran': 'Ayr', 'brodick': 'Ayr',
        'aviemore': 'Aviemore', 'cairngorms': 'Aviemore',
        'pitlochry': 'Pitlochry',
        // Lake District England
        'windermere': 'Windermere', 'ambleside': 'Ambleside', 'keswick': 'Keswick',
        'grasmere': 'Grasmere', 'coniston': 'Coniston', 'bowness on windermere': 'Windermere',
        // Cornwall
        'st ives cornwall': 'St. Ives', 'newquay cornwall': 'Newquay',
        'padstow': 'Padstow', 'penzance': 'Penzance', 'falmouth': 'Falmouth',
        'fowey': 'Fowey', 'looe cornwall': 'Looe', 'bude': 'Bude',
        'lands end area': 'Penzance',
        // Cotswolds
        'bourton on the water': 'Bourton-on-the-Water',
        'chipping campden': 'Chipping Campden',
        'chipping norton': 'Chipping Norton',
        'burford': 'Burford', 'stow on the wold': 'Stow-on-the-Wold',
        'broadway cotswolds': 'Broadway', 'bibury': 'Cirencester',
        // Wales extras
        'snowdonia area': 'Bangor', 'llandudno': 'Llandudno', 'beaumaris': 'Beaumaris',
        'pembrokeshire': 'Tenby', 'tenby': 'Tenby',
        'aberystwyth': 'Aberystwyth',
        // Peak District / Midlands extras
        'bakewell': 'Bakewell', 'castleton derbyshire': 'Sheffield',
        'matlock bath': 'Matlock',
        'stratford upon avon': 'Stratford-upon-Avon',
        'warwick city': 'Warwick',
        // Yorkshire extras
        'harrogate': 'Harrogate', 'ripon': 'Ripon', 'whitby': 'Whitby',
        'scarborough yorkshire': 'Scarborough', 'robin hoods bay': 'Whitby',
        // Durham / Northumberland
        'durham city': 'Durham', 'alnwick': 'Alnwick',
        // Somerset / Bath area
        'wells somerset': 'Wells', 'glastonbury': 'Glastonbury',
        'frome': 'Bath',
        // Hampshire / Dorset
        'portsmouth city': 'Portsmouth', 'southampton city': 'Southampton',
        'bournemouth city': 'Bournemouth', 'poole': 'Poole',
        'dorchester': 'Dorchester', 'weymouth': 'Weymouth',
        // Suffolk / Norfolk
        'norfolk broads': 'Norwich',
        'bury st edmunds': 'Bury St.Edmunds', 'sudbury suffolk': 'Sudbury',
        // Gloucestershire
        'cheltenham city': 'Cheltenham', 'gloucester city': 'Gloucester',
        // Kent
        'canterbury city': 'Canterbury', 'folkestone': 'Folkestone', 'dover kent': 'Dover',
        // Essex / Hertfordshire
        'colchester city': 'Colchester', 'chelmsford': 'Chelmsford',
        // More London areas
        'vauxhall': 'London', 'kennington': 'London', 'oval london': 'London',
        'stockwell': 'London', 'clapham': 'London', 'balham': 'London',
        'tooting': 'London', 'streatham': 'London', 'norwood': 'London',
        'lewisham': 'London', 'new cross': 'London', 'deptford': 'London',
        'brockley': 'London', 'catford': 'London', 'forest hill': 'London',
        'sydenham': 'London', 'honour oak': 'London',
        'walthamstow': 'London', 'leyton': 'London', 'leytonstone': 'London',
        'forest gate': 'London', 'manor park': 'London', 'ilford': 'London',
        'barking': 'London', 'dagenham': 'London',
        'bow': 'London', 'mile end': 'London', 'stepney': 'London',
        'whitechapel': 'London', 'aldgate': 'London', 'liverpool street area': 'London',
        'moorgate': 'London', 'barbican': 'London',
        'stoke newington': 'London', 'dalston': 'London', 'kingsland': 'London',
        'tottenham': 'London', 'wood green': 'London', 'enfield': 'London',
        'finchley': 'London', 'barnet': 'London', 'hendon': 'London',
        'edgware': 'London', 'stanmore': 'London', 'harrow': 'London',
        'wembley': 'London', 'ealing': 'London', 'southall': 'London',
        'acton': 'London', 'chiswick': 'London', 'kew': 'London',
        'brentford': 'London', 'hounslow': 'London', 'hayes': 'London',
        'uxbridge': 'London', 'hillingdon': 'London',
        'sutton london': 'London', 'morden': 'London', 'mitcham': 'London',
        'colliers wood': 'London', 'tooting bec': 'London',
        // More London landmarks/areas
        'kings road chelsea': 'London', 'sloane square': 'London', 'belgravia': 'London',
        'pimlico': 'London', 'victoria london': 'London', 'nine elms': 'London',
        'battersea power station': 'London', 'southwark': 'London',
        'london bridge area': 'London', 'borough market': 'London',
        'tower hill': 'London', 'wapping': 'London', 'rotherhithe': 'London',
        'bermondsey street': 'London', 'hays galleria': 'London',
        'spitalfields': 'London', 'brick lane': 'London', 'columbia road': 'London',
        // More UK cities
        'plymouth city': 'Plymouth', 'torquay': 'Torquay', 'paignton': 'Torquay',
        'exeter quayside': 'Exeter', 'tiverton': 'Tiverton',
        'taunton': 'Taunton', 'yeovil': 'Yeovil', 'bridgwater': 'Bridgwater',
        'reading city': 'Reading', 'slough': 'Slough', 'windsor': 'Windsor',
        'maidenhead': 'Maidenhead',
        'guildford': 'Guildford', 'woking': 'Woking', 'epsom': 'Epsom',
        'maidstone': 'Maidstone', 'tunbridge wells': 'Royal Tunbridge Wells',
        'eastbourne': 'Eastbourne', 'hastings': 'Hastings', 'lewes': 'Lewes',
        'worthing': 'Worthing', 'bognor regis': 'Bognor Regis', 'chichester': 'Chichester',
        'ipswich': 'Ipswich', 'cambridge suburbs': 'Cambridge',
        'king s lynn': 'King\'s Lynn', 'great yarmouth': 'Great Yarmouth',
        'northampton': 'Northampton', 'coventry city': 'Coventry',
        'wolverhampton': 'Wolverhampton', 'walsall': 'Walsall',
        'stoke on trent': 'Stoke-on-Trent', 'derby city': 'Derby',
        'shrewsbury': 'Shrewsbury', 'hereford': 'Hereford',
        'worcester': 'Worcester', 'kingston upon hull': 'Hull',
        'hull city': 'Hull', 'beverley yorkshire': 'Beverley',
        'york centre': 'York', 'doncaster': 'Doncaster', 'rotherham': 'Rotherham',
        'barnsley': 'Barnsley', 'wakefield': 'Wakefield', 'bradford city': 'Bradford',
        'huddersfield': 'Huddersfield', 'halifax west yorkshire': 'Halifax',
        'carlisle': 'Carlisle', 'lancaster': 'Lancaster', 'preston': 'Preston',
        'blackpool city': 'Blackpool', 'southport': 'Southport', 'wigan': 'Wigan',
        'bolton': 'Bolton', 'bury lancashire': 'Bury', 'rochdale': 'Rochdale',
        'oldham': 'Oldham', 'stockport': 'Stockport',
        'sunderland': 'Sunderland', 'middlesbrough': 'Middlesbrough',
        'darlington': 'Darlington', 'hartlepool': 'Hartlepool',
    },
    // ── Ireland ───────────────────────────────────────────────────────────────
    IE: {
        // Dublin city and its commuter towns
        'temple bar': 'Dublin', 'grafton street': 'Dublin',
        'st stephens green': 'Dublin', "o'connell street": 'Dublin',
        'dublin city centre': 'Dublin', 'dublin docklands': 'Dublin',
        'ballsbridge': 'Dublin', 'rathmines': 'Dublin',
        'ranelagh': 'Dublin', 'smithfield': 'Dublin',
        'the liberties': 'Dublin', 'phibsborough': 'Dublin',
        'drumcondra': 'Dublin', 'clontarf': 'Dublin',
        'dun laoghaire': 'Dublin', 'howth': 'Dublin',
        'malahide': 'Dublin', 'blackrock dublin': 'Dublin',
        'sandyford': 'Dublin', 'tallaght': 'Dublin',
        'swords': 'Dublin', 'dublin airport': 'Dublin',
        'trinity college dublin': 'Dublin', 'guinness storehouse': 'Dublin',
        'cork city': 'Cork', 'blarney': 'Cork',
        'douglas cork': 'Cork', 'kinsale': 'Kinsale',
        'cobh': 'Cobh', 'clonakilty': 'Clonakilty',
        'bantry': 'Bantry', 'galway city': 'Galway',
        'salthill': 'Galway', 'eyre square': 'Galway',
        'connemara': 'Clifden', 'clifden': 'Clifden',
        'westport mayo': 'Westport', 'achill island': 'Westport',
        'sligo town': 'Sligo', 'donegal town': 'Donegal',
        'killarney national park': 'Killarney', 'ring of kerry': 'Killarney',
        'muckross': 'Killarney', 'dingle peninsula': 'Dingle',
        'kenmare': 'Kenmare', 'tralee': 'Tralee',
        'adare': 'Adare', 'cliffs of moher': 'Doolin',
        'doolin': 'Doolin', 'lahinch': 'Lahinch',
        'ennis': 'Ennis', 'bunratty': 'Shannon',
        'shannon airport': 'Shannon', 'kilkenny city': 'Kilkenny',
        'waterford city': 'Waterford', 'wexford town': 'Wexford',
        'rosslare': 'Rosslare', 'athlone': 'Athlone',
        'glendalough': 'Wicklow', 'wicklow town': 'Wicklow',
        'newgrange': 'Drogheda', 'drogheda': 'Drogheda',
        'dundalk': 'Dundalk', 'cashel': 'Cashel',
        'limerick city': 'Limerick',
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
        'vieux nice': 'Nizza', 'promenade des anglais': 'Nizza', 'cimiez': 'Nizza',
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
        // Normandy
        'mont saint michel area': 'Le Mont-Saint-Michel',
        'bayeux city': 'Bayeux', 'honfleur city': 'Honfleur', 'etretat cliffs': 'Le Havre',
        'deauville city': 'Deauville', 'trouville': 'Deauville',
        'rouen old town': 'Rouen', 'rouen cathedral': 'Rouen',
        'd-day beaches': 'Bayeux',
        // Corsica
        'ajaccio city': 'Ajaccio', 'bastia city': 'Bastia',
        'porto vecchio': 'Porto-Vecchio', 'bonifacio corsica': 'Bonifacio',
        'calvi corsica': 'Calvi', 'ile rousse': 'L\'Ile-Rousse',
        'corte': 'Corte',
        // French Alps ski resorts
        'chamonix village': 'Chamonix', 'mont blanc area': 'Chamonix',
        'courchevel village': 'Courchevel', 'megeve village': 'Chamonix',
        'meribel village': 'Courchevel', 'val disere': 'Val-d\'Isere',
        'les gets': 'Les Gets', 'morzine': 'Morzine', 'les arcs': 'Bourg-Saint-Maurice',
        'la plagne': 'Bourg-Saint-Maurice', 'val thorens': 'Val Thorens',
        'alpe d huez': 'Alpe-d\'Huez',
        // Loire Valley
        'amboise town': 'Amboise', 'tours city': 'Tours',
        'blois city': 'Blois', 'chinon castle area': 'Chinon',
        // Dordogne / Perigord
        'sarlat la caneda': 'Sarlat-la-Caneda', 'sarlat': 'Sarlat-la-Caneda',
        'les eyzies': 'Les Eyzies-de-Tayac-Sireuil',
        // Basque Country extras
        'saint jean de luz': 'Saint-Jean-de-Luz', 'hendaye': 'Hendaye',
        // French Riviera extras
        'antibes old town': 'Antibes', 'juan les pins': 'Antibes',
        'eze village': 'Nizza', 'saint paul de vence': 'Saint-Paul de Vence',
        'grasse city': 'Grasse',
        'saint tropez village': 'Saint-Tropez', 'ramatuelle': 'Saint-Tropez',
        'port grimaud': 'Sainte-Maxime',
        'cassis village': 'Cassis',
        // Rhone extras
        'chablis wine area': 'Auxerre', 'beaune wine town': 'Beaune',
        // Alsace extras
        'eguisheim village': 'Eguisheim', 'kaysersberg': 'Kaysersberg',
        'obernai': 'Obernai', 'ribeauville': 'Ribeauville',
        // Brittany extras
        'vannes old town': 'Vannes', 'quimper city': 'Quimper',
        'concarneau': 'Concarneau', 'brest city': 'Brest',
        // Provence extras
        'les baux de provence': 'Les Baux-de-Provence',
        'pont du gard': 'Uzes', 'uzès': 'Uzes',
        'saint remy de provence': 'Saint-Rémy-de-Provence',
        // Paris outskirts
        'fontainebleau': 'Fontainebleau', 'versailles park': 'Versailles',
        'marne la vallee': 'Marne-la-Vallée', 'val d europe': 'Marne-la-Vallée',
        // More Paris arrondissements and neighborhoods
        'saint-sulpice': 'Paris', 'temple paris': 'Paris', 'sentier paris': 'Paris',
        'popincourt': 'Paris', 'folie-méricourt': 'Paris', 'saint-ambroise': 'Paris',
        'roquette': 'Paris', 'sainte-marguerite': 'Paris',
        'quinze-vingts': 'Paris', 'bel-air paris': 'Paris', 'picpus': 'Paris',
        'bercy paris': 'Paris', 'charenton': 'Paris',
        'place d italie': 'Paris', 'tolbiac': 'Paris', 'maison blanche': 'Paris',
        'croulebarbe': 'Paris', 'gare de lyon area': 'Paris', 'gare du nord area': 'Paris',
        'le marais north': 'Paris', 'arts et metiers paris': 'Paris',
        'plaine monceau': 'Paris', 'villiers paris': 'Paris',
        'ternes paris': 'Paris', 'porte maillot': 'Paris',
        'muette paris': 'Paris', 'auteuil': 'Paris', 'saint cloud': 'Saint-Cloud',
        'issy les moulineaux': 'Paris', 'clamart': 'Paris',
        'vincennes city': 'Vincennes', 'charenton le pont': 'Charenton-le-Pont',
        // More French cities
        'clermont-ferrand': 'Clermont-Ferrand', 'vichy city': 'Vichy',
        'limoges city': 'Limoges', 'perigueux': 'Périgueux',
        'cahors city': 'Cahors', 'agen city': 'Agen',
        'pau city': 'Pau', 'tarbes city': 'Tarbes',
        'angouleme city': 'Angoulême', 'la rochelle vieux port': 'La Rochelle',
        'nimes city': 'Nîmes', 'lunel': 'Lunel',
        'arles city': 'Arles', 'arles roman ruins': 'Arles',
        'aix en provence old town': 'Aix-en-Provence',
        'toulon city': 'Toulon', 'hyeres': 'Hyères',
        'frejus city': 'Fréjus', 'draguignan': 'Draguignan',
        'menton city': 'Menton', 'beausoleil': 'Beausoleil',
        'valence city': 'Valence', 'romans sur isere': 'Romans-sur-Isère',
        'chambery city': 'Chambéry', 'aix les bains': 'Aix-les-Bains',
        'albertville': 'Albertville', 'bourg en bresse': 'Bourg-en-Bresse',
        'macon city': 'Mâcon', 'chalons en champagne': 'Châlons-en-Champagne',
        'reims cathedral area': 'Reims', 'epernay champagne': 'Épernay',
        'nancy city': 'Nancy', 'metz city': 'Metz', 'thionville': 'Thionville',
        'colmar old town': 'Colmar', 'mulhouse city': 'Colmar',
        'belfort city': 'Belfort', 'besancon city': 'Besançon',
        'amiens cathedral': 'Amiens', 'calais city': 'Calais', 'dunkirk': 'Calais',
        'arras city': 'Arras', 'saint-omer': 'Saint-Omer',
        'caen city': 'Caen', 'lisieux city': 'Lisieux', 'flers': 'Flers',
        'cherbourg city': 'Cherbourg', 'granville normandy': 'Granville',
        'rennes suburbs': 'Rennes', 'saint brieuc': 'Saint-Brieuc', 'lorient': 'Lorient',
        'la baule': 'La Baule-Escoublac', 'nantes city': 'Nantes',
        'la mans city': 'Le Mans', 'angers city': 'Angers',
        'chartres city': 'Chartres', 'orleans city': 'Orleans',
        'bourges city': 'Bourges', 'chateauroux': 'Châteauroux',
        'poitiers city': 'Poitiers', 'niort city': 'Niort',
        // French overseas plus extras
        'fort de france': 'Fort-de-France', 'saint pierre martinique': 'Fort-de-France',
        'pointe a pitre': 'Pointe-à-Pitre', 'saint francois guadeloupe': 'Pointe-à-Pitre',
        'saint martin french': 'Saint-Martin',
        'cayenne': 'Cayenne', 'kourou': 'Kourou',
        'mamoudzou mayotte': 'Mamoudzou',
        'saint-denis reunion': 'Saint-Denis', 'saint gilles reunion': 'Saint-Denis',
        'saint paul reunion': 'Saint-Denis',
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
        'santa cruz': 'Sevilla', 'triana': 'Sevilla', 'arenal': 'Sevilla',
        'nervion': 'Sevilla', 'alameda': 'Sevilla',
        'albaicin': 'Granada', 'realejo': 'Granada', 'sacromonte': 'Granada',
        'ruzafa': 'Valencia', 'el carmen': 'Valencia', 'cabanyal': 'Valencia',
        'benimaclet': 'Valencia', 'l eixample valencia': 'Valencia',
        'casco viejo bilbao': 'Bilbao', 'abando': 'Bilbao', 'deusto': 'Bilbao',
        'parte vieja': 'San Sebastián', 'gros': 'San Sebastián', 'centro donostia': 'San Sebastián',
        'old town malaga': 'Málaga', 'soho malaga': 'Málaga', 'teatinos': 'Málaga',
        'palma old town': 'Palma de Mallorca', 'santa catalina': 'Palma de Mallorca',
        // Ibiza
        'ibiza old town': 'Ibiza-Stadt', 'dalt vila': 'Ibiza-Stadt', 'playa d en bossa': 'Ibiza-Stadt',
        'ses salines ibiza': 'Ibiza-Stadt', 'santa eulalia': 'Ibiza-Stadt',
        // Mallorca (non-Palma areas)
        'port de pollenca': 'Pollença', 'magaluf': 'Palma de Mallorca',
        // Menorca
        'ciutadella': 'Ciutadella de Menorca', 'es migjorn gran': 'Maó', 'fornells': 'Maó',
        // Tenerife
        'playa de las americas': 'Santa Cruz de Tenerife', 'los cristianos': 'Santa Cruz de Tenerife',
        'puerto de la cruz tenerife': 'Santa Cruz de Tenerife', 'santa cruz tenerife': 'Santa Cruz de Tenerife', 'santa cruz de tenerife': 'Santa Cruz de Tenerife',
        'costa adeje': 'Santa Cruz de Tenerife', 'el medano': 'Santa Cruz de Tenerife',
        // Gran Canaria
        'playa del ingles': 'Las Palmas, Gran Canaria', 'maspalomas': 'Las Palmas, Gran Canaria',
        'puerto rico gran canaria': 'Las Palmas, Gran Canaria',
        // Lanzarote
        'puerto del carmen': 'Arrecife', 'puerto calero': 'Arrecife',
        // Fuerteventura
        'corralejo': 'Puerto del Rosario', 'costa calma': 'Puerto del Rosario',
        // Costa del Sol
        'marbella old town': 'Marbella', 'puerto banus': 'Marbella',
        'estepona old town': 'Estepona', 'nerja centro': 'Nerja',
        'fuengirola': 'Fuengirola', 'benalmadena': 'Benalmadena',
        // Asturias
        'oviedo old town': 'Oviedo', 'gijon waterfront': 'Gijón',
        // Salamanca
        'salamanca city centre': 'Salamanca',
        // Toledo
        'toledo old town': 'Toledo',
        // Cordoba
        'juderia cordoba': 'Córdoba', 'mezquita area': 'Córdoba',
        // Galicia / Camino de Santiago
        'santiago de compostela old town': 'Santiago de Compostela',
        'a coruna city': 'A Coruña', 'lugo city': 'Lugo', 'ourense city': 'Ourense',
        'vigo city': 'Vigo', 'pontevedra city': 'Pontevedra',
        'o grove': 'O Grove', 'illa de arousa': 'Vilagarcía de Arousa',
        // Navarra
        'pamplona city': 'Pamplona', 'san fermin area': 'Pamplona',
        // Cantabria
        'santander city': 'Santander', 'comillas': 'Santander',
        'san vicente de la barquera': 'San Vicente de la Barquera',
        // Costa Brava (Girona)
        'girona old town': 'Girona', 'costa brava area': 'Girona',
        'cadaques': 'Cadaques', 'calella de palafrugell': 'Palafrugell',
        'llafranc': 'Palafrugell', 'begur': 'Begur', 'pals costa brava': 'Pals',
        'tossa de mar': 'Tossa de Mar', 'sitges': 'Sitges',
        // Aragon
        'zaragoza city': 'Zaragoza', 'ordesa park': 'Broto',
        // Extremadura
        'caceres old town': 'Badajoz', 'merida roman ruins': 'Mérida',
        // Murcia / Cartagena
        'cartagena spain': 'Cartagena', 'murcia city': 'Murcia',
        // Alicante Costa Blanca
        'benidorm beach': 'Benidorm', 'alicante city centre': 'Alicante',
        'santa pola': 'Santa Pola', 'denia': 'Benidorm', 'javea': 'Benidorm',
        'altea alicante': 'Altea', 'calpe': 'Benidorm',
        // Canary Islands extras
        'la palma island': 'Santa Cruz de la Palma', 'el hierro island': 'Valverde',
        'la gomera': 'San Sebastián de La Gomera',
        // Mallorca extras
        'soller mallorca': 'Sóller', 'deia mallorca': 'Deià',
        'valldemossa': 'Valldemossa', 'alcudia mallorca': 'Alcúdia',
        'pollensa mallorca': 'Pollença', 'cala rajada': 'Capdepera',
        // Madrid extras
        'moncloa madrid': 'Madrid', 'tetuán madrid': 'Madrid',
        'moratalaz': 'Madrid', 'villa de vallecas': 'Madrid',
        // Barcelona extras
        'horta guinardo': 'Barcelona', 'nou barris barcelona': 'Barcelona',
        'sant marti barcelona': 'Barcelona', 'sagrada familia area': 'Barcelona',
        // Aragon extras
        'teruel city': 'Teruel', 'huesca city': 'Huesca', 'jaca city': 'Jaca',
        // Castilla y León
        'burgos city': 'Burgos', 'leon city': 'León', 'segovia city': 'Segovia',
        'valladolid city': 'Valladolid', 'soria city': 'Soria', 'avila city': 'Ávila',
        'zamora city': 'Zamora', 'palencia city': 'Palencia', 'salamanca plaza mayor': 'Salamanca',
        // Castilla La Mancha
        'cuenca casco antiguo': 'Cuenca', 'cuenca hanging houses': 'Cuenca',
        'albacete city': 'Albacete', 'ciudad real city': 'Ciudad Real',
        'talavera de la reina': 'Talavera de la Reina',
        // More Andalucia
        'almeria city': 'Almeria', 'almeria waterfront': 'Almeria',
        'huelva city': 'Huelva', 'palos de la frontera': 'Huelva',
        'cadiz old town': 'Cadiz', 'cadiz centro': 'Cadiz',
        'jerez de la frontera': 'Jerez de la Frontera', 'jerez bodegas': 'Jerez de la Frontera',
        'el puerto de santa maria': 'El Puerto de Santa María',
        'sanlucar de barrameda': 'Sanlúcar de Barrameda',
        'chipiona': 'Chipiona', 'tarifa town': 'Tarifa', 'zahara de los atunes': 'Zahara de los Atunes',
        'ronda city': 'Ronda', 'antequera city': 'Antequera',
        'velez malaga': 'Velez Málaga', 'motril city': 'Motril',
        // More Basque Country
        'vitoria gasteiz': 'Vitoria-Gasteiz', 'vitoria old town': 'Vitoria-Gasteiz',
        'irun city': 'Irún', 'hondarribia': 'Hondarribia',
        'eibar': 'Eibar', 'zarautz': 'Zarautz', 'getxo': 'Getxo', 'barakaldo': 'Barakaldo',
        // More Valencia region
        'castellon de la plana': 'Castellón de la Plana', 'castellon city': 'Castellón de la Plana',
        'gandia beach': 'Valencia', 'xativa city': 'Xàtiva', 'ontinyent': 'Ontinyent',
        'sagunto city': 'Valencia', 'requena city': 'Requena',
        // More Catalonia
        'tarragona city': 'Tarragona', 'tarragona old town': 'Tarragona',
        'tortosa city': 'Tortosa', 'reus city': 'Reus', 'valls city': 'Valls',
        'lleida city': 'Lleida', 'manresa city': 'Manresa', 'igualada': 'Igualada',
        'vic city catalonia': 'Vic', 'olot city': 'Olot', 'figueres city': 'Figueres',
        'ripoll city': 'Ripoll', 'la seu d urgell': 'La Seu d\'Urgell',
        'puigcerda': 'Puigcerdà', 'baqueira beret': 'Vielha e Mijaran',
        'castelldefels': 'Castelldefels', 'vilafranca del penedes': 'Vilafranca del Penedès',
        'vilanova i la geltru': 'Vilanova i la Geltrú',
        // More Galicia
        'ferrol city': 'Ferrol', 'santiago city': 'Santiago de Compostela',
        'ribadeo': 'Ribadeo', 'viveiro': 'Viveiro', 'burela': 'Burela',
        // More Barcelona neighborhoods
        'sant gervasi': 'Barcelona', 'pedralbes': 'Barcelona', 'sarria sant gervasi': 'Barcelona',
        'sants montjuic': 'Barcelona', 'gracia alta': 'Barcelona', 'sant pere barcelona': 'Barcelona',
        'ribera barcelona': 'Barcelona', 'poblenou 22@': 'Barcelona',
        // More Madrid neighborhoods
        'nueva espana madrid': 'Madrid', 'hispanoamerica madrid': 'Madrid',
        'prosperidad madrid': 'Madrid', 'arturo soria': 'Madrid',
        'ciudad lineal madrid': 'Madrid', 'san blas madrid': 'Madrid',
        'entrevias madrid': 'Madrid', 'villaverde madrid': 'Madrid',
        'ciudad universitaria madrid': 'Madrid', 'moncloa ciudad universitaria': 'Madrid',
        // Canary Islands: La Palma / El Hierro / La Gomera extras
        'los llanos de aridane': 'Santa Cruz de la Palma', 'tazacorte': 'Santa Cruz de la Palma',
        'frontera el hierro': 'Valverde', 'playa de santiago': 'San Sebastián de La Gomera',
        // Formentera
        'formentera island': 'Formentera', 'es pujols': 'Formentera', 'la savina': 'Formentera',
        // Murcia extras
        'lorca city': 'Lorca', 'caravaca de la cruz': 'Caravaca de la Cruz',
        'mazarron': 'Mazarrón', 'los alcazares': 'Los Alcázares', 'la manga': 'La Manga del Mar Menor',
        // Ceuta / Melilla
        'ceuta city': 'Ceuta', 'melilla city': 'Melilla',
        // La Rioja
        'logrono city': 'Logroño', 'haro rioja': 'Haro', 'calahorra': 'Calahorra',
        // Navarra extras
        'tudela navarra': 'Tudela', 'olite city': 'Olite',
    },
    IT: {
        // Rome — centro storico / tourist core
        'trastevere': 'Rom', 'vatican': 'Rom', 'prati': 'Rom',
        'testaccio': 'Rom', 'pigneto': 'Rom', 'monti': 'Rom',
        'parioli': 'Rom', 'esquilino': 'Rom', 'ostiense': 'Rom',
        'garbatella': 'Rom', 'flaminio': 'Rom',
        'navona': 'Rom', 'campo de fiori': 'Rom', 'campo dei fiori': 'Rom',
        'borgo': 'Rom', 'aventino': 'Rom', 'celio': 'Rom',
        'centro storico rome': 'Rom', 'colosseo': 'Rom',
        // Rome — residential & outer districts
        'ottavia': 'Rom', 'trionfale': 'Rom', 'aurelio': 'Rom',
        'monteverde': 'Rom', 'portuense': 'Rom', 'trullo': 'Rom',
        'marconi': 'Rom', 'eur': 'Rom', 'appio': 'Rom',
        'appio claudio': 'Rom', 'tuscolano': 'Rom', 'casilino': 'Rom',
        'prenestino': 'Rom', 'centocelle': 'Rom', 'torpignattara': 'Rom',
        'tiburtino': 'Rom', 'san lorenzo rome': 'Rom',
        'nomentano': 'Rom', 'salario': 'Rom', 'africano': 'Rom',
        'coppede': 'Rom', 'balduina': 'Rom', 'vigna clara': 'Rom',
        'navigli': 'Mailand', 'brera': 'Mailand', 'porta nuova': 'Mailand',
        'isola': 'Mailand', 'porta venezia': 'Mailand', 'magenta': 'Mailand',
        'centro storico milan': 'Mailand', 'duomo area': 'Mailand', 'ticinese': 'Mailand',
        'porta romana': 'Mailand', 'città studi': 'Mailand', 'loreto': 'Mailand',
        'cannaregio': 'Venedig', 'dorsoduro': 'Venedig', 'san polo': 'Venedig',
        'castello venice': 'Venedig', 'giudecca': 'Venedig', 'mestre': 'Venedig',
        'lido di venezia': 'Venedig',
        'oltrarno': 'Florenz', 'santa croce': 'Florenz', 'san giovanni': 'Florenz',
        'san marco florence': 'Florenz', 'santa maria novella': 'Florenz',
        'spaccanapoli': 'Neapel', 'chiaia': 'Neapel', 'posillipo': 'Neapel',
        'vomero': 'Neapel', 'quartieri spagnoli': 'Neapel', 'piazza garibaldi naples': 'Neapel',
        'centro storico naples': 'Neapel',
        'quadrilatero romano': 'Turin', 'san salvario': 'Turin', 'vanchiglia': 'Turin',
        'cit turin': 'Turin', 'aurora': 'Turin',
        'quadrilatero': 'Bologna', 'bolognina': 'Bologna', 'porto bologna': 'Bologna',
        'centro storico genoa': 'Genua', 'boccadasse': 'Genua',
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
        // Cinque Terre — corniglia/monterosso have no own TGX code; others resolve directly
        'corniglia': 'La Spezia', 'monterosso': 'La Spezia',
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
        // Dolomites
        'cortina d ampezzo': 'Cortina d\'Ampezzo', 'cortina dolomites': 'Cortina d\'Ampezzo',
        'bolzano old town': 'Bozen', 'merano': 'Meran', 'bressanone': 'Brixen',
        'madonna di campiglio': 'Madonna di Campiglio',
        'canazei': 'Canazei', 'ortisei': 'Bozen',
        // Lake Garda
        'sirmione garda': 'Sirmione', 'desenzano del garda': 'Desenzano del Garda',
        'riva del garda': 'Riva del Garda', 'malcesine': 'Malcesine',
        'peschiera del garda': 'Peschiera del Garda',
        // Lake Maggiore
        'stresa maggiore': 'Stresa', 'verbania': 'Verbania',
        'baveno': 'Baveno', 'arona': 'Arona',
        // Lake Como extras
        'bellagio como': 'Bellagio', 'varenna como': 'Varenna', 'menaggio': 'Menaggio',
        // Sardinia extras
        'porto cervo sardinia': 'Olbia', 'olbia city': 'Olbia',
        'costa smeralda': 'Olbia', 'arzachena': 'Arzachena',
        'nuoro city': 'Nuoro', 'oristano city': 'Oristano',
        'sassari city': 'Sassari',
        // Sicily extras
        'palermo mondello beach': 'Palermo',
        'agrigento valley': 'Agrigento', 'selinunte': 'Castelvetrano',
        'siracusa old town': 'Syrakus', 'ortigia island': 'Syrakus',
        'noto sicily': 'Noto', 'ragusa ibla': 'Ragusa', 'modica city': 'Modica',
        'etna area': 'Catania', 'nicolosi': 'Nicolosi',
        'cefalu beach': 'Cefalù', 'milazzo': 'Milazzo',
        'aeolian islands': 'Lipari', 'lipari island': 'Lipari', 'stromboli': 'Stromboli',
        'pantelleria island': 'Pantelleria',
        // Puglia extras
        'alberobello trulli': 'Alberobello', 'locorotondo': 'Locorotondo',
        'ostuni white city': 'Ostuni', 'fasano': 'Fasano',
        'polignano a mare': 'Polignano a Mare', 'monopoli puglia': 'Monopoli',
        'vieste gargano': 'Vieste', 'peschici': 'Peschici',
        'porto cesareo': 'Porto Cesareo', 'gallipoli puglia': 'Gallipoli',
        // Campania extras
        'capri island': 'Capri', 'anacapri village': 'Anacapri',
        'ischia island': 'Ischia', 'procida island': 'Procida',
        'pompeii ruins': 'Pompei',
        // Emilia-Romagna extras
        'parma city': 'Parma', 'reggio emilia': 'Reggio Emilia',
        'ravenna city': 'Ravenna', 'cesenatico': 'Cesenatico',
        // Umbria extras
        'gubbio': 'Gubbio', 'spoleto': 'Spoleto', 'todi': 'Todi',
        // Marche extras
        'urbino city': 'Urbino', 'ancona city': 'Ancona',
        'san benedetto del tronto': 'San Benedetto del Tronto',
        // Veneto extras
        'bassano del grappa': 'Bassano del Grappa', 'asolo': 'Asolo',
        'cortina area': 'Cortina d\'Ampezzo',
        'treviso city': 'Treviso', 'padova old town': 'Padua',
        // Liguria extras
        'portofino': 'Portofino', 'rapallo': 'Rapallo',
        'santa margherita ligure': 'Santa Margherita Ligure',
        'san remo city': 'San Remo',
    },
    DE: {
        'mitte': 'Berlin', 'kreuzberg': 'Berlin', 'prenzlauer berg': 'Berlin',
        'friedrichshain': 'Berlin', 'charlottenburg': 'Berlin', 'schoneberg': 'Berlin',
        'neukölln': 'Berlin', 'steglitz': 'Berlin', 'tempelhof': 'Berlin',
        'spandau': 'Berlin', 'wedding': 'Berlin', 'reinickendorf': 'Berlin',
        'treptow': 'Berlin', 'pankow': 'Berlin', 'lichtenberg': 'Berlin',
        'marzahn': 'Berlin', 'tiergarten berlin': 'Berlin', 'wilmersdorf': 'Berlin',
        'schwabing': 'München', 'maxvorstadt': 'München', 'glockenbachviertel': 'München',
        'bogenhausen': 'München', 'haidhausen': 'München', 'giesing': 'München',
        'nymphenburg': 'München', 'neuhausen': 'München', 'lehel': 'München',
        'altstadt hamburg': 'Hamburg', 'hafencity': 'Hamburg', 'eppendorf': 'Hamburg',
        'altona': 'Hamburg', 'eimsbüttel': 'Hamburg', 'winterhude': 'Hamburg',
        'rotherbaum': 'Hamburg', 'st pauli': 'Hamburg', 'barmbek': 'Hamburg',
        'sachsenhausen': 'Frankfurt', 'bornheim': 'Frankfurt', 'nordend': 'Frankfurt',
        'westend frankfurt': 'Frankfurt', 'bockenheim': 'Frankfurt', 'bahnhofsviertel': 'Frankfurt',
        'innenstadt frankfurt': 'Frankfurt',
        'altstadt cologne': 'Köln', 'ehrenfeld': 'Köln', 'nippes': 'Köln',
        'sülz': 'Köln', 'lindenthal': 'Köln',
        'altstadt düsseldorf': 'Düsseldorf', 'friedrichstadt duss': 'Düsseldorf',
        'gerresheim': 'Düsseldorf', 'pempelfort': 'Düsseldorf',
        'bohnenviertel': 'Stuttgart', 'west stuttgart': 'Stuttgart', 'bad cannstatt': 'Stuttgart',
        'sebald': 'Nürnberg', 'lorenz': 'Nürnberg', 'gostenhof': 'Nürnberg',
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
        'lubeck altstadt': 'Lübeck',
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
        // Bavarian Alps extras
        'berchtesgaden town': 'Berchtesgaden', 'konigssee area': 'Berchtesgaden',
        'berchtesgaden national park': 'Berchtesgaden',
        'fussen altstadt': 'Füssen', 'neuschwanstein area': 'Füssen',
        'zugspitze area': 'Garmisch-Partenkirchen',
        'ruhpolding': 'Ruhpolding', 'bad tölz': 'Bad Tölz',
        // Black Forest
        'freiburg schwarzwald': 'Freiburg im Breisgau',
        'titisee-neustadt': 'Titisee-Neustadt', 'titisee lake': 'Titisee-Neustadt',
        'triberg city': 'Triberg im Schwarzwald',
        'baiersbronn': 'Baiersbronn',
        // Baden-Baden
        'baden-baden spa': 'Baden-Baden', 'kurhaus area': 'Baden-Baden',
        'caracalla spa': 'Baden-Baden',
        // Rhine Valley
        'heidelberg old town': 'Heidelberg',
        'rudesheim am rhein': 'Rüdesheim am Rhein', 'bingen am rhein': 'Bingen am Rhein',
        'bacharach': 'Bacharach', 'st goar': 'Sankt Goar',
        // Moselle Valley
        'cochem': 'Cochem', 'bernkastel-kues': 'Bernkastel-Kues',
        // North Germany extras
        'hamburg speicherstadt': 'Hamburg', 'reeperbahn': 'Hamburg',
        'sylt island': 'Westerland', 'westerland sylt': 'Westerland',
        'norderney island': 'Norderney',
        // East Germany extras
        'potsdam altstadt': 'Potsdam', 'sanssouci area': 'Potsdam',
        'bautzen': 'Bautzen', 'gorlitz': 'Görlitz',
        'zwickau city': 'Zwickau',
        // Additional cities
        'braunschweig city': 'Braunschweig', 'wolfsburg city': 'Wolfsburg',
        'kassel city': 'Kassel', 'paderborn city': 'Paderborn',
        'aachen city': 'Aachen', 'dortmund city': 'Dortmund',
        'essen city': 'Essen', 'bochum city': 'Bochum', 'wuppertal': 'Wuppertal',
        'munster city': 'Münster', 'bielefeld city': 'Bielefeld',
        'ingolstadt': 'Ingolstadt', 'wurzburg city': 'Würzburg',
        'landshut city': 'Landshut',
        // More Berlin districts
        'moabit': 'Berlin', 'gesundbrunnen': 'Berlin', 'prenzlauer berg berlin': 'Berlin',
        'zehlendorf': 'Berlin', 'dahlem': 'Berlin', 'wannsee': 'Berlin',
        'kopenick': 'Berlin', 'adlershof': 'Berlin', 'neukölln berlin': 'Berlin',
        'siemensstadt': 'Berlin', 'spandau altstadt': 'Berlin',
        // More Hamburg
        'harburg': 'Hamburg', 'bergedorf': 'Hamburg', 'wandsbek': 'Hamburg',
        'volksdorf': 'Hamburg', 'poppenbüttel': 'Hamburg', 'langenhorn': 'Hamburg',
        'blankenese': 'Hamburg', 'ottensen': 'Hamburg', 'bahrenfeld': 'Hamburg',
        'eimsbüttel north': 'Hamburg', 'lokstedt': 'Hamburg',
        // More Munich districts
        'au haidhausen': 'München', 'ramersdorf': 'München', 'obergiesing': 'München',
        'untergiesing': 'München', 'sendling': 'München', 'westend munich': 'München',
        'schwabing west': 'München', 'milbertshofen': 'München', 'freimann': 'München',
        'feldmoching': 'München', 'pasing': 'München', 'solln': 'München',
        'ottobrunn': 'München', 'unterschleißheim': 'München',
        // More Cologne
        'deutz': 'Köln', 'chorweiler': 'Köln', 'rodenkirchen': 'Köln',
        'porz': 'Köln', 'mülheim cologne': 'Köln', 'kalk cologne': 'Köln',
        // More Dusseldorf
        'oberkassel': 'Düsseldorf', 'benrath': 'Düsseldorf', 'flingern': 'Düsseldorf',
        'bilk': 'Düsseldorf', 'derendorf': 'Düsseldorf', 'garath': 'Düsseldorf',
        // More Stuttgart
        'zuffenhausen': 'Stuttgart', 'degerloch': 'Stuttgart', 'vaihingen': 'Stuttgart',
        'möhringen': 'Stuttgart', 'stuttgarter mitte': 'Stuttgart',
        // More Frankfurt
        'höchst': 'Frankfurt', 'bergen-enkheim': 'Frankfurt', 'eckenheim': 'Frankfurt',
        'preungesheim': 'Frankfurt', 'ostend frankfurt': 'Frankfurt',
        // More Ruhr area
        'gelsenkirchen': 'Gelsenkirchen', 'oberhausen': 'Oberhausen', 'duisburg': 'Duisburg',
        'bottrop': 'Bottrop', 'recklinghausen': 'Recklinghausen', 'herne': 'Herne',
        'hamm city': 'Hamm', 'hagen city': 'Hagen', 'solingen': 'Solingen',
        'leverkusen': 'Leverkusen', 'krefeld': 'Krefeld', 'moers': 'Moers',
        // Bavaria extras
        'passau city': 'Passau', 'straubing': 'Straubing', 'kelheim': 'Kelheim',
        'kempten': 'Kempten', 'memmingen': 'Memmingen', 'lindau bodensee': 'Lindau',
        'bad reichenhall': 'Bad Reichenhall', 'prien am chiemsee': 'Prien am Chiemsee',
        'chiemsee': 'Prien am Chiemsee', 'herreninsel chiemsee': 'Prien am Chiemsee',
        // Saxony extras
        'chemnitz city': 'Chemnitz', 'plauen city': 'Plauen',
        'meissen city': 'Meißen', 'pirna': 'Pirna', 'bautzen city': 'Bautzen',
        // More North Germany
        'bremen city': 'Bremen', 'bremerhaven': 'Bremerhaven',
        'oldenburg city': 'Oldenburg', 'osnabruck': 'Osnabrück',
        'gottingen city': 'Kassel', 'hildesheim': 'Hildesheim',
        // More East Germany
        'halle saale': 'Halle an der Saale', 'magdeburg city': 'Magdeburg',
        'dessau': 'Dessau-Roßlau', 'jena city': 'Jena',
        'gera city': 'Gera', 'suhl': 'Suhl', 'eisenach': 'Eisenach',
        // Germany tourism extras
        'oberammergau': 'Oberammergau', 'murnau': 'Murnau am Staffelsee',
        'bad mergentheim': 'Bad Mergentheim', 'dinkelsbuhl': 'Dinkelsbühl',
        'feuchtwangen': 'Feuchtwangen', 'nordlingen': 'Nördlingen',
    },
    NL: {
        'jordaan': 'Amsterdam', 'de pijp': 'Amsterdam', 'centrum': 'Amsterdam',
        'oud west': 'Amsterdam', 'east amsterdam': 'Amsterdam', 'westerpark': 'Amsterdam',
        'oud-oost': 'Amsterdam', 'noord amsterdam': 'Amsterdam', 'nieuw-west': 'Amsterdam',
        'buitenveldert': 'Amsterdam', 'zuidas': 'Amsterdam', 'rivierenbuurt': 'Amsterdam',
        'watergraafsmeer': 'Amsterdam', 'bijlmer': 'Amsterdam', 'bos en lommer': 'Amsterdam',
        'centrum rotterdam': 'Rotterdam', 'kop van zuid': 'Rotterdam', 'katendrecht': 'Rotterdam',
        'witte de withstraat': 'Rotterdam', 'feijenoord': 'Rotterdam', 'delfshaven': 'Rotterdam',
        'kralingen': 'Rotterdam', 'hillegersberg': 'Rotterdam',
        'centrum den haag': 'Den Haag', 'scheveningen': 'Den Haag', 'bezuidenhout': 'Den Haag',
        'statenkwartier': 'Den Haag', 'laak': 'Den Haag', 'escamp': 'Den Haag',
        'oudwijk': 'Utrecht', 'lombok': 'Utrecht',
        'domplein': 'Utrecht', 'leidsche rijn': 'Utrecht', 'overvecht': 'Utrecht',
        'eindhoven city': 'Eindhoven', 'strijp s': 'Eindhoven',
        'leiden city': 'Leiden', 'leiden historic center': 'Leiden',
        'haarlem city': 'Haarlem', 'zandvoort': 'Zandvoort',
        'delft city': 'Delft', 'maastricht city': 'Maastricht', 'wyck': 'Maastricht',
        'groningen city': 'Groningen', 'arnhem city': 'Arnheim',
        'nijmegen city': 'Nimwegen', 'tilburg city': 'Tilburg',
        'breda city': 'Breda', 's-hertogenbosch': 's\'-Hertogenbosch',
        'alkmaar city': 'Alkmaar', 'leeuwarden': 'Leeuwarden',
    },
    PT: {
        'alfama': 'Lissabon', 'bairro alto': 'Lissabon', 'belem': 'Lissabon',
        'chiado': 'Lissabon', 'mouraria': 'Lissabon', 'intendente': 'Lissabon',
        'avenidas novas': 'Lissabon', 'campo de ourique': 'Lissabon', 'santos': 'Lissabon',
        'alcantara': 'Lissabon', 'bica': 'Lissabon', 'principe real': 'Lissabon',
        'graça': 'Lissabon', 'estrela': 'Lissabon', 'campolide': 'Lissabon',
        'parque das nacoes': 'Lissabon', 'oriente lisbon': 'Lissabon',
        'oeiras': 'Oeiras', 'cascais city': 'Cascais',
        'sintra old town': 'Sintra', 'pena palace area': 'Sintra',
        'setubal city': 'Setúbal', 'arrabida': 'Setúbal',
        'ribeira': 'Porto', 'vila nova de gaia': 'Vila Nova de Gaia', 'boavista': 'Porto',
        'bonfim': 'Porto', 'cedofeita': 'Porto', 'miragaia': 'Porto',
        'foz do douro': 'Porto', 'matosinhos': 'Matosinhos', 'gondomar': 'Gondomar',
        'braga city': 'Braga', 'guimaraes': 'Guimaraes', 'viana do castelo': 'Viana do Castelo',
        'coimbra city': 'Coimbra', 'baixa coimbra': 'Coimbra',
        'aveiro city': 'Aveiro', 'aveiro canals': 'Aveiro',
        'albufeira old town': 'Albufeira', 'oura': 'Albufeira', 'falesia': 'Albufeira',
        'praia da rocha': 'Portimão', 'alvor': 'Alvor',
        'lagos algarve': 'Lagos', 'meia praia': 'Lagos',
        'tavira old town': 'Tavira', 'cabanas de tavira': 'Tavira',
        'faro old town': 'Faro', 'ilha de faro': 'Faro',
        'vilamoura marina': 'Loulé', 'quarteira': 'Quarteira',
        'vale do lobo': 'Loulé', 'quinta do lago': 'Loulé',
        'sagres portugal': 'Sagres', 'cape st vincent': 'Sagres',
        'carvoeiro': 'Lagoa e Carvoeiro', 'silves castle': 'Silves',
        'monchique': 'Monchique', 'aljezur': 'Aljezur',
        'funchal old town': 'Funchal', 'zona velha funchal': 'Funchal',
        'santa maria funchal': 'Funchal', 'sao martinho': 'Funchal',
        'camara de lobos': 'Camara de Lobos', 'santana madeira': 'Santana',
        'porto moniz madeira': 'Porto Moniz',
        'ponta delgada': 'Ponta Delgada', 'furnas azores': 'Furnas',
        'sete cidades': 'Sete Cidades',
        'angra do heroismo': 'Angra Do Heroismo',
        'horta faial': 'Horta',
        // Portugal extras
        'evora city': 'Évora', 'evora walled city': 'Évora',
        'elvas': 'Elvas', 'estremoz': 'Estremoz',
        'portalegre city': 'Portalegre', 'castelo branco': 'Castelo Branco',
        'viseu city': 'Viseu', 'lamego': 'Lamego', 'peso da regua': 'Peso da Regua',
        'douro valley': 'Peso da Regua', 'douro vineyards': 'Peso da Regua',
        'braganca city': 'Bragança', 'chaves': 'Chaves', 'mirandela': 'Mirandela',
        'guarda city': 'Guarda', 'sabugal': 'Sabugal',
        'leiria city': 'Leiria', 'nazare beach': 'Nazaré', 'obidos': 'Obidos',
        'alcobaca': 'Alcobaça', 'batalha monastery': 'Batalha',
        'fatima sanctuary': 'Fátima', 'tomar city': 'Tomar',
        'santarem city': 'Santarem', 'evora roman': 'Évora',
        'portimao centro': 'Portimão', 'ferragudo': 'Ferragudo',
        'armacao de pera': 'Armação de Pêra', 'porches algarve': 'Lagoa e Carvoeiro',
        'meia praia lagos': 'Lagos', 'luz lagos': 'Lagos', 'burgau algarve': 'Lagos',
        'praia da luz': 'Lagos', 'salema beach': 'Vila do Bispo',
        'odeceixe': 'Aljezur', 'zambujeira do mar': 'Zambujeira do Mar',
        // More Porto neighborhoods
        'massarelos': 'Porto', 'campanha': 'Porto', 'paranhos': 'Porto',
        'ramalde': 'Porto', 'aldoar': 'Porto', 'nevogilde': 'Porto',
        'antas porto': 'Porto', 'bonfim porto': 'Porto',
        // More Lisbon neighborhoods
        'arroios': 'Lissabon', 'marvila': 'Lissabon', 'beato': 'Lissabon',
        'penha de franca': 'Lissabon', 'sao joao': 'Lissabon',
        'benfica lisbon': 'Lissabon', 'lumiar': 'Lissabon', 'amadora': 'Amadora',
        'loures': 'Loures', 'odivelas': 'Odivelas',
        // Azores extras
        'flores azores': 'Santa Cruz das Flores', 'corvo azores': 'Vila do Corvo',
        'graciosa azores': 'Santa Cruz da Graciosa', 'sao jorge azores': 'Velas',
        'pico island azores': 'Madalena', 'faial azores': 'Horta',
        'santa maria azores': 'Vila do Porto',
        // Madeira extras
        'machico madeira': 'Machico', 'calheta madeira': 'Calheta',
        'pico arieiro': 'Funchal', 'levada walks': 'Funchal',
    },
    GR: {
        // Islands people search by island name, whose hotels the catalog files
        // under the main town. Each was searched for and reached nothing.
        'paros': 'Parikia', 'paros island': 'Parikia',
        'kefalonia': 'Argostoli-Stadt', 'cephalonia': 'Argostoli-Stadt',
        'lesbos': 'Mytilini', 'lesvos': 'Mytilini',
        'plaka': 'Athens', 'monastiraki': 'Athens', 'kolonaki': 'Athens',
        'psiri': 'Athens', 'thissio': 'Athens', 'exarchia': 'Athens',
        'gazi': 'Athens', 'koukaki': 'Athens', 'petralona': 'Athens',
        'glyfada': 'Glyfada', 'vouliagmeni': 'Vouliagmeni', 'piraeus': 'Athens',
        'imerovigli': 'Santorini Island',
        'akrotiri': 'Santorini Island', 'perivolos': 'Santorini Island',
        'mykonos town': 'Mykonos', 'little venice': 'Mykonos',
        'platys gialos': 'Mykonos', 'psarou': 'Mykonos',
        'old town rhodes': 'Rhodos', 'ixia': 'Rhodos',
        'hersonissos': 'Chersonissos', 'chania old town': 'Chania',
        'agios nikolaos crete': 'Agios Nikolaos',
        'corfu town': 'Korfu', 'paleokastritsa': 'Korfu', 'dassia': 'Korfu',
        // Thessaloniki
        'ladadika': 'Thessaloniki', 'ano poli': 'Thessaloniki',
        'thessaloniki city centre': 'Thessaloniki', 'white tower': 'Thessaloniki',
        // Zakynthos
        'zakynthos town': 'Zakynthos', 'laganas': 'Zakynthos', 'navagio area': 'Zakynthos',
        'tsilivi': 'Zakynthos',
        // Kefalonia
        'argostoli': 'Argostoli-Stadt', 'fiskardo': 'Fiskardo', 'skala kefalonia': 'Skala',
        'lixouri': 'Lixouri',
        // Paros
        'naoussa paros': 'Antiparos', 'parikia': 'Antiparos', 'golden beach paros': 'Antiparos',
        // Naxos
        'naxos town': 'Naxos', 'agios prokopios': 'Naxos',
        // Skiathos
        'skiathos town': 'Skiathos', 'koukounaries': 'Skiathos',
        // Lefkada
        'lefkada town': 'Lefkada', 'nidri': 'Lefkada', 'agios nikitas': 'Lefkada',
        // Lesbos (Mytilene)
        'mytilini': 'Mytilini', 'molyvos': 'Molyvos', 'petra lesbos': 'Petra',
        // Samos
        'samos town': 'Samos', 'kokkari': 'Samos', 'pythagoreio': 'Samos',
        // Kos
        'kos town': 'Kos', 'kardamena': 'Kos', 'kefalos': 'Kos',
        // Chalkidiki / Halkidiki
        'kassandra': 'Kassandra', 'sithonia': 'Thessaloniki',
        // Patras
        'patras city': 'Patras',
        // Delphi
        'delphi village': 'Distomo-Arachova-Antikyra',
        // Meteora
        'kalambaka': 'Kalambaka',
        // Hydra
        'hydra town': 'Hydra',
        // Spetses
        'spetses town': 'Spetses',
        // Greece extras
        'ios island': 'Ios', 'chora ios': 'Ios', 'mylopotas': 'Ios',
        'milos island': 'Naxos', 'plaka milos': 'Naxos', 'adamas': 'Naxos',
        'folegandros island': 'Folegandros', 'chora folegandros': 'Folegandros',
        'syros island': 'Syros', 'ermoupoli syros': 'Syros',
        'tinos island': 'Tinos', 'chora tinos': 'Tinos',
        'amorgos island': 'Amorgos', 'chora amorgos': 'Amorgos',
        'serifos island': 'Serifos', 'sifnos island': 'Apollonia',
        'antiparos island': 'Antiparos',
        'ikaria island': 'Ikaria', 'agios kirykos': 'Ikaria',
        'chios island': 'Chios', 'chios town': 'Chios',
        'lemnos island': 'Myrina',
        'thessaloniki suburbs': 'Thessaloniki', 'perea thessaloniki': 'Thessaloniki',
        'kavala city': 'Kavala', 'alexandroupolis': 'Alexandroupoli',
        'ioannina city': 'Ioannina', 'ioannina lake': 'Ioannina',
        'larissa city': 'Larissa', 'volos city': 'Kalambaka', 'pelion peninsula': 'Kalambaka',
        'kalamata city': 'Kalamata', 'sparta city': 'Sparta',
        'olympia ruins': 'Antikes Olympia', 'nafplio city': 'Nafplio',
        'mycenae ruins': 'Nafplio',
        'heraklion city': 'Heraklion', 'knossos': 'Heraklion',
        'rethymno old town': 'Rethymnon', 'rethymno beach': 'Rethymnon',
        'ierapetra': 'Ierapetra', 'sitia crete': 'Sitia',
        'samaria gorge': 'Chania', 'balos beach': 'Chania',
        'parga city': 'Parga', 'preveza city': 'Lefkada',
        'katakolon': 'Pyrgos',
    },
    CZ: {
        'old town': 'Prag', 'mala strana': 'Prag', 'vinohrady': 'Prag',
        'zizkov': 'Prag', 'josefov': 'Prag', 'nove mesto': 'Prag',
        'holesovice': 'Prag', 'dejvice': 'Prag', 'smichov': 'Prag',
        'nusle': 'Prag', 'zbraslav': 'Prag',
        'vysehrad': 'Prag', 'karlin': 'Prag', 'zlichov': 'Prag',
        'brno city center': 'Brno', 'brno stred': 'Brno', 'kralovo pole': 'Brno',
        'ostrava city': 'Stadtzentrum von Ostrava', 'poruba': 'Stadtzentrum von Ostrava',
        'plzen city': 'Pilsen', 'liberec city': 'Liberec (Reichenberg)',
        'ceske budejovice': 'Budweis', 'olomouc city': 'Olomouc (Olmütz)',
        'cesky krumlov': 'Ceský Krumlov', 'kutna hora': 'Kutna Hora',
        'karlovy vary': 'Karlsbad', 'marianske lazne': 'Mariánské Lázne',
        'cesky raj': 'Jičín', 'krkonose': 'Spindleruv Mlyn',
        // Prague extra neighborhoods
        'zizkov prague': 'Prag', 'vrsovice': 'Prag', 'nusle prague': 'Prag',
        'modany': 'Prag', 'branik': 'Prag', 'strascnice': 'Prag',
        'pankrac': 'Prag', 'budejovicka': 'Prag', 'kobylisy': 'Prag',
        // More Czech cities
        'hradec kralove': 'Königgrätz', 'pardubice city': 'Pardubice',
        'zlin city': 'Zlín', 'jihlava city': 'Jihlava', 'usti nad labem': 'Usti nad Labem (Aussig)',
        'opava city': 'Opava', 'havirov city': 'Stadtzentrum von Ostrava', 'karvina': 'Karvinà',
        'frydek mistek': 'Frydek-Mistek', 'znojmo': 'Znojmo (Znaim)', 'trebic': 'Trebic',
        // More spa / heritage
        'frantiskovy lazne': 'Frantiskovy Lazne', 'jachymov spa': 'Jáchymov',
        'lednice valtice': 'Lednice', 'telc': 'Telč',
        // Ski
        'harrachov': 'Harrachov', 'spindleruv mlyn': 'Spindleruv Mlyn',
    },
    PL: {
        'old town warsaw': 'Warschau', 'praga': 'Warschau', 'srodmiescie': 'Warschau',
        'mokotow': 'Warschau', 'ursynow': 'Warschau', 'zoliborz': 'Warschau',
        'wola': 'Warschau', 'wlochy': 'Warschau',
        'ochota': 'Warschau', 'targowek': 'Warschau', 'bielany': 'Warschau',
        'wilanow': 'Warschau', 'bemowo': 'Warschau',
        'kazimierz': 'Krakau', 'stare miasto': 'Krakau', 'podgorze': 'Krakau',
        'krowodrza': 'Krakau', 'nowa huta': 'Krakau',
        'zablocie': 'Krakau', 'bronowice': 'Krakau',
        'wrzeszcz': 'Danzig', 'old town gdansk': 'Danzig', 'oliwa': 'Danzig',
        'jelitkow': 'Danzig', 'wrzeszcz gdansk': 'Danzig', 'sopot': 'Sopot',
        'gdynia city': 'Gdingen',
        'lodz city': 'Lódz', 'srodmiescie lodz': 'Lódz',
        'wroclaw city': 'Breslau', 'stare miasto wroclaw': 'Breslau',
        'nadodrze': 'Breslau', 'krzyki': 'Breslau',
        'poznan city': 'Posen', 'stare miasto poznan': 'Posen',
        'katowice city': 'Katowice', 'silesia katowice': 'Katowice',
        'szczecin city': 'Stettin', 'bydgoszcz': 'Torun',
        'lublin city': 'Lublin', 'bialystok city': 'Bialystok',
        'zakopane': 'Zakopane', 'tatra mountains': 'Zakopane',
        'czestochowa': 'Tschenstochau', 'jasna gora': 'Tschenstochau',
        'torun city': 'Torun', 'olsztyn city': 'Allenstein',
        'rzeszow city': 'Rzeszów', 'kielce city': 'Kielce',
        'auschwitz birkenau area': 'Krakau',
        // More Warsaw districts
        'praga polnoc': 'Warschau', 'praga poludnie': 'Warschau', 'rembertow': 'Warschau',
        'wawer': 'Warschau', 'wesola': 'Warschau', 'wilanow warsaw': 'Warschau',
        'saska kepa': 'Warschau', 'grochow': 'Warschau', 'radosc': 'Warschau',
        // More Krakow
        'debniki': 'Krakau', 'pradnik czerwony': 'Krakau', 'nowy kleparz': 'Krakau',
        'lobzow': 'Krakau', 'grzegorzki': 'Krakau', 'pradnik bialy': 'Krakau',
        // More Wroclaw
        'gajowice': 'Breslau', 'fabryczna': 'Breslau', 'srodmiescie wroclaw': 'Breslau',
        // More Poznan
        'grunwald poznan': 'Posen', 'winiary': 'Posen', 'rataje': 'Posen',
        // More Polish cities
        'radom city': 'Radom', 'sosnowiec city': 'Sosnowiec', 'gliwice city': 'Katowice',
        'zabrze city': 'Zabrze', 'bytom city': 'Bytom', 'rybnik city': 'Rybnik',
        'czestochowa city': 'Tschenstochau',
        'opole city': 'Katowice', 'gorzow wielkopolski': 'Landsberg',
        'zielona gora': 'Zielona Góra (Grünberg)', 'torun old town': 'Torun',
        // Tourist
        'wieliczka salt mine': 'Wieliczka', 'malbork castle': 'Malbork',
        'bialowieza forest': 'Bialowieza', 'augustow canal': 'Augustów',
        'krzywe mazury': 'Giżycko', 'mazury lakes': 'Giżycko',
        'tri city gdansk': 'Danzig', 'hel peninsula': 'Hel',
        'pomerania coast': 'Kolobrzeg', 'kolobrzeg': 'Kolobrzeg',
        'karkonosze': 'Karpacz', 'karpacz ski': 'Karpacz', 'szklarska poreba': 'Szklarska Poreba',
    },
    HU: {
        'buda': 'Budapest', 'pest': 'Budapest', 'castle district': 'Budapest',
        'jewish quarter': 'Budapest', 'erzsebetvaros': 'Budapest',
        'belvaros': 'Budapest', 'lipotvaros': 'Budapest', 'terezvaros': 'Budapest',
        'jozsefvaros': 'Budapest', 'ferencvaros': 'Budapest', 'ujpest': 'Budapest',
        'obuda': 'Budapest', 'zuglo': 'Budapest', 'kobanya': 'Budapest',
        'kelenföld': 'Budapest', 'budafok': 'Budapest', 'kispest': 'Budapest',
        'debrecen city': 'Debrecen', 'miskolc city': 'Miskolc',
        'gyor city': 'Györ', 'pecs city': 'Pécs',
        'szeged city': 'Szeged', 'kecskemet': 'Kecskemét',
        'eger city': 'Eger', 'tokaj': 'Tokaj',
        'veszprem': 'Veszprém', 'szekesfehervar': 'Székesfehérvár',
        'lake balaton north': 'Balatonfüred', 'balatonfured': 'Balatonfüred',
        'lake balaton south': 'Siófok', 'siofok': 'Siófok',
        'heviz': 'Heviz', 'keszthely': 'Keszthely',
        'sopron city': 'Sopron',
        // More Budapest areas
        'pasaret': 'Budapest', 'rozsadomb': 'Budapest', 'vizivaros': 'Budapest',
        'batthyany ter': 'Budapest', 'moszkva ter': 'Budapest', 'mechwart liget': 'Budapest',
        // More Hungarian cities
        'szombathely city': 'Szombathely', 'tatabanya': 'Tatabánya',
        'zalaegerszeg': 'Zalaegerszeg',
        'nyiregyhaza': 'Nyíregyháza',
        // Balaton extras
        'balatonalmadi': 'Balatonalmadi', 'badacsony': 'Badacsony', 'tihany peninsula': 'Tihany',
        'fonyod': 'Fonyód', 'balatonlelle': 'Balatonlelle', 'balatonboglar': 'Balatonboglar',
        // Northern Hungary
        'eger wine valley': 'Eger', 'bukk national park': 'Eger', 'aggtelek caves': 'Aggtelek',
        'holloko village': 'Hollókő',
        // Pecs extras
        'pecs inner city': 'Pécs', 'mecsek hills': 'Pécs',
        // Tokaj wine region
        'tokaj wine region': 'Tokaj', 'sarospatak': 'Patak am Bodrog',
    },
    // ── Middle East ────────────────────────────────────────────────────────────
    AE: {
        'marina': 'Dubai', 'dubai marina': 'Dubai', 'jbr': 'Dubai',
        'bur dubai': 'Dubai', 'downtown dubai': 'Dubai',
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
        'ajman city': 'Ajman', 'fujairah city': 'Al Fudschaira',
        'ras al khaimah city': 'Ras Al Khaimah', 'umm al quwain city': 'Umm al-Quwain',
        'al ain city': 'Al Ain',
        'abu dhabi downtown': 'Abu Dhabi', 'masdar city': 'Abu Dhabi',
        'dubai hills': 'Dubai', 'dubai south': 'Dubai', 'jumeirah village circle': 'Dubai',
        'the meadows dubai': 'Dubai', 'arabian ranches': 'Dubai',
        'deira gold souk': 'Dubai', 'global village dubai': 'Dubai',
        // More Dubai districts
        'jumeirah village triangle': 'Dubai', 'jvt': 'Dubai', 'downtown area': 'Dubai',
        'al rigga': 'Dubai', 'al garhoud': 'Dubai', 'muteena': 'Dubai',
        'al mamzar': 'Dubai', 'port saeed': 'Dubai', 'al baraha': 'Dubai',
        'oud al muteena': 'Dubai', 'al twar': 'Dubai', 'muhaisnah': 'Dubai',
        'al quoz industrial': 'Dubai', 'al khail': 'Dubai', 'production city': 'Dubai',
        'jebel ali': 'Dubai', 'dubai investment park': 'Dubai', 'dip dubai': 'Dubai',
        'dubai creek': 'Dubai', 'dubai healthcare city': 'Dubai', 'dhcc': 'Dubai',
        'bluewaters island': 'Dubai', 'the pointe': 'Dubai', 'palm west beach': 'Dubai',
        'al seef dubai': 'Dubai', 'la mer dubai': 'Dubai', 'boxpark dubai': 'Dubai',
        'city walk dubai': 'Dubai', 'the dubai mall': 'Dubai', 'burj khalifa area': 'Dubai',
        'zabeel': 'Dubai', 'za abeel': 'Dubai', 'mankhool': 'Dubai',
        'bur dubai al fahidi': 'Dubai', 'textile souk': 'Dubai', 'spice souk': 'Dubai',
        'umm suqeim': 'Dubai', 'umm suqeim 1': 'Dubai', 'umm suqeim 3': 'Dubai',
        'al wasl': 'Dubai', 'al safa': 'Dubai', 'palm deira': 'Dubai',
        'emirates hills': 'Dubai', 'the springs': 'Dubai', 'the lakes': 'Dubai',
        'the meadows': 'Dubai', 'jumeirah park': 'Dubai', 'jumeirah islands': 'Dubai',
        'discovery gardens': 'Dubai', 'international media production zone': 'Dubai',
        // More Abu Dhabi
        'al raha beach': 'Abu Dhabi', 'khalifa city': 'Abu Dhabi', 'al reef': 'Abu Dhabi',
        'al mushrif': 'Abu Dhabi', 'electra street': 'Abu Dhabi', 'hamdan street': 'Abu Dhabi',
        'tourist club area': 'Abu Dhabi', 'al zahiyah': 'Abu Dhabi',
        'yas marina circuit': 'Abu Dhabi', 'ferrari world': 'Abu Dhabi',
        'louvre abu dhabi': 'Abu Dhabi', 'qasr al hosn': 'Abu Dhabi',
        'marina mall abu dhabi': 'Abu Dhabi', 'nation towers': 'Abu Dhabi',
        'eastern mangroves': 'Abu Dhabi', 'al bateen': 'Abu Dhabi',
        'al mina': 'Abu Dhabi', 'al danah': 'Abu Dhabi',
        'al ain downtown': 'Al Ain', 'al ain oasis': 'Al Ain', 'buraimi': 'Al Ain',
        // Sharjah expanded
        'al majaz': 'Sharjah', 'al nahda sharjah': 'Sharjah', 'muwaileh': 'Sharjah',
        'al khan': 'Sharjah', 'corniche sharjah': 'Sharjah', 'al nud': 'Sharjah',
        'al yarmook': 'Sharjah', 'industrial area sharjah': 'Sharjah',
        // Fujairah / RAK / UAQ
        'dibba fujairah': 'Dibba', 'khor fakkan': 'Khor Fakkan', 'kalba': 'Kalba',
        'ras al khaimah resort': 'Ras Al Khaimah', 'al hamra village': 'Ras Al Khaimah',
        'jais mountain': 'Ras Al Khaimah', 'waldorf rak': 'Ras Al Khaimah',
        // More Abu Dhabi
        'liwa oasis': 'Liwa-Oase', 'sir bani yas island': 'Insel Sir Bani Yas',
        'al dhafra': 'Abu Dhabi', 'zayed heritage': 'Abu Dhabi',
        'al noor island': 'Sharjah',
        // Arabic language names
        'دبي': 'Dubai', 'أبوظبي': 'Abu Dhabi', 'الشارقة': 'Sharjah',
        'عجمان': 'Ajman', 'الفجيرة': 'Al Fudschaira', 'رأس الخيمة': 'Ras Al Khaimah',
        'أم القيوين': 'Umm al-Quwain', 'العين': 'Al Ain',
        'الإمارات': 'Dubai',
        'fujairah': 'Al Fudschaira', 'al fujairah': 'Al Fudschaira',
        'umm al quwain': 'Umm al-Quwain',
        'al aqah beach': 'Al Aqah', 'al aqah': 'Al Aqah',
        'madinat zayed': 'Madinat Zayed', 'liwa': 'Liwa-Oase',
        'hatta village': 'Hatta', 'hatta dam': 'Hatta',
        'mirfa': 'Mirfa', 'al mirfa': 'Mirfa',
        'damac hills': 'Damac Hills', 'damac hills 2': 'Damac Hills',
    },
    TR: {
        'sultanahmet': 'Istanbul', 'taksim': 'Istanbul', 'beyoglu': 'Istanbul',
        'kadikoy': 'Istanbul', 'besiktas': 'Istanbul', 'eminonu': 'Istanbul',
        'galata': 'Istanbul', 'sisli': 'Istanbul', 'uskudar': 'Istanbul',
        'cihangir': 'Istanbul', 'balat': 'Istanbul', 'fatih': 'Istanbul',
        'bakirkoy': 'Istanbul', 'florya': 'Istanbul', 'levent': 'Istanbul',
        'etiler': 'Istanbul', 'bebek': 'Istanbul', 'ortakoy': 'Istanbul',
        'arnavutkoy': 'Istanbul', 'bosphorus': 'Istanbul',
        'kalkan': 'Kalkan', 'kas': 'Kaş', 'fethiye center': 'Fethiye',
        'oludeniz': 'Fethiye', 'antalya old town': 'Antalya', 'konyaalti': 'Antalya',
        'lara beach': 'Antalya', 'bodrum peninsula': 'Bodrum (Region)', 'yalikavak': 'Bodrum (Region)',
        'turgutreis': 'Bodrum (Region)', 'bitez': 'Bodrum (Region)',
        // Cappadocia
        'goreme village': 'Goreme', 'nevsehir cappadocia': 'Nevsehir',
        'urgup': 'Urgup', 'avanos': 'Avanos', 'uchisar': 'Uchisar',
        'ortahisar': 'Ortahisar', 'kapadokya': 'Nevsehir',
        // Pamukkale / Hierapolis
        'pamukkale thermal pools': 'Pamukkale', 'hierapolis': 'Pamukkale',
        'denizli city': 'Denizli',
        // Aegean Coast extras
        'marmaris city': 'Marmaris', 'icmeler': 'Marmaris',
        'cesme beach': 'Çeşme', 'alacati town': 'Alaçatı',
        'didim': 'Didim', 'altinkum beach': 'Didim',
        // Mediterranean extras
        'alanya city': 'Alanya', 'side ruins': 'Side',
        'belek resort': 'Belek',
        // Izmir extras
        'konak izmir': 'Izmir', 'bornova': 'Izmir', 'karsiyaka': 'Izmir',
        'alsancak izmir': 'Izmir',
        // Ankara extras
        'kizilay ankara': 'Ankara', 'cankaya district': 'Ankara',
        'bahcelievler ankara': 'Ankara',
        // Black Sea
        'trabzon city': 'Trabzon', 'sumela monastery': 'Trabzon',
        'rize city': 'Rize',
        // East Turkey
        'erzurum city': 'Erzurum', 'kars city': 'Kars', 'ani ruins': 'Kars',
        // Central Anatolia
        'konya city': 'Konya', 'mevlana shrine': 'Konya',
        'bursa city': 'Bursa', 'uludag ski': 'Uludağ',
        'eskisehir city': 'Eskisehir',
        // More Istanbul districts
        'karakoy': 'Istanbul', 'funicular istanbul': 'Istanbul', 'grand bazaar': 'Istanbul',
        'spice bazaar': 'Istanbul', 'hagia sophia area': 'Istanbul', 'blue mosque area': 'Istanbul',
        'topkapi palace': 'Istanbul', 'dolmabahce': 'Istanbul', 'sariyer': 'Istanbul',
        'tarabya': 'Istanbul', 'buyukdere': 'Istanbul', 'maslak': 'Istanbul',
        'umraniye': 'Istanbul', 'kucukyali': 'Istanbul', 'bostanci': 'Istanbul',
        'pendik': 'Istanbul', 'kartal': 'Istanbul', 'maltepe': 'Istanbul',
        'sultanbeyli': 'Istanbul', 'sancaktepe': 'Istanbul', 'tuzla': 'Istanbul',
        'esenyurt': 'Istanbul', 'beylikduzu': 'Istanbul', 'basaksehir': 'Istanbul',
        'avcilar': 'Istanbul', 'kucukcekmece': 'Istanbul', 'buyukcekmece': 'Istanbul',
        'catalca': 'Istanbul', 'adalar': 'Istanbul', 'princes islands': 'Istanbul',
        'buyukada': 'Istanbul', 'heybeliada': 'Istanbul', 'burgaz': 'Istanbul',
        // Antalya extras
        'lara antalya': 'Antalya', 'kundu': 'Antalya', 'dosemealti': 'Antalya',
        'kemer antalya': 'Kemer', 'tekirova': 'Kemer', 'camyuva': 'Kemer',
        'adrasan': 'Adrasan', 'olympos': 'Kemer', 'cirali beach': 'Çirali',
        'kaputas beach': 'Kaş', 'patara beach': 'Kalkan', 'xanthos': 'Kalkan',
        'dalyan turkey': 'Dalyan', 'iztuzu beach': 'Dalyan',
        // Aegean extras
        'cesme marina': 'Çeşme', 'chios ferry': 'Çeşme',
        'sigacik': 'Selçuk', 'ephesus ruins': 'Selçuk', 'selcuk': 'Selçuk',
        'pamukkale village': 'Pamukkale', 'laodicea turkey': 'Denizli',
        'gumusluk': 'Bodrum (Region)', 'gundogan bodrum': 'Bodrum (Region)',
        'torba bodrum': 'Bodrum (Region)', 'golturkbuku': 'Bodrum (Region)',
        // Central Anatolia
        'goreme': 'Goreme', 'cappadocia': 'Nevsehir', 'urgup city': 'Urgup',
        'derinkuyu': 'Derinkuyu', 'derinkuyu underground': 'Derinkuyu',
        'salt lake turkey': 'Konya', 'konya center': 'Konya',
        'hatay turkey': 'Antakya', 'antakya': 'Antakya', 'iskenderun': 'Iskenderun',
        'gaziantep': 'Gaziantep', 'sanliurfa': 'Sanliurfa', 'urfa': 'Sanliurfa',
        'gobekli tepe': 'Sanliurfa', 'harran': 'Sanliurfa',
        'diyarbakir': 'Diyarbakir', 'mardin city': 'Mardin', 'midyat': 'Midyat',
        'adana city': 'Adana', 'mersin city': 'Mersin', 'tarsus turkey': 'Mersin',
        'marmaris resort': 'Marmaris',
        // Turkish Aegean islands / coastal
        'ayvacik turkey': 'Canakkale', 'canakkale': 'Canakkale', 'gallipoli': 'Canakkale',
        'troy ruins': 'Canakkale', 'anzac cove': 'Canakkale',
        'balikesir city': 'Balikesir', 'ayvalik': 'Ayvalik',
        'bandirma': 'Bandirma', 'bursa central': 'Bursa',
        // More Turkish cities
        'kayseri city': 'Kayseri', 'erciyes ski': 'Kayseri',
        'sivas city': 'Sivas', 'malatya city': 'Malatya',
        'elazig': 'Elâzig', 'batman turkey': 'Batman',
        'kocaeli': 'Izmit', 'izmit': 'Izmit',
        'sakarya': 'Sakarya', 'adapazari': 'Sakarya',
        'tekirdag': 'Tekirdag', 'edirne city': 'Edirne', 'selimiye mosque': 'Edirne',
        'kirklareli': 'Kirklareli',
        // Black Sea extras
        'sinop city': 'Sinop', 'samsun city': 'Samsun',
        'ordu city': 'Ordu', 'giresun city': 'Giresun',
        'amasya city': 'Amasya', 'amasya pontic tombs': 'Amasya',
        'kastamonu': 'Kastamonu', 'zonguldak': 'Zonguldak',
        // More Cappadocia
        'mustafapasa': 'Mustafapasa', 'soganli': 'Nevsehir',
        'zelve valley': 'Nevsehir', 'pasabag': 'Nevsehir',
        // More Aegean / Mediterranean
        'foca izmir': 'Foça', 'seferihisar': 'Seferihisar',
        'kusadasi': 'Kuşadası', 'kusadasi beach': 'Kuşadası',
        'marmaris lagoon': 'Marmaris', 'bozburun': 'Marmaris',
        'datca': 'Datça', 'datca peninsula': 'Datça',
        // Turkish language names
        'İstanbul': 'Istanbul', 'Ankara': 'Ankara', 'İzmir': 'Izmir',
        'Antalya': 'Antalya', 'Bursa': 'Bursa', 'Adana': 'Adana',
        'Gaziantep': 'Gaziantep', 'Konya': 'Konya', 'Trabzon': 'Trabzon',
        'Kayseri': 'Kayseri', 'Eskişehir': 'Eskisehir',
        'Diyarbakır': 'Diyarbakir', 'Mersin': 'Mersin',
        'türkiye': 'Istanbul', 'turkey': 'Istanbul',
    },
    IL: {
        'jaffa': 'Tel Aviv', 'yafo': 'Tel Aviv', 'neve tzedek': 'Tel Aviv',
        'florentin': 'Tel Aviv', 'rothschild': 'Tel Aviv', 'dizengoff': 'Tel Aviv',
        'north tel aviv': 'Tel Aviv', 'ramat aviv': 'Tel Aviv', 'bat yam': 'Bat Jam',
        'old city': 'Jerusalem', 'city center jerusalem': 'Jerusalem', 'nahlaot': 'Jerusalem',
        'german colony': 'Jerusalem', 'mamilla': 'Jerusalem',
        // Israel expanded
        'center tel aviv': 'Tel Aviv', 'tel baruch': 'Tel Aviv', 'herzliya': 'Herzlia',
        'haifa carmel': 'Haifa', 'haifa downtown': 'Haifa', 'haifa german colony': 'Haifa',
        'eilat city': 'Elat', 'eilat beach': 'Elat', 'coral beach eilat': 'Elat',
        'dead sea israel': 'Arad', 'ein bokek': 'Arad',
        'masada fortress': 'Arad', 'masada': 'Arad',
        'caesarea ruins': 'Caesarea', 'akko old city': 'Akko', 'acre': 'Akko',
        'nazareth city': 'Nazareth', 'sea of galilee': 'Tiberias', 'tiberias': 'Tiberias',
        'tel aviv port': 'Tel Aviv', 'nahalat binyamin': 'Tel Aviv',
        'be er sheva': "Be'er Scheva", 'negev desert': "Be'er Scheva",
        'mitzpe ramon': 'Mitzpe Ramon', 'ramon crater': 'Mitzpe Ramon',
        'netanya': 'Netanya', 'ashdod': 'Ashdod', 'ashkelon': 'Ashkelon',
        'rehovot': 'Rechovot', 'rishon lezion': 'Rischon LeZion',
        'holon': 'Cholon', 'petah tikva': 'Petach Tikwa',
        // More Tel Aviv neighborhoods
        'allenby street': 'Tel Aviv', 'shuk hacarmel': 'Tel Aviv', 'kerem hateimanim': 'Tel Aviv',
        'levinsky market': 'Tel Aviv', 'sarona': 'Tel Aviv', 'hatachana': 'Tel Aviv',
        'kikar hamedina': 'Tel Aviv', 'bavli': 'Tel Aviv', 'afeka': 'Tel Aviv',
        'ramat hachayal': 'Tel Aviv', 'tel aviv yafo': 'Tel Aviv',
        'sde dov area': 'Tel Aviv', 'bnei brak': 'Tel Aviv', 'givatayim': 'Tel Aviv',
        'ramat gan': 'Ramat Gan', 'bnei brak city': 'Tel Aviv',
        // Jerusalem extras
        'mea shearim': 'Jerusalem', 'givat shaul': 'Jerusalem', 'pisgat zeev': 'Jerusalem',
        'ramot jerusalem': 'Jerusalem', 'gilo jerusalem': 'Jerusalem',
        'har hotzvim': 'Jerusalem', 'talpiot': 'Jerusalem', 'armon hanatziv': 'Jerusalem',
        'east jerusalem': 'Jerusalem', 'mount scopus': 'Jerusalem',
        // North Israel
        'haifa bay': 'Haifa', 'kiryat motzkin': 'Haifa', 'kiryat yam': 'Haifa',
        'kiryat ata': 'Haifa', 'nesher haifa': 'Haifa', 'tirat carmel': 'Tirat Carmel',
        'hadera city': 'Netanya', 'zichron yaakov': 'Zichron Yaakov',
        'safed': 'Safed', 'zfat': 'Safed', 'rosh pina': 'Rosch Pinna',
        'katzrin golan': 'Qatsrin', 'golan heights': 'Qatsrin',
        'afula city': 'Nazareth', 'beit shean': "Bet Sche'an", 'bet she an': "Bet Sche'an",
        // Red Sea / Negev
        'red sea eilat': 'Elat', 'north beach eilat': 'Elat', 'south beach eilat': 'Elat',
        'timna park': 'Elat', 'aqaba border eilat': 'Elat',
        // More Israeli cities
        'modiin': "Modi'in Maccabim Re'ut", "modi'in": "Modi'in Maccabim Re'ut", 'modiin maccabim': "Modi'in Maccabim Re'ut",
        'kfar saba': 'Kfar Saba', 'raanana': "Ra'anana", "ra'anana city": "Ra'anana",
        'hod hasharon': 'Hod haScharon', 'lod city': 'Tel Aviv', 'ramla': 'Tel Aviv',
        'beit shemesh': 'Jerusalem', 'kiryat gat': 'Ashdod',
        'nahariya': 'Naharija', 'kiryat shmona': 'Kirjat Schmona',
        'metula': 'Metula', 'rosh hanikra': 'Naharija',
        'beit she an valley': "Bet Sche'an",
        'megiddo': 'Nazareth', 'tel megiddo': 'Nazareth',
        'banias': 'Qatsrin', 'nimrod fortress': 'Qatsrin',
        'kibbutz degania': 'Tiberias', 'kibbutz ein gev': 'Tiberias',
        'kibbutz kfar blum': 'Kirjat Schmona',
        // West Bank access points
        'jericho': 'Jerusalem', 'ramallah': 'Jerusalem', 'bethlehem': 'Bethlehem',
        'nablus': 'Netanya', 'hebron': 'Jerusalem',
        // Hebrew language variants
        'תל אביב': 'Tel Aviv', 'ירושלים': 'Jerusalem', 'חיפה': 'Haifa',
        'אילת': 'Elat', 'נתניה': 'Netanya', 'אשדוד': 'Ashdod',
        'באר שבע': "Be'er Scheva", 'רמת גן': 'Ramat Gan',
        'ראשון לציון': 'Rischon LeZion', 'פתח תקווה': 'Petach Tikwa',
        'נצרת': 'Nazareth', 'טבריה': 'Tiberias', 'עכו': 'Akko',
        'צפת': 'Safed', 'מצפה רמון': 'Mitzpe Ramon',
    },
    QA: {
        'west bay': 'Doha', 'the pearl': 'Doha', 'lusail': 'Lusail',
        'katara': 'Doha', 'msheireb': 'Doha', 'corniche doha': 'Doha',
        'old airport doha': 'Doha', 'al sadd': 'Doha', 'al waab': 'Doha',
        // More Doha neighborhoods
        'al rayyan': 'Al-Rayyan', 'al wakrah': 'Al Wakrah', 'duhail': 'Doha',
        'fereej bin mahmoud': 'Doha', 'najma doha': 'Doha', 'nuaija': 'Doha',
        'al thumama': 'Doha', 'madinat khalifa': 'Doha', 'al aziziyah doha': 'Doha',
        'al mansoura doha': 'Doha', 'al muntazah': 'Doha', 'al dafna': 'Doha',
        'west bay lagoon': 'Doha', 'diplomatic area doha': 'Doha',
        'al jazeera doha': 'Doha', 'souq waqif': 'Doha', 'msheireb downtown': 'Doha',
        'barwa city': 'Doha', 'abu hamour': 'Doha',
        // More Qatar areas
        'lusail city': 'Lusail', 'lusail marina': 'Lusail', 'lusail stadium': 'Lusail',
        'education city': 'Doha', 'al waab city': 'Doha',
        'al khor': 'Doha', 'al khor city': 'Doha',
        'mesaieed': 'Mesaieed', 'al wakra city': 'Al Wakrah',
        'al shamal': 'Doha', 'dukhan': 'Doha',
        'zubarah fort': 'Doha', 'al zubarah': 'Doha',
        'fuwairit beach': 'Doha', 'purple island': 'Doha',
        'doha golf club': 'Doha', 'aspire zone': 'Doha',
        'al waab street': 'Doha', 'grand hyatt area': 'Doha',
        // Arabic language names
        'الدوحة': 'Doha', 'قطر': 'Doha', 'لوسيل': 'Doha',
        'الكور': 'Doha', 'الوكرة': 'Al Wakrah',
    },
    SA: {
        'al olaya': 'Riad', 'malaz': 'Riad', 'diplomatic quarter': 'Riad',
        'king fahd road': 'Riad', 'exit 7': 'Riad', 'al wurud': 'Riad',
        'al balad': 'Djiddah', 'corniche jeddah': 'Djiddah', 'al hamra': 'Djiddah',
        'al rawdah': 'Djiddah', 'obhur': 'Djiddah',
        'madinah center': 'Medina',
        'diriyah riyadh': 'Riad', 'king abdullah economic city': 'King Abdullah Economic City',
        'alula heritage': 'Al Ula', 'madain saleh': 'Al Ula', 'hegra site': 'Al Ula',
        'neom region': 'Tabuk', 'tabuk city': 'Tabuk',
        'abha asir': 'Abha', 'rijal almaa': 'Abha',
        'khobar city': 'Al Khobar', 'dammam city': 'Dammam',
        'jubail city': 'al-Dschubail',
        // Riyadh extra districts
        'al nakheel riyadh': 'Riad', 'al mohammadiyah': 'Riad', 'al yasmin': 'Riad',
        'al malaz riyadh': 'Riad', 'al muruj riyadh': 'Riad', 'al ghadeer': 'Riad',
        'king salman road': 'Riad', 'prince sultan road': 'Riad',
        'riyadh park': 'Riad', 'north riyadh': 'Riad', 'al masif': 'Riad',
        'kingdom tower area': 'Riad', 'al sulimaniyah': 'Riad',
        'al rawdah riyadh': 'Riad', 'al sahafa': 'Riad',
        // Jeddah extra areas
        'al hamadaniyah': 'Djiddah', 'al rawabi jeddah': 'Djiddah', 'al zahraa': 'Djiddah',
        'al salamah': 'Djiddah', 'al sharafiyah': 'Djiddah', 'al naseem': 'Djiddah',
        'al faysaliyah jeddah': 'Djiddah', 'al rabwah jeddah': 'Djiddah',
        'al woroud': 'Djiddah', 'al aziziyah jeddah': 'Djiddah',
        // Medina areas
        'al masjid al nabawi': 'Medina', 'nabawi mosque': 'Medina',
        'al haram medina': 'Medina', 'quba mosque': 'Medina',
        'al anbariyah': 'Medina',
        // Eastern Province
        'al khobar corniche': 'Al Khobar', 'half moon bay saudi': 'Al Khobar',
        'tarout island': 'Dammam', 'al uqayr': 'Al Uqayr',
        // Other Saudi cities
        'yanbu city': 'Yanbu', 'yanbu al bahr': 'Yanbu',
        'mecca holy city': 'Mekka', 'al haram mecca': 'Mekka', 'zamzam': 'Mekka',
        'taif city': 'Taif', 'al hawiyah': 'Taif',
        'bisha saudi': 'Bisha', 'najran city': 'Nejran', 'jizan city': 'Dschāzān',
        'qatif saudi': 'Dammam', 'hofuf saudi': 'Al-Hofuf',
        'hail city': 'Hail', 'al ula region': 'Al Ula', 'dedan': 'Al Ula',
        'turaif': 'Turaif',
        // Red Sea / NEOM region
        'neom': 'Tabuk', 'sharma beach': 'Tabuk', 'umluj': 'Umluj',
        'al wajh': 'al-Wadschh', 'sharm tabuk': 'Tabuk',
        // Asir extras
        'al soudah': 'Abha', 'tanoumah': 'Abha', 'al habala': 'Abha',
        'abha cable car': 'Abha', 'asir national park': 'Abha',
        // Far North
        'sakaka': 'Sakaka', 'qurayyat': 'Gurayat', 'arar saudi': 'Arar',
        // More Riyadh extras
        'diriyah': 'Riad', 'al bujairi': 'Riad',
        'red sea mall area': 'Djiddah', 'roshana mall': 'Djiddah',
        // Arabic language names
        'الرياض': 'Riad', 'جدة': 'Djiddah', 'مكة المكرمة': 'Mekka',
        'المدينة المنورة': 'Medina', 'الدمام': 'Dammam', 'الخبر': 'Al Khobar',
        'أبها': 'Abha', 'تبوك': 'Tabuk', 'الطائف': 'Taif',
        'العُلا': 'Al Ula', 'حائل': 'Hail', 'ينبع': 'Yanbu',
        'الجبيل': 'al-Dschubail', 'القطيف': 'Dammam', 'نجران': 'Nejran',
        'جيزان': 'Dschāzān',
    },
    JO: {
        'rainbow street': 'Amman', 'abdoun': 'Amman', 'shmeisani': 'Amman',
        'sweifieh': 'Amman', 'downtown amman': 'Amman', 'jabal amman': 'Amman',
        'wadi musa': 'Wadi Musa',
        // Jordan expanded
        'petra city': 'Petra', 'little petra': 'Petra', 'beidha': 'Petra',
        'wadi rum': 'Wadi Rum', 'rum village': 'Wadi Rum',
        'aqaba city': 'Akaba', 'aqaba beach': 'Akaba', 'south beach aqaba': 'Akaba',
        'dead sea jordan': 'Suwaymah', 'madaba city': 'Madaba', 'mosaic map': 'Madaba',
        'jerash ruins': 'Gerasa', 'jerash city': 'Gerasa',
        'ajloun castle': 'Ajloun', 'umm qais': 'Irbid',
        'irbid city': 'Irbid', 'zarqa': 'Amman', 'zarqa city': 'Amman',
        'salt jordan': 'Salt',
        // More Amman neighborhoods
        'abdali': 'Amman', 'jabal hussein': 'Amman', 'wadi seer': 'Amman',
        'dabouq': 'Amman', 'khalda': 'Amman', 'tla al ali': 'Amman',
        'rabieh amman': 'Amman', 'mecca street amman': 'Amman',
        'sport city amman': 'Amman', 'airport road amman': 'Amman',
        'jubeiha': 'Amman', 'shafa badran': 'Amman', 'naour': 'Amman',
        // More Jordan cities
        'kerak castle': 'Al-Karak', 'karak city': 'Al-Karak', 'al-karak': 'Al-Karak',
        'maan jordan': 'Wadi Rum', 'maan city': 'Wadi Rum', 'wadi musa village': 'Petra',
        'tafileh': 'Al-Karak', 'tafilah': 'Al-Karak',
        'mafraq city': 'Amman', 'ramtha': 'Irbid',
        'azraq': 'Amman', 'azraq wetland': 'Amman',
        'zarqa river': 'Amman', 'russeifa': 'Amman',
        // Dead Sea resort area
        'dead sea resort': 'Suwaymah', 'sweimeh': 'Suwaymah',
        'bethany beyond the jordan': 'Madaba',
        // Aqaba extras
        'aqaba gulf': 'Akaba', 'tala bay aqaba': 'Akaba',
        'saraya aqaba': 'Akaba', 'ayla aqaba': 'Akaba',
        // Wadi Rum extras
        'lawrence spring': 'Wadi Rum', 'khazali canyon': 'Wadi Rum',
        'burdah rock': 'Wadi Rum', 'seven pillars of wisdom': 'Wadi Rum',
        // Jerash extras
        'oval plaza jerash': 'Gerasa', 'artemis temple jerash': 'Gerasa',
        // Umm Qais
        'umm qais ruins': 'Irbid', 'gadara jordan': 'Irbid',
        // Arabic language names
        'عمّان': 'Amman', 'البتراء': 'Petra', 'وادي رم': 'Wadi Rum',
        'العقبة': 'Akaba', 'إربد': 'Irbid', 'الزرقاء': 'Amman',
        'مادبا': 'Madaba', 'جرش': 'Gerasa', 'الكرك': 'Al-Karak',
    },
    // ── Africa ─────────────────────────────────────────────────────────────────
    EG: {
        'zamalek': 'Kairo', 'maadi': 'Kairo', 'garden city': 'Kairo',
        'downtown cairo': 'Kairo', 'islamic cairo': 'Kairo',
        'giza': 'Giza', 'dokki': 'Kairo', 'mohandessin': 'Kairo',
        'heliopolis': 'Kairo', 'nasr city': 'Kairo', 'rehab city': 'Kairo',
        'new cairo': 'Kairo', '5th settlement': 'Kairo',
        'stanley': 'Alexandria', 'miami alexandria': 'Alexandria', 'raml station': 'Alexandria',
        'el montaza': 'Alexandria', 'sidi bishr': 'Alexandria',
        // Upper Egypt
        'luxor east bank': 'Luxor', 'luxor west bank': 'Luxor',
        'valley of the kings luxor': 'Luxor', 'karnak temple': 'Luxor',
        'aswan city': 'Assuan', 'felucca aswan': 'Assuan', 'philae temple': 'Assuan',
        'abu simbel temple': 'Abu Simbel',
        // Red Sea
        'hurghada beach': 'Hurghada', 'el gouna resort': 'El Gouna',
        'sharm el sheikh': 'Sharm El Sheikh', 'naama bay': 'Sharm El Sheikh',
        'dahab beach': 'Dahab', 'nuweiba beach': 'Nuweiba',
        'saint catherine monastery': 'Heilige Katharina',
        // West Egypt
        'siwa oasis': 'Siwa', 'marsa matruh city': 'Marsa Matruh',
        // More Cairo
        '6th october city': '6th of October City', 'sixth october': '6th of October City', 'sheikh zayed': 'Sheikh Zayed City',
        'new cairo city': 'Kairo', 'new administrative capital': 'Kairo',
        'el shorouk': 'Kairo', 'badr city': 'Kairo', 'obour': 'Kairo',
        'helwan': 'Kairo', 'ain shams': 'Kairo', 'manshiyat nasser': 'Kairo',
        'manial': 'Kairo', 'el agouza': 'Kairo', 'imbaba': 'Kairo',
        'shubra': 'Kairo', 'rod el farag': 'Kairo', 'el matariyya': 'Kairo',
        'nasr city east': 'Kairo', 'hadaiq el qubba': 'Kairo', 'abdin': 'Kairo',
        'el sayeda zeinab': 'Kairo', 'gamaliya': 'Kairo', 'bab el louq': 'Kairo',
        // More Alexandria
        'el shatby': 'Alexandria', 'cleopatra': 'Alexandria', 'ibrahimia': 'Alexandria',
        'el hadara': 'Alexandria', 'el mandara': 'Alexandria', 'el max': 'Alexandria',
        'el agami': 'Alexandria', 'king mariout': 'Alexandria',
        'el anfoushi': 'Alexandria', 'miami alex': 'Alexandria',
        // Red Sea extras
        'sahl hasheesh': 'Hurghada', 'makadi bay': 'Hurghada',
        'soma bay': 'Hurghada', 'el quseir': 'El Quseir', 'marsa alam': 'Marsa Alam',
        'hamata': 'Marsa Alam', 'berenice': 'Marsa Alam',
        // Sinai extras
        'taba heights': 'Taba', 'taba city': 'Taba',
        'ras mohammed': 'Sharm El Sheikh', 'nabq': 'Sharm El Sheikh',
        'sharks bay': 'Sharm El Sheikh', 'soho square sharm': 'Sharm El Sheikh',
        // Mediterranean coast
        'el alamein': 'El Alamein', 'borg el arab': 'Borg el-Arab',
        'north coast egypt': 'Marsa Matruh', 'sidi abd el rahman': 'Marsa Matruh',
        // Upper Egypt extras
        'edfu': 'Assuan', 'kom ombo': 'Assuan', 'esna': 'Isna',
        'el minya': 'El Minya', 'asyut': 'Assiut',
        'qena': 'Qena', 'sohag': 'Assiut',
    },
    MA: {
        'medina': 'Marrakesch', 'medina marrakech': 'Marrakesch', 'jemaa el fna': 'Marrakesch',
        'djemaa el fna': 'Marrakesch', 'gueliz': 'Marrakesch', 'hivernage': 'Marrakesch',
        'palmeraie': 'Marrakesch', 'mellah': 'Marrakesch',
        'ain diab': 'Casablanca', 'maarif': 'Casablanca', 'anfa': 'Casablanca',
        'ville nouvelle': 'Casablanca',
        'agadir beach': 'Agadir', 'talborjt': 'Agadir',
        'asilah old town': 'Asilah',
        'chefchaouen old town': 'Chefchaouen',
        // Fes extras
        'fes el bali': 'Fès', 'fes medina': 'Fès', 'bou inania': 'Fès',
        'meknes city': 'Meknes', 'volubilis ruins': 'Meknes',
        // Tangier extras
        'tangier old medina': 'Tanger (und Umgebung)', 'cap spartel': 'Tanger (und Umgebung)',
        // Desert / Sahara
        'merzouga village': 'Merzouga', 'erg chebbi dunes': 'Merzouga',
        'zagora desert': 'Zagora', 'm hamid oasis': 'Zagora',
        // High Atlas
        'ouarzazate city': 'Ouarzazate', 'ait benhaddou': 'Ouarzazate',
        'dades gorge': 'Boumalne Dades',
        'todra gorge': 'Tinghir',
        // Essaouira extras
        'essaouira ramparts': 'Essaouira', 'essaouira beach': 'Essaouira',
        // North Morocco extras
        'tetouan medina': 'Tétouan', 'larache city': 'Larache',
        'el jadida': 'El Jadida', 'azemmour': 'Azemmour',
        'safi morocco': 'Safi', 'el kelaa des sraghna': 'Marrakesh',
        // More Marrakech neighborhoods
        'semlalia': 'Marrakesch', 'massira': 'Marrakesch',
        'amelkis': 'Marrakesch', 'targa marrakech': 'Marrakesch',
        'majorelle': 'Marrakesch', 'mouassine': 'Marrakesch',
        // More Casablanca neighborhoods
        'hay hassani': 'Casablanca', 'sidi maarouf': 'Casablanca',
        'ain chock': 'Casablanca', 'derb sultan': 'Casablanca',
        'ben msik': 'Casablanca', 'roches noires': 'Casablanca',
        // Rabat
        'rabat agdal': 'Rabat', 'hassan rabat': 'Rabat', 'souissi': 'Rabat',
        'kasbah oudaias': 'Rabat', 'rabat medina': 'Rabat',
        // More Agadir
        'bensergao': 'Agadir', 'tilila': 'Agadir', 'inezgane': 'Inezgane',
        'taghazout surf': 'Taghazout',
        // Ifrane
        'ifrane city': 'Ifrane', 'michlifen ski': 'Ifrane',
        // Nador / Oujda
        'oujda city': 'Oujda', 'nador city': 'Nador',
        // More Saharan / desert routes
        'draa valley': 'Zagora', 'tamegroute': 'Zagora', 'mhamid el ghizlane': 'Zagora',
        'merzouga dunes': 'Merzouga', 'hassilabied': 'Merzouga',
        'tinghir city': 'Tinghir', 'tinerhir gorge': 'Tinghir',
        'boumalne dades': 'Boumalne Dades', 'kelaa mgouna': "Kelaat M'Gouna",
        'rose valley morocco': "Kelaat M'Gouna",
        'errachidia city': 'Errachidia', 'midelt': 'Midelt',
        // Atlas
        'toubkal': 'Asni', 'imlil': 'Asni', 'asni': 'Asni',
        'ourika valley': 'Marrakesch', 'setti fatma': 'Setti-Fatma',
        // Inland Moroccan cities
        'beni mellal': 'Beni-Mellal', 'khenifra': 'Khénifra', 'khouribga': 'Khouribga',
        'settat': 'Casablanca', 'berrechid': 'Berrechid',
        'kenitra city': 'Kenitra', 'salé': 'Sale', 'sale city': 'Sale',
        'temara': 'Temara', 'skhirat': 'Skhirat',
        // More Tangier / north
        'fnideq': 'Fnideq', 'martil': 'Martil', 'mdiq': "M'diq",
        'al hoceima': 'Al-Hoceima', 'imzouren': 'Al-Hoceima',
        'saida morocco': 'Meknes', 'guercif': 'Guercif',
        // Atlantic coast south
        'agadir south': 'Agadir', 'tiznit': 'Tiznit', 'sidi ifni': 'Sidi Ifni',
        'tan tan': 'Tan-Tan', 'guelmim': 'Guelmim',
        'dakhla': 'Ad-Dakhla (Westsahara)', 'laayoune': 'El Aaiún (Westsahara)',
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
        'waterfront': 'Kapstadt', 'v&a waterfront': 'Kapstadt', 'bo-kaap': 'Kapstadt',
        'sea point': 'Kapstadt', 'camps bay': 'Kapstadt', 'green point': 'Kapstadt',
        'de waterkant': 'Kapstadt', 'gardens': 'Kapstadt', 'oranjezicht': 'Kapstadt',
        'woodstock': 'Kapstadt', 'observatory': 'Kapstadt', 'mowbray': 'Kapstadt',
        'rondebosch': 'Kapstadt', 'claremont': 'Kapstadt', 'constantia': 'Kapstadt',
        'hout bay': 'Kapstadt', 'simons town': 'Kapstadt', 'muizenberg': 'Kapstadt',
        'sandton': 'Johannesburg', 'rosebank': 'Rosebank', 'melrose arch': 'Johannesburg',
        'maboneng': 'Johannesburg', 'braamfontein': 'Johannesburg', 'parktown': 'Johannesburg',
        'soweto': 'Soweto', 'fourways': 'Fourways',
        'durban beachfront': 'Durban', 'umhlanga': 'Umhlanga Rocks', 'berea durban': 'Durban',
        'ballito': 'Ballito',
        // Cape Town extras
        'kalk bay': 'Kapstadt', 'fish hoek': 'Kapstadt',
        'clifton beach': 'Kapstadt', 'llandudno cape': 'Kapstadt',
        // Joburg extras
        'greenside': 'Johannesburg', 'linden': 'Johannesburg',
        'craighall park': 'Johannesburg', 'illovo': 'Johannesburg',
        'norwood joburg': 'Johannesburg', 'orange grove': 'Johannesburg',
        // Port Elizabeth / Gqeberha
        'port elizabeth beach': 'Port Elizabeth', 'summerstrand': 'Summerstrand',
        // East London
        'east london sa': 'East London',
        // Mpumalanga / Panorama Route
        'graskop': 'Graskop', 'pilgrim s rest': 'Graskop',
        'bourkes luck potholes': 'Graskop',
        'nelspruit city': 'Hazyview',
        // Northern Cape / Karoo
        'kimberley city': 'Kimberley', 'upington': 'Upington',
        'sutherland': 'Sutherland',
        // Free State
        'bloemfontein city': 'Bloemfontein',
        // Wine country extras
        'hermanus city': 'Hermanus', 'overstrand': 'Hermanus',
        'worcester wine': 'Worcester', 'robertson winery': 'Robertson',
        // More Cape Town neighborhoods
        'tamboerskloof': 'Kapstadt', 'vredehoek': 'Kapstadt', 'higgovale': 'Kapstadt',
        'fresnaye': 'Kapstadt', 'bantry bay': 'Kapstadt', 'three anchor bay': 'Kapstadt',
        'mouille point': 'Kapstadt', 'bloubergstrand': 'Kapstadt', 'melkbosstrand': 'Kapstadt',
        'strand western cape': 'Kapstadt', 'gordons bay': 'Kapstadt', 'somerset west': 'Somerset West',
        'bellville': 'Kapstadt', 'parow': 'Kapstadt', 'goodwood': 'Kapstadt',
        'mitchells plain': 'Kapstadt', 'khayelitsha': 'Kapstadt',
        // More Joburg areas
        'midrand': 'Midrand', 'centurion joburg': 'Johannesburg',
        'east rand': 'Johannesburg', 'westrand': 'Johannesburg',
        'roodepoort': 'Roodepoort', 'germiston': 'Germiston', 'boksburg': 'Boksburg',
        'benoni': 'Benoni', 'alberton': 'Alberton', 'kempton park': 'Kempton Park',
        'edenvale': 'Edenvale', 'bedfordview': 'Bedfordview',
        // More Pretoria areas
        'centurion': 'Centurion', 'lynnwood': 'Pretoria', 'menlyn': 'Pretoria',
        'silverton': 'Pretoria', 'sinoville': 'Pretoria', 'sunnyside pretoria': 'Pretoria',
        'hatfield pretoria': 'Pretoria',
        // Garden Route extras
        'oudtshoorn city': 'Oudtshoorn', 'cango caves': 'Oudtshoorn',
        'wilderness beach': 'Wilderness', 'victoria bay': 'George', 'sedgefield': 'Sedgefield',
        'nature s valley': 'Plettenberg Bay', 'robberg beach': 'Plettenberg Bay',
        // KwaZulu-Natal extras
        'durban north': 'Durban North', 'la lucia': 'Durban', 'pinetown': 'Durban',
        'westville durban': 'Durban', 'margate kzn': 'Margate', 'scottburgh': 'Scottburgh',
        'hluhluwe': 'Hluhluwe', 'ithala': 'Vryheid', 'sodwana bay': 'Jozini',
        'st lucia kzn': 'Saint Lucia', 'isimangaliso': 'Saint Lucia',
        'pietermaritzburg': 'Pietermaritzburg',
        // More Mpumalanga
        'sabie': 'Sabie', 'machadodorp': 'Machadodorp', 'dullstroom': 'Dullstroom',
        'lydenburg': 'Lydenburg', 'kaapschehoop': 'Hazyview',
        // Limpopo
        'polokwane': 'Polokwane', 'tzaneen': 'Tzaneen', 'phalaborwa': 'Phalaborwa',
        'hoedspruit airport area': 'Hoedspruit', 'bela bela': 'Bela-Bela',
        // Eastern Cape
        'grahamstown': 'Grahamstown', 'makhanda': 'Grahamstown',
        'jeffreys bay': 'Jeffreys Bay', 'humansdorp': 'Jeffreys Bay',
        'port alfred': 'Port Alfred', 'east london docks': 'East London',
        // North West
        'rustenburg': 'Rustenburg', 'sun city': 'Sun City', 'pilanesberg': 'Sun City',
        'mafikeng': 'Mahikeng', 'mahikeng': 'Mahikeng',
    },
    KE: {
        'westlands': 'Nairobi', 'karen': 'Karen', 'kilimani': 'Nairobi',
        'lavington': 'Nairobi', 'gigiri': 'Nairobi', 'parklands': 'Nairobi',
        'langata': 'Nairobi', 'upperhill': 'Nairobi', 'cbd nairobi': 'Nairobi',
        'ngong road': 'Nairobi', 'kileleshwa': 'Nairobi',
        'diani': 'Diani Beach (Strand)', 'nyali': 'Mombasa', 'old town mombasa': 'Mombasa',
        // Kenya extras
        'diani beach': 'Diani Beach (Strand)', 'ukunda village': 'Ukunda',
        'malindi city': 'Malindi', 'watamu beach': 'Watamu',
        'lamu old town': 'Lamu', 'shela lamu': 'Lamu',
        'masai mara area': 'Narok', 'narok town': 'Narok',
        'amboseli park area': 'Amboseli', 'namanga': 'Namanga',
        'naivasha lake': 'Naivasha', 'nakuru lake': 'Nakuru', 'nakuru city': 'Nakuru',
        'eldoret city': 'Eldoret', 'kisumu city': 'Kisumu',
        'meru town': 'Meru', 'nanyuki town': 'Nanyuki', 'mount kenya area': 'Nanyuki',
        'samburu area': 'Isiolo', 'isiolo town': 'Isiolo',
        // More Nairobi neighborhoods
        'muthaiga': 'Nairobi', 'runda': 'Nairobi', 'ridgeways': 'Nairobi',
        'kitisuru': 'Nairobi', 'rosslyn': 'Nairobi', 'spring valley': 'Nairobi',
        'brookside': 'Nairobi', 'hurlingham': 'Nairobi', 'riverside': 'Nairobi',
        'south c': 'Nairobi', 'south b': 'Nairobi', 'embakasi': 'Nairobi',
        'kasarani': 'Nairobi', 'roysambu': 'Nairobi', 'ruaka': 'Nairobi',
        'ruiru': 'Ruiru', 'thika': 'Thika', 'juja': 'Nairobi',
        // Mombasa more areas
        'bamburi': 'Mombasa', 'shanzu': 'Mombasa', 'kikambala': 'Mombasa',
        'mtwapa': 'Mtwapa', 'likoni': 'Mombasa', 'tononoka': 'Mombasa',
        // More Kenya destinations
        'tsavo east': 'Tsavo National Park', 'voi': 'Tsavo National Park', 'tsavo west': 'Tsavo West National Park',
        'laikipia': 'Laikipia', 'ol pejeta': 'Nanyuki', 'solio': 'Nanyuki',
        'lake baringo': 'Eldoret', 'lake bogoria': 'Eldoret',
        'lake turkana': 'Lodwar', 'lodwar': 'Lodwar',
        'kitale': 'Kitale', 'kakamega': 'Kakamega', 'homabay': 'Homa Bay',
    },
    // ── Asia Pacific ───────────────────────────────────────────────────────────
    JP: {
        // Mapbox returns the administrative name for a region rung, and the
        // catalog files hotels under the city. Searched for and reached nothing.
        'osaka prefecture': 'Osaka', 'tokyo prefecture': 'Tokyo',
        'kyoto prefecture': 'Kyoto', 'hokkaido prefecture': 'Sapporo',
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
        'tenjin': 'Fukuoka (und Umgebung)', 'nakasu': 'Fukuoka (und Umgebung)', 'hakata': 'Fukuoka (und Umgebung)',
        'daimyo': 'Fukuoka (und Umgebung)', 'yakuin': 'Fukuoka (und Umgebung)', 'ohori': 'Fukuoka (und Umgebung)',
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
        'kamakura station area': 'Kamakura', 'kita kamakura': 'Kamakura', 'enoshima': 'Enoshima',
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
        'american village okinawa': 'Chatan',
        // Matsumoto
        'matsumoto castle': 'Matsumoto',
        // Takayama
        'takayama old town': 'Takayama', 'sanmachi suji': 'Takayama',
        // Beppu / Onsen areas
        'beppu onsen': 'Beppu', 'yufuin': 'Beppu',
        // Tokyo — additional neighborhoods
        'azabu': 'Tokyo', 'azabu-juban': 'Tokyo', 'hiroo': 'Tokyo',
        'nishi-azabu': 'Tokyo', 'takanawa': 'Tokyo', 'sengakuji': 'Tokyo',
        'kabukicho': 'Tokyo', 'shin-okubo': 'Tokyo', 'okubo': 'Tokyo',
        'jingumae': 'Tokyo', 'aoyama': 'Tokyo', 'yoyogi': 'Tokyo',
        'hongo': 'Tokyo', 'suidobashi': 'Tokyo', 'iidabashi': 'Tokyo', 'yushima': 'Tokyo',
        'korakuen': 'Tokyo', 'kojimachi': 'Tokyo', 'nagatacho': 'Tokyo',
        'takadanobaba': 'Tokyo', 'mejiro': 'Tokyo', 'sugamo': 'Tokyo', 'komagome': 'Tokyo',
        'nakano': 'Tokyo', 'kichijoji': 'Tokyo', 'musashino': 'Tokyo', 'mitaka': 'Tokyo',
        'kasai': 'Tokyo', 'nishikasai': 'Tokyo', 'edogawa': 'Tokyo',
        'koiwa': 'Tokyo', 'tennozu isle': 'Tokyo', 'shin-kiba': 'Tokyo',
        'minami-senju': 'Tokyo', 'shibaura': 'Tokyo', 'shiba': 'Tokyo',
        // Osaka — additional
        'abeno': 'Osaka', 'yodoyabashi': 'Osaka', 'kitahama': 'Osaka',
        'bentencho': 'Osaka', 'naniwa osaka': 'Osaka',
        // Kyoto — additional
        'shijo': 'Kyoto', 'oike': 'Kyoto', 'demachiyanagi': 'Kyoto',
        'sannenzaka': 'Kyoto', 'nishijin': 'Kyoto', 'tofukuji': 'Kyoto',
        'kyoto station area': 'Kyoto', 'shijo-kawaramachi': 'Kyoto',
        // Sendai (Miyagi / Tohoku)
        'aoba sendai': 'Sendai', 'ichibancho': 'Sendai', 'kokubuncho': 'Sendai',
        'jozenji': 'Sendai', 'hirose dori sendai': 'Sendai', 'izumi sendai': 'Sendai',
        'miyagino': 'Sendai', 'taihaku': 'Sendai', 'wakabayashi': 'Sendai',
        // Hakodate (Hokkaido)
        'motomachi hakodate': 'Hakodate', 'goryokaku': 'Hakodate',
        'yunokawa': 'Hakodate', 'hakodate morning market': 'Hakodate',
        'kanemori': 'Hakodate', 'bay area hakodate': 'Hakodate',
        // Asahikawa (Hokkaido)
        'asahikawa city': 'Asahikawa', 'asahiyama zoo': 'Asahikawa',
        // Obihiro (Hokkaido)
        'obihiro city': 'Obihiro', 'tokachi obihiro': 'Obihiro',
        // Niigata
        'niigata city centre': 'Niigata', 'furumachi': 'Niigata',
        'bandai niigata': 'Niigata',
        // Tohoku extras
        'aomori city': 'Aomori', 'nebuta festival area': 'Aomori',
        'akita city': 'Akita', 'kantou festival area': 'Akita',
        'yamagata city': 'Yamagata', 'zao onsen': 'Yamagata',
        'aizuwakamatsu': 'Aizu-Wakamatsu', 'tsuruga castle': 'Aizu-Wakamatsu',
        'matsushima': 'Matsushima',
        // San'in (Shimane / Tottori)
        'matsue city': 'Matsue', 'izumo taisha': 'Matsue',
        'tottori city': 'Tottori', 'tottori sand dunes': 'Tottori',
        // Okayama / Kurashiki
        'okayama city': 'Okayama',
        'kurashiki bikan': 'Kurashiki', 'kurashiki ivy square': 'Kurashiki',
        'kojima': 'Kurashiki',
        // Shikoku
        'takamatsu city': 'Takamatsu', 'ritsurin garden': 'Takamatsu',
        'dogo onsen': 'Matsuyama', 'matsuyama castle area': 'Matsuyama',
        'kochi city': 'Kochi', 'hirome market': 'Kochi', 'katsurahama': 'Kochi',
        'tokushima city': 'Tokushima', 'awa odori area': 'Tokushima',
        'naruto': 'Tokushima',
        // Kumamoto (Kyushu)
        'kumamoto castle area': 'Kumamoto', 'suizenji': 'Kumamoto',
        'shimotori': 'Kumamoto', 'ginza dori kumamoto': 'Kumamoto',
        // Miyazaki (Kyushu)
        'miyazaki city': 'Miyazaki', 'aoshima miyazaki': 'Miyazaki',
        'takachiho': 'Takachiho',
        // Saga (Kyushu)
        'saga city': 'Saga', 'karatsu city': 'Karatsu', 'arita': 'Arita',
        // Beppu / Oita expansion
        'beppu city': 'Beppu', 'kannawa': 'Beppu', 'hamawaki': 'Beppu',
        'oita city': 'Oita',
        // Ise / Mie
        'ise city': 'Ise', 'ise jingu': 'Ise', 'naiku ise': 'Ise',
        'toba city': 'Toba', 'kashikojima': 'Toba',
        // Okinawa island destinations beyond Naha
        'naha city': 'Naha', 'shuri': 'Naha', 'tomari': 'Naha',
        'makishi': 'Naha', 'tsuboya': 'Naha',
        'chatan': 'Chatan', 'american village okinawa chatan': 'Chatan',
        'onna': 'Onna', 'onna village': 'Onna', 'busena': 'Onna',
        'nago city': 'Nago', 'motobu': 'Nago', 'ocean expo park': 'Nago',
        'yomitan': 'Yomitan', 'zamami': 'Zamami',
        'ishigaki city': 'Ishigaki-jima', 'kabira bay': 'Ishigaki-jima',
        'taketomi': 'Ishigaki-jima', 'iriomote': 'Ishigaki-jima',
        'miyakojima city': 'Miyako-jima', 'irabu': 'Miyako-jima',
        'yonaguni island': 'Yonaguni Insel',
        // Hokkaido expanded
        'otaru': 'Otaru', 'otaru canal': 'Otaru', 'sakaimachi street': 'Otaru',
        'noboribetsu': 'Noboribetsu', 'noboribetsu onsen': 'Noboribetsu', 'jigokudani hokkaido': 'Noboribetsu',
        'lake toya': 'Toyako', 'toyako': 'Toyako', 'toya onsen': 'Toyako',
        'lake shikotsu': 'Chitose', 'shikotsu': 'Chitose',
        'furano': 'Furano', 'biei': 'Biei', 'patchwork road': 'Biei', 'blue pond biei': 'Biei',
        'abashiri': 'Abashiri', 'drift ice abashiri': 'Abashiri',
        'kushiro': 'Kushiro', 'akan lake': 'Kushiro', 'mashu lake': 'Kushiro',
        'shiretoko': 'Shari', 'utoro': 'Shari', 'rausu': 'Shari',
        'wakkanai': 'Wakkanai', 'rishiri island': 'Wakkanai', 'rebun island': 'Wakkanai',
        // More Sapporo neighborhoods
        'nakajima park': 'Sapporo', 'toyohira': 'Sapporo', 'kiyota sapporo': 'Sapporo',
        'maruyama sapporo': 'Sapporo', 'nishimachi sapporo': 'Sapporo',
        // Nagano & mountain resorts
        'nagano city': 'Nagano', 'zenkoji': 'Nagano', 'zenko-ji': 'Nagano',
        'hakuba': 'Hakuba', 'hakuba valley': 'Hakuba', 'happo-one': 'Hakuba', 'cortina hakuba': 'Hakuba',
        'karuizawa': 'Karuizawa', 'kyu-karuizawa': 'Karuizawa', 'karuizawa resort': 'Karuizawa',
        'kusatsu onsen': 'Kusatsu', 'kusatsu': 'Kusatsu', 'yubatake': 'Kusatsu',
        'shiga kogen': 'Yamanouchi', 'nozawa onsen': 'Nozawa Onsen', 'yamanouchi': 'Yamanouchi',
        'nawate street': 'Matsumoto',
        // Nikko expansion
        'kinugawa onsen': 'Nikko', 'lake chuzenji': 'Nikko', 'chuzenji': 'Nikko',
        'yumoto onsen nikko': 'Nikko', 'kegon falls': 'Nikko',
        // Yokohama sub-areas
        'yamate': 'Yokohama', 'noge': 'Yokohama',
        'sakuragicho': 'Yokohama', 'totsuka': 'Yokohama', 'kohoku': 'Yokohama',
        'hodogaya': 'Yokohama',
        // More Kobe
        'nada kobe': 'Kobe', 'rokko island': 'Kobe', 'arima onsen': 'Kobe', 'suma': 'Kobe',
        // More Osaka neighborhoods
        'juso': 'Osaka', 'nakatsu osaka': 'Osaka', 'higobashi': 'Osaka',
        'morinomiya': 'Osaka', 'sumiyoshi osaka': 'Osaka',
        'hommachi': 'Osaka', 'sakaisuji honmachi': 'Osaka',
        // More Kyoto neighborhoods
        'uzumasa': 'Kyoto', 'kinkakuji area': 'Kyoto',
        'inari kyoto': 'Kyoto',
        'sagano': 'Kyoto', 'kurama': 'Kyoto', 'kibune': 'Kyoto',
        'ohara kyoto': 'Kyoto', 'yamashina': 'Kyoto', 'rakusei': 'Kyoto',
        'uji': 'Uji', 'byodoin': 'Uji',
        // Hiroshima / Seto Inland Sea
        'miyajima': 'Hiroshima', 'itsukushima': 'Hiroshima', 'hatsukaichi': 'Hiroshima',
        'onomichi': 'Onomichi', 'shimanami kaido': 'Onomichi',
        'fukuyama': 'Fukuyama', 'tomonoura': 'Fukuyama',
        // Wakayama
        'koyasan': 'Koya', 'koya-san': 'Koya', 'mount koya': 'Koya', 'okunoin': 'Koya',
        'shirahama': 'Shirahama', 'shirarahama beach': 'Shirahama',
        'nachikatsuura': 'Nachikatsuura', 'nachi falls': 'Nachikatsuura',
        'kumano kodo': 'Nachikatsuura', 'kumano': 'Nachikatsuura',
        'hongu': 'Tanabe', 'tanabe': 'Tanabe',
        // Kagoshima expansion
        'sakurajima': 'Kagoshima', 'ibusuki': 'Ibusuki', 'chiran': 'Kagoshima',
        'yakushima': 'Yakushima', 'kirishima onsen': 'Kagoshima',
        // Kumamoto / Aso
        'aso': 'Aso', 'mount aso': 'Aso', 'aso caldera': 'Aso', 'aso kuju': 'Aso',
        'kurokawa onsen': 'Aso', 'oguni': 'Aso',
        // Fukuoka / Kitakyushu
        'ohori park fukuoka': 'Fukuoka (und Umgebung)', 'nishijin fukuoka': 'Fukuoka (und Umgebung)',
        'kokura': 'Kitakyushu', 'mojiko': 'Kitakyushu', 'moji port': 'Kitakyushu',
        'yanagawa': 'Yanagawa', 'yame': 'Yame',
        // Gifu
        'shirakawa-go': 'Shirakawa', 'shirakawago': 'Shirakawa', 'gokayama': 'Shirakawa',
        // More Mie
        'toba': 'Toba', 'ago bay': 'Toba', 'shima peninsula': 'Toba',
        // Aichi extras
        'inuyama': 'Inuyama', 'gamagori': 'Gamagori',
        // More Nagasaki / Kyushu
        'nagasaki chinatown': 'Nagasaki',
        'hirado': 'Hirado', 'goto islands': 'Nagasaki',
        // More Beppu / Oita
        'myoban onsen': 'Beppu', 'hamawaki onsen': 'Beppu',
        // Tohoku extras
        'hirosaki': 'Hirosaki', 'hirosaki castle': 'Hirosaki', 'hirosaki park': 'Hirosaki',
        'hachinohe': 'Hachinohe',
        'morioka': 'Morioka', 'wanko soba': 'Morioka',
        'hiraizumi': 'Hiraizumi', 'chuson-ji': 'Hiraizumi', 'konjiki-do': 'Hiraizumi',
        'miyako': 'Miyako', 'jodogahama': 'Miyako',
        'matsushima bay': 'Matsushima',
        'kakunodate': 'Akita', 'kakunodate samurai': 'Akita',
        'nyuto onsen': 'Akita', 'tsurunoyu': 'Akita',
        'ginzan onsen': 'Obanazawa', 'ginzan': 'Obanazawa',
        'yamadera': 'Yamagata', 'risshakuji': 'Yamagata',
        // Kanto extras
        'mito': 'Mito', 'kairakuen': 'Mito', 'ibaraki': 'Mito',
        'utsunomiya': 'Utsunomiya', 'utsunomiya gyoza': 'Utsunomiya',
        'nasu': 'Nasu', 'nasu highlands': 'Nasu', 'nasu onsen': 'Nasu',
        'kawagoe': 'Kawagoe', 'little edo': 'Kawagoe', 'koedo': 'Kawagoe',
        'narita': 'Narita', 'narita city': 'Narita', 'naritasan': 'Narita',
        'chiba city': 'Chiba', 'makuhari': 'Chiba', 'makuhari messe': 'Chiba',
        'kamogawa': 'Kamogawa',
        'fujisawa': 'Kamakura', 'odawara': 'Odawara',
        // Mt Fuji area (Yamanashi)
        'kawaguchiko': 'Kawaguchiko', 'lake kawaguchi': 'Kawaguchiko',
        'fujikawaguchiko': 'Kawaguchiko', 'fujiyoshida': 'Fujiyoshida',
        'yamanakako': 'Yamanakako', 'lake yamanaka': 'Yamanakako',
        'gotemba': 'Gotemba', 'gotemba premium outlets': 'Gotemba',
        'motosuko': 'Kawaguchiko', 'saiko lake': 'Kawaguchiko',
        'kofu': 'Kofu', 'shingen': 'Kofu',
        // Niigata extras
        'sado island': 'Sado', 'ryotsu': 'Sado', 'aikawa': 'Sado',
        'echigo yuzawa': 'Yuzawa', 'yuzawa niigata': 'Yuzawa',
        // Hokuriku
        'toyama city': 'Toyama', 'tateyama': 'Toyama', 'kurobe gorge': 'Toyama',
        'tateyama kurobe': 'Toyama',
        'noto': 'Wajima', 'wajima': 'Wajima', 'noto peninsula': 'Wajima',
        'tojinbo': 'Fukui', 'eiheiji': 'Fukui', 'fukui city': 'Fukui',
        // Shizuoka (Izu Peninsula & more)
        'atami': 'Atami', 'atami onsen': 'Atami',
        'ito': 'Ito', 'ito onsen': 'Ito',
        'shimoda': 'Shimoda', 'shirahama izu': 'Shimoda',
        'shuzenji': 'Ito', 'shuzenji onsen': 'Ito',
        'izu': 'Ito', 'izu peninsula': 'Ito',
        'hamamatsu': 'Hamamatsu', 'hamana lake': 'Hamamatsu',
        'shizuoka city': 'Shizuoka', 'miho no matsubara': 'Shizuoka',
        // Shiga (Lake Biwa)
        'otsu': 'Otsu', 'biwako': 'Otsu', 'lake biwa': 'Otsu',
        'hikone': 'Hikone', 'hikone castle': 'Hikone',
        'omihachiman': 'Omihachiman', 'omihachiman canal': 'Omihachiman',
        // Hyogo extras
        'himeji': 'Himeji', 'himeji castle': 'Himeji', 'himeji white heron': 'Himeji',
        'kinosaki onsen': 'Toyooka', 'kinosaki': 'Toyooka',
        'akashi': 'Akashi', 'awaji island': 'Awaji', 'awaji': 'Awaji',
        // Yamaguchi
        'yamaguchi city': 'Yamaguchi', 'rurikoji': 'Yamaguchi',
        'hagi': 'Hagi', 'hagi castle town': 'Hagi',
        'shimonoseki': 'Shimonoseki', 'kanmon strait': 'Shimonoseki',
        'iwakuni': 'Iwakuni', 'kintaikyo': 'Iwakuni',
        // Aichi extras
        'toyota city': 'Toyota', 'okazaki': 'Okazaki', 'okazaki castle': 'Okazaki',
        'gifu city': 'Gifu', 'gifu castle': 'Gifu',
        // Suwa / Nagano extras
        'suwa': 'Suwa', 'suwa lake': 'Suwa', '諏訪': 'Suwa',
        'iida': 'Iida',
        // Hokkaido ski resorts (major international destinations)
        'niseko': 'Niseko', 'niseko village': 'Niseko', 'niseko annupuri': 'Niseko',
        'grand hirafu': 'Niseko', 'hirafu': 'Niseko', 'hanazono niseko': 'Niseko',
        'rusutsu': 'Rusutsu', 'rusutsu resort': 'Rusutsu',
        'tomamu': 'Obihiro', 'hoshino tomamu': 'Obihiro',
        'kiroro': 'Otaru',
        'chitose': 'Chitose', 'new chitose airport': 'Chitose',
        'tomakomai': 'Tomakomai',
        // More Hokkaido
        'muroran': 'Muroran', 'date hokkaido': 'Date',
        'shizunai': 'Shinhidaka', 'erimo': 'Erimo',
        'kamikawa': 'Kamikawa',
        // Fukuoka day trips & suburbs
        'dazaifu': 'Dazaifu', 'dazaifu tenmangu': 'Dazaifu',
        'itoshima': 'Itoshima', 'itoshima beach': 'Itoshima',
        'kurume': 'Kurume', 'kurume ramen': 'Kurume',
        'iizuka': 'Iizuka', 'omuta': 'Kurume',
        'koga fukuoka': 'Koga', 'fukuoka suburbs': 'Fukuoka (und Umgebung)',
        // More Nagasaki / Kyushu
        'unzen': 'Unzen', 'unzen onsen': 'Unzen', 'unzen volcano': 'Unzen',
        'obama nagasaki': 'Obama', 'shimabara': 'Shimabara',
        // Kumamoto extras
        'hitoyoshi': 'Hitoyoshi', 'hitoyoshi castle': 'Hitoyoshi',
        'amakusa': 'Amakusa-gun', 'amakusa islands': 'Amakusa-gun',
        // Oita extras
        'hita': 'Hita', 'mameda town hita': 'Hita',
        'kitsuki': 'Kitsuki', 'kitsuki castle': 'Kitsuki',
        'usuki': 'Usuki', 'usuki stone buddha': 'Usuki',
        // Miyazaki extras
        'nichinan': 'Nichinan', 'nichinan coast': 'Nichinan',
        'hyuga': 'Hyuga', 'udo jingu': 'Nichinan',
        // Kagoshima extras (island destinations)
        'tanegashima': 'Kagoshima', 'tanegashima space center': 'Kagoshima',
        'amami oshima': 'Amami', 'amami': 'Amami', 'naze amami': 'Amami',
        'tokunoshima': 'Kagoshima',
        'okinoerabu': 'Kagoshima',
        // Shikoku extras
        'imabari': 'Imabari', 'imabari castle': 'Imabari',
        'kotohira': 'Kotohira', 'konpira': 'Kotohira', 'kompira': 'Kotohira',
        'uchiko': 'Uchiko',
        'uwajima': 'Uwajima', 'uwajima castle': 'Uwajima',
        // Hiroshima extras
        'takehara': 'Takehara', 'takehara townscape': 'Takehara',
        // Yamaguchi extras
        'akiyoshido': 'Mine', 'mine yamaguchi': 'Mine', 'akiyoshi plateau': 'Mine',
        'shunan': 'Shunan', 'hofu': 'Hofu',
        // Nara extras
        'yoshino': 'Yoshino', 'yoshino cherry': 'Yoshino',
        'horyu-ji': 'Ikaruga', 'horyuji': 'Ikaruga', 'ikaruga': 'Ikaruga',
        'kashihara': 'Kashihara', 'asuka': 'Kashihara', 'asuka village': 'Kashihara',
        'sakurai': 'Sakurai', 'tenri': 'Tenri',
        // Osaka suburbs
        'sakai': 'Sakai', 'daisenryo': 'Sakai',
        'kishiwada': 'Kishiwada', 'kishiwada danjiri': 'Kishiwada',
        'suita': 'Suita', 'expo city suita': 'Suita', 'gamba stadium': 'Suita',
        'higashiosaka': 'Higashi-Osaka', 'toyonaka': 'Toyonaka',
        'ibaraki osaka': 'Ibaraki', 'takatsuki': 'Takatsuki',
        // Kyoto extras
        'amanohashidate': 'Miyazu', 'miyazu': 'Miyazu',
        'maizuru': 'Maizuru',
        // Hyogo extras
        'takarazuka': 'Takarazuka', 'takarazuka revue': 'Takarazuka',
        'nishinomiya': 'Nishinomiya', 'koshien': 'Nishinomiya',
        'amagasaki': 'Amagasaki', 'toyooka hyogo': 'Toyooka',
        // Okayama extras
        'bizen': 'Bizen', 'bizen pottery': 'Bizen',
        'tsuyama': 'Tsuyama',
        // Shizuoka extras
        'numazu': 'Numazu', 'numazu port': 'Numazu',
        'mishima': 'Mishima', 'mishima shizuoka': 'Mishima',
        'fujinomiya': 'Fujinomiya', 'fujinomiya mt fuji': 'Fujinomiya',
        'kakegawa': 'Kakegawa',
        // Aichi extras
        'tokoname': 'Tokoname', 'tokoname pottery': 'Tokoname',
        // Gunma
        'minakami': 'Minakami', 'minakami onsen': 'Minakami', 'tanigawa': 'Minakami',
        'ikaho': 'Takasaki', 'ikaho onsen': 'Takasaki',
        'takasaki': 'Takasaki', 'maebashi': 'Maebashi',
        'kiryu': 'Kiryu',
        // Saitama
        'saitama city': 'Saitama', 'omiya': 'Saitama', 'urawa': 'Saitama',
        'tokorozawa': 'Tokorozawa', 'hanno': 'Hanno',
        'kazo': 'Saitama',
        // More Chiba
        'funabashi': 'Funabashi', 'ichikawa': 'Ichikawa',
        'choshi': 'Choshi', 'katsuura': 'Katsuura',
        'tateyama chiba': 'Tateyama', 'minamiboso': 'Tateyama',
        'kujukuri': 'Toogane',
        // More Kanagawa
        'chigasaki': 'Chigasaki', 'zushi': 'Zushi', 'hayama': 'Hayama',
        'miura': 'Miura', 'miura beach': 'Miura',
        'atsugi': 'Atsugi', 'sagamihara': 'Sagamihara',
        // Tohoku extras
        'tono': 'Tono', 'tono folklore': 'Tono',
        'ichinoseki': 'Ichinoseki', 'geibi gorge': 'Ichinoseki',
        'ishinomaki': 'Sendai',
        'kesennuma': 'Kesennuma',
        'shiogama': 'Shiogama', 'shiogama port': 'Shiogama',
        'towada': 'Towadako', 'lake towada': 'Towadako', 'towadako': 'Towadako',
        'oga peninsula': 'Oga', 'oga': 'Oga', 'namahage': 'Oga',
        // Fukushima
        'urabandai': 'Fukushima', 'bandai azuma': 'Fukushima',
        'koriyama': 'Koriyama', 'iwaki': 'Iwaki',
        // Tochigi
        'mashiko': 'Mashiko', 'mashiko pottery': 'Mashiko',
        // Ibaraki
        'tsukuba': 'Tsukuba', 'tsukuba science city': 'Tsukuba',
        'kasumigaura': 'Tsuchiura', 'tsuchiura': 'Tsuchiura',
        'hitachi': 'Hitachi',
        // Kanazawa / Hokuriku extras
        'komatsu': 'Komatsu', 'komatsu airport': 'Komatsu',
        'yamanaka onsen': 'Kaga', 'kaga onsen': 'Kaga', 'awazu onsen': 'Kaga',
        'katayamazu': 'Kaga',
        // Nagano extras
        'obuse': 'Nagano', 'obuse hokusai': 'Nagano',
        'ueda': 'Ueda', 'ueda castle': 'Ueda',
        'komoro': 'Komoro', 'kaikoma': 'Kofu',
        // Yamanashi extras
        'katsunuma': 'Koshu', 'koshu wine': 'Koshu', 'enzan': 'Koshu',
        // Japanese Kanji city names
        '東京': 'Tokyo', '大阪': 'Osaka', '京都': 'Kyoto',
        '札幌': 'Sapporo', '福岡': 'Fukuoka (und Umgebung)', '名古屋': 'Nagoya',
        '広島': 'Hiroshima', '仙台': 'Sendai', '横浜': 'Yokohama',
        '神戸': 'Kobe', '奈良': 'Nara', '長崎': 'Nagasaki',
        '鹿児島': 'Kagoshima', '熊本': 'Kumamoto', '沖縄': 'Naha',
        '那覇': 'Naha', '金沢': 'Kanazawa', '函館': 'Hakodate',
        '旭川': 'Asahikawa', '新潟': 'Niigata', '松山': 'Matsuyama',
        '高松': 'Takamatsu', '高知': 'Kochi', '徳島': 'Tokushima',
        '長野': 'Nagano', '松本': 'Matsumoto', '高山': 'Takayama',
        '別府': 'Beppu', '由布院': 'Beppu', '軽井沢': 'Karuizawa',
        '草津': 'Kusatsu', '日光': 'Nikko', '鎌倉': 'Kamakura',
        '箱根': 'Hakone', '熱海': 'Atami', '伊東': 'Ito',
        '弘前': 'Hirosaki', '盛岡': 'Morioka', '青森': 'Aomori',
        '秋田': 'Akita', '山形': 'Yamagata', '福島': 'Fukushima',
        '宇都宮': 'Utsunomiya', '前橋': 'Maebashi', '高崎': 'Takasaki',
        '川越': 'Kawagoe', '千葉': 'Chiba', '成田': 'Narita',
        '岡山': 'Okayama', '倉敷': 'Kurashiki', '姫路': 'Himeji',
        '和歌山': 'Wakayama', '大分': 'Oita',
        '宮崎': 'Miyazaki', '佐賀': 'Saga', '富山': 'Toyama',
        '福井': 'Fukui', '静岡': 'Shizuoka', '浜松': 'Hamamatsu',
        '岐阜': 'Gifu', '津': 'Tsu', '大津': 'Otsu',
        '彦根': 'Hikone', '岩国': 'Iwakuni', '下関': 'Shimonoseki',
        '萩': 'Hagi', '釧路': 'Kushiro', '帯広': 'Obihiro',
        '小樽': 'Otaru', '登別': 'Noboribetsu', '二セコ': 'Niseko',
        '石垣島': 'Ishigaki-jima', '宮古島': 'Miyako-jima',
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
        // Jeju — plain 'jeju' key forces province-rung Mapbox results to city rung so TGX resolve fires
        'jeju': 'Jeju', 'jeju-do': 'Jeju', 'jeju island': 'Jeju', 'jeju city center': 'Jeju',
        'hallasan': 'Jeju', 'jungmun': 'Jeju', 'hamdeok beach': 'Jeju',
        // Gyeongju (historic city)
        'gyeongju city': 'Gyeongju', 'bulguksa': 'Gyeongju',
        // Incheon
        'songdo': "Inch'on", 'chinatown incheon': "Inch'on", 'jung-gu incheon': "Inch'on",
        // Suwon
        'suwon hwaseong': 'Suwon',
        // Jeonju
        'jeonju hanok village': 'Jeonju',
        // Sokcho / Gangwon
        'sokcho city': 'Sokcho', 'seoraksan': 'Sokcho',
        // Daegu
        'dongseongno': 'Daegu (und Umgebung)', 'seomun market': 'Daegu (und Umgebung)',
        // Gwangju
        'gwangju city centre': 'Gwangju',
        // Daejeon
        'daejeon city centre': 'Daejeon',
        // Seoul — additional
        'ewha': 'Seoul', 'edae': 'Seoul', 'ewha womans': 'Seoul',
        'yeonnam': 'Seoul', 'seocho': 'Seoul', 'banpo': 'Seoul',
        'daechi': 'Seoul', 'dogok': 'Seoul', 'haebangchon': 'Seoul',
        'gyeongnidan': 'Seoul', 'noksapyeong': 'Seoul', 'ichon': 'Seoul',
        'ikseon-dong': 'Seoul', 'ikseondong': 'Seoul', 'gyeongbokgung': 'Seoul',
        'lotte world area': 'Seoul', 'olympic park seoul': 'Seoul',
        'sanggye': 'Seoul', 'geumho': 'Seoul',
        // Busan — additional
        'yeongdo': 'Busan', 'songdo busan': 'Busan', 'gijang': 'Busan',
        'biff square': 'Busan', 'suyeong': 'Busan', 'millak': 'Busan',
        'dadaepo': 'Busan', 'oncheon-dong': 'Busan',
        // Jeju — additional
        'aewol': 'Jeju', 'seongsan': 'Jeju', 'seongsan ilchulbong': 'Jeju',
        'hyeopjae beach': 'Jeju', 'udo island': 'Jeju',
        // Seoul — additional gu-level and neighborhoods
        'gangbuk': 'Seoul', 'jungnang': 'Seoul', 'seongbuk': 'Seoul',
        'gwangjin': 'Seoul', 'yangcheon': 'Seoul', 'gangseo': 'Seoul',
        'konkuk': 'Seoul', 'mokdong': 'Seoul', 'magok': 'Seoul',
        'mia': 'Seoul', 'suyu': 'Seoul', 'bongcheon': 'Seoul',
        'nakseongdae': 'Seoul', 'sindorim': 'Seoul', 'gasan': 'Seoul',
        'hangangjin': 'Seoul', 'oksu': 'Seoul', 'mullae': 'Seoul',
        'digital media city': 'Seoul', 'worldcup park': 'Seoul',
        'dangsan': 'Seoul', 'gimpo airport area': 'Seoul',
        'godeok': 'Seoul', 'cheonho': 'Seoul', 'amsa': 'Seoul',
        // Daegu (대구) neighborhoods
        'suseong': 'Daegu (und Umgebung)', 'dalseo': 'Daegu (und Umgebung)', 'dalseong': 'Daegu (und Umgebung)',
        'jung-gu daegu': 'Daegu (und Umgebung)', 'buk-gu daegu': 'Daegu (und Umgebung)',
        'duryu': 'Daegu (und Umgebung)', 'anjirang': 'Daegu (und Umgebung)', 'chilseong': 'Daegu (und Umgebung)',
        'banwoldang': 'Daegu (und Umgebung)', 'suseong lake': 'Daegu (und Umgebung)', 'apsan': 'Daegu (und Umgebung)',
        // Gwangju (광주) neighborhoods
        'chungjang-ro': 'Gwangju', 'buk-gu gwangju': 'Gwangju',
        'sang-mu': 'Gwangju', 'unam': 'Gwangju', 'seo-gu gwangju': 'Gwangju',
        'dong-gu gwangju': 'Gwangju', 'gwangsan': 'Gwangju',
        // Daejeon (대전) neighborhoods
        'dunsan': 'Daejeon', 'eunhaengdong': 'Daejeon',
        'yuseong': 'Daejeon', 'daedeok': 'Daejeon',
        'jung-gu daejeon': 'Daejeon', 'expo daejeon': 'Daejeon',
        // Ulsan (울산)
        'ulsan city': 'Ulsan', 'taehwagang': 'Ulsan',
        'jangsaengpo': 'Ulsan', 'dong-gu ulsan': 'Ulsan', 'nam-gu ulsan': 'Ulsan',
        // Changwon / Gyeongnam
        'changwon city': 'Changwon', 'masan': 'Changwon', 'jinhae': 'Changwon',
        // Chuncheon / Gangwon
        'nami island': 'Chuncheon', 'gapyeong': 'Gapyeong',
        'chuncheon city': 'Chuncheon',
        // Pyeongchang (ski resorts)
        'alpensia': 'Pyeongchang', 'yongpyong': 'Pyeongchang',
        'daegwallyeong': 'Pyeongchang',
        // Jeju extras
        'jeju airport area': 'Jeju', 'sinjeju': 'Jeju',
        'jeju old town': 'Jeju', 'dongmun market': 'Jeju',
        // Jeju island sub-areas
        'seogwipo city': 'Seogwipo', 'jungmun resort': 'Seogwipo',
        'udo': 'Jeju', 'manjang cave': 'Jeju', 'bijarim': 'Jeju',
        'olle trail': 'Jeju', 'gwakji beach': 'Jeju',
        // Suwon full coverage
        'suwon': 'Suwon', 'paldal': 'Suwon', 'ingye': 'Suwon',
        'woncheon': 'Suwon', 'gwonseon': 'Suwon', 'jangan': 'Suwon',
        // Jeonju expanded
        'jeonju': 'Jeonju', 'wansan': 'Jeonju', 'deokjin': 'Jeonju',
        'wansan-gu': 'Jeonju', 'jeonju bibimbap': 'Jeonju',
        // Sokcho expanded
        'sokcho': 'Sokcho', 'daepohang': 'Sokcho', 'abai village': 'Sokcho',
        'cheongcho lake': 'Sokcho', 'oeongchi beach': 'Sokcho',
        // Andong
        'andong': 'Andong', 'hahoe village': 'Andong', 'hahoe': 'Andong',
        'andong jjimdak': 'Andong', 'dosan seowon': 'Andong',
        // Yeosu
        'yeosu': 'Yòsu', 'dolsan': 'Yòsu', 'odongdo': 'Yòsu',
        'yeosu expo': 'Yòsu', 'hyangiram': 'Yòsu',
        // Tongyeong
        'tongyeong': 'Tongyeong', 'hansan island': 'Tongyeong',
        'tongyeong cable car': 'Tongyeong', 'geoje': 'Geoje',
        // Jinju
        'jinju': 'Chinju', 'jinju castle': 'Chinju', 'nam river jinju': 'Chinju',
        // Namhae
        'namhae': 'Namhae', 'namhae german village': 'Namhae',
        'sangju silver beach': 'Namhae',
        // Gangneung
        'gangneung': 'Gangneung', 'gyeongpo beach': 'Gangneung',
        'gyeongpo lake': 'Gangneung', 'jumunjin': 'Gangneung',
        'anmok coffee street': 'Gangneung',
        // East coast
        'samcheok': 'Samcheok', 'samcheok caves': 'Samcheok', 'jangho': 'Samcheok',
        'donghae': 'Donghae', 'mukho port': 'Donghae',
        'yangyang': 'Yangyang', 'naksan beach': 'Yangyang',
        // West coast
        'boryeong': 'Boryeong', 'daecheon beach': 'Boryeong',
        'taean': 'Taean', 'mallipo beach': 'Taean', 'mongsanpo': 'Taean',
        // Incheon expanded
        'incheon': "Inch'on", 'incheon chinatown': "Inch'on",
        'songdo ibd': "Inch'on", 'bupyeong': "Inch'on", 'juan': "Inch'on",
        'wolmido': "Inch'on", 'ganghwa island': "Inch'on",
        // More Busan gu-level
        'sasang': 'Busan', 'sasang-gu': 'Busan', 'saha': 'Busan', 'saha-gu': 'Busan',
        'buk-gu busan': 'Busan', 'gangseo busan': 'Busan', 'dong-gu busan': 'Busan',
        'nam-gu busan': 'Busan', 'yeongdo-gu': 'Busan',
        'jung-gu busan': 'Busan', 'busanjin': 'Busan', 'busanjin-gu': 'Busan',
        // Busan neighborhoods
        'jangsan': 'Busan', 'dalmaji hill': 'Busan',
        'cheongsapo': 'Busan', 'igidae': 'Busan', 'oryukdo': 'Busan',
        'mangmi': 'Busan', 'dongnae': 'Busan', 'beomeo': 'Busan',
        'geumjeong': 'Busan', 'jwacheon': 'Busan', 'ilgwang': 'Busan',
        // More Seoul dong-level (new entries only)
        'ttukseom': 'Seoul', 'banghwa': 'Seoul', 'gayang': 'Seoul', 'hwagok': 'Seoul',
        'gurodaero': 'Seoul', 'sadang': 'Seoul', 'yangjae': 'Seoul',
        'garosu-gil': 'Seoul', 'sinsa': 'Seoul', 'nonhyeon': 'Seoul',
        'achasan': 'Seoul', 'gunja': 'Seoul', 'gwangnaru': 'Seoul',
        'changdong': 'Seoul', 'ssangmun': 'Seoul', '압구정': 'Seoul',
        // Gyeonggi day-trip towns
        'petite france': 'Gapyeong', 'garden of morning calm': 'Gapyeong',
        'paju': 'Paju', 'heyri village': 'Paju', 'imjingak': 'Paju',
        'hwaseong': 'Hwaseong', 'everland area': 'Hwaseong',
        'yongin': 'Yongin', 'korean folk village': 'Yongin',
        'gongju': 'Gongju', 'buyeo': 'Buyeo',
        // Gyeonggi metro cities
        'seongnam': 'Seongnam', 'bundang': 'Seongnam', 'pangyo': 'Seongnam',
        'goyang': 'Goyang', 'ilsan': 'Goyang', 'ilsan east': 'Goyang', 'ilsan west': 'Goyang',
        'bucheon': 'Bucheon', 'ansan': 'Ansan', 'siheung': 'Ansan',
        'uijeongbu': 'Uijeongbu', 'anyang': 'Anyang', 'gwangmyeong': 'Gwangmyeong',
        'gimpo': 'Gimpo-si',
        'osan': 'Osan', 'pyeongtaek': 'Pyeongtaek',
        // North Gyeonggi / DMZ area
        'pocheon': 'Pocheon', 'cheorwon': 'Pocheon',
        'dongducheon': 'Dongducheon', 'yanggu': 'Inje',
        // Jeolla region
        "mokpo": "Mokp'o", "yudalsan": "Mokp'o",
        'suncheon': 'Suncheon (und Umgebung)', 'suncheon bay': 'Suncheon (und Umgebung)', 'suncheonman': 'Suncheon (und Umgebung)',
        'yeosu odongdo': 'Yòsu',
        'damyang': 'Gwangju', 'metasequoia road': 'Gwangju',
        'jindo': "Mokp'o", 'wando': 'Wando',
        'buan': 'Byeonsan', 'byeonsanbando': 'Byeonsan',
        'gunsan': 'Kunsan', 'near gunjsan': 'Kunsan',
        'iksan': 'Iksan', '익산': 'Iksan',
        // Chungcheong region
        'cheongju': 'Cheongju', 'heungdeok': 'Cheongju',
        'cheonan': 'Cheonan', 'asan': 'Cheonan',
        'daejeon yuseong': 'Daejeon', 'daejeon expo park': 'Daejeon',
        'sejong': 'Sejong', 'sejong city': 'Sejong',
        'boryeong daecheon': 'Boryeong',
        'danyang': 'Danyang', 'danyang caves': 'Danyang',
        // Gyeongsang extras
        'pohang': 'Pohang', 'homigot': 'Pohang', 'posco area': 'Pohang',
        'gyeongsan': 'Gyeongsan',
        'miryang': 'Miryang', 'miryang aranam': 'Miryang',
        'hadong': 'Gurye', 'hwagae market': 'Gurye',
        'geochang': 'Geochang', 'haeinsa': 'Geochang',
        'sacheon': 'Sacheon',
        // Gangwon extras
        'wonju': 'Wonju', 'chiaksan': 'Wonju',
        'hoengseong': 'Wonju',
        'taebaek': 'Taebaek', 'jeongseon': 'Jeongseon',
        'inje': 'Inje', 'baekdamsa': 'Inje',
        'goseong': 'Sokcho', 'hwajinpo': 'Sokcho',
        'pyeongchang village': 'Pyeongchang',
        // Island destinations
        'ulleung island': 'Pohang', 'ulleungdo': 'Pohang',
        'dokdo': 'Pohang',
        'geoje island': 'Geoje', 'okpo': 'Geoje',
        'sinan': "Mokp'o",
        // Gyeongbuk (North Gyeongsang) — missing cities
        'gumi': 'Kumi', 'gumi samsung': 'Kumi', 'gumi industrial complex': 'Kumi',
        'yeongcheon': 'Gyeongju', 'yeongcheon wine': 'Gyeongju',
        'cheongdo': 'Daegu (und Umgebung)', 'cheongdo bullfighting': 'Daegu (und Umgebung)',
        'uiseong': 'Andong', 'uiseong garlic': 'Andong',
        'mungyeong': 'Mungyeong-eup', 'mungyeong saejae': 'Mungyeong-eup', 'mungyeong tea bowl': 'Mungyeong-eup',
        'sangju': 'Sangju-si', 'sangju cycling': 'Sangju-si',
        'gunwi': 'Daegu (und Umgebung)',
        'yeongdeok': 'Pohang', 'yeongdeok crab': 'Pohang', 'yeongdeok blueroad': 'Pohang',
        'yeongju': 'Yeongju', 'buseoksa': 'Yeongju', 'sobaeksan yeongju': 'Yeongju',
        'yecheon': 'Andong', 'world archery yeongju': 'Yeongju',
        'bonghwa': 'Yeongju',
        'yeongyang': 'Andong',
        'cheongsong': 'Cheongsong-eup',
        'seongju': 'Daegu (und Umgebung)',
        'goryeong': 'Daegu (und Umgebung)', 'daegaya': 'Daegu (und Umgebung)',
        // Gyeongju additional areas
        'tumuli park': 'Gyeongju', 'cheomseongdae': 'Gyeongju',
        'anapji': 'Gyeongju', 'bomun lake': 'Gyeongju',
        'yangdong village': 'Gyeongju', 'gampo': 'Gyeongju',
        'gyeongju donggung': 'Gyeongju', 'gyeongju hyanggyo': 'Gyeongju',
        // Gyeongnam (South Gyeongsang) — missing cities
        'yangsan': 'Yangsan', 'tongdosa': 'Yangsan', 'yangsan near busan': 'Yangsan',
        'gimhae': 'Gimhae', 'kimhae': 'Gimhae', 'gaya kingdom': 'Gimhae',
        'haman': 'Changwon',
        'uiryeong': 'Chinju',
        'hapcheon': 'Changwon', 'hapcheon lake': 'Changwon', 'hapcheon drama set': 'Changwon',
        'sancheong': 'Chinju', 'sancheong jirisan': 'Chinju',
        'hamyang': 'Chinju', 'hamyang gardens': 'Chinju',
        'goseong gyeongnam': 'Tongyeong', 'goseong dinosaur': 'Tongyeong',
        // South Jeolla (Jeonnam) — missing cities
        'naju': 'Naju', 'naju pear': 'Naju', 'bitgaram innovation city': 'Naju',
        'muan': "Mokp'o", 'muan international airport': "Mokp'o", 'muan tulip': "Mokp'o",
        'boseong': 'Boseong-eup', 'boseong green tea': 'Boseong-eup', 'boseong tea fields': 'Boseong-eup',
        'hampyeong': 'Gwangju', 'hampyeong butterfly': 'Gwangju',
        'goheung': 'Yòsu', 'naro space center': 'Yòsu', 'sorokdo': 'Yòsu',
        'haenam': "Mokp'o", 'ttangkkeut': "Mokp'o", 'haenam southernmost': "Mokp'o",
        'gangjin': "Mokp'o", 'gangjin celadon': "Mokp'o", 'dasan chodang': "Mokp'o",
        'gokseong': 'Suncheon (und Umgebung)', 'gokseong train village': 'Suncheon (und Umgebung)',
        'gurye': 'Gurye', 'gurye jirisan': 'Gurye', 'gurye sansuyu': 'Gurye',
        'jangheung': 'Jangheung-myeon',
        // North Jeolla (Jeonbuk) — missing cities
        'namwon': 'Namwon', 'chunhyang': 'Namwon', 'namwon jirisan': 'Namwon',
        'muju': 'Namwon', 'muju ski': 'Namwon', 'muju resort': 'Namwon', 'taekwondowon': 'Namwon',
        'imsil': 'Jeonju', 'imsil cheese village': 'Jeonju',
        'jinan jeonbuk': 'Jinan', 'maisan': 'Jinan',
        'jeongeup': 'Jeonju', 'naejangsan': 'Jeonju',
        'gochang': 'Jeonju', 'gochang dolmen': 'Jeonju', 'seonunsa': 'Jeonju',
        'wanju': 'Jeonju',
        // Chungcheong — missing cities
        'seosan': 'Seosan', 'haemi fortress': 'Seosan', 'seosan migratory birds': 'Seosan',
        'jecheon': 'Jecheon', 'jecheon herbal': 'Jecheon', 'chungjuho jecheon': 'Jecheon',
        'chungju': 'Chungju', 'chungjuho': 'Chungju', 'chungju lake': 'Chungju',
        'hongseong': 'Hongseong-gun',
        'yesan': 'Cheonan',
        'eumseong': 'Eumseong',
        'chungcheong': 'Cheonan',
        // Gyeonggi — missing cities
        'icheon': 'Icheon', 'icheon ceramics': 'Icheon', 'icheon rice': 'Icheon',
        'yeoju': 'Yeoju', 'yeoju outlet': 'Yeoju', 'sejong king tomb': 'Yeoju',
        'hanam': 'Seoul', 'starfield hanam': 'Seoul',
        'yangpyeong': 'Yangpyeong', 'yangpyeong riverside': 'Yangpyeong',
        'namyangju': 'Namyangju', 'dumulmeori': 'Namyangju',
        'uiwang': 'Suwon',
        'gunpo': 'Gunpo',
        'gwangju gyeonggi': 'Gwangju',
        // Gangwon — missing cities
        'hwacheon': 'Chuncheon', 'sancheoneo festival': 'Chuncheon', 'hwacheon ice fishing': 'Chuncheon',
        'yeongwol': 'Wonju', 'donggang river': 'Wonju', 'yeongwol byeolmaro': 'Wonju',
        'pyeongchang town': 'Pyeongchang', 'hoenggye': 'Pyeongchang',
        // More Incheon gu-level
        'namdong': "Inch'on", 'yeonsu': "Inch'on", 'seo-gu incheon': "Inch'on",
        'gyeyang': "Inch'on", 'bupyeong-gu': "Inch'on", 'michuhol': "Inch'on",
        // More Busan neighborhoods
        'yeonje': 'Busan', 'yeonje-gu': 'Busan', 'hadan': 'Busan',
        'amnam park': 'Busan', 'taejongdae': 'Busan',
        // More Daegu neighborhoods
        'palgong mountain': 'Daegu (und Umgebung)', 'daegu sta area': 'Daegu (und Umgebung)',
        'daegu seomun': 'Daegu (und Umgebung)',
        // More Ulsan neighborhoods
        'ulsan buk-gu': 'Ulsan', 'ulju': 'Ulsan',
        'bangeojin': 'Ulsan', 'jangsaengpo whale museum': 'Ulsan',
        // More Seoul neighborhoods
        'seodaemun': 'Seoul', 'mapo-gu': 'Seoul',
        'suseo': 'Seoul', 'wirye new town': 'Seoul',
        'banpo hangang': 'Seoul', 'nodeul island': 'Seoul',
        'mangwondong': 'Seoul', 'yeonhuidong': 'Seoul',
        'seongbuk-dong': 'Seoul', 'bukchon hanok': 'Seoul',
        'changdeokgung': 'Seoul', 'deoksugung': 'Seoul',
        'namdaemun': 'Seoul', 'dongdaemun market': 'Seoul',
        // National park / landmark shortcuts
        'seoraksan national park': 'Sokcho',
        'jirisan national park': 'Namwon',
        'hallasan national park': 'Jeju',
        'taean national park': 'Taean',
        'deogyu mountain': 'Namwon',
        'gyeryongsan': 'Daejeon',
        'chiaksan national park': 'Wonju',
        // Hangeul city name variants
        '서울': 'Seoul', '부산': 'Busan', '인천': "Inch'on",
        '대구': 'Daegu (und Umgebung)', '광주': 'Gwangju', '대전': 'Daejeon',
        '울산': 'Ulsan', '제주': 'Jeju', '수원': 'Suwon',
        '전주': 'Jeonju', '청주': 'Cheongju', '천안': 'Cheonan',
        '경주': 'Gyeongju', '포항': 'Pohang', '안동': 'Andong',
        '여수': 'Yòsu', '목포': "Mokp'o", '강릉': 'Gangneung',
        '춘천': 'Chuncheon', '속초': 'Sokcho', '원주': 'Wonju',
        '군산': 'Kunsan', '남원': 'Namwon',
        '순천': 'Suncheon (und Umgebung)', '나주': 'Naju', '여천': 'Yòsu',
        '창원': 'Changwon', '진주': 'Chinju', '거제': 'Geoje',
        '통영': 'Tongyeong', '김해': 'Gimhae', '양산': 'Yangsan',
        '구미': 'Kumi', '안양': 'Anyang', '성남': 'Seongnam',
        '고양': 'Goyang', '용인': 'Yongin', '부천': 'Bucheon',
        '의정부': 'Uijeongbu', '평택': 'Pyeongtaek', '시흥': 'Siheung',
        '파주': 'Paju', '남양주': 'Namyangju', '화성': 'Hwaseong',
        '이천': 'Icheon', '여주': 'Yeoju', '하남': 'Seoul',
        '양평': 'Yangpyeong', '세종': 'Sejong', '보령': 'Boryeong',
        '태안': 'Taean', '단양': 'Danyang', '제천': 'Jecheon',
        '충주': 'Chungju', '보성': 'Boseong-eup', '함평': 'Gwangju',
        '나로도': 'Yòsu', '해남': "Mokp'o", '완도': 'Wando',
        '진도': "Mokp'o", '고창': 'Jeonju', '정읍': 'Jeonju',
        '무주': 'Namwon',
        // ── 16 first-tier administrative divisions (행정구역) ─────────────────
        // 1. Seoul (서울특별시) — Special City
        '서울특별시': 'Seoul', 'seoul teukbyeolsi': 'Seoul',
        // 2–6. Metropolitan Cities (광역시)
        '부산광역시': 'Busan', 'busan gwangyeoksi': 'Busan',
        '대구광역시': 'Daegu (und Umgebung)', 'daegu gwangyeoksi': 'Daegu (und Umgebung)',
        '인천광역시': "Inch'on", 'incheon gwangyeoksi': "Inch'on",
        '광주광역시': 'Gwangju', 'gwangju gwangyeoksi': 'Gwangju',
        '대전광역시': 'Daejeon', 'daejeon gwangyeoksi': 'Daejeon',
        '울산광역시': 'Ulsan', 'ulsan gwangyeoksi': 'Ulsan',
        // 7. Sejong (세종특별자치시) — Special Self-Governing City
        '세종특별자치시': 'Sejong', 'sejong teukbyeoljachisi': 'Sejong',
        // 8. Gyeonggi Province (경기도)
        '경기도': 'Suwon', 'gyeonggi-do': 'Suwon', 'gyeonggi province': 'Suwon', 'gyeonggi': 'Suwon',
        // 9. Gangwon Special Self-Governing Province (강원특별자치도)
        '강원특별자치도': 'Chuncheon', '강원도': 'Chuncheon',
        'gangwon-do': 'Chuncheon', 'gangwon province': 'Chuncheon', 'gangwon': 'Chuncheon',
        // 10. North Chungcheong (충청북도)
        '충청북도': 'Cheongju', 'chungcheongbuk-do': 'Cheongju', 'chungbuk': 'Cheongju',
        'north chungcheong': 'Cheongju', 'chungcheong north': 'Cheongju',
        // 11. South Chungcheong (충청남도)
        '충청남도': 'Cheonan', 'chungcheongnam-do': 'Cheonan', 'chungnam': 'Cheonan',
        'south chungcheong': 'Cheonan', 'chungcheong south': 'Cheonan',
        // 12. Jeonbuk / North Jeolla (전북특별자치도)
        '전북특별자치도': 'Jeonju', '전라북도': 'Jeonju',
        'jeollabuk-do': 'Jeonju', 'jeonbuk': 'Jeonju', 'north jeolla': 'Jeonju',
        // 13. South Jeolla (전라남도)
        '전라남도': "Mokp'o", 'jeollanam-do': "Mokp'o", 'jeonnam': "Mokp'o", 'south jeolla': "Mokp'o",
        // 14. North Gyeongsang (경상북도)
        '경상북도': 'Andong', 'gyeongsangbuk-do': 'Andong', 'gyeongbuk': 'Andong', 'north gyeongsang': 'Andong',
        // 15. South Gyeongsang (경상남도)
        '경상남도': 'Changwon', 'gyeongsangnam-do': 'Changwon', 'gyeongnam': 'Changwon', 'south gyeongsang': 'Changwon',
        // 16. Jeju (제주특별자치도) — Special Self-Governing Province
        '제주특별자치도': 'Jeju', '제주도': 'Jeju', 'jeju province': 'Jeju',
        // ── Gyeonggi si/gun not yet aliased ──────────────────────────────────
        'anseong': 'Anseong', 'anseong city': 'Anseong', '안성': 'Anseong',
        'guri': 'Guri', 'guri city': 'Guri', '구리': 'Guri',
        'yangju': 'Uijeongbu', 'yangju city': 'Uijeongbu', '양주': 'Uijeongbu',
        'yeoncheon': 'Yeoncheon', 'yeoncheon county': 'Yeoncheon', '연천': 'Yeoncheon',
        'gwangmyeong city': 'Gwangmyeong', '광명': 'Gwangmyeong',
        '포천': 'Pocheon', '동두천': 'Dongducheon', '가평': 'Gapyeong',
        '오산': 'Osan', '군포': 'Gunpo', '시흥시': 'Siheung',
        // ── Incheon gun (islands) ─────────────────────────────────────────────
        'ganghwa county': "Inch'on", 'ganghwa history': "Inch'on",
        'ongjin county': "Inch'on", '옹진': "Inch'on",
        // ── Chungbuk gun/si ───────────────────────────────────────────────────
        'boeun': 'Boeun', 'boeun county': 'Boeun', '보은': 'Boeun',
        'yeongdong': 'Cheongju', 'yeongdong county': 'Cheongju', '영동': 'Cheongju',
        'okcheon': 'Cheongju', 'okcheon county': 'Cheongju', '옥천': 'Cheongju',
        'goesan': 'Cheongju', 'goesan county': 'Cheongju', '괴산': 'Cheongju',
        'jincheon': 'Cheongju', 'jincheon county': 'Cheongju', '진천': 'Cheongju',
        'jeungpyeong': 'Cheongju', 'jeungpyeong county': 'Cheongju', '증평': 'Cheongju',
        // ── Chungnam gun/si not yet aliased ──────────────────────────────────
        'dangjin': 'Dangjin-si', 'dangjin city': 'Dangjin-si', '당진': 'Dangjin-si',
        'geumsan': 'Geumsan', 'geumsan ginseng': 'Geumsan', '금산': 'Geumsan',
        'cheongyang': 'Cheonan', 'cheongyang county': 'Cheonan', '청양': 'Cheonan',
        'nonsan': 'Gongju', 'nonsan city': 'Gongju', '논산': 'Gongju',
        'gyeryong': 'Daejeon', '계룡': 'Daejeon',
        'yesan county': 'Cheonan', '예산': 'Cheonan',
        // ── Gyeongbuk Hangeul keys ───────────────────────────────────────────
        '군위': 'Daegu (und Umgebung)', '울릉': 'Pohang', '영덕': 'Pohang',
        '영천': 'Gyeongju', '청도': 'Daegu (und Umgebung)', '의성': 'Andong',
        '문경': 'Mungyeong-eup', '상주': 'Sangju-si', '예천': 'Andong',
        '봉화': 'Yeongju', '영양': 'Andong', '청송': 'Cheongsong-eup',
        '성주': 'Daegu (und Umgebung)', '고령': 'Daegu (und Umgebung)', '영주': 'Yeongju',
        // ── Gyeongnam Hangeul keys ───────────────────────────────────────────
        '하동': 'Gurye', '함안': 'Changwon', '의령': 'Chinju',
        '합천': 'Changwon', '산청': 'Chinju', '함양': 'Chinju',
        '고성군': 'Tongyeong', '남해': 'Namhae',
        // ── Jeonnam Hangeul keys ─────────────────────────────────────────────
        '무안': "Mokp'o", '강진': "Mokp'o", '곡성': 'Suncheon (und Umgebung)',
        '장흥': 'Jangheung-myeon', '신안': "Mokp'o", '담양': 'Gwangju',
        '구례': 'Gurye', '화순': 'Gwangju', '영암': "Mokp'o",
        '장성': 'Gwangju', '영광': "Mokp'o",
        // ── Jeonbuk Hangeul keys ─────────────────────────────────────────────
        '진안': 'Jinan', '장수': 'Jeonju', '순창': 'Jeonju',
        '완주': 'Jeonju', '임실': 'Jeonju', '무진장': 'Jeonju',
        // ── Gangwon Hangeul keys ─────────────────────────────────────────────
        '화천': 'Chuncheon', '영월': 'Wonju', '횡성': 'Wonju',
        '철원': 'Pocheon', '양구': 'Inje', '인제': 'Inje',
        '홍천': 'Hongcheon', '정선': 'Jeongseon',
        'hongcheon': 'Hongcheon', 'hongcheon valley': 'Hongcheon',
        // ── Jeju Hangeul keys ─────────────────────────────────────────────────
        '서귀포': 'Seogwipo', '제주시': 'Jeju',
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
        'pingjiang road': 'Suzhou (Jiangsu)', 'suzhou old town': 'Suzhou (Jiangsu)', 'shantang street': 'Suzhou (Jiangsu)',
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
        'zhouzhuang': 'Suzhou (Jiangsu)',
        // Nanjing
        'confucius temple nanjing': 'Nanjing', 'xinjiekou': 'Nanjing',
        // Tianjin districts & concession areas
        'heping tianjin': 'Tianjin', 'nankai': 'Tianjin', 'hexi tianjin': 'Tianjin',
        'hedong': 'Tianjin', 'hebei tianjin': 'Tianjin', 'hongqiao tianjin': 'Tianjin',
        'binhai': 'Tianjin', 'binhai new area': 'Tianjin', 'yujiapu': 'Tianjin',
        'wudadao': 'Tianjin', 'italian style town tianjin': 'Tianjin',
        'hai river tianjin': 'Tianjin', 'ancient culture street tianjin': 'Tianjin',
        'tianjin port': 'Tianjin',
        // Changsha districts & areas
        'yuelu': 'Changsha', 'furong changsha': 'Changsha', 'tianxin': 'Changsha',
        'juzizhou': 'Changsha', 'orange island': 'Changsha',
        'huangxing road': 'Changsha', 'ifs changsha': 'Changsha',
        'kaifu': 'Changsha', 'wangfujing changsha': 'Changsha',
        // Dalian
        'zhongshan square dalian': 'Dalian', 'xinghai dalian': 'Dalian',
        'lushun': 'Dalian', 'jinshitan': 'Dalian', 'laohutan': 'Dalian',
        'zhongshan district dalian': 'Dalian',
        // Shenyang
        'shenhe': 'Shenyang', 'heping shenyang': 'Shenyang',
        'imperial palace shenyang': 'Shenyang', 'zhongjie shenyang': 'Shenyang',
        'hunnan': 'Shenyang',
        // Chengdu expansion
        'jinjiang': 'Chengdu', 'tongzilin': 'Chengdu',
        'yanshikou': 'Chengdu', 'jiuyanqiao': 'Chengdu', 'yulin chengdu': 'Chengdu',
        'panda base': 'Chengdu', 'chenghua': 'Chengdu', 'longquanyi': 'Chengdu',
        'pixian': 'Chengdu', 'dujiangyan': 'Chengdu',
        // Chongqing expansion
        'yuzhong': 'Chongqing', 'shapingba': 'Chongqing', 'guanyinqiao': 'Chongqing',
        'eling': 'Chongqing', 'nan an chongqing': 'Chongqing',
        'liangjiang': 'Chongqing', 'jie fang bei': 'Chongqing',
        // Guangzhou expansion
        'beijing road guangzhou': 'Guangzhou', 'shamian': 'Guangzhou',
        'pazhou': 'Guangzhou', 'panyu': 'Guangzhou', 'baiyun guangzhou': 'Guangzhou',
        'huadu': 'Guangzhou', 'nansha': 'Guangzhou',
        // Shenzhen expansion
        'shekou': 'Shenzhen', 'overseas chinese town': 'Shenzhen',
        'qianhai': 'Shenzhen', 'longgang': 'Shenzhen',
        'huaqiangbei': 'Shenzhen', 'yantian': 'Shenzhen', 'dameisha': 'Shenzhen',
        'xiaomeisha': 'Shenzhen', 'shenzhen bay': 'Shenzhen',
        // Hangzhou expansion
        'xixi': 'Hangzhou', 'longjing': 'Hangzhou', 'hefang street': 'Hangzhou',
        'wulin square': 'Hangzhou', 'binjiang hangzhou': 'Hangzhou',
        'xiaoshan': 'Hangzhou',
        // Wuhan expansion
        'jianghan': 'Wuhan', 'hubu alley': 'Wuhan', 'tan hua lin': 'Wuhan',
        'yangtze river wuhan': 'Wuhan',
        // Qingdao expansion
        'shinan': 'Qingdao', 'may fourth square': 'Qingdao',
        'laoshan': 'Qingdao', 'licang': 'Qingdao',
        // Sanya expansion
        'sanya city center': 'Sanya', 'coconut dream corridor': 'Sanya',
        'tianya haijiao': 'Sanya',
        // Xiamen expansion
        'kulangsu': 'Xiamen', 'jimei': 'Xiamen',
        'haicang': 'Xiamen', 'zhongshan road xiamen': 'Xiamen',
        // Harbin expansion
        'daoli': 'Harbin', 'nangang harbin': 'Harbin',
        'ice festival harbin': 'Harbin', 'zhongyang street harbin': 'Harbin',
        // Zhangjiajie expansion
        'zhangjiajie city': 'Zhangjiajie', 'avatar mountains': 'Zhangjiajie',
        // Guilin/Yangshuo expansion
        'xingping': 'Guilin', 'yulong river': 'Guilin',
        // Lijiang expansion
        'shuhe': 'Lijiang', 'baisha lijiang': 'Lijiang',
        // Kunming expansion
        'guannan': 'Kunming', 'dianchi lake': 'Kunming',
        'shilin': 'Kunming', 'stone forest': 'Kunming',
        // Henan (ancient capitals)
        'zhengzhou': 'Zhengzhou', 'erqi': 'Zhengzhou', 'zhongyuan': 'Zhengzhou',
        'luoyang': 'Luoyang', 'longmen': 'Luoyang', 'longmen grottoes': 'Luoyang',
        'old town luoyang': 'Luoyang', 'wangcheng park': 'Luoyang',
        'kaifeng': 'Kaifeng', 'kaifeng old town': 'Kaifeng', 'qingming park': 'Kaifeng',
        // Shanxi (ancient heritage)
        'pingyao': 'Taiyuan', 'pingyao ancient city': 'Taiyuan', 'rishengchang': 'Taiyuan',
        'datong': 'Datong', 'yungang grottoes': 'Datong', 'yungang': 'Datong',
        'hanging monastery': 'Datong', 'xuankong temple': 'Datong',
        'taiyuan': 'Taiyuan', 'jinci': 'Taiyuan',
        // Gansu / Silk Road
        'dunhuang': 'Jiuquan', 'mogao caves': 'Jiuquan', 'crescent moon lake': 'Jiuquan',
        'mingsha mountain': 'Jiuquan', 'yadan': 'Jiuquan',
        'zhangye': 'Zhangye', 'danxia': 'Zhangye', 'rainbow mountain': 'Zhangye',
        'zhangye danxia': 'Zhangye',
        'lanzhou': 'Lanzhou', 'zhongshan bridge lanzhou': 'Lanzhou',
        // Tibet
        'lhasa': 'Lhasa', 'potala palace': 'Lhasa', 'barkhor': 'Lhasa',
        'jokhang temple': 'Lhasa', 'norbulingka': 'Lhasa',
        'shigatse': 'Shigatse', 'tashilhunpo': 'Shigatse',
        // Xinjiang
        'urumqi': 'Urumchi', 'tianchi lake xinjiang': 'Urumchi',
        'kashgar': 'Kashgar', 'kashi': 'Kashgar', 'id kah mosque': 'Kashgar',
        'turpan': 'Turpan', 'turfan': 'Turpan', 'flaming mountains': 'Turpan',
        // Sichuan extras
        'jiuzhaigou': 'Jiuzhaigou', 'jiuzhai valley': 'Jiuzhaigou',
        'huanglong': 'Jiuzhaigou', 'songpan': 'Jiuzhaigou',
        'leshan': 'Leshan', 'leshan giant buddha': 'Leshan',
        'daocheng': 'Kangding', 'yading': 'Kangding', 'yading village': 'Kangding',
        // Yunnan extras
        'shangri-la': 'Shangri-La', 'zhongdian': 'Shangri-La', 'gyalthang': 'Shangri-La',
        'yuanyang': 'Kunming', 'yuanyang rice terraces': 'Kunming',
        'jianshui': 'Jianshui', 'zhu family garden': 'Jianshui',
        // Jiangsu water towns & cities
        'wuxi': 'Wuxi', 'taihu lake': 'Wuxi', 'lingshan': 'Wuxi',
        'yangzhou': 'Yangzhou', 'slender west lake': 'Yangzhou',
        'nantong': 'Nantong', 'zhenjiang': 'Zhenjiang', 'jinshan': 'Zhenjiang',
        // Zhejiang extras
        'ningbo': 'Ningbo', 'tianyi pavilion': 'Ningbo', 'xikou': 'Ningbo',
        'wenzhou': 'Wenzhou', 'yandang mountains': 'Wenzhou',
        'wuzhen': 'Hangzhou', 'wuzhen west zone': 'Hangzhou', 'wuzhen east zone': 'Hangzhou',
        'xitang': 'Hangzhou',
        // Fujian
        'fuzhou': 'Fuzhou', 'san坊七巷': 'Fuzhou', 'three lanes fuzhou': 'Fuzhou',
        'quanzhou': 'Quanzhou', 'kaiyuan temple': 'Quanzhou',
        // Jiangxi
        'nanchang': 'Nanchang', 'tengwang pavilion': 'Nanchang',
        'jingdezhen': 'Jingdezhen', 'ceramics city': 'Jingdezhen',
        'lushan': 'Jiujiang', 'mount lu': 'Jiujiang',
        // Anhui
        'hefei': 'Hefei', 'chaohu lake': 'Hefei',
        'tangmo': 'Huangshan', 'xidi': 'Huangshan', 'hongcun': 'Huangshan',
        // Guangdong extras
        'foshan': 'Foshan', 'shunde': 'Foshan', 'nanhai foshan': 'Foshan',
        'dongguan': 'Dongguan', 'zhongshan guangdong': 'Zhongshan',
        'shaoguan': 'Shaoguan', 'danxia mountain': 'Shaoguan',
        // More Shanghai micro-areas
        'qibao': 'Shanghai', 'zhujiajiao': 'Shanghai', 'songjiang': 'Shanghai',
        'jinshan shanghai': 'Shanghai', 'caohejing': 'Shanghai',
        // More Beijing micro-areas
        'tongzhou': 'Beijing', 'daxing': 'Beijing',
        'fangshan': 'Beijing', 'shijingshan': 'Beijing',
        'mentougou': 'Beijing', 'yanqing': 'Beijing',
        // Inner Mongolia
        'hohhot': 'Hohhot', 'huhehaote': 'Hohhot', 'inner mongolia': 'Hohhot',
        'baotou': 'Baotou', 'ordos': 'Ordos', 'erdos': 'Ordos',
        'hulunbuir': 'Hulun Buir', 'manzhouli': 'Hulun Buir',
        // Guizhou (karst & ethnic culture)
        'guiyang': 'Guiyang', 'qianling park': 'Guiyang',
        'kaili': 'Präfektur Qiandongnan', 'miao villages': 'Präfektur Qiandongnan', 'xijiang': 'Präfektur Qiandongnan',
        'anshun': 'Anshun', 'huangguoshu': 'Anshun', 'huangguoshu waterfall': 'Anshun',
        'zhenyuan': 'Tongren', 'zhenyuan ancient town': 'Tongren',
        'fanjing mountain': 'Tongren', 'tongren': 'Tongren',
        // Hunan extras
        'fenghuang': 'Fenghuang', 'fenghuang ancient town': 'Fenghuang',
        'tujia culture': 'Fenghuang', 'tuojiang river': 'Fenghuang',
        'zhangjiajie national park': 'Zhangjiajie',
        // Hubei extras
        'yichang': 'Yichang', 'three gorges': 'Yichang', 'three gorges dam': 'Yichang',
        'gezhouba': 'Yichang',
        'enshi': 'Enshi Prefecture', 'enshi grand canyon': 'Enshi Prefecture',
        'wudang mountain': 'Shiyan', 'shiyan': 'Shiyan',
        // Guangxi extras
        'nanning': 'Nanning', 'guangxi': 'Nanning',
        'beihai': 'Beihai', 'silver beach beihai': 'Beihai', 'weizhou island': 'Beihai',
        'hezhou': 'Hezhou',
        // Zhejiang extras
        'shaoxing': 'Shaoxing', 'luxun hometown': 'Shaoxing', 'kaiyuan si shaoxing': 'Shaoxing',
        'zhoushan': 'Zhoushan', 'putuo mountain': 'Zhoushan', 'putuoshan': 'Zhoushan',
        'taizhou zhejiang': 'Taizhou',
        // Jiangxi extras
        'wuyuan': 'Nanchang', 'wuyuan rape flowers': 'Nanchang',
        'jinggang mountain': 'Ji\'an', 'jinggangshan': 'Ji\'an',
        // Jiangsu extras
        'changshu': 'Changshu', 'zhouzhuang jiangsu': 'Suzhou (Jiangsu)', 'tongli': 'Suzhou (Jiangsu)',
        // Qinghai
        'xining': 'Xining', 'kumbum monastery': 'Xining',
        'qinghai lake': 'Xining', 'qinghai hu': 'Xining',
        'chaka salt lake': 'Xining', 'chaka': 'Xining',
        // Ningxia
        'yinchuan': 'Yinchuan', 'western xia tombs': 'Yinchuan',
        'shapotou': 'Zhongwei', 'zhongwei': 'Zhongwei',
        // Jilin / Northeast
        'changchun': 'Changchun', 'puppet state palace': 'Changchun',
        'jilin city': 'Jilin', 'songhua lake': 'Jilin',
        'changbai mountain': 'Autonomer Bezirk Yanbian der Koreaner', 'tianchi changbai': 'Autonomer Bezirk Yanbian der Koreaner',
        'baitoushan': 'Autonomer Bezirk Yanbian der Koreaner', 'heaven lake changbai': 'Autonomer Bezirk Yanbian der Koreaner',
        'yanji': 'Autonomer Bezirk Yanbian der Koreaner', 'yanbian': 'Autonomer Bezirk Yanbian der Koreaner',
        // Heilongjiang extras
        'mohe': 'Mohe', 'arctic village china': 'Mohe', 'northern lights china': 'Mohe',
        'heihe': 'Heihe',
        // Sichuan extras
        'kangding': 'Kangding', 'luding': 'Kangding',
        'danba': 'Danba', 'danba tibetan villages': 'Danba',
        'muli': 'Kangding', 'ganzi': 'Kangding',
        // Macau (CN context → Zhuhai; MO section has the canonical entries)
        'macau': 'Zhuhai', 'macao': 'Zhuhai',
        'taipa': 'Zhuhai', 'cotai': 'Zhuhai', 'coloane': 'Zhuhai',
        'cotai strip': 'Zhuhai', 'venetian macau': 'Zhuhai',
        'senado square': 'Zhuhai', 'ruins of st paul': 'Zhuhai',
        // Hainan extras
        'haikou': 'Haikou', 'hainan': 'Haikou',
        'wanning': 'Wanning', 'riyue bay': 'Wanning',
        'baoting': 'Baoting', 'qixianling': 'Baoting',
        'danzhou': 'Danzhou',
        // Guangdong extras
        'chaozhou': 'Chaozhou', 'kaiyuan temple chaozhou': 'Chaozhou',
        'shantou': 'Shantou', 'nan ao island': 'Shantou',
        'maoming': 'Maoming', 'yangjiang': 'Yangjiang',
        'jiangmen': 'Jiangmen', 'kaiping diaolou': 'Jiangmen', 'xinhui': 'Jiangmen',
        'huizhou': 'Huizhou', 'xunliao bay': 'Huizhou',
        // Shaanxi extras
        'huashan': "Xi'an", 'mount hua': "Xi'an", 'huayin': "Xi'an",
        'yan an': "Yan'an", 'yanan': "Yan'an",
        'hanzhong': 'Hanzhong',
        // Henan extras
        'shaolin': 'Luoyang', 'dengfeng': 'Luoyang', 'shaolin temple': 'Luoyang',
        'sanmenxia': 'Sanmenxia',
        // More tier-2 Chinese cities
        'wuhan city': 'Wuhan',
        'changsha city': 'Changsha', 'yuelu mountain': 'Changsha',
        'nanchang city': 'Nanchang', 'lushan mountain': 'Nanchang',
        'fuzhou city': 'Fuzhou', 'gulangyu island': 'Xiamen',
        'quanzhou city': 'Quanzhou', 'zhangzhou': 'Zhangzhou',
        'wenzhou city': 'Wenzhou', 'ningbo city': 'Ningbo',
        'hefei city': 'Hefei', 'huangshan mountain': 'Huangshan',
        'jinan city': 'Jinan', 'qufu city': 'Jinan', 'taishan': 'Tai\'an',
        'taian': 'Tai\'an',
        'qingdao beer street': 'Qingdao', 'qingdao beach': 'Qingdao',
        'weihai city': 'Weihai', 'yantai city': 'Yantai',
        'taiyuan city': 'Taiyuan', 'datong city': 'Datong',
        'shenyang city': 'Shenyang', 'dalian port': 'Dalian',
        'harbin ice city': 'Harbin', 'zhongyang street': 'Harbin',
        'changchun city': 'Changchun',
        'hohhot city': 'Hohhot',
        'baotou city': 'Baotou', 'ordos city': 'Ordos',
        // Zhejiang extras
        'hangzhou west lake': 'Hangzhou', 'wuzhen water town': 'Hangzhou',
        'tongli water town': 'Suzhou (Jiangsu)', 'mudu': 'Suzhou (Jiangsu)',
        // Jiangsu extras
        'yangzhou city': 'Yangzhou', 'zhenjiang city': 'Zhenjiang',
        // Liaoning extras
        'dandong city': 'Dandong',
        // Tibet extras
        'namtso lake': 'Lhasa', 'namco': 'Lhasa',
        'gyantse': 'Gyantse',
        // Yunnan extras
        'dali city': 'Dali', 'bai village': 'Dali', 'erhai lake': 'Dali',
        'shuhe ancient town': 'Lijiang',
        'shangri la city': 'Shangri-La',
        // Sichuan extras
        'chengdu panda': 'Chengdu', 'jinli street': 'Chengdu',
        'emei mountain': 'Leshan',
        // Xinjiang extras
        'turpan grape valley': 'Turpan', 'karez wells': 'Turpan',
        'yining city': 'Yining', 'ili': 'Yining',
        // Xinjiang extras
        'kanas lake': 'Altay', 'burqin': 'Altay', 'kanas': 'Altay',
        'hotan': 'Hotan', 'khotan': 'Hotan', 'hetian': 'Hotan', 'hotan jade': 'Hotan',
        'kuqa': 'Kuqa', 'kuche': 'Kuqa', 'kizil caves': 'Kuqa',
        'aksu': 'Aksu',
        'altay': 'Altay', 'altai xinjiang': 'Altay',
        // Gansu extras
        'jiayuguan': 'Jiayuguan', 'great wall jiayuguan': 'Jiayuguan', 'jiayu pass': 'Jiayuguan',
        'tianshui': 'Tianshui', 'maijishan': 'Tianshui', 'maiji mountain': 'Tianshui',
        'xiahe': 'Linxia', 'labrang monastery': 'Linxia', 'labrang': 'Linxia',
        'linxia': 'Linxia',
        // Qinghai extras
        'golmud': 'Haixi (autonomer Bezirk)', 'delingha': 'Haixi (autonomer Bezirk)',
        'zhangye wetlands': 'Zhangye',
        // Tibet extras
        'nyingchi': 'Linzhi', 'linzhi': 'Linzhi', 'nyingchi peach': 'Linzhi',
        'nagqu': 'Lhasa', 'namtso': 'Lhasa',
        'ali tibet': 'Lhasa', 'ngari': 'Lhasa',
        // Yunnan extras
        'xishuangbanna': 'Xishuangbanna (Präfektur)', 'jinghong': 'Xishuangbanna (Präfektur)', 'sipsongpanna': 'Xishuangbanna (Präfektur)',
        'banna': 'Xishuangbanna (Präfektur)', 'tropical rainforest yunnan': 'Xishuangbanna (Präfektur)',
        'tengchong': 'Baoshan', 'tengchong hot springs': 'Baoshan', 'heshun': 'Baoshan',
        'puer': "Pu'er", 'pu-erh tea city': "Pu'er", 'simao': "Pu'er",
        'baoshan yunnan': 'Baoshan', 'luoping': 'Qujing', 'luoping rapeseed': 'Qujing',
        'nujiang': 'Baoshan', 'liuku': 'Baoshan', 'nu river gorge': 'Baoshan',
        'dehong': 'Dehong', 'ruili': 'Dehong',
        // Sichuan extras
        'yibin': 'Yibin', 'shunan bamboo sea': 'Yibin', 'bamboo sea sichuan': 'Yibin',
        'zigong': 'Zigong', 'zigong dinosaur': 'Zigong', 'zigong lantern': 'Zigong',
        'mianyang': 'Mianyang',
        'deyang': 'Deyang',
        'luzhou': 'Luzhou', 'luzhou laojiao': 'Luzhou',
        'panzhihua': 'Panzhihua',
        'neijiang': 'Neijiang',
        // Chongqing extras
        'wulong': 'Chongqing', 'wulong karst': 'Chongqing', 'sky bridge wulong': 'Chongqing',
        'dazu': 'Chongqing', 'dazu rock carvings': 'Chongqing',
        'fengdu': 'Chongqing', 'ghost city fengdu': 'Chongqing',
        'wanzhou': 'Chongqing',
        // Guizhou extras
        'libo': 'Autonomer Bezirk Qiannan der Bouyei und Miao', 'libo karst': 'Autonomer Bezirk Qiannan der Bouyei und Miao', 'xiaoqikong': 'Autonomer Bezirk Qiannan der Bouyei und Miao',
        'chishui': 'Zunyi', 'chishui waterfall': 'Zunyi', 'sidonggou': 'Zunyi',
        'bijie': 'Bijie', 'caohai lake': 'Bijie', 'weining': 'Bijie',
        // Guangxi extras
        'longsheng': 'Guilin', "dragon's backbone": 'Guilin', 'longji terraces': 'Guilin',
        'ping an': 'Guilin', 'sanjiang': 'Guilin', 'dong village': 'Guilin',
        'baise': 'Bose',
        // Fujian extras
        'wuyishan': 'Wuyishan', 'wuyi mountain': 'Wuyishan', 'wuyi scenic': 'Wuyishan',
        'longyan': 'Longyan', 'tulou': 'Longyan', 'fujian earth buildings': 'Longyan',
        'hakka tulou': 'Longyan',
        'ningde': 'Ningde', 'taimu mountain': 'Ningde',
        'sanming': 'Sanming',
        // Jiangxi extras
        'shangrao': 'Shangrao', 'sanqingshan': 'Shangrao', 'sanqing mountain': 'Shangrao',
        'jiujiang': 'Jiujiang', 'lushan jiujiang': 'Jiujiang', 'poyang lake': 'Jiujiang',
        'yingtan': 'Yingtan', 'longhu mountain': 'Yingtan',
        // Zhejiang extras
        'yiwu': 'Yiwu', 'yiwu market': 'Yiwu', 'international trade city yiwu': 'Yiwu',
        'jinhua': 'Jinhua', 'jinhua ham': 'Jinhua',
        'jiaxing': 'Jiaxing', 'south lake jiaxing': 'Jiaxing',
        'huzhou': 'Huzhou',
        'lishui': 'Lishui', 'xiandu': 'Lishui',
        'changzhou': 'Changzhou', 'changzhou dinosaur park': 'Changzhou',
        // Jiangsu extras
        'lianyungang': 'Lianyungang', 'huaguo mountain': 'Lianyungang',
        'xuzhou': 'Xuzhou', 'cloud dragon lake': 'Xuzhou',
        'huaian': "Huai'an", 'huai an': "Huai'an", 'zhou enlai': "Huai'an",
        'yancheng': 'Yancheng', 'dafeng wetlands': 'Yancheng',
        'taizhou jiangsu': 'Taizhou',
        // Shandong extras
        'rizhao': 'Rizhao', 'rizhao beach': 'Rizhao',
        'linyi': 'Linyi',
        'zibo': 'Zibo', 'zibo bbq': 'Zibo',
        'dezhou': 'Dezhou',
        'binzhou': 'Binzhou',
        // Henan extras
        'anyang': 'Anyang', 'yin ruins': 'Anyang', 'oracle bones': 'Anyang',
        'jiyuan': 'Jiyuan', 'yuntai mountain': 'Jiyuan',
        'xinxiang': 'Xinxiang',
        'nanyang henan': 'Nanyang',
        // Shanxi extras
        'yuncheng': 'Yuncheng', 'yuncheng salt lake': 'Yuncheng', 'ponds of heaven': 'Yuncheng',
        'linfen': 'Linfen',
        'changzhi': 'Changzhi',
        'jincheng': 'Jincheng',
        // Hubei extras
        'xiangyang': 'Xiangyang', 'ancient city xiangyang': 'Xiangyang',
        'jingzhou': 'Jingzhou', 'three kingdoms jingzhou': 'Jingzhou',
        'suizhou': 'Suizhou',
        // Hunan extras
        'shaoshan': 'Xiangtan', 'mao zedong birthplace': 'Xiangtan',
        'yueyang': 'Yueyang', 'dongting lake': 'Yueyang', 'yueyang tower': 'Yueyang',
        'hengyang': 'Hengyang', 'hengshan mountain': 'Hengyang',
        'chenzhou': 'Chenzhou',
        'yongzhou': 'Yongzhou',
        // Liaoning extras
        'dandong': 'Dandong', 'broken bridge dandong': 'Dandong',
        'anshan': 'Anshan', 'jade buddha anshan': 'Anshan',
        'fushun': 'Shenyang',
        'jinzhou': 'Jinzhou',
        'benxi': 'Benxi', 'benxi water cave': 'Benxi',
        // Heilongjiang extras
        'mudanjiang': 'Mudanjiang', 'jingpo lake': 'Mudanjiang', 'snow valley mudanjiang': 'Mudanjiang',
        'qiqihar': 'Qiqihar', 'zhalong wetlands': 'Qiqihar', 'siberian cranes': 'Qiqihar',
        'jixi': 'Jixi', 'shuangyashan': 'Shuangyashan',
        // Inner Mongolia extras
        'arxan': 'Arxan', 'arxan volcanic': 'Arxan',
        'tongliao': 'Tongliao',
        'chifeng': 'Chifeng',
        // More Beijing micro-areas
        'huairou': 'Beijing', 'mutianyu': 'Beijing', 'miyun': 'Beijing',
        'pinggu': 'Beijing', 'simatai': 'Beijing',
        // More Nanjing
        'xuanwu lake': 'Nanjing', 'zijin mountain': 'Nanjing', 'ming tomb nanjing': 'Nanjing',
        'fuzi miao': 'Nanjing', 'qinhuai': 'Nanjing',
        // More Shanghai
        'chongming island': 'Shanghai', 'dishui lake': 'Shanghai',
        'xinchang': 'Shanghai',
        // More Guangzhou
        'conghua': 'Guangzhou', 'zengcheng': 'Guangzhou',
        // More Hangzhou
        'qiandao lake': 'Hangzhou', 'thousand island lake': 'Hangzhou',
        // Chinese city name characters
        '上海': 'Shanghai', '北京': 'Beijing', '广州': 'Guangzhou',
        '深圳': 'Shenzhen', '成都': 'Chengdu', '重庆': 'Chongqing',
        '杭州': 'Hangzhou', '西安': "Xi'an", '武汉': 'Wuhan',
        '南京': 'Nanjing', '天津': 'Tianjin', '苏州': 'Suzhou (Jiangsu)',
        '青岛': 'Qingdao', '哈尔滨': 'Harbin', '大连': 'Dalian',
        '沈阳': 'Shenyang', '昆明': 'Kunming', '厦门': 'Xiamen',
        '福州': 'Fuzhou', '长沙': 'Changsha', '郑州': 'Zhengzhou',
        '西宁': 'Xining', '拉萨': 'Lhasa', '乌鲁木齐': 'Urumchi',
        '桂林': 'Guilin', '丽江': 'Lijiang', '大理': 'Dali',
        '张家界': 'Zhangjiajie', '三亚': 'Sanya', '海口': 'Haikou',
        '珠海': 'Zhuhai', '澳门': 'Zhuhai', '香港': 'Hong Kong',
        '宁波': 'Ningbo', '温州': 'Wenzhou', '南昌': 'Nanchang',
        '合肥': 'Hefei', '济南': 'Jinan', '曲阜': 'Jinan',
        '烟台': 'Yantai', '威海': 'Weihai', '太原': 'Taiyuan',
        '大同': 'Datong', '平遥': 'Taiyuan', '洛阳': 'Luoyang',
        '开封': 'Kaifeng', '敦煌': 'Jiuquan', '张掖': 'Zhangye',
        '兰州': 'Lanzhou', '银川': 'Yinchuan', '呼和浩特': 'Hohhot',
        '长春': 'Changchun', '吉林': 'Jilin', '西双版纳': 'Xishuangbanna (Präfektur)',
        '腾冲': 'Baoshan', '九寨沟': 'Jiuzhaigou', '乐山': 'Leshan',
        '黄山': 'Huangshan', '扬州': 'Yangzhou', '无锡': 'Wuxi',
        '义乌': 'Yiwu', '绍兴': 'Shaoxing', '宜昌': 'Yichang',
        '张家港': 'Zhangjiagang',
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
        // More HK Island areas
        'sai wan': 'Hong Kong', 'sai wan ho': 'Hong Kong', 'shau kei wan': 'Hong Kong',
        'chai wan': 'Hong Kong', 'heng fa chuen': 'Hong Kong',
        'tin hau': 'Hong Kong', 'fortress hill': 'Hong Kong',
        'mid-levels': 'Hong Kong', 'mid levels': 'Hong Kong', 'the peak': 'Hong Kong',
        'pok fu lam': 'Hong Kong', 'cyberport': 'Hong Kong',
        'brick hill': 'Hong Kong', 'ocean park area': 'Hong Kong',
        // More Kowloon areas
        'kowloon city': 'Hong Kong', 'kowloon tong': 'Hong Kong',
        'to kwa wan': 'Hong Kong', 'hung hom': 'Hong Kong',
        'kwun tong': 'Hong Kong', 'lam tin': 'Hong Kong', 'yau tong': 'Hong Kong',
        'wong tai sin': 'Hong Kong', 'diamond hill': 'Hong Kong',
        'ho man tin': 'Hong Kong', 'kings park hk': 'Hong Kong',
        'lai chi kok': 'Hong Kong', 'cheung sha wan': 'Hong Kong',
        // New Territories
        'tsuen wan': 'Hong Kong', 'kwai chung': 'Hong Kong', 'kwai fong': 'Hong Kong',
        'tsing yi': 'Hong Kong', 'ma wan': 'Hong Kong',
        'tseung kwan o': 'Hong Kong', 'po lam': 'Hong Kong', 'hang hau': 'Hong Kong',
        'sai kung': 'Hong Kong', 'sai kung town': 'Hong Kong',
        'pak sha wan': 'Hong Kong', 'hebe haven': 'Hong Kong',
        'tai wai': 'Hong Kong', 'ma on shan': 'Hong Kong',
        'fo tan': 'Hong Kong', 'sha tin racecourse': 'Hong Kong',
        'yuen long': 'Hong Kong', 'tin shui wai': 'Hong Kong',
        'fanling': 'Hong Kong', 'sheung shui': 'Hong Kong',
        'tai po market': 'Hong Kong', 'plover cove': 'Hong Kong',
        'tuen mun town': 'Hong Kong', 'gold coast hk': 'Hong Kong',
        // Lantau Island
        'tung chung': 'Hong Kong', 'tai o': 'Hong Kong',
        'discovery bay': 'Hong Kong', 'mui wo': 'Hong Kong',
        'ngong ping': 'Hong Kong', 'tian tan buddha': 'Hong Kong',
        // Outlying islands
        'cheung chau': 'Cheung Chau', 'cheung chau island': 'Cheung Chau',
        'lamma island': 'Hong Kong', 'yung shue wan': 'Hong Kong', 'sok kwu wan': 'Hong Kong',
        'peng chau': 'Hong Kong', 'po toi': 'Hong Kong',
        // HK Island Western District
        'sai ying pun': 'Hong Kong', 'shek tong tsui': 'Hong Kong',
        'western district hk': 'Hong Kong', 'western market': 'Hong Kong',
        // More Kowloon micro-areas
        'kowloon bay': 'Hong Kong', 'kai tak': 'Hong Kong', 'kai tak cruise terminal': 'Hong Kong',
        'kwun tong waterfront': 'Hong Kong', 'hip wo street': 'Hong Kong',
        'lok fu': 'Hong Kong', 'san po kong': 'Hong Kong',
        'ngau tau kok': 'Hong Kong', 'ngau chi wan': 'Hong Kong',
        'prince edward': 'Hong Kong', 'fa yuen street': 'Hong Kong',
        // Clear Water Bay / Sai Kung extras
        'clear water bay': 'Hong Kong', 'clearwater bay': 'Hong Kong',
        'kau sai chau': 'Hong Kong', 'high island': 'Hong Kong',
        // New Territories extras
        'pat sin leng': 'Hong Kong', 'tai mo shan': 'Hong Kong',
        'kam tin': 'Hong Kong', 'ping shan': 'Hong Kong',
        'lau fau shan': 'Hong Kong', 'deep bay': 'Hong Kong',
        'sha lo wan': 'Hong Kong', 'lung kwu tan': 'Hong Kong',
        'tuen mun river': 'Hong Kong',
        // Missing HK districts / estates
        'tsz wan shan': 'Hong Kong', 'choi hung': 'Hong Kong',
        'hiu kwong': 'Hong Kong', 'chuk yuen': 'Hong Kong',
        'penny bay': 'Hong Kong', 'hong kong disneyland': 'Hong Kong',
        'hung shui kiu': 'Hong Kong', 'kwu tung': 'Hong Kong',
        'wu kai sha': 'Hong Kong', 'tap mun': 'Hong Kong',
        'sharp island': 'Hong Kong', 'tung ping chau': 'Hong Kong',
        "bride's pool": 'Hong Kong', 'luk keng': 'Hong Kong',
        'heung yuen wai': 'Hong Kong',
        'tai lam': 'Hong Kong', 'so kwun wat': 'Hong Kong',
        'tuen mun coast': 'Hong Kong', 'castle peak': 'Hong Kong',
        'nim wan': 'Hong Kong', 'ha pak nai': 'Hong Kong',
        // Traditional Chinese characters
        '香港': 'Hong Kong', '九龍': 'Hong Kong', '新界': 'Hong Kong',
        '旺角': 'Hong Kong', '銅鑼灣': 'Hong Kong', '中環': 'Hong Kong',
        '尖沙咀': 'Hong Kong', '灣仔': 'Hong Kong', '上環': 'Hong Kong',
        '油麻地': 'Hong Kong', '深水埗': 'Hong Kong', '長洲': 'Cheung Chau',
        '大嶼山': 'Hong Kong', '屯門': 'Hong Kong', '元朗': 'Hong Kong',
        '沙田': 'Hong Kong', '將軍澳': 'Hong Kong', '西貢': 'Hong Kong',
    },
    TW: {
        // Taipei districts
        'ximending': 'Taipeh', 'daan': 'Taipeh', 'zhongzheng': 'Taipeh',
        'xinyi': 'Taipeh', 'zhongshan': 'Taipeh', 'datong': 'Taipeh',
        'songshan': 'Taipeh', 'neihu': 'Taipeh', 'wenshan': 'Taipeh',
        'shilin': 'Taipeh', 'beitou': 'Taipeh', 'wanhua': 'Taipeh',
        'nangang': 'Taipeh',
        // Tainan districts
        'anping': 'Tainan', 'west central tainan': 'Tainan', 'annan': 'Tainan',
        'east tainan': 'Tainan', 'north tainan': 'Tainan', 'south tainan': 'Tainan',
        'xinying': 'Tainan', 'yongkang': 'Tainan', 'madou': 'Tainan',
        'shanhua': 'Tainan', 'jiali': 'Tainan', 'tainan old city': 'Tainan',
        // Kaohsiung districts
        'lingya': 'Gaoxiong', 'sanmin': 'Gaoxiong', 'qianjin': 'Gaoxiong',
        'yancheng': 'Gaoxiong', 'gushan': 'Gaoxiong', 'zuoying': 'Gaoxiong',
        'cijin': 'Gaoxiong', 'cijin island': 'Gaoxiong', 'fongshan': 'Gaoxiong',
        'cianjhen': 'Gaoxiong', 'nanzih': 'Gaoxiong', 'pier-2 kaohsiung': 'Gaoxiong',
        'hamasen': 'Gaoxiong', 'love river kaohsiung': 'Gaoxiong',
        // Taichung districts
        'central taichung': 'Taichung', 'west taichung': 'Taichung',
        'north taichung': 'Taichung', 'east taichung': 'Taichung',
        'south taichung': 'Taichung', 'xitun': 'Taichung', 'nantun': 'Taichung',
        'beitun': 'Taichung', 'fengyuan': 'Taichung', 'dali taichung': 'Taichung',
        'taiping': 'Taichung', 'wufeng': 'Taichung', 'yi zhong': 'Taichung',
        // Hualien
        'hualien city': 'Hua-lien', 'taroko': 'Hua-lien', 'taroko gorge': 'Hua-lien',
        'xincheng': 'Hua-lien', 'ji an': 'Hua-lien', 'shoufeng': 'Hua-lien',
        'ruisui': 'Hua-lien', 'fuli hualien': 'Hua-lien',
        // Kenting (southernmost tip, Pingtung County)
        'kenting': 'Hengchun', 'nanwan': 'Hengchun', 'eluanbi': 'Hengchun',
        'baisha bay': 'Hengchun', 'hengchun': 'Hengchun',
        // Taitung
        'taitung city': 'Taitung', 'zhiben': 'Taitung', 'chishang': 'Taitung',
        'dulan': 'Taitung', 'chenggong': 'Taitung', 'luye': 'Taitung',
        // Alishan area (Chiayi)
        'alishan forest': 'Chiayi', 'chiayi city': 'Chiayi',
        // Sun Moon Lake / Nantou
        'sun moon lake': 'Nantou', 'yuchi': 'Nantou', 'puli': 'Nantou',
        'cingjing': 'Nantou', 'hehuanshan': 'Nantou',
        // Jiufen / Keelung area (New Taipei / Keelung)
        'jiufen': 'Keelung', 'jinguashi': 'Keelung', 'keelung city': 'Keelung',
        'pingxi': 'Neu-Taipeh', 'danshui': 'Neu-Taipeh', 'tamsui': 'Neu-Taipeh',
        'yingge': 'Neu-Taipeh', 'sanxia': 'Neu-Taipeh',
        // New Taipei City areas
        'banqiao': 'Neu-Taipeh', 'zhonghe': 'Neu-Taipeh', 'yonghe': 'Neu-Taipeh',
        'sanchong': 'Neu-Taipeh', 'xinzhuang': 'Neu-Taipeh', 'luzhou': 'Neu-Taipeh',
        'shulin': 'Neu-Taipeh', 'tucheng': 'Neu-Taipeh', 'xizhi': 'Neu-Taipeh',
        'sijhih': 'Neu-Taipeh', 'ruifang': 'Neu-Taipeh', 'sanzhi': 'Neu-Taipeh',
        'shimen new taipei': 'Neu-Taipeh', 'wanli new taipei': 'Neu-Taipeh',
        'jinshan taiwan': 'Neu-Taipeh', 'shihding': 'Neu-Taipeh',
        // Taipei extra neighborhoods
        'guting': 'Taipeh', 'gongguan': 'Taipeh', 'tianmu': 'Taipeh',
        'dihua street': 'Taipeh', 'yongkang street taipei': 'Taipeh',
        'zhongxiao dunhua': 'Taipeh', 'da an forest park': 'Taipeh',
        'zhongxiao fuxing': 'Taipeh', 'taipei main station area': 'Taipeh',
        'guling street': 'Taipeh', 'huashan park': 'Taipeh',
        'songshan cultural park': 'Taipeh',
        // Yilan County
        'yilan city': 'Yilan', 'luodong': 'Yilan', 'dongshan yilan': 'Yilan',
        'jiaoxi hot spring': 'Yilan', 'jiaoxi': 'Yilan', 'wujie': 'Yilan',
        'suao': 'Yilan', 'nanfangao': 'Yilan', 'toucheng': 'Yilan',
        // Penghu Islands
        'penghu': 'Magong', 'magong': 'Magong', 'xiyu penghu': 'Magong',
        'baisha penghu': 'Magong', 'wang an': 'Magong',
        // Kinmen (Quemoy)
        'kinmen': 'Jincheng', 'jincheng': 'Jincheng', 'lieyu': 'Jincheng',
        // Matsu Islands
        'matsu': 'Matsu', 'nangan': 'Matsu', 'beigan': 'Matsu',
        // Changhua / Yunlin
        'changhua city': 'Chang Hua', 'lukang': 'Lukang', 'yuanlin': 'Chang Hua',
        'xiluo': 'Douliou', 'douliu': 'Douliou', 'beigang yunlin': 'Douliou',
        // Pingtung (south of Kaohsiung)
        'pingtung city': 'Pingtung', 'donggang': 'Pingtung', 'little liuqiu': 'Pingtung',
        'liuqiu island': 'Pingtung', 'hengchun pingtung': 'Pingtung',
        'manzhou pingtung': 'Pingtung', 'checheng': 'Pingtung',
        // Kaohsiung extras
        'meinong': 'Gaoxiong', 'maolin': 'Gaoxiong', 'liouguei': 'Gaoxiong',
        'gangshan': 'Gaoxiong', 'dashe': 'Gaoxiong', 'renwu': 'Gaoxiong',
        'qishan': 'Gaoxiong', 'alian': 'Gaoxiong',
        // Taichung extras
        'shalu': 'Taichung', 'longjing': 'Taichung', 'qingshui': 'Taichung',
        'wuri': 'Taichung', 'dadu': 'Taichung', 'dongshi taichung': 'Taichung',
        // Tainan extras
        'guanmiao': 'Tainan', 'guiren': 'Tainan', 'rende': 'Tainan',
        'qigu': 'Tainan', 'beimen': 'Tainan', 'jiangjun': 'Tainan',
        // Miaoli County
        'miaoli city': 'Miaoli', 'toufen': 'Miaoli', 'zhunan': 'Miaoli',
        'sanyi': 'Miaoli', 'shitoushan': 'Miaoli',
        // Hsinchu
        'hsinchu city': 'Hsinchu', 'hsinchu science park': 'Hsinchu',
        'zhubei': 'Hsinchu', 'zhudong': 'Hsinchu', 'neiwan': 'Hsinchu',
        // Taoyuan
        'taoyuan city': 'Taoyuan', 'zhongli': 'Taoyuan', 'dayuan': 'Taoyuan',
        'luzhu': 'Taoyuan', 'guishan': 'Taoyuan',
        // Taoyuan extras
        'daxi': 'Taoyuan', 'daxi old street': 'Taoyuan',
        'yangmei': 'Taoyuan', 'longtan taoyuan': 'Taoyuan',
        'guanyin taoyuan': 'Taoyuan', 'bade taoyuan': 'Taoyuan',
        // Hsinchu extras
        'beipu': 'Hsinchu', 'emei hsinchu': 'Hsinchu',
        'guanxi hsinchu': 'Hsinchu', 'hsinchu glass': 'Hsinchu',
        // Miaoli extras
        'jhuolan': 'Miaoli', 'gongguan miaoli': 'Miaoli',
        'yuanli': 'Miaoli', "lion's head mountain": 'Miaoli',
        'tong xiao': 'Miaoli', 'houlong': 'Miaoli',
        // Taichung extras
        'fengjia': 'Taichung', 'fengjia night market': 'Taichung',
        'donghai': 'Taichung', 'tunghai': 'Taichung', 'tunghai university': 'Taichung',
        'caotun': 'Taichung', 'houli': 'Taichung',
        // Nantou extras
        'jiji': 'Nantou', 'jiji railway': 'Nantou', 'jiji mini railway': 'Nantou',
        'shuili': 'Nantou', 'lugu': 'Nantou', 'renai nantou': 'Nantou',
        'wushe': 'Nantou', 'cingjing farm': 'Nantou', 'qingjing': 'Nantou',
        'guosing nantou': 'Nantou', 'xitou': 'Nantou',
        // Chiayi extras
        'fenqihu': 'Chiayi', 'alishan railway': 'Chiayi',
        'budai': 'Chiayi', 'puzi': 'Chiayi', 'minxiong': 'Chiayi',
        'beigang': 'Chiayi', 'shuishang': 'Chiayi',
        // Changhua extras
        'changhua giant buddha': 'Chang Hua', 'baguashan': 'Chang Hua',
        'xihu changhua': 'Chang Hua', 'fuxing changhua': 'Chang Hua',
        // Yunlin extras
        'huwei': 'Douliou', 'tounan': 'Douliou', 'gukeng': 'Gukeng',
        // Tainan extras
        'xinhua tainan': 'Tainan', 'nansi tainan': 'Tainan',
        'baihe tainan': 'Tainan', 'yanshui': 'Tainan', 'tainan yanshui': 'Tainan',
        // Keelung extras
        'badouzi': 'Keelung', 'zhengbin harbor': 'Keelung',
        'waimushan': 'Keelung', 'heping island': 'Keelung',
        // New Taipei extras
        'shenkeng': 'Neu-Taipeh', 'shenkeng tofu': 'Neu-Taipeh',
        'linkou': 'Neu-Taipeh',
        // Hualien extras
        'guangfu hualien': 'Hua-lien', 'fuyuan national park': 'Hua-lien',
        'beinan hualien': 'Hua-lien', 'jian hualien': 'Hua-lien',
        // Taitung extras
        'guanshan taitung': 'Taitung', 'taimali': 'Taitung',
        'beinan taitung': 'Taitung', 'donghe taitung': 'Taitung',
        // Offshore islands
        'green island': 'Lü Dao', 'lyudao': 'Lü Dao', 'ludao taiwan': 'Lü Dao',
        'orchid island': 'Taitung', 'lanyu': 'Taitung',
        // Traditional Chinese characters (繁體中文)
        '台北': 'Taipeh', '新北': 'Neu-Taipeh', '基隆': 'Keelung',
        '桃園': 'Taoyuan', '新竹': 'Hsinchu', '苗栗': 'Miaoli',
        '台中': 'Taichung', '彰化': 'Chang Hua', '南投': 'Nantou',
        '雲林': 'Douliou', '嘉義': 'Chiayi', '台南': 'Tainan',
        '高雄': 'Gaoxiong', '屏東': 'Pingtung', '宜蘭': 'Yilan',
        '花蓮': 'Hua-lien', '台東': 'Taitung', '澎湖': 'Magong',
        '金門': 'Jincheng', '馬祖': 'Matsu', '台灣': 'Taipeh',
    },
    SG: {
        'orchard': 'Singapur', 'marina bay': 'Singapur', 'sentosa': 'Sentosa Island',
        'clarke quay': 'Singapur', 'chinatown': 'Singapur', 'little india': 'Singapur',
        'kampong glam': 'Singapur', 'bugis': 'Singapur', 'tanjong pagar': 'Singapur',
        'chinatown singapore': 'Singapur',
        'boat quay': 'Singapur', 'robertson quay': 'Singapur',
        'novena': 'Singapur', 'tiong bahru': 'Singapur', 'lavender': 'Singapur',
        'geylang': 'Singapur', 'katong': 'Singapur', 'joo chiat': 'Singapur',
        'bedok': 'Singapur', 'tampines': 'Singapur', 'pasir ris': 'Singapur',
        'woodlands': 'Singapur', 'jurong': 'Singapur', 'clementi': 'Singapur',
        'buona vista': 'Singapur', 'one-north': 'Singapur', 'harbourfront': 'Singapur',
        // More Singapore planning areas
        'raffles place': 'Singapur', 'cbd singapore': 'Singapur',
        'bras basah': 'Singapur', 'civic district': 'Singapur', 'dhoby ghaut': 'Singapur',
        'newton singapore': 'Singapur', 'holland village': 'Singapur',
        'queenstown singapore': 'Singapur', 'commonwealth singapore': 'Singapur',
        'bukit timah': 'Singapur', 'sixth avenue': 'Singapur', 'beauty world': 'Singapur',
        'upper bukit timah': 'Singapur', 'dairy farm': 'Singapur',
        'balestier': 'Singapur', 'toa payoh': 'Singapur', 'bishan': 'Singapur',
        'ang mo kio': 'Singapur', 'serangoon': 'Singapur', 'kovan': 'Singapur',
        'hougang': 'Singapur', 'sengkang': 'Singapur', 'punggol': 'Singapur',
        'yishun': 'Singapur', 'sembawang': 'Singapur',
        'choa chu kang': 'Singapur', 'bukit batok': 'Singapur', 'bukit panjang': 'Singapur',
        'jurong east': 'Singapur', 'jurong west': 'Singapur', 'boon lay': 'Singapur',
        'west coast singapore': 'Singapur', 'pioneer singapore': 'Singapur',
        'east coast': 'Singapur', 'east coast park': 'Singapur', 'changi': 'Singapur',
        'kallang': 'Singapur', 'macpherson': 'Singapur', 'potong pasir': 'Singapur',
        'farrer park': 'Singapur', 'mustafa': 'Singapur', 'little india singapore': 'Singapur',
        'arab street': 'Singapur', 'haji lane': 'Singapur',
        'telok ayer': 'Singapur', 'amoy street': 'Singapur',
        'duxton hill': 'Singapur', 'keong saik': 'Singapur',
        'orchard road': 'Singapur', 'somerset': 'Singapur',
        'bencoolen': 'Singapur', 'middle road': 'Singapur',
        // More Singapore areas
        'alexandra': 'Singapur', 'redhill': 'Singapur', 'stirling': 'Singapur',
        'keppel': 'Singapur', 'labrador': 'Singapur', 'pasir panjang': 'Singapur',
        'bukit merah': 'Singapur', 'chinatown complex': 'Singapur',
        'pearl hill': 'Singapur', 'tras street': 'Singapur',
        'upper thomson': 'Singapur', 'springleaf': 'Singapur',
        'mandai': 'Singapur', 'lim chu kang': 'Singapur',
        'kranji': 'Singapur', 'admiralty singapore': 'Singapur',
        'marina south': 'Singapur', 'downtown core': 'Singapur',
        'marina east': 'Singapur', 'garden by the bay': 'Singapur',
        'geylang serai': 'Singapur', 'aljunied': 'Singapur',
        'eunos': 'Singapur', 'paya lebar': 'Singapur',
        'simei': 'Singapur', 'kembangan': 'Singapur',
        'upper changi': 'Singapur', 'flora drive': 'Singapur',
        'tampines north': 'Singapur', 'tampines west': 'Singapur',
        // Sentosa extras
        'siloso beach': 'Sentosa Island', 'universal studios singapore': 'Sentosa Island',
        'sentosa cove': 'Sentosa Island', 'palawan beach': 'Sentosa Island',
        // Jurong / West
        'jurong lake district': 'Singapur', 'science centre': 'Singapur',
        'ng teng fong': 'Singapur', 'tuas': 'Singapur',
        // Woodlands / North
        'causeway point': 'Singapur', 'marsiling': 'Singapur',
        // Punggol / Northeast
        'punggol waterway': 'Singapur', 'northshore punggol': 'Singapur',
        'waterway point': 'Singapur',
        // Marina extras
        'marina barrage': 'Singapur', 'gardens by the bay east': 'Singapur',
        'the promontory': 'Singapur',
        // Chinese / Malay searches
        '新加坡': 'Singapur', 'singapura': 'Singapur',
    },
    MY: {
        'klcc': 'Kuala Lumpur', 'bukit bintang': 'Kuala Lumpur', 'bangsar': 'Kuala Lumpur',
        'chow kit': 'Kuala Lumpur', 'chinatown kl': 'Kuala Lumpur', 'mont kiara': 'Kuala Lumpur',
        'hartamas': 'Kuala Lumpur', 'damansara': 'Kuala Lumpur', 'petaling jaya': 'Petaling Jaya',
        'subang jaya': 'Subang Jaya', 'sunway': 'Subang Jaya', 'puchong': 'Puchong',
        'cheras kl': 'Kuala Lumpur', 'ampang': 'Ampang', 'wangsa maju': 'Kuala Lumpur',
        'kepong': 'Kuala Lumpur', 'sentul': 'Kuala Lumpur',
        'george town': 'George Town', 'batu ferringhi': 'Batu Ferringhi', 'gurney drive': 'George Town',
        'georgetown penang': 'George Town', 'penang hill': 'George Town', 'air itam': 'Air Itam', 'jelutong': 'George Town',
        'johor bahru': 'Johore Baharu', 'jb city': 'Johore Baharu', 'iskandar': 'Iskandar Puteri',
        'kota kinabalu waterfront': 'Kota Kinabalu', 'likas': 'Kota Kinabalu',
        'kuching waterfront': 'Kuching',
        // KL extra
        'brickfields': 'Kuala Lumpur', 'kl sentral': 'Kuala Lumpur', 'mid valley': 'Kuala Lumpur',
        'bangsar south': 'Kuala Lumpur', 'ttdi': 'Kuala Lumpur', 'taman tun dr ismail': 'Kuala Lumpur',
        'sri petaling': 'Kuala Lumpur', 'sri hartamas': 'Kuala Lumpur',
        'taman connaught': 'Kuala Lumpur', 'cheras km': 'Kuala Lumpur',
        'alam damai': 'Kuala Lumpur', 'bukit jalil': 'Kuala Lumpur',
        'setapak': 'Kuala Lumpur', 'wangsa maju kl': 'Kuala Lumpur',
        'putrajaya': 'Putrajaya', 'cyberjaya': 'Cyberjaya',
        'genting highlands': 'Genting Highlands (Berg)', 'resorts world genting': 'Genting Highlands (Berg)',
        // Peninsula Malaysia cities
        'ipoh': 'Ipoh', 'old town ipoh': 'Ipoh', 'new town ipoh': 'Ipoh',
        'cameron highlands': 'Brinchang', 'tanah rata': 'Tanah Rata',
        'brinchang': 'Brinchang',
        'langkawi': 'Langkawi', 'pantai cenang': 'Langkawi', 'pantai tengah': 'Langkawi',
        'kuah': 'Langkawi', 'datai': 'Langkawi',
        'malacca': 'Malakka', 'melaka': 'Malakka', 'jonker street': 'Malakka',
        'malacca city center': 'Malakka', 'ayer keroh': 'Ayer Keroh',
        'kota bharu': 'Kota Bharu', 'kb mall': 'Kota Bharu',
        'kuala terengganu': 'Kuala Terengganu', 'chinatown kt': 'Kuala Terengganu',
        'seremban': 'Seremban', 'port dickson': 'Port Dickson',
        // Penang extras
        'butterworth': 'Butterworth', 'balik pulau': 'Balik Pulau', 'batu maung': 'Bayan Lepas',
        'teluk kumbar': 'George Town', 'mount erskine': 'George Town',
        // Johor extras
        'skudai': 'Johore Baharu', 'kota tinggi': 'Johore Baharu',
        'batu pahat': 'Batu Pahat', 'muar': 'Muar', 'segamat': 'Muar',
        // KK extras
        'tanjung aru': 'Kota Kinabalu', 'suria sabah': 'Kota Kinabalu',
        'manukan island': 'Kota Kinabalu', 'gaya island': 'Kota Kinabalu',
        // Sabah other cities
        'sandakan': 'Sandakan', 'sepilok': 'Sandakan', 'turtle islands': 'Sandakan',
        'tawau': 'Tawau', 'semporna': 'Semporna', 'sipadan': 'Semporna',
        'mabul island': 'Semporna', 'kapalai': 'Semporna',
        'lahad datu': 'Lahad Datu', 'danum valley': 'Lahad Datu',
        'keningau': 'Keningau', 'tambunan': 'Tambunan',
        // Sarawak other cities
        'miri': 'Miri', 'miri waterfront': 'Miri', 'niah caves': 'Miri',
        'sibu': 'Sibu', 'bintulu': 'Bintulu',
        'serian': 'Serian', 'santubong': 'Kuching', 'damai beach': 'Kuching',
        'bako national park': 'Kuching',
        // East Malaysia extras
        'kota belud': 'Kota Belud', 'ranau': 'Ranau', 'kundasang': 'Ranau',
        'mount kinabalu': 'Ranau', 'mesilau': 'Ranau',
        // More KL / Selangor
        'shah alam': 'Shah Alam', 'klang': 'Klang', 'rawang': 'Rawang',
        'sepang': 'Sepang', 'klia': 'Sepang', 'nilai': 'Nilai',
        'semenyih': 'Kajang', 'kajang': 'Kajang', 'cheras selangor': 'Kajang',
        'ampang selangor': 'Ampang', 'hulu langat': 'Ampang',
        'batu caves': 'Batu Caves', 'jalan tar': 'Kuala Lumpur',
        'chow kit kl': 'Kuala Lumpur', 'medan tuanku': 'Kuala Lumpur',
        // Penang more areas
        'komtar': 'George Town', 'tanjung bungah': 'Tanjung Bungah', 'batu ferringhi penang': 'Batu Ferringhi',
        'teluk bahang': 'Teluk Bahang',
        // Johor more areas
        'kluang': 'Kluang', 'mersing': 'Mersing', 'tioman island': 'Tioman Island',
        'pontian': 'Pontian', 'kulai': 'Johore Baharu',
        'senai': 'Senai',
        // Terengganu / Kelantan
        'redang island': 'Redang Island', 'lang tengah': 'Insel Lang Tengah',
        'perhentian island': 'Kuala Terengganu',
        'gua musang': 'Gua Musang',
        // Perak more areas
        'taiping': 'Taiping', 'teluk intan': 'Teluk Intan', 'sitiawan': 'Sitiawan',
        'lumut': 'Lumut', 'pangkor island': 'Lumut',
        // Pahang / East Coast
        'kuantan': 'Kuantan (und Umgebung)', 'cherating': 'Kuantan (und Umgebung)', 'beserah': 'Kuantan (und Umgebung)',
        'fraser hill': 'Bukit Fraser', 'raub': 'Raub',
        'jerantut': 'Jerantut', 'taman negara': 'Jerantut',
        'rompin': 'Kuala Rompin',
        // Kedah / Perlis
        'alor setar': 'Alor Setar', 'sungai petani': 'Sungai Petani',
        'kangar': 'Kangar',
        // Negeri Sembilan
        'paroi': 'Seremban', 'senawang': 'Seremban',
        // Sabah more areas
        'kota marudu': 'Kota Marudu', 'pitas': 'Kota Marudu',
        'beluran': 'Sandakan', 'kinabatangan': 'Sandakan', 'sukau': 'Sandakan',
        'tawau islands': 'Tawau', 'mataking': 'Tawau',
        'banggi island': 'Kudat', 'kudat': 'Kudat',
        // Sarawak more areas
        'limbang': 'Limbang', 'lawas': 'Lawas', 'marudi': 'Miri',
        'long banga': 'Miri', 'bario': 'Miri',
        'betong sarawak': 'Sibu', 'sri aman': 'Simanggang',
        'kapit': 'Kapit', 'belaga': 'Kapit',
        'mukah': 'Mukah', 'sarikei': 'Sarikei',
        // Labuan
        'labuan': 'Labuan', 'labuan island': 'Labuan',
        // More Cameron Highlands
        'sungai palas tea': 'Brinchang', 'blue valley cameron': 'Brinchang',
        'boh tea plantation': 'Brinchang',
        // More Ipoh
        'sunway city ipoh': 'Ipoh', 'menglembu': 'Ipoh', 'buntong': 'Ipoh',
        // More Pahang
        'bentong': 'Bentong', 'temerloh': 'Temerloh', 'kuala lipis': 'Kuala Lipis',
        'pekan pahang': 'Pekan',
        // More Langkawi
        'kilim geoforest': 'Langkawi', 'telaga harbour': 'Langkawi',
        'tanjung rhu': 'Langkawi', 'cenang langkawi': 'Langkawi',
        // Kedah extras
        'kulim': 'Kulim', 'sungai petani kedah': 'Sungai Petani',
        'baling': 'Baling',
        // Perlis
        'padang besar': 'Padang Besar', 'perlis': 'Kangar',
        // More Penang
        'gelugor': 'George Town', 'bukit mertajam': 'Bukit Mertajam',
        'nibong tebal': 'Nibong Tebal', 'seberang jaya': 'Seberang Jaya',
        // More Melaka
        'alor gajah': 'Alor Gajah', 'masjid tanah': 'Alor Gajah',
        // More Negeri Sembilan
        'nilai ns': 'Nilai', 'bahau': 'Bahau', 'kuala pilah': 'Kuala Pilah',
        // More Johor
        'desaru': 'Johore Baharu', 'desaru beach': 'Johore Baharu',
        'pasir gudang': 'Johore Baharu', 'masai': 'Masai',
        'tangkak': 'Muar', 'pagoh': 'Muar',
        // More Sabah
        'beaufort': 'Beaufort', 'kunak': 'Tawau',
        'telupid': 'Sandakan', 'tongod': 'Sandakan',
        // More Sarawak
        'song sarawak': 'Kapit', 'kanowit': 'Sarikei',
        'dalat sarawak': 'Mukah', 'tatau': 'Bintulu',
        'bau sarawak': 'Kuching',
        // KL extra neighborhoods
        'taman desa': 'Kuala Lumpur', 'jalan ipoh': 'Kuala Lumpur',
        'pandan indah': 'Kuala Lumpur', 'taman melawati': 'Kuala Lumpur',
        'wangsa melawati': 'Kuala Lumpur', 'kepong baru': 'Kuala Lumpur',
        'pandan jaya': 'Kuala Lumpur', 'taman miharja': 'Kuala Lumpur',
        // Malay language searches
        'kuala lumpur': 'Kuala Lumpur', 'pulau pinang': 'George Town',
        'pulau langkawi': 'Langkawi', 'pulau tioman': 'Tioman Island',
        'pulau redang': 'Kuala Terengganu', 'pulau perhentian': 'Kuala Terengganu',
        'pulau pangkor': 'Lumut', 'pulau labuan': 'Labuan',
        'malaysia': 'Kuala Lumpur',
        'port klang': 'Pelabuhan Klang', 'pelabuhan klang': 'Pelabuhan Klang',
        'iskandar puteri': 'Iskandar Puteri', 'puteri harbour': 'Iskandar Puteri',
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
        'kata': 'Phuket Stadt',
        'bang tao': 'Phuket Stadt', 'surin phuket': 'Phuket Stadt',
        'chalong': 'Phuket Stadt', 'old town phuket': 'Phuket Stadt',
        'laguna phuket': 'Phuket Stadt', 'mai khao': 'Phuket Stadt', 'nai harn': 'Phuket Stadt',
        'jomtien': 'Pattaya', 'naklua': 'Pattaya', 'north pattaya': 'Pattaya',
        'south pattaya': 'Pattaya', 'pratumnak': 'Pattaya',
        'hua hin city': 'Hua Hin',
        'chaweng': 'Ko Samui', 'lamai': 'Ko Samui', 'bophut': 'Ko Samui',
        'maenam': 'Ko Samui', 'choengmon': 'Ko Samui',
        'haad rin': 'Koh Phangan', 'thong sala': 'Koh Phangan',
        // Krabi
        'ao nang': 'Krabi', 'railay beach': 'Krabi', 'krabi town': 'Krabi',
        'klong muang': 'Krabi', 'tubkaek': 'Krabi',
        // Koh Lanta
        'klong dao': 'Ko Lanta', 'long beach koh lanta': 'Ko Lanta',
        'koh lanta old town': 'Ko Lanta',
        // Koh Tao
        'sairee beach': 'Ko Tao', 'mae haad': 'Ko Tao', 'chalok baan kao': 'Ko Tao',
        // Koh Chang
        'white sand beach koh chang': 'Ko Chang', 'lonely beach': 'Ko Chang',
        // Kanchanaburi
        'river kwai': 'Kanchanaburi', 'kanchanaburi town': 'Kanchanaburi',
        // Ayutthaya
        'ayutthaya ruins': 'Ayutthaya', 'ayutthaya historical park': 'Ayutthaya',
        // Chiang Rai
        'chiang rai city': 'Chiang Rai', 'white temple area': 'Chiang Rai',
        // Koh Phi Phi
        'phi phi island': 'Ko Phi Phi Don',
        // Sukhothai
        'sukhothai old city': 'Sukhothai',
        // Pai
        'pai city': 'Pai',
        // Bangkok — additional
        'ratchaprasong': 'Bangkok', 'ratchathewi': 'Bangkok', 'lumphini': 'Bangkok',
        'pathum wan': 'Bangkok', 'khlong toei': 'Bangkok', 'watthana': 'Bangkok',
        'bang rak': 'Bangkok', 'thonburi': 'Bangkok', 'bang sue': 'Bangkok',
        'don mueang': 'Bangkok', 'lat krabang': 'Bangkok', 'suvarnabhumi': 'Bangkok',
        'silom road': 'Bangkok', 'phloen chit': 'Bangkok', 'chidlom': 'Bangkok',
        'centralworld': 'Bangkok', 'mbk center': 'Bangkok', 'siam paragon area': 'Bangkok',
        'ratchadamri': 'Bangkok', 'ratchawithi': 'Bangkok',
        // Chiang Mai — additional
        'tapae': 'Chiang Mai', 'tha phae': 'Chiang Mai', 'maya mall chiang mai': 'Chiang Mai',
        'doi suthep area': 'Chiang Mai', 'hang dong': 'Chiang Mai', 'saraphi': 'Chiang Mai',
        'phra sing': 'Chiang Mai', 'airport chiang mai': 'Chiang Mai',
        // Phuket — additional
        'nai yang': 'Phuket Stadt', 'cherngtalay': 'Phuket Stadt', 'thalang': 'Phuket Stadt',
        'kata noi': 'Phuket Stadt', 'hat karon': 'Phuket Stadt', 'tri trang': 'Phuket Stadt',
        'cape yamu': 'Phuket Stadt', 'kedonganan': 'Phuket Stadt',
        // Thailand islands — extra
        'koh lipe': 'Koh Lipe', 'sunrise beach koh lipe': 'Koh Lipe',
        'koh kood': 'Koh Kood', 'klong chao': 'Koh Kood',
        'koh mak': 'Ko Mak',
        'koh yao noi': 'Ko Yao Noi', 'koh yao yai': 'Ko Yao Yai',
        'koh jum': 'Ko Jum Strand', 'koh ngai': 'Ko Ngai',
        'koh tarutao': 'Satun', 'koh bulon': 'Satun',
        'mu koh surin': 'Ranong', 'koh surin': 'Ranong', 'koh similan': 'Khao Lak',
        'khao lak': 'Khao Lak', 'bang niang': 'Khao Lak', 'nang thong': 'Khao Lak',
        'koh racha': 'Phuket Stadt', 'coral island phuket': 'Phuket Stadt',
        // More beach destinations
        'cha am': 'Cha-am', 'cha-am beach': 'Cha-am',
        'pranburi': 'Hua Hin', 'sam roi yot': 'Hua Hin',
        'chumphon': 'Chumphon',
        'nakhon si thammarat': 'Nakhon Si Thammarat',
        // Northern Thailand
        'lampang': 'Lampang', 'lampang city': 'Lampang',
        'lamphun': 'Lamphun',
        'chiang dao': 'Chiang Dao', 'doi inthanon': 'Chiang Mai',
        'nan city': 'Nan', 'bo kluea': 'Nan',
        'mae hong son': 'Mae Hong Son', 'mae hong son loop': 'Mae Hong Son',
        'mae sariang': 'Mae Sariang',
        'phayao': 'Phayao', 'phrae': 'Phrae',
        // Northeast Thailand (Isaan)
        'udon thani': 'Udon Thani', 'nong khai': 'Nong Khai',
        'khon kaen': 'Khon Kaen', 'khon kaen city': 'Khon Kaen',
        'ubon ratchathani': 'Ubon Ratchathani', 'ubon': 'Ubon Ratchathani',
        'nakhon ratchasima': 'Nakhon Ratchasima', 'korat': 'Nakhon Ratchasima',
        'buriram': 'Buri Ram', 'surin': 'Surin',
        'mukdahan': 'Mukdahan', 'that phanom': 'Nakhon Phanom',
        'loei': 'Loei', 'phu kradueng': 'Loei',
        // Central / South Thailand
        'hat yai': 'Hat Yai', 'hat yai city': 'Hat Yai',
        'songkhla': 'Songkhla', 'songkhla lake': 'Songkhla',
        'trang': 'Trang', 'phatthalung': 'Phatthalung',
        'satun town': 'Satun',
        'phuket town': 'Phuket Stadt',
        'phang nga': 'Phang Nga', 'james bond island': 'Phang Nga',
        'prachuap khiri khan': 'Prachuap Khiri Khan',
        'ratchaburi': 'Ratchaburi',
        'lopburi': 'Lop Buri', 'lopburi monkey': 'Lop Buri',
        'suphanburi': 'Suphan Buri',
        'nakhon pathom': 'Nakhon Pathom',
        'phetchaburi': 'Phetchaburi', 'kaeng krachan': 'Phetchaburi',
        // Bangkok extra sub-areas
        'bang khae': 'Bangkok', 'bang bon': 'Bangkok', 'lat phrao': 'Bangkok',
        'suan luang': 'Bangkok', 'prawet': 'Bangkok', 'nong chok': 'Bangkok',
        'min buri': 'Bangkok', 'klong sam wa': 'Bangkok',
        'taling chan': 'Bangkok', 'talingchan': 'Bangkok',
        'pom prap': 'Bangkok', 'samphanthawong': 'Bangkok',
        'bueng kum': 'Bangkok', 'saphan sung': 'Bangkok',
        // More Thai provinces and islands
        'koh chang': 'Ko Chang', 'white sand beach chang': 'Ko Chang',
        'koh samet': 'Koh Samet', 'ao prao': 'Koh Samet',
        'rayong city': 'Rayong', 'mae klong market': 'Samut Songkhram',
        'lopburi city': 'Lop Buri', 'ayutthaya floating market': 'Ayutthaya',
        'sukhothai ruins': 'Sukhothai', 'sukhothai historical': 'Sukhothai',
        'tak province': 'Tak', 'mae sot': 'Mae Sot',
        'pai town': 'Pai', 'mae hong son city': 'Mae Hong Son',
        'phitsanulok city': 'Phitsanulok', 'phrae city': 'Phrae',
        'phayao city': 'Phayao',
        'lamphun city': 'Lamphun',
        'golden triangle': 'Chiang Rai',
        'surin city': 'Surin', 'buriram city': 'Buri Ram',
        'pattani city': 'Pattani', 'narathiwat city': 'Narathiwat',
        'nakhon sawan city': 'Nakhon Sawan', 'uthai thani city': 'Uthai Thani',
        'kamphaeng phet': 'Kamphaeng Phet',
        'prachinburi': 'Prachinburi', 'sa kaeo': 'Sa Kaeo',
        'chachoengsao': 'Chachoengsao',
        'samut prakan': 'Samut Prakan', 'nonthaburi city': 'Nonthaburi',
        'pathum thani city': 'Pathum Thani',
        // More Northern Thailand
        'doi ang khang': 'Chiang Mai', 'mon cham': 'Chiang Mai',
        'huay nam dang': 'Chiang Mai', 'fang chiang mai': 'Chiang Mai',
        'chiang saen': 'Chiang Rai', 'mae sai': 'Chiang Rai',
        'doi mae salong': 'Chiang Rai',
        // More Isaan
        'nong bua lam phu': 'Nongbua Lamphu',
        'yasothon': 'Yasothon', 'roi et': 'Roi Et',
        'sakon nakhon': 'Sakon Nakhon', 'nakhon phanom': 'Nakhon Phanom',
        'amnat charoen': 'Amnat Charoen',
        'chaiyaphum': 'Chaiyaphum', 'maha sarakham': 'Maha Sarakham',
        'si sa ket': 'Sisaket',
        // More South Thailand
        'betong': 'Betong', 'yala city': 'Yala',
        'ranong city': 'Ranong', 'surat thani': 'Surat Thani',
        'nakhon si thammarat city': 'Nakhon Si Thammarat',
        'phatthalung city': 'Phatthalung',
        // Thai language names
        'กรุงเทพ': 'Bangkok', 'กรุงเทพมหานคร': 'Bangkok',
        'เชียงใหม่': 'Chiang Mai', 'ภูเก็ต': 'Phuket Stadt',
        'พัทยา': 'Pattaya', 'สมุย': 'Ko Samui',
        'กระบี่': 'Krabi', 'เชียงราย': 'Chiang Rai',
        'อยุธยา': 'Ayutthaya', 'หัวหิน': 'Hua Hin',
        'ขอนแก่น': 'Khon Kaen', 'อุดรธานี': 'Udon Thani',
    },
    VN: {
        'district 1': 'Ho-Chi-Minh-Stadt', 'ben thanh': 'Ho-Chi-Minh-Stadt',
        'bui vien': 'Ho-Chi-Minh-Stadt', 'thao dien': 'Ho-Chi-Minh-Stadt',
        'phu my hung': 'Ho-Chi-Minh-Stadt', 'district 3': 'Ho-Chi-Minh-Stadt',
        'district 7': 'Ho-Chi-Minh-Stadt', 'binh thanh': 'Ho-Chi-Minh-Stadt',
        'tan binh': 'Ho-Chi-Minh-Stadt', 'go vap': 'Ho-Chi-Minh-Stadt',
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
        'front beach vung tau': 'Vung Tàu', 'back beach vung tau': 'Vung Tàu',
        // Dalat
        'dalat city': 'Ðà Lat', 'dalat old market': 'Ðà Lat',
        // Can Tho
        'ninh kieu': 'Cân Tho',
        // Halong extras
        'cat ba island': 'Ha Long',
        // HCMC — additional districts
        'saigon': 'Ho-Chi-Minh-Stadt', 'hcmc': 'Ho-Chi-Minh-Stadt', 'ho chi minh': 'Ho-Chi-Minh-Stadt',
        'district 2': 'Ho-Chi-Minh-Stadt', 'district 4': 'Ho-Chi-Minh-Stadt',
        'district 5': 'Ho-Chi-Minh-Stadt', 'district 6': 'Ho-Chi-Minh-Stadt',
        'district 8': 'Ho-Chi-Minh-Stadt', 'district 9': 'Ho-Chi-Minh-Stadt',
        'district 10': 'Ho-Chi-Minh-Stadt', 'district 11': 'Ho-Chi-Minh-Stadt',
        'district 12': 'Ho-Chi-Minh-Stadt', 'cholon': 'Ho-Chi-Minh-Stadt',
        'phu nhuan': 'Ho-Chi-Minh-Stadt', 'thu duc': 'Ho-Chi-Minh-Stadt',
        'pham ngu lao': 'Ho-Chi-Minh-Stadt', 'landmark 81': 'Ho-Chi-Minh-Stadt',
        'ben nghe': 'Ho-Chi-Minh-Stadt', 'vinhomes central park': 'Ho-Chi-Minh-Stadt',
        // Hanoi — additional
        'my dinh': 'Hanoi', 'nam tu liem': 'Hanoi', 'hoang mai': 'Hanoi',
        'ha dong': 'Hanoi', 'thanh xuan': 'Hanoi', 'tay ho tay': 'Hanoi',
        'hoan kiem lake': 'Hanoi', 'sword lake': 'Hanoi',
        'hang bai': 'Hanoi', 'hang bong': 'Hanoi', 'hang gai': 'Hanoi', 'ma may': 'Hanoi',
        'xuan dieu': 'Hanoi', 'nhat tan': 'Hanoi',
        // More Vietnam cities
        'hai phong': 'Haiphong', 'do son': 'Haiphong', 'cat ba': 'Ha Long',
        'ninh binh': 'Hoa Lu', 'tam coc': 'Hoa Lu', 'trang an': 'Hoa Lu',
        'bich dong': 'Hoa Lu', 'hoa lu': 'Hoa Lu',
        'quy nhon': 'Quy Nhơn', 'eo gio': 'Quy Nhơn',
        'quang ngai': 'Quảng Ngãi',
        'kon tum': 'Kon Tum',
        'buon ma thuot': 'Ban Me Thuot', 'buon ma thuot coffee': 'Ban Me Thuot',
        'pleiku': 'Pleiku',
        'phan thiet': 'Phan Thiet',
        'con dao': 'Con Son', 'con son': 'Con Son',
        'lang co': 'Hue', 'hai van pass': 'Hue',
        // Ha Giang / Northern mountains
        'ha giang': 'Ha Giang', 'dong van': 'Ha Giang', 'meo vac': 'Ha Giang',
        'lung cu': 'Ha Giang',
        'moc chau': 'Moc Chau', 'moc chau plateau': 'Moc Chau',
        'mai chau': 'Mai Chau', 'mai chau valley': 'Mai Chau',
        'cao bang': 'Cao Bang', 'ban gioc': 'Cao Bang',
        'bac ha': 'Bac Ha', 'lao cai': 'Lao Cai',
        // Phu Quoc expanded
        'phu quoc north': 'Phu Quoc', 'vinpearl phu quoc': 'Phu Quoc',
        'duong dong': 'Phu Quoc', 'ong lang beach': 'Phu Quoc',
        'sao beach': 'Phu Quoc', 'khem beach': 'Phu Quoc',
        // More Da Nang / Hoi An
        'ba na hills': 'Da Nang', 'son tra': 'Da Nang',
        'marble mountains': 'Da Nang', 'an thuong': 'Da Nang',
        'hoi an beach': 'Hoi An', 'cua dai': 'Hoi An',
        // More Nha Trang
        'hon tam': 'Nha Trang', 'doc let beach': 'Nha Trang', 'vinpearl nha trang': 'Nha Trang',
        // More HCMC
        'thu thiem': 'Ho-Chi-Minh-Stadt', 'binh chanh': 'Ho-Chi-Minh-Stadt',
        'hoc mon': 'Ho-Chi-Minh-Stadt', 'binh duong': 'Ho-Chi-Minh-Stadt',
        // Vung Tau expanded
        'vung tau long hai': 'Vung Tàu', 'ho tram': 'Vung Tàu',
        // Delta
        'my tho': 'Mỹ Tho', 'ben tre': 'Ben Tre',
        'vinh long': 'Vinh Long', 'chau doc': 'Chau Doc',
        'ha tien': 'Ha Tien', 'long xuyen': 'Long Xuyen',
        'soc trang': 'Ho-Chi-Minh-Stadt', 'bac lieu': 'Bac Lieu',
        'ca mau': 'Ca Mau',
        // More Hanoi districts
        'ba vi': 'Hanoi', 'son tay': 'Hanoi', 'hoai duc': 'Hanoi',
        'thu duc hanoi': 'Hanoi', 'dong anh': 'Hanoi', 'soc son': 'Hanoi',
        'me linh': 'Hanoi', 'gia lam': 'Hanoi',
        // More HCMC areas
        'binh tan': 'Ho-Chi-Minh-Stadt', 'cu chi': 'Ho-Chi-Minh-Stadt',
        'can gio': 'Ho-Chi-Minh-Stadt', 'nha be': 'Ho-Chi-Minh-Stadt',
        // Central Vietnam
        'dong hoi': 'Dong Hoi', 'phong nha': 'Phong Nha', 'phong nha ke bang': 'Phong Nha',
        'paradise cave': 'Phong Nha', 'son doong': 'Phong Nha',
        'dong ha': 'Dong Ha', 'quang tri': 'Dong Ha',
        'tam ky': 'Da Nang',
        // Mekong Delta more cities
        'tra vinh': 'Tra Vinh', 'tien giang': 'Mỹ Tho', 'dong thap': 'Cao Lanh',
        'cao lanh': 'Cao Lanh', 'an giang': 'Long Xuyen', 'rach gia': 'Rach Gia',
        'kien giang': 'Rach Gia', 'phu quoc airport': 'Phu Quoc',
        // More Northern Vietnam
        'yen bai': 'Yen Bai', 'tuyen quang': 'Tuyen Quang',
        'thai nguyen': 'Thai Nguyen', 'lang son': 'Lang Son', 'mong cai': 'Mong Cai',
        'quang ninh': 'Ha Long', 'ha long city': 'Ha Long',
        'bai tu long': 'Ha Long', 'vung vieng': 'Ha Long',
        'da bac': 'Mai Chau', 'pu luong': 'Mai Chau',
        'son la': 'Son La', 'dien bien phu': 'Dien-Bien-Phu',
        'lai chau': 'Lai Chau', 'pa so': 'Lai Chau',
        'mu cang chai': 'Hanoi', 'tu le': 'Hanoi',
        'tam duong': 'Tam Duong',
        // More Central Highlands
        'da lat city': 'Ðà Lat', 'lat village': 'Ðà Lat',
        'cat tien': 'Bao Loc', 'bao loc': 'Bao Loc',
        'gia nghia': 'Gia Nghia', 'dak nong': 'Gia Nghia',
        // South Coast
        'vung tau city': 'Vung Tàu', 'phan rang': 'Phan Rang - Thap Cham', 'ninh chu beach': 'Phan Rang - Thap Cham',
        'cam ranh': 'Cam Ranh', 'cam ranh beach': 'Cam Ranh',
        // More Hoi An area
        'my son': 'Da Nang', 'my son sanctuary': 'Da Nang',
        'chu lai': 'Da Nang',
        // Sapa extras
        'sapa rice terraces': 'Sapa', 'muong hoa valley': 'Sapa',
        'cat cat village': 'Sapa', 'ta phin village': 'Sapa',
        'ta van village': 'Sapa', 'lao chai': 'Sapa',
        'fansipan': 'Sapa', 'mount fansipan': 'Sapa',
        // Hoi An extras
        'tra que village': 'Hoi An', 'thanh ha pottery': 'Hoi An',
        'cam thanh': 'Hoi An', 'basket boat': 'Hoi An',
        // More Ha Long / Bai Tu Long
        'lan ha bay': 'Ha Long', 'co to island': 'Ha Long',
        'quan lan island': 'Ha Long', 'van don': 'Ha Long',
        // More Mui Ne
        'red sand dunes': 'Mui Ne', 'white sand dunes': 'Mui Ne',
        'fairy stream': 'Mui Ne', 'binh thuan': 'Mui Ne',
        // Vietnamese diacritic names
        'hà nội': 'Hanoi', 'ha noi': 'Hanoi',
        'thành phố hồ chí minh': 'Ho-Chi-Minh-Stadt',
        'hồ chí minh': 'Ho-Chi-Minh-Stadt', 'sài gòn': 'Ho-Chi-Minh-Stadt',
        'đà nẵng': 'Da Nang', 'da nang': 'Da Nang',
        'huế': 'Hue', 'hội an': 'Hoi An',
        'nha trang': 'Nha Trang', 'đà lạt': 'Ðà Lat', 'da lat': 'Ðà Lat',
        'vũng tàu': 'Vung Tàu', 'cần thơ': 'Cân Tho',
        'hạ long': 'Ha Long', 'phú quốc': 'Phu Quoc',
        'hải phòng': 'Haiphong', 'ninh bình': 'Hoa Lu',
        'sa pa': 'Sapa', 'mũi né': 'Mui Ne',
        'hà giang': 'Ha Giang', 'cao bằng': 'Cao Bang',
        'điện biên phủ': 'Dien-Bien-Phu', 'mù cang chải': 'Hanoi',
        'việt nam': 'Hanoi',
    },
    ID: {
        // Bali
        'seminyak': 'Kuta', 'nusa dua': 'Nusa Dua', 'legian': 'Legian',
        'uluwatu': 'Pecatu', 'petitenget': 'Kuta', 'denpasar': 'Denpasar',
        'berawa': 'Canggu', 'pererenan': 'Pererenan', 'echo beach': 'Canggu',
        'kedewatan': 'Ubud', 'tegalalang': 'Tegallalang', 'kerobokan': 'Kerobokan',
        'tanjung benoa': 'Nusa Dua', 'renon': 'Denpasar',
        // Bali — additional
        'bukit peninsula': 'Jimbaran', 'bukit bali': 'Jimbaran', 'ungasan': 'Ungasan',
        'lovina': 'Kalibukbuk', 'singaraja bali': 'Singaraja', 'padangbai': 'Padangbai',
        'candidasa': 'Candi Dasa', 'amed bali': 'Amlapura', 'tulamben': 'Tulamben',
        'nusa penida': 'Penida', 'nusa lembongan': 'Lembongan Island', 'munduk': 'Munduk',
        'bedugul': 'Bedugul', 'sidemen bali': 'Sidemen', 'karangasem': 'Amlapura',
        // Jakarta
        'kemang': 'Jakarta', 'scbd': 'Jakarta', 'sudirman': 'Jakarta',
        'menteng': 'Jakarta', 'kebayoran baru': 'Jakarta', 'tebet': 'Jakarta',
        'mampang': 'Jakarta', 'pancoran': 'Jakarta', 'grogol': 'Jakarta',
        'kebon jeruk': 'Jakarta', 'pluit': 'Jakarta', 'kota tua': 'Jakarta',
        'ancol': 'Jakarta', 'kelapa gading': 'Jakarta', 'puri': 'Jakarta',
        'bintaro': 'Jakarta', 'cipete': 'Jakarta', 'cilandak': 'Jakarta',
        // Jakarta — additional
        'thamrin': 'Jakarta', 'senayan': 'Jakarta', 'kuningan': 'Jakarta',
        'gatot subroto': 'Jakarta', 'glodok': 'Jakarta', 'blok m': 'Jakarta',
        'pondok indah': 'Jakarta', 'lebak bulus': 'Jakarta', 'fatmawati': 'Jakarta',
        'pasar minggu': 'Jakarta', 'rawamangun': 'Jakarta', 'jatinegara': 'Jakarta',
        'cengkareng': 'Jakarta', 'kalideres': 'Jakarta', 'sunter': 'Jakarta',
        'pademangan': 'Jakarta', 'tanjung priok': 'Jakarta', 'mangga besar': 'Jakarta',
        'pasar baru jakarta': 'Jakarta', 'senen': 'Jakarta', 'matraman': 'Jakarta',
        'cipinang': 'Jakarta', 'pulogadung': 'Jakarta', 'utan kayu': 'Jakarta',
        // Yogyakarta
        'malioboro': 'Yogyakarta', 'prawirotaman': 'Yogyakarta', 'kraton': 'Yogyakarta',
        'kotagede': 'Yogyakarta',
        // Lombok
        'kuta lombok': 'Kecamatan Pujut', 'gili trawangan': 'Gili Trawangan',
        'gili meno': 'Gili Meno', 'gili air': 'Gili Air', 'mataram': 'Mataram',
        // Surabaya
        'gubeng': 'Surabaya', 'rungkut': 'Surabaya',
        // Medan
        'polonia': 'Medan',
        // Komodo
        'labuan bajo': 'Labuan Bajo',
        // Flores
        'bajawa': 'Bajawa', 'ende': 'Ende',
        // Sumatra
        'bukit lawang': 'Bukit Lawang', 'lake toba': 'Parapat', 'prapat': 'Parapat',
        'berastagi': 'Berastagi', 'banda aceh city': 'Banda Aceh',
        'padang city': 'Padang', 'bukittinggi': 'Bukittinggi',
        // Sulawesi
        'manado city': 'Manado', 'bunaken': 'Manado',
        'toraja': 'Rantepao', 'makassar city': 'Makassar',
        // Raja Ampat / Papua
        'waisai': 'Waisai',
        // Gili Islands (already as gili trawangan → Lombok)
        // Bromo
        'mount bromo': 'Probolinggo', 'cemoro lawang': 'Probolinggo',
        // Ijen
        'kawah ijen': 'Banyuwangi',
        // Bandung
        'bandung city': 'Bandung', 'dago': 'Bandung', 'pasteur': 'Bandung',
        'braga': 'Bandung', 'buah batu': 'Bandung', 'cihampelas': 'Bandung',
        'setiabudhi': 'Bandung', 'lembang': 'Bandung', 'ciwidey': 'Bandung',
        // Semarang
        'semarang city': 'Semarang', 'kota lama semarang': 'Semarang',
        'simpang lima': 'Semarang',
        // Solo / Surakarta
        'solo': 'Surakarta', 'surakarta': 'Surakarta', 'laweyan': 'Surakarta',
        'mangkunegaran': 'Surakarta', 'purwosari': 'Surakarta',
        // Malang
        'malang city': 'Malang', 'batu malang': 'Malang', 'jodipan': 'Malang',
        'coban rondo': 'Malang', 'selecta': 'Malang',
        // Yogyakarta expanded
        'kaliurang': 'Yogyakarta', 'prambanan': 'Yogyakarta',
        'borobudur': 'Magelang', 'magelang': 'Magelang',
        // Surabaya expanded
        'pakuwon': 'Surabaya', 'citraland': 'Surabaya', 'darmo': 'Surabaya',
        'wonokromo': 'Surabaya', 'mulyorejo': 'Surabaya',
        // Medan expanded
        'medan city': 'Medan', 'maimun': 'Medan', 'sunggal': 'Medan',
        // Batam / Bintan (Riau Islands)
        'batam': 'Batam', 'batam centre': 'Batam', 'nagoya batam': 'Batam',
        'nongsa': 'Batam', 'batu ferringhi batam': 'Batam',
        'bintan': 'Tanjung Pinang', 'lagoi': 'Tanjung Pinang', 'tanjung pinang': 'Tanjung Pinang',
        // Kalimantan
        'balikpapan': 'Balikpapan', 'stilthouses': 'Balikpapan',
        'banjarmasin': 'Banjarmasin', 'pasar terapung': 'Banjarmasin',
        'samarinda': 'Samarinda',
        'palangkaraya': 'Palangkaraya',
        // More Sulawesi
        'makassar port': 'Makassar', 'tana toraja': 'Rantepao', 'rantepao': 'Rantepao',
        'tomohon': 'Tomohon',
        'palu': 'Palu', 'tentena': 'Tentena',
        // Ambon / Maluku
        'ambon': 'Ambon', 'ambon city': 'Ambon',
        'banda islands': 'Bandanaira', 'banda neira': 'Bandanaira',
        // Raja Ampat
        'waigeo': 'Sorong', 'sorong city': 'Sorong',
        'misool': 'Sorong', 'salawati': 'Sorong',
        // Belitung
        'tanjung pandan': 'Belitung',
        'tanjung kelayang': 'Belitung',
        // Other Java
        'tasikmalaya': 'Tasikmalaya', 'garut': 'Garut', 'cirebon': 'Cirebon',
        'purwokerto': 'Purwokerto', 'cilacap': 'Cilacap',
        // Sumatra extras
        'palembang': 'Palembang', 'pagar alam': 'Pagar Alam',
        'lampung': 'Bandar Lampung', 'bandar lampung': 'Bandar Lampung',
        // Flores extras
        'maumere': 'Maumere', 'riung': 'Bajawa',
        'komodo island': 'Labuan Bajo', 'pink beach flores': 'Labuan Bajo',
        // Java — more areas
        'bekasi': 'Bekasi', 'depok': 'Depok', 'tangerang': 'Tangerang', 'south tangerang': 'South Tangerang',
        'bogor': 'Bogor', 'puncak': 'Bogor', 'cibinong': 'Cibinong',
        'sukabumi': 'Sukabumi', 'pelabuhan ratu': 'Sukabumi',
        'karawang': 'Karawang', 'subang': 'Subang',
        'pekalongan': 'Pekalongan', 'tegal': 'Tegal', 'brebes': 'Tegal',
        'jepara': 'Jepara', 'kudus': 'Kudus', 'demak': 'Demak',
        'blora': 'Blora', 'rembang': 'Rembang',
        'tuban': 'Tuban', 'lamongan': 'Lamongan', 'gresik': 'Gresik',
        'sidoarjo': 'Sidoarjo', 'mojokerto': 'Mojokerto', 'jombang': 'Jombang',
        'kediri': 'Kediri', 'blitar': 'Blitar', 'tulungagung': 'Tulungagung',
        'madiun': 'Madiun', 'ngawi': 'Ngawi', 'ponorogo': 'Ponorogo',
        'pacitan': 'Pacitan', 'trenggalek': 'Trenggalek',
        'lumajang': 'Lumajang', 'jember': 'Jember', 'situbondo': 'Situbondo',
        'bondowoso': 'Bondowoso', 'madura island': 'Pamekasan', 'pamekasan': 'Pamekasan',
        // Bali more specific
        'seminyak beach': 'Kuta', 'kuta beach bali': 'Kuta', 'double six beach': 'Kuta',
        'dreamland beach': 'Pecatu', 'bingin beach': 'Pecatu', 'padang padang': 'Pecatu',
        'balangan beach': 'Pecatu', 'green bowl': 'Pecatu',
        'tanah lot': 'Tabanan', 'pura besakih': 'Amlapura', 'mount agung': 'Amlapura',
        'batur volcano': 'Kintamani', 'kintamani': 'Kintamani', 'penglipuran': 'Bangli',
        'tirta gangga': 'Amlapura', 'candidasa bali': 'Candi Dasa',
        // Lombok more areas
        'selong belanak': 'Kecamatan Praya Barat', 'mawun': 'Kecamatan Praya Barat', 'tanjung aan': 'Kecamatan Pujut',
        'pink beach lombok': 'Praya', 'sekotong': 'Sekotong Barat',
        'rinjani': 'Senaru', 'sembalun': 'Sembalun Lawang',
        // Sumatra more areas
        'pekanbaru': 'Pekanbaru', 'dumai': 'Dumai',
        'jambi city': 'Jambi', 'muara bungo': 'Muara Bungo',
        'bengkulu': 'Bengkulu',
        'padang sidempuan': 'Padang Sidempuan',
        'sabang': 'Sabang', 'weh island': 'Sabang',
        'sibolga': 'Sibolga', 'nias island': 'Teluk Dalam', 'sorake': 'Teluk Dalam',
        'pulau simeulue': 'Banda Aceh',
        // Sulawesi more areas
        'gorontalo': 'Gorontalo', 'luwuk': 'Luwuk', 'kendari': 'Kendari',
        'parepare': 'Parepare', 'palopo': 'Palopo',
        'bitung': 'Bitung', 'kotamobagu': 'Kotamobagu',
        'donggala': 'Palu',
        // Maluku more areas
        'ternate': 'Ternate', 'tidore': 'Ternate', 'tidore island': 'Ternate',
        'tual': 'Ambon',
        // Papua / West Papua
        'jayapura': 'Jayapura', 'sentani': 'Sentani',
        'manokwari': 'Manokwari', 'biak': 'Biak', 'nabire': 'Nabire',
        'merauke': 'Merauke', 'timika': 'Timika', 'wamena': 'Wamena',
        // Nusa Tenggara
        'kupang': 'Kupang', 'rote island': 'Baa', 'nemberala': 'Nemberala',
        'sumbawa': 'Sumbawa Besar', 'bima': 'Bima',
        'sumba': 'Waingapu', 'waikabubak': 'Waikabubak', 'nihiwatu': 'Waikabubak',
        'labuanbajo ntt': 'Labuan Bajo',
        // Kalimantan more areas
        'pontianak': 'Pontianak', 'singkawang': 'Singkawang',
        'tarakan': 'Tarakan', 'nunukan': 'Nunukan',
        'bontang': 'Bontang', 'tenggarong': 'Tenggarong',
        'martapura': 'Martapura',
        // Raja Ampat detailed
        'dampier strait': 'Sorong', 'four kings': 'Sorong',
        // Bangka-Belitung extras
        'pangkalpinang': 'Pangkalpinang', 'bangka island': 'Pangkalpinang',
        'muntok': 'Muntok',
        // More Sumatra cities
        'padang panjang': 'Padang Panjang', 'solok': 'Solok', 'sawahlunto': 'Sawahlunto',
        'lubuk linggau': 'Lubuk Linggau', 'muara enim': 'Muara Enim',
        'lahat sumatera': 'Lahat', 'prabumulih': 'Prabumulih',
        'tanjungpinang': 'Tanjung Pinang', 'karimun': 'Tanjung Balai Karimun',
        'natuna': 'Ranai',
        // More Java cities
        'serang': 'Serang', 'cilegon': 'Cilegon', 'pandeglang': 'Pandeglang',
        'rangkasbitung': 'Rangkasbitung',
        'kuningan java': 'Kuningan', 'majalengka': 'Majalengka',
        'indramayu': 'Indramayu', 'subang java': 'Subang',
        'wonogiri': 'Wonogiri', 'klaten': 'Klaten', 'salatiga': 'Salatiga',
        'temanggung': 'Temanggung', 'wonosobo': 'Wonosobo', 'kebumen': 'Kebumen',
        'purworejo': 'Purworejo', 'bantul': 'Bantul', 'gunung kidul': 'Wonosari',
        'sleman': 'Sleman',
        // More Sulawesi
        'mamuju': 'Mamuju', 'masamba': 'Masamba',
        'wajo toraja': 'Rantepao', 'bone sulawesi': 'Watampone',
        'watampone': 'Watampone', 'bulukumba': 'Bulukumba',
        'bantaeng': 'Bantaeng', 'jeneponto': 'Makassar',
        'majene': 'Majene', 'polewali mandar': 'Polewali',
        // More NTT (East Nusa Tenggara)
        'maumere city': 'Maumere', 'ende flores': 'Ende',
        'larantuka': 'Larantuka', 'lewoleba': 'Ende',
        'atambua ntt': 'Atambua', 'kefamenanu': 'Kefamenanu',
        'soe ntt': 'Soe', 'alor': 'Kalabahi', 'kalabahi': 'Kalabahi',
        'manggarai': 'Ruteng', 'ruteng flores': 'Ruteng',
        // Indonesian language searches
        'jakarta pusat': 'Jakarta', 'jakarta selatan': 'Jakarta',
        'jakarta utara': 'Jakarta', 'jakarta timur': 'Jakarta', 'jakarta barat': 'Jakarta',
        'bali island': 'Denpasar', 'pulau bali': 'Denpasar',
        'pulau lombok': 'Mataram', 'pulau komodo': 'Labuan Bajo',
        'pulau flores': 'Labuan Bajo', 'pulau sumatra': 'Medan',
        'pulau kalimantan': 'Balikpapan', 'pulau sulawesi': 'Makassar',
    },
    IN: {
        // Mumbai
        'bandra': 'Mumbai', 'juhu': 'Mumbai', 'andheri': 'Mumbai', 'colaba': 'Mumbai',
        'lower parel': 'Mumbai', 'bkc': 'Mumbai', 'powai': 'Mumbai',
        'worli': 'Mumbai', 'prabhadevi': 'Mumbai', 'dadar': 'Mumbai',
        'chembur': 'Mumbai', 'malad': 'Mumbai', 'kandivali': 'Mumbai',
        'borivali': 'Mumbai', 'thane': 'Thane', 'navi mumbai': 'Navi Mumbai',
        'fort mumbai': 'Mumbai', 'south mumbai': 'Mumbai', 'churchgate': 'Mumbai', 'marine lines': 'Mumbai',
        'versova': 'Mumbai', 'goregaon': 'Mumbai',
        // Delhi
        'connaught place': 'New Delhi', 'karol bagh': 'New Delhi', 'paharganj': 'New Delhi',
        'south delhi': 'New Delhi', 'hauz khas': 'New Delhi', 'lajpat nagar': 'New Delhi',
        'greater kailash': 'New Delhi', 'saket': 'New Delhi', 'vasant kunj': 'New Delhi',
        'gurgaon': 'Gurugram', 'gurugram': 'Gurugram', 'noida': 'Noida',
        'janakpuri': 'New Delhi', 'pitampura': 'New Delhi', 'rohini': 'New Delhi',
        'dwarka': 'New Delhi', 'rajouri garden': 'New Delhi', 'preet vihar': 'New Delhi',
        'laxmi nagar': 'New Delhi', 'nehru place': 'New Delhi', 'old delhi': 'New Delhi',
        // Bangalore
        'koramangala': 'Bengaluru', 'indiranagar': 'Bengaluru', 'whitefield': 'Bengaluru',
        'jp nagar': 'Bengaluru', 'hsr layout': 'Bengaluru', 'btm layout': 'Bengaluru',
        'jayanagar': 'Bengaluru', 'malleswaram': 'Bengaluru', 'hebbal': 'Bengaluru',
        'yelahanka': 'Bengaluru', 'marathahalli': 'Bengaluru', 'electronic city': 'Bengaluru',
        'sarjapur': 'Bengaluru', 'bellandur': 'Bengaluru', 'mg road': 'Bengaluru',
        'brigade road': 'Bengaluru', 'commercial street': 'Bengaluru',
        // Chennai
        'anna nagar': 'Chennai', 't nagar': 'Chennai', 'mylapore': 'Chennai',
        'nungambakkam': 'Chennai', 'adyar': 'Chennai', 'velachery': 'Chennai',
        'guindy': 'Chennai', 'perambur': 'Chennai', 'egmore': 'Chennai',
        'chetpet': 'Chennai', 'kodambakkam': 'Chennai', 'teynampet': 'Chennai',
        // Hyderabad
        'banjara hills': 'Hyderabad', 'jubilee hills': 'Hyderabad', 'gachibowli': 'Hyderabad',
        'kondapur': 'Hyderabad', 'madhapur': 'Hyderabad', 'hitech city': 'Hyderabad',
        'ameerpet': 'Hyderabad', 'begumpet': 'Hyderabad', 'secunderabad': 'Secunderabad',
        'kukatpally': 'Hyderabad', 'lb nagar': 'Hyderabad', 'dilsukhnagar': 'Hyderabad',
        // Pune
        'koregaon park': 'Pune', 'kalyani nagar': 'Pune', 'baner': 'Pune',
        'viman nagar': 'Pune', 'hadapsar': 'Pune', 'kothrud': 'Pune',
        'shivajinagar': 'Pune', 'aundh': 'Pune', 'wakad': 'Pune',
        'pimple saudagar': 'Pune', 'hinjewadi': 'Pune', 'kharadi': 'Pune',
        // Goa
        'palolem': 'Süd-Goa', 'sinquerim': 'Calangute',
        'colva': 'Colva', 'benaulim': 'Süd-Goa', 'panaji': 'Panaji', 'mapusa': 'Mapusa',
        'chapora': 'Vagator', 'agonda': 'Süd-Goa', 'patnem': 'Süd-Goa',
        // Jaipur
        'bani park': 'Jaipur', 'civil lines jaipur': 'Jaipur', 'malviya nagar jaipur': 'Jaipur',
        'sindhi camp': 'Jaipur', 'old city jaipur': 'Jaipur',
        // Kolkata
        'park street': 'Kalkutta', 'salt lake': 'Kalkutta', 'new town kolkata': 'Kalkutta',
        'ballygunge': 'Kalkutta', 'behala': 'Kalkutta', 'howrah': 'Kalkutta',
        'lake town': 'Kalkutta',
        // Ahmedabad
        'satellite': 'Ahmedabad', 'navrangpura': 'Ahmedabad', 'cg road': 'Ahmedabad',
        'prahladnagar': 'Ahmedabad',
        // Kerala
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
        'mcleod ganj': 'McLeod Ganj', 'dharamsala upper': 'Dharmshala',
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
        'ooty city': 'Udagamandalam',
        // Andaman Islands
        'havelock island': 'Swaraj Dweep', 'neil island': 'Port Blair',
        // Andhra Pradesh
        'vizag beach': 'Visakhapatnam', 'rushikonda': 'Visakhapatnam',
        // Udaipur extras - already added above
        // Kolkata extras
        'esplanade kolkata': 'Kalkutta', 'college street': 'Kalkutta',
        // North East India
        'gangtok mg road': 'Gangtok', 'rumtek': 'Gangtok',
        'shillong police bazaar': 'Shillong',
        'kaziranga': 'Jorhat',
        // Mumbai — more neighborhoods
        'santacruz': 'Mumbai', 'khar': 'Mumbai', 'bandra west': 'Mumbai', 'bandra east': 'Mumbai',
        'parel': 'Mumbai', 'curry road': 'Mumbai', 'elphinstone road': 'Mumbai',
        'mulund': 'Mumbai', 'ghatkopar': 'Mumbai', 'vikhroli': 'Mumbai', 'kurla': 'Mumbai',
        'mankhurd': 'Mumbai', 'govandi': 'Mumbai', 'chunabhatti': 'Mumbai',
        'kalyan': 'Mumbai', 'dombivli': 'Mumbai', 'thane west': 'Thane',
        'nariman point': 'Mumbai', 'ballard estate': 'Mumbai', 'cuffe parade': 'Mumbai',
        'charni road': 'Mumbai', 'grant road': 'Mumbai', 'marine drive': 'Mumbai',
        'juhu beach': 'Mumbai', 'lokhandwala': 'Mumbai', 'four bungalows': 'Mumbai',
        // Delhi — more neighborhoods
        'aerocity': 'New Delhi', 'mahipalpur': 'New Delhi', 'chandni chowk': 'New Delhi',
        'red fort': 'New Delhi', 'lal qila': 'New Delhi', 'jama masjid': 'New Delhi',
        'dilli haat': 'New Delhi', 'sarojini nagar': 'New Delhi', 'patel nagar': 'New Delhi',
        'moti nagar': 'New Delhi', 'rajendra place': 'New Delhi', 'model town delhi': 'New Delhi',
        'ashok vihar': 'New Delhi', 'kalkaji': 'New Delhi', 'govindpuri': 'New Delhi',
        'shahdara': 'New Delhi', 'krishna nagar': 'New Delhi', 'mayur vihar': 'New Delhi',
        'faridabad': 'Faridabad', 'ghaziabad': 'Ghaziabad', 'greater noida': 'Greater Noida',
        // Bangalore — more neighborhoods
        'ulsoor': 'Bengaluru', 'frazer town': 'Bengaluru', 'richmond town': 'Bengaluru',
        'domlur': 'Bengaluru', 'trinity bangalore': 'Bengaluru', 'cambridge layout': 'Bengaluru',
        'banashankari': 'Bengaluru', 'silk board': 'Bengaluru', 'kr puram': 'Bengaluru',
        'rajajinagar': 'Bengaluru', 'nagarbhavi': 'Bengaluru', 'bannerghatta': 'Bengaluru',
        'ramamurthy nagar': 'Bengaluru', 'hoodi': 'Bengaluru',
        // Chennai — more neighborhoods
        'besant nagar': 'Chennai', 'thiruvanmiyur': 'Chennai', 'sholinganallur': 'Chennai',
        'perungudi': 'Chennai', 'porur': 'Chennai', 'anna salai': 'Chennai',
        'mount road': 'Chennai', 'george town chennai': 'Chennai', 'royapettah': 'Chennai',
        'kilpauk': 'Chennai', 'tambaram': 'Chennai', 'chrompet': 'Chennai',
        'koyambedu': 'Chennai', 'poonamallee': 'Chennai', 'ambattur': 'Chennai',
        // Hyderabad — more neighborhoods
        'charminar': 'Hyderabad', 'old city hyderabad': 'Hyderabad', 'tolichowki': 'Hyderabad',
        'mehdipatnam': 'Hyderabad', 'malakpet': 'Hyderabad', 'khairatabad': 'Hyderabad',
        'somajiguda': 'Hyderabad', 'nanakramguda': 'Hyderabad', 'miyapur': 'Hyderabad',
        'lingampally': 'Hyderabad', 'financial district hyderabad': 'Hyderabad',
        // Pune — more neighborhoods
        'camp pune': 'Pune', 'deccan pune': 'Pune', 'katraj': 'Pune', 'kondhwa': 'Pune',
        'magarpatta': 'Pune', 'nibm': 'Pune', 'wanowrie': 'Pune', 'bavdhan': 'Pune',
        'balewadi': 'Pune', 'chinchwad': 'Pune', 'pimpri': 'Pune', 'akurdi': 'Pune',
        // Goa — more beaches/areas
        'assagao': 'Calangute', 'siolim': 'Vagator', 'arpora': 'Calangute', 'north goa': 'Calangute',
        'south goa': 'Süd-Goa', 'betalbatim': 'Süd-Goa', 'majorda': 'Süd-Goa', 'arossim': 'Süd-Goa',
        'dona paula': 'Panaji', 'campal': 'Panaji', 'vasco da gama': 'Süd-Goa', 'bogmalo': 'Süd-Goa',
        'margao': 'Süd-Goa', 'curca': 'Panaji',
        // Kolkata — more neighborhoods
        'jadavpur': 'Kalkutta', 'tollygunge': 'Kalkutta', 'dhakuria': 'Kalkutta',
        'gariahat': 'Kalkutta', 'alipore': 'Kalkutta', 'elgin kolkata': 'Kalkutta',
        'dum dum': 'Kalkutta', 'shyambazar': 'Kalkutta', 'ultadanga': 'Kalkutta',
        'bidhannagar': 'Kalkutta', 'new alipore': 'Kalkutta', 'barrackpore': 'Kalkutta',
        // Ahmedabad — more neighborhoods
        'vastrapur': 'Ahmedabad', 'bodakdev': 'Ahmedabad', 'drive in ahmedabad': 'Ahmedabad',
        'sarkhej': 'Ahmedabad', 'maninagar': 'Ahmedabad', 'chandkheda': 'Ahmedabad',
        'motera': 'Ahmedabad',
        // Kerala — more cities/areas
        'thiruvananthapuram': 'Thiruvananthapuram', 'trivandrum': 'Thiruvananthapuram',
        'ernakulam': 'Kochi', 'kakkanad': 'Kochi', 'edapally': 'Kochi',
        'thrissur': 'Thrissur', 'kozhikode': 'Kozhikode', 'calicut': 'Kozhikode',
        'malappuram': 'Malappuram', 'palakkad': 'Palakkad', 'kollam': 'Kollam',
        'kannur': 'Kannur', 'kasaragod': 'Kasaragod', 'wayanad': 'Kalpetta',
        'kalpetta': 'Kalpetta', 'kottayam': 'Kottayam',
        'munnar': 'Munnar', 'thekkady': 'Thekkady', 'periyar lake': 'Thekkady',
        'bekal': 'Kasaragod',
        // Tamil Nadu — more cities/areas
        'madurai': 'Madurai', 'madurai city': 'Madurai', 'meenakshi temple': 'Madurai',
        'thanjavur': 'Thanjavur', 'tanjore': 'Thanjavur', 'brihadeeswara': 'Thanjavur',
        'kanchipuram': 'Kanchipuram', 'mahabalipuram': 'Mahabalipuram', 'mammallapuram': 'Mahabalipuram',
        'rameswaram': 'Madurai', 'kanyakumari': 'Kanyakumari', 'tirunelveli': 'Tirunelveli',
        'coimbatore': 'Coimbatore', 'tiruchirapalli': 'Trichy', 'trichy': 'Trichy',
        'tiruppur': 'Coimbatore', 'erode': 'Erode', 'salem': 'Salem', 'vellore': 'Vellore',
        'tiruvannamalai': 'Tiruvannamalai', 'chidambaram': 'Chidambaram',
        // Andhra Pradesh
        'tirupati': 'Tirupati', 'tirumala': 'Tirupati', 'tirupati temple': 'Tirupati',
        'vijayawada': 'Vijayawãda', 'guntur': 'Guntur', 'nellore': 'Nellore',
        'kakinada': 'Kakinada', 'rajahmundry': 'Rajahmundry', 'kurnool': 'Kurnool',
        // Odisha
        'bhubaneswar': 'Bhubaneshwar', 'puri beach': 'Puri', 'puri jagannath': 'Puri',
        'konark': 'Konark', 'konark sun temple': 'Konark', 'chilika lake': 'Bhubaneshwar',
        // Madhya Pradesh
        'bhopal': 'Bhopal', 'bhopal city': 'Bhopal', 'indore': 'Indore', 'indore city': 'Indore',
        'khajuraho': 'Khajurãho', 'khajuraho temples': 'Khajurãho',
        'orchha': 'Orchha', 'orchha fort': 'Orchha', 'ujjain': 'Ujjain',
        'mahakal ujjain': 'Ujjain', 'gwalior': 'Gwalior', 'gwalior fort': 'Gwalior',
        'pachmarhi': 'Pachmarhi', 'jabalpur': 'Jabalpur',
        // Bihar / Jharkhand
        'patna': 'Patna', 'patna city': 'Patna', 'bodh gaya': 'Bodh Gaya',
        'rajgir': 'Rajgir', 'nalanda': 'Rajgir', 'vaishali': 'Vaishali',
        'ranchi': 'Ranchi', 'jamshedpur': 'Jamshedpur',
        // Gujarat — more cities/areas
        'surat': 'Surat', 'surat city': 'Surat', 'vadodara': 'Vadodara', 'baroda': 'Vadodara',
        'rajkot': 'Rajkot', 'bhuj': 'Bhuj', 'rann of kutch': 'Bhuj', 'great rann': 'Bhuj',
        'white rann': 'Bhuj', 'gir forest': 'Shapar - Veraval', 'junagadh': 'Shapar - Veraval',
        'somnath temple': 'Shapar - Veraval', 'veraval': 'Shapar - Veraval', 'dwarka gujarat': 'Dvaraka',
        'diu island': 'Diu', 'anand': 'Anand', 'gandhinagar': 'Gandhinagar',
        // Maharashtra — more cities
        'nashik': 'Nashik', 'nashik city': 'Nashik', 'shirdi': 'Shirdi',
        'nagpur': 'Nagpur', 'nagpur city': 'Nagpur', 'aurangabad': 'Aurangabad',
        'ajanta caves': 'Aurangabad', 'ellora caves': 'Aurangabad',
        'lonavala': 'Lonavala', 'khandala': 'Lonavala', 'mahabaleshwar': 'Mahabaleshwar',
        'panchgani': 'Panchgani', 'matheran': 'Matheran', 'igatpuri': 'Igatpuri',
        'kolhapur': 'Kolhapur', 'solapur': 'Solapur', 'satara': 'Satara',
        // Rajasthan — more cities/areas
        'bikaner': 'Bikaner', 'bikaner old city': 'Bikaner',
        'ajmer': 'Ajmer', 'dargah sharif': 'Ajmer', 'pushkar fair': 'Pushkar',
        'alwar': 'Alwar', 'bundi': 'Bundi', 'chittorgarh': 'Chittorgarh',
        'kumbhalgarh': 'Kumbhalgarh (Festung)', 'ranakpur': 'Ranakpur', 'mandawa': 'Mandawa',
        'ranthambore': 'Sawai Madhopur', 'sawai madhopur': 'Sawai Madhopur',
        'barmer': 'Barmer', 'shekhawati': 'Mandawa', 'nawalgarh': 'Nawalgarh',
        // Himachal Pradesh — more areas
        'kasol': 'Kasol', 'kheerganga': 'Kasol', 'manikaran': 'Kasol',
        'bir billing': 'Bir', 'bir himachal': 'Bir',
        'dalhousie': 'Chamba', 'chamba': 'Chamba', 'khajjiar': 'Chamba',
        'spiti valley': 'Kaza', 'kaza': 'Kaza', 'key monastery': 'Kaza', 'pin valley': 'Kaza',
        'narkanda': 'Rampur', 'kinnaur': 'Rampur', 'sangla valley': 'Rampur',
        // Uttarakhand — more areas
        'mussoorie': 'Mussoorie', 'mussoorie city': 'Mussoorie',
        'nainital': 'Nainital', 'nainital lake': 'Nainital',
        'dehradun': 'Dehradun', 'dehradun city': 'Dehradun',
        'corbett': 'Ramnagar', 'jim corbett': 'Ramnagar', 'ramnagar': 'Ramnagar',
        'auli': 'Badrinath', 'joshimath': 'Badrinath', 'badrinath': 'Badrinath',
        'kedarnath': 'Rishikesh', 'gangotri': 'Uttarkashi', 'yamunotri': 'Uttarkashi',
        'lansdowne': 'Rishikesh', 'chopta': 'Rishikesh', 'tungnath': 'Rishikesh',
        'munsiyari': 'Pithoragarh', 'pithoragarh': 'Pithoragarh',
        // Chandigarh / Punjab / Haryana
        'chandigarh': 'Chandigarh', 'sector 17': 'Chandigarh', 'sector 35': 'Chandigarh',
        'ludhiana': 'Ludhiana', 'patiala': 'Patiala', 'bathinda': 'Ludhiana',
        'ambala': 'Ambala', 'kurukshetra': 'Ambala',
        // Jammu & Kashmir
        'gulmarg': 'Gulmarg', 'pahalgam': 'Pahalgam', 'sonamarg': 'Sonamarg',
        'jammu city': 'Jammu', 'vaishno devi': 'Jammu',
        // North East India — expanded
        'gangtok city': 'Gangtok', 'mangan': 'Gangtok',
        'guwahati': 'Guwahãti', 'dispur': 'Guwahãti', 'paltan bazaar': 'Guwahãti',
        'majuli': 'Jorhat', 'sivasagar': 'Jorhat', 'dibrugarh': 'Dibrugarh',
        'shillong city': 'Shillong', 'cherrapunji': 'Cherrapunji (Sohra)', 'mawlynnong': 'Cherrapunji (Sohra)',
        'aizawl': 'Aizawl', 'imphal': 'Imphal', 'kohima': 'Kohima',
        'agartala': 'Agartala', 'itanagar': 'Itanagar',
        // Karnataka — more areas
        'chikmagalur': 'Hassan', 'sakleshpur': 'Hassan',
        'badami': 'Badami', 'aihole': 'Badami', 'pattadakal': 'Badami',
        'bidar': 'Bidar', 'gulbarga': 'Gulbarga', 'vijayapura': 'Gulbarga',
        'mysuru': 'Mysore', 'mysuru city': 'Mysore',
        'udupi': 'Udupi', 'manipal': 'Udupi', 'mangalore': 'Mangalore',
        'dakshina kannada': 'Mangalore', 'belagavi': 'Gulbarga',
        // Andaman & Lakshadweep
        'radhanagar beach': 'Port Blair', 'baratang': 'Port Blair',
        'bangaram': 'Port Blair', 'agatti': 'Port Blair',
        // Assam — wildlife
        'manas national park': 'Guwahãti', 'dibru saikhowa': 'Dibrugarh',
        // More Kerala
        'varkala': 'Varkala', 'varkala cliff': 'Varkala',
        'guruvayur': 'Thrissur', 'thrissur pooram': 'Thrissur',
        'alappuzha': 'Alappuzha', 'kumarakom': 'Kottayam',
        'vagamon': 'Kottayam', 'ponmudi': 'Thiruvananthapuram',
        'kovalam beach': 'Thiruvananthapuram',
        // More Tamil Nadu
        'kodaikanal': 'Madurai', 'yercaud': 'Salem',
        'valparai': 'Coimbatore', 'udhagamandalam': 'Udagamandalam',
        'velankanni': 'Velankanni', 'nagapattinam': 'Nagapattinam',
        'tiruchendur': 'Tiruchendur', 'kumbakonam': 'Kumbakonam',
        'swamimalai': 'Kumbakonam', 'chidambaram temple': 'Chidambaram',
        'yelagiri': 'Tirupattur', 'hogenakkal': 'Salem',
        // More Karnataka
        'hampi': 'Hospet',
        'gokarna': 'Gokarna', 'karwar': 'Karwar', 'murudeshwar': 'Bhatkal',
        'kudremukh': 'Hassan', 'coorg': 'Madikeri', 'kodagu': 'Madikeri',
        'wayanad karnataka': 'Kalpetta',
        'shravanabelagola': 'Hassan', 'belur hassan': 'Hassan', 'halebidu': 'Hassan',
        'dandeli': 'Karwar', 'sirsi': 'Sirsi',
        // More Goa
        'vagator': 'Vagator', 'arambol': 'Vagator', 'morjim': 'Vagator',
        'baga': 'Baga', 'calangute': 'Calangute', 'candolim': 'Calangute',
        'querim': 'Vagator', 'terekhol': 'Vagator',
        'anjuna': 'Anjuna', 'anjuna beach': 'Anjuna',
        // More Maharashtra
        'tarkarli': 'Malvan', 'malvan': 'Malvan', 'sindhudurg': 'Malvan',
        'alibaug': 'Alibaug', 'murud': 'Alibaug',
        'nashik wineries': 'Nashik', 'sula vineyards': 'Nashik',
        'shirdi temple': 'Shirdi', 'bhimashankar': 'Pune',
        // More Rajasthan
        'bharatpur': 'Bharatpur', 'keoladeo': 'Bharatpur',
        'bundi fort': 'Bundi', 'tonk rajasthan': 'Jaipur',
        'phalodi': 'Jodhpur', 'khimsar': 'Jodhpur',
        'deogarh': 'Deogarh',
        // More Gujarat
        'porbandar': 'Porbandar', 'morbi': 'Morbi',
        'surendranagar': 'Surendranagar', 'bhavnagar': 'Bhavnagar',
        'palitana': 'Bhavnagar', 'diu': 'Diu',
        'patan gujarat': 'Patan', 'rani ki vav': 'Patan',
        'modhera': 'Mehsana', 'ambaji': 'Ambaji',
        // More Himachal
        'tirthan valley': 'Kullu', 'jibhi': 'Kullu',
        'barot': 'Manali', 'prashar lake': 'Manali',
        'kinnaur kailash': 'Rampur', 'kalpa': 'Rampur',
        'tabo monastery': 'Kaza', 'dhankar': 'Kaza',
        // More Uttarakhand
        'tehri lake': 'Tehri-Garhwal', 'tehri': 'Tehri-Garhwal',
        'chopta rhododendron': 'Rishikesh', 'deoria tal': 'Rishikesh',
        'kausani': 'Nainital', 'bageshwar': 'Bageshwar',
        'champawat': 'Nainital', 'almora': 'Almora',
        'ranikhet': 'Ranikhet',
        // More Bihar / Jharkhand
        'gaya city': 'Gaya', 'pawapuri': 'Bihar Sharif',
        'deoghar': 'Deoghar', 'dumka': 'Dhanbad',
        'hazaribagh': 'Hazaribagh', 'bokaro': 'Bokaro',
        // More North East
        'tawang': 'Tawang', 'bomdila': 'Tezpur',
        'ziro valley': 'Ziro', 'along': 'Jorhat',
        'silchar': 'Silchar', 'diphu': 'Tezpur',
        'ukhrul': 'Kohima', 'mon nagaland': 'Kohima',
        'champhai': 'Silchar', 'aizawl city': 'Silchar',
        // More Andhra / Telangana
        'srisailam': 'Nandyal', 'lepakshi': 'Bengaluru',
        'warangal': 'Hyderabad', 'nizamabad': 'Hyderabad',
        'khammam': 'Khammam',
        // Odisha extras
        'cuttack': 'Cuttack', 'berhampur': 'Puri',
        'sambalpur': 'Sambalpur', 'brahmapur': 'Puri',
        'koraput': 'Jagdalpur', 'jeypore odisha': 'Jeypore',
        // More Madhya Pradesh
        'sanchi': 'Bhopal', 'bandhavgarh': 'Umaria',
        'kanha': 'Mandla', 'pench': 'Seoni', 'panna': 'Panna',
        'amarkantak': 'Amarkantak',
        // Andaman extras
        'ross island andaman': 'Port Blair', 'north bay island': 'Port Blair',
        'baratang limestone': 'Port Blair',
        // Hindi language city names
        'मुंबई': 'Mumbai', 'दिल्ली': 'New Delhi', 'नई दिल्ली': 'New Delhi',
        'बेंगलुरु': 'Bengaluru', 'चेन्नई': 'Chennai', 'हैदराबाद': 'Hyderabad',
        'कोलकाता': 'Kalkutta', 'पुणे': 'Pune', 'अहमदाबाद': 'Ahmedabad',
        'जयपुर': 'Jaipur', 'वाराणसी': 'Varanasi', 'आगरा': 'Agra',
        'लखनऊ': 'Lucknow', 'कानपुर': 'Kanpur', 'नागपुर': 'Nagpur',
        'इंदौर': 'Indore', 'भोपाल': 'Bhopal', 'पटना': 'Patna',
        'सूरत': 'Surat', 'अमृतसर': 'Amritsar', 'गोवा': 'Süd-Goa',
        'vrindavan': 'Vrindāvan', 'vrindavan ghats': 'Vrindāvan', 'banke bihari': 'Vrindāvan',
        'mathura': 'Vrindāvan', 'mathura city': 'Vrindāvan',
        'ooty': 'Udagamandalam',
        'dwaraka': 'Dvaraka',
    },
    AU: {
        // Sydney
        'bondi': 'Sydney', 'bondi beach': 'Sydney', 'darling harbour': 'Sydney',
        'manly': 'Sydney', 'surry hills': 'Sydney', 'newtown': 'Sydney', 'newtown sydney': 'Sydney',
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
        'surfers paradise': 'Surfers Paradise', 'broadbeach': 'Gold Coast',
        'burleigh heads': 'Gold Coast', 'coolangatta': 'Gold Coast',
        'main beach': 'Gold Coast',
        // Cairns / Tropical North
        'cairns esplanade': 'Cairns', 'palm cove': 'Cairns', 'port douglas': 'Port Douglas',
        // Other
        'manuka': 'Canberra', 'kingston canberra': 'Canberra',
        'darwin waterfront': 'Darwin',
        'hobart salamanca': 'Hobart',
        // Sydney extras
        'the rocks sydney': 'Sydney', 'barangaroo': 'Sydney', 'circular quay': 'Sydney',
        'balmoral beach': 'Sydney', 'dee why': 'Sydney', 'mona vale': 'Sydney',
        'collaroy': 'Sydney', 'narrabeen': 'Sydney', 'avalon': 'Sydney',
        'palm beach sydney': 'Sydney', 'hornsby': 'Sydney', 'epping': 'Sydney',
        'strathfield': 'Sydney', 'burwood': 'Sydney', 'ashfield': 'Sydney',
        'hurstville': 'Sydney', 'kogarah': 'Sydney', 'rockdale': 'Sydney',
        'penrith': 'Sydney', 'blacktown': 'Sydney', 'campbelltown': 'Sydney',
        'wollongong': 'Wollongong', 'newcastle nsw': 'Newcastle',
        'hunter valley': 'Cessnock', 'cessnock': 'Cessnock',
        'blue mountains': 'Katoomba', 'katoomba': 'Katoomba', 'leura': 'Katoomba',
        // Melbourne extras
        'yarra valley': 'Lilydale', 'healesville': 'Lilydale',
        'mornington peninsula': 'Melbourne', 'mornington': 'Melbourne', 'portsea': 'Melbourne',
        'geelong city': 'Geelong', 'point lonsdale': 'Geelong',
        'ballarat': 'Ballerat', 'bendigo': 'Bendigo',
        'frankston': 'Melbourne', 'dandenong': 'Mount Dandenong',
        // Brisbane extras
        'noosa heads': 'Noosa Heads', 'noosaville': 'Noosaville',
        'sunshine coast': 'Maroochydore', 'maroochydore': 'Maroochydore', 'mooloolaba': 'Maroochydore',
        'ipswich qld': 'Ipswich', 'toowoomba': 'Toowoomba', 'townsville': 'Townsville',
        // Perth extras
        'hillarys': 'Perth', 'joondalup': 'Perth', 'midland': 'Perth',
        'canning vale': 'Perth', 'armadale perth': 'Perth', 'mandurah': 'Mandurah',
        'margaret river': 'Margaret River',
        // Adelaide extras
        'port adelaide': 'Adelaide', 'henley beach': 'Adelaide', 'semaphore': 'Adelaide',
        'victor harbor': 'Victor Harbor', 'hahndorf': 'Hahndorf',
        'barossa valley': 'Tanunda', 'mclaren vale': 'Adelaide',
        // NT
        'alice springs': 'Alice Springs', 'uluru': 'Yulara', 'ayers rock': 'Yulara',
        // Tasmania
        'launceston city': 'Launceston', 'freycinet': 'Swansea', 'bicheno': 'Swansea',
        'cradle mountain': 'Cradle Mountain', 'port arthur': 'Port Arthur',
        // ACT
        'belconnen': 'Canberra', 'tuggeranong': 'Canberra', 'woden': 'Canberra',
        'gungahlin': 'Canberra',
        // Sydney more suburbs
        'balmoral sydney': 'Sydney', 'clifton gardens': 'Sydney', 'cremorne': 'Sydney',
        'kirribilli': 'Sydney', 'waverton': 'Sydney', 'wollstonecraft': 'Sydney',
        'st leonards': 'Sydney', 'artarmon': 'Sydney', 'willoughby': 'Sydney',
        'lane cove': 'Sydney', 'meadowbank': 'Sydney', 'ermington': 'Sydney',
        'eastwood sydney': 'Sydney', 'granville': 'Sydney', 'auburn sydney': 'Sydney',
        'bankstown': 'Sydney', 'lakemba': 'Sydney', 'campsie': 'Sydney',
        'bexley': 'Sydney', 'beverly hills sydney': 'Sydney', 'penshurst': 'Sydney',
        'miranda': 'Sydney', 'caringbah': 'Sydney', 'gymea': 'Sydney',
        'kirrawee': 'Sydney', 'jannali': 'Sydney', 'heathcote sydney': 'Sydney',
        'ingleburn': 'Sydney', 'minto': 'Sydney', 'macquarie fields': 'Sydney',
        'liverpool sydney': 'Sydney', 'fairfield': 'Sydney', 'cabramatta': 'Sydney',
        'carnes hill': 'Sydney', 'bondi junction': 'Sydney', 'edgecliff': 'Sydney',
        'elizabeth bay': 'Sydney', 'rushcutters bay': 'Sydney', 'cremorne point': 'Sydney',
        'milsons point': 'Sydney', 'lavender bay': 'Sydney', 'mcmahons point': 'Sydney',
        // Melbourne more suburbs
        'east melbourne': 'Melbourne', 'abbotsford': 'Melbourne', 'clifton hill': 'Melbourne',
        'fitzroy north': 'Melbourne', 'parkville': 'Melbourne', 'princes hill': 'Melbourne',
        'kensington melbourne': 'Melbourne', 'flemington': 'Melbourne',
        'moonee ponds': 'Melbourne', 'essendon': 'Melbourne', 'tullamarine': 'Melbourne',
        'coburg': 'Melbourne', 'fawkner': 'Melbourne', 'pascoe vale': 'Melbourne',
        'reservoir': 'Melbourne', 'heidelberg': 'Melbourne', 'ivanhoe': 'Melbourne',
        'doncaster': 'Melbourne', 'templestowe': 'Melbourne', 'ringwood': 'Melbourne',
        'croydon melbourne': 'Melbourne', 'montrose': 'Melbourne',
        'mount evelyn': 'Melbourne', 'lilydale': 'Melbourne',
        'glen eira': 'Melbourne', 'bentleigh': 'Melbourne', 'cheltenham': 'Melbourne',
        'moorabbin': 'Melbourne', 'oakleigh': 'Melbourne', 'clayton': 'Melbourne',
        'springvale': 'Melbourne', 'noble park': 'Melbourne', 'keysborough': 'Melbourne',
        'hallam': 'Melbourne', 'narre warren': 'Melbourne', 'berwick': 'Melbourne',
        'pakenham': 'Melbourne', 'cranbourne': 'Melbourne',
        'williamstown': 'Melbourne', 'newport': 'Melbourne', 'altona': 'Melbourne',
        'laverton': 'Melbourne', 'hoppers crossing': 'Melbourne', 'werribee': 'Melbourne',
        'sunbury': 'Melbourne', 'melton': 'Melbourne', 'bacchus marsh': 'Melbourne',
        // Brisbane more suburbs
        'toowong': 'Brisbane', 'auchenflower': 'Brisbane', 'st lucia': 'Brisbane',
        'indooroopilly': 'Brisbane', 'kenmore': 'Brisbane', 'fig tree pocket': 'Brisbane',
        'chapel hill brisbane': 'Brisbane', 'taringa': 'Brisbane',
        'woolloongabba': 'Brisbane', 'east brisbane': 'Brisbane',
        'hawthorne brisbane': 'Brisbane', 'balmoral brisbane': 'Brisbane',
        'morningside': 'Brisbane', 'seven hills brisbane': 'Brisbane',
        'coorparoo': 'Brisbane', 'camp hill': 'Brisbane', 'greenslopes': 'Brisbane',
        'stones corner': 'Brisbane', 'kangaroo point': 'Brisbane',
        'teneriffe brisbane': 'Brisbane', 'newstead brisbane': 'Brisbane',
        'bowen hills': 'Brisbane', 'herston': 'Brisbane', 'kelvin grove': 'Brisbane',
        'red hill brisbane': 'Brisbane', 'ashgrove': 'Brisbane', 'the gap brisbane': 'Brisbane',
        'gaythorne': 'Brisbane', 'alderley': 'Brisbane', 'stafford': 'Brisbane',
        'chermside': 'Brisbane', 'nundah': 'Brisbane', 'northgate': 'Brisbane',
        'hendra': 'Brisbane', 'ascot brisbane': 'Brisbane', 'hamilton brisbane': 'Brisbane',
        // Perth more suburbs
        'claremont': 'Perth', 'nedlands': 'Perth', 'crawley': 'Perth',
        'shenton park': 'Perth', 'floreat': 'Perth', 'wembley': 'Perth',
        'osborne park': 'Perth', 'stirling': 'Perth', 'karrinyup': 'Perth',
        'balcatta': 'Perth', 'innaloo': 'Perth', 'mirrabooka': 'Perth',
        'dianella': 'Perth', 'morley': 'Perth', 'beechboro': 'Perth',
        'ellenbrook': 'Perth', 'swan valley': 'Perth',
        'cottesloe perth': 'Perth', 'claremont perth': 'Perth',
        'south perth': 'Perth', 'como': 'Perth', 'south fremantle': 'Perth',
        'hamilton hill': 'Perth', 'spearwood': 'Perth', 'coogee perth': 'Perth',
        'rockingham': 'Rockingham', 'secret harbour': 'Rockingham',
        'baldivis': 'Rockingham', 'warnbro': 'Rockingham',
        // Adelaide more suburbs
        'north adelaide': 'Adelaide', 'parkside': 'Adelaide', 'dulwich': 'Adelaide',
        'burnside': 'Adelaide', 'toorak gardens': 'Adelaide',
        'rose park': 'Adelaide', 'eastwood': 'Adelaide', 'beulah park': 'Adelaide',
        'kent town': 'Adelaide', 'hackney': 'Adelaide', 'marden': 'Adelaide',
        'campbelltown adelaide': 'Adelaide', 'newton': 'Adelaide', 'rostrevor': 'Adelaide',
        'torrensville': 'Adelaide', 'thebarton': 'Adelaide', 'hindmarsh': 'Adelaide',
        'bowden': 'Adelaide', 'brompton': 'Adelaide', 'mansfield park': 'Adelaide',
        'woodville': 'Adelaide', 'cheltenham adelaide': 'Adelaide',
        'golden grove': 'Adelaide', 'tea tree gully': 'Adelaide',
        'modbury': 'Adelaide', 'para hills': 'Adelaide',
        'aberfoyle park': 'Adelaide', 'flagstaff hill': 'Adelaide',
        'hallett cove': 'Adelaide', 'marino': 'Adelaide',
        // Gold Coast extras
        'miami gold coast': 'Gold Coast', 'mermaid beach': 'Gold Coast',
        'mermaid waters': 'Gold Coast', 'nobby beach': 'Gold Coast',
        'palm beach qld': 'Gold Coast', 'tugun': 'Gold Coast',
        'bilinga': 'Gold Coast', 'currumbin': 'Gold Coast',
        'tallebudgera': 'Gold Coast', 'elanora': 'Gold Coast',
        'southport': 'Gold Coast', 'labrador': 'Gold Coast',
        'biggera waters': 'Gold Coast', 'runaway bay': 'Gold Coast',
        'paradise point': 'Gold Coast', 'hollywell': 'Gold Coast',
        'helensvale': 'Gold Coast', 'coomera': 'Gold Coast',
        'oxenford': 'Gold Coast', 'hope island': 'Gold Coast',
        'sanctuary cove': 'Gold Coast', 'upper coomera': 'Gold Coast',
        // Cairns extras
        'smithfield cairns': 'Cairns', 'machans beach': 'Cairns',
        'holloways beach': 'Cairns', 'yorkeys knob': 'Cairns',
        'trinity beach': 'Cairns', 'clifton beach': 'Cairns',
        'kewarra beach': 'Cairns', 'ellis beach': 'Cairns',
        'kuranda': 'Cairns', 'mission beach': 'Mission Beach',
        'daintree rainforest': 'Cairns', 'cape tribulation': 'Cairns',
        // Darwin extras
        'palmerston': 'Darwin', 'casuarina': 'Darwin', 'nightcliff': 'Darwin',
        'parap': 'Darwin', 'fannie bay': 'Darwin', 'larrakeyah': 'Darwin',
        'stuart park': 'Darwin', 'cullen bay': 'Darwin',
        // Hobart extras
        'battery point': 'Hobart', 'sandy bay': 'Hobart', 'south hobart': 'Hobart',
        'west hobart': 'Hobart', 'north hobart': 'Hobart',
        'new town hobart': 'Hobart', 'moonah': 'Hobart', 'glenorchy': 'Hobart',
        // Regional NSW
        'armidale nsw': 'Armidale', 'tamworth nsw': 'Tamworth',
        'dubbo': 'Dubbo', 'orange nsw': 'Orange', 'bathurst nsw': 'Bathurst',
        'albury': 'Albury', 'wagga wagga': 'Wagga Wagga',
        'broken hill': 'Broken Hill', 'griffith nsw': 'Griffith',
        'coffs harbour': 'Coffs Harbour', 'grafton nsw': 'Grafton',
        'ballina nsw': 'Ballina', 'lismore': 'Lismore', 'byron bay': 'Byron Bay',
        'lennox head': 'Byron Bay', 'bangalow': 'Byron Bay',
        'port macquarie': 'Port Macquarie', 'kempsey': 'Port Macquarie',
        // Regional QLD
        'rockhampton': 'Rockhampton', 'emerald qld': 'Emerald',
        'bundaberg': 'Bundaberg', 'maryborough qld': 'Maryborough',
        'hervey bay': 'Hervey Bay', 'fraser island': 'Hervey Bay',
        'k gari': 'Hervey Bay', 'mount isa': 'Mount Isa',
        'longreach': 'Longreach', 'barcaldine': 'Barcaldine',
        'airlie beach': 'Airlie Beach', 'proserpine': 'Airlie Beach',
        'bowen qld': 'Bowen', 'mackay': 'Mackay',
        // Regional VIC
        'shepparton': 'Shepparton', 'echuca': 'Echuca', 'wodonga': 'Albury',
        'warrnambool': 'Warrnambool', 'hamilton vic': 'Hamilton',
        'bairnsdale': 'Bairnsdale', 'sale vic': 'Sale',
        'morwell': 'Morwell', 'traralgon': 'Traralgon',
        // Regional SA
        'port lincoln': 'Port Lincoln', 'whyalla': 'Whyalla',
        'ceduna': 'Ceduna', 'mount gambier': 'Mount Gambier',
        'bordertown': 'Bordertown', 'port pirie': 'Port Pirie',
        'renmark': 'Renmark', 'berri': 'Berri',
        // Regional WA
        'broome': 'Broome', 'port hedland': 'Port Hedland',
        'karratha': 'Karratha', 'carnarvon wa': 'Carnarvon',
        'geraldton': 'Geraldton (und Umgebung)', 'kalgoorlie': 'Kalgoorlie',
        'esperance': 'Esperance', 'albany wa': 'Albany',
        'bunbury': 'Bunbury', 'busselton': 'Busselton',
        'dunsborough': 'Dunsborough', 'yallingup': 'Dunsborough',
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
        // Auckland extras
        'auckland cbd': 'Auckland', 'viaduct harbour': 'Auckland',
        'mission bay': 'Auckland', 'takapuna': 'Auckland', 'milford': 'Auckland',
        'henderson': 'Auckland', 'west auckland': 'Auckland', 'titirangi': 'Auckland',
        'manukau': 'Auckland', 'papakura': 'Auckland', 'botany': 'Auckland',
        'east tamaki': 'Auckland', 'pakuranga': 'Auckland',
        // Wellington extras
        'petone': 'Wellington', 'lower hutt': 'Wellington', 'upper hutt': 'Wellington',
        'porirua': 'Wellington', 'paraparaumu': 'Paraparaumu',
        // Christchurch extras
        'sumner': 'Christchurch', 'lyttelton': 'Christchurch', 'ferrymead': 'Christchurch',
        'burnside': 'Christchurch', 'harewood': 'Christchurch',
        // Queenstown extras
        'fernhill': 'Queenstown', 'sunshine bay': 'Queenstown',
        'gibbston valley': 'Queenstown', 'glenorchy': 'Queenstown',
        // Other NZ cities/areas
        'taupo': 'Taupo', 'lake taupo': 'Taupo', 'tarawera': 'Rotorua',
        'hamilton': 'Hamilton', 'tauranga': 'Tauranga', 'mount maunganui': 'Tauranga',
        'napier': 'Napier', 'hastings': 'Hastings', 'hawkes bay nz': 'Napier',
        'palmerston north': 'Palmerston North', 'whangarei': 'Whangarei',
        'nelson': 'Nelson', 'blenheim': 'Blenheim', 'marlborough': 'Blenheim',
        'kaikoura': 'Kaikoura', 'greymouth': 'Greymouth', 'hokitika': 'Hokitika',
        'milford sound': 'Te Anau', 'te anau': 'Te Anau',
        'invercargill': 'Invercargill', 'dunedin': 'Dunedin',
        'coromandel': 'Coromandel', 'hahei': 'Coromandel', 'whitianga': 'Coromandel',
        'bay of islands': 'Paihia', 'paihia': 'Paihia', 'russell nz': 'Paihia',
        // More Auckland suburbs
        'mt albert': 'Auckland', 'avondale auckland': 'Auckland', 'new lynn': 'Auckland',
        'glen eden': 'Auckland', 'swanson': 'Auckland', 'massey auckland': 'Auckland',
        'royal heights': 'Auckland', 'ranui': 'Auckland', 'waitakere': 'Auckland',
        'sunnyvale': 'Auckland', 'kelston': 'Auckland', 'blockhouse bay': 'Auckland',
        'lynfield': 'Auckland', 'hillsborough auckland': 'Auckland',
        'onehunga': 'Auckland', 'otahuhu': 'Auckland', 'mangere': 'Auckland',
        'mangere bridge': 'Auckland', 'favona': 'Auckland', 'clover park': 'Auckland',
        'flat bush': 'Auckland', 'dannemora': 'Auckland', 'howick': 'Auckland',
        'bucklands beach': 'Auckland', 'half moon bay': 'Auckland',
        'beachlands': 'Auckland', 'maraetai': 'Auckland',
        'glen innes': 'Auckland', 'tamaki': 'Auckland', 'panmure': 'Auckland',
        'ellerslie': 'Auckland', 'mt wellington': 'Auckland',
        'parnell auckland': 'Auckland', 'remuera': 'Auckland',
        'epsom': 'Auckland', 'one tree hill': 'Auckland', 'royal oak': 'Auckland',
        'hillpark': 'Auckland', 'manurewa': 'Auckland', 'clendon': 'Auckland',
        'weymouth': 'Auckland', 'wiri': 'Auckland', 'takanini': 'Auckland',
        'drury': 'Auckland', 'pukekohe': 'Auckland', 'tuakau': 'Auckland',
        // More Wellington suburbs
        'hataitai': 'Wellington', 'kilbirnie': 'Wellington', 'rongotai': 'Wellington',
        'miramar': 'Wellington', 'strathmore': 'Wellington', 'lyall bay': 'Wellington',
        'island bay': 'Wellington', 'brooklyn wellington': 'Wellington',
        'vogeltown': 'Wellington', 'berhampore': 'Wellington', 'central park wellington': 'Wellington',
        'aro valley': 'Wellington', 'mount cook wellington': 'Wellington',
        'mt victoria wellington': 'Wellington', 'oriental bay': 'Wellington',
        'roseneath': 'Wellington', 'eastbourne': 'Wellington',
        'days bay': 'Wellington', 'wainuiomata': 'Wellington',
        'naenae': 'Wellington', 'avalon wellington': 'Wellington',
        'waterloo wellington': 'Wellington', 'stokes valley': 'Wellington',
        'tawa': 'Wellington', 'grenada village': 'Wellington',
        // More Christchurch suburbs
        'papanui': 'Christchurch', 'papanui road': 'Christchurch',
        'strowan': 'Christchurch', 'fendalton': 'Christchurch', 'bryndwr': 'Christchurch',
        'ilam': 'Christchurch', 'bishopdale': 'Christchurch', 'redwood': 'Christchurch',
        'belfast': 'Christchurch', 'rangiora': 'Christchurch',
        'kaiapoi': 'Christchurch', 'pegasus': 'Christchurch', 'woodend': 'Christchurch',
        'rolleston': 'Christchurch', 'lincoln nz': 'Christchurch',
        'selwyn': 'Christchurch', 'halswell': 'Christchurch',
        'hillmorton': 'Christchurch', 'sockburn': 'Christchurch',
        'hornby': 'Christchurch', 'islington': 'Christchurch',
        'avonhead': 'Christchurch', 'upper riccarton': 'Christchurch',
        'wigram': 'Christchurch', 'addington': 'Christchurch',
        'sydenham': 'Christchurch', 'st martins': 'Christchurch',
        'cashmere': 'Christchurch', 'opawa': 'Christchurch',
        'woolston': 'Christchurch', 'linwood': 'Christchurch',
        'bromley': 'Christchurch', 'aranui': 'Christchurch',
        'new brighton': 'Christchurch', 'north beach christchurch': 'Christchurch',
        // More South Island towns
        'picton': 'Picton', 'havelock marlborough': 'Picton',
        'richmond nelson': 'Nelson', 'motueka': 'Nelson', 'takaka': 'Nelson',
        'golden bay': 'Nelson', 'abel tasman nz': 'Nelson',
        'wairau valley': 'Blenheim', 'renwick blenheim': 'Blenheim',
        'westport': 'Westport', 'punakaiki': 'Westport', 'pancake rocks': 'Westport',
        'karamea': 'Westport', 'reefton': 'Westport',
        'franz josef': 'Franz Josef', 'fox glacier': 'Fox Glacier',
        'wanaka': 'Wanaka', 'hawea': 'Wanaka', 'cromwell': 'Cromwell',
        'clyde': 'Cromwell', 'alexandra nz': 'Cromwell', 'roxburgh': 'Cromwell',
        'gore': 'Gore', 'winton': 'Invercargill', 'bluff': 'Invercargill',
        'stewart island': 'Oban', 'halfmoon bay': 'Half Moon Bay',
        'oban stewart island': 'Oban',
        'mosgiel': 'Dunedin', 'port chalmers': 'Dunedin', 'st clair dunedin': 'Dunedin',
        'st kilda dunedin': 'Dunedin', 'andersons bay': 'Dunedin',
        'south dunedin': 'Dunedin', 'balclutha': 'Balclutha',
        'oamaru': 'Oamaru', 'kurow': 'Oamaru',
        'timaru': 'Timaru', 'ashburton': 'Ashburton', 'methven': 'Methven',
        // North Island extras
        'cambridge nz': 'Cambridge', 'te awamutu': 'Te Awamutu',
        'morrinsville': 'Hamilton', 'te kuiti': 'Te Kuiti',
        'taumarunui': 'Taumarunui', 'ohakune': 'Ohakune',
        'taihape': 'Taihape', 'feilding': 'Palmerston North',
        'levin': 'Levin', 'otaki': 'Otaki',
        'foxton': 'Foxton', 'shannon': 'Palmerston North',
        'gisborne': 'Gisborne', 'opotiki': 'Tauranga', 'whakatane': 'Whakatane',
        'ohope beach': 'Whakatane', 'edgecumbe': 'Whakatane',
        'katikati': 'Tauranga', 'te puke': 'Tauranga', 'maketu': 'Tauranga',
        'waihi': 'Waihi', 'waihi beach': 'Waihi',
        'dargaville': 'Dargaville', 'kaiwaka': 'Whangarei',
        'wellsford': 'Wellsford', 'helensville': 'Helensville',
        'kerikeri': 'Kerikeri', 'kaitaia': 'Kaitaia', 'ahipara': 'Kaitaia',
        '90 mile beach': 'Kaitaia', 'cape reinga': 'Kaitaia',
        'whangaroa': 'Kerikeri', 'mangonui': 'Kerikeri',
    },
    // ── Philippines ────────────────────────────────────────────────────────────
    PH: {
        // Metro Manila — NCR catch-all
        'metro manila': 'Manila', 'ncr': 'Manila', 'national capital region': 'Manila', 'NCR' : 'Manila',
        // Makati — CBD and sub-villages
        'makati': 'Makati', 'makati cbd': 'Makati', 'makati city': 'Makati','MAKATI' : 'Makati',
        'rockwell': 'Makati', 'rockwell center': 'Makati','poblacion makati': 'Makati',
        'salcedo village': 'Makati', 'legaspi village': 'Makati', 'legazpi village': 'Makati',
        'bel-air': 'Makati', 'bel air makati': 'Makati', 'urdaneta village': 'Makati',
        'san antonio makati': 'Makati', 'ayala avenue': 'Makati', 'buendia': 'Makati',
        'chino roces': 'Makati', 'dela rosa makati': 'Makati', 'jupiter makati': 'Makati',
        'glorietta': 'Makati', 'greenbelt': 'Makati', 'ayala triangle': 'Makati',
        'circuit makati': 'Makati', 'merville': 'Makati',
        'forbes park': 'Makati', 'dasmarinas village': 'Dasmariñas Village', 'magallanes village': 'Makati',
        'san lorenzo village': 'Makati', 'guadalupe nuevo': 'Makati', 'guadalupe viejo': 'Makati',
        'bangkal': 'Makati', 'pio del pilar': 'Makati', 'olympia makati': 'Makati',
        'pembo': 'Makati', 'cembo': 'Makati', 'south cembo': 'Makati',
        'east rembo': 'Makati', 'west rembo': 'Makati', 'comembo': 'Makati',
        'palanan': 'Makati', 'tejeros': 'Makati', 'san isidro makati': 'Makati',
        'carmona makati': 'Makati', 'la paz makati': 'Makati', 'singkamas': 'Makati',
        'century city makati': 'Makati', 'rcbc plaza': 'Makati', 'century city mall': 'Makati',
        // BGC / Taguig
        'bgc': 'Taguig City', 'bonifacio global city': 'Taguig City', 'taguig': 'Taguig City',
        'fort bonifacio': 'Taguig City', 'the fort': 'Taguig City', 'bgc taguig': 'Taguig City',
        'high street': 'Taguig City', 'bonifacio high street': 'Taguig City',
        'uptown bonifacio': 'Taguig City', 'one bgc': 'Taguig City', 'net park': 'Taguig City',
        'north bonifacio': 'Taguig City', 'central bgc': 'Taguig City', 'western bicutan': 'Taguig City',
        'mckinley hill': 'Taguig City', 'mckinley west': 'Taguig City', 'c5 taguig': 'Taguig City',
        'south bonifacio': 'Taguig City', 'pinagsama': 'Taguig City', 'lower bicutan': 'Taguig City',
        'new lower bicutan': 'Taguig City', 'signal village': 'Taguig City',
        'katuparan': 'Taguig City', 'bagumbayan taguig': 'Taguig City', 'hagonoy taguig': 'Taguig City',
        'ususan': 'Taguig City', 'napindan': 'Taguig City', 'wawa taguig': 'Taguig City',
        'ibayo-tipas': 'Taguig City', 'bambang taguig': 'Taguig City', 'calzada taguig': 'Taguig City',
        'tuktukan': 'Taguig City', 'san miguel taguig': 'Taguig City',
        'mahogany place': 'Taguig City', 'venice grand canal': 'Taguig City',
        'market market bgc': 'Taguig City', 'sm aura': 'Taguig City', 'acacia estates': 'Taguig City',
        // Pasay / Bay Area / Entertainment City
        'pasay': 'Pasay', 'entertainment city': 'Pasay', 'mall of asia': 'Pasay',
        'moa area': 'Pasay', 'bay area manila': 'Pasay',
        'harbour square': 'Pasay', 'ccp complex': 'Pasay',
        'cultural center manila': 'Pasay', 'ccplex': 'Pasay',
        'solaire': 'Pasay', 'okada manila': 'Pasay',
        'city of dreams manila': 'Pasay', 'resorts world manila': 'Pasay',
        'newport city': 'Pasay', 'newport mall': 'Pasay',
        'paranaque integrated terminal': 'Pasay', 'pitx': 'Pasay',
        'malibay': 'Pasay', 'libertad pasay': 'Pasay', 'villamor airbase': 'Pasay',
        'naia area': 'Pasay', 'edsa taft': 'Pasay',
        // Manila city districts
        'intramuros': 'Manila', 'binondo': 'Manila', 'malate': 'Manila',
        'ermita': 'Manila', 'paco': 'Manila', 'pandacan': 'Manila',
        'sampaloc': 'Manila', 'santa ana': 'Manila', 'santa cruz': 'Manila',
        'tondo': 'Manila', 'port area': 'Manila', 'san miguel manila': 'Manila',
        'quiapo': 'Manila', 'chinatown manila': 'Manila', 'divisoria manila': 'Manila',
        'sta mesa': 'Manila', 'san andres manila': 'Manila',
        'malacañang': 'Manila', 'roxas boulevard': 'Manila',
        'san nicolas manila': 'Manila', 'gagalangin': 'Manila',
        'san andres bukid': 'Manila', 'north harbor manila': 'Manila',
        // Pateros
        'pateros': 'Manila', 'sta ana pateros': 'Manila',
        // Mandaluyong
        'mandaluyong': 'Mandaluyong', 'ortigas': 'Mandaluyong', 'ortigas center': 'Mandaluyong',
        'shaw': 'Mandaluyong', 'wack-wack': 'Mandaluyong', 'boni avenue': 'Mandaluyong',
        'pioneer mandaluyong': 'Mandaluyong', 'highway hills': 'Mandaluyong',
        'hulo': 'Mandaluyong', 'addition hills': 'Mandaluyong', 'barangka': 'Mandaluyong',
        'greenfield district': 'Mandaluyong', 'robinsons galleria': 'Mandaluyong',
        'plainview mandaluyong': 'Mandaluyong', 'mauway': 'Mandaluyong', 'vergara': 'Mandaluyong',
        // Pasig / Eastwood / Ortigas East
        'pasig': 'Pasig', 'eastwood': 'Pasig', 'kapitolyo': 'Pasig',
        'ugong': 'Pasig', 'bagong ilog': 'Pasig',
        'ortigas east': 'Pasig', 'bridgetowne': 'Pasig',
        'san joaquin pasig': 'Pasig', 'rosario pasig': 'Pasig',
        'c5 pasig': 'Pasig', 'valley golf': 'Pasig',
        'pineda pasig': 'Pasig', 'santa lucia pasig': 'Pasig', 'manggahan': 'Pasig',
        'maybunga': 'Pasig', 'dela paz pasig': 'Pasig', 'oranbo': 'Pasig',
        'kalawaan': 'Pasig', 'the 30th': 'Pasig', 'ayala malls the 30th': 'Pasig',
        // Quezon City
        'quezon city': 'Quezon City', 'cubao': 'Quezon City', 'diliman': 'Quezon City',
        'fairview': 'Quezon City', 'novaliches': 'Quezon City', 'commonwealth': 'Quezon City',
        'philcoa': 'Quezon City', 'kamuning': 'Quezon City', 'araneta': 'Quezon City',
        'timog': 'Quezon City', 'scout area': 'Quezon City', 'west triangle': 'Quezon City',
        'katipunan': 'Quezon City', 'up diliman': 'Quezon City',
        'new manila': 'Quezon City', 'project 4': 'Quezon City', 'batasan hills': 'Quezon City',
        'kamias': 'Quezon City', 'philam homes': 'Quezon City', 'holy spirit qc': 'Quezon City',
        'sikatuna village': 'Quezon City', 'greater lagro': 'Quezon City',
        'sm north edsa': 'Quezon City', 'east triangle': 'Quezon City',
        'quezon avenue': 'Quezon City', 'aurora blvd qc': 'Quezon City',
        'alimangga': 'Quezon City', 'krus na ligas': 'Quezon City',
        'libis': 'Quezon City', 'loyola heights': 'Quezon City',
        'project 2': 'Quezon City', 'project 3': 'Quezon City', 'project 6': 'Quezon City',
        'project 7': 'Quezon City', 'project 8': 'Quezon City',
        'san francisco del monte': 'Quezon City', 'tandang sora': 'Quezon City',
        'payatas': 'Quezon City', 'bago bantay': 'Quezon City',
        'teachers village': 'Quezon City', 'up campus': 'Quezon City',
        'camp crame': 'Quezon City', 'camp aguinaldo': 'Quezon City',
        'vertis north': 'Quezon City', 'trinoma': 'Quezon City', 'east avenue qc': 'Quezon City',
        'batasan complex': 'Quezon City', 'holy spirit': 'Quezon City', 'lagro': 'Quezon City',
        'pasong tamo qc': 'Quezon City', 'cloverleaf': 'Quezon City',
        // Marikina
        'marikina': 'Marikina', 'concepcion marikina': 'Marikina',
        'industrial valley': 'Marikina', 'shoe avenue': 'Marikina',
        'sto nino marikina': 'Marikina', 'parang marikina': 'Marikina',
        'calumpang marikina': 'Marikina', 'nangka marikina': 'Marikina',
        'san roque marikina': 'Marikina', 'fortune marikina': 'Marikina', 'malanday': 'Marikina',
        // San Juan
        'san juan': 'San Juan', 'greenhills': 'San Juan',
        'little baguio san juan': 'San Juan', 'salapan': 'San Juan',
        'pinaglabanan': 'San Juan', 'addition hills san juan': 'San Juan',
        // Parañaque
        'paranaque': 'Parañaque', 'bf resort': 'Parañaque', 'tambo paranaque': 'Parañaque',
        'la huerta': 'Parañaque', 'moonwalk': 'Parañaque', 'baclaran': 'Parañaque',
        'sucat': 'Parañaque', 'don bosco paranaque': 'Parañaque',
        'multinational village': 'Parañaque', 'bf homes paranaque': 'Parañaque',
        'sto nino paranaque': 'Parañaque', 'sun valley paranaque': 'Parañaque',
        'don galo': 'Parañaque', 'san dionisio paranaque': 'Parañaque',
        'bicutan': 'Parañaque', 'naia paranaque': 'Parañaque',
        // Las Piñas
        'las pinas': 'Las Piñas', 'bf homes': 'Las Piñas', 'pamplona': 'Las Piñas',
        'talon las pinas': 'Las Piñas', 'almanza': 'Las Piñas', 'alabang-zapote': 'Las Piñas',
        'zapote': 'Las Piñas', 'moonwalk las pinas': 'Las Piñas',
        'pilar village': 'Las Piñas', 'bf resort village': 'Las Piñas',
        // Muntinlupa / Alabang
        'muntinlupa': 'Muntinlupa', 'alabang': 'Muntinlupa', 'muntinlupa city': 'Muntinlupa',
        'filinvest city': 'Muntinlupa', 'festival alabang': 'Muntinlupa', 'festival mall': 'Muntinlupa',
        'northgate': 'Muntinlupa', 'northgate cyberzone': 'Muntinlupa',
        'ayala alabang': 'Muntinlupa', 'madrigal': 'Muntinlupa', 'madrigal business park': 'Muntinlupa',
        'alabang town center': 'Muntinlupa', 'westgate alabang': 'Muntinlupa',
        // Caloocan
        'caloocan': 'Caloocan', 'balintawak': 'Caloocan', 'monumento': 'Caloocan',
        'grace park': 'Caloocan', 'caloocan city': 'Caloocan',
        'camarin': 'Caloocan', 'bagumbong': 'Caloocan', 'bagong silang caloocan': 'Caloocan',
        'deparo': 'Caloocan', 'llano caloocan': 'Caloocan', 'maypajo': 'Caloocan',
        'sangandaan': 'Caloocan', 'bagong barrio caloocan': 'Caloocan',
        // Malabon / Navotas / Valenzuela
        'malabon': 'Malabon', 'navotas': 'Manila', 'valenzuela': 'Valenzuela',
        'paso de blas': 'Valenzuela', 'malinta': 'Valenzuela',
        'tonsuya': 'Malabon', 'potrero': 'Malabon', 'tinajeros': 'Malabon',
        'navotas fishport': 'Manila', 'san jose navotas': 'Manila',
        'marulas': 'Valenzuela', 'ugong valenzuela': 'Valenzuela', 'punturin': 'Valenzuela',
        'karuhatan': 'Valenzuela', 'lingunan': 'Valenzuela', 'canumay': 'Valenzuela',
        'dalandanan': 'Valenzuela', 'lawang bato': 'Valenzuela', 'mapulang lupa': 'Valenzuela',
        // Antipolo / Rizal province
        'antipolo': 'Antipolo', 'cainta': 'Antipolo', 'taytay rizal': 'Antipolo',
        'angono': 'Antipolo', 'binangonan': 'Antipolo',
        // Cebu
        'it park': 'Cebu', 'cebu it park': 'Cebu', 'lahug': 'Cebu',
        'ayala cebu': 'Cebu', 'cebu business park': 'Cebu',
        'colon cebu': 'Cebu', 'carbon cebu': 'Cebu',
        'mactan': 'Lapu Lapu', 'lapu-lapu': 'Lapu Lapu', 'lapu lapu': 'Lapu Lapu',
        'mandaue': 'Mandaue', 'sm seaside': 'Cebu',
        'ayala center cebu': 'Cebu', 'srp cebu': 'Cebu',
        'south road properties': 'Cebu', 'banilad': 'Cebu',
        'talamban': 'Cebu', 'talisay cebu': 'Cebu', 'mabolo': 'Cebu',
        'fuente osmena': 'Cebu', 'capitol cebu': 'Cebu',
        'consolacion cebu': 'Cebu', 'minglanilla': 'Cebu',
        'north reclamation cebu': 'Cebu', 'punta engano': 'Lapu Lapu',
        'guadalupe cebu': 'Cebu', 'punta princesa': 'Cebu', 'apas': 'Cebu',
        'kasambagan': 'Cebu', 'labangon': 'Cebu', 'tisa': 'Cebu',
        'bulacao': 'Cebu', 'mactan newtown': 'Lapu Lapu', 'basak cebu': 'Cebu',
        'kamputhaw': 'Cebu', 'hipodromo': 'Cebu', 'barrio luz': 'Cebu',
        'cogon ramos': 'Cebu', 'mambaling': 'Cebu', 'busay': 'Cebu',
        'maribago': 'Lapu Lapu', 'cordova cebu': 'Lapu Lapu', 'opon': 'Lapu Lapu',
        'mactan cebu airport area': 'Lapu Lapu', 'mandaue city': 'Mandaue',
        'lapu-lapu city': 'Lapu Lapu', 'cebu north': 'Cebu', 'cebu south': 'Cebu',
        // Davao
        'lanang': 'Davao', 'downtown davao': 'Davao',
        'toril': 'Davao', 'buhangin': 'Davao', 'matina': 'Davao',
        'ecoland': 'Davao', 'agdao': 'Davao', 'talomo': 'Davao',
        'samal': 'Samal', 'island garden city of samal': 'Samal',
        'igacos': 'Davao', 'pearl farm beach': 'Davao',
        'f. torres davao': 'Davao', 'davao del sur': 'Davao',
        'calinan': 'Davao', 'panacan': 'Davao', 'tibungco': 'Davao',
        'catalunan grande': 'Davao', 'mintal davao': 'Davao',
        'bago aplaya': 'Davao', 'lasang': 'Davao', 'ulas': 'Davao',
        'davao central': 'Davao', 'poblacion davao': 'Davao',
        'abreeza': 'Davao', 'sm lanang premier': 'Davao',
        // Clark / Angeles
        'clark': 'Angeles', 'clark freeport': 'Angeles', 'angeles city': 'Angeles',
        'clark pampanga': 'Angeles', 'mabalacat': 'Angeles', 'Clark' : 'Angeles',
        // Subic / Olongapo
        'subic': 'Olongapo', 'subic bay': 'Olongapo', 'olongapo city': 'Olongapo',
        'subic bay freeport': 'Olongapo', 'sbma': 'Olongapo',
        // Boracay
        'station 1': 'Boracay Island', 'station 2': 'Boracay Island', 'station 3': 'Boracay Island',
        'd mall': 'Boracay Island', 'diniwid': 'Boracay Island', 'bulabog': 'Boracay Island',
        'white beach boracay': 'Boracay Island', 'puka beach': 'Boracay Island',
        'yapak': 'Boracay Island', 'ilig-iligan': 'Boracay Island', 'aklan boracay': 'Boracay Island',
        'malay aklan': 'Boracay Island', 'caticlan': 'Boracay Island',
        // Palawan
        'el nido': 'El Nido', 'nacpan': 'El Nido', 'corong corong': 'El Nido',
        'lio beach': 'El Nido', 'las cabanas beach': 'El Nido',
        'coron': 'Coron', 'coron town': 'Coron', 'busuanga': 'Busuanga',
        'kayangan lake': 'Coron', 'basuanga': 'Busuanga',
        'underground river': 'Puerto Princesa', 'sabang palawan': 'Puerto Princesa',
        'honda bay': 'Bucht von Honda', 'port barton': 'Puerto Princesa',
        'san vicente palawan': 'Puerto Princesa',
        // Bohol
        'panglao': 'Panglao', 'alona beach': 'Panglao', 'chocolate hills': 'Tagbilaran',
        'loboc': 'Tagbilaran', 'baclayon': 'Tagbilaran', 'anda bohol': 'Tagbilaran',
        'tawala': 'Tawala', 'dauis': 'Dauis', 'doljo beach': 'Panglao',
        'danao bohol': 'Tagbilaran',
        // Siargao. The island's own name was missing while every sub-area had an
        // entry, so the one thing people actually type reached none of the 161
        // hotels the catalog files under General Luna.
        'siargao': 'General Luna', 'siargao island': 'General Luna',
        'cloud 9': 'General Luna', 'general luna siargao': 'General Luna',
        'union siargao': 'General Luna', 'pacifico': 'General Luna',
        'del carmen siargao': 'General Luna', 'burgos siargao': 'General Luna',
        'dapa': 'General Luna', 'pilar siargao': 'General Luna',
        // Iloilo
        'smallville': 'Iloilo', 'esplanade iloilo': 'Iloilo',
        'festive walk': 'Iloilo', 'jaro': 'Iloilo', 'molo': 'Iloilo',
        'mandurriao': 'Iloilo', 'city proper iloilo': 'Iloilo',
        'la paz iloilo': 'Iloilo', 'villa iloilo': 'Iloilo',
        'diversion road iloilo': 'Iloilo', 'pavia iloilo': 'Iloilo',
        // Bacolod
        'lacson': 'Bacolod', 'libertad bacolod': 'Bacolod',
        'downtown bacolod': 'Bacolod', 'mandalagan': 'Bacolod',
        'north drive bacolod': 'Bacolod',
        'capitol area bacolod': 'Bacolod', 'goldenfield bacolod': 'Bacolod',
        'bata bacolod': 'Bacolod', 'estefania': 'Bacolod',
        // Cagayan de Oro
        'limketkai': 'Cagayan de Oro', 'downtown cdo': 'Cagayan de Oro',
        'xavier estates': 'Cagayan de Oro', 'pueblo de oro': 'Cagayan de Oro',
        'divisoria cdo': 'Cagayan de Oro', 'carmen cdo': 'Cagayan de Oro',
        'cagayan de oro city': 'Cagayan de Oro',
        'bulua': 'Cagayan de Oro', 'gusa': 'Cagayan de Oro', 'lapasan': 'Cagayan de Oro',
        'macabalan': 'Cagayan de Oro', 'kauswagan cdo': 'Cagayan de Oro',
        // Tagaytay
        'tagaytay ridge': 'Tagaytay', 'taal vista': 'Tagaytay',
        'sky ranch tagaytay': 'Tagaytay', 'twin lakes tagaytay': 'Tagaytay',
        'antonio resort tagaytay': 'Tagaytay', 'picnic grove': 'Tagaytay',
        // Baguio
        'session road': 'Baguio', 'burnham park': 'Baguio', 'camp john hay': 'Baguio',
        'mines view park': 'Baguio', 'wright park': 'Baguio',
        'strawberry farm baguio': 'Baguio', 'military cut-off': 'Baguio',
        'upper session baguio': 'Baguio', 'baguio city': 'Baguio',
        'teachers camp baguio': 'Baguio', 'cabinet hill': 'Baguio',
        'aurora hill baguio': 'Baguio', 'scout barrio baguio': 'Baguio',
        // Batangas
        'anilao': 'Batangas', 'nasugbu': 'Batangas',
        'batangas city': 'Batangas', 'laiya': 'Batangas', 'calatagan': 'Batangas',
        'matabungkay': 'Batangas', 'lipa': 'Batangas',
        // Vigan / Ilocos
        'vigan': 'Vigan', 'vigan city': 'Vigan', 'calle crisologo': 'Vigan',
        'ilocos sur': 'Vigan',
        'laoag': 'Laoag', 'ilocos norte': 'Laoag',
        'pagudpud': 'Pagudpud', 'bangui windmills': 'Pagudpud', 'burgos ilocos': 'Laoag',
        // Dumaguete / Negros Oriental
        'dumaguete': 'Dumaguete', 'rizal boulevard dumaguete': 'Dumaguete',
        'dauin': 'Dauin', 'apo island': 'Dauin', 'silliman': 'Dumaguete',
        // Siquijor
        'siquijor': 'Siquijor', 'san juan siquijor': 'Siquijor', 'larena': 'Siquijor',
        // Leyte / Samar
        'tacloban': 'Tacloban', 'leyte': 'Tacloban', 'palo leyte': 'Tacloban',
        // Zamboanga
        'fort pilar': 'Zamboanga', 'zamboanga city': 'Zamboanga',
        // General Santos
        'general santos': 'General Santos', 'gen san': 'General Santos',
        'gensan': 'General Santos',
        // Sagada / Mountain Province
        'sagada': 'Sagada', 'mountain province': 'Sagada',
        // Camiguin
        'mambajao': 'Mambajao', 'camiguin': 'Mambajao', 'camiguin island': 'Mambajao',
        // Puerto Galera (Oriental Mindoro)
        'puerto galera': 'Puerto Galera', 'white beach puerto galera': 'Puerto Galera',
        'sabang beach': 'Puerto Galera', 'small la laguna': 'Puerto Galera',
        'big la laguna': 'Puerto Galera', 'talipanan': 'Puerto Galera',
        'aninuan': 'Puerto Galera', 'muelle puerto galera': 'Puerto Galera',
        // Mindoro (other areas)
        'calapan': 'Calapan', 'san jose mindoro': 'San Jose',
        // Bicol Region
        'legazpi city': 'Legazpi', 'legazpi albay': 'Legazpi', 'albay': 'Legazpi',
        'naga city': 'Naga', 'naga bicol': 'Naga',
        'donsol': 'Donsol', 'whale shark donsol': 'Donsol',
        'irosin': 'Sorsogon', 'sorsogon city': 'Sorsogon',
        'bulan': 'Sorsogon', 'matnog': 'Sorsogon',
        // Romblon / Sibuyan
        'romblon town': 'Romblon',
        // Marinduque
        'boac': 'Boac',
        // Batanes Islands
        'batan island': 'Basco', 'basco batanes': 'Basco', 'ivana': 'Basco',
        'sabtang': 'Basco',
        // Pampanga (beyond Clark/Angeles)
        'san fernando pampanga': 'San Fernando', 'mexico pampanga': 'San Fernando',
        // Zambales beaches
        'iba zambales': 'Iba', 'san antonio zambales': 'San Antonio',
        'pundaquit': 'San Antonio', 'anawangin': 'San Antonio',
        // Quezon province
        'lucena city': 'Lucena', 'pagbilao': 'Lucena',
        // Surigao / Caraga
        'surigao city': 'Surigao', 'siargao general luna': 'General Luna',
        'surigao del norte': 'Surigao',
        // Leyte additional
        'ormoc': 'Ormoc', 'naval biliran': 'Naval',
        // Agusan / Butuan
        'butuan city': 'Butuan',
        // Cagayan (Isabela)
        'tuguegarao city': 'Tuguegarao',
        // Pangasinan (Hundred Islands)
        'alaminos pangasinan': 'Alaminos', 'hundred islands': 'Alaminos',
        'dagupan': 'Dagupan',
        // La Union / Ilocos
        'san juan la union': 'San Juan', 'luna la union': 'San Juan',
        'urbiztondo': 'San Juan', 'surf beach la union': 'San Juan',
        'san fernando la union': 'San Fernando',
        // Benguet / Mountain Province extras
        'itogon': 'Baguio', 'la trinidad': 'Baguio',
        // Cordillera — Ifugao / Kalinga / Mountain Province
        'banaue': 'Banaue', 'banaue rice terraces': 'Banaue', 'batad': 'Banaue',
        'hapao': 'Banaue', 'hungduan': 'Banaue', 'kiangan': 'Banaue',
        // Mountain Province — capital is Bontoc, NOT Baguio
        'bontoc mountain province': 'Bontoc',
        // Kalinga Province — capital is Tabuk, NOT Baguio
        'tinglayan': 'Tabuk', 'kalinga tribe': 'Tabuk',
        'bangued': 'Bangued', 'abra province': 'Bangued',
        // Aklan province
        'kalibo': 'Kalibo', 'ati-atihan': 'Kalibo', 'kalibo airport area': 'Kalibo',
        // Capiz
        'roxas city capiz': 'Roxas City', 'capiz province': 'Roxas City',
        // Masbate
        'masbate city': 'Masbate', 'masbate island': 'Masbate',
        // Cebu Province (outside Cebu City)
        'moalboal': 'Moalboal', 'panagsama beach': 'Moalboal', 'pescador island': 'Moalboal',
        'oslob': 'Oslob', 'oslob whale shark watching': 'Oslob', 'sumilon island': 'Oslob',
        'badian': 'Badian', 'kawasan falls': 'Badian', 'canyoneering cebu': 'Badian',
        'dalaguete': 'Dalaguete', 'osmena peak': 'Dalaguete',
        'samboan': 'Samboan', 'alcoy cebu': 'Cebu', 'alegria cebu': 'Cebu',
        'santander cebu': 'Santander', 'liloan cebu': 'Liloan',
        'carcar cebu': 'Carcar', 'carcar heritage city': 'Carcar',
        'bantayan island': 'Bantayan', 'santa fe bantayan': 'Santa Fe', 'madridejos bantayan': 'Bantayan',
        'malapascua island': 'Cebu', 'daanbantayan': 'Daanbantayan',
        'camotes islands': 'Cebu', 'san francisco camotes': 'Cebu', 'poro camotes': 'Cebu',
        'toledo cebu': 'Cebu',
        'danao cebu': 'Danao',
        'naga cebu': 'Naga',
        'barili cebu': 'Cebu',
        'dumanjug cebu': 'Dumanjug',
        // Bohol extras
        'tubigon': 'Tubigon', 'ubay bohol': 'Tagbilaran',
        'inabanga': 'Tagbilaran', 'bien unido': 'Tagbilaran', 'danajon bank': 'Tagbilaran',
        'garcia hernandez': 'Garcia Hernandez', 'loay bohol': 'Tagbilaran',
        'jagna bohol': 'Jagna',
        // Palawan extras
        'taytay palawan': 'Taytay', 'apulit island': 'Taytay', 'flower island': 'Taytay',
        'balabac': 'Balabac', 'onuk island': 'Balabac', 'bugsuk island': 'Balabac',
        'culion': 'Culion', 'linapacan': 'Puerto Princesa',
        'roxas palawan': 'Roxas',
        'dumaran': 'Puerto Princesa', 'calauit island': 'Busuanga',
        // Negros Occidental
        'sipalay': 'Sipalay', 'sugar beach negros': 'Sipalay', 'punta ballo': 'Sipalay',
        'sagay negros': 'Bacolod', 'sagay marine reserve': 'Bacolod', 'carbin reef': 'Bacolod',
        'san carlos negros': 'San Carlos', 'cadiz negros occidental': 'Cadiz',
        'escalante city': 'Bacolod', 'manapla': 'Cadiz',
        // Negros Oriental extras
        'mabinay': 'Dumaguete', 'mabinay caves': 'Dumaguete',
        'bayawan': 'Bayawan', 'guihulngan': 'Guihulngan',
        // Leyte / Samar extras
        'maasin city': 'Maasin', 'maasin southern leyte': 'Maasin',
        'baybay leyte': 'Baybay', 'hilongos leyte': 'Hilongos', 'sogod leyte': 'Maasin',
        'catbalogan': 'Catbalogan', 'catbalogan city': 'Catbalogan',
        'calbayog': 'Calbayog', 'calbayog city': 'Calbayog',
        'borongan': 'Borongan', 'eastern samar': 'Borongan',
        'guiuan': 'Guiuan', 'homonhon island': 'Guiuan',
        'catarman northern samar': 'Catarman', 'northern samar': 'Catarman',
        'calbiga': 'Catbalogan',
        // More Mindanao
        'tagum': 'Tagum', 'tagum city': 'Tagum', 'davao del norte': 'Tagum',
        'digos': 'Digos', 'digos city': 'Digos',
        'panabo city': 'Panabo',
        'kidapawan': 'Kidapawan', 'cotabato province': 'Kidapawan',
        'mount apo kidapawan': 'Kidapawan',
        'cotabato city': 'Cotabato', 'sultan kudarat province': 'Cotabato',
        'koronadal': 'Koronadal', 'marbel koronadal': 'Koronadal',
        'south cotabato': 'Koronadal',
        'lake sebu': 'Lake Sebu', 'tboli': 'Lake Sebu', 'tnahon falls': 'Lake Sebu',
        'iligan': 'Iligan', 'iligan city': 'Iligan', 'lanao del norte': 'Iligan',
        'marawi': 'Iligan', 'lake lanao': 'Iligan',
        'dipolog': 'Dipolog', 'dipolog city': 'Dipolog', 'zamboanga del norte': 'Dipolog',
        'pagadian': 'Pagadian', 'pagadian city': 'Pagadian', 'zamboanga del sur': 'Pagadian',
        'ipil': 'Ipil', 'zamboanga sibugay': 'Ipil',
        'ozamiz': 'Ozamis City', 'ozamiz city': 'Ozamis City',
        'oroquieta': 'Oroquieta',
        'gingoog': 'Gingoog',
        'balingasag': 'Cagayan de Oro',
        // Luzon province additions
        'malolos': 'Malolos', 'malolos city bulacan': 'Malolos', 'bulacan province': 'Malolos',
        'balanga': 'Balanga', 'balanga bataan': 'Balanga', 'bagac bataan': 'Balanga',
        'mariveles bataan': 'Mariveles',
        'cabanatuan': 'Cabanatuan', 'nueva ecija': 'Cabanatuan',
        'tarlac city': 'Tarlac', 'tarlac province': 'Tarlac',
        'calamba laguna': 'Calamba', 'calamba city': 'Calamba',
        'los banos': 'Calamba', 'los baños': 'Calamba', 'uplb campus': 'Calamba',
        'bay laguna': 'Bay', 'calauan laguna': 'Calamba',
        'pagsanjan': 'Pagsanjan', 'pagsanjan falls': 'Pagsanjan',
        'sta cruz laguna': 'Santa Cruz', 'santa cruz laguna': 'Santa Cruz',
        'biñan': 'Calamba', 'binan laguna': 'Calamba',
        'santa rosa laguna': 'Santa Rosa',
        // Batangas extras
        'lipa city': 'Lipa', 'lipa batangas': 'Lipa', 'tanauan batangas': 'Tanauan',
        'san juan batangas': 'San Juan', 'laiya beach': 'Batangas',
        'calatagan beach': 'Calatagan', 'matabungkay beach': 'Batangas',
        // Quezon province extras
        'tayabas': 'Tayabas', 'sariaya': 'Lucena', 'gumaca quezon': 'Lucena',
        'atimonan': 'Lucena', 'infanta quezon': 'Infanta', 'real quezon': 'Real',
        'dingalan aurora': 'Dingalan',
        // More Surigao / Caraga
        'hinatuan enchanted river': 'Hinatuan', 'hinatuan surigao': 'Hinatuan',
        'dinagat islands': 'San Jose',
        // Agusan
        'prosperidad': 'Butuan', 'agusan del sur': 'Butuan',
        'bayugan': 'Butuan',
        // More Pampanga
        'angeles city pampanga': 'Angeles', 'porac pampanga': 'San Fernando',
        'floridablanca': 'San Fernando', 'guagua pampanga': 'San Fernando',
        // Mindoro extras
        'mamburao': 'Calapan', 'occidental mindoro': 'Calapan',
        // Aklan / Antique extras
        'tibiao antique': 'Roxas City', 'antique province': 'Roxas City',
        'san jose de buenavista': 'Roxas City',
        // Eastern Visayas extras
        'ormoc city': 'Ormoc', 'kananga leyte': 'Ormoc',
        // Marinduque extras
        'sta cruz marinduque': 'Boac', 'gasan marinduque': 'Boac',
        // Romblon extras
        'romblon island': 'Romblon',
        // MIMAROPA
        'calapan city': 'Calapan',
        // More Mindanao tourism
        'aliwagwag falls': 'Davao', 'eagle center davao': 'Davao',
        'sarangani province': 'Alabel', 'glan sarangani': 'General Santos',
        'lake holon': 'Lake Sebu', 'lake maughan': 'Lake Sebu',
        // More CDO / Misamis
        'jasaan misamis oriental': 'Cagayan de Oro', 'el salvador misamis': 'Cagayan de Oro',
        // North Cotabato
        'kabacan': 'Cotabato', 'magpet': 'Kidapawan',
        // Quezon City extra barangays
        'sta mesa heights': 'Quezon City', 'project 1': 'Quezon City', 'pinyahan': 'Quezon City',
        'duyan-duyan': 'Quezon City', 'obrero qc': 'Quezon City', 'claro qc': 'Quezon City',
        'kristong hari': 'Quezon City', 'laging handa': 'Quezon City', 'roxas district qc': 'Quezon City',
        'south triangle qc': 'Quezon City', 'pinagkaisahan': 'Quezon City', 'socorro qc': 'Quezon City',
        'bagumbuhay': 'Quezon City', 'marilag': 'Quezon City', 'masagana': 'Quezon City',
        'pansol qc': 'Quezon City', 'santol qc': 'Quezon City', 'ugong norte': 'Quezon City',
        'san bartolome': 'Quezon City', 'san agustin qc': 'Quezon City',
        // Taguig extra barangays
        'upper bicutan': 'Taguig City', 'western bicutan taguig': 'Taguig City',
        'fort bonifacio taguig': 'Taguig City', 'north daang hari': 'Taguig City',
        'south daang hari': 'Taguig City', 'palingon taguig': 'Taguig City',
        'sta ana taguig': 'Taguig City', 'san martin de porres taguig': 'Taguig City',
        // Parañaque extra barangays
        'san isidro paranaque': 'Parañaque', 'baclaran market': 'Parañaque',
        'tambo paranaque city': 'Parañaque', 'bf international': 'Parañaque',
        'santo nino paranaque': 'Parañaque',
        // Las Piñas extra barangays
        'elias aldana': 'Las Piñas', 'marcos alvarez': 'Las Piñas', 'manuyo uno': 'Las Piñas',
        'manuyo dos': 'Las Piñas', 'pulang lupa uno': 'Las Piñas', 'pulang lupa dos': 'Las Piñas',
        'talon uno': 'Las Piñas', 'talon dos': 'Las Piñas', 'talon tres': 'Las Piñas',
        'talon cuatro': 'Las Piñas', 'talon cinco': 'Las Piñas', 'cal-ipit': 'Las Piñas',
        'cathedral heights': 'Las Piñas', 'b.f. international village': 'Las Piñas',
        // Cavite (Manila metro fringe)
        'dasmarinas': 'Dasmarinas', 'dasmariñas': 'Dasmarinas', 'dasmarinas cavite': 'Dasmarinas',
        'bacoor': 'Bacoor', 'bacoor city': 'Bacoor', 'molino bacoor': 'Bacoor',
        'imus cavite': 'Imus', 'imus city': 'Imus',
        'kawit cavite': 'Bacoor', 'cavite city': 'Cavite',
        'trece martires': 'Trece Martires', 'general trias': 'General Trias',
        'tagaytay cavite': 'Tagaytay', 'silang cavite': 'Tagaytay',
        'indang cavite': 'Tagaytay',
        'naic cavite': 'Naic', 'tanza cavite': 'Tanza', 'rosario cavite': 'Rosario',
        'noveleta cavite': 'Noveleta', 'alfonso cavite': 'Alfonso',
        'amadeo cavite': 'Amadeo', 'carmona cavite': 'Silang',
        // Bulacan (north MM fringe)
        'meycauayan': 'Meycauayan', 'meycauayan city': 'Meycauayan',
        'san jose del monte': 'San Jose del Monte', 'sjdm': 'San Jose del Monte',
        'bocaue bulacan': 'Malolos', 'marilao bulacan': 'Marilao',
        'obando bulacan': 'Malolos', 'pandi bulacan': 'Pandi',
        'norzagaray': 'Malolos', 'san miguel bulacan': 'Malolos',
        'hagonoy bulacan': 'Hagonoy', 'plaridel bulacan': 'Plaridel',
        'balagtas bulacan': 'Malolos', 'guiguinto bulacan': 'Guiguinto',
        'sta maria bulacan': 'Santa Maria',
        // Rizal province extras
        'rodriguez rizal': 'Antipolo', 'montalban': 'Antipolo',
        'san mateo rizal': 'Antipolo', 'marikina valley': 'Marikina',
        'teresa rizal': 'Antipolo', 'morong rizal': 'Morong',
        'cardona rizal': 'Antipolo', 'pililla rizal': 'Antipolo',
        'tanay rizal': 'Tanay', 'baras rizal': 'Antipolo',
        // Laguna extras
        'san pedro laguna': 'San Pedro', 'cabuyao laguna': 'Cabuyao',
        'san pablo laguna': 'San Pablo', 'alaminos laguna': 'Alaminos',
        'nagcarlan laguna': 'Nagcarlan', 'lumban laguna': 'Lumban',
        'paete laguna': 'Paete', 'pakil laguna': 'Calamba',
        'majayjay laguna': 'Lucena', 'siniloan laguna': 'Calamba',
        // Pampanga province extras
        'mabalacat city': 'Mabalacat', 'san simon pampanga': 'Angeles',
        'apalit pampanga': 'Angeles', 'macabebe pampanga': 'Angeles',
        'masantol pampanga': 'Angeles', 'lubao pampanga': 'Angeles',
        'san luis pampanga': 'Angeles', 'candaba pampanga': 'Candaba',
        'bacolor pampanga': 'Angeles', 'sta ana pampanga': 'Santa Ana',
        // Nueva Ecija extras
        'science city of munoz': 'Cabanatuan', 'munoz nueva ecija': 'Cabanatuan',
        'gapan nueva ecija': 'Gapan', 'palayan city': 'Cabanatuan',
        'san jose nueva ecija': 'San Jose',
        // Tarlac extras
        'capas tarlac': 'Capas', 'bamban tarlac': 'Tarlac',
        'paniqui tarlac': 'Paniqui', 'camiling tarlac': 'Tarlac',
        // Pangasinan extras
        'urdaneta pangasinan': 'Urdaneta', 'villasis pangasinan': 'Urdaneta',
        'san carlos pangasinan': 'San Carlos', 'tayug pangasinan': 'Urdaneta',
        'binmaley pangasinan': 'Dagupan', 'lingayen pangasinan': 'Lingayen',
        'mangatarem pangasinan': 'Dagupan', 'aguilar pangasinan': 'Dagupan',
        // La Union / Ilocos extras
        'bauang la union': 'Bauang', 'agoo la union': 'Agoo',
        'aringay la union': 'Aringay',
        'bacnotan la union': 'Bacnotan', 'naguilian la union': 'Naguilian',
        'candon ilocos sur': 'Candon',
        'narvacan ilocos sur': 'Vigan', 'santa ilocos sur': 'Vigan',
        'pasuquin ilocos norte': 'Pasuquin', 'adams ilocos norte': 'Laoag',
        'vintar ilocos norte': 'Laoag', 'dingras ilocos norte': 'Laoag',
        'piddig ilocos norte': 'Laoag', 'solsona ilocos norte': 'Laoag',
        // Cagayan Valley
        'aparri cagayan': 'Aparri', 'abulug cagayan': 'Aparri',
        'gonzaga cagayan': 'Aparri', 'sta teresita cagayan': 'Aparri',
        'lasam cagayan': 'Aparri', 'baggao cagayan': 'Aparri',
        'gattaran cagayan': 'Aparri', 'tuao cagayan': 'Tuguegarao',
        'ilagan isabela': 'Ilagan', 'cauayan isabela': 'Cauayan',
        'roxas isabela': 'Roxas', 'santiago isabela': 'Santiago',
        'santiago city': 'Santiago', 'diffun quirino': 'Santiago',
        'aurora quirino': 'Santiago', 'maddela quirino': 'Santiago',
        'bambang nueva vizcaya': 'Santiago', 'bayombong nueva vizcaya': 'Santiago',
        'solano nueva vizcaya': 'Solano',
        // Iloilo extras
        'oton iloilo': 'Iloilo', 'pototan iloilo': 'Pototan',
        'duenas iloilo': 'Iloilo', 'barotac nuevo': 'Iloilo',
        'barotac viejo': 'Iloilo', 'san enrique iloilo': 'Iloilo',
        'passi city': 'Iloilo', 'jordan guimaras': 'Jordan',
        'guimaras island': 'Jordan', 'buenavista guimaras': 'Buenavista',
        // Bacolod / Negros Occidental extras
        'talisay city negros': 'Bacolod', 'talisay negros occidental': 'Bacolod',
        'silay city': 'Silay', 'victorias negros': 'Bacolod',
        'kabankalan city': 'Kabankalan', 'himamaylan city': 'Bacolod',
        'murcia negros': 'Murcia', 'la carlota': 'Bacolod',
        'pontevedra negros': 'Bacolod',
        // Bukidnon (Mindanao highlands)
        'malaybalay': 'Malaybalay', 'malaybalay city': 'Malaybalay',
        'valencia bukidnon': 'Valencia', 'valencia city bukidnon': 'Valencia',
        'impasugong': 'Malaybalay', 'dole pineapple bukidnon': 'Manolo Fortich',
        'manolo fortich': 'Manolo Fortich', 'del monte bukidnon': 'Manolo Fortich',
        'maramag bukidnon': 'Maramag', 'kibawe bukidnon': 'Malaybalay',
        'don carlos bukidnon': 'Malaybalay', 'quezon bukidnon': 'Malaybalay',
        // Misamis Occidental extras
        'tangub city': 'Ozamis City', 'jimenez misamis occidental': 'Oroquieta',
        'plaridel misamis occidental': 'Plaridel',
        'calamba misamis occidental': 'Calamba',
        // Misamis Oriental extras
        'initao': 'Cagayan de Oro', 'opol misamis oriental': 'Opol',
        'villanueva misamis': 'Cagayan de Oro', 'laguindingan': 'Laguindingan',
        // South Cotabato extras
        'surallah': 'Koronadal', 'banga south cotabato': 'Koronadal',
        'norala south cotabato': 'Koronadal', 'sto nino south cotabato': 'Koronadal',
        'polomolok': 'Polomolok', 't boli': 'General Santos',
        // Sultan Kudarat
        'isulan sultan kudarat': 'Koronadal', 'tacurong sultan kudarat': 'Koronadal',
        'lebak sultan kudarat': 'Cotabato', 'lambayong sultan kudarat': 'Koronadal',
        // Compostela Valley / Davao de Oro
        'compostela valley': 'Nabunturan', 'nabunturan': 'Nabunturan',
        'montevista': 'Nabunturan', 'pantukan': 'Nabunturan',
        'new bataan comval': 'Davao', 'mawab comval': 'Nabunturan',
        // Davao del Norte extras
        'carmen davao del norte': 'Carmen', 'new corella davao': 'Tagum',
        'kapalong': 'Tagum', 'talaingod': 'Tagum',
        // Davao Occidental
        'jose abad santos': 'General Santos', 'malita davao': 'Malita',
        'sta maria davao del sur': 'Santa Maria',
        // Davao Oriental
        'mati davao oriental': 'Mati', 'mati city': 'Mati',
        'manay davao oriental': 'Mati', 'tarragona davao oriental': 'Mati',
        'cateel davao oriental': 'Mati', 'baganga davao oriental': 'Mati',
        // Sarangani
        'alabel sarangani': 'Alabel', 'malapatan sarangani': 'General Santos',
        'maitum sarangani': 'General Santos', 'kiamba sarangani': 'General Santos',
        // Agusan del Norte
        'cabadbaran city': 'Butuan',
        'las nieves agusan': 'Butuan', 'nasipit agusan': 'Butuan',
        // Surigao del Sur
        'tandag surigao del sur': 'Tandag', 'cantilan surigao del sur': 'Surigao',
        'lanuza surigao del sur': 'Bislig', 'lianga surigao': 'Bislig',
        // Surigao del Norte extras
        'del carmen surigao': 'Del Carmen', 'alegria surigao norte': 'Cebu',
        'claver surigao del norte': 'Claver',
        // More Cebu City barangays
        'tinago cebu': 'Cebu', 'mabini cebu': 'Cebu',
        'duljo-fatima': 'Cebu', 'basak san nicolas cebu': 'Cebu',
        'quiot pardo': 'Cebu', 'ermita cebu': 'Cebu',
        'sambag cebu': 'Cebu', 'tejero cebu': 'Cebu',
        'waterfront cebu': 'Cebu', 'luz cebu': 'Cebu',
        // More Lapu-Lapu / Mactan barangays
        'gun-ob': 'Lapu Lapu', 'ibo lapu-lapu': 'Lapu Lapu',
        'babag lapu-lapu': 'Lapu Lapu', 'basak lapu-lapu': 'Lapu Lapu',
        'pajac lapu-lapu': 'Lapu Lapu', 'pusok lapu-lapu': 'Lapu Lapu',
        'poblacion lapu-lapu': 'Lapu Lapu', 'agus lapu-lapu': 'Lapu Lapu',
        'bankal lapu-lapu': 'Lapu Lapu', 'buaya lapu-lapu': 'Lapu Lapu',
        'looc lapu-lapu': 'Lapu Lapu', 'mactan newtown lapu-lapu': 'Lapu Lapu',
        // More Mandaue barangays
        'canduman mandaue': 'Mandaue', 'casili mandaue': 'Mandaue',
        'cambaro mandaue': 'Mandaue', 'banilad mandaue': 'Mandaue',
        'tabok mandaue': 'Mandaue', 'paknaan mandaue': 'Mandaue',
        'tipolo mandaue': 'Mandaue', 'alang-alang mandaue': 'Mandaue',
        'looc mandaue': 'Mandaue', 'maguikay mandaue': 'Mandaue',
        // More Davao City barangays
        'lacson davao': 'Davao', 'mamay davao': 'Davao',
        'maa davao': 'Davao', 'indangan davao': 'Davao',
        'waan davao': 'Davao', 'communal davao': 'Davao',
        'mudiang davao': 'Davao', 'tigatto davao': 'Davao',
        'baliok davao': 'Davao', 'bunawan davao': 'Davao',
        'sirawan davao': 'Davao', 'tugbok davao': 'Davao',
        'marilog davao': 'Davao', 'calinan davao': 'Davao',
        'baguio davao': 'Davao', 'baracatan davao': 'Davao',
        // Batangas coastal towns
        'san juan batangas coast': 'San Juan', 'lobo batangas': 'Lobo',
        'mabini batangas': 'Mabini', 'tingloy batangas': 'Batangas',
        'san pascual batangas': 'San Pascual', 'laurel batangas': 'Laurel',
        'agoncillo batangas': 'Batangas', 'alitagtag batangas': 'Batangas',
        'balete batangas': 'Balete', 'cuenca batangas': 'Cuenca',
        'san luis batangas': 'Batangas', 'talaga': 'Batangas',
        // Albay extras (Bicol)
        'ligao albay': 'Ligao', 'ligao city': 'Ligao',
        'tabaco albay': 'Tabaco', 'tabaco city': 'Tabaco',
        'tiwi albay': 'Tiwi', 'jovellar albay': 'Sorsogon',
        'mayon volcano': 'Legazpi', 'daraga albay': 'Legazpi',
        // Camarines Norte
        'daet camarines norte': 'Daet', 'daet': 'Daet',
        'camarines norte': 'Daet', 'labo camarines norte': 'Daet',
        // Camarines Sur
        'pili camarines sur': 'Pili', 'calabanga': 'Naga',
        'tinambac': 'Naga', 'goa camarines sur': 'Naga',
        'san jose camarines sur': 'San Jose', 'iriga city': 'Iriga',
        'nabua camarines sur': 'Nabua', 'baao camarines sur': 'Naga',
        // Quezon province extras
        'padre burgos quezon': 'Padre Burgos', 'catanauan quezon': 'Lucena',
        'plaridel quezon': 'Plaridel', 'macalelon quezon': 'Lucena',
        'pitogo quezon': 'Lucena', 'calauag quezon': 'Lucena',
        'mulanay quezon': 'Lucena',
        // Marinduque extras
        'torrijos marinduque': 'Romblon', 'buenavista marinduque': 'Buenavista',
        // Romblon province extras
        'odiongan romblon': 'Odiongan', 'cajidiocan romblon': 'Cajidiocan',
        'san agustin romblon': 'San Agustin', 'sibuyan island': 'Romblon',
        'magdiwang romblon': 'Romblon',
        // Ifugao extras (Cordillera)
        'lagawe ifugao': 'Banaue', 'lamut ifugao': 'Banaue',
        'hingyon ifugao': 'Banaue', 'aguinaldo ifugao': 'Banaue',
        // Kalinga extras — capital is Tabuk (NOT Baguio; different province)
        'tabuk kalinga': 'Tabuk', 'rizal kalinga': 'Tabuk',
        'pinukpuk kalinga': 'Tabuk',
        // Mountain Province extras — capital is Bontoc (NOT Baguio; different province)
        'bontoc town': 'Bontoc', 'besao mountain province': 'Bontoc',
        'sabangan mountain province': 'Bontoc', 'tadian mountain province': 'Bontoc',
        // Benguet extras
        'tublay benguet': 'Baguio', 'kapangan benguet': 'Baguio',
        'kibungan benguet': 'Baguio', 'atok benguet': 'Baguio',
        'kabayan benguet': 'Baguio', 'buguias benguet': 'Baguio',
        // Apayao
        'luna apayao': 'Laoag', 'kabugao apayao': 'Laoag',
        // Abra extras
        'lagangilang abra': 'Bangued', 'tayum abra': 'Bangued',
        'pidigan abra': 'Bangued', 'dolores abra': 'Dolores',
        // More Mindanao barangays/areas
        'tamontaka cotabato': 'Cotabato', 'rosary heights cotabato': 'Cotabato',
        'kalanganan cotabato': 'Cotabato', 'poblacion cotabato': 'Cotabato',
        'labangon cebu city': 'Cebu', 'punta princesa barangay': 'Cebu',
        'bonbon mandaue': 'Mandaue', 'subangdaku mandaue': 'Mandaue',
        // Metro Manila barangays not yet listed
        'bagong silangan qc': 'Quezon City', 'sauyo qc': 'Quezon City',
        'batasan hills qc': 'Quezon City', 'gulod novaliches': 'Quezon City',
        'bagbag novaliches': 'Quezon City', 'sta lucia qc': 'Quezon City',
        'talipapa': 'Quezon City', 'san agustin novaliches': 'Quezon City',
        'sta monica novaliches': 'Quezon City', 'pasong putik': 'Quezon City',
        'culiat qc': 'Quezon City', 'soccorro qc': 'Quezon City',
        // More Iloilo barangays
        'ungka iloilo': 'Iloilo', 'dungon iloilo': 'Iloilo',
        'hibao-an iloilo': 'Iloilo', 'navais iloilo': 'Iloilo',
        'lapuz iloilo': 'Iloilo', 'molo iloilo': 'Iloilo',
        'balantang iloilo': 'Iloilo', 'san jose iloilo': 'Iloilo',
        // More Bacolod barangays
        'pahanocoy bacolod': 'Bacolod', 'tangub bacolod': 'Bacolod',
        'handumanan': 'Bacolod', 'alijis': 'Bacolod', 'villamonte': 'Bacolod',
        'taculing': 'Bacolod', 'singcang': 'Bacolod',
        // More Davao City barangays
        'sasa davao': 'Davao', 'panacan davao': 'Davao',
        'bunawan davao city': 'Davao', 'daliao davao': 'Davao',
        'baguio district davao': 'Davao', 'mintal davao city': 'Davao',
        // More Zamboanga barangays
        'tetuan zamboanga': 'Zamboanga', 'canelar': 'Zamboanga',
        'sta barbara zamboanga': 'Zamboanga', 'baliwasan': 'Zamboanga',
        // Additional regional centers
        'cabarroguis quirino': 'Santiago', 'bagabag nueva vizcaya': 'Santiago',
        'gabu ilocos norte': 'Laoag', 'san nicolas ilocos norte': 'Laoag',
        'bacarra ilocos norte': 'Laoag', 'currimao ilocos norte': 'Laoag',
        'paoay ilocos norte': 'Laoag',
        'narvacan ilocos sur alt': 'Vigan', 'bantay ilocos sur': 'Vigan',
        'sta catalina negros oriental': 'Santa Catalina',
        'sta barbara iloilo': 'Santa Barbara',
        'mina iloilo': 'Iloilo', 'lemery iloilo': 'Iloilo',
        'tubungan iloilo': 'Iloilo', 'tigbauan iloilo': 'Iloilo',
        // Catanduanes Island (not previously covered)
        'virac': 'Virac', 'virac catanduanes': 'Virac', 'catanduanes island': 'Virac',
        'pandan catanduanes': 'Legazpi', 'gigmoto catanduanes': 'Legazpi',
        'viga catanduanes': 'Legazpi', 'bagamanoc catanduanes': 'Legazpi',
        // Caramoan (Camarines Sur — popular tourist/reality TV peninsula)
        'caramoan': 'Caramoan', 'caramoan peninsula': 'Caramoan',
        'gota beach caramoan': 'Caramoan', 'lahos island': 'Caramoan',
        // Ticao Island (between Masbate and Sorsogon)
        'ticao island': 'San Jacinto', 'san jacinto masbate': 'San Jacinto',
        'monreal masbate': 'Masbate',
        // Tawi-Tawi (southernmost province)
        'bongao': 'Zamboanga', 'bongao tawi-tawi': 'Zamboanga', 'tawi-tawi': 'Zamboanga',
        'sapa-sapa': 'Zamboanga', 'tandubas': 'Zamboanga',
        'turtle islands': 'Zamboanga',
        // Sulu
        'jolo': 'Zamboanga', 'jolo sulu': 'Zamboanga', 'sulu province': 'Zamboanga',
        'patikul': 'Zamboanga', 'indanan': 'Zamboanga',
        // Basilan
        'isabela city basilan': 'Zamboanga', 'basilan': 'Zamboanga',
        'lamitan': 'Zamboanga', 'lamitan city': 'Zamboanga',
        // Kalanggaman Island (Leyte — famous sandbar)
        'kalanggaman island': 'Palompon', 'palompon leyte': 'Palompon',
        // Biliran extras
        'biliran island': 'Naval', 'almeria biliran': 'Naval', 'kawayan biliran': 'Naval',
        'cabucgayan biliran': 'Cabucgayan', 'caibiran biliran': 'Naval',
        // Itbayat (Batanes northernmost island)
        'itbayat': 'Basco', 'itbayat batanes': 'Basco',
        // Guimaras extras
        'nueva valencia guimaras': 'Nueva Valencia', 'san lorenzo guimaras': 'San Lorenzo',
        'sibunag guimaras': 'Sibunag',
        // Palawan extras
        'narra palawan': 'Puerto Princesa', 'quezon palawan': 'Puerto Princesa',
        'rio tuba': 'Puerto Princesa', 'bataraza palawan': 'Puerto Princesa',
        'brooke point': "Brooke's Point", 'sofronio espanola': 'Puerto Princesa',
        // More Davao del Sur
        'digos city extras': 'Digos', 'hagonoy davao del sur': 'Hagonoy',
        'padada davao del sur': 'Davao',
        // Lanao del Sur
        'marawi city': 'Iligan', 'malabang lanao del sur': 'Iligan',
        'wao lanao del sur': 'Iligan', 'sultan naga dimaporo': 'Iligan',
        // More Zamboanga Sibugay
        'kabasalan': 'Zamboanga', 'talusan zamboanga sibugay': 'Ipil',
        // More Aurora province
        'baler aurora': 'Baler', 'aurora province': 'Baler',
        'casiguran aurora': 'Casiguran', 'dinalungan aurora': 'Baler',
        // More Nueva Vizcaya
        'kasibu nueva vizcaya': 'Santiago', 'dupax nueva vizcaya': 'Santiago',
        // More Quirino
        'nagtipunan quirino': 'Santiago',
        // More Ilocos Norte
        'batac ilocos norte': 'Batac', 'marcos museum': 'Batac',
        'nueva era ilocos norte': 'Laoag',
        // More Ilocos Sur
        'santa maria ilocos sur': 'Santa Maria', 'santa maria church': 'Santa Maria',
        // Kalinga extras — capital is Tabuk
        'balbalan kalinga': 'Tabuk', 'lubuagan kalinga': 'Tabuk',
        'tanudan kalinga': 'Tabuk',
        // Cebu City extras
        'talamban cebu': 'Cebu', 'banawa cebu': 'Cebu',
        'jaclian cebu': 'Cebu', 'inayawan cebu': 'Cebu',
        // Metro Manila Tagalog shorthand searches
        'manila city': 'Manila', 'maynila': 'Manila',
        'lungsod ng maynila': 'Manila', 'pinas': 'Manila',
        'pilipinas': 'Manila',
    },
    // ── South / Southeast Asia additions ──────────────────────────────────────
    BD: {
        'gulshan': 'Gulshan', 'banani': 'Dhaka', 'dhanmondi': 'Dhaka',
        'uttara': 'Dhaka', 'motijheel': 'Dhaka', 'mirpur': 'Dhaka',
        'bashundhara': 'Dhaka', 'mohammadpur': 'Dhaka', 'rayer bazar': 'Dhaka',
        'agrabad': 'Chittagong', 'nasirabad': 'Chittagong',
        // Dhaka — more neighborhoods
        'old dhaka': 'Dhaka', 'lalbagh': 'Dhaka', 'puran dhaka': 'Dhaka',
        'azimpur': 'Dhaka', 'new market dhaka': 'Dhaka', 'elephant road': 'Dhaka',
        'farmgate': 'Dhaka', 'green road': 'Dhaka', 'tejgaon': 'Dhaka',
        'shahbagh': 'Dhaka', 'hatirpool': 'Dhaka', 'kalabagan': 'Dhaka',
        'lalmatia': 'Dhaka', 'moghbazar': 'Dhaka', 'malibagh': 'Dhaka',
        'rampura': 'Dhaka', 'badda': 'Dhaka', 'khilkhet': 'Dhaka',
        'nikunja': 'Dhaka', 'aftabnagar': 'Dhaka',
        // Chittagong — more areas
        'chittagong city': 'Chittagong', 'ctg': 'Chittagong', 'panchlaish': 'Chittagong',
        'khulshi': 'Chittagong', 'halishahar': 'Chittagong', 'pahartali': 'Chittagong',
        'patiya': 'Chittagong', 'cox bazar': "Cox's Bazar", "cox's bazar": "Cox's Bazar",
        'laboni beach': "Cox's Bazar", 'sugandha beach': "Cox's Bazar",
        'inani beach': "Cox's Bazar", 'himchori': "Cox's Bazar",
        // Sylhet
        'sylhet': 'Sylhet', 'sylhet city': 'Sylhet', 'jalalabad': 'Sylhet',
        'zindabazar': 'Sylhet', 'ambarkhana': 'Sylhet',
        // Other cities
        'rajshahi': 'Rajshahi', 'rajshahi city': 'Rajshahi',
        'khulna': 'Khulna', 'khulna city': 'Khulna', 'bagerhat': 'Khulna',
        'sundarbans': 'Khulna', 'mongla': 'Khulna',
        'barisal': 'Bariśāl', 'barishal': 'Bariśāl',
        'mymensingh': 'Dhaka', 'comilla': 'Comilla', 'chandpur': 'Comilla',
        'rangpur': 'Rangpur', 'dinajpur': 'Rangpur', 'bogura': 'Bogra',
        'tangail': 'Dhaka', 'gazipur': 'Dhaka', 'narayanganj': 'Dhaka',
        // More BD cities
        'jessore': 'Jessore', 'jashore': 'Jessore', 'jashore city': 'Jessore',
        'noakhali': 'Noakhali', 'feni bd': 'Comilla', 'brahmanbaria': 'Comilla',
        'kishorganj': 'Dhaka', 'pabna': 'Rajshahi', 'sirajganj': 'Rajshahi',
        'kurigram': 'Rangpur', 'lalmonirhat': 'Rangpur',
        'chapai nawabganj': 'Rajshahi', 'nawabganj bd': 'Rajshahi',
        'natore': 'Rajshahi', 'magura': 'Jessore', 'jhenaidah': 'Jessore',
        'narail': 'Khulna', 'satkhira': 'Khulna',
        // Cox's Bazar extras
        'teknaf': "Cox's Bazar", 'teknaf cox bazar': "Cox's Bazar",
        'st martins island': "Cox's Bazar", "saint martin's island": "Cox's Bazar",
        'maheshkhali': "Cox's Bazar", 'kutubdia': "Cox's Bazar",
        // Sylhet extras
        'maulovibazar': 'Sylhet', 'srimangal': 'Sylhet', 'lawachara': 'Sylhet',
        'ratargul swamp': 'Sylhet', 'jaflong': 'Sylhet',
        // Sundarbans extras
        'sundarbans forest': 'Khulna', 'dublar char': 'Khulna', 'hiron point': 'Khulna',
        // Bengali script names
        'ঢাকা': 'Dhaka', 'চট্টগ্রাম': 'Chittagong', 'সিলেট': 'Sylhet',
        'রাজশাহী': 'Rajshahi', 'খুলনা': 'Khulna', 'বরিশাল': 'Bariśāl',
        'ময়মনসিংহ': 'Dhaka', 'রংপুর': 'Rangpur', 'বাংলাদেশ': 'Dhaka',
        // DB cities without aliases
        'bandarban': 'Bandarban', 'rangamati': 'Rangamati', 'kushtia': 'Kushtia',
        'gaibandha': 'Gaibandha', 'saidpur': 'Saidpur',
    },
    LK: {
        'fort colombo': 'Colombo', 'pettah': 'Colombo', 'kollupitiya': 'Colombo',
        'bambalapitiya': 'Colombo', 'wellawatte': 'Colombo', 'mount lavinia': 'Mount Lavinia',
        'borella': 'Colombo', 'rajagiriya': 'Colombo', 'nugegoda': 'Colombo',
        'kandy city': 'Kandy', 'dalada maligawa': 'Kandy',
        'galle fort': 'Galle', 'weligama': 'Weligama',
        'negombo beach': 'Negombo',
        'trincomalee beach': 'Trincomalee',
        // Colombo — more areas
        'colombo 3': 'Colombo', 'colombo 7': 'Colombo', 'cinnamon gardens': 'Colombo',
        'dehiwala': 'Colombo', 'moratuwa': 'Moratuwa', 'maharagama': 'Colombo',
        'nawala': 'Colombo', 'kotte': 'Colombo', 'malabe': 'Colombo',
        // Heritage / Cultural Triangle
        'sigiriya': 'Sigiriya', 'sigiriya rock': 'Sigiriya', 'pidurangala': 'Sigiriya',
        'dambulla': 'Dambulla', 'dambulla cave': 'Dambulla',
        'polonnaruwa': 'Polonnaruwa', 'anuradhapura': 'Anuradhapura',
        // Hill Country
        'ella': 'Ella', 'ella village': 'Ella', 'ella rock': 'Ella', 'nine arch bridge': 'Ella',
        'nuwara eliya': 'Nuwara Eliya', 'little england': 'Nuwara Eliya', 'gregory lake': 'Nuwara Eliya',
        'haputale': 'Haputhale', 'bandarawela': 'Bandarawela',
        'hatton': 'Hatton', 'adam s peak': 'Hatton',
        'horton plains': 'Nuwara Eliya',
        // South Coast
        'tangalle': 'Tangalle', 'dickwella': 'Dikwella',
        'beruwala': 'Beruwela', 'kalutara': 'Kalutara',
        'matara': 'Matara', 'galle city': 'Galle',
        'bentota': 'Bentota', 'induruwa': 'Induruwa',
        'koggala': 'Koggala', 'kogalla beach': 'Koggala',
        // East Coast
        'arugam bay': 'Arugam', 'pottuvil': 'Arugam',
        'passikudah': 'Passikudah Bay', 'kalkudah': 'Kalkudah',
        // North
        'jaffna': 'Jaffna', 'jaffna city': 'Jaffna', 'nallur': 'Jaffna',
        // More Colombo suburbs
        'wattala': 'Wattala', 'peliyagoda': 'Colombo', 'kelaniya': 'Kelaniya',
        'kaduwela': 'Colombo', 'battaramulla': 'Battaramulla', 'thalawathugoda': 'Colombo',
        'colombo 1': 'Colombo', 'colombo 2': 'Colombo', 'colombo 4': 'Colombo',
        'colombo 5': 'Colombo', 'colombo 6': 'Colombo',
        // Kandy extras
        'peradeniya': 'Kandy', 'kundasale': 'Kandy', 'ampitiya': 'Kandy',
        'katugastota': 'Kandy', 'kandy lake': 'Kandy',
        // South Coast extras
        'unawatuna': 'Unawatuna', 'mirissa': 'Mirissa', 'mirissa beach': 'Mirissa',
        'weligama bay': 'Weligama', 'hikkaduwa': 'Hikkaduwa',
        'ahangama': 'Ahangama', 'talpe': 'Talpe',
        'hambantota': 'Hambantota',
        // Wildlife parks
        'yala national park': 'Tissamaharama', 'yala safari': 'Tissamaharama',
        'wilpattu': 'Puttalam', 'wilpattu park': 'Puttalam',
        'udawalawe': 'Udawalawe', 'minneriya': 'Minneriya',
        // Cultural Triangle extras
        'yapahuwa': 'Kurunegala', 'medirigiriya': 'Polonnaruwa',
        'ritigala': 'Anuradhapura',
        // North extras
        'kilinochchi': 'Kilinochchi', 'mannar': 'Mannar', 'vavuniya': 'Vavuniya',
        'mullaitivu': 'Vavuniya', 'point pedro': 'Jaffna',
        // East Coast
        'batticaloa city': 'Batticaloa', 'ampara': 'Ampara',
        'nilaveli beach': 'Trincomalee', 'uppuveli': 'Trincomalee',
        // More hill country
        'badulla': 'Haputhale', 'welimada': 'Welimada',
        'diyaluma falls': 'Haputhale', 'rawana falls': 'Ella',
        // Sinhala language names
        'කොළඹ': 'Colombo', 'ශ්‍රී ලංකාව': 'Colombo', 'කන්ඩි': 'Kandy',
        'ගාල්ල': 'Galle', 'නුවර': 'Kandy',
    },
    PK: {
        'gulberg': 'Lahore', 'dha lahore': 'Lahore', 'old city lahore': 'Lahore',
        'model town lahore': 'Lahore', 'johar town': 'Lahore',
        'clifton': 'Karachi', 'defence karachi': 'Karachi', 'saddar': 'Karachi',
        'gulshan-e-iqbal': 'Karachi', 'north nazimabad': 'Karachi', 'korangi': 'Karachi',
        'blue area': 'Islamabad', 'f-6': 'Islamabad', 'f-7': 'Islamabad',
        'f-8': 'Islamabad', 'f-10': 'Islamabad', 'g-9': 'Islamabad',
        'dha islamabad': 'Islamabad', 'bahria town islamabad': 'Islamabad',
        // Lahore expanded
        'lahore city': 'Lahore', 'walled city lahore': 'Lahore', 'mall road lahore': 'Lahore',
        'gulberg lahore': 'Lahore', 'garden town lahore': 'Lahore', 'iqbal town': 'Lahore',
        'township lahore': 'Lahore', 'raiwind': 'Lahore', 'shalimar': 'Lahore',
        // Karachi expanded
        'pechs': 'Karachi', 'bath island': 'Karachi', 'dha karachi': 'Karachi',
        'bahadurabad': 'Karachi', 'federal b area': 'Karachi', 'landhi': 'Karachi',
        'orangi': 'Karachi', 'site karachi': 'Karachi', 'malir': 'Karachi',
        'karachi city': 'Karachi', 'sea view karachi': 'Karachi', 'hawkesbay': 'Karachi',
        // Islamabad expanded
        'islamabad city': 'Islamabad', 'e-7': 'Islamabad', 'e-11': 'Islamabad',
        'sector g-6': 'Islamabad', 'bari imam': 'Islamabad', 'margalla hills': 'Islamabad',
        // Rawalpindi
        'rawalpindi': 'Rawalpindi', 'saddar rawalpindi': 'Rawalpindi', 'chaklala': 'Rawalpindi',
        // Other cities
        'peshawar': 'Peshawar', 'peshawar city': 'Peshawar', 'hayatabad': 'Peshawar',
        'kohat': 'Peshawar', 'mardan': 'Mardan',
        'quetta': 'Quetta', 'quetta city': 'Quetta',
        'faisalabad': 'Faisalabad', 'faisalabad city': 'Faisalabad',
        'multan': 'Multan', 'multan city': 'Multan',
        'gujranwala': 'Gujranwala', 'sialkot': 'Sialkot', 'gujrat pakistan': 'Gujrat',
        'hyderabad pakistan': 'Hyderabad',
        // Northern Pakistan (tourism)
        'hunza': 'Karimabad', 'karimabad': 'Karimabad', 'gilgit city': 'Gilgit',
        'skardu': 'Skãrdu', 'fairy meadows': 'Skãrdu', 'deosai plains': 'Skãrdu',
        'swat': 'Saidu Sharif', 'mingora': 'Saidu Sharif', 'malam jabba': 'Saidu Sharif',
        'kalam': 'Saidu Sharif', 'bahrain swat': 'Saidu Sharif',
        'murree': 'Murree', 'naran': 'Nārān', 'kaghan': 'Nārān',
        'abbottabad': 'Abbottãbãd', 'mansehra': 'Mansehra',
        // More Lahore
        'bahria town lahore': 'Lahore', 'cantt lahore': 'Lahore',
        'pak town lahore': 'Lahore', 'thokar niaz baig': 'Lahore',
        'wapda town': 'Lahore', 'lake city lahore': 'Lahore',
        // More Karachi
        'clifton beach karachi': 'Karachi', 'do darya': 'Karachi',
        'gulshan iqbal': 'Karachi', 'nazimabad': 'Karachi',
        'liaquatabad': 'Karachi', 'buffer zone karachi': 'Karachi',
        'port qasim': 'Karachi', 'dha city karachi': 'Karachi',
        // More Islamabad sectors
        'f-11': 'Islamabad', 'i-8': 'Islamabad', 'g-11': 'Islamabad',
        'e-11 islamabad': 'Islamabad', 'b-17': 'Islamabad',
        'faisal avenue': 'Islamabad', 'constitution avenue': 'Islamabad',
        // Northern Pakistan extras
        'chitral': 'Chitrãl', 'kalash valleys': 'Chitrãl',
        'mastuj': 'Karimabad', 'phander': 'Karimabad',
        'gupis': 'Karimabad', 'ghizer': 'Karimabad',
        'khyber pass': 'Islamabad', 'torkham': 'Islamabad',
        'dir pakistan': 'Islamabad', 'timergara': 'Islamabad',
        'shangla': 'Saidu Sharif',
        // AJK / Azad Kashmir
        'muzaffarabad': 'Muzaffarabad', 'mirpur ajk': 'Islamabad',
        'neelum valley': 'Islamabad', 'ratti gali': 'Islamabad',
        'sharda ajk': 'Islamabad', 'keran ajk': 'Islamabad',
        'rawalakot': 'Islamabad', 'bagh ajk': 'Islamabad',
        // Sindh extras
        'sukkur': 'Sukkur', 'larkana': 'Sukkur',
        'mohenjo daro': 'Sukkur', 'moenjodaro': 'Sukkur',
        'thatta': 'Karachi', 'makli necropolis': 'Karachi',
        'nawabshah': 'Nawabshah', 'mirpur khas': 'Sukkur',
        'khairpur': 'Sukkur',
        // Balochistan extras
        'ziarat': 'Quetta',
        'gwadar': 'Gwãdar', 'gwadar port': 'Gwãdar',
        'turbat': 'Gwãdar', 'khuzdar': 'Quetta',
        'hub balochistan': 'Karachi',
        // Urdu language city names
        'لاہور': 'Lahore', 'کراچی': 'Karachi', 'اسلام آباد': 'Islamabad',
        'پشاور': 'Peshawar', 'کوئٹہ': 'Quetta', 'ملتان': 'Multan',
        'فیصل آباد': 'Faisalabad', 'راولپنڈی': 'Rawalpindi',
        'حیدرآباد': 'Hyderabad', 'سکھر': 'Sukkur',
        // DB cities without aliases
        'bahawalpur': 'Bahawalpur', 'bhurban': 'Bhurban', 'chilas': 'Chilas',
        'dera ghazi khan': 'Dera Ghazi Khan', 'kachura lake': 'Kachura', 'kachura': 'Kachura',
        'khaplu': 'Khaplu', 'shigar': 'Shigar', 'sargodha': 'Sargodha',
        'aliabad hunza': 'Aliabad', 'altit fort': 'Altit', 'altit': 'Altit',
        'rahim yar khan': 'Rahim Yar Khan', 'sahiwal': 'Sahiwal',
    },
    KH: {
        'bkk1': 'Phnom Penh', 'riverside phnom penh': 'Phnom Penh',
        'russian market': 'Phnom Penh', 'toul tom poung': 'Phnom Penh',
        'daun penh': 'Phnom Penh', 'boeung keng kang': 'Phnom Penh',
        'pub street': 'Siem Reap', 'angkor wat area': 'Siem Reap',
        'siem reap town': 'Siem Reap',
        'sihanoukville beach': 'Sihanoukville', 'otres': 'Sihanoukville',
        'kep beach': 'Kep',
        // More Phnom Penh
        'tuol sleng': 'Phnom Penh', 'toul kork': 'Phnom Penh',
        'chroy changvar': 'Phnom Penh', 'boeng reang': 'Phnom Penh',
        'central market phnom penh': 'Phnom Penh', 'olympic stadium pp': 'Phnom Penh',
        // More Siem Reap
        'siem reap old market': 'Siem Reap', 'angkor thom': 'Angkor Thum',
        'bantey srei': 'Siem Reap', 'ta prohm': 'Siem Reap',
        // Kampot
        'kampot': 'Kampot', 'kampot old town': 'Kampot', 'bokor hill': 'Kampot',
        // Battambang
        'battambang': 'Battambang', 'battambang old town': 'Battambang',
        // Koh Rong
        'koh rong': 'Koh Rong', 'koh rong samloem': 'Koh Rong Sanloem', 'koh rong sanloem': 'Koh Rong Sanloem',
        'koh touch': 'Koh Rong', 'saracen bay': 'Koh Rong',
        // Other Cambodia
        'kratie': 'Kratie', 'mondulkiri': 'Sen Monorom',
        'sihanoukville port': 'Sihanoukville', 'otres village': 'Sihanoukville',
        // More Cambodia
        'kampong cham': 'Kampong Cham', 'nokor bachey': 'Kampong Cham',
        'kampong thom': 'Kampong Thum', 'beng mealea': 'Siem Reap',
        'kbal spean': 'Siem Reap', 'kulen mountain': 'Siem Reap',
        'sambor prei kuk': 'Kampong Thum',
        'preah vihear': 'Preah Vihear', 'anlong veng': 'Preah Vihear',
        'kompong chhnang': 'Pursat', 'pursat': 'Pursat',
        'banteay meanchey': 'Poipet', 'poipet': 'Poipet',
        'neak loeung': 'Neak Loeung', 'prey veng': 'Neak Loeung',
        'svay rieng': 'Bavet', 'takeo': 'Kampot',
        'mondulkiri city': 'Sen Monorom', 'ratanakiri': 'Banlung',
        'ban lung': 'Banlung', 'yeak laom lake': 'Banlung', 'banlung': 'Banlung',
        'tatai': 'Tatai', 'tatai river': 'Tatai',
        'stung treng': 'Kratie', 'kompong cham bridge': 'Kampong Cham',
        // Sihanoukville extras
        'sokha beach': 'Sihanoukville', 'independence beach': 'Sihanoukville',
        'serendipity beach': 'Sihanoukville', 'four rivers': 'Sihanoukville',
        'kampot pepper farms': 'Kampot', 'la plantation': 'Kampot',
        'kep crab market': 'Kep',
        // Angkor extras
        'preah khan temple': 'Siem Reap', 'neak pean': 'Siem Reap',
        'east baray': 'Siem Reap', 'roluos group': 'Siem Reap',
        'terrace of elephants': 'Siem Reap', 'phnom bakheng': 'Siem Reap',
        // Khmer script names
        'ភ្នំពេញ': 'Phnom Penh', 'សៀមរាប': 'Siem Reap',
        'ព្រះសីហនុ': 'Sihanoukville', 'បាត់ដំបង': 'Battambang',
        'កំពត': 'Kampot', 'កំពង់ចាម': 'Kampong Cham',
        'កម្ពុជា': 'Phnom Penh',
        'koh kong': 'Koh Kong', 'pailin': 'Pailin',
    },
    LA: {
        'luang prabang old town': 'Luang Prabang', 'luang prabang night market': 'Luang Prabang',
        'kuang si falls': 'Luang Prabang', 'pak ou caves': 'Luang Prabang',
        'vientiane city center': 'Vientiane', 'pha that luang': 'Vientiane',
        'patuxai': 'Vientiane', 'chao anouvong park': 'Vientiane',
        'vang vieng': 'Vang Vieng', 'blue lagoon vang vieng': 'Vang Vieng',
        'pakse': 'Pakse', 'wat phu': 'Champasak', 'champasak': 'Champasak',
        'si phan don': 'Khong Island', 'don det': 'Khong Island', 'don khon': 'Khong Island',
        'four thousand islands': 'Khong Island',
        'nong khiaw': 'Nongkhiao-Tai', 'muang ngoi': 'Muang Ngoy',
        'phonsali': 'Luang Namtha', 'phongsali': 'Luang Namtha',
        'savannakhet': 'Savannakhét',
        'thakhek': 'Thakhek', 'konglor cave': 'Thakhek',
        // More Vientiane areas
        'ban anou': 'Vientiane', 'sikhottabong': 'Vientiane',
        'chanthabouly': 'Vientiane', 'hadxayfong': 'Vientiane',
        'sisattanak': 'Vientiane', 'naxaithong': 'Vientiane',
        'xaysetha': 'Vientiane', 'sangthong': 'Vientiane',
        'phonhong': 'Vientiane', 'vientiane prefecture': 'Vientiane',
        // More Laos cities
        'xieng khouang': 'Phonsavan', 'phonsavan': 'Phonsavan',
        'plain of jars': 'Phonsavan', 'jars site': 'Phonsavan',
        'oudomxay': 'Oudomxay', 'luang namtha': 'Luang Namtha',
        'nam ha npa': 'Luang Namtha',
        'attapeu': 'Pakse', 'sekong laos': 'Pakse',
        'saravane': 'Pakse',
        'muang sing': 'Luang Namtha', 'xishuangbanna border': 'Luang Namtha',
        // More Luang Prabang area
        'sakkaline road': 'Luang Prabang', 'mekong riverside lp': 'Luang Prabang',
        'kuang si village': 'Luang Prabang', 'tat sae waterfall': 'Luang Prabang',
        'chomphet': 'Luang Prabang', 'ban xang khong': 'Luang Prabang',
        'nam khan river': 'Luang Prabang',
        // More Vang Vieng
        'blue lagoon 2': 'Vang Vieng', 'nam song river': 'Vang Vieng',
        'tham poukham': 'Vang Vieng', 'tham none': 'Vang Vieng',
        'pha ngern': 'Vang Vieng',
        // Bolaven Plateau / South Laos
        'bolaven plateau': 'Pakse', 'tad lo': 'Pakse', 'tad fane': 'Pakse',
        'tad yuang': 'Pakse', 'paksong': 'Paksong',
        // Si Phan Don extras
        'don khong': 'Khong Island', 'muang khong': 'Khong Island',
        'don daeng': 'Khong Island', 'irrawaddy dolphins': 'Khong Island',
        // Xieng Khouang extras
        'muang kham': 'Phonsavan', 'tham piu cave': 'Phonsavan',
        'muang khoun': 'Phonsavan',
        // Border towns / crossings
        'vang tao': 'Pakse', 'huay xai': 'Pakbeng', 'bokeo': 'Pakbeng',
        'gibbon experience': 'Pakbeng',
        'nam phao': 'Thakhek', 'na pho border': 'Thakhek',
        'dan savanh': 'Savannakhét',
        // More northern Laos
        'ban boten': 'Luang Namtha', 'muang long': 'Luang Namtha',
        'muang la': 'Oudomxay', 'muang xay': 'Oudomxay',
        // Vientiane extras
        'that luang lake': 'Vientiane', 'vientiane night market': 'Vientiane',
        'cope visitor centre': 'Vientiane', 'haw phra kaew': 'Vientiane',
        // Lao language city names
        'ວຽງຈັນ': 'Vientiane', 'ຫຼວງພະບາງ': 'Luang Prabang',
        'ປາກເຊ': 'Pakse', 'ສະຫວັນນະເຂດ': 'Savannakhét',
        'ວັງວຽງ': 'Vang Vieng', 'ທ່າແຂກ': 'Thakhek',
        'pakbeng': 'Pakbeng', 'sam neua': 'Sam Neua',
    },
    NP: {
        'thamel': 'Katmandu', 'patan': 'Lalitpur', 'bhaktapur': 'Bhaktapur',
        'boudhanath': 'Katmandu', 'swayambhunath': 'Katmandu',
        'lakeside pokhara': 'Pokhara',
        // Kathmandu expanded
        'kathmandu city': 'Katmandu', 'thamel kathmandu': 'Katmandu',
        'lazimpat': 'Katmandu', 'durbarmarg': 'Katmandu', 'durbar marg': 'Katmandu',
        'jhamsikhel': 'Katmandu', 'baluwatar': 'Katmandu',
        'kirtipur': 'Katmandu', 'sankhu': 'Katmandu', 'budhanilkantha': 'Katmandu',
        'nagarkot': 'Nagarkot', 'dhulikhel': 'Dhulikhel', 'namobuddha': 'Dhulikhel',
        // Pokhara expanded
        'pokhara lakeside': 'Pokhara', 'pokhara city': 'Pokhara', 'phewa lake': 'Pokhara',
        'sarangkot': 'Pokhara', 'davis falls': 'Pokhara', 'begnas lake': 'Pokhara',
        // Chitwan
        'chitwan': 'Sauraha', 'sauraha': 'Sauraha', 'bharatpur nepal': 'Bharatpur',
        'chitwan national park': 'Sauraha',
        // Lumbini
        'lumbini': 'Lumbini', 'birthplace of buddha': 'Lumbini',
        // Trekking hubs
        'lukla': 'Lukla', 'namche bazaar': 'Lukla', 'tengboche': 'Lukla',
        'everest base camp': 'Lukla', 'gorak shep': 'Lukla',
        'annapurna circuit': 'Pokhara', 'manang': 'Pokhara',
        'mustang': 'Jomsom', 'lo manthang': 'Jomsom', 'kagbeni': 'Jomsom',
        'ghorepani': 'Pokhara', 'poon hill': 'Pokhara',
        // Other cities
        'janakpur': 'Janakpur', 'biratnagar': 'Biratnagar', 'birgunj': 'Birgunj',
        'dharan': 'Dhankuta', 'ilam': 'Dhankuta',
        // More Nepal cities
        'hetauda': 'Hetauda', 'butwal': 'Butwal', 'bhairahawa': 'Siddharthanagar',
        'nepalgunj': 'Nepalganj', 'surkhet': 'Surkhet',
        'dhangadhi': 'Dhangadhi', 'mahendranagar': 'Mahendranagar',
        'jumla': 'Nepalganj', 'dolpo': 'Nepalganj',
        'simikot': 'Nepalganj', 'humla': 'Nepalganj',
        'jomsom': 'Jomsom', 'pokhara airport': 'Pokhara',
        'gorkha nepal': 'Gorkha', 'besisahar': 'Besisahar',
        'tatopani nepal': 'Pokhara', 'marpha': 'Jomsom',
        'upper mustang': 'Jomsom', 'chhusang': 'Jomsom',
        'dolakha': 'Katmandu', 'charikot': 'Katmandu',
        'taplejung': 'Taplejung', 'ilam tea garden': 'Dhankuta',
        'okhaldhunga': 'Biratnagar', 'solukhumbu': 'Lukla',
        'kanchenjunga base camp': 'Taplejung',
        // More Kathmandu neighborhoods
        'bouddha': 'Katmandu', 'boudha stupa area': 'Katmandu',
        'pashupatinath': 'Katmandu', 'chabahil': 'Katmandu',
        'bansbari': 'Katmandu', 'maharajgunj': 'Katmandu',
        'balaju': 'Katmandu', 'kalimati': 'Katmandu',
        'new road kathmandu': 'Katmandu', 'ratna park': 'Katmandu',
        'changu narayan': 'Bhaktapur', 'bhaktapur durbar': 'Bhaktapur',
        'pottery square': 'Bhaktapur',
        // More trekking areas
        'langtang valley': 'Katmandu', 'kyanjin gompa': 'Katmandu',
        'gosaikund lake': 'Katmandu', 'helambu': 'Katmandu',
        'manaslu circuit': 'Gorkha', 'tsum valley': 'Gorkha',
        'rolwaling valley': 'Katmandu',
        // Remote destinations
        'rara lake': 'Nepalganj', 'rara national park': 'Nepalganj',
        'bardia national park': 'Nepalganj', 'bardiya': 'Nepalganj',
        'chitwan jungle': 'Sauraha',
        // More cities
        'pokhara new road': 'Pokhara', 'kaski district': 'Pokhara',
        'baglung nepal': 'Baglung', 'myagdi': 'Pokhara',
        'beni nepal': 'Pokhara', 'darchula': 'Dhangadhi',
        'birendranagar': 'Surkhet', 'kohalpur': 'Kohalpur',
        // Nepali language city names
        'काठमाडौँ': 'Katmandu', 'पोखरा': 'Pokhara',
        'भक्तपुर': 'Bhaktapur', 'ललितपुर': 'Lalitpur',
        'विराटनगर': 'Biratnagar', 'पाटन': 'Lalitpur',
        'जनकपुर': 'Janakpur', 'बुटवल': 'Butwal',
        'नेपालगञ्ज': 'Nepalganj',
        // DB cities without aliases
        'bandipur nepal': 'Bandipur', 'tansen': 'Tansen', 'phakding': 'Phakding',
        'syangboche': 'Syangboche', 'meghauli': 'Meghauli', 'lekhnath': 'Lekhnath',
    },
    // ── Scandinavia ────────────────────────────────────────────────────────────
    SE: {
        'gamla stan': 'Stockholm', 'sodermalm': 'Stockholm', 'ostermalm': 'Stockholm',
        'vasastan': 'Stockholm', 'kungsholmen': 'Stockholm', 'djurgarden': 'Stockholm',
        'hornstull': 'Stockholm', 'sickla': 'Stockholm', 'lidingo': 'Stockholm',
        'haga': 'Göteborg', 'linne': 'Göteborg', 'majorna': 'Göteborg',
        'haga gothenburg': 'Göteborg',
        'malmo old town': 'Malmö', 'hyllie': 'Malmö',
        // Stockholm more areas
        'nacka': 'Stockholm', 'sundbyberg': 'Stockholm', 'solna': 'Stockholm',
        'huddinge': 'Stockholm', 'haninge': 'Stockholm', 'tyreso': 'Stockholm',
        'norrtull': 'Stockholm', 'gardet': 'Stockholm', 'loudden': 'Stockholm',
        // Other Swedish cities
        'gothenburg city': 'Göteborg', 'lindholmen': 'Göteborg',
        'malmo city': 'Malmö', 'triangeln': 'Malmö',
        'uppsala': 'Uppsala', 'linkoping': 'Linköping', 'orebro': 'Örebro',
        'vasteras': 'Västerås', 'norrkoping': 'Norrköping',
        'helsingborg': 'Helsingborg', 'boras': 'Borås', 'jonkoping': 'Jönköping',
        'umea': 'Umea', 'lulea': 'Luleå', 'ostersund': 'Östersund',
        'sundsvall': 'Sundsvall', 'gavle': 'Gävle',
        'gotland': 'Visby', 'visby': 'Visby',
        'are': 'Are',
        // More Stockholm suburbs
        'taby': 'Stockholm', 'vallentuna': 'Stockholm', 'sigtuna': 'Stockholm',
        'nykoping': 'Nyköping', 'sodertalje': 'Södertälje', 'botkyrka': 'Stockholm',
        'nynashamn': 'Nynashamn', 'varmdo': 'Stockholm', 'vaxholm': 'Vaxholm',
        'skärholmen': 'Stockholm', 'vällingby': 'Stockholm', 'rinkeby': 'Stockholm',
        'tensta': 'Stockholm', 'husby stockholm': 'Stockholm', 'farsta': 'Stockholm',
        'alvsjö': 'Stockholm', 'brommaplanen': 'Stockholm', 'hagsatra': 'Stockholm',
        // More Swedish cities
        'kalmar city': 'Kalmar', 'lund city': 'Lund', 'landskrona': 'Landskrona',
        'trelleborg': 'Trelleborg', 'kristianstad': 'Kristianstad',
        'halmstad': 'Halmstad', 'varberg': 'Varberg', 'skövde': 'Skövde',
        'karlstad': 'Karlstad', 'trollhattan': 'Trollhattan', 'lidkoping': 'Lidköping',
        'falun': 'Falun', 'borlange': 'Borlange', 'sandviken': 'Sandviken',
        'harnosand': 'Härnösand', 'skelleftea': 'Skelleftea', 'kiruna': 'Kiruna',
        'gallivare': 'Gällivare', 'leksand': 'Leksand', 'rattvik': 'Rättvik',
        'mora dalarna': 'Mora', 'orsa dalarna': 'Orsa',
        'strangnas': 'Strängnäs', 'eskilstuna': 'Eskilstuna', 'vasteras city': 'Västerås',
        'linkoping city': 'Linköping', 'norrkoping city': 'Norrköping',
        'jonkoping city': 'Jönköping', 'vaxjo': 'Växjö', 'vaxjo city': 'Växjö',
        'karlskrona': 'Karlskrona', 'kalmar glass kingdom': 'Kalmar',
        'abisko': 'Kiruna', 'jokkmokk': 'Jokkmokk',
    },
    NO: {
        'aker brygge': 'Oslo', 'grunerlokka': 'Oslo', 'frogner': 'Oslo',
        'majorstuen': 'Oslo', 'toyen': 'Oslo', 'sentrum oslo': 'Oslo',
        'gronland': 'Oslo', 'bislett': 'Oslo', 'kampen': 'Oslo',
        'bryggen': 'Bergen', 'nordnes': 'Bergen',
        'trondheim city center': 'Trondheim',
        // Oslo more areas
        'st hanshaugen': 'Oslo', 'sagene': 'Oslo', 'grefsen': 'Oslo',
        'furuset': 'Oslo', 'stovner': 'Oslo', 'romsas': 'Oslo',
        'baerum': 'Oslo', 'sandvika': 'Oslo', 'asker': 'Oslo',
        // Bergen more areas
        'bergen city': 'Bergen', 'sandviken': 'Bergen', 'landas': 'Bergen',
        // Other Norwegian cities/areas
        'stavanger city': 'Stavanger', 'sandnes': 'Sandnes', 'stavanger sentrum': 'Stavanger',
        'kristiansand': 'Kristiansand', 'fredrikstad': 'Frederikstad',
        'drammen': 'Drammen', 'tromso': 'Tromsø', 'bodo': 'Bodø',
        'alesund': 'Ålesund', 'molde': 'Molde', 'lillehammer': 'Lillehammer',
        'geiranger': 'Geiranger', 'flam': 'Flam', 'gudvangen': 'Flam',
        'lofoten islands': 'Svolvaer', 'svolvaer': 'Svolvaer', 'reine lofoten': 'Svolvaer',
        // More Oslo areas
        'ekeberg oslo': 'Oslo', 'nordstrand': 'Oslo', 'sondre nordstrand': 'Oslo',
        'alna oslo': 'Oslo', 'ostensjø': 'Oslo', 'nordre aker': 'Oslo',
        'grorud': 'Oslo', 'stovner oslo': 'Oslo', 'holmlia': 'Oslo',
        'mortensrud': 'Oslo', 'ski oslo area': 'Oslo', 'akershus': 'Oslo',
        // Norwegian fjord / tourist areas
        'ulvik': 'Ulvik', 'eidfjord': 'Eidfjord', 'rosendal': 'Rosendal',
        'balestrand': 'Balestrand', 'leikanger': 'Leikanger', 'aurland': 'Aurland',
        'aurlandsvangen': 'Aurland', 'undredal': 'Aurland',
        'voss city': 'Voss', 'voss ski': 'Voss', 'stalheim': 'Voss',
        'andalsnes': 'Åndalsnes', 'valldal': 'Norddal', 'norddal': 'Norddal',
        'stryn': 'Stryn', 'loen': 'Loen', 'olden norway': 'Olden',
        'nordfjordeid': 'Stryn', 'gloppen': 'Sandane',
        // More Norwegian cities
        'gjøvik': 'Gjovik', 'hamar': 'Hamar', 'kongsberg': 'Kongsberg',
        'notodden': 'Notodden', 'skien': 'Skien', 'porsgrunn': 'Porsgrunn',
        'sandefjord': 'Sandefjord', 'tonsberg': 'Tønsberg', 'horten': 'Horten',
        'larvik': 'Larvik', 'moss norway': 'Moss', 'halden': 'Halden',
        'sarpsborg': 'Sarpsborg', 'askim': 'Frederikstad',
        // Arctic Norway
        'alta norway': 'Alta', 'hammerfest': 'Hammerfest',
        'narvik': 'Narvik', 'harstad': 'Harstad',
        'tromso city': 'Tromsø', 'tromso northern lights': 'Tromsø',
        'north cape': 'Honningsvag', 'honningsvag': 'Honningsvag',
        'kirkenes': 'Kirkenes', 'vardo': 'Vardo', 'vadsø': 'Vadso',
        'svalbard': 'Tromsø', 'longyearbyen': 'Tromsø', 'spitsbergen': 'Tromsø',
        // Trondheim extras
        'midtbyen trondheim': 'Trondheim', 'nedre elvehavn': 'Trondheim',
        'brattora': 'Trondheim', 'lerkendal': 'Trondheim',
    },
    DK: {
        'norrebro': 'Kopenhagen', 'vesterbro': 'Kopenhagen', 'frederiksberg': 'Frederiksberg',
        'christianshavn': 'Kopenhagen', 'indre by': 'Kopenhagen',
        'osterbro': 'Kopenhagen', 'amager': 'Kopenhagen', 'sydhavn': 'Kopenhagen',
        'kongens enghave': 'Kopenhagen', 'vanlose': 'Kopenhagen', 'bronshoj': 'Kopenhagen',
        'hellerup': 'Kopenhagen', 'gentofte': 'Kopenhagen', 'lyngby': 'Kopenhagen',
        'randers': 'Randers', 'silkeborg': 'Silkeborg',
        'aarhus city center': 'Aarhus', 'latin quarter aarhus': 'Aarhus',
        'odense city': 'Odense', 'aalborg city': 'Aalborg',
        'esbjerg': 'Esbjerg', 'roskilde': 'Roskilde',
        'elsinore': 'Helsingør', 'helsingor': 'Helsingør',
        'skagen': 'Skagen', 'bornholm island': 'Rønne',
        'ronne bornholm': 'Rønne', 'gudhjem': 'Gudhjem',
        'fanoe island': 'Fano', 'legoland area': 'Billund',
        // ── extended coverage ──
        'nyhavn': 'Copenhagen', 'christiania': 'Copenhagen',
        'orestad': 'Copenhagen', 'tivoli gardens': 'Copenhagen',
        'stroget': 'Copenhagen', 'kastrup': 'Copenhagen',
        'copenhagen airport': 'Copenhagen', 'valby': 'Copenhagen',
        'nordhavn': 'Copenhagen', 'refshaleoen': 'Copenhagen',
        'aarhus c': 'Aarhus', 'aros': 'Aarhus',
        'odense c': 'Odense', 'hans christian andersen': 'Odense',
        'aalborg c': 'Aalborg', 'jomfru ane gade': 'Aalborg',
        'kronborg': 'Helsingor', 'hillerod': 'Hillerod',
        'frederiksborg': 'Hillerod', 'billund': 'Billund',
        'legoland billund': 'Billund', 'ribe': 'Ribe',
        'kolding': 'Kolding', 'vejle': 'Vejle',
        'ronne': 'Ronne', 'bornholm': 'Ronne',
    },
    FI: {
        'kallio': 'Helsinki', 'kamppi': 'Helsinki', 'kruununhaka': 'Helsinki',
        'katajanokka': 'Helsinki', 'ullanlinna': 'Helsinki',
        'toolo': 'Helsinki', 'punavuori': 'Helsinki', 'eira': 'Helsinki',
        // Helsinki more areas
        'vallila': 'Helsinki', 'hermanni': 'Helsinki', 'pasila': 'Helsinki',
        'munkkiniemi': 'Helsinki', 'haaga': 'Helsinki', 'pitajanmaki': 'Helsinki',
        'lauttasaari': 'Helsinki', 'espoo': 'Espoo', 'tapiola': 'Espoo',
        'vantaa': 'Vantaa', 'tikkurila': 'Vantaa',
        // Other Finnish cities
        'turku city': 'Turku', 'forum turku': 'Turku',
        'tampere city': 'Tampere', 'tammelantori': 'Tampere',
        'oulu city': 'Oulu', 'jyvaskyla': 'Jyväskylä',
        'lahti': 'Lahti', 'kuopio': 'Kuopio', 'joensuu': 'Joensuu',
        'rovaniemi': 'Rovaniemi', 'santa claus village': 'Rovaniemi',
        'lapland finland': 'Rovaniemi', 'saariselka': 'Saariselkä',
        'levi finland': 'Kittilä', 'kittila': 'Kittilä',
        // More Helsinki neighborhoods
        'kapyla': 'Helsinki', 'kumpula': 'Helsinki', 'viikki': 'Helsinki',
        'vuosaari': 'Helsinki', 'itäkeskus': 'Helsinki', 'itakeskus': 'Helsinki',
        'kalasatama': 'Helsinki', 'herttoniemi': 'Helsinki', 'kulosaari': 'Helsinki',
        'mellunmaki': 'Helsinki', 'kontula': 'Helsinki', 'malmi': 'Helsinki',
        'jakomaki': 'Helsinki', 'tapanila': 'Helsinki', 'pukinmaki': 'Helsinki',
        'oulunkyla': 'Helsinki', 'pakila': 'Helsinki', 'tuomarila': 'Espoo',
        'otaniemi': 'Espoo', 'keilaniemi': 'Espoo', 'mankkaa': 'Espoo',
        'matinkyla': 'Espoo', 'olari': 'Espoo', 'niittykumpu': 'Espoo',
        // More Finnish cities
        'hämeenlinna': 'Hämeenlinna', 'hameenlinna': 'Hämeenlinna',
        'seinajoki': 'Seinäjoki', 'vaasa': 'Vaasa', 'kokkola': 'Kokkola',
        'rauma': 'Rauma', 'pori': 'Pori', 'mikkeli': 'Mikkeli',
        'savonlinna': 'Savonlinna', 'iisalmi': 'Iisalmi', 'kajaani': 'Kajaani',
        'kemi': 'Kemi', 'tornio': 'Tornio', 'kotka': 'Kotka', 'kouvola': 'Kouvola',
        'lappeenranta': 'Lappeenranta', 'imatra': 'Imatra', 'porvoo': 'Porvoo',
        'loviisa': 'Loviisa', 'hanko': 'Hanko', 'raseborg': 'Raseborg',
        'jarvenpaa': 'Jarvenpaa', 'kerava': 'Kerava', 'hyvinkaa': 'Hyvinkää',
        'riihimaki': 'Riihimaki', 'lohja': 'Lohja', 'salo': 'Turku',
        'nokia finland': 'Nokia', 'valkeakoski': 'Valkeakoski',
        'ylöjärvi': 'Ylojarvi', 'kangasala': 'Kangasala', 'lempaala': 'Lempäälä',
        'pirkkala': 'Pirkkala',
    },
    // ── Central/Eastern Europe additions ──────────────────────────────────────
    AT: {
        'innere stadt': 'Wien', 'mariahilf': 'Wien', 'neubau': 'Wien',
        'leopoldstadt': 'Wien', 'wieden': 'Wien', 'alsergrund': 'Wien',
        'josefstadt': 'Wien', 'favoriten': 'Wien', 'ottakring': 'Wien',
        'hernals': 'Wien', 'wahring': 'Wien',
        'donaustadt': 'Wien', 'simmering': 'Wien', 'liesing': 'Wien',
        'floridsdorf': 'Wien', 'brigittenau': 'Wien', 'meidling': 'Wien',
        'penzing': 'Wien', 'rudolfsheim': 'Wien', 'margareten': 'Wien',
        'altstadt salzburg': 'Salzburg', 'parsch': 'Salzburg',
        'nonntal': 'Salzburg', 'schallmoos': 'Salzburg',
        'innsbruck city center': 'Innsbruck', 'wilten': 'Innsbruck', 'pradl': 'Innsbruck',
        'hallstatt village': 'Hallstatt', 'bad ischl': 'Bad Ischl',
        'graz city': 'Graz', 'lend': 'Graz', 'geidorf': 'Graz', 'jakomini': 'Graz',
        'linz city': 'Linz', 'urfahr': 'Linz',
        'klagenfurt city': 'Klagenfurt am Wörthersee', 'woerther see': 'Klagenfurt am Wörthersee',
        'bregenz city': 'Bregenz', 'bodensee': 'Bregenz',
        'st polten': 'St. Pölten',
        'zell am see': 'Zell am See', 'kaprun': 'Kaprun',
        'kitzbuhel': 'Kitzbühel', 'st anton': 'Sankt Anton am Arlberg',
        'mayrhofen': 'Mayrhofen', 'saalbach': 'Saalbach',
        'seefeld tirol': 'Seefeld in Tirol',
        'bad gastein': 'Bad Gastein',
    },
    CH: {
        'old town zurich': 'Zürich', 'langstrasse': 'Zürich', 'wiedikon': 'Zürich',
        'seefeld': 'Zürich', 'riesbach': 'Zürich', 'hottingen': 'Zürich',
        'oerlikon': 'Zürich', 'affoltern': 'Zürich', 'schwamendingen': 'Zürich',
        'old town bern': 'Bern', 'lorraine': 'Bern',
        'bethlehem bern': 'Bern', 'kirchenfeld': 'Bern',
        'paquis': 'Genf', 'eaux-vives': 'Genf', 'plainpalais': 'Genf',
        'carouge': 'Genf', 'acacias': 'Genf',
        'ouchy': 'Lausanne', 'flon': 'Lausanne', 'prilly': 'Lausanne',
        'lucerne old town': 'Lucerne', 'tribschen': 'Lucerne',
        'basel city center': 'Basel', 'gundeldingen': 'Basel',
        'kleinbasel': 'Basel', 'grossbasel': 'Basel',
        'zermatt village': 'Zermatt', 'matterhorn area': 'Zermatt',
        'interlaken west': 'Interlaken', 'matten': 'Interlaken',
        'grindelwald': 'Grindelwald', 'wengen': 'Wengen', 'murren': 'Mürren',
        'montreux waterfront': 'Montreux', 'vevey': 'Vevey',
        'lugano city': 'Lugano', 'paradiso lugano': 'Lugano', 'castagnola': 'Lugano',
        'locarno city': 'Locarno', 'ascona': 'Ascona',
        'davos village': 'Davos', 'davos platz': 'Davos',
        'st moritz village': 'St. Moritz', 'pontresina': 'Pontresina',
        'klosters': 'Klosters-Serneus', 'arosa': 'Arosa', 'lenzerheide': 'Lenzerheide',
        'verbier village': 'Verbier', 'saas fee': 'Saas-Fee',
        'crans montana': 'Crans Montana',
        'winterthur city': 'Winterthur', 'st gallen': 'St. Gallen',
        'aarau city': 'Aarau', 'schaffhausen': 'Schaffhausen',
        'neuchatel': 'Neuenburg', 'fribourg city': 'Fribourg',
        'sion valais': 'Sitten',
    },
    BE: {
        'grand place': 'Brüssel', 'ixelles': 'Brüssel', 'saint-gilles': 'Brüssel',
        'molenbeek': 'Brüssel', 'uccle': 'Brüssel', 'schaerbeek': 'Brüssel',
        'etterbeek': 'Brüssel', 'laeken': 'Brüssel',
        'anderlecht': 'Brüssel', 'forest brussels': 'Brüssel', 'jette': 'Brüssel',
        'woluwe saint lambert': 'Brüssel', 'auderghem': 'Brüssel',
        'old town bruges': 'Brügge', 'sint-anna': 'Brügge',
        'damme': 'Brügge', 'zeebrugge': 'Brügge', 'knokke': 'Knokke-Heist',
        'antwerp city center': 'Antwerpen', 'eilandje': 'Antwerpen', 'berchem': 'Antwerpen',
        'zurenborg': 'Antwerpen', 'linkeroever': 'Antwerpen',
        'ghent city center': 'Gent', 'patershol': 'Gent',
        'korenmarkt': 'Gent', 'sint-pieters': 'Gent',
        'liege city': 'Lüttich', 'outremeuse': 'Lüttich',
        'namur city': 'Namur', 'dinant': 'Dinant',
        'leuven city': 'Löwen', 'mechelen city': 'Mechelen',
        'mons city': 'Mons', 'tournai city': 'Tournai',
        'spa belgium': 'Spa',
        // ── extended coverage ──
        'grote markt brussels': 'Brussels', 'elsene': 'Brussels',
        'saint gilles': 'Brussels', 'european quarter': 'Brussels',
        'atomium': 'Brussels', 'sablon': 'Brussels',
        'marolles': 'Brussels', 'zaventem': 'Brussels',
        'brugge': 'Bruges', 'markt bruges': 'Bruges',
        'minnewater': 'Bruges', 'gent': 'Ghent',
        'graslei': 'Ghent', 'gravensteen': 'Ghent',
        'antwerpen': 'Antwerp', 'meir': 'Antwerp',
        'het zuid': 'Antwerp', 'leuven': 'Leuven',
        'oude markt leuven': 'Leuven', 'mechelen': 'Mechelen',
        'liege': 'Liege', 'luik': 'Liege',
        'namur': 'Namur', 'durbuy': 'Durbuy',
        'ardennes': 'Bastogne', 'bastogne': 'Bastogne',
        'ostend': 'Ostend', 'oostende': 'Ostend',
        'knokke heist': 'Knokke-Heist', 'de haan': 'De Haan',
        'blankenberge': 'Blankenberge', 'ypres': 'Ypres',
        'ieper': 'Ypres', 'tournai': 'Tournai',
        'mons': 'Mons', 'charleroi': 'Charleroi',
        'hasselt': 'Hasselt',
    },
    RO: {
        'old town bucharest': 'Bukarest', 'floreasca': 'Bukarest', 'dorobanti': 'Bukarest',
        'herastrau': 'Bukarest', 'victoriei': 'Bukarest', 'unirii': 'Bukarest',
        'baneasa': 'Bukarest', 'ilfov': 'Bukarest', 'pipera': 'Bukarest',
        'pantelimon': 'Bukarest', 'militari': 'Bukarest', 'drumul taberei': 'Bukarest',
        'sector 1': 'Bukarest', 'sector 2': 'Bukarest', 'sector 3': 'Bukarest',
        'sector 4': 'Bukarest', 'sector 5': 'Bukarest', 'sector 6': 'Bukarest',
        'cluj napoca city center': 'Cluj-Napoca (Klausenburg)', 'manastur': 'Cluj-Napoca (Klausenburg)',
        'buna ziua': 'Cluj-Napoca (Klausenburg)', 'floresti cluj': 'Cluj-Napoca (Klausenburg)',
        'brasov old town': 'Brasov', 'schei': 'Brasov',
        'sinaia mountain resort': 'Sinaia', 'peles castle area': 'Sinaia',
        'predeal ski': 'Predeal', 'poiana brasov': 'Poiana Brasov',
        'timisoara city center': 'Timisoara', 'fabric timisoara': 'Timisoara',
        'iasi city': 'Iasi', 'copou': 'Iasi', 'tatarasi': 'Iasi',
        'constanta beach': 'Constanta', 'mamaia resort': 'Mamaia',
        'eforie nord': 'Constanta', 'neptun resort': 'Constanta',
        'venus resort': 'Constanta', 'aurora resort': 'Constanta',
        'sibiu old town': 'Sibiu', 'piata mare sibiu': 'Sibiu',
        'sighisoara old town': 'Sighisoara', 'dracula castle': 'Sighisoara',
        'bran castle area': 'Brasov', 'bran village': 'Brasov',
        'oradea city': 'Oradea', 'arad city': 'Arad',
        'targu mures': 'Targu Mures', 'piatra neamt': 'Piatra Neamt',
        'suceava city': 'Suceava', 'painted monasteries': 'Suceava',
        'tulcea': 'Tulcea', 'danube delta': 'Tulcea',
        'neptun beach': 'Constanta', 'jupiter resort': 'Constanta',
        // More Bucharest
        'cotroceni': 'Bukarest', 'grozavesti': 'Bukarest', 'titan bucharest': 'Bukarest',
        'colentina': 'Bukarest', 'obor': 'Bukarest', 'tei bucharest': 'Bukarest',
        'balta alba': 'Bukarest', 'voluntari': 'Bukarest', 'otopeni': 'Bukarest',
        'mogosoaia': 'Bukarest', 'afumati': 'Bukarest',
        // More Cluj-Napoca
        'gheorgheni cluj': 'Cluj-Napoca (Klausenburg)', 'gruia cluj': 'Cluj-Napoca (Klausenburg)',
        'zorilor cluj': 'Cluj-Napoca (Klausenburg)', 'iris cluj': 'Cluj-Napoca (Klausenburg)',
        'clujana': 'Cluj-Napoca (Klausenburg)', 'marasti cluj': 'Cluj-Napoca (Klausenburg)',
        // More Brasov
        'bartolomeu': 'Brasov', 'noua brasov': 'Brasov', 'astra brasov': 'Brasov',
        'stupini brasov': 'Brasov',
        // Mountain resorts
        'azuga': 'Azuga', 'busteni': 'Buşteni', 'bușteni resort': 'Buşteni',
        'sinaia ski': 'Sinaia', 'cota 2000': 'Sinaia',
        'ranca ski': 'Novaci', 'straja ski': 'Lupeni',
        'baile herculane': 'Băile Herculane', 'herculane spa': 'Băile Herculane',
        'baile felix': 'Oradea', 'baile tusnad': 'Băile Tuşnad',
        // Transylvania extras
        'alba iulia': 'Alba Iulia', 'miercurea ciuc': 'Miercurea-Ciuc',
        'sfantu gheorghe': 'Sfantu Gheorghe', 'zalau': 'Zalau',
        'deva city': 'Deva', 'hunedoara': 'Hunedoara', 'hunedoara castle': 'Hunedoara',
        'bistrita': 'Bistrita', 'nasaud': 'Bistrita',
        // Moldavia
        'bacau': 'Bacau', 'botosani': 'Botosani', 'roman city': 'Roman',
        'vaslui': 'Vaslui', 'focsani': 'Focsani', 'galati': 'Braila',
        'braila': 'Braila', 'buzau': 'Buzau',
        // South Romania
        'giurgiu': 'Giurgiu', 'calarasi': 'Călăraşi', 'slobozia': 'Slobozia',
        'alexandria romania': 'Alexandria', 'pitesti': 'Pitesti',
        'ramnicu valcea': 'Râmnicu Vâlcea', 'curtea de arges': 'Curtea de Argeş',
        'targoviste': 'Târgovişte', 'ploiesti': 'Ploiesti', 'campina': 'Campina',
        // Dobrogea coast extras
        'olimp resort': 'Constanta', 'saturn resort': 'Constanta',
        'cap aurora': 'Constanta', 'costinesti': 'Constanta', 'techirghiol': 'Constanta',
    },
    HR: {
        'old town dubrovnik': 'Dubrovnik', 'lapad': 'Dubrovnik', 'babin kuk': 'Dubrovnik',
        'ploce dubrovnik': 'Dubrovnik', 'gruz': 'Dubrovnik', 'old port dubrovnik': 'Dubrovnik',
        'gornji grad': 'Zagreb', 'donji grad': 'Zagreb', 'trnje': 'Zagreb',
        'gornji grad zagreb': 'Zagreb', 'maksimir': 'Zagreb', 'sesvete': 'Sesvete',
        'medvedgrad': 'Zagreb', 'samobor': 'Samobor',
        'old town split': 'Split', 'varos': 'Split', 'bacvice': 'Split',
        'meje split': 'Split', 'znjan': 'Split', 'kastela': 'Kastela',
        'trogir old town': 'Trogir', 'omis': 'Omis', 'makarska': 'Makarska',
        'brela': 'Brela', 'baska voda': 'Baška Voda', 'brist': 'Makarska',
        'stari grad hvar': 'Hvar', 'jelsa': 'Jelsa', 'hvar town': 'Hvar',
        'vrboska': 'Vrboska', 'milna hvar': 'Hvar',
        'korcula town': 'Korcula', 'lumbarda': 'Lumbarda', 'vela luka': 'Vela Luka',
        'zadar old town': 'Zadar', 'stara varos zadar': 'Zadar',
        'rovinj old town': 'Rovinj', 'bale': 'Bale',
        'pula old town': 'Pula', 'premantura': 'Premantura', 'medulin': 'Medulin',
        'porec old town': 'Porec', 'vrsar': 'Vrsar',
        'opatija riviera': 'Opatija', 'lovran': 'Lovran', 'icici': 'Opatija',
        'rijeka city': 'Rijeka', 'trsat': 'Rijeka',
        'krk island': 'Krk', 'krk town': 'Krk', 'baska krk': 'Baška', 'vrbnik': 'Vrbnik',
        'rab island': 'Rab', 'rab town': 'Rab',
        'pag island': 'Pag', 'pag town': 'Pag', 'novalja': 'Novalja',
        'vis island': 'Vis', 'vis town': 'Vis', 'komiza': 'Komiza',
        'brac island': 'Bol', 'bol brac': 'Bol', 'supetar': 'Bol',
        'sibenik old town': 'Šibenik', 'krka waterfalls': 'Šibenik',
        'losinj island': 'Mali Lošinj', 'cres island': 'Cres',
        'varazdin city': 'Varaždin', 'osijek city': 'Osijek',
        'plitvice lakes': 'Plitvička Jezera', 'slunj': 'Slunj',
        // More Zagreb areas
        'new zagreb': 'Zagreb', 'zapresic': 'Zaprešić', 'great gorica': 'Zagreb',
        'velika gorica': 'Velika Gorica', 'jastrebarsko': 'Zagreb', 'sveta nedelja': 'Zagreb',
        'stenjevec': 'Zagreb', 'podsused': 'Zagreb', 'lucko': 'Zagreb',
        'spansko': 'Zagreb', 'dubrava zagreb': 'Zagreb', 'resnik': 'Zagreb',
        // Dalmatia extras
        'split 3': 'Split', 'split west': 'Split', 'podstrana': 'Podstrana',
        'stobrec': 'Split', 'omis canyon': 'Omis', 'cetina river': 'Omis',
        'tucepi': 'Tucepi', 'gornja brela': 'Brela', 'promajna': 'Promajna',
        'drašnice': 'Drasnice', 'zivogosce': 'Živogošće',
        // Dubrovnik extras
        'slano': 'Slano', 'ston': 'Ston', 'orebic': 'Orebic',
        'cavtat': 'Cavtat', 'kolocep island': 'Dubrovnik', 'lopud island': 'Dubrovnik',
        'mljet island': 'Mljet', 'pomena': 'Mljet',
        // Zadar extras
        'nin zadar': 'Zadar', 'petrcane': 'Petrčane', 'privlaka zadar': 'Privlaka',
        'pag bridge': 'Pag', 'biograd na moru': 'Biograd na Moru',
        'pakostane': 'Pakostane', 'turanj zadar': 'Zadar',
        // Istria extras
        'labin': 'Labin', 'rabac': 'Rabac', 'novigrad': 'Novigrad',
        'umag': 'Umag', 'buje': 'Buje', 'brtonigla': 'Brtonigla',
        'fazana': 'Fazana', 'bale istria': 'Bale', 'kanfanar': 'Kanfanar',
        'sveti rovinjsko': 'Rovinj', 'peroj': 'Peroj', 'marčana': 'Marcana',
        'fažana': 'Fazana', 'brijuni': 'Pula', 'brijuni islands': 'Pula',
        'poreč riviera': 'Porec', 'funtana': 'Funtana', 'tar': 'Tar',
        'vilanela': 'Porec',
        // Kvarner extras
        'crikvenica': 'Crikvenica', 'dramalj': 'Dramalj', 'selce': 'Selce',
        'novi vinodolski': 'Novi Vinodolski', 'sibinj krmpoti': 'Novi Vinodolski',
        'senj': 'Senj', 'starigrad paklenica': 'Starigrad Paklenica',
        'paklenica national park': 'Starigrad Paklenica',
        'velebit mountain': 'Starigrad Paklenica', 'prematura': 'Premantura',
        // Inland Croatia
        'koprivnica': 'Koprivnica', 'bjelovar': 'Bjelovar',
        'sisak croatia': 'Sisak', 'petrinja': 'Sisak', 'karlovac': 'Karlovac',
        'krapina croatia': 'Varaždin', 'čakovec': 'Cakovec',
        'stubicke toplice': 'Zabok', 'terme tuhelj': 'Zabok',
        'tuheljske toplice': 'Zabok',
    },
    RS: {
        'stari grad': 'Belgrad', 'savamala': 'Belgrad', 'vracar': 'Belgrad',
        'zemun': 'Belgrad', 'novi beograd': 'Belgrad', 'palilula': 'Belgrad',
        'vozdovac': 'Belgrad', 'cukarica': 'Belgrad', 'rakovica': 'Belgrad',
        'grocka': 'Belgrad', 'surcin': 'Belgrad', 'obrenovac': 'Belgrad',
        'novi sad old town': 'Novi Sad', 'liman': 'Novi Sad', 'detelinara': 'Novi Sad',
        'petrovaradin': 'Novi Sad', 'futog': 'Novi Sad',
        'nis city': 'Niš', 'nisava': 'Niš',
        'kragujevac': 'Kragujevac', 'subotica': 'Subotica',
        'novi pazar': 'Novi Pazar', 'kopaonik ski': 'Kopaonik',
        'zlatibor mountain': 'Uzice', 'uzice': 'Uzice',
        'vrnjacka banja': 'Vrnjačka Banja',
        'palic lake': 'Subotica',
        // More Belgrade areas
        'banjica': 'Belgrad', 'konjarnik': 'Belgrad',
        'dedinje': 'Belgrad', 'senjak': 'Belgrad', 'autokomanda': 'Belgrad',
        'miljakovac': 'Belgrad', 'banovo brdo': 'Belgrad', 'makis': 'Belgrad',
        'resnik': 'Belgrad', 'mirijevo': 'Belgrad', 'kaluderica': 'Belgrad',
        'borca': 'Belgrad', 'ovca': 'Belgrad', 'zvezdara': 'Belgrad',
        'karaburma': 'Belgrad', 'borča': 'Belgrad', 'kotez': 'Belgrad',
        'ruzica': 'Belgrad',
        // Novi Sad extras
        'rotkvarija': 'Novi Sad', 'salajka': 'Novi Sad', 'grbavica novi sad': 'Novi Sad',
        'klisa': 'Novi Sad', 'adice': 'Novi Sad', 'novo naselje': 'Novi Sad',
        'sremska kamenica': 'Novi Sad', 'bocvar': 'Novi Sad',
        'sremski karlovci': 'Sremski Karlovci',
        // Other Serbian cities
        'subotica city': 'Subotica', 'bajmok': 'Subotica',
        'cacak': 'Cacak', 'sabac': 'Sabac',
        'negotin': 'Negotin',
        'prokuplje': 'Prokuplje', 'leskovac': 'Leskovac', 'vranje': 'Vranje',
        'pirot serbia': 'Pirot', 'dimitrovgrad': 'Dimitrovgrad',
        'jagodina': 'Jagodina',
        'krusevac': 'Krusevac', 'paracin': 'Paraćin',
        'smederevo': 'Smederevo', 'pozarevac': 'Smederevo',
        'ram fortress': 'Smederevo', 'viminacium': 'Smederevo',
        'kladovo': 'Kladovo', 'djerdap gorge': 'Kladovo',
        // Nature/tourism
        'tara mountain': 'Bajina Basta', 'bajina basta': 'Bajina Basta',
        'drina river': 'Bajina Basta', 'perucac lake': 'Bajina Basta',
        'divcibare': 'Divcibare', 'fruska gora': 'Novi Sad',
        'soko banja': 'Sokobanja',
    },
    BG: {
        'city center sofia': 'Sofia', 'lozenets': 'Sofia', 'mladost': 'Sofia',
        'vitosha boulevard': 'Sofia', 'oborishte': 'Sofia',
        'lyulin': 'Sofia', 'nadezhda sofia': 'Sofia', 'studentski grad': 'Sofia',
        'boyana': 'Sofia', 'dragalevtsi': 'Sofia', 'bankya': 'Bankya',
        'old town plovdiv': 'Plovdiv', 'kapana': 'Plovdiv',
        'kamenitsa': 'Plovdiv', 'plovdiv center': 'Plovdiv',
        'varna beach': 'Varna', 'golden sands': 'Goldstrand',
        'varna city center': 'Varna', 'briz varna': 'Varna',
        'sunny beach': 'Nessebar', 'nessebar old town': 'Nessebar',
        'sozopol': 'Sozopol', 'pomorie': 'Pomorie',
        'obzor resort': 'Obzor', 'elenite resort': 'Elenite',
        'sveti vlas': 'Sveti Vlas', 'saint vlas': 'Sveti Vlas',
        'burgas city': 'Burgas', 'sozopol old town': 'Sozopol',
        'bansko ski resort': 'Bansko', 'bansko village': 'Bansko',
        'borovets ski': 'Bansko', 'pamporovo ski': 'Pamporovo',
        'koprivshtitsa': 'Koprivshtitsa', 'tryavna': 'Trjawna',
        'veliko tarnovo old town': 'Veliko Tarnovo', 'tsarevets': 'Veliko Tarnovo',
        'arbanasi village': 'Arbanasi',
        'ruse city': 'Rousse', 'gabrovo': 'Gabrovo',
        'vidin fortress': 'Vidin', 'montana city': 'Montana',
        'pleven city': 'Pleven', 'kazanlak': 'Kasanlak', 'rose valley': 'Kasanlak',
        // More Sofia areas
        'manastirski livadi': 'Sofia', 'geo milev': 'Sofia', 'gotse delchev sofia': 'Sofia',
        'iztok sofia': 'Sofia', 'reduta': 'Sofia', 'darvenitsa': 'Sofia',
        'mladost 1': 'Sofia', 'mladost 2': 'Sofia', 'mladost 3': 'Sofia', 'mladost 4': 'Sofia',
        'druzhba sofia': 'Sofia', 'zaharna fabrika': 'Sofia', 'moderno predgradie': 'Sofia',
        'serdika sofia': 'Sofia', 'nadezhda': 'Sofia', 'iliyane': 'Sofia',
        'ovcha kupel': 'Sofia', 'krasna polyana': 'Sofia',
        'orlandovtsi': 'Sofia', 'poduyane': 'Sofia', 'gurmen': 'Sofia',
        // Ski extras
        'vitosha ski': 'Sofia', 'aleko vitosha': 'Sofia', 'cherni vrah': 'Sofia',
        // More Black Sea
        'albena resort': 'Albena', 'kavarna city': 'Kavarna',
        'balchik resort': 'Balchik', 'balchik botanical garden': 'Balchik',
        'shabla cape': 'Kavarna', 'durankulak': 'Kavarna',
        'byala beach': 'Byala', 'kranevo': 'Albena',
        'ravda': 'Ravda', 'aheloy': 'Aheloy',
        'primorsko': 'Primorsko', 'kiten beach': 'Kiten', 'lozenets beach': 'Lozenets',
        'tsarevo': 'Tsarevo', 'ahtopol': 'Akhtopol',
        // Heritage & nature
        'plovdiv hills': 'Plovdiv', 'rhodope mountains': 'Plovdiv',
        'smolyan': 'Smolyan', 'devin spa': 'Devin', 'shiroka laka': 'Devin',
        'pamporovo mountain': 'Pamporovo', 'stoykite': 'Pamporovo',
        'chepelare': 'Chepelare', 'progled': 'Chepelare',
        'velingrad spa': 'Welingrad', 'velingrad thermal': 'Welingrad',
        'hisarya': 'Hisarja', 'banya rosa': 'Hisarja',
        'troyan': 'Troyan', 'troyan monastery': 'Troyan',
        'belogradchik': 'Vidin', 'belogradchik rocks': 'Vidin',
        'vratsa': 'Vratsa', 'ledenika cave': 'Vratsa',
        // More interior cities
        'lovech city': 'Lovech', 'teteven': 'Tetewen', 'sevlievo': 'Sevlievo',
        'elena bulgaria': 'Gabrovo', 'dryanovo': 'Gabrovo',
        'svilengrad': 'Svilengrad', 'harmanli': 'Haskovo',
        'haskovo': 'Haskovo', 'kardzhali': 'Kardzali',
        'gotse delchev': 'Sandanski', 'sandanski': 'Sandanski',
        'petrich': 'Petrich', 'blagoevgrad': 'Blagoevgrad',
        'dupnitsa': 'Dupniza', 'kyustendil': 'Kjustendil',
    },
    UA: {
        'podil': 'Kyiv', 'pechersk': 'Kyiv', 'shevchenkivskyi': 'Kyiv',
        'obolon': 'Kyiv', 'svyatoshyn': 'Kyiv',
        // More Kyiv neighborhoods
        'kyiv city center': 'Kyiv', 'khreshchatyk': 'Kyiv',
        'maidan nezalezhnosti': 'Kyiv', 'old kyiv': 'Kyiv',
        'sofiyivska square': 'Kyiv', 'holosiiv': 'Kyiv',
        'darnytsia': 'Kyiv', 'desnyansky': 'Kyiv', 'darnytsya': 'Kyiv',
        'pozniaky': 'Kyiv', 'troyeshchyna': 'Kyiv', 'bortnychi': 'Kyiv',
        'vyrlytsia': 'Kyiv', 'rusanivka': 'Kyiv', 'hydropark kyiv': 'Kyiv',
        'left bank kyiv': 'Kyiv', 'right bank kyiv': 'Kyiv',
        // Other Ukrainian cities
        'lviv city center': 'Lemberg', 'market square lviv': 'Lemberg',
        'rynok square': 'Lemberg', 'lychakiv': 'Lemberg', 'sykhiv': 'Lemberg',
        'kharkiv city': 'Kharkiv', 'sumska kharkiv': 'Kharkiv',
        'naukova kharkiv': 'Kharkiv',
        'odessa city': 'Odessa', 'odesa city': 'Odessa',
        'deribasivska': 'Odessa', 'arcadia odessa': 'Odessa',
        'langeron beach': 'Odessa', 'odessa beach': 'Odessa',
        'dnipro city': 'Dnipro', 'dnipropetrovsk': 'Dnipro',
        'zaporizhzhia city': 'Dnipro',
        'mykolaiv ukraine': 'Mykolaiv', 'chernivtsi': 'Chernovtsy',
        'poltava city': 'Poltawa', 'sumy city': 'Ssume',
        'zhytomyr city': 'Kiev', 'vinnytsia': 'Winnyzja',
        'khmelnytskyi ukraine': 'Winnyzja', 'rivne ukraine': 'Rovno',
        'uzhhorod': 'Ushhorod', 'ivano-frankivsk': 'Iwano-Frankiwsk',
        'ternopil ukraine': 'Iwano-Frankiwsk', 'lutsk ukraine': 'Lutsk',
        'cherkasy ukraine': 'Kiev', 'kropyvnytskyi': 'Dnipro',
        'bukovel ski resort': 'Jaremtsche', 'yaremche': 'Jaremtsche',
        'mukachevo': 'Ushhorod', 'kamianets-podilskyi': 'Kamjanez-Podilskyj',
        'berdyansk beach': 'Berdyansk',
    },
    // ── Africa additions ───────────────────────────────────────────────────────
    NG: {
        'victoria island': 'Lagos', 'ikoyi': 'Lagos', 'lekki': 'Lekki',
        'vi lagos': 'Lagos', 'yaba': 'Lagos', 'ikeja': 'Lagos',
        'surulere': 'Lagos', 'maryland lagos': 'Lagos', 'ajah': 'Lagos',
        'eko atlantic': 'Lagos', 'oniru': 'Lagos',
        'wuse': 'Abuja', 'maitama': 'Abuja', 'garki': 'Abuja', 'asokoro': 'Abuja',
        'gudu': 'Abuja', 'gwarinpa': 'Gwarinpa',
        // More Lagos areas
        'banana island': 'Lagos', 'chevron lagos': 'Lagos', 'ilaje': 'Lagos',
        'badagry': 'Lagos', 'epe': 'Epe', 'ikorodu': 'Ikorodu',
        'festac': 'Lagos', 'amuwo odofin': 'Lagos', 'oshodi': 'Lagos',
        'mushin': 'Lagos', 'isale eko': 'Lagos', 'lagos island': 'Lagos',
        // More Abuja areas
        'lifecamp': 'Abuja', 'kado': 'Abuja', 'wuye': 'Abuja',
        'jabi': 'Abuja', 'utako': 'Abuja', 'lugbe': 'Abuja',
        'kubwa': 'Abuja', 'gwagwalada': 'Abuja',
        // Other Nigerian cities
        'kano city': 'Kano', 'sabon gari kano': 'Kano', 'nassarawa kano': 'Kano',
        'ibadan city': 'Ibadan', 'bodija': 'Ibadan', 'ring road ibadan': 'Ibadan',
        'port harcourt city': 'Port Harcourt', 'gra port harcourt': 'Port Harcourt',
        'trans amadi': 'Port Harcourt', 'rumuola': 'Port Harcourt',
        'benin city': 'Benin City', 'sapele road': 'Benin City',
        'calabar city': 'Calabar', 'marina calabar': 'Calabar',
        'enugu city': 'Enugu', 'independence layout': 'Enugu',
        'onitsha': 'Onitsha', 'aba': 'Aba', 'owerri': 'Owerri',
        'asaba': 'Asaba', 'warri': 'Warri', 'uyo': 'Uyo',
        'jos city': 'Jos', 'zaria': 'Kaduna', 'kaduna city': 'Kaduna',
        'maiduguri': 'Maiduguri', 'bauchi': 'Bauchi', 'sokoto': 'Sokoto',
        'ilorin': 'Ilorin', 'osogbo': 'Oshogbo', 'akure': 'Akure',
        'ile ife': 'Ife', 'abeokuta': 'Abeokuta',
        // Lagos extra areas
        'victoria island extension': 'Lagos', 'lekki phase 1': 'Lekki Phase 1', 'lekki phase 2': 'Lekki',
        'jakande': 'Lagos', 'osapa london': 'Lagos', 'chevron drive': 'Lagos',
        'sangotedo': 'Lagos', 'ajah eti osa': 'Lagos', 'abraham adesanya': 'Lagos',
        'awoyaya': 'Awoyaya', 'igbo efon': 'Lagos', 'ilasan': 'Lagos',
        'ogudu': 'Lagos', 'ojota': 'Lagos', 'gbagada': 'Lagos', 'palmgrove': 'Lagos',
        'shomolu': 'Lagos', 'bariga': 'Lagos', 'akoka': 'Lagos',
        'apapa': 'Lagos', 'ajegunle': 'Lagos', 'alimosho': 'Lagos',
        'ipaja': 'Lagos', 'agege': 'Lagos', 'egbeda': 'Lagos', 'dopemu': 'Lagos',
        'magodo': 'Lagos', 'kosofe': 'Lagos', 'mile 12': 'Lagos', 'ketu': 'Lagos',
        // Abuja extra areas
        'central business district abuja': 'Abuja', 'area 1 abuja': 'Abuja',
        'area 2 abuja': 'Abuja', 'area 3 abuja': 'Abuja', 'area 11 abuja': 'Abuja',
        'wuse 2': 'Abuja', 'utako abuja': 'Abuja', 'jabi abuja': 'Abuja',
        'gwarinpa abuja': 'Gwarinpa', 'gaduwa': 'Abuja', 'apo abuja': 'Abuja',
        'lokogoma': 'Abuja', 'cadastral zone': 'Abuja', 'katampe': 'Abuja',
        'plot 1 abuja': 'Abuja', 'nnpc filling station abuja': 'Abuja',
        'dei dei': 'Abuja', 'kuje': 'Abuja', 'bwari': 'Abuja',
        // Other Nigerian cities expanded
        'ibadan challenge': 'Ibadan', 'dugbe': 'Ibadan', 'oke-ado': 'Ibadan',
        'agodi': 'Ibadan', 'jericho': 'Ibadan', 'oluyole': 'Ibadan',
        'gra kano': 'Kano', 'fagge': 'Kano', 'dala kano': 'Kano',
        'anambra': 'Awka', 'awka': 'Awka', 'nnewi': 'Onitsha',
        'abakaliki': 'Enugu', 'orlu': 'Owerri', 'okigwe': 'Owerri',
        'damaturu': 'Maiduguri', 'gombe nigeria': 'Gombe', 'yola': 'Jalingo',
        'lafia nasarawa': 'Makurdi', 'makurdi benue': 'Makurdi',
        'lokoja nigeria': 'Lokoja', 'anyigba': 'Lokoja',
    },
    GH: {
        'airport residential': 'Accra', 'osu': 'Accra', 'labone': 'Accra',
        'cantonments': 'Accra', 'east legon': 'Accra', 'adabraka': 'Accra',
        'dzorwulu': 'Accra', 'north legon': 'Accra', 'tema': 'Accra',
        'kumasi city center': 'Kumasi',
        // More Accra areas
        'accra mall area': 'Accra', 'spintex': 'Accra', 'community 25': 'Accra',
        'madina': 'Accra', 'legon': 'Accra', 'haatso': 'Accra',
        'achimota': 'Accra', 'dansoman': 'Accra', 'darkuman': 'Accra',
        'lapaz': 'Accra', 'tesano': 'Accra', 'ring road accra': 'Accra',
        'korle bu': 'Accra', 'okaishie': 'Accra',
        // Other Ghana cities
        'takoradi': 'Takoradi', 'sekondi': 'Takoradi', 'cape coast': 'Accra',
        'elmina': 'Accra', 'tamale': 'Tamale', 'bolgatanga': 'Bolgatanga',
        'wa ghana': 'Wa', 'sunyani': 'Sunyani', 'koforidua': 'Accra',
        'ho ghana': 'Accra', 'hohoe': 'Accra',
        // More Ghana areas
        'kotoka': 'Accra', 'ridge accra': 'Accra', 'roman ridge': 'Accra',
        'teshie': 'Accra', 'labadi': 'Accra', 'la accra': 'Accra',
        'osu oxford street': 'Accra', 'nungua': 'Accra', 'kwabenya': 'Accra',
        'dome accra': 'Accra', 'ashale botwe': 'Accra', 'adenta': 'Accra',
        'ashaiman': 'Tema', 'community 1 tema': 'Tema', 'community 7 tema': 'Tema',
        'prampram': 'Tema', 'assin fosu': 'Kumasi',
        'obuasi': 'Obuasi', 'ejisu': 'Kumasi', 'asante akyem': 'Kumasi',
        'techiman': 'Accra', 'berekum': 'Kumasi', 'kintampo': 'Accra',
        'nkawkaw': 'Nkawkaw', 'suhum': 'Accra', 'nsawam': 'Accra',
        'kasoa': 'Kasoa', 'winneba': 'Accra', 'saltpond': 'Accra',
        'takoradi beach': 'Takoradi', 'sekondi takoradi': 'Takoradi',
        'axim ghana': 'Accra', 'half assini': 'Accra',
    },
    TZ: {
        'stone town': 'Stone Town', 'nungwi': 'Nungwi',
        'paje': 'Paje', 'jambiani': 'Jambiani', 'kiwengwa': 'Kiwengwa',
        'msasani': 'Daressalam', 'oyster bay': 'Daressalam',
        'kariakoo': 'Daressalam',
        'arusha city': 'Arusha',
        // More Zanzibar areas
        'matemwe': 'Matemwe', 'pwani mchangani': 'Pwani Mchangani', 'chwaka bay': 'Sansibar',
        'bwejuu': 'Bwejuu', 'uroa': 'Sansibar', 'pingwe': 'Pingwe',
        'dongwe': 'Dongwe', 'michamvi': 'Michamvi',
        'kidichi': 'Sansibar', 'maruhubi': 'Sansibar',
        // More Dar es Salaam
        'masaki': 'Daressalam', 'ada estate': 'Daressalam', 'oysterbay': 'Daressalam',
        'mikocheni': 'Daressalam', 'sinza': 'Daressalam', 'kinondoni': 'Daressalam',
        'ilala': 'Daressalam', 'temeke': 'Daressalam', 'posta': 'Daressalam',
        'mbezi beach': 'Daressalam', 'kunduchi': 'Daressalam',
        // Mainland Tanzania
        'moshi': 'Moshi', 'kilimanjaro': 'Moshi', 'marangu': 'Moshi',
        'serengeti': 'Seronera', 'seronera': 'Seronera',
        'ngorongoro': 'Karatu', 'karatu': 'Karatu',
        'tarangire': 'Arusha', 'lake manyara': 'Arusha',
        'zanzibar city': 'Sansibar', 'mwanza': 'Mwanza', 'lake victoria': 'Mwanza',
        'dodoma': 'Dodoma', 'iringa': 'Iringa', 'mbeya': 'Mbeya',
        'mafia island': 'Mafia',
        // More Tanzania
        'dar es salaam city': 'Daressalam', 'upanga': 'Daressalam',
        'magomeni': 'Daressalam', 'mwenge': 'Daressalam', 'tegeta': 'Daressalam',
        'bunju': 'Daressalam', 'bunju beach': 'Daressalam',
        'bagamoyo': 'Bagamoyo', 'pangani': 'Pangani', 'tanga city': 'Tanga',
        'pemba island tanzania': 'Pemba Island', 'chake chake': 'Pemba Island',
        'wete pemba': 'Pemba Island', 'mkoani pemba': 'Pemba Island',
        'zanzibar town': 'Sansibar', 'forodhani gardens': 'Sansibar',
        'fumba zanzibar': 'Fumba', 'bwejuu zanzibar': 'Bwejuu',
        'kilwa masoko': 'Kilwa Masoko', 'kilwa tanzania': 'Kilwa Masoko',
        'mikindani': 'Mtwara', 'mtwara city': 'Mtwara',
        'lindi city': 'Mtwara', 'masasi': 'Mtwara',
        'mbeya city': 'Mbeya', 'tukuyu': 'Mbeya', 'kyela': 'Mbeya',
        'morogoro city': 'Morogoro', 'mikumi': 'Morogoro',
        'tabora city': 'Kigoma', 'kigoma city': 'Kigoma',
        'lake tanganyika': 'Kigoma', 'ujiji': 'Kigoma',
        'mwanza city': 'Mwanza', 'lake victoria tanzania': 'Mwanza',
        'bukoba': 'Bukoba', 'musoma': 'Musoma',
        'tarangire park': 'Arusha',
        'moshi kilimanjaro': 'Moshi', 'marangu route': 'Moshi', 'machame route': 'Moshi',
    },
    UG: {
        'kololo': 'Kampala', 'nakasero': 'Kampala', 'kabalagala': 'Kampala',
        'ntinda': 'Kampala', 'muyenga': 'Kampala',
        // More Kampala neighborhoods
        'bugolobi': 'Kampala', 'luzira': 'Kampala', 'mutungo': 'Kampala',
        'naguru': 'Kampala', 'bukoto': 'Kampala', 'kisaasi': 'Kampala',
        'naalya': 'Kampala', 'kira': 'Kampala', 'wakiso': 'Kampala',
        'entebbe': 'Entebbe', 'entebbe beach': 'Entebbe',
        // Uganda tourism
        'bwindi': 'Kabale', 'kabale': 'Kabale', 'gorilla trekking': 'Kabale',
        'lake mburo': 'Mbarara', 'mbarara': 'Mbarara',
        'queen elizabeth park': 'Fort Portal', 'kasese': 'Fort Portal', 'rwenzori': 'Fort Portal',
        'jinja': 'Jinja', 'source of the nile': 'Jinja',
        'fort portal': 'Fort Portal', 'kibale forest': 'Fort Portal',
        'gulu': 'Gulu',
    },
    ET: {
        'bole': 'Addis Ababa', 'kazanchis': 'Addis Ababa', 'piazza addis': 'Addis Ababa',
        'old airport addis': 'Addis Ababa',
        // More Addis Ababa
        'sarbet': 'Addis Ababa', 'kotebe': 'Addis Ababa', 'yeka': 'Addis Ababa',
        'lideta': 'Addis Ababa', 'kirkos': 'Addis Ababa', 'arada': 'Addis Ababa',
        'akaki': 'Addis Ababa', 'nifas silk': 'Addis Ababa',
        // Other Ethiopian cities
        'lalibela': 'Lalibela', 'lalibela churches': 'Lalibela',
        'axum': 'Axum', 'obelisk axum': 'Axum',
        'gondar': 'Gondar', 'fasilides': 'Gondar',
        'bahir dar': 'Bahir Dar', 'lake tana': 'Bahir Dar', 'blue nile falls': 'Bahir Dar',
        'dire dawa': 'Dire Dawa', 'harar': 'Harar', 'harar old city': 'Harar',
        'jimma': 'Jimma', 'arba minch': 'Arba Minch',
        'awash national park': 'Awash', 'meki': 'Ziway', 'lake ziway': 'Ziway',
        // More Addis Ababa sub-kebeles
        'bole bulbula': 'Addis Ababa', 'megenagna': 'Addis Ababa', 'arat kilo': 'Addis Ababa',
        'sidist kilo': 'Addis Ababa', 'mexico addis': 'Addis Ababa', 'torhailoch': 'Addis Ababa',
        'mercato': 'Addis Ababa', 'kera addis': 'Addis Ababa', 'kolfe': 'Addis Ababa',
        // More Ethiopian cities
        'adama': 'Adama', 'nazret': 'Adama', 'hawassa city': 'Hawassa',
        'mekelle': 'Mekelle', 'mek ele': 'Mekelle',
        'dessie city': 'Dessie', 'kombolcha': 'Kombolcha',
        'shashemene': 'Shashemene', 'dilla ethiopia': 'Dilla',
        'sodo wolaita': 'Wolaita Sodo', 'gimbi ethiopia': 'Gimbi',
        'nekemte': 'Nekemte', 'ambo ethiopia': 'Ambo',
        // Omo Valley
        'turmi omo valley': 'Turmi', 'key afer': 'Key Afer', 'jinka ethiopia': 'Jinka',
        // More heritage
        'tiya stelae': 'Tiya', 'melka kunture': 'Addis Ababa',
    },
    MU: {
        'grand baie': 'Mauritius', 'flic en flac': 'Mauritius', 'trou aux biches': 'Mauritius',
        'blue bay': 'Mauritius', 'belle mare': 'Mauritius', 'mahebourg': 'Mauritius',
        'port louis waterfront': 'Port Louis',
        // More Mauritius areas
        'pamplemousses': 'Pamplemousses', 'quatre bornes': 'Quatre Bornes',
        'curepipe': 'Curepipe', 'vacoas': 'Vacoas', 'phoenix mauritius': 'Phoenix',
        'goodlands mauritius': 'Goodlands', 'flacq mauritius': 'Flacq',
        'riviere du rempart': 'Rivière du Rempart', 'souillac': 'Souillac',
        'rodrigues island': 'Port Mathurin',
        // ── extended coverage ──
        'grand bay mauritius': 'Mauritius', 'pereybere': 'Mauritius',
        'mont choisy': 'Mauritius', 'balaclava': 'Mauritius',
        'pointe aux piments': 'Mauritius', 'tamarin': 'Mauritius',
        'le morne': 'Mauritius', 'riviere noire': 'Mauritius',
        'black river mauritius': 'Mauritius', 'bel ombre': 'Mauritius',
        'blue bay mauritius': 'Mauritius', 'trou deau douce': 'Mauritius',
        'palmar': 'Mauritius', 'poste lafayette': 'Mauritius',
        'ile aux cerfs': 'Mauritius', 'chamarel': 'Mauritius',
        'albion mauritius': 'Mauritius', 'pointe desny': 'Mauritius',
        'port louis centre': 'Port Louis', 'caudan waterfront': 'Port Louis',
        'rodrigues': 'Port Mathurin', 'grand port': 'Mahebourg',
    },
    SC: {
        'beau vallon': 'Insel Mahe', 'victoria seychelles': 'Insel Mahe',
        'anse lazio': 'Insel Praslin', 'anse georgette': 'Insel Praslin',
        'grande anse la digue': 'La Digue',
        // More Seychelles
        'mahe island': 'Insel Mahe', 'anse royale': 'Insel Mahe', 'anse intendance': 'Insel Mahe',
        'praslin island': 'Insel Praslin', 'grand anse praslin': 'Insel Praslin',
        'la digue island': 'La Digue', 'anse source d argent': 'La Digue',
        'silhouette island': 'Insel Silhouette', 'bird island sc': 'Bird Island',
        'inner islands seychelles': 'Insel Mahe',
        // ── extended coverage ──
        'mahe seychelles': 'Victoria', 'takamaka': 'Takamaka',
        'baie lazare': 'Baie Lazare', 'glacis': 'Glacis',
        'bel ombre seychelles': 'Bel Ombre', 'eden island': 'Victoria',
        'cote dor': 'Baie Sainte Anne', 'anse volbert': 'Baie Sainte Anne',
        'baie sainte anne': 'Baie Sainte Anne', 'vallee de mai': 'Baie Sainte Anne',
        // La Passe is the island's village and holds no hotels in the catalog;
        // all 53 are filed under the island name. Same shape as the Maui aliases
        // that pointed at Kahului: the alias redirected a search away from the
        // inventory rather than towards it.
        'la digue': 'La Digue', 'la passe': 'La Digue',
        'anse source dargent': 'La Passe', 'bird island seychelles': 'Victoria',
    },
    MV: {
        'male city': 'Male', 'hulhumale': 'Male',
        'maafushi': 'Maafushi',
        // More Maldives atolls
        'addu atoll': 'Addu City', 'hithadhoo': 'Addu City',
        'fuvahmulah': 'Fuvahmulah', 'laamu atoll': 'Fonadhoo',
        'baa atoll': 'Baa Atoll', 'raa atoll': 'Ugoofaaru',
        'noonu atoll': 'Ungoofaaru', 'north male atoll': 'Male',
        'south male atoll': 'South Male Atoll', 'ari atoll': 'Mahibadhoo',
        'thaa atoll': 'Veymandoo', 'gaafu alifu': 'Vilamendhoo',
        // More atolls / islands
        'gaafu dhaalu': 'Thinadhoo', 'thinadhoo': 'Thinadhoo',
        'dhaalu atoll': 'Kudahuvadhoo', 'kudahuvadhoo': 'Kudahuvadhoo',
        'faafu atoll': 'Magoodhoo', 'vaavu atoll': 'Felidhoo',
        'meemu atoll': 'Muli', 'shaviyani atoll': 'Funadhoo',
        'haa alifu': 'Dhidhdhoo', 'haa dhaalu': 'Kulhudhuffushi',
        'kulhudhuffushi': 'Kulhudhuffushi',
        'lhaviyani atoll': 'Naifaru', 'naifaru': 'Naifaru',
        'alifu alifu': 'Rasdhoo', 'rasdhoo': 'Rasdhoo',
        // Male / Hulhumale extras
        'hulhumale phase 2': 'Male', 'villingili': 'Male',
        'male atoll': 'Male', 'kaafu atoll': 'Male',
        // Popular resort islands by common name
        'veligandu': 'Rasdhoo', 'mirihi island': 'Mahibadhoo',
        'biyadhoo': 'Male', 'coco palm': 'Dharavandhoo',
        'huvahendhoo': 'Mahibadhoo',
        'velassaru': 'Male', 'baros maldives': 'Male',
        'four seasons maldives': 'Baa Atoll', 'baa atoll resort': 'Dharavandhoo',
        'hanifaru bay': 'Dharavandhoo',
        // Seenu / Addu extras
        'gan island addu': 'Addu City', 'hithadhoo addu': 'Addu City',
        'maradhoo': 'Addu City', 'feydhoo addu': 'Addu City',
        // ── extended coverage ──
        'velana airport': 'Male', 'gulhi': 'Gulhi',
        'thulusdhoo': 'Thulusdhoo', 'dhigurah': 'Dhigurah',
        'ukulhas': 'Ukulhas', 'fulidhoo': 'Fulidhoo',
        'eydhafushi': 'Eydhafushi', 'kuredu': 'Naifaru',
        'dhangethi': 'Dhangethi',
    },
    // ── Caribbean / Central America ────────────────────────────────────────────
    DO: {
        'zona colonial': 'Santo Domingo', 'naco': 'Santo Domingo', 'piantini': 'Santo Domingo',
        'bavaro': 'Bavaro', 'los corales': 'Punta Cana', 'cap cana': 'Punta Cana',
        'las terrenas': 'Las Terrenas', 'cabarete': 'Cabarete',
        // DR expanded
        'santiago dr': 'Santiago de los Caballeros', 'santiago centro': 'Santiago de los Caballeros',
        'la romana city': 'La Romana', 'bayahibe': 'Bayahibe',
        'samana peninsula': 'Samana', 'samana city': 'Samana',
        'puerto plata city': 'Puerto Plata', 'sosua beach': 'Sosua',
        'constanza': 'Constanza', 'jarabacoa': 'Jarabacoa',
        'barahona city': 'Barahona', 'pedernales': 'Pedernales',
        'san pedro de macoris': 'San Pedro', 'la vega': 'La Vega',
        'monte cristi': 'San Fernando de Monte Cristi', 'nagua city': 'Nagua',
        // ── extended coverage ──
        'uvero alto': 'Punta Cana', 'cortecito': 'Punta Cana',
        'macao beach': 'Punta Cana', 'punta cana airport': 'Punta Cana',
        'colonial zone': 'Santo Domingo', 'gazcue': 'Santo Domingo',
        'malecon santo domingo': 'Santo Domingo', 'boca chica': 'Boca Chica',
        'juan dolio': 'Juan Dolio', 'la romana': 'La Romana',
        'casa de campo': 'La Romana', 'saona island': 'Bayahibe',
        'puerto plata': 'Puerto Plata', 'playa dorada': 'Puerto Plata',
        'sosua': 'Sosua', 'samana': 'Samana',
        'las galeras': 'Las Galeras', 'el limon': 'Samana',
        'santiago de los caballeros': 'Santiago', 'barahona': 'Barahona',
        'bahia de las aguilas': 'Pedernales',
    },
    JM: {
        'negril west end': 'Negril', 'seven mile beach': 'Negril',
        'hip strip': 'Montego Bay', 'doctors cave': 'Montego Bay',
        'new kingston': 'Kingston', 'ocho rios': 'Ocho Rios',
        // Jamaica expanded
        'rose hall montego bay': 'Montego Bay', 'reading montego bay': 'Montego Bay',
        'falmouth jamaica': 'Falmouth', 'runaway bay': 'Runaway Bay',
        'port antonio': 'Port Antonio (und Umgebung)', 'boston bay': 'Port Antonio (und Umgebung)',
        'mandeville jamaica': 'Mandeville', 'spanish town': 'Spanish Town',
        'half moon bay jamaica': 'Montego Bay', 'tryall estate': 'Montego Bay',
        'treasure beach': 'Treasure Beach', 'black river': 'Black River',
        'kingston downtown': 'Kingston', 'half way tree': 'Kingston', 'liguanea': 'Kingston',
        // ── extended coverage ──
        'seven mile beach negril': 'Negril', 'negril cliffs': 'Negril',
        'west end negril': 'Negril', 'bloody bay': 'Negril',
        'gloucester avenue': 'Montego Bay', 'rose hall': 'Montego Bay',
        'ironshore': 'Montego Bay', 'doctors cave beach': 'Montego Bay',
        'dunns river falls': 'Ocho Rios', 'mystic mountain': 'Ocho Rios',
        'discovery bay': 'Discovery Bay', 'downtown kingston': 'Kingston',
        'bob marley museum': 'Kingston', 'port royal': 'Kingston',
        'blue mountains jamaica': 'Kingston', 'frenchmans cove': 'Port Antonio',
        'ysfalls': 'Saint Elizabeth', 'trelawny': 'Falmouth',
        'mandeville': 'Mandeville', 'portmore': 'Portmore',
        'silver sands': 'Duncans',
    },
    BS: {
        'nassau downtown': 'Nassau', 'cable beach': 'Nassau', 'paradise island': 'Nassau',
        'grand bahama': 'Freeport', 'freeport bahamas': 'Freeport',
        'exuma': 'Exuma', 'harbour island': 'Harbour Island', 'eleuthera': 'Eleuthera',
        'abaco': 'Marsh Harbour', 'bimini': 'Bimini', 'andros bahamas': 'Andros Town',
        'long island bahamas': 'Long Island', 'cat island': 'Cat Island',
        'san salvador bahamas': 'San Salvador',
        // ── extended coverage ──
        'atlantis bahamas': 'Nassau', 'downtown nassau': 'Nassau',
        'bay street': 'Nassau', 'love beach': 'Nassau',
        'west bay street': 'Nassau', 'lucaya': 'Freeport',
        'port lucaya': 'Freeport', 'great exuma': 'George Town',
        'staniel cay': 'Staniel Cay', 'dunmore town': 'Dunmore Town',
        'governors harbour': 'Governors Harbour', 'marsh harbour': 'Marsh Harbour',
        'hope town': 'Hope Town', 'cat island bahamas': 'New Bight',
    },
    CR: {
        'tamarindo': 'Tamarindo', 'nosara': 'Nosara',
        'manuel antonio': 'Quepos', 'la fortuna': 'La Fortuna',
        'escazu': 'Escazu', 'san pedro': 'San Pedro', 'sabana': 'San Jose',
        'monteverde': 'Monteverde', 'jaco beach': 'Jaco', 'santa teresa cr': 'Santa Teresa',
        // Costa Rica expanded
        'arenal volcano': 'La Fortuna', 'tabacon': 'La Fortuna',
        'rincon de la vieja': 'Rincón de la Vieja', 'liberia costa rica': 'Liberia',
        'playa flamingo': 'Playa Flamingo', 'playa conchal': 'Playa Flamingo', 'playa potrero': 'Playa Flamingo',
        'playa hermosa guanacaste': 'Hermosa', 'papagayo peninsula': 'Papagayo',
        'playa del coco': 'Coco', 'ocotal': 'Coco',
        'playa grande cr': 'Playa Grande', 'playa langosta': 'Tamarindo',
        'santa teresa mal pais': 'Santa Teresa', 'cabuya': 'Cabuya',
        'montezuma cr': 'Montezuma', 'paquera': 'Paquera', 'tambor': 'Tambor',
        'playa samara': 'Samara', 'carrillo beach': 'Samara', 'hojancha': 'Nicoya',
        'uvita beach': 'Uvita', 'dominical beach': 'Dominical',
        'sierpe cr': 'Sierpe', 'bahia drake': 'Drake Bay', 'drake bay': 'Drake Bay',
        'osa peninsula': 'Puerto Jimenez', 'corcovado': 'Puerto Jimenez',
        'puerto viejo limon': 'Puerto Viejo', 'cahuita': 'Cahuita',
        'tortuguero costa rica': 'Tortuguero', 'sarapiqui': 'Sarapiquí',
        'turrialba': 'Turrialba', 'cartago city': 'Cartago', 'heredia city': 'Heredia',
        'alajuela city': 'Alajuela', 'volcan poas': 'Alajuela',
    },
    GT: {
        'zona viva': 'Guatemala-Stadt', 'zona 10': 'Guatemala-Stadt', 'zona 4': 'Guatemala-Stadt',
        'antigua guatemala': 'Antigua Guatemala',
        // Guatemala expanded
        'antigua centro': 'Antigua Guatemala', 'santa catalina arch': 'Antigua Guatemala',
        'lake atitlan': 'Panajachel', 'panajachel': 'Panajachel',
        'san pedro la laguna': 'San Pedro La Laguna', 'san marcos la laguna': 'San Marcos La Laguna',
        'santiago atitlan': 'Santiago Atitlán',
        'chichicastenango': 'Chichicastenango', 'quetzaltenango': 'Quetzaltenango',
        'xela': 'Quetzaltenango', 'xelaju': 'Quetzaltenango',
        'flores peten': 'Flores', 'flores tikal area': 'Flores', 'tikal ruins': 'Flores',
        'livingston guatemala': 'Livingston', 'puerto barrios': 'Puerto Barrios',
        'coban alta verapaz': 'Cobán', 'semuc champey': 'Cobán',
        'huehuetenango': 'Huehuetenango', 'todos santos cuchumatan': 'Huehuetenango',
        'retalhuleu': 'Retalhuleu', 'santa rosa': 'Cuilapa',
        // ── extended coverage ──
        'zona 1 guatemala': 'Guatemala City', 'la antigua': 'Antigua',
        'acatenango': 'Antigua', 'santa cruz la laguna': 'Santa Cruz La Laguna',
        'tikal': 'Flores', 'el remate': 'Flores',
        'lanquin': 'Lanquin', 'coban': 'Cobán',
        'rio dulce': 'Rio Dulce', 'monterrico': 'Monterrico',
    },
    PA: {
        'casco viejo': 'Panama', 'punta pacifica': 'Panama',
        'marbella': 'Panama', 'san francisco panama': 'Panama',
        'el cangrejo': 'Panama', 'obarrio': 'Panama',
        'bocas del toro town': 'Bocas del Toro',
        // Panama expanded
        'bella vista panama': 'Panama', 'costa del este': 'Panama',
        'clayton panama': 'Panama', 'ancón': 'Panama', 'albrook': 'Panama',
        'paitilla': 'Panama', 'punta paitilla': 'Panama',
        'tocumen airport area': 'Panama', 'juan diaz': 'Panama',
        'colon city panama': 'Colon', 'colon free zone': 'Colon',
        'san blas islands': 'Carti', 'guna yala': 'Carti',
        'bocas del toro archipelago': 'Bocas del Toro', 'isla colon': 'Bocas del Toro',
        'isla bastimentos': 'Bocas del Toro', 'red frog beach': 'Bocas del Toro',
        'boquete': 'Alto Boquete', 'volcan panama': 'Volcan',
        'david chiriqui': 'David', 'chiriqui city': 'David',
        'pedasí': 'Pedasí', 'pedasi panama': 'Pedasí',
        'playa venao': 'Pedasí', 'azuero peninsula': 'Chitré',
        'chitre city': 'Chitré', 'villa de los santos': 'Las Tablas',
        'las tablas panama': 'Las Tablas', 'el valle de anton': 'El Valle',
        // ── extended coverage ──
        'casco antiguo': 'Panama City', 'amador causeway': 'Panama City',
        'panama canal': 'Panama City', 'bocas del toro': 'Bocas del Toro',
        'bastimentos': 'Bocas del Toro', 'david panama': 'David',
        'santa catalina panama': 'Santa Catalina', 'coiba': 'Santa Catalina',
        'san blas': 'El Porvenir', 'playa blanca panama': 'Rio Hato',
        'rio hato': 'Rio Hato', 'coronado panama': 'Coronado',
        'pedasi': 'Pedasí', 'las tablas': 'Las Tablas',
        'portobelo': 'Portobelo', 'colon panama': 'Colon',
    },
    CU: {
        'habana vieja': 'Havana', 'vedado': 'Havana', 'miramar': 'Havana',
        'varadero beach': 'Varadero',
        // Cuba expanded
        'havana centro': 'Havana', 'centro habana': 'Havana',
        'playa havana': 'Havana', 'kohly': 'Havana',
        'trinidad cuba': 'Trinidad', 'plaza mayor trinidad': 'Trinidad',
        'sancti spiritus': 'Sancti Spiritus', 'cienfuegos city': 'Cienfuegos',
        'santa clara cuba': 'Santa Clara', 'che guevara mausoleum': 'Santa Clara',
        'camaguey city': 'Camagüey', 'holguin city': 'Ol’gin',
        'santiago de cuba': 'Santiago de Cuba', 'moncada barracks area': 'Santiago de Cuba',
        'guardalavaca': 'Guardalavaca', 'banes cuba': 'Banes',
        'baracoa cuba': 'Baracoa', 'pinar del rio': 'Pinar del Río',
        'vinales': 'Viñales', 'vinales valley': 'Viñales',
        'cayo coco': 'Cayo Coco', 'cayo guillermo': 'Cayo Guillermo',
        'cayo santa maria': 'Cayo Santa Maria', 'cayo largo del sur': 'Cayo Largo del Sur',
        'matanzas city': 'Matanzas',
        // ── extended coverage ──
        'old havana': 'Havana', 'miramar havana': 'Havana',
        'malecon havana': 'Havana', 'hicacos': 'Varadero',
        'cayo largo': 'Cayo Largo del Sur', 'playa ancon': 'Trinidad',
        'cienfuegos': 'Cienfuegos', 'camaguey': 'Camagüey',
        'holguin': 'Holguin', 'baracoa': 'Baracoa',
        'matanzas': 'Matanzas', 'guanabo': 'Havana',
    },
    BB: {
        'bridgetown city': 'Bridgetown',
        'holetown': 'Holetown', 'speightstown': 'Speightstown',
        'oistins': 'Oistins',
        // Barbados parishes and areas
        'worthing': 'Bridgetown', 'hastings barbados': 'Bridgetown', 'garrison': 'Bridgetown',
        'bay street barbados': 'Bridgetown', 'fontabelle': 'Bridgetown', 'cheapside barbados': 'Bridgetown',
        'queen street barbados': 'Bridgetown', 'trafalgar square': 'Bridgetown',
        'christ church barbados': 'Oistins', 'dover barbados': 'Oistins', 'maxwell': 'Oistins',
        'enterprise beach': 'Oistins', 'silver sands': 'Oistins', 'grantley adams airport': 'Oistins',
        'rockley': 'Bridgetown', 'accra beach': 'Bridgetown', 'st lawrence gap': 'Bridgetown',
        'bathsheba': 'Bathsheba', 'cattlewash': 'Bathsheba', 'tent bay': 'Bathsheba',
        'crane beach': 'Crane', 'sam lords': 'Crane',
        'mullins bay': 'Speightstown', 'six mens bay': 'Speightstown',
        'alleynes bay': 'Holetown', 'paynes bay': 'Holetown', 'sandy lane': 'Holetown',
        'west coast barbados': 'Holetown', 'coral reef barbados': 'Holetown',
        'bathsheba east coast': 'Bathsheba', 'martin bay': 'Bathsheba',
        'st james barbados': 'Holetown', 'st peter barbados': 'Speightstown',
        'st philip barbados': 'Crane', 'st joseph barbados': 'Bathsheba',
        'st andrew barbados': 'Bathsheba', 'st thomas barbados': 'Bridgetown',
        'st george barbados': 'Bridgetown', 'st michael barbados': 'Bridgetown',
        'st lucy barbados': 'Speightstown', 'north point barbados': 'Speightstown',
        'animal flower cave': 'Speightstown', 'farley hill': 'Speightstown',
    },
    // ── Oceania additions ──────────────────────────────────────────────────────
    FJ: {
        'denarau': 'Nadi', 'port denarau': 'Nadi',
        'suva city center': 'Suva', 'coral coast': 'Sigatoka', 'savusavu': 'Savusavu',
        // Fiji expanded
        'nadi city': 'Nadi', 'nadi airport area': 'Nadi', 'lautoka': 'Lautoka',
        'ba fiji': 'Ba', 'tavua': 'Tavua',
        'mamanuca islands': 'Nadi', 'matamanoa': 'Nadi', 'malolo lailai': 'Nadi',
        'castaway island': 'Nadi', 'tokoriki': 'Nadi', 'mana island fiji': 'Nadi',
        'yasawa islands': 'Lautoka', 'blue lagoon fiji': 'Lautoka',
        'naviti island': 'Lautoka', 'waya island': 'Lautoka',
        'pacific harbour': 'Pacific Harbour', 'beqa lagoon': 'Pacific Harbour',
        'sigatoka sand dunes': 'Sigatoka', 'natadola beach': 'Sigatoka',
        'levuka': 'Levuka', 'ovalau': 'Levuka',
        'labasa': 'Labasa', 'taveuni': 'Taveuni', 'bouma falls': 'Taveuni',
        'kadavu island': 'Kadavu', 'great astrolabe reef': 'Kadavu',
        'vanua levu': 'Savusavu',
        // ── extended coverage ──
        'nadi town': 'Nadi', 'denarau island': 'Nadi',
        'wailoaloa': 'Nadi', 'martintar': 'Nadi',
        'suva centre': 'Suva', 'coral coast fiji': 'Sigatoka',
        'sigatoka': 'Sigatoka', 'natadola': 'Sigatoka',
        'korotogo': 'Sigatoka', 'mamanuca': 'Nadi',
        'malolo': 'Nadi', 'yasawa': 'Nacula',
        'nacula': 'Nacula', 'nanuya': 'Nacula',
        'rainbow reef': 'Taveuni', 'somosomo': 'Taveuni',
        'kadavu': 'Vunisea', 'rakiraki': 'Rakiraki',
    },
    PF: {
        'papeete city': 'Papeete', 'bora bora motu': 'Bora Bora', 'vaitape': 'Bora Bora',
        'moorea beach': 'Moorea',
        // French Polynesia expanded
        'bora bora lagoon': 'Bora Bora', 'matira beach': 'Bora Bora',
        'point matira': 'Bora Bora', 'motu tapu': 'Bora Bora',
        'moorea haapiti': 'Moorea', 'cook bay moorea': 'Moorea',
        'opunohu bay': 'Moorea', 'temae beach moorea': 'Moorea',
        'huahine island': 'Huahine', 'fare huahine': 'Fare',
        'raiatea island': 'Uturoa', 'uturoa': 'Uturoa', 'tahaa island': 'Uturoa',
        'fakarava': 'Fakarava', 'rangiroa atoll': 'Rangiroa',
        'avatoru rangiroa': 'Rangiroa', 'tiputa rangiroa': 'Rangiroa',
        'manihi': 'Manihi', 'tikehau': 'Tikehau',
        'bora bora mainland': 'Bora Bora', 'anau bora bora': 'Bora Bora',
        'rurutu': 'Rurutu', 'tubuai': 'Tubuai', 'australes islands': 'Rurutu',
        'marquesas islands': 'Nuku Hiva', 'nuku hiva': 'Nuku Hiva', 'hiva oa': 'Hiva Oa',
        'atuona hiva oa': 'Hiva Oa', 'taiohae': 'Nuku Hiva',
        'tahiti city': 'Papeete', 'faa a': 'Papeete', 'pirae': 'Papeete',
        'puna auia': 'Papeete', 'arue tahiti': 'Papeete', 'mahina tahiti': 'Mahina',
        'taravao tahiti': 'Taravao', 'teahupoo': "Teahupo'o",
        'maupiti island': 'Maupiti',
        // ── extended coverage ──
        'papeete centre': 'Papeete', 'punaauia': 'Punaauia',
        'faaa': 'Faaa', 'arue': 'Arue',
        'mahina': 'Mahina', 'moorea': 'Moorea',
        'cooks bay': 'Moorea', 'opunohu': 'Moorea',
        'temae': 'Moorea', 'bora bora': 'Bora Bora',
        'huahine': 'Fare', 'raiatea': 'Uturoa',
        'taha a': 'Taha’a', 'rangiroa': 'Avatoru',
        'avatoru': 'Avatoru', 'rotoava': 'Rotoava',
        'atuona': 'Atuona', 'tuamotu': 'Avatoru',
        'marquesas': 'Taiohae', 'tetiaroa': 'Arue',
        'maupiti': 'Maupiti',
    },
    WS: {
        'apia waterfront': 'Apia',
        // Samoa expanded
        'apia city': 'Apia', 'apia faleolo': 'Apia',
        'lalomanu beach': 'Lalomanu', 'aleipata': 'Lalomanu',
        'savaii island': 'Salelologa', 'salelologa': 'Salelologa',
        'saleaula': 'Salelologa', 'le mafa pass': 'Salelologa',
        'to sua trench': 'Lotofaga', 'o le pupu pu e': 'Faleolosalesita',
        'mulifanua wharf': 'Apia', 'vailima samoa': 'Apia',
        'siumu beach': 'Siumu', 'falealupo samoa': 'Falealupo',
        'manono island': 'Manono', 'apolima island': 'Apolima',
        'sili savaii': 'Salelologa', 'lano beach': 'Salelologa',
        'palauli savaii': 'Salelologa', 'sataua samoa': 'Sataua',
        'asau airport samoa': 'Asau', 'falelima samoa': 'Falelima',
        // ── extended coverage ──
        'apia centre': 'Apia', 'upolu': 'Apia',
        'mulifanua': 'Mulifanua', 'lalomanu': 'Lalomanu',
        'to sua ocean trench': 'Lotofaga', 'lotofaga': 'Lotofaga',
        'manase': 'Manase', 'savaii': 'Salelologa',
        'alofaaga blowholes': 'Salelologa', 'falealupo': 'Falealupo',
        'saleapaga': 'Saleapaga', 'matareva': 'Lefaga',
        'return to paradise beach': 'Lefaga', 'piula cave pool': 'Apia',
        'robert louis stevenson museum': 'Apia',
    },
    // ── Iceland ────────────────────────────────────────────────────────────────
    IS: {
        'old harbour reykjavik': 'Reykjavík', '101 reykjavik': 'Reykjavík',
        'laugardalur': 'Reykjavík', 'vesturbær': 'Reykjavík', 'hafnarfjordur': 'Reykjavík',
        'akureyri town': 'Akureyri',
        'vik iceland': 'Vik I Myrdal',
        // ── extended coverage ──
        'reykjavik downtown': 'Reykjavík', 'laugavegur': 'Reykjavík',
        'hallgrimskirkja': 'Reykjavík', 'harpa': 'Reykjavík',
        'kopavogur': 'Reykjavík', 'gardabaer': 'Reykjavík',
        'seltjarnarnes': 'Reykjavík', 'blue lagoon': 'Grindavik',
        'grindavik': 'Grindavik', 'keflavik airport': 'Keflavik',
        'reykjanes': 'Keflavik', 'golden circle': 'Selfoss',
        'geysir': 'Selfoss', 'gullfoss': 'Selfoss',
        'thingvellir': 'Selfoss', 'hveragerdi': 'Hveragerdi',
        'seljalandsfoss': 'Hvolsvollur', 'skogafoss': 'Skogar',
        'hvolsvollur': 'Hvolsvollur', 'vik i myrdal': 'Vik I Myrdal',
        'reynisfjara': 'Vik I Myrdal', 'jokulsarlon': 'Hofn',
        'skaftafell': 'Kirkjubaejarklaustur', 'hofn': 'Hofn',
        'akureyri downtown': 'Akureyri', 'north iceland': 'Akureyri',
        'myvatn': 'Reykjahlid', 'lake myvatn': 'Reykjahlid',
        'husavik': 'Husavik', 'dettifoss': 'Husavik',
        'egilsstadir': 'Egilsstadir', 'seydisfjordur': 'Seydisfjordur',
        'isafjordur': 'Isafjordur', 'westfjords': 'Isafjordur',
        'snaefellsnes': 'Grundarfjordur', 'kirkjufell': 'Grundarfjordur',
        'borgarnes': 'Borgarnes', 'stykkisholmur': 'Stykkisholmur',
    },
    // ── Monaco ────────────────────────────────────────────────────────────────
    MC: {
        'monte carlo': 'Monaco', 'port hercule': 'Monaco', 'la condamine': 'Monaco',
        'fontvieille': 'Monaco', 'monaco ville': 'Monaco',
        // ── extended coverage ──
        'monte-carlo': 'Monaco', 'le rocher': 'Monaco',
        'larvotto': 'Monaco', 'casino square': 'Monaco',
        'monaco grand prix': 'Monaco', 'jardin exotique': 'Monaco',
    },
    // ── Malta ─────────────────────────────────────────────────────────────────
    MT: {
        'sliema': 'Valletta', 'st julians': 'Valletta', 'paceville': 'Valletta',
        'mdina': 'Valletta', 'marsaskala': 'Valletta', 'marsaxlokk': 'Valletta',
        'bugibba': 'St. Paul\'s Bay', 'qawra': 'St. Paul\'s Bay',
        'golden bay malta': 'Mellieha', 'mellieha bay': 'Mellieha',
        'gozo island': 'Victoria', 'victoria gozo': 'Victoria', 'xlendi': 'Victoria',
        // ── extended coverage ──
        'valletta waterfront': 'Valletta', 'floriana': 'Valletta',
        'republic street': 'Valletta', 'sliema promenade': 'Valletta',
        'the strand sliema': 'Valletta', 'gzira': 'Valletta',
        'ta xbiex': 'Valletta', 'msida': 'Valletta',
        "st julian's": 'Valletta', 'spinola bay': 'Valletta',
        'portomaso': 'Valletta', 'three cities': 'Valletta',
        'vittoriosa': 'Valletta', 'birgu': 'Valletta',
        'senglea': 'Valletta', 'cospicua': 'Valletta',
        'silent city': 'Valletta', 'rabat malta': 'Valletta',
        'mosta': 'Valletta', 'naxxar': 'Valletta',
        'attard': 'Valletta', 'xemxija': "St. Paul's Bay",
        'st pauls bay': "St. Paul's Bay", 'cirkewwa': 'Mellieha',
        'mellieha town': 'Mellieha', 'blue grotto': 'Valletta',
        'zurrieq': 'Valletta', 'marsascala': 'Valletta',
        'birzebbuga': 'Valletta', 'rabat gozo': 'Victoria',
        'marsalforn': 'Victoria', 'xaghra': 'Victoria',
        'ramla bay': 'Victoria', 'comino': 'Victoria',
        'blue lagoon comino': 'Victoria',
    },
    // ── Cyprus ────────────────────────────────────────────────────────────────
    CY: {
        // TGX canonical: Nikosia / Larnaka / Girne (not Nicosia / Larnaca / Kyrenia)
        'limassol marina': 'Limassol', 'old limassol': 'Limassol',
        'old nicosia': 'Nikosia', 'laiki yitonia': 'Nikosia', 'engomi': 'Nikosia',
        'paphos old town': 'Paphos', 'kato paphos': 'Paphos', 'coral bay': 'Paphos',
        'ayia napa beach': 'Ayia Napa', 'protaras': 'Protaras', 'fig tree bay': 'Protaras',
        'larnaca city': 'Larnaka', 'finikoudes': 'Larnaka',
        'polis chrysochous': 'Poli Crysochous', 'polis cy': 'Poli Crysochous',
        // Paralimni — 711 hotels, biggest city in DB, was entirely missing
        'paralimni': 'Paralimni', 'paralimni beach': 'Paralimni',
        'protaras paralimni': 'Paralimni', 'dhekelia': 'Paralimni',
        // Limassol
        'limassol city': 'Limassol', 'columbia limassol': 'Limassol',
        'mesa geitonia': 'Limassol', 'omonia limassol': 'Limassol',
        'zakaki': 'Limassol', 'amathus': 'Limassol', 'governor beach': 'Limassol',
        // Germasogeia / Agios Tychonas — TGX has them as separate cities
        'germasogeia': 'Germasogeia', 'germasogeia village': 'Germasogeia',
        'agios tychonas': 'Agios Tychonas',
        // Nicosia (Nikosia in TGX)
        'nicosia': 'Nikosia', 'nicosia city': 'Nikosia',
        'aglandjia': 'Nikosia', 'anthoupolis': 'Nikosia', 'latsia': 'Latsia',
        'green line nicosia': 'Nikosia', 'ledra street': 'Nikosia',
        'venetian walls nicosia': 'Nikosia',
        // Strovolos — TGX has it separately (30 hotels)
        'strovolos': 'Strovolos',
        // Paphos
        'paphos city': 'Paphos', 'paphos harbour': 'Paphos',
        'kings avenue paphos': 'Paphos', 'agios georgios': 'Paphos',
        // Peyia / Chlorakas — TGX has them as own cities (195 / 56 hotels)
        'peyia': 'Peyia', 'sea caves peyia': 'Peyia',
        'chloraka': 'Chlorakas', 'chlorakas paphos': 'Chlorakas',
        // Kouklia — 116 hotels
        'kouklia': 'Kouklia', 'aphrodite hills': 'Kouklia',
        // Pissouri — 46 hotels
        'pissouri': 'Pissouri', 'pissouri bay': 'Pissouri',
        // Troodos mountains — Kakopetria is its own TGX city (29 hotels)
        'troodos': 'Troodos', 'troodos village': 'Troodos',
        'platres': 'Platres', 'agros village': 'Troodos',
        'prodromos': 'Troodos', 'cedar valley': 'Troodos', 'kykkos monastery': 'Troodos',
        'kakopetria': 'Kakopetria', 'kakopetria village': 'Kakopetria',
        // North Cyprus — TGX uses Girne (65 hotels) not Kyrenia
        'kyrenia': 'Girne', 'girne': 'Girne', 'kyrenia harbour': 'Girne',
        'famagusta': 'Famagusta', 'gazimağusa': 'Famagusta',
        'varosha famagusta': 'Famagusta', 'salamis ruins': 'Famagusta',
        'morphou': 'Morphou', 'guzelyurt': 'Morphou',
        'north nicosia': 'North Nicosia', 'lefkoşa': 'North Nicosia',
        'bellapais abbey': 'Girne', 'kantara castle': 'Famagusta',
        'karpaz peninsula': 'Famagusta', 'apostolos andreas': 'Famagusta',
        // Larnaka area
        'larnaca': 'Larnaka', 'larnaca salt lake': 'Larnaka',
        'hala sultan tekke': 'Larnaka', 'kiti village': 'Larnaka',
        'lefkara village': 'Lefkara', 'lefkara': 'Lefkara',
        // Ayia Napa / Protaras
        'nissi beach': 'Ayia Napa', 'makronissos beach': 'Ayia Napa',
        'cape greco': 'Ayia Napa',
        // Limassol villages
        'omodos': 'Limassol',
        // Greek/Turkish language names
        'Λευκωσία': 'Nikosia', 'Λεμεσός': 'Limassol',
        'Πάφος': 'Paphos', 'Λάρνακα': 'Larnaka',
        'Αμμόχωστος': 'Famagusta', 'Κύπρος': 'Nikosia',
        'Lefkoşa': 'Nikosia', 'Kıbrıs': 'Nikosia',
    },
    // ── Baltic States ─────────────────────────────────────────────────────────
    EE: {
        'old town tallinn': 'Tallinn', 'toompea': 'Tallinn', 'kalamaja': 'Tallinn',
        'telliskivi': 'Tallinn', 'kadriorg': 'Tallinn', 'pirita': 'Tallinn',
        'tartu old town': 'Tartu', 'tartu city': 'Tartu',
        'parnu beach': 'Pärnu',
        // More Tallinn neighborhoods
        'mustamae': 'Tallinn', 'lasnamae': 'Tallinn', 'pohja-tallinn': 'Tallinn',
        'haabersti': 'Tallinn', 'kristiine': 'Tallinn', 'nomme': 'Tallinn',
        'uspenski cathedral tallinn': 'Tallinn', 'viru gate': 'Tallinn',
        'tallinn airport area': 'Tallinn', 'ulemiste tallinn': 'Tallinn',
        'harbour area tallinn': 'Tallinn', 'kopli tallinn': 'Tallinn',
        // More Estonian cities
        'tartu center': 'Tartu', 'tartu university area': 'Tartu', 'supilinn': 'Tartu',
        'narva city': 'Narva', 'narva castle': 'Narva', 'ivangorod': 'Narva',
        'haapsalu': 'Haapsalu', 'haapsalu castle': 'Haapsalu',
        'viljandi city': 'Viljandi', 'viljandi castle': 'Viljandi',
        'rakvere': 'Rakvere', 'paide': 'Paide', 'johvi': 'Johvi',
        'kohtla jarve': 'Kohtla-Järve', 'sillamae': 'Sillamäe',
        // Estonian islands
        'saaremaa island': 'Kuressaare', 'kuressaare': 'Kuressaare',
        'hiiumaa island': 'Kardla', 'kardla': 'Kardla',
        'muhu island': 'Muhu',
        // Estonia nature
        'lahemaa national park': 'Lahemaa', 'palms estonian': 'Pärnu',
        // ── extended coverage ──
        'tallinn old town': 'Tallinn', 'vanalinn': 'Tallinn',
        'rotermann': 'Tallinn', 'narva': 'Narva',
        'viljandi': 'Viljandi', 'saaremaa': 'Kuressaare',
        'hiiumaa': 'Kardla', 'otepaa': 'Otepaa',
        'lahemaa': 'Rakvere',
    },
    LV: {
        'old riga': 'Riga', 'centre riga': 'Riga', 'agenskalns': 'Riga',
        'quiet centre riga': 'Riga', 'teika': 'Riga',
        'jurmala beach': 'Jurmala', 'majori': 'Jurmala', 'dzintari': 'Jurmala',
        'sigulda': 'Sigulda',
        // More Riga neighborhoods
        'purvciems': 'Riga', 'imanta': 'Riga', 'ilguciems': 'Riga',
        'bolderaja': 'Riga', 'kengarags': 'Riga', 'plavnieki': 'Riga',
        'jugla': 'Riga', 'mezciems': 'Riga', 'bierini': 'Riga',
        'juglas': 'Riga', 'krasta iela': 'Riga', 'pardaugava': 'Riga',
        'riga new town': 'Riga', 'riga central market': 'Riga',
        'riga latvia': 'Riga', 'latvian ethnographic museum': 'Riga',
        // More Latvian cities
        'daugavpils city': 'Daugavpils', 'latgale region': 'Daugavpils',
        'liepaja city': 'Liepaja', 'karosta liepaja': 'Liepaja',
        'jelgava city': 'Jelgava', 'valmiera city': 'Valmiera',
        'rezekne': 'Rezekne', 'ventspils': 'Ventspils',
        'cesis castle': 'Cesis', 'cesis city': 'Cesis',
        'kuldiga waterfall': 'Kuldiga', 'kuldiga city': 'Kuldiga',
        // Jurmala extras
        'jurmala city': 'Jurmala', 'bulduri': 'Jurmala', 'kemeri': 'Jurmala',
        'lielupe jurmala': 'Jurmala',
        // ── extended coverage ──
        'riga old town': 'Riga', 'vecriga': 'Riga',
        'centrs riga': 'Riga', 'art nouveau district': 'Riga',
        'mezaparks': 'Riga', 'gauja national park': 'Sigulda',
        'cesis': 'Cesis', 'liepaja': 'Liepaja',
        'daugavpils': 'Daugavpils', 'kuldiga': 'Kuldiga',
        'rundale': 'Bauska', 'bauska': 'Bauska',
        'jelgava': 'Jelgava',
    },
    LT: {
        'old town vilnius': 'Vilnius', 'uzupis': 'Vilnius', 'new town vilnius': 'Vilnius',
        'gediminas avenue': 'Vilnius',
        'kaunas old town': 'Kaunas', 'laisves aleja': 'Kaunas',
        'klaipeda old town': 'Klaipeda', 'smiltyne': 'Klaipeda',
        'palanga beach': 'Palanga',
        // More Vilnius neighborhoods
        'snipiskes': 'Vilnius', 'lazdynai': 'Vilnius', 'pilaitė': 'Vilnius',
        'justiniskes': 'Vilnius', 'fabijoniskes': 'Vilnius', 'pasilaiciai': 'Vilnius',
        'zirmunai': 'Vilnius', 'karoliniskes': 'Vilnius', 'antakalnis': 'Vilnius',
        'verkiai': 'Vilnius', 'naujoji vilnia': 'Vilnius',
        'vilnius airport area': 'Vilnius', 'europa square vilnius': 'Vilnius',
        // More Kaunas
        'aleksotas': 'Kaunas', 'silainiai': 'Kaunas', 'eiguliai': 'Kaunas',
        'kaunas fortress': 'Kaunas', 'petrašiūnai': 'Kaunas',
        'pazaislis monastery': 'Kaunas', 'kaunas castle': 'Kaunas',
        // Klaipeda extras
        'klaipeda port': 'Klaipeda', 'klaipeda new town': 'Klaipeda',
        'nida': 'Nida', 'neringa': 'Nida', 'curonian spit': 'Nida',
        'juodkrante': 'Nida',
        // More Lithuanian cities
        'siauliai city': 'Siauliai', 'panevezys city': 'Panevezys',
        'alytus city': 'Alytus', 'marijampole': 'Marijampole',
        'utena': 'Utena', 'moletai': 'Moletai', 'trakai castle': 'Trakai',
        'trakai': 'Trakai',
        'druskininkai spa': 'Druskininkai', 'druskininkai': 'Druskininkai',
        'birstonas spa': 'Birstonas', 'birstonas': 'Birstonas',
        'anyksciai': 'Anyksciai', 'ignalina': 'Ignalina',
        'zarasai lake': 'Zarasai',
    },
    // ── Slovenia ──────────────────────────────────────────────────────────────
    SI: {
        'old town ljubljana': 'Ljubljana (Laibach)', 'trnovo': 'Ljubljana (Laibach)', 'tivoli': 'Ljubljana (Laibach)',
        'bezigrad': 'Ljubljana (Laibach)', 'vic': 'Ljubljana (Laibach)', 'siska': 'Ljubljana (Laibach)',
        'lake bled': 'Bled', 'bled village': 'Bled', 'bled castle': 'Bled',
        'lake bohinj': 'Bohinjska Bistrica', 'ribcev laz': 'Bohinjska Bistrica',
        'piran old town': 'Piran', 'portoroz': 'Portoroz', 'izola': 'Izola',
        'koper city': 'Koper',
        'maribor old town': 'Maribor', 'lent': 'Maribor',
        'kranjska gora': 'Kranjska Gora', 'vogel': 'Bohinjska Bistrica',
        'celje city': 'Celje', 'nova gorica': 'Nova Gorica',
        'postojna cave': 'Postojna', 'predjama castle': 'Postojna',
        'skocjan caves': 'Divaca',
        // More Ljubljana
        'moste': 'Ljubljana (Laibach)', 'polje ljubljana': 'Ljubljana (Laibach)', 'sostro': 'Ljubljana (Laibach)',
        'sentvid': 'Ljubljana (Laibach)', 'brezovica': 'Ljubljana (Laibach)', 'dobrova': 'Ljubljana (Laibach)',
        'fužine': 'Ljubljana (Laibach)', 'golovec': 'Ljubljana (Laibach)', 'rudnik': 'Ljubljana (Laibach)',
        'stožice': 'Ljubljana (Laibach)', 'koseze': 'Ljubljana (Laibach)', 'dravlje': 'Ljubljana (Laibach)',
        'šiška': 'Ljubljana (Laibach)', 'center ljubljana': 'Ljubljana (Laibach)',
        // Julian Alps & Soča Valley
        'bovec': 'Bovec', 'soca valley': 'Bovec', 'kobarid': 'Kobarid',
        'tolmin': 'Tolmin', 'trenta valley': 'Bovec', 'lepena': 'Bovec',
        'log pod mangartom': 'Bovec',
        // Thermal Spas
        'rogaska slatina': 'Rogaska Slatina', 'terme catez': 'Brezice',
        'catez ob savi': 'Brezice', 'terme ptuj': 'Ptuj', 'ptuj city': 'Ptuj',
        'ptuj castle': 'Ptuj', 'terme olimia': 'Podcetrtek', 'podcetrtek': 'Podcetrtek',
        'terme lasko': 'Laško', 'lasko': 'Laško',
        // Ski Resorts
        'krvavec ski': 'Kranj', 'planica': 'Kranjska Gora', 'vogel bohinj': 'Bohinjska Bistrica',
        'kope ski': 'Slovenj Gradec', 'kanin ski': 'Bovec',
        // Other Slovenian towns
        'novo mesto': 'Novo mesto', 'murska sobota': 'Murska Sobota',
        'slovenj gradec': 'Slovenj Gradec', 'velenje': 'Velenje', 'kranj city': 'Kranj',
        'krsko': 'Krsko', 'trbovlje': 'Celje', 'idrija': 'Idrija',
        'skofja loka': 'Škofja Loka', 'kamnik': 'Kamnik', 'domzale': 'Domžale',
        'grosuplje': 'Grosuplje', 'logatec': 'Logatec',
        // Slovenian coast extras
        'ankaran': 'Ankaran', 'strunjan': 'Piran', 'lucija': 'Portoroz',
        'bernardin': 'Portoroz', 'pacug beach': 'Portoroz',
        // Karst region
        'lipica stud farm': 'Koper', 'lipica': 'Koper', 'divaca': 'Divaca',
        // UNESCO & heritage
        'skocjan': 'Divaca', 'idrija mercury mine': 'Idrija',
    },
    // ── Montenegro ────────────────────────────────────────────────────────────
    ME: {
        'kotor old town': 'Kotor', 'stari grad kotor': 'Kotor',
        'budva old town': 'Budva', 'budva riviera': 'Budva', 'becici': 'Bečići',
        'tivat city': 'Tivat', 'porto montenegro': 'Tivat',
        'bar center': 'Bar',
        'ulcinj': 'Ulcinj',
        'podgorica center': 'Podgorica',
        'herceg novi': 'Herceg Novi',
        // Sveti Stefan area
        'sveti stefan': 'Sveti Stefan', 'przno beach': 'Pržno',
        'milocer beach': 'Sveti Stefan', 'sveti stefan island': 'Sveti Stefan',
        // Budva riviera extras
        'mogren beach': 'Budva', 'jaz beach': 'Budva', 'buljarica': 'Buljarica',
        'petrovac beach': 'Petrovac', 'petrovac na moru': 'Petrovac',
        'rafailovici': 'Rafailovici', 'sutomore': 'Sutomore',
        // Bar
        'stari bar': 'Bar', 'bar old town': 'Bar', 'bari montenegr': 'Bar',
        // Ulcinj
        'ulcinj old town': 'Ulcinj', 'velika plaza': 'Ulcinj', 'ada bojana': 'Ulcinj',
        // Kotor Bay
        'perast': 'Perast', 'risan': 'Risan', 'prčanj': 'Prcanj', 'dobrota': 'Dobrota',
        'stoliv': 'Stoliv', 'muo': 'Kotor', 'orahovac': 'Orahovac',
        // Herceg Novi riviera
        'igalo': 'Igalo', 'njivice herceg': 'Herceg Novi',
        'zelenika': 'Zelenika', 'kamenari': 'Kamenari',
        // Interior
        'cetinje': 'Cetinje', 'cetinje old capital': 'Cetinje',
        'lovcen national park': 'Cetinje',
        'zabljak': 'Zabljak', 'durmitor': 'Zabljak', 'durmitor national park': 'Zabljak',
        'tara canyon': 'Zabljak', 'crno jezero': 'Zabljak',
        'kolasin': 'Kolasin', 'kolasin ski': 'Kolasin', 'biogradska gora': 'Kolasin',
        'niksic': 'Nikšić', 'plav lake': 'Kolasin', 'plav': 'Kolasin',
        'rozaje': 'Kolasin', 'berane': 'Kolasin',
    },
    // ── Albania ───────────────────────────────────────────────────────────────
    AL: {
        'tirana center': 'Tirana', 'blloku': 'Tirana', 'new bazaar': 'Tirana',
        'don bosco tirana': 'Tirana', 'ali demi': 'Tirana', 'laprake': 'Tirana',
        'saranda waterfront': 'Saranda', 'sarande': 'Saranda',
        'gjirokastra old town': 'Gjirokaster', 'gjirokaster': 'Gjirokaster',
        'durres beach': 'Durres', 'durres city': 'Durres',
        'berat old town': 'Berat', 'mangalem': 'Berat',
        'ksamil': 'Saranda', 'blue eye albania': 'Saranda',
        'shkoder': 'Shkodër', 'shkoder lake': 'Shkodër',
        'vlore': 'Vlora', 'dhermiu': 'Saranda', 'himara': 'Saranda',
        'permet': 'Gjirokaster', 'korce': 'Korce',
        'fier': 'Fier', 'elbasan': 'Elbasan',
        // More Tirana
        'rruga e elbasanit': 'Tirana', 'brryli': 'Tirana', 'yzedin': 'Tirana',
        'kombinat tirana': 'Tirana', 'fresku': 'Tirana', 'tirana east': 'Tirana',
        'tirana lake park': 'Tirana', 'astir tirana': 'Tirana',
        // Albanian Riviera extras
        'jale beach': 'Saranda', 'livadhi beach': 'Saranda', 'lukove': 'Saranda',
        'gjipe beach': 'Saranda', 'palase beach': 'Saranda', 'potam beach': 'Saranda',
        'radhime': 'Vlora', 'orikum': 'Vlora', 'uji i ftohte': 'Vlora',
        'qeparo': 'Saranda', 'borsh beach': 'Saranda', 'piqeras': 'Saranda',
        'porto palermo': 'Saranda', 'syri i kaltër': 'Saranda',
        'konispol': 'Saranda', 'hot water spring albania': 'Saranda',
        // Heritage
        'apollonia albania': 'Fier', 'butrint national park': 'Saranda',
        'rozafa castle': 'Shkodër', 'kruje castle': 'Kruje', 'kruje': 'Kruje',
        'lezhe': 'Shkodër', 'lac albania': 'Durres', 'kukes': 'Tirana',
        'peshkopi': 'Peshkopi', 'librazhd': 'Elbasan', 'pogradec': 'Pogradec',
        'lake ohrid albania': 'Pogradec', 'devoll': 'Korce',
    },
    // ── North Macedonia ───────────────────────────────────────────────────────
    MK: {
        'skopje old bazaar': 'Skopje', 'city square skopje': 'Skopje', 'debar maalo': 'Skopje',
        'centar skopje': 'Skopje', 'aerodrom skopje': 'Skopje', 'kisela voda': 'Skopje',
        'ohrid old town': 'Ohrid', 'lake ohrid': 'Ohrid', 'ohrid waterfront': 'Ohrid',
        'struga': 'Struga', 'sveti naum': 'Ohrid',
        'bitola city': 'Bitola', 'heraclea': 'Bitola',
        'tetovo': 'Tetovo', 'kumanovo': 'Kumanovo',
        'mavrovo': 'Gostivar', 'galicnik': 'Gostivar',
        // Skopje extras
        'gazi baba': 'Skopje', 'gjorce petrov': 'Skopje', 'chair skopje': 'Skopje',
        'suto orizari': 'Skopje', 'sopiste': 'Skopje', 'butel skopje': 'Skopje',
        'zelenikovo': 'Skopje', 'ilinden skopje': 'Skopje',
        // More cities
        'veles': 'Veles', 'stip': 'Veles', 'strumica': 'Strumica',
        'gevgelija': 'Gevgelija', 'negotino': 'Negotino',
        'kratovo': 'Kumanovo', 'berovo': 'Berovo',
        'krusevo': 'Bitola', 'krusevo ski': 'Bitola',
        'popova shapka': 'Tetovo', 'popova shapka ski': 'Tetovo',
        'gostivar': 'Gostivar', 'kicevo': 'Gostivar',
        'resen': 'Ohrid', 'lake prespa': 'Ohrid', 'pelister': 'Bitola',
        'demir kapija': 'Gevgelija', 'valandovo': 'Gevgelija',
        'dojran lake': 'Nov Dojran', 'star dojran': 'Nov Dojran',
        'radovis': 'Strumica', 'sveti naum macedonia': 'Ohrid',
        'ohrid airport': 'Ohrid', 'elshani': 'Ohrid', 'lagadin': 'Ohrid',
    },
    // ── Bosnia & Herzegovina ──────────────────────────────────────────────────
    BA: {
        'bascarsija': 'Sarajewo', 'old town sarajevo': 'Sarajewo', 'kovaci': 'Sarajewo',
        'marijin dvor': 'Sarajewo', 'grbavica': 'Sarajewo', 'ilidza': 'Ilidza',
        'novo sarajevo': 'Sarajewo', 'hadzici': 'Sarajewo',
        'old bridge mostar': 'Mostar', 'kujundziluk': 'Mostar',
        'western mostar': 'Mostar', 'eastern mostar': 'Mostar',
        'banja luka city': 'Banja Luka', 'tuzla city': 'Tuzla',
        'trebinje': 'Trebinje', 'medugorje': 'Međugorje',
        'neum': 'Neum', 'jajce': 'Jajce',
        // More Sarajevo areas
        'bascarsija area': 'Sarajewo', 'cigline': 'Sarajewo', 'centar sarajevo': 'Sarajewo',
        'dobrinja': 'Sarajewo', 'alipasino': 'Sarajewo', 'ilijas': 'Sarajewo',
        'vogosca': 'Sarajewo', 'sokolovic kolonija': 'Sarajewo',
        'jahorina': 'Jahorina', 'jahorina ski': 'Jahorina', 'bjelasnica': 'Jahorina',
        // More Mostar
        'blagaj': 'Mostar', 'pocitelj': 'Mostar', 'kravica falls': 'Mostar',
        'mosque mostar': 'Mostar', 'west mostar': 'Mostar', 'east mostar': 'Mostar',
        // Heritage Bosnia
        'travnik': 'Travnik', 'pliva lakes': 'Jajce', 'kljuc': 'Banja Luka',
        'zenica': 'Sarajewo', 'visegrad': 'Trebinje', 'andricesgrad': 'Trebinje',
        'foca': 'Trebinje', 'konjic': 'Konjic', 'neretva canyon': 'Konjic',
        'bugojno': 'Jajce', 'donji vakuf': 'Travnik',
        'bihac': 'Bihac', 'una national park': 'Bihac', 'una river': 'Bihac',
        'martin brod': 'Bihac', 'strbacki buk': 'Bihac',
        'cazin': 'Bihac', 'velika kladusa': 'Bihac',
        'livno': 'Mostar', 'livno kanton': 'Mostar',
        'lukomir village': 'Konjic', 'rakitnica canyon': 'Konjic',
        'stolac': 'Mostar', 'capljina': 'Mostar',
        'banja luka downtown': 'Banja Luka', 'kastel banja luka': 'Banja Luka',
        'gradiska': 'Banja Luka', 'prijedor': 'Prijedor',
        'doboj': 'Doboj', 'bijeljina': 'Bijeljina',
        'zvornik': 'Zvornik', 'srebrenica': 'Zvornik',
        'trebinje old town': 'Trebinje', 'bregava gorge trebinje': 'Trebinje',
    },
    // ── Slovakia ──────────────────────────────────────────────────────────────
    SK: {
        'old town bratislava': 'Bratislava', 'petrzalka': 'Bratislava',
        'ruzinov': 'Bratislava', 'dubravka': 'Bratislava', 'lamac': 'Bratislava',
        'nove mesto bratislava': 'Bratislava', 'raca': 'Bratislava',
        'kosice old town': 'Kosice', 'stare mesto kosice': 'Kosice',
        'banska bystrica': 'Banska Bystrica', 'zilina city': 'Zilina',
        'prešov': 'Presov', 'nitra city': 'Nitra', 'trnava': 'Trnava',
        'poprad': 'Poprad', 'vysoke tatry': 'Vysoke Tatry',
        'strbske pleso': 'Štrbské Pleso', 'stary smokovec': 'Stary Smokovec',
        'tatranska lomnica': 'Tatranská Lomnica (Tatralomnitz)',
        'piestany spa': "Piest'any", 'trencin castle': 'Trencin',
        'banska stiavnica': 'Banska Stiavnica',
        // More Bratislava
        'devinska nova ves': 'Bratislava', 'karlova ves': 'Bratislava',
        'vajnory': 'Bratislava', 'podunajske biskupice': 'Bratislava',
        'ruzomberok': 'Ružomberok', 'liptovsky mikulas': 'Liptovsky Mikulas',
        'liptovsky hradok': 'Liptovsky Hradok', 'ruzomberok ski': 'Ružomberok',
        // High Tatras extras
        'tatranská lomnica': 'Tatranská Lomnica (Tatralomnitz)',
        'tatry mountain resort': 'Vysoke Tatry', 'zakopane area': 'Vysoke Tatry',
        'strbske pleso lake': 'Štrbské Pleso', 'rysy peak': 'Vysoke Tatry',
        'gerlach peak': 'Vysoke Tatry', 'lomnicky stit': 'Vysoke Tatry',
        // UNESCO / heritage
        'spis castle': 'Levoča', 'levoca': 'Levoča', 'spisska nova ves': 'Spišská Nová Ves',
        'kezmarok': 'Kežmarok', 'spissky hrad': 'Levoča',
        'vlkolinec': 'Ružomberok', 'caves aggtelek': 'Rožňava',
        'roznava': 'Rožňava', 'ochtinska': 'Rožňava',
        'bojnice castle': 'Bojnice', 'bojnice': 'Bojnice',
        'oravsky castle': 'Dolny Kubin', 'dolny kubin': 'Dolny Kubin',
        'namestovo': 'Námestovo', 'orava region': 'Dolny Kubin',
        // Spa towns
        'trencian spa': 'Trencin', 'trencianska tepla': 'Trencin',
        'piestany spa town': "Piest'any", 'piestany thermal': "Piest'any",
        // More Slovak cities
        'martin slovakia': 'Martin', 'cadca': 'Zilina',
        'zvolen': 'Zvolen', 'lucenec': 'Lucenec', 'rimavska sobota': 'Lucenec',
        'nove zamky': 'Nové Zámky', 'komarno': 'Komárno', 'sturovo': 'Štúrovo',
        'senec': 'Senec', 'dunajska streda': 'Dunajska Streda',
        // Kosice extras
        'kosice old town area': 'Kosice', 'kosice south': 'Kosice',
        'kosice airport area': 'Kosice', 'dargovskych hrdinov': 'Kosice',
        // More Eastern Slovakia
        'humenne': 'Humenne', 'michalovce': 'Michalovce', 'sobrance': 'Sobrance',
        'vranov nad toplou': 'Vranov nad Topľou',
        'bardejov': 'Bardejov', 'bardejov spa': 'Bardejov',
        'stara lubovna': 'Stara Lubovna', 'podolinec': 'Stara Lubovna',
    },
    // ── Macau ─────────────────────────────────────────────────────────────────
    MO: {
        'cotai strip': 'Macau', 'taipa village': 'Macau', 'coloane': 'Macau',
        'senado square': 'Macau', 'ruins of st paul': 'Macau',
        'galaxy macau area': 'Macau', 'venetian macau': 'Macau',
        // ── extended coverage ──
        'cotai': 'Macau', 'taipa': 'Macau',
        'largo do senado': 'Macau', 'macau peninsula': 'Macau',
        'ruins of st pauls': 'Macau', 'a ma temple': 'Macau',
        'nape': 'Macau', 'macau tower': 'Macau',
        'hac sa': 'Macau', 'zape': 'Macau',
        'inner harbour macau': 'Macau', 'sai van': 'Macau',
        'praia grande': 'Macau', 'estrada do istmo': 'Macau',
        'macao': 'Macau',
    },
    // ── Caucasus ──────────────────────────────────────────────────────────────
    GE: {
        'old tbilisi': 'Tiflis', 'rustaveli': 'Tiflis', 'vake': 'Tiflis',
        'saburtalo': 'Tiflis', 'vera': 'Tiflis', 'abanotubani': 'Tiflis',
        'mtatsminda': 'Tiflis', 'gldani': 'Tiflis', 'isani': 'Tiflis',
        'samgori': 'Tiflis', 'nadzaladevi': 'Tiflis', 'didube': 'Tiflis',
        'batumi boulevard': 'Batumi', 'batumi old town': 'Batumi', 'new boulevard batumi': 'Batumi',
        'khelvachauri': 'Batumi', 'kobuleti': 'Kobuleti',
        'sighnaghi': 'Sighnaghi', 'bodbe': 'Sighnaghi',
        'kutaisi city': 'Kutaisi', 'bagrati cathedral': 'Kutaisi',
        'gori city': 'Gori', 'uplistsikhe': 'Gori',
        'mtskheta': 'Mtskheta', 'jvari monastery': 'Mtskheta',
        'mestia': 'Mestia', 'svaneti': 'Mestia', 'ushguli': 'Mestia',
        'stepantsminda': 'Kazbegi', 'kazbegi': 'Kazbegi', 'gergeti': 'Kazbegi',
        'gudauri ski': 'Gudauri', 'bakuriani ski': 'Bakuriani',
        'borjomi': 'Borjomi', 'likani': 'Borjomi',
        'telavi': 'Telavi', 'kakheti region': 'Telavi',
        'zugdidi': 'Zugdidi', 'poti city': 'Poti',
        // More Tbilisi neighborhoods
        'chugureti': 'Tiflis', 'avlabari': 'Tiflis', 'sololaki': 'Tiflis',
        'plekhanova street': 'Tiflis', 'marjanishvili': 'Tiflis', 'ortachala': 'Tiflis',
        'didi digomi': 'Tiflis', 'vazisubani': 'Tiflis', 'lilo tbilisi': 'Tiflis',
        'isani tbilisi': 'Tiflis', 'varketili': 'Tiflis', 'temqa': 'Tiflis',
        'gldani tbilisi': 'Tiflis', 'mukhiani': 'Tiflis', 'navtlughi': 'Tiflis',
        'krtsanisi': 'Tiflis', 'mtatsminda park': 'Tiflis',
        // More Georgia towns
        'rustavi georgia': 'Rustavi', 'gori downtown': 'Gori',
        'zugdidi city': 'Zugdidi', 'samegrelo region': 'Zugdidi',
        'akhaltsikhe': 'Akhaltsikhe', 'rabati castle': 'Akhaltsikhe',
        'aspindza': 'Aspindza', 'vardzia caves': 'Aspindza',
        'lagodekhi georgia': 'Lagodekhi', 'lagodekhi national park': 'Lagodekhi',
        'dedoplistskaro': 'Dedoplistskaro', 'vashlovani reserve': 'Dedoplistskaro',
        'kaspi georgia': 'Kaspi', 'khashuri': 'Khashuri',
        'ambrolauri georgia': 'Ambrolauri', 'racha region': 'Ambrolauri',
        'oni georgia': 'Oni', 'tsageri georgia': 'Tsageri',
        'ozurgeti': 'Ozurgeti', 'chokhatauri': 'Chokhatauri',
        'kvareli': 'Kvareli', 'tsinandali': 'Telavi', 'alaverdi church': 'Telavi',
        'anaga winery': 'Telavi', 'gurjaani': 'Gurjaani',
        'sagarejo': 'Sagarejo', 'gardabani': 'Gardabani',
        'marneuli': 'Marneuli', 'bolnisi': 'Bolnisi',
        'tskaltubo': 'Tskaltubo', 'kutaisi old town': 'Kutaisi',
        'senaki georgia': 'Senaki', 'abasha georgia': 'Abasha',
        'tkibuli': 'Tkibuli', 'sachkhere': 'Sachkhere',
        'kobuleti beach': 'Kobuleti', 'ureki beach': 'Ureki',
        'batumi city center': 'Batumi', 'batumi nightlife': 'Batumi',
        'gonio': 'Batumi', 'kvariati': 'Batumi', 'makhinjauri': 'Batumi',
    },
    AM: {
        // TGX uses German transliteration: Jerewan / Dilidschan / Gjumri
        'kentron yerevan': 'Jerewan', 'north avenue': 'Jerewan', 'erebuni': 'Jerewan',
        'cascade yerevan': 'Jerewan', 'mashtots': 'Jerewan',
        'avan': 'Jerewan', 'nork': 'Jerewan', 'nubarashen': 'Jerewan',
        'shengavit': 'Jerewan', 'arabkir': 'Jerewan', 'kanaker': 'Jerewan',
        'gyumri city': 'Gjumri', 'vanadzor': 'Vanadzor',
        'dilijan': 'Dilidschan', 'jermuk spa': 'Jermuk',
        'lake sevan': 'Sevan', 'sevan city': 'Sevan',
        'garni temple': 'Garni', 'geghard monastery': 'Garni',
        'echmiadzin': 'Etschmiadsin', 'vagharshapat': 'Etschmiadsin',
        'tatev monastery': 'Goris', 'goris': 'Goris',
        'kapan': 'Kapan', 'meghri': 'Meghri',
        // More Yerevan districts
        'center yerevan': 'Jerewan', 'davtashen': 'Jerewan', 'ajapnyak': 'Jerewan',
        'nor norq': 'Jerewan', 'malatia sebastia': 'Jerewan', 'avtovokzal yerevan': 'Jerewan',
        'zeytun yerevan': 'Jerewan', 'nork masiv': 'Jerewan',
        'parakar': 'Jerewan', 'yerevan': 'Jerewan',
        // Armenia regions
        'hrazdan': 'Hrazdan', 'abovyan': 'Abowjan', 'charentsavan': 'Charentsavan',
        'alaverdi armenia': 'Alaverdi', 'stepanavan': 'Stepanawan',
        'spitak': 'Spitak', 'vanadzor city': 'Vanadzor', 'tashir': 'Tashir',
        'gavar': 'Gavar', 'vardenis': 'Vardenis',
        'yeghegnadzor': 'Yeghegnadzor', 'jermuk city': 'Jermuk',
        'sisian': 'Sisian', 'goris city': 'Goris', 'meghri border': 'Meghri',
        'khndzoresk': 'Goris', 'khndzoresk cave village': 'Goris',
        'stepanakert': 'Stepanakert', 'khor virap': 'Ararat',
        'ararat city': 'Ararat', 'masis armenia': 'Ararat',
        'artashat': 'Artashat', 'ashtarak': 'Ashtarak',
        'talin armenia': 'Talin', 'gyumri downtown': 'Gjumri',
        'maralik': 'Gjumri', 'shirak region': 'Gjumri',
        // DB cities not previously covered
        'tsaghkadzor': 'Zaghkadsor', 'tsakhkadzor': 'Zaghkadsor', 'ski resort armenia': 'Zaghkadsor',
        'ijevan': 'Idschewan', 'ijevan city': 'Idschewan',
        'agveran': 'Agveran', 'byurakan': 'Byurakan',
        // Nature / trekking
        'khosrov forest': 'Artashat', 'azat valley': 'Garni',
        'haghartsin monastery': 'Dilidschan', 'goshavank monastery': 'Dilidschan',
        'sevanavank monastery': 'Sevan', 'noraduz cemetery': 'Gavar',
        'noravank canyon': 'Yeghegnadzor', 'areni caves': 'Yeghegnadzor',
        'amberd fortress': 'Aparan', 'aparan': 'Aparan',
        'saghmosavank': 'Aparan', 'hovhannavank': 'Aparan',
        // More border/south Armenia
        'meghri city': 'Meghri', 'agarak armenia': 'Meghri',
        'goris caves': 'Goris', 'vorotan gorge': 'Goris',
        'tatev ropeway': 'Goris', 'wings of tatev': 'Goris',
        // Armenian script names
        'Երևան': 'Jerewan', 'Գյումրի': 'Gjumri', 'Վանաձոր': 'Vanadzor',
        'Դիլիջան': 'Dilidschan', 'Ջերմուկ': 'Jermuk', 'Սևան': 'Sevan',
        'Կապան': 'Kapan', 'Գորիս': 'Goris', 'Հայաստան': 'Jerewan',
    },
    AZ: {
        'icherisheher': 'Baku', 'old city baku': 'Baku', 'white city baku': 'Baku',
        'fountain square baku': 'Baku', 'nizami street': 'Baku', 'narimanov baku': 'Baku',
        'gabala city': 'Gabala', 'sheki city': 'Şəki', 'quba': 'Quba',
        // More Baku districts
        'nasimi baku': 'Baku', 'binagadi': 'Baku', 'sabunchi baku': 'Baku',
        'surakhani': 'Baku', 'qaradag': 'Baku', 'bilajar': 'Baku',
        'absheron baku': 'Baku', 'xatai baku': 'Baku', 'pirallahi': 'Baku',
        'sabail baku': 'Baku', 'yasamal baku': 'Baku', 'nizami baku': 'Baku',
        'khatai baku': 'Baku', 'baku seafront': 'Baku', 'baku boulevard': 'Baku',
        'novkhani': 'Baku', 'mashtaga': 'Baku', 'nardaran': 'Baku',
        'buzovna baku': 'Baku', 'bilgah beach': 'Baku', 'novkhani resort': 'Baku',
        // Other Azerbaijan cities
        'ganja city': 'Ganja', 'kapaz': 'Ganja', 'nizami ganja': 'Ganja',
        'mingachevir': 'Mingecevir', 'lankaran city': 'Lənkəran',
        'masalli': 'Masalli', 'jalilabad': 'Jalilabad',
        'shamakhi': 'Shamakhi', 'ismayilli': 'Ismailli',
        'sheki khan palace': 'Şəki', 'nukha': 'Şəki',
        'naftalan': 'Naftalan', 'naftalan spa': 'Naftalan',
        'gах': 'Gах', 'balakan': 'Balakan',
        'quba region': 'Quba', 'qusар': 'Kussary', 'qusar ski': 'Kussary',
        'shahdag resort': 'Kussary', 'lacin corridor': 'Lacin',
        'nakhchivan city': 'Nakhchivan', 'nakhchivan az': 'Nakhchivan',
        'ordubad': 'Ordubad', 'julfa azerbaijan': 'Julfa',
        'sumgayit': 'Sumqayit', 'khirdalan': 'Xırdalan',
        // Nature / UNESCO
        'gobustan national park': 'Baku', 'gobustan petroglyphs': 'Baku',
        'mud volcanoes baku': 'Baku', 'ateshgah fire temple': 'Baku',
        'yanar dag': 'Baku',
        'sheki khan saray': 'Şəki', 'sheki caravanserai': 'Şəki',
        'lahij village': 'Shamakhi', 'pirsaat': 'Baku',
        // Talysh / south
        'masalli region': 'Masalli', 'lerik region': 'Lerik', 'lerik': 'Lerik',
        'yardimli': 'Yardimli', 'astara azerbaijan': 'Astara',
        // Karabakh / west
        'shusha': 'Schuschi', 'shusha city': 'Schuschi',
        'aghdam': 'Aghdam', 'fuzuli': 'Fuzuli', 'jabrayil': 'Jabrayil',
        'zangilan': 'Zangilan', 'hadrut': 'Hadrut',
        // Azerbaijani language names
        'Bakı': 'Baku', 'Gəncə': 'Ganja', 'Şəki': 'Şəki',
        'Quba': 'Quba', 'Lənkəran': 'Lənkəran', 'Sumqayıt': 'Sumqayit',
        'Naxçıvan': 'Nakhchivan', 'Azərbaycan': 'Baku',
    },
    // ── Central Asia ──────────────────────────────────────────────────────────
    KZ: {
        'almaty centre': 'Almaty', 'medeu almaty': 'Almaty', 'alatau almaty': 'Almaty',
        'arbat almaty': 'Almaty',
        // Kazakhstan expanded
        'almaty city': 'Almaty', 'green bazaar almaty': 'Almaty',
        'astana city': 'Astana', 'nur sultan': 'Astana', 'nursultan': 'Astana',
        'bayterek astana': 'Astana', 'khan shatyr': 'Astana',
        'shymkent': 'Schymkent', 'aktau': 'Aktau', 'atyrau': 'Atyrau',
        'charyn canyon': 'Almaty', 'kolsai lakes': 'Almaty',
        'big almaty lake': 'Almaty',
        // More Almaty districts
        'alatau district almaty': 'Almaty', 'bostandyk almaty': 'Almaty',
        'auezov almaty': 'Almaty', 'turksib almaty': 'Almaty',
        'zhetysu almaty': 'Almaty', 'nauryzbai almaty': 'Almaty',
        'almalybak': 'Almaty', 'karasai': 'Almaty',
        // Astana / Nur-Sultan areas
        'left bank astana': 'Astana', 'right bank astana': 'Astana',
        'expo astana': 'Astana', 'ak bulak': 'Astana',
        'almaty district astana': 'Astana', 'saryarka astana': 'Astana',
        'esil district astana': 'Astana', 'nazarbayev center': 'Astana',
        // Other Kazakhstan cities
        'karaganda city': 'Karaganda', 'temirtau': 'Karaganda',
        'aktobe city': 'Aktöbe', 'aktobe north': 'Aktöbe',
        'pavlodar city': 'Pawlodar', 'ekibastuz': 'Ekibastuz',
        'oskemen': 'Oskemen', 'ust-kamenogorsk': 'Oskemen',
        'semey city': 'Semei', 'semipalatinsk': 'Semei',
        'oral city': 'Oral', 'uralsk': 'Oral',
        'kostanay city': 'Kostanay', 'rudny kazakhstan': 'Rudny',
        'petropavl': 'Petropavl', 'petropavlovsk kz': 'Petropavl',
        'kokshetau': 'Kökschetau', 'shchuchinsk': 'Schtschutschinsk',
        'borovoye lake': 'Schtschutschinsk', 'burabay resort': 'Schtschutschinsk',
        'taraz city': 'Dzambul', 'zhambyl kazakhstan': 'Dzambul',
        'turkistan city': 'Türkistan', 'mausoleum yasawi': 'Türkistan',
        'aktau seaport': 'Aktau', 'caspian aktau': 'Aktau',
        'atyrau refinery': 'Atyrau', 'zhilgorodok': 'Atyrau',
        'balkhash city': 'Balkhash', 'lake balkhash': 'Balkhash',
        'kapchagay': 'Kapchagay', 'almaty reservoir': 'Kapchagay',
        // Natural sites
        'singing dune': 'Almaty', 'altyn emel': 'Almaty',
        'aksu zhabagly': 'Schymkent', 'bektau ata': 'Balkhash',
        'bayanaul': 'Ekibastuz', 'karkaraly': 'Karaganda',
        'aisha bibi': 'Dzambul', 'davletbay': 'Dzambul',
        // More Kazakhstan cities
        'zhezkazgan': 'Zhezkazgan', 'satpayev': 'Zhezkazgan',
        'stepnogorsk': 'Stepnogorsk', 'lisakovsk': 'Lisakovsk',
        'ridder': 'Ridder', 'shemonaikha': 'Shemonaikha',
        'ayagoz': 'Ayagoz', 'sarkand': 'Sarkand',
        'kentau': 'Kentau', 'arys': 'Arys',
        'atbasar': 'Atbasar', 'ereymentau': 'Ereymentau',
        'zhanaozen': 'Zhanaozen', 'beyneu': 'Beyneu',
        'qyzylorda': 'Kyzylorda', 'kyzylorda': 'Kyzylorda',
        'baikonur city': 'Baikonur', 'cosmodrome': 'Baikonur',
        // Russian/Kazakh language city names
        'Алматы': 'Almaty', 'Астана': 'Astana', 'Нур-Султан': 'Astana',
        'Шымкент': 'Schymkent', 'Қарағанды': 'Karaganda', 'Тараз': 'Dzambul',
        'Павлодар': 'Pawlodar', 'Ақтөбе': 'Aktöbe', 'Атырау': 'Atyrau',
        'Ақтау': 'Aktau', 'Өскемен': 'Oskemen', 'Семей': 'Semei',
        'Түркістан': 'Türkistan', 'Қостанай': 'Kostanay',
        // ── extended coverage ──
        'medeu': 'Almaty', 'shymbulak': 'Almaty',
        'kok tobe': 'Almaty', 'panfilov park': 'Almaty',
        'kaindy': 'Saty', 'astana centre': 'Astana',
        'bayterek': 'Astana', 'burabay': 'Burabay',
        'borovoye': 'Burabay', 'turkistan': 'Türkistan',
        'yasawi mausoleum': 'Türkistan', 'caspian kazakhstan': 'Aktau',
        'mangystau': 'Aktau', 'karaganda': 'Karaganda',
        'taraz': 'Taraz', 'ust kamenogorsk': 'Oskemen',
        'pavlodar': 'Pavlodar', 'baikonur': 'Baikonur',
        'aral sea kazakhstan': 'Aralsk',
    },
    UZ: {
        'samarkand registan': 'Samarkand', 'samarkand old town': 'Samarkand',
        'bukhara old town': 'Bukhara', 'lyabi-hauz': 'Bukhara', 'poi-kalyan': 'Bukhara',
        'khiva old town': 'Khiva', 'itchan kala': 'Khiva',
        'tashkent city': 'Taschkent', 'chorsu tashkent': 'Taschkent',
        // Uzbekistan expanded
        'fergana city': 'Fergana', 'namangan city': 'Namangan', 'andijan city': 'Andijan',
        'shahrisabz': 'Shakhrisabz', 'gur emir': 'Samarkand',
        'karakalpakstan': 'Nukus', 'nukus': 'Nukus', 'moynaq': 'Nukus',
        'aral sea': 'Nukus', 'termez': 'Termez',
        // More Tashkent districts
        'yunusabad': 'Taschkent', 'yakkasaray': 'Taschkent', 'mirabad': 'Taschkent',
        'shayhantahur': 'Taschkent', 'uchtepa': 'Taschkent', 'chilonzor': 'Taschkent',
        'sergeli tashkent': 'Taschkent', 'olmosoy': 'Taschkent',
        'kibray tashkent': 'Taschkent', 'zangiata': 'Taschkent',
        // More Samarkand areas
        'bibi-khanym mosque': 'Samarkand', 'shakhrisabz road': 'Samarkand',
        'afrosiyob museum': 'Samarkand', 'ulugbek observatory': 'Samarkand',
        // More Uzbekistan cities
        'jizzakh': 'Jizzakh', 'gulistan': 'Gulistan', 'sirdaryo': 'Gulistan',
        'navoi city': 'Navoi', 'karmana': 'Navoi',
        'urgench city': 'Urgench', 'khwarazm': 'Urgench',
        'karshi city': 'Karshi', 'kashkadarya': 'Karshi',
        'denau': 'Denau', 'surxondaryo': 'Denau',
        'kokand': 'Kokand', 'margilan': 'Margilan', 'rishtan': 'Rishtan',
        'oltiariq': 'Fergana', 'quvasoy': 'Fergana',
        'andijon city': 'Andijan', 'asaka': 'Andijan',
        'namangan downtown': 'Namangan', 'chust': 'Namangan',
        // Silk Road extras
        'gijduvan': 'Bukhara', 'vobkent': 'Bukhara', 'romitan': 'Bukhara',
        'varakhsha': 'Bukhara', 'paikend': 'Bukhara',
        'shakhrisabz old town': 'Shakhrisabz', 'ak saray': 'Shakhrisabz',
        'dorut tilavat': 'Shakhrisabz',
        // More Tashkent
        'tashkent old city': 'Taschkent', 'beshqorghon': 'Taschkent',
        'tashkent city mall': 'Taschkent', 'new uzbekistan': 'Taschkent',
        // More Fergana Valley
        'rishtan ceramics': 'Rishtan', 'shakhimardan': 'Fergana',
        'kuva': 'Fergana', 'buvayda': 'Fergana',
        'pop namangan': 'Namangan', 'uchqurghon': 'Namangan',
        // Uzbek language names
        'Toshkent': 'Taschkent', 'Samarqand': 'Samarkand',
        'Buxoro': 'Bukhara', 'Xiva': 'Khiva',
        'Farg\'ona': 'Fergana', 'Namangan': 'Namangan',
        'O\'zbekiston': 'Taschkent',
        // ── extended coverage ──
        'tashkent centre': 'Tashkent', 'chorsu': 'Tashkent',
        'amir timur square': 'Tashkent', 'chilanzar': 'Tashkent',
        'samarkand centre': 'Samarkand', 'registan': 'Samarkand',
        'shah i zinda': 'Samarkand', 'gur e amir': 'Samarkand',
        'bibi khanym': 'Samarkand', 'lyabi hauz': 'Bukhara',
        'poi kalyan': 'Bukhara', 'ark of bukhara': 'Bukhara',
        'khiva': 'Khiva', 'urgench': 'Urgench',
        'savitsky museum': 'Nukus', 'muynak': 'Muynak',
        'aral sea uzbekistan': 'Muynak', 'shakhrisabz': 'Shakhrisabz',
        'fergana': 'Fergana', 'nurata': 'Nurata',
        'aydarkul': 'Nurata', 'chimgan': 'Tashkent',
    },
    // ── Kuwait / Bahrain / Oman ────────────────────────────────────────────────
    KW: {
        'kuwait city centre': 'Kuwait-Stadt', 'salmiya': 'Salmiyah',
        'hawally': 'Hawally', 'rumaithiya': 'Salmiyah',
        // More Kuwait areas
        'dasman': 'Kuwait-Stadt', 'bneid al gar': 'Kuwait-Stadt', 'sharq': 'Kuwait-Stadt',
        'qibla': 'Kuwait-Stadt', 'faiha': 'Kuwait-Stadt', 'nuzha': 'Kuwait-Stadt',
        'jabriya': 'Salmiyah', 'salwa': 'Salmiyah', 'bayan': 'Salmiyah',
        'shuwaikh': 'Kuwait-Stadt', 'kuwait souk': 'Kuwait-Stadt',
        'mishref': 'Salmiyah', 'fintas': 'Fintas', 'mahboula': 'Mahboula',
        'fahaheel': 'Fahaheel', 'ahmadi': 'Fahaheel',
        // More Kuwait districts
        'adailiya': 'Kuwait-Stadt', 'kaifan': 'Kuwait-Stadt', 'surra': 'Kuwait-Stadt',
        'rawda': 'Kuwait-Stadt', 'khaldiya': 'Kuwait-Stadt', 'shamiya': 'Kuwait-Stadt',
        'qortuba': 'Kuwait-Stadt',
        'al seef': 'Kuwait-Stadt', 'bnaid al gar': 'Kuwait-Stadt',
        'shuwaikh industrial': 'Kuwait-Stadt', 'rai kuwait': 'Kuwait-Stadt',
        'ardiya': 'Kuwait-Stadt', 'sabah al salem': 'Mahboula',
        'mangaf': 'Mangaf', 'abu halifa': 'Fahaheel',
        'funaitees': 'Kuwait-Stadt', 'riqqa': 'Mahboula',
        'hadiya': 'Kuwait-Stadt', 'sabahiya': 'Mahboula',
        // Kuwait landmarks as searches
        'kuwait towers': 'Kuwait-Stadt', 'grand mosque kuwait': 'Kuwait-Stadt',
        'al hamra tower': 'Kuwait-Stadt', 'liberation tower': 'Kuwait-Stadt',
        'souq mubarakiya': 'Kuwait-Stadt', 'avenues mall': 'Kuwait-Stadt',
        'marina mall kuwait': 'Kuwait-Stadt',
        // Arabic language names
        'الكويت': 'Kuwait-Stadt', 'مدينة الكويت': 'Kuwait-Stadt',
        'السالمية': 'Salmiyah', 'حولي': 'Hawally',
        'الفحيحيل': 'Fahaheel', 'الأحمدي': 'Fahaheel',
    },
    BH: {
        'manama city': 'Manama', 'seef': 'Manama', 'adliya': 'Manama',
        'amwaj islands': 'Manama', 'reef island': 'Manama', 'juffair': 'Manama',
        // More Bahrain
        'diplomatic area bahrain': 'Manama', 'financial harbour': 'Manama',
        'bahrain bay': 'Manama', 'gudaibiya': 'Manama', 'hoora': 'Manama',
        'zinj bahrain': 'Manama', 'isa town': 'Manama', 'hamad town': 'Manama',
        'riffa city': 'Riffa', 'muharraq bahrain': 'Muharraq',
        'sitra bahrain': 'Sitra', 'arad bahrain': 'Muharraq',
        // More Manama areas
        'exhibition avenue bahrain': 'Manama', 'country mall bahrain': 'Manama',
        'busaiteen': 'Muharraq', 'al hidd': 'Muharraq', 'ghallah': 'Muharraq',
        'al qudaibiya': 'Manama', 'al mahooz': 'Manama',
        'salmaniya bahrain': 'Manama', 'al shaikh': 'Manama',
        // South Bahrain
        'riffa west': 'Riffa', 'riffa east': 'Riffa',
        'al awali': 'Manama', 'hawar islands': 'Hawar', 'hawar': 'Hawar',
        // Landmarks
        'bahrain fort': 'Manama', 'qal at al bahrain': 'Manama',
        'tree of life bahrain': 'Riffa', 'bahrain international circuit': 'Sakhir',
        'sakhir bahrain': 'Sakhir', 'al dar islands': 'Sakhir',
        'ali bahrain': 'Sakhir', 'zallaq beach': 'Sakhir',
        // Arabic script names
        'المنامة': 'Manama', 'البحرين': 'Manama',
        'الرفاع': 'Riffa', 'المحرق': 'Muharraq',
    },
    OM: {
        'muscat city centre': 'Maskat', 'muttrah': 'Maskat', 'qurum': 'Maskat',
        'old muscat': 'Maskat', 'al mouj muscat': 'Maskat', 'madinat sultan': 'Maskat',
        'salalah beach': 'Salalah', 'al hafah': 'Salalah',
        'nizwa fort': 'Nizwa',
        'wahiba sands': 'Ibra',
        // More Oman
        'ruwi muscat': 'Maskat', 'wadi kabir': 'Maskat', 'ghubrah': 'Maskat',
        'al khuwair': 'Maskat', 'al azaiba': 'Maskat', 'seeb oman': 'Maskat',
        'qurm muscat': 'Maskat', 'bawshar': 'Maskat', 'al hail': 'Maskat',
        'shatti al qurum': 'Maskat', 'al qurum corniche': 'Maskat',
        'mutrah corniche': 'Maskat', 'muttrah souq': 'Maskat',
        'sohar oman': 'Sohar', 'barka oman': 'Barka', 'nakhal': 'Barka',
        'sur oman': 'Sur', 'ras al jinz': 'Sur', 'turtle beach sur': 'Sur',
        'ibri oman': 'Ibri', 'rustaq oman': 'Rustaq',
        'khasab musandam': 'Khasab', 'musandam peninsula': 'Khasab',
        'salalah dhofar': 'Salalah', 'taqah': 'Salalah', 'mirbat': 'Salalah',
        'wadi shab': 'Sur', 'wadi bani khalid': 'Sur',
        'jebel akhdar oman': 'Nizwa', 'jebel shams': 'Nizwa',
        'bahla oman': 'Nizwa',
        // More Muscat areas
        'medinat qaboos': 'Maskat', 'mawaleh': 'Maskat',
        'al ansab': 'Maskat', 'al khoudh': 'Maskat',
        'bowsher': 'Maskat', 'al amerat': 'Maskat',
        'muscat hills': 'Maskat', 'almouj golf': 'Maskat',
        // More Salalah / Dhofar
        'wadi darbat': 'Salalah', 'ayn razat': 'Salalah',
        'jobs tomb salalah': 'Salalah', 'ain hamran': 'Salalah',
        'dhofar mountains': 'Salalah', 'raysut': 'Salalah',
        'hasik salalah': 'Salalah',
        // Musandam extras
        'khasab dhow cruise': 'Khasab', 'dibba oman': 'Dibba Al Bayah',
        'dibba fujairah border': 'Dibba Al Bayah',
        // Hajar Mountains
        'wadi bani awf': 'Rustaq', 'al hamra oman': 'Al Hamra',
        'misfat al abriyeen': 'Al Hamra', 'al hoota cave': 'Nizwa',
        'wadi al arbaeen': 'Nizwa',
        // Eastern Oman
        'masirah island': 'Haima', 'duqm': 'Duqm',
        'al ashkharah': 'Sur',
        // More cities
        'ibra oman': 'Ibra', 'sinaw oman': 'Sinaw',
        'mudhaireb': 'Ibra', 'al mudaybi': 'Ibra',
        'adam oman': 'Adam', 'haima oman': 'Haima',
        // Arabic language names
        'مسقط': 'Maskat', 'صلالة': 'Salalah',
        'نزوى': 'Nizwa', 'صور': 'Sur', 'صحار': 'Sohar',
        'خصب': 'Khasab', 'عُمان': 'Maskat',
    },
    // ── Tunisia ───────────────────────────────────────────────────────────────
    TN: {
        'tunis medina': 'Tunis', 'sidi bou said': 'Tunis', 'la marsa': 'Tunis',
        'carthage ruins': 'Tunis', 'gammarth': 'Tunis',
        'lac tunis': 'Tunis', 'berges du lac': 'Tunis', 'ariana tunis': 'Tunis',
        'ben arous': 'Tunis', 'el menzah': 'Tunis',
        'sousse medina': 'Sousse', 'port el kantaoui': 'Sousse',
        'hammamet beach': 'Hammamet', 'yasmine hammamet': 'Hammamet',
        'nabeul tunisia': 'Nabeul', 'kelibia': 'Kelibia',
        'tozeur': 'Tozeur', 'douz': 'Douz', 'nefta': 'Nefta',
        'monastir city': 'Monastir', 'sfax city': 'Sfax',
        'kairouan': 'Kairouan', 'great mosque kairouan': 'Kairouan',
        'djerba island': 'Djerba', 'houmt souk': 'Djerba',
        'midoun djerba': 'Djerba', 'aghir djerba': 'Djerba',
        'tabarka': 'Tabarka', 'bizerte': 'Bizerte',
        'mahdia beach': 'Mahdia', 'gabes tunisia': 'Gabes',
    },
    // ── Senegal ───────────────────────────────────────────────────────────────
    SN: {
        'plateau dakar': 'Dakar', 'almadies': 'Dakar', 'ngor': 'Dakar',
        'les mamelles dakar': 'Dakar', 'yoff': 'Dakar', 'mermoz': 'Dakar',
        'point e dakar': 'Dakar', 'fann dakar': 'Dakar',
        'medina dakar': 'Dakar', 'grand dakar': 'Dakar',
        'ouakam': 'Dakar', 'ngor village': 'Dakar',
        'saly beach': 'Saly', 'mbour': 'Mbour', 'saly portugal': 'Saly',
        'saint-louis senegal': 'Saint-Louis', 'saint louis': 'Saint-Louis',
        'ziguinchor': 'Ziguinchor', 'cap skirring': 'Cap Skirring',
        'casamance': 'Ziguinchor',
        'kaolack': 'Kaolack', 'thies senegal': 'Thiès',
        'touba senegal': 'Touba', 'diourbel': 'Diourbel',
        // More Dakar neighborhoods
        'sicap liberte': 'Dakar', 'dieuppeul': 'Dakar', 'camberene': 'Dakar',
        'parcelles assainies': 'Dakar', 'pikine': 'Dakar', 'guediawaye': 'Dakar',
        'rufisque': 'Dakar', 'sangalkam': 'Dakar', 'bargny': 'Dakar',
        'saly malika': 'Saly', 'somone': 'Somone', 'popenguine': 'Somone',
        // More Senegal cities
        'tambacounda senegal': 'Tambacounda', 'kolda senegal': 'Kolda',
        'matam senegal': 'Matam', 'kedougou': 'Kédougou', 'kaffrine': 'Kaffrine',
        // ── extended coverage ──
        'dakar plateau': 'Dakar', 'point e': 'Dakar',
        'ile de goree': 'Dakar', 'goree island': 'Dakar',
        'lac rose': 'Dakar', 'saly': 'Saly',
        'la somone': 'La Somone', 'ngaparou': 'Ngaparou',
        'nianing': 'Nianing', 'joal fadiouth': 'Joal-Fadiouth',
        'saint louis senegal': 'Saint-Louis', 'djoudj': 'Saint-Louis',
        'sine saloum': 'Toubacouta', 'toubacouta': 'Toubacouta',
        'palmarin': 'Palmarin', 'thies': 'Thiès',
        'touba': 'Touba', 'tambacounda': 'Tambacounda',
    },
    // ── Rwanda ────────────────────────────────────────────────────────────────
    RW: {
        'kigali city center': 'Kigali', 'nyamirambo': 'Kigali', 'kimihurura': 'Kigali',
        'kacyiru': 'Kigali', 'remera': 'Kigali',
        'gisozi': 'Kigali', 'gasabo': 'Kigali', 'nyarutarama': 'Kigali',
        'kagugu': 'Kigali', 'gacuriro': 'Kigali', 'kibagabaga': 'Kigali',
        'musanze': 'Musanze', 'ruhengeri': 'Musanze', 'volcanoes national park': 'Musanze',
        'gisenyi': 'Rubavu', 'rubavu': 'Rubavu', 'lake kivu rwanda': 'Rubavu',
        'nyungwe forest': 'Nyungwe', 'akagera': 'Akagera',
        'butare': 'Huye', 'huye rwanda': 'Huye',
        'rwamagana': 'Rwamagana',
        // More Kigali sectors
        'kicukiro': 'Kigali', 'niboye': 'Kigali', 'kagarama': 'Kigali',
        'kanombe': 'Kigali', 'gahanga': 'Kigali', 'masaka kigali': 'Kigali',
        'gikondo': 'Kigali', 'kabuye': 'Kigali', 'kimironko': 'Kigali',
        'muhima': 'Kigali', 'nyarugenge': 'Kigali',
        'kiyovu': 'Kigali', 'biryogo': 'Kigali', 'rwampara': 'Kigali',
        // More Rwanda towns
        'kayonza': 'Kayonza', 'kirehe': 'Kirehe',
        'kamonyi': 'Kamonyi', 'ruhango': 'Ruhango',
        'nyanza rwanda': 'Nyanza', 'gisagara': 'Gisagara',
        'nyamagabe': 'Nyamagabe', 'rusizi rwanda': 'Rusizi',
        'karongi': 'Karongi', 'rutsiro': 'Rutsiro',
        'ngororero': 'Ngororero', 'nyabihu': 'Nyabihu',
        'rulindo': 'Rulindo', 'gakenke': 'Gakenke',
        'burera': 'Burera', 'gicumbi': 'Gicumbi',
        'nyagatare': 'Nyagatare', 'gatsibo': 'Gatsibo',
    },
    // ── Mozambique ────────────────────────────────────────────────────────────
    MZ: {
        'polana': 'Maputo', 'baixa maputo': 'Maputo', 'sommerschield': 'Maputo',
        'costa do sol maputo': 'Maputo', 'catembe': 'Maputo',
        'beira mozambique': 'Beira', 'ponta gea': 'Beira',
        'nampula city': 'Nampula', 'nacala': 'Nacala',
        'tofo beach': 'Inhambane', 'barra mozambique': 'Inhambane',
        'vilanculos beach': 'Vilanculos', 'bazaruto archipelago': 'Vilanculos',
        'pemba beach': 'Pemba', 'wimbi beach': 'Pemba',
        'ilha de mocambique': 'Ilha de Moçambique',
        'quirimbas': 'Pemba', 'benguerra island': 'Vilanculos',
        'tete mozambique': 'Tete', 'chimoio': 'Chimoio',
        'lichinga mozambique': 'Lichinga',
        // More Maputo areas
        'matola': 'Maputo', 'machava': 'Maputo',
        'xipamanine': 'Maputo', 'maxaquene': 'Maputo',
        'alto mae': 'Maputo', 'malhangalene': 'Maputo',
        'bairro central maputo': 'Maputo', 'bagamoyo maputo': 'Maputo',
        'catembe ferry': 'Maputo',
        // More Mozambique cities
        'xai xai': 'Xai-Xai', 'inhambane city': 'Inhambane',
        'maxixe': 'Maxixe', 'zavora beach': 'Inhambane',
        'gurue mozambique': 'Gurúè', 'angoche': 'Angoche',
        'mocuba': 'Mocuba', 'quelimane mozambique': 'Quelimane',
        'cuamba': 'Cuamba', 'mandimba': 'Mandimba',
        'mocimboa da praia': 'Mocímboa da Praia',
        'mueda': 'Mueda', 'montepuez': 'Montepuez',
        // ── extended coverage ──
        'maputo centre': 'Maputo', 'costa do sol': 'Maputo',
        'katembe': 'Maputo', 'ponta do ouro': 'Ponta do Ouro',
        'ponta malongane': 'Ponta do Ouro', 'bilene': 'Bilene',
        'tofo': 'Inhambane', 'praia do tofo': 'Inhambane',
        'inhambane': 'Inhambane', 'vilanculos': 'Vilanculos',
        'bazaruto': 'Vilanculos', 'benguerra': 'Vilanculos',
        'quelimane': 'Quelimane', 'nampula': 'Nampula',
        'mozambique island': 'Ilha de Moçambique', 'pemba mozambique': 'Pemba',
        'wimbe beach': 'Pemba', 'ibo island': 'Ibo',
        'tete': 'Tete', 'gorongosa': 'Gorongosa',
    },
    // ── Puerto Rico ───────────────────────────────────────────────────────────
    PR: {
        'old san juan': 'San Juan', 'condado': 'San Juan', 'miramar pr': 'San Juan',
        'isla verde': 'San Juan', 'ocean park': 'San Juan', 'santurce': 'San Juan',
        'ponce historic center': 'Ponce',
        // More San Juan areas
        'hato rey': 'San Juan', 'rio piedras': 'San Juan', 'santurce norte': 'San Juan',
        'viejo san juan': 'San Juan', 'puerta de tierra': 'San Juan',
        'guaynabo puerto rico': 'Guaynabo', 'bayamon puerto rico': 'Bayamon',
        'carolina pr': 'Carolina', 'caguas puerto rico': 'Caguas',
        'mayaguez puerto rico': 'Mayagüez', 'aguadilla puerto rico': 'Aguadilla',
        'arecibo puerto rico': 'Arecibo', 'humacao puerto rico': 'Humacao',
        'fajardo puerto rico': 'Fajardo', 'vieques island': 'Vieques',
        'culebra island': 'Culebra', 'rincon puerto rico': 'Rincón',
        'dorado beach pr': 'Dorado', 'luquillo pr': 'Luquillo',
        'el yunque rainforest': 'Luquillo', 'naguabo': 'Naguabo',
        'guayama pr': 'Guayama', 'salinas pr': 'Salinas',
        'coamo pr': 'Coamo', 'yauco pr': 'Yauco',
        'lares pr': 'Lares', 'utuado pr': 'Utuado',
        // ── extended coverage ──
        'ocean park san juan': 'San Juan', 'miramar san juan': 'San Juan',
        'el yunque': 'Rio Grande', 'rio grande puerto rico': 'Rio Grande',
        'luquillo': 'Luquillo', 'fajardo': 'Fajardo',
        'culebra': 'Culebra', 'flamenco beach': 'Culebra',
        'vieques': 'Vieques', 'esperanza vieques': 'Vieques',
        'rincon': 'Rincón', 'aguadilla': 'Aguadilla',
        'isabela puerto rico': 'Isabela', 'cabo rojo': 'Cabo Rojo',
        'la parguera': 'Lajas', 'ponce': 'Ponce',
        'guanica': 'Guanica', 'salinas puerto rico': 'Salinas',
        'dorado': 'Dorado', 'manati': 'Manati',
        'arecibo': 'Arecibo', 'utuado': 'Utuado',
    },
    // ── Caribbean additions ────────────────────────────────────────────────────
    CW: {
        'punda': 'Willemstad', 'otrobanda': 'Willemstad', 'jan thiel': 'Willemstad',
        'seaquarium beach': 'Willemstad', 'mambo beach': 'Willemstad',
        // Curacao extra areas
        'willemstad city': 'Willemstad', 'pietermaai': 'Willemstad',
        'scharloo': 'Willemstad', 'salinja': 'Willemstad', 'mahuma': 'Willemstad',
        'saliña': 'Willemstad', 'bapor kibra': 'Willemstad',
        'westpunt curacao': 'Westpunt', 'playa lagun': 'Westpunt',
        'grote knip': 'Westpunt', 'kleine knip': 'Westpunt',
        'cas abao beach': 'Willemstad', 'porto marie': 'Willemstad',
        'blue bay beach': 'Willemstad', 'daaibooi beach': 'Willemstad',
        'boca tabla': 'Westpunt', 'shete boka': 'Westpunt',
        'sint michiel': 'Willemstad', 'banda abou': 'Willemstad',
        'banda ariba': 'Willemstad', 'barber curacao': 'Barber',
        // ── extended coverage ──
        'willemstad centre': 'Willemstad', 'blue bay curacao': 'Willemstad',
        'westpunt': 'Westpunt', 'playa kenepa': 'Westpunt',
        'santa barbara curacao': 'Nieuwpoort', 'sint willibrordus': 'Sint Willibrordus',
        'cas abao': 'Soto', 'lagun': 'Lagun',
    },
    AW: {
        'palm beach aruba': 'Palm Beach', 'eagle beach': 'Palm Beach',
        'noord': 'Noord', 'santa cruz aruba': 'Santa Cruz',
        // Aruba extra areas
        'oranjestad city': 'Oranjestad', 'downtown oranjestad': 'Oranjestad',
        'savaneta': 'Savaneta', 'san nicolas aruba': 'San Nicolas',
        'baby beach aruba': 'San Nicolas', 'colorado aruba': 'San Nicolas',
        'brickell bay aruba': 'Oranjestad', 'manchebo beach': 'Oranjestad',
        'druif beach': 'Oranjestad', 'arashi beach': 'Noord',
        'california lighthouse': 'Noord', 'natural pool aruba': 'Noord',
        'arikok national park': 'San Nicolas', 'santa ana aruba': 'Oranjestad',
        'paradera aruba': 'Paradera', 'tanki leendert': 'Tanki Leendert',
        // ── extended coverage ──
        'oranjestad centre': 'Oranjestad', 'malmok': 'Malmok',
        'arashi': 'Malmok', 'arikok': 'Santa Cruz',
        'manchebo': 'Oranjestad', 'tierra del sol': 'Noord',
    },
    TC: {
        'grace bay': 'Providenciales', 'downtown provo': 'Providenciales',
        'leeward': 'Providenciales', 'turtle cove': 'Providenciales',
        'long bay beach': 'Providenciales',
        // Turks and Caicos extra areas
        'providenciales': 'Providenciales', 'provo': 'Providenciales',
        'da conch shack area': 'Providenciales', 'chalk sound': 'Providenciales',
        'northwest point': 'Providenciales', 'sapodilla bay': 'Providenciales',
        'taylor bay': 'Providenciales', 'malco theaters area provo': 'Providenciales',
        'grand turk island': 'Cockburn Town', 'cockburn town': 'Cockburn Town',
        'front street grand turk': 'Cockburn Town', 'pillory beach': 'Cockburn Town',
        'north creek grand turk': 'Cockburn Town', 'governor s beach': 'Cockburn Town',
        'salt cay': 'Salt Cay', 'north caicos': 'Kew',
        'middle caicos': 'Conch Bar', 'conch bar caves': 'Conch Bar',
        'south caicos': 'Cockburn Harbour', 'east caicos': 'Cockburn Harbour',
        'parrot cay': 'Providenciales',
        // ── extended coverage ──
        'leeward turks': 'Providenciales', 'long bay beach turks': 'Providenciales',
        'grand turk': 'Cockburn Town', 'pine cay': 'Providenciales',
    },
    KY: {
        'seven mile beach cayman': 'George Town', 'west bay cayman': 'George Town',
        'camana bay': 'George Town', 'grand cayman': 'George Town',
        // Cayman Islands extra areas
        'george town cayman': 'George Town', 'cayman islands': 'George Town',
        'seven mile beach': 'George Town', 'rum point': 'Rum Point',
        'east end cayman': 'East End', 'north side cayman': 'North Side',
        'bodden town': 'Bodden Town', 'savannah cayman': 'Bodden Town',
        'red bay cayman': 'George Town', 'south sound': 'George Town',
        'cayman brac': 'Stake Bay', 'stake bay': 'Stake Bay',
        'little cayman': 'Blossom Village', 'blossom village': 'Blossom Village',
        'bloody bay wall': 'Blossom Village', 'point of sand': 'Blossom Village',
        // ── extended coverage ──
        'stingray city': 'George Town',
    },
    LC: {
        'rodney bay': 'Rodney Bay', 'marigot bay': 'Castries',
        'soufriere st lucia': 'Soufriere', 'castries city': 'Castries',
        // Saint Lucia extra areas
        'gros islet': 'Gros Islet', 'cap estate': 'Cap Estate', 'pigeon island': 'Pigeon Island',
        'reduit beach': 'Gros Islet', 'rodney bay marina': 'Rodney Bay',
        'castries market': 'Castries', 'derek walcott square': 'Castries',
        'vigie beach': 'Castries', 'choc bay': 'Castries', 'labrelotte bay': 'Castries',
        'marisule': 'Marisule', 'bois dorange': 'Castries',
        'vieux fort': 'Vieux Fort', 'hewanorra airport area': 'Vieux Fort',
        'anse de sables': 'Vieux Fort', 'sandy beach vieux fort': 'Vieux Fort',
        'pitons st lucia': 'Soufriere', 'gros piton': 'Soufriere', 'petit piton': 'Soufriere',
        'anse chastanet': 'Soufriere', 'jade mountain': 'Soufriere', 'ladera resort': 'Soufriere',
        'laborie st lucia': 'Laborie', 'choiseul': 'Choiseul',
        'micoud st lucia': 'Micoud', 'dennery': 'Dennery', 'canaries st lucia': 'Canaries',
        'anse la raye': 'Anse La Raye', 'marigot st lucia': 'Marigot',
        'mon repos st lucia': 'Mon Repos',
        // ── extended coverage ──
        'castries centre': 'Castries', 'vigie': 'Castries',
        'the pitons': 'Soufriere', 'sulphur springs': 'Soufriere',
        'sugar beach st lucia': 'Soufriere', 'hewanorra': 'Vieux Fort',
        'laborie': 'Laborie',
    },
    GD: {
        'grand anse grenada': 'Grand Anse', 'lance aux epines': "St. George's",
        // Grenada extra areas
        "st george's grenada": "St. George's", 'carenage grenada': "St. George's",
        'morne rouge beach': "St. George's", 'magazine beach': "St. George's",
        'point salines': "St. George's", 'Maurice Bishop airport': "St. George's",
        'true blue grenada': "St. George's", 'sugar mill grenada': "St. George's",
        'grenville grenada': 'Grenville', 'st andrews grenada': 'Grenville',
        'gouyave': 'Gouyave', 'st john grenada': 'Gouyave',
        'sauteurs': 'Sauteurs', 'levera grenada': 'Sauteurs', 'bathway beach': 'Sauteurs',
        'victoria grenada': 'Victoria', 'st mark grenada': 'Victoria',
        'grand roy': 'Gouyave', 'concord falls': 'Gouyave',
        'carriacou island': 'Hillsborough', 'hillsborough carriacou': 'Hillsborough',
        'tyrrel bay': 'Hillsborough', 'sandy island grenada': 'Hillsborough',
        'petite martinique': 'Hillsborough',
        'belmont estate': "St. George's", 'la sagesse': "St. George's",
        'grand etang': "St. George's",
        // ── extended coverage ──
        'grand anse': "St. George's", 'st georges grenada': "St. George's",
        'the carenage': "St. George's", 'morne rouge': "St. George's",
        'true blue': "St. George's", 'grenville': 'Grenville',
        'carriacou': 'Hillsborough',
    },
    TT: {
        'woodbrook': 'Port of Spain', 'st clair trinidad': 'Port of Spain',
        'maraval': 'Maraval', 'newtown trinidad': 'Port of Spain',
        'crown point tobago': 'Crown Point', 'store bay': 'Crown Point',
        'speyside': 'Speyside',
        // Trinidad extra areas
        'port of spain city': 'Port of Spain', 'piarco': 'Piarco',
        'chaguanas': 'Chaguanas', 'chaguanas centre': 'Chaguanas',
        'san fernando trinidad': 'San Fernando', 'gulf city': 'San Fernando',
        'arima': 'Arima', 'arima racecourse': 'Arima',
        'couva': 'Couva', 'point lisas': 'Couva',
        'sangre grande': 'Sangre Grande', 'toco trinidad': 'Toco',
        'mayaro': 'Mayaro', 'guayaguayare': 'Mayaro',
        'point fortin': 'Point Fortin', 'siparia': 'Siparia',
        'penal': 'Penal', 'debe trinidad': 'Debe', 'princes town': 'Princes Town',
        'rio claro': 'Rio Claro', 'naparima trinidad': 'San Fernando',
        'maracas bay': 'Port of Spain', 'las cuevas': 'Port of Spain',
        'blanchisseuse': 'Blanchisseuse', 'la fillette': 'Blanchisseuse',
        'carenage': 'Port of Spain', 'diego martin': 'Port of Spain',
        'westmoorings': 'Port of Spain', 'long circular': 'Port of Spain',
        'barataria': 'Port of Spain', 'laventille': 'Port of Spain',
        'morvant': 'Port of Spain', 'success village': 'Port of Spain',
        // Tobago extra areas
        'scarborough tobago': 'Scarborough', 'scarborough market': 'Scarborough',
        'pigeon point': 'Pigeon Point', 'bon accord': 'Crown Point',
        'buccoo reef': 'Buccoo', 'buccoo tobago': 'Buccoo',
        'mount irvine': 'Mount Irvine', 'grafton beach': 'Mount Irvine',
        'black rock tobago': 'Black Rock', 'Plymouth tobago': 'Plymouth',
        'charlotteville tobago': 'Charlotteville', 'parlatuvier': 'Charlotteville',
        'roxborough tobago': 'Roxborough', 'delaford tobago': 'Delaford',
        'man o war bay': 'Charlotteville', 'englishman bay': 'Roxborough',
        'castara': 'Castara',
    },
    // ── Belize ────────────────────────────────────────────────────────────────
    BZ: {
        'san pedro belize': 'San Pedro', 'ambergris caye': 'San Pedro',
        'caye caulker village': 'Caye Caulker', 'belize city centre': 'Belize City',
        'placencia village': 'Placencia', 'san ignacio': 'San Ignacio',
        // Belize expanded
        'belize barrier reef': 'San Pedro', 'bacalar chico': 'San Pedro',
        'lighthouse atoll': 'Lighthouse Reef', 'blue hole belize': 'Lighthouse Reef',
        'half moon caye': 'Lighthouse Reef', 'glover reef': 'Placencia',
        'turneffe atoll': 'Belize City', 'dangriga': 'Dangriga', 'hopkins belize': 'Hopkins',
        'punta gorda belize': 'Punta Gorda', 'toledo district': 'Punta Gorda',
        'orange walk': 'Orange Walk', 'lamanai ruins': 'Orange Walk',
        'xunantunich': 'San Ignacio', 'caracol belize': 'San Ignacio',
        'mountain pine ridge': 'San Ignacio', 'actun tunichil muknal': 'San Ignacio',
        'corozal belize': 'Corozal', 'santa elena belize': 'San Ignacio',
        'belmopan': 'Belmopan',
        // ── extended coverage ──
        'secret beach belize': 'San Pedro', 'caye caulker': 'Caye Caulker',
        'placencia': 'Placencia', 'maya beach': 'Placencia',
        'seine bight': 'Placencia', 'hopkins': 'Hopkins',
        'san ignacio belize': 'San Ignacio', 'cayo district': 'San Ignacio',
        'benque viejo': 'Benque Viejo del Carmen', 'corozal': 'Corozal',
        'caracol': 'San Ignacio',
    },
    // ── El Salvador / Honduras / Nicaragua ────────────────────────────────────
    SV: {
        'zona rosa san salvador': 'San Salvador', 'colonia escalon': 'San Salvador',
        'el tunco': 'La Libertad',
        // El Salvador expanded
        'santa elena san salvador': 'San Salvador', 'colonia san benito': 'San Salvador',
        'la gran via': 'San Salvador', 'multiplaza sv': 'San Salvador',
        'la palma sv': 'La Palma', 'el pital': 'La Palma',
        'el boquerón': 'San Salvador', 'apaneca': 'Apaneca',
        'juayua': 'Juayua', 'nahuizalco': 'Nahuizalco', 'ruta de las flores': 'Apaneca',
        'la libertad beach': 'La Libertad', 'sunzal beach': 'La Libertad',
        'playa el sunzal': 'La Libertad',
        'suchitoto': 'Suchitoto', 'lake suchitlan': 'Suchitoto',
        'santa ana sv': 'Santa Ana (und Umgebung)', 'chalchuapa': 'Santa Ana (und Umgebung)', 'tazumal ruins': 'Santa Ana (und Umgebung)',
        'san miguel sv': 'San Miguel', 'usulutan': 'Usulutan',
        'playa el cuco': 'El Cuco',
        'el tunco surf': 'La Libertad', 'playa el zonte': 'La Libertad',
        // ── extended coverage ──
        'san salvador centro': 'San Salvador', 'escalon': 'San Salvador',
        'santa tecla': 'Santa Tecla', 'antiguo cuscatlan': 'Antiguo Cuscatlan',
        'playa el tunco': 'El Tunco', 'el zonte': 'El Zonte',
        'bitcoin beach': 'El Zonte', 'la libertad el salvador': 'La Libertad',
        'el sunzal': 'El Tunco', 'santa ana el salvador': 'Santa Ana',
        'ataco': 'Concepcion de Ataco', 'concepcion de ataco': 'Concepcion de Ataco',
        'lago de coatepeque': 'Coatepeque', 'san miguel el salvador': 'San Miguel',
        'el cuco': 'El Cuco', 'la union el salvador': 'La Union',
        'sonsonate': 'Sonsonate',
    },
    HN: {
        'roatan west end': 'Roatan', 'west bay roatan': 'Roatan', 'la ceiba city': 'La Ceiba',
        // Honduras expanded
        'roatan east end': 'Roatan', 'french harbour': 'Roatan', 'coxen hole': 'Roatan',
        'utila island': 'Utila', 'guanaja island': 'Guanaja', 'bay islands': 'Roatan',
        'tegucigalpa city': 'Tegucigalpa', 'comayaguela': 'Tegucigalpa',
        'san pedro sula': 'San Pedro Sula', 'belen jerez': 'San Pedro Sula',
        'copan ruinas': 'Copan Ruinas', 'copan ruins': 'Copan Ruinas',
        'tela beach': 'Tela', 'lancetilla': 'Tela', 'punta sal': 'Tela',
        'trujillo honduras': 'Trujillo', 'limon colombia honduras': 'Trujillo',
        'gracias lempira': 'Gracias', 'celaque': 'Gracias',
        'comayagua city': 'Comayagua',
        // ── extended coverage ──
        'roatan': 'Roatan', 'west end roatan': 'Roatan',
        'sandy bay roatan': 'Roatan', 'utila': 'Utila',
        'guanaja': 'Guanaja', 'tegucigalpa centro': 'Tegucigalpa',
        'san pedro sula centro': 'San Pedro Sula', 'la ceiba': 'La Ceiba',
        'tela': 'Tela', 'gracias honduras': 'Gracias',
        'lago de yojoa': 'Pena Blanca', 'pena blanca': 'Pena Blanca',
        'omoa': 'Omoa', 'santa rosa de copan': 'Santa Rosa de Copan',
        'comayagua': 'Comayagua', 'valle de angeles': 'Valle de Angeles',
    },
    // ── Bolivia ───────────────────────────────────────────────────────────────
    BO: {
        'sopocachi': 'La Paz', 'miraflores la paz': 'La Paz', 'zona sur la paz': 'La Paz',
        'salar de uyuni': 'Uyuni', 'uyuni town': 'Uyuni',
        'sucre city': 'Sucre', 'potosi city': 'Potosi',
        'copacabana bolivia': 'Copacabana',
        'santa cruz city': 'Santa Cruz de la Sierra',
        // Bolivia expanded
        'el alto': 'El Alto', 'cochabamba city': 'Cochabamba',
        'trinidad bolivia': 'Trinidad', 'cobija': 'Cobija',
        'rurrenabaque': 'Rurrenabaque', 'amazon bolivia': 'Rurrenabaque',
        'tarija city': 'Tarija', 'oruro city': 'Oruro', 'oruro carnival': 'Oruro',
        'isla del sol': 'Isla del Sol', 'tiwanaku': 'Tiahuanaco',
        'death road bolivia': 'La Paz', 'yungas road': 'La Paz',
        'la paz city centre': 'La Paz', 'lower city la paz': 'La Paz',
        // ── extended coverage ──
        'la paz centro': 'La Paz', 'calacoto': 'La Paz',
        'witches market': 'La Paz', 'valle de la luna': 'La Paz',
        'death road': 'Coroico', 'coroico': 'Coroico',
        'uyuni salt flats': 'Uyuni', 'lake titicaca bolivia': 'Copacabana',
        'sucre bolivia': 'Sucre', 'potosi': 'Potosi',
        'cerro rico': 'Potosi', 'santa cruz de la sierra': 'Santa Cruz',
        'samaipata': 'Samaipata', 'cochabamba': 'Cochabamba',
        'tarija': 'Tarija', 'madidi': 'Rurrenabaque',
        'oruro': 'Oruro', 'tupiza': 'Tupiza',
        'sorata': 'Sorata',
    },
    // ── Paraguay ──────────────────────────────────────────────────────────────
    PY: {
        'asuncion city centre': 'Asunción (und Umgebung)', 'villa morra': 'Asunción (und Umgebung)',
        // Paraguay expanded
        'barrio jara': 'Asunción (und Umgebung)', 'centro asuncion': 'Asunción (und Umgebung)',
        'trinidad asuncion': 'Asunción (und Umgebung)', 'las mercedes': 'Asunción (und Umgebung)',
        'ciudad del este': 'Ciudad del Este', 'encarnacion': 'Encarnación',
        'itaipu paraguay': 'Ciudad del Este',
        // More Asuncion neighborhoods
        'catedral asuncion': 'Asunción (und Umgebung)', 'sajonia': 'Asunción (und Umgebung)',
        'recoleta asuncion': 'Asunción (und Umgebung)', 'itauguá': 'Asunción (und Umgebung)',
        'luque paraguay': 'Luque', 'mariano roque alonso': 'Mariano Roque Alonso',
        'san lorenzo paraguay': 'San Lorenzo', 'ñemby': 'Ñemby',
        // More Paraguay cities
        'pedro juan caballero': 'Pedro Juan Caballero',
        'filadelfia paraguay': 'Filadelfia', 'concepcion py': 'Concepción',
        'caacupe paraguay': 'Caacupé', 'san bernardino': 'San Bernardino',
        'ypacarai': 'Ypacaraí', 'pilar paraguay': 'Pilar',
        'villarrica py': 'Villarrica', 'coronel oviedo': 'Coronel Oviedo',
        'caaguazu': 'Caaguazú', 'juan e ogorman': 'Pedro Juan Caballero',
        'salto del guaira': 'Salto del Guairá', 'iguazu py': 'Ciudad del Este',
        // ── extended coverage ──
        'asuncion centro': 'Asuncion', 'carmelitas': 'Asuncion',
        'costanera asuncion': 'Asuncion', 'lambare': 'Asuncion',
        'itaipu': 'Ciudad del Este', 'saltos del monday': 'Ciudad del Este',
        'trinidad paraguay': 'Encarnación', 'jesuit missions': 'Encarnación',
        'lake ypacarai': 'San Bernardino', 'aregua': 'Aregua',
        'villarrica paraguay': 'Villarrica', 'concepcion paraguay': 'Concepción',
        'filadelfia': 'Filadelfia', 'chaco paraguay': 'Filadelfia',
    },
    // ── Venezuela ─────────────────────────────────────────────────────────────
    VE: {
        'altamira caracas': 'Caracas', 'chacao': 'Caracas', 'las mercedes caracas': 'Caracas',
        'los palos grandes': 'Caracas', 'la castellana': 'Caracas',
        'sabana grande': 'Caracas', 'el rosal': 'Caracas', 'bello campo': 'Caracas',
        'prados del este': 'Caracas', 'los dos caminos': 'Caracas',
        'la california caracas': 'Caracas', 'el hatillo': 'Caracas',
        'santa fe caracas': 'Caracas', 'chuao': 'Caracas',
        'margarita island': 'Porlamar', 'isla margarita': 'Porlamar',
        'porlamar': 'Porlamar', 'pampatar': 'Porlamar', 'juan griego': 'Porlamar',
        'playa el agua': 'Porlamar', 'la asuncion': 'Porlamar',
        'los roques': 'Los Roques', 'gran roque': 'Los Roques',
        'merida venezuela': 'Merida', 'los nevados': 'Merida', 'mucubaji': 'Merida',
        'canaima': 'Canaima', 'angel falls area': 'Canaima',
        'tepuy': 'Canaima', 'roraima tepuy': 'Canaima',
        'maracaibo city': 'Maracaibo', 'maracaibo lake': 'Maracaibo',
        'valencia venezuela': 'Valencia', 'naguanagua': 'Valencia',
        'barquisimeto': 'Barquisimeto', 'cabudare barquisimeto': 'Barquisimeto',
        'maturin': 'Maturín', 'maturin city': 'Maturín',
        'ciudad bolivar': 'Ciudad Bolívar', 'bolivar city venezuela': 'Ciudad Bolívar',
        'puerto la cruz': 'Puerto La Cruz', 'barcelona venezuela': 'Puerto La Cruz',
        'cumana': 'Cumaná', 'cumaná': 'Cumaná',
        'maracay': 'Maracay', 'san mateo aragua': 'Maracay',
        'san cristobal tachira': 'San Cristóbal', 'san cristóbal venezuela': 'San Cristóbal',
        'punto fijo venezuela': 'Punto Fijo', 'coro venezuela': 'Coro',
        'morrocoy national park': 'Tucacas',
        // ── extended coverage ──
        'la castellana caracas': 'Caracas', 'angel falls': 'Canaima',
        'salto angel': 'Canaima', 'choroni': 'Choroni',
        'mochima': 'Puerto La Cruz', 'maracaibo': 'Maracaibo',
        'coro': 'Coro', 'morrocoy': 'Tucacas',
        'tucacas': 'Tucacas',
    },
    // ── Mongolia ──────────────────────────────────────────────────────────────
    MN: {
        'sukhbaatar square': 'Ulaanbaatar', 'zaisan': 'Ulaanbaatar',
        'gandan': 'Ulaanbaatar', 'narantuul': 'Ulaanbaatar',
        // Mongolia expanded
        'ulaanbaatar city': 'Ulaanbaatar', 'ulaanbaatar center': 'Ulaanbaatar',
        'ulaanbaatar downtown': 'Ulaanbaatar', 'khan uul': 'Ulaanbaatar',
        'gobi desert': 'Dalanzadgad', 'dalanzadgad': 'Dalanzadgad',
        'khuvsgul lake': 'Moron', 'moron mongolia': 'Moron',
        'terelj': 'Ulaanbaatar', 'chinggis khaan': 'Ulaanbaatar',
        'erdenet city': 'Erdenet',
        // More Ulaanbaatar districts
        'chingeltei': 'Ulaanbaatar', 'bayanzurkh': 'Ulaanbaatar',
        'bayangol': 'Ulaanbaatar', 'nalaikh': 'Ulaanbaatar',
        'songino khairkhan': 'Ulaanbaatar', 'sukhbaatar district': 'Ulaanbaatar',
        'bayankhoshuu': 'Ulaanbaatar',
        // More Mongolia cities
        'darkhan city': 'Darkhan', 'darkhan uul': 'Darkhan',
        'choibalsan': 'Choibalsan', 'baganuur': 'Baganuur',
        'bulgan city': 'Bulgan', 'murun': 'Mörön',
        'arvaikheer': 'Arvaikheer', 'mandalgovi': 'Mandalgovi',
        'sainshand': 'Sainshand', 'zamiin uud': 'Zamiin-Üüd',
        'altai city mn': 'Altai', 'khovd city': 'Khovd',
        'ulaangom': 'Ulaangom', 'olgii': 'Ölgii',
        // Gobi Desert sites
        'khongoryn els': 'Dalanzadgad', 'singing dunes mongolia': 'Dalanzadgad',
        'yolyn am': 'Dalanzadgad', 'flaming cliffs': 'Dalanzadgad',
        'bayanzag': 'Dalanzadgad',
        // Orkhon Valley
        'kharkhorin': 'Kharkhorin', 'karakorum ruins': 'Kharkhorin',
        'orkhon valley': 'Kharkhorin', 'orkhon waterfall': 'Kharkhorin',
        'erdene zuu': 'Kharkhorin',
        // Khuvsgul
        'khatgal': 'Moron', 'khuvsgul camp': 'Moron',
        'tsaatan reindeer': 'Moron',
        // More Terelj / UB area
        'terelj national park': 'Ulaanbaatar', 'turtle rock terelj': 'Ulaanbaatar',
        'ariyabal monastery': 'Ulaanbaatar',
        'hustai national park': 'Ulaanbaatar', 'przewalski horse': 'Ulaanbaatar',
        // More provinces / cities
        'bayankhongor city': 'Bayankhongor', 'zavkhan': 'Uliastai',
        'uliastai': 'Uliastai', 'govi altai': 'Altai',
        'sukhbaatar province': 'Baruun-Urt', 'baruun urt': 'Baruun-Urt',
        'zuunmod': 'Zuunmod', 'nalaikh district': 'Ulaanbaatar',
        // Mongolian language names
        'Улаанбаатар': 'Ulaanbaatar', 'Дархан': 'Darkhan',
        'Эрдэнэт': 'Erdenet', 'Чойбалсан': 'Choibalsan',
        'Говь-Алтай': 'Altai', 'Өлгий': 'Ölgii',
        // ── extended coverage ──
        'ulaanbaatar centre': 'Ulaanbaatar', 'gandan monastery': 'Ulaanbaatar',
        'gorkhi terelj': 'Nalaikh', 'genghis khan statue': 'Nalaikh',
        'karakorum': 'Kharkhorin', 'khuvsgul': 'Khatgal',
        'bayan olgii': 'Ölgii', 'altai tavan bogd': 'Ölgii',
        'kharkhiraa': 'Ulaangom', 'tsetserleg': 'Tsetserleg',
        'erdenet': 'Erdenet', 'darkhan': 'Darkhan',
    },
    // ── Myanmar ───────────────────────────────────────────────────────────────
    MM: {
        // Yangon — colonial core / downtown
        'kyauktada': 'Yangon', 'pabedan': 'Yangon', 'lanmadaw': 'Yangon',
        'latha': 'Yangon', 'dagon': 'Yangon', 'botataung': 'Yangon',
        'pazundaung': 'Yangon', 'mingala taungnyunt': 'Yangon',
        // Yangon — midtown / expat quarters
        'bahan': 'Yangon', 'kamayut': 'Yangon', 'sanchaung': 'Yangon',
        'hlaing': 'Yangon', 'tamwe': 'Yangon', 'yankin': 'Yangon',
        'thingangyun': 'Yangon', 'insein': 'Yangon', 'dawbon': 'Yangon',
        // Yangon — north / airport area
        'mayangon': 'Yangon', 'mingaladon': 'Yangon', 'north okkalapa': 'Yangon',
        'south okkalapa': 'Yangon', 'shwepyitha': 'Yangon',
        // Mandalay townships
        'chanayethazan': 'Mandalay', 'chanmyathazi': 'Mandalay',
        'aungmyethazan': 'Mandalay', 'mahaaungmye': 'Mandalay',
        'pyigyidagun': 'Mandalay', 'amarapura': 'Mandalay',
        'sagaing': 'Mandalay', 'inwa': 'Mandalay',
        // Bagan archaeological zone
        'old bagan': 'Bagan', 'new bagan': 'Bagan', 'nyaung-u': 'Bagan',
        'nyaung u': 'Bagan', 'myinkaba': 'Bagan', 'thiripyitsaya': 'Bagan',
        'popa mountain': 'Bagan',
        // Inle Lake / Shan State
        'nyaungshwe': 'Nyaungshwe', 'inle lake': 'Nyaungshwe',
        'heho': 'Nyaungshwe', 'taunggyi': 'Taunggyi',
        // Ngapali Beach (Rakhine State)
        'ngapali beach': 'Ngapali', 'thandwe': 'Ngapali',
        // Other cities
        'naypyidaw city': 'Naypyidaw',
        'mawlamyine city': 'Mawlamyine', 'moulmein': 'Mawlamyine',
        'loikaw city': 'Loikaw',
        'pathein city': 'Pathein',
        // Myanmar extras
        'myeik': 'Myeik', 'mergui archipelago': 'Myeik',
        'dawei city': 'Dawei', 'myitkyina': 'Myitkyina',
        'hsipaw': 'Hsipaw', 'kalaw': 'Kalaw',
        'pindaya caves': 'Pindaya', 'pindaya': 'Pindaya',
        'monywa': 'Monywa', 'po win taung': 'Monywa',
        'kengtung': 'Kengtung', 'tachileik': 'Tachileik',
        'golden rock': 'Kyaiktiyo', 'kyaiktiyo': 'Kyaiktiyo',
        'chaungtha beach': 'Chaungtha', 'ngwe saung': 'Ngwe Saung',
        // Myanmar extras
        'bago': 'Bago', 'shwemawdaw': 'Bago', 'bago city': 'Bago',
        'hpa an': 'Hpa-an', 'kawkareik': 'Kawkareik',
        'kawthaung': 'Kawthaung', 'victoria point myanmar': 'Kawthaung',
        'golden valley yangon': 'Yangon', 'inya lake area': 'Yangon',
        'zegyo market': 'Mandalay', 'mahamuni': 'Mandalay',
        'naypyidaw': 'Naypyidaw', 'ottarathiri': 'Naypyidaw',
        'sittwe': 'Sittwe',
        // More Yangon townships
        'thaketa': 'Yangon', 'kyimyindaing': 'Yangon', 'seikkan': 'Yangon',
        'ahlone': 'Yangon', 'dekkhina thiri': 'Yangon',
        'hlaingtharyar': 'Yangon', 'shwepaukkan': 'Yangon',
        // More Mandalay
        'pyin oo lwin': 'Pyin Oo Lwin', 'maymyo': 'Pyin Oo Lwin',
        'tada u': 'Mandalay', 'patheingyi': 'Mandalay',
        'paleik white elephant': 'Mandalay',
        // Shan State extras
        'lashio': 'Lashio', 'kyaukme': 'Kyaukme',
        'pindaya caves area': 'Pindaya', 'kakku pagodas': 'Taunggyi',
        'naung tong lake': 'Kengtung',
        // Rakhine State
        'mrauk u': 'Mrauk-U', 'mrauk-u ruins': 'Mrauk-U',
        'chin state hakha': 'Hakha', 'hakha': 'Hakha',
        'mindat': 'Mindat', 'mount victoria myanmar': 'Mindat',
        // More Kayin / Mon State
        'hpa an city': 'Hpa-an', 'saddan cave': 'Hpa-an',
        'kyaikkami': 'Mawlamyine', 'thanlyin': 'Yangon',
        // Sagaing Region extras
        'monywa city': 'Monywa', 'kanbawzathadi': 'Bago',
        'shwedagon area': 'Yangon', 'dagon township': 'Yangon',
        // Tanintharyi
        'myeik archipelago': 'Myeik', 'lampi island': 'Myeik',
        'dawei beach': 'Dawei',
        // Myanmar language searches
        'ရန်ကုန်': 'Yangon', 'မန္တလေး': 'Mandalay',
        'နေပြည်တော်': 'Naypyidaw', 'ပုဂံ': 'Bagan',
        'ဘားဂိုး': 'Bago', 'မော်လမြိုင်': 'Mawlamyine',
    },
    // ── Additional Middle East ────────────────────────────────────────────────
    // ── Algeria ───────────────────────────────────────────────────────────────
    DZ: {
        'algiers city': 'Algiers', 'casbah algiers': 'Algiers',
        'bab el oued': 'Algiers', 'hydra algiers': 'Algiers',
        'hussein dey': 'Algiers', 'el biar': 'Algiers',
        'tlemcen old town': 'Tlemcen', 'beni mester': 'Tlemcen',
        'constantine city': 'Constantine', 'sidi mabrouk': 'Constantine',
        'oran city': 'Oran', 'es senia': 'Oran', 'bir el djir': 'Oran',
        'annaba city': 'Annaba',
        'blida city': 'Blida', 'setif city': 'Setif',
        'batna city': 'Batna', 'bejaia city': 'Bejaia',
        'skikda': 'Skikda', 'tizi ouzou': 'Tizi Ouzou',
        'ghardaia': 'Ghardaia', 'tamanrasset': 'Tamanrasset',
        'biskra city': 'Biskra', 'bechar city': 'Bechar',
        'djelfa': 'Djelfa', 'tiaret': 'Tiaret',
        'ouargla': 'Ouargla', 'el oued': 'El Oued',
    },
    // ── Cameroon ──────────────────────────────────────────────────────────────
    CM: {
        'douala city': 'Douala', 'akwa': 'Douala', 'bali douala': 'Douala',
        'bonamoussadi': 'Douala', 'deido': 'Douala', 'bonaberi': 'Douala',
        'yaounde city': 'Yaounde', 'bastos': 'Yaounde', 'nlongkak': 'Yaounde',
        'mvan': 'Yaounde', 'mimboman': 'Yaounde',
        'bafoussam': 'Bafoussam', 'bamenda': 'Bamenda',
        'garoua': 'Garoua', 'maroua': 'Maroua',
        'ngaoundere': 'Ngaoundere', 'bertoua': 'Bertoua',
        'kribi beach': 'Kribi', 'kribi': 'Kribi', 'limbe cameroon': 'Limbe',
        // More Douala neighborhoods
        'kotto douala': 'Douala', 'bepanda douala': 'Douala', 'makepe douala': 'Douala',
        'ndogbati': 'Douala', 'bonadibong': 'Douala', 'village douala': 'Douala',
        // More Yaoundé neighborhoods
        'mvoly': 'Yaounde', 'essos yaounde': 'Yaounde', 'ekoudou': 'Yaounde',
        'mvog-ada': 'Yaounde', 'biyem assi': 'Yaounde', 'madagascar yaounde': 'Yaounde',
        // More cities
        'edea cameroon': 'Edéa', 'ebolowa': 'Ebolowa', 'kumba cameroon': 'Kumba',
        'buea cameroon': 'Buea', 'mamfe cameroon': 'Mamfe', 'tiko': 'Tiko',
    },
    // ── Ivory Coast / Cote d'Ivoire ───────────────────────────────────────────
    CI: {
        'plateau abidjan': 'Abidjan', 'marcory': 'Abidjan', 'cocody': 'Abidjan',
        'yopougon': 'Abidjan', 'abobo': 'Abidjan', 'adjame': 'Abidjan',
        'port bouet': 'Abidjan', 'treichville': 'Abidjan',
        'riviera golf': 'Abidjan', 'deux plateaux': 'Abidjan',
        'yamoussoukro city': 'Yamoussoukro',
        'bouake city': 'Bouake', 'korhogo': 'Korhogo',
        'san pedro cote divoire': "San-Pédro", 'man cote divoire': 'Man',
        'daloa': 'Daloa',
        // More Abidjan neighborhoods
        'angre': 'Abidjan', 'attecoube': 'Abidjan', 'koumassi': 'Abidjan',
        'bingerville': 'Abidjan', 'songon': 'Abidjan', 'anyama': 'Abidjan',
        'bassam': 'Grand-Bassam', 'grand bassam': 'Grand-Bassam',
        // More cities
        'ferke': 'Ferkessédougou', 'bondoukou': 'Bondoukou',
        'seguela': 'Séguéla', 'odienne': 'Odienné',
        'abengourou': 'Abengourou', 'adzope': 'Adzopé',
    },
    // ── Zambia ────────────────────────────────────────────────────────────────
    ZM: {
        'livingstone city': 'Livingstone', 'victoria falls zam': 'Livingstone',
        'mosi-oa-tunya': 'Livingstone', 'maramba': 'Livingstone',
        'lusaka city': 'Lusaka', 'kabulonga': 'Lusaka',
        'woodlands lusaka': 'Lusaka', 'Rhodes Park lusaka': 'Lusaka',
        'longacres lusaka': 'Lusaka', 'mass media lusaka': 'Lusaka',
        'ndola city': 'Ndola', 'kitwe city': 'Kitwe', 'chingola': 'Chingola',
        'kabwe zambia': 'Kabwe', 'chipata zambia': 'Chipata',
        'mfuwe south luangwa': 'Mfuwe',
        // More Lusaka areas
        'chelston lusaka': 'Lusaka', 'chawama': 'Lusaka',
        'chilenje lusaka': 'Lusaka', 'matero': 'Lusaka',
        'emmasdale': 'Lusaka', 'kalingalinga': 'Lusaka',
        'garden lusaka': 'Lusaka', 'rhodes park': 'Lusaka',
        'roma lusaka': 'Lusaka', 'ibex hill': 'Lusaka',
        'olympia park': 'Lusaka', 'makeni lusaka': 'Lusaka',
        'chawama township': 'Lusaka',
        // More Zambia cities
        'solwezi': 'Solwezi', 'kasama zambia': 'Kasama',
        'mansa zambia': 'Mansa', 'samfya zambia': 'Samfya',
        'lake bangweulu': 'Samfya',
        'mongu zambia': 'Mongu', 'barotseland': 'Mongu',
        'senanga': 'Senanga', 'sesheke zambia': 'Sesheke',
        'mazabuka': 'Mazabuka', 'choma zambia': 'Choma',
        'kalomo': 'Kalomo', 'livingstone road': 'Livingstone',
        'siavonga': 'Siavonga', 'lake kariba zambia': 'Siavonga',
        'kafue national park': 'Kafue',
        // ── extended coverage ──
        'victoria falls zambia': 'Livingstone', 'livingstone zambia': 'Livingstone',
        'mosi oa tunya': 'Livingstone', 'devils pool': 'Livingstone',
        'lusaka centre': 'Lusaka', 'south luangwa': 'Mfuwe',
        'mfuwe': 'Mfuwe', 'lower zambezi': 'Chirundu',
        'chirundu': 'Chirundu', 'mumbwa': 'Mumbwa',
        'ndola': 'Ndola', 'kitwe': 'Kitwe',
        'chipata': 'Chipata', 'kasama': 'Kasama',
        'shiwa ngandu': 'Mpika', 'mpika': 'Mpika',
    },
    // ── Zimbabwe ──────────────────────────────────────────────────────────────
    ZW: {
        'victoria falls town': 'Victoria Falls', 'victoria falls zimbabwe': 'Victoria Falls',
        'harare city centre': 'Harare', 'avondale harare': 'Harare',
        'borrowdale harare': 'Harare', 'mount pleasant harare': 'Harare',
        'highfield harare': 'Harare', 'chitungwiza': 'Chitungwiza',
        'bulawayo city': 'Bulawayo', 'suburbs bulawayo': 'Bulawayo',
        'mutare city': 'Mutare', 'gweru city': 'Gweru',
        'masvingo city': 'Masvingo', 'great zimbabwe ruins': 'Masvingo',
        'hwange national park': 'Hwange',
        'kariba town': 'Kariba', 'binga zimbabwe': 'Binga',
        'nyanga zimbabwe': 'Nyanga',
        // More Harare suburbs
        'avenues harare': 'Harare', 'belvedere harare': 'Harare',
        'mbare harare': 'Harare', 'kuwadzana': 'Harare',
        'mufakose': 'Harare', 'budiriro': 'Harare',
        'glen norah': 'Harare', 'glen view harare': 'Harare',
        'sunningdale harare': 'Harare', 'highlands harare': 'Harare',
        'hatfield harare': 'Harare', 'msasa harare': 'Harare',
        'greendale harare': 'Harare', 'tynwald harare': 'Harare',
        'westgate harare': 'Harare', 'pomona': 'Harare',
        'epworth harare': 'Harare',
        // Bulawayo suburbs
        'luveve': 'Bulawayo', 'emakhandeni': 'Bulawayo',
        'entumbane': 'Bulawayo', 'nkulumane': 'Bulawayo',
        'northend bulawayo': 'Bulawayo', 'hillside bulawayo': 'Bulawayo',
        'queens park bulawayo': 'Bulawayo',
        // More Zimbabwe cities
        'kwekwe city': 'Kwekwe', 'redcliff kwekwe': 'Kwekwe',
        'chegutu': 'Chegutu', 'chinhoyi': 'Chinhoyi',
        'bindura': 'Bindura', 'marondera': 'Marondera',
        'rusape zimbabwe': 'Rusape', 'buhera': 'Buhera',
        'zvishavane': 'Zvishavane', 'shurugwi': 'Shurugwi',
        'chiredzi': 'Chiredzi', 'triangle zimbabwe': 'Triangle',
        'beit bridge': 'Beit Bridge',
    },
    // ── Malawi ────────────────────────────────────────────────────────────────
    MW: {
        'lilongwe old town': 'Lilongwe', 'area 3 lilongwe': 'Lilongwe',
        'area 47 lilongwe': 'Lilongwe', 'city centre lilongwe': 'Lilongwe',
        'blantyre city': 'Blantyre', 'limbe malawi': 'Blantyre',
        'zomba city': 'Zomba', 'mangochi malawi': 'Mangochi',
        'cape maclear': 'Mangochi', 'monkey bay': 'Mangochi',
        'mzuzu city': 'Mzuzu', 'nkhata bay': 'Nkhata Bay',
        'karonga malawi': 'Karonga',
        // More Lilongwe areas
        'area 18 lilongwe': 'Lilongwe', 'area 25 lilongwe': 'Lilongwe',
        'area 30 lilongwe': 'Lilongwe', 'area 43 lilongwe': 'Lilongwe',
        'capital hill lilongwe': 'Lilongwe', 'old town lilongwe': 'Lilongwe',
        'kanengo': 'Lilongwe', 'Area 49 lilongwe': 'Lilongwe',
        // More Blantyre areas
        'ndirande': 'Blantyre', 'chirimba': 'Blantyre',
        'bangwe blantyre': 'Blantyre', 'soche': 'Blantyre',
        'kanjedza': 'Blantyre', 'likhubula': 'Blantyre',
        'chichiri blantyre': 'Blantyre', 'zingwangwa': 'Blantyre',
        // More Malawi towns
        'dedza malawi': 'Dedza', 'ntcheu malawi': 'Ntcheu',
        'salima malawi': 'Salima', 'lake malawi': 'Salima',
        'senga bay': 'Salima', 'kota kota': 'Nkhotakota',
        'nkhotakota': 'Nkhotakota', 'kasungu malawi': 'Kasungu',
        'mchinji malawi': 'Mchinji', 'dowa malawi': 'Dowa',
        'nsanje malawi': 'Nsanje', 'thyolo malawi': 'Thyolo',
        'mulanje malawi': 'Mulanje', 'phalombe': 'Phalombe',
        'liwonde': 'Liwonde', 'machinga': 'Machinga',
        // ── extended coverage ──
        'lilongwe centre': 'Lilongwe', 'salima': 'Salima',
        'likoma island': 'Likoma', 'chintheche': 'Nkhata Bay',
        'blantyre centre': 'Blantyre', 'zomba': 'Zomba',
        'mount mulanje': 'Mulanje', 'mulanje': 'Mulanje',
        'majete': 'Chikwawa', 'nyika plateau': 'Rumphi',
        'rumphi': 'Rumphi', 'mzuzu': 'Mzuzu',
        'karonga': 'Karonga', 'dedza': 'Dedza',
    },
    // ── Namibia ───────────────────────────────────────────────────────────────
    NA: {
        'windhoek city': 'Windhoek', 'katutura': 'Windhoek',
        'klein windhoek': 'Windhoek', 'eros windhoek': 'Windhoek',
        'hochland park': 'Windhoek', 'khomasdal': 'Windhoek',
        'swakopmund city': 'Swakopmund', 'long beach namibia': 'Swakopmund',
        'walvis bay': 'Walvis Bay', 'dune 7': 'Walvis Bay',
        'sossusvlei': 'Sesriem', 'dead vlei': 'Sesriem', 'sesriem canyon': 'Sesriem',
        'luderitz': 'Luderitz', 'kolmanskop': 'Luderitz',
        'etosha national park': 'Etosha', 'okaukuejo': 'Etosha',
        'lüderitz': 'Luderitz',
        'rundu namibia': 'Rundu', 'katima mulilo': 'Katima Mulilo',
        'opuwo namibia': 'Opuwo',
        // ── extended coverage ──
        'windhoek centre': 'Windhoek', 'sesriem': 'Sesriem',
        'deadvlei': 'Sesriem', 'swakopmund': 'Swakopmund',
        'sandwich harbour': 'Walvis Bay', 'etosha': 'Okaukuejo',
        'namutoni': 'Okaukuejo', 'fish river canyon': 'Ai-Ais',
        'ai ais': 'Ai-Ais', 'damaraland': 'Khorixas',
        'khorixas': 'Khorixas', 'twyfelfontein': 'Khorixas',
        'spitzkoppe': 'Usakos', 'usakos': 'Usakos',
        'opuwo': 'Opuwo', 'kaokoland': 'Opuwo',
        'rundu': 'Rundu', 'keetmanshoop': 'Keetmanshoop',
        'otjiwarongo': 'Otjiwarongo', 'tsumeb': 'Tsumeb',
    },
    // ── Botswana ──────────────────────────────────────────────────────────────
    BW: {
        'gaborone city': 'Gaborone', 'maun': 'Maun',
        'gaborone cbd': 'Gaborone', 'block 6 gaborone': 'Gaborone',
        'tlokweng': 'Gaborone', 'mogoditshane': 'Gaborone',
        'kasane': 'Kasane', 'chobe national park': 'Kasane',
        'okavango delta': 'Maun', 'moremi game reserve': 'Maun',
        'francistown botswana': 'Francistown',
        'selebi-phikwe': 'Selebi-Phikwe',
        'palapye': 'Palapye', 'lobatse': 'Lobatse',
        'serowe': 'Serowe',
        // ── extended coverage ──
        'gaborone centre': 'Gaborone', 'main mall gaborone': 'Gaborone',
        'moremi': 'Maun', 'chobe': 'Kasane',
        'savuti': 'Kasane', 'makgadikgadi': 'Gweta',
        'gweta': 'Gweta', 'nata': 'Nata',
        'central kalahari': 'Ghanzi', 'ghanzi': 'Ghanzi',
        'tsodilo hills': 'Shakawe', 'shakawe': 'Shakawe',
        'francistown': 'Francistown', 'kanye': 'Kanye',
    },
    // ── Madagascar ────────────────────────────────────────────────────────────
    MG: {
        'antananarivo city': 'Antananarivo', 'nosy be': 'Nosy Be',
        'tana madagascar': 'Antananarivo', 'isoraka': 'Antananarivo',
        'analakely': 'Antananarivo', 'behoririka': 'Antananarivo',
        'ampefiloha': 'Antananarivo', 'ambohidahy': 'Antananarivo',
        'toamasina': 'Toamasina', 'tamatave': 'Toamasina',
        'mahajanga': 'Mahajanga', 'majunga': 'Mahajanga',
        'fianarantsoa': 'Fianarantsoa',
        'toliara': 'Toliara', 'tulear': 'Toliara',
        'ambositra': 'Ambositra', 'antsirabe': 'Antsirabe',
        'nosy boraha': 'Nosy Boraha', 'sainte marie island': 'Nosy Boraha',
        'ifaty': 'Toliara', 'isalo national park': 'Ranohira',
        'ranohira': 'Ranohira', 'ankarana': 'Ankarana',
        // More Antananarivo neighborhoods
        'andohalo': 'Antananarivo', '67 ha': 'Antananarivo',
        'ankadifotsy': 'Antananarivo', 'ankorahotra': 'Antananarivo',
        'ivandry': 'Antananarivo', 'ambohibao': 'Antananarivo',
        'ambatobe': 'Antananarivo', 'tsarasaotra': 'Antananarivo',
        'anosizato': 'Antananarivo', 'andravoahangy': 'Antananarivo',
        'ankadimbahoaka': 'Antananarivo', 'tanjombato': 'Antananarivo',
        'itaosy': 'Antananarivo', 'ampefiloha hill': 'Antananarivo',
        // More Madagascar cities
        'manakara': 'Manakara', 'farafangana': 'Farafangana',
        'morondava': 'Morondava', 'avenue des baobabs': 'Morondava',
        'bekopaka': 'Bekopaka', 'tsingy de bemaraha': 'Bekopaka',
        'diego suarez': 'Antsiranana', 'antsiranana': 'Antsiranana',
        'vohemar': 'Vohemar', 'sambava': 'Sambava',
        'antalaha': 'Antalaha', 'masoala peninsula': 'Antalaha',
        'mananjary': 'Mananjary', 'vangaindrano': 'Vangaindrano',
        'ambovombe': 'Ambovombe', 'fort dauphin': 'Tôlanaro',
        'tolanaro': 'Tôlanaro', 'ste luce': 'Tôlanaro',
        'nosy iranja': 'Nosy Be', 'hell-ville': 'Nosy Be',
        'nosy komba': 'Nosy Be', 'nosy tanikely': 'Nosy Be',
        'ambatolampy': 'Ambatolampy', 'betafo': 'Betafo',
    },
    // ── Galapagos (Ecuador) ───────────────────────────────────────────────────
    // (EC already defined above — Galapagos islands map to Puerto Ayora)
    // ── Brunei ────────────────────────────────────────────────────────────────
    BN: {
        'bandar seri begawan': 'Bandar Seri Begawan', 'gadong': 'Bandar Seri Begawan',
        'bsb': 'Bandar Seri Begawan', 'kampong ayer': 'Bandar Seri Begawan',
        'kiulap': 'Bandar Seri Begawan', 'menglait': 'Bandar Seri Begawan',
        'manggis brunei': 'Bandar Seri Begawan', 'berakas': 'Bandar Seri Begawan',
        'seria': 'Seria', 'kuala belait': 'Kuala Belait', 'tutong': 'Tutong',
        'temburong': 'Temburong', 'bangar brunei': 'Bangar',
        // Mapbox returns this one as "Bangar Town"; key it under that name too so
        // the output-side remap fires (Mapbox has no plain "Bangar" in BN).
        'bangar town': 'Bangar',
        // More BSB districts
        'kiarong': 'Bandar Seri Begawan', 'beribi': 'Bandar Seri Begawan',
        'sg hanching': 'Bandar Seri Begawan', 'sg tilong': 'Bandar Seri Begawan',
        'mulaut': 'Bandar Seri Begawan', 'lambak': 'Bandar Seri Begawan',
        'rimba': 'Bandar Seri Begawan', 'anggerek desa': 'Bandar Seri Begawan',
        'jalan tutong': 'Bandar Seri Begawan', 'batu bersurat': 'Bandar Seri Begawan',
        // Landmarks
        'omar ali saifuddien mosque': 'Bandar Seri Begawan',
        'jame asr hassanil bolkiah': 'Bandar Seri Begawan',
        'istana nurul iman': 'Bandar Seri Begawan',
        'royal regalia museum': 'Bandar Seri Begawan',
        'yayasan complex': 'Bandar Seri Begawan',
        // Temburong / nature
        'ulu temburong national park': 'Temburong',
        'kuala belalong': 'Temburong', 'belalong canopy walkway': 'Temburong',
        'wasai kendari waterfall': 'Temburong',
        // Seria / Belait
        'billionth barrel monument': 'Seria', 'lumut brunei': 'Seria',
        'jerudong': 'Jerudong', 'jerudong park': 'Jerudong', 'empire hotel brunei': 'Jerudong',
        // Malay names
        'brunei darussalam': 'Bandar Seri Begawan',
        'negara brunei darussalam': 'Bandar Seri Begawan',
        // ── extended coverage ──
        'bandar seri begawan centre': 'Bandar Seri Begawan', 'water village brunei': 'Bandar Seri Begawan',
        'empire brunei': 'Jerudong', 'muara': 'Muara',
        'ulu temburong': 'Bangar', 'jame asr': 'Bandar Seri Begawan',
    },
    // ── Papua New Guinea ──────────────────────────────────────────────────────
    PG: {
        'port moresby city': 'Port Moresby', 'waigani': 'Port Moresby',
        'boroko': 'Port Moresby', 'gordons': 'Port Moresby',
        'konedobu': 'Port Moresby', 'gerehu': 'Port Moresby',
        'lae city png': 'Lae', 'mt hagen': 'Mount Hagen',
        'mount hagen city': 'Mount Hagen', 'goroka': 'Goroka',
        'madang city': 'Madang', 'kokopo': 'Kokopo',
        'wewak png': 'Wewak', 'vanimo': 'Vanimo',
        'alotau milne bay': 'Alotau',
        // More Port Moresby areas
        'tokarara': 'Port Moresby', 'korobosea': 'Port Moresby',
        'hohola': 'Port Moresby', 'sabama': 'Port Moresby',
        'badili': 'Port Moresby', 'granville': 'Port Moresby',
        'moresby north east': 'Port Moresby', 'port moresby south': 'Port Moresby',
        // More PNG cities
        'arawa bougainville': 'Arawa', 'buka png': 'Buka',
        'kavieng': 'Kavieng', 'manus island': 'Lorengau',
        'lorengau': 'Lorengau', 'daru png': 'Daru',
        'kiunga': 'Kiunga', 'tabubil png': 'Tabubil',
        'kimbe png': 'Kimbe', 'hoskins': 'Hoskins',
        'rabaul old town': 'Kokopo',
        // ── extended coverage ──
        'port moresby centre': 'Port Moresby', 'ela beach': 'Port Moresby',
        'harbour city': 'Port Moresby', 'lae': 'Lae',
        'madang': 'Madang', 'wewak': 'Wewak',
        'mount hagen': 'Mount Hagen', 'tari': 'Tari',
        'ambua': 'Tari', 'rabaul': 'Rabaul',
        'east new britain': 'Kokopo', 'kimbe': 'Kimbe',
        'walindi': 'Kimbe', 'alotau': 'Alotau',
        'milne bay': 'Alotau', 'tufi': 'Tufi',
        'new ireland': 'Kavieng', 'buka': 'Buka',
        'bougainville': 'Buka', 'kokoda track': 'Port Moresby',
        'sepik': 'Wewak',
    },
    // ── Vanuatu ───────────────────────────────────────────────────────────────
    VU: {
        'port vila city': 'Port Vila', 'mele beach': 'Port Vila',
        'hideaway island': 'Port Vila', 'efate island': 'Port Vila',
        'luganville': 'Luganville', 'santo vanuatu': 'Luganville',
        'champagne beach': 'Luganville', 'tanna island': 'Tanna',
        'yasur volcano': 'Tanna', 'pentecost island': 'Longana',
        'malekula island': 'Lamap',
        // Vanuatu extras
        'lenakel': 'Lenakel', 'mount yasur volcano': 'Lenakel',
        'white grass vanuatu': 'Lenakel', 'mystery island': 'Aneityum',
        'espiritu santo island': 'Luganville', 'aore island': 'Luganville',
        'ambae island': 'Saratamata', 'ambrym island': 'Craig Cove',
        'lakatoro': 'Lakatoro', 'havannah harbour': 'Port Vila',
        'port vila harbour': 'Port Vila',
        // ── extended coverage ──
        'port vila centre': 'Port Vila', 'iririki': 'Port Vila',
        'mele': 'Port Vila', 'pango': 'Port Vila',
        'erakor': 'Port Vila', 'efate': 'Port Vila',
        'tanna': 'Lenakel', 'mount yasur': 'Lenakel',
        'espiritu santo': 'Luganville', 'million dollar point': 'Luganville',
        'malekula': 'Lakatoro', 'ambrym': 'Ambrym',
        'pentecost': 'Pentecost', 'land diving': 'Pentecost',
        'epi vanuatu': 'Epi',
    },
    // ── Solomon Islands ───────────────────────────────────────────────────────
    SB: {
        'honiara city': 'Honiara', 'chinatown honiara': 'Honiara',
        'point cruz': 'Honiara', 'gizo solomon': 'Gizo',
        'munda solomon': 'Munda', 'auki': 'Auki',
        // More Solomon Islands
        'tulagi': 'Tulagi', 'marovo lagoon': 'Seghe',
        'seghe solomon': 'Seghe', 'tigoa rennell': 'Tigoa',
        'kirakira makira': 'Kirakira', 'lata santa cruz': 'Lata',
        'buala solomon': 'Buala',
        // ── extended coverage ──
        'honiara centre': 'Honiara', 'guadalcanal': 'Honiara',
        'gizo': 'Gizo', 'western province solomon': 'Gizo',
        'munda': 'Munda', 'seghe': 'Seghe',
        'uepi': 'Seghe', 'malaita': 'Auki',
        'santa isabel': 'Buala', 'buala': 'Buala',
        'kirakira': 'Kirakira', 'lata': 'Lata',
        'tetepare': 'Munda', 'rennell': 'Tigoa',
    },
    // ── Tonga ─────────────────────────────────────────────────────────────────
    TO: {
        'nukualofa': "Nuku'alofa", 'nuku alofa': "Nuku'alofa",
        'taufa ahau': "Nuku'alofa", 'kolomotu a': "Nuku'alofa",
        'vavau': "Neiafu", 'neiafu vavau': "Neiafu",
        'haapai': "Pangai", 'pangai tonga': "Pangai",
        'tongatapu island': "Nuku'alofa", 'nukualofa waterfront': "Nuku'alofa",
        'eua island': "Ohonua", 'ohonua eua': "Ohonua",
        'niuatoputapu': "Hihifo", 'niuafoou': "Niuafoou",
        "ha'apai group": "Pangai", "vava'u group": "Neiafu",
        // ── extended coverage ──
        'nukualofa centre': "Nuku'alofa", 'port of refuge': 'Neiafu',
        'swallows cave': 'Neiafu', 'foa': 'Pangai',
        'lifuka': 'Pangai', 'uoleva': 'Pangai',
        'mounu island': 'Neiafu', 'kelefesia': 'Pangai',
        'talamahu market': "Nuku'alofa", 'blowholes tonga': "Nuku'alofa",
        'haatafu': "Nuku'alofa", 'fafa island': "Nuku'alofa",
        'pangaimotu': "Nuku'alofa",
    },
    // ── Guyana ────────────────────────────────────────────────────────────────
    GY: {
        'georgetown guyana': 'Georgetown', 'stellingweg': 'Georgetown',
        'kitty guyana': 'Georgetown', 'bourda': 'Georgetown',
        'linden guyana': 'Linden', 'new amsterdam guyana': 'New Amsterdam',
        'kaieteur falls': 'Kaieteur', 'lethem guyana': 'Lethem',
        // More Georgetown areas
        'cummingsburg': 'Georgetown', 'newtown guyana': 'Georgetown',
        'lacytown': 'Georgetown', 'lodge guyana': 'Georgetown',
        'subryanville': 'Georgetown', 'campbellville': 'Georgetown',
        'lamaha gardens': 'Georgetown', 'south ruimveldt': 'Georgetown',
        'north ruimveldt': 'Georgetown', 'bel air park guyana': 'Georgetown',
        // More Guyana cities
        'bartica guyana': 'Bartica', 'corriverton': 'Corriverton',
        'skeldon guyana': 'Skeldon', 'berbice guyana': 'New Amsterdam',
        'parika guyana': 'Parika', 'anna regina': 'Anna Regina',
        'mabaruma guyana': 'Mabaruma', 'port kaituma': 'Port Kaituma',
        'mahdia guyana': 'Mahdia',
        // ── extended coverage ──
        'stabroek': 'Georgetown', 'kingston guyana': 'Georgetown',
        'mahdia': 'Mahdia', 'lethem': 'Lethem',
        'bartica': 'Bartica', 'rupununi': 'Lethem',
        'iwokrama': 'Bartica',
    },
    // ── Suriname ──────────────────────────────────────────────────────────────
    SR: {
        'paramaribo city': 'Paramaribo', 'waterkant': 'Paramaribo',
        'flora district': 'Paramaribo', 'commewijne': 'Paramaribo',
        'nieuw amsterdam suriname': 'Paramaribo',
        'nieuw nickerie': 'Nieuw Nickerie',
        'apoera suriname': 'Apoera',
        // More Paramaribo areas
        'centrum paramaribo': 'Paramaribo', 'beekhuizen': 'Paramaribo',
        'tourtonne': 'Paramaribo', 'latour': 'Paramaribo',
        'rainville paramaribo': 'Paramaribo', 'livorno': 'Paramaribo',
        'weg naar zee': 'Paramaribo',
        // Suriname districts
        'lelydorp': 'Lelydorp', 'albina suriname': 'Albina',
        'moengo': 'Moengo', 'totness': 'Totness',
        'brokopondo': 'Brokopondo', 'brownsweg': 'Brownsweg',
        'atjoni': 'Atjoni', 'bigi pan': 'Bigi Pan',
        // ── extended coverage ──
        'paramaribo centre': 'Paramaribo', 'palmentuin': 'Paramaribo',
        'brownsberg': 'Brownsweg', 'galibi': 'Albina',
        'albina': 'Albina',
    },
    // ── Libya ─────────────────────────────────────────────────────────────────
    LY: {
        'tripoli libya': 'Tripoli', 'tripoli city centre': 'Tripoli',
        'old city tripoli': 'Tripoli', 'hay al andalus': 'Tripoli',
        'benghazi city': 'Benghazi',
        'misrata city': 'Misrata',
        'sebha libya': 'Sabha',
        // More Tripoli areas
        'zawiya libya': 'Zawiya', 'tajoura libya': 'Tripoli',
        'ain zara': 'Tripoli', 'fashloum': 'Tripoli',
        'gargaresh': 'Tripoli', 'janzour': 'Tripoli',
        'souq juma': 'Tripoli', 'souq al jumaa': 'Tripoli',
        // More Libya cities
        'zintan libya': 'Zintan', 'gharyan': 'Gharyan',
        'tobruk city': 'Tobruk', 'derna libya': 'Derna',
        'ajdabiya': 'Ajdabiya', 'brega libya': 'Brega',
        'sirte libya': 'Sirte', 'hun libya': 'Hun',
        'ghat libya': 'Ghat', 'ubari': 'Ubari',
        'murzuq': 'Murzuq', 'awbari': 'Awbari',
        // ── extended coverage ──
        'tripoli centre': 'Tripoli', 'medina tripoli': 'Tripoli',
        'martyrs square tripoli': 'Tripoli', 'benghazi centre': 'Benghazi',
        'leptis magna': 'Al Khums', 'al khums': 'Al Khums',
        'sabratha': 'Sabratha', 'cyrene': 'Shahhat',
        'shahhat': 'Shahhat', 'apollonia libya': 'Susah',
        'ghadames': 'Ghadames', 'akakus': 'Ghat',
        'sabha': 'Sabha', 'misrata': 'Misrata',
        'tobruk': 'Tobruk', 'derna': 'Derna',
        'al bayda libya': 'Al Bayda', 'zuwara': 'Zuwara',
        'sirte': 'Sirte',
    },
    // ── Sudan ─────────────────────────────────────────────────────────────────
    SD: {
        'khartoum city': 'Khartoum', 'omdurman': 'Khartoum', 'bahri': 'Khartoum',
        'burri khartoum': 'Khartoum', 'amarat khartoum': 'Khartoum',
        'port sudan': 'Port Sudan',
        'wad madani': 'Wad Madani', 'kassala sudan': 'Kassala',
        'el fasher': 'El Fasher', 'nyala darfur': 'Nyala',
        // More Khartoum areas
        'riyadh khartoum': 'Khartoum', 'kafouri': 'Khartoum',
        'shambat khartoum': 'Khartoum', 'khartoum north': 'Khartoum',
        'al manshiya': 'Khartoum', 'umbada': 'Khartoum',
        'kalakla': 'Khartoum', 'soba khartoum': 'Khartoum',
        'jebel awliya': 'Khartoum',
        // More Sudan cities
        'atbara sudan': 'Atbara', 'shendi sudan': 'Shendi',
        'kosti sudan': 'Kosti', 'sennar sudan': 'Sennar',
        'el obeid sudan': 'El Obeid', 'al-ubayyid': 'El Obeid',
        'gedaref': 'Gedaref', 'khashm el girba': 'Khashm el Girba',
        'al qadarif': 'Gedaref',
        'dongola sudan': 'Dongola', 'karima sudan': 'Karima',
        'merowe sudan': 'Merowe', 'juba road khartoum': 'Khartoum',
        // ── extended coverage ──
        'khartoum centre': 'Khartoum', 'confluence of the niles': 'Khartoum',
        'meroe': 'Shendi', 'shendi': 'Shendi',
        'pyramids of meroe': 'Shendi', 'karima': 'Karima',
        'jebel barkal': 'Karima', 'dongola': 'Dongola',
        'wadi halfa': 'Wadi Halfa', 'sanganeb': 'Port Sudan',
        'suakin': 'Suakin', 'kassala': 'Kassala',
        'nyala sudan': 'Nyala', 'el obeid': 'El Obeid',
        'atbara': 'Atbara',
    },
    // ── Somalia ───────────────────────────────────────────────────────────────
    SO: {
        'mogadishu city': 'Mogadishu', 'hodan district': 'Mogadishu',
        'hamar weyne': 'Mogadishu', 'warta nabada': 'Mogadishu',
        'hargeisa somaliland': 'Hargeisa', 'hargeisa city': 'Hargeisa',
        'bosaso': 'Bosaso', 'kismayo': 'Kismayo',
        'berbera somalia': 'Berbera',
        // More Mogadishu districts
        'wadajir': 'Mogadishu', 'bondhere': 'Mogadishu',
        'shingani': 'Mogadishu', 'xamarweyne': 'Mogadishu',
        'karan district': 'Mogadishu', 'heliwaa': 'Mogadishu',
        'daynile': 'Mogadishu', 'shibis': 'Mogadishu',
        'dharkenley': 'Mogadishu',
        // More Somalia cities
        'baidoa': 'Baidoa', 'beledweyne': 'Beledweyne',
        'afgooye': 'Afgooye', 'marka': 'Marka',
        'gaalkacyo': 'Gaalkacyo', 'garowe': 'Garowe',
        'burco': 'Burao', 'burao somaliland': 'Burao',
        'borama': 'Borama', 'laascaanood': 'Las Anod',
        'luuq somalia': 'Luuq',
        // ── extended coverage ──
        'mogadishu centre': 'Mogadishu', 'lido beach mogadishu': 'Mogadishu',
        'hamarweyne': 'Mogadishu', 'hargeisa centre': 'Hargeisa',
        'somaliland': 'Hargeisa', 'berbera': 'Berbera',
        'laas geel': 'Hargeisa', 'burao': 'Burao',
        'puntland': 'Garowe', 'galkayo': 'Galkayo',
    },
    // ── Djibouti ──────────────────────────────────────────────────────────────
    DJ: {
        'djibouti city': 'Djibouti', 'djibouti ville': 'Djibouti',
        'quartier 4': 'Djibouti',
        'tadjoura': 'Tadjoura', 'obock': 'Obock',
        'ali sabieh': 'Ali Sabieh',
        // More Djibouti city areas
        'balbala': 'Djibouti', 'enguela': 'Djibouti',
        'hayi riyad': 'Djibouti', 'arhiba': 'Djibouti',
        'plateau du serpent': 'Djibouti', 'cite populaire': 'Djibouti',
        // More Djibouti regions
        'arta': 'Arta', 'dikhil': 'Dikhil',
        'dorale beach': 'Djibouti', 'khor ambado': 'Djibouti',
        'lac abbe': 'Dikhil', 'lac assal': 'Dikhil',
        // ── extended coverage ──
        'djibouti city centre': 'Djibouti', 'heron djibouti': 'Djibouti',
        'lake assal': 'Tadjoura', 'lake abbe': 'Dikhil',
        'moucha island': 'Djibouti', 'day forest': 'Tadjoura',
        'goubet': 'Tadjoura',
    },
    // ── Eritrea ───────────────────────────────────────────────────────────────
    ER: {
        'asmara city': 'Asmara', 'fiat tagliero': 'Asmara',
        'massawa eritrea': 'Massawa', 'dahlak archipelago': 'Massawa',
        'keren eritrea': 'Keren',
        // More Asmara areas
        'edaga hamus': 'Asmara', 'tiravolo': 'Asmara',
        'paradiso asmara': 'Asmara', 'godaif': 'Asmara',
        'mai temenay': 'Asmara', 'gheza banda': 'Asmara',
        // More Eritrea cities
        'mendefera': 'Mendefera', 'dekemhare': 'Dekemhare',
        'adi keyh': 'Adi Keyh', 'adi quala': 'Adi Quala',
        'barentu': 'Barentu', 'tessenei': 'Tessenei',
        'assab eritrea': 'Assab', 'nakfa eritrea': 'Nakfa',
        // ── extended coverage ──
        'asmara centre': 'Asmara', 'harnet avenue': 'Asmara',
        'massawa': 'Massawa', 'assab': 'Assab',
        'keren': 'Keren', 'adi keih': 'Adi Keih',
        'qohaito': 'Adi Keih', 'nakfa': 'Nakfa',
    },
    // ── Angola ────────────────────────────────────────────────────────────────
    AO: {
        'luanda city': 'Luanda', 'ingombota': 'Luanda', 'sambizanga': 'Luanda',
        'miramar luanda': 'Luanda', 'maianga': 'Luanda',
        'ilha do cabo': 'Luanda', 'ilha luanda': 'Luanda',
        'lubango angola': 'Lubango', 'huambo angola': 'Huambo',
        'benguela city': 'Benguela', 'lobito angola': 'Lobito',
        'malanje angola': 'Malanje',
        // More Luanda districts
        'cazenga luanda': 'Luanda', 'viana luanda': 'Luanda',
        'cacuaco luanda': 'Luanda', 'belas luanda': 'Luanda',
        'kilamba luanda': 'Luanda', 'talatona luanda': 'Luanda',
        'alvalade luanda': 'Luanda', 'rangel luanda': 'Luanda',
        'moxico angola': 'Moxico', 'kuito angola': 'Kuito',
        'uige angola': 'Uíge', 'mbanza kongo': 'Mbanza Kongo',
        'cabinda city': 'Cabinda', 'soyo angola': 'Soyo',
        'luena angola': 'Luena', 'menongue': 'Menongue',
        'ondjiva': 'Ondjiva', 'namibe city': 'Namibe',
        'tombua': 'Tombua', 'lubango city': 'Lubango',
        'saurimo': 'Saurimo', 'dundo angola': 'Dundo',
        // ── extended coverage ──
        'luanda centre': 'Luanda', 'ilha de luanda': 'Luanda',
        'talatona': 'Luanda', 'marginal luanda': 'Luanda',
        'mussulo': 'Luanda', 'cabo ledo': 'Cabo Ledo',
        'kissama': 'Muxima', 'benguela': 'Benguela',
        'lobito': 'Lobito', 'baia azul': 'Benguela',
        'namibe': 'Namibe', 'arco angola': 'Namibe',
        'lubango': 'Lubango', 'tundavala': 'Lubango',
        'serra da leba': 'Lubango', 'huambo': 'Huambo',
        'kalandula falls': 'Malanje', 'malanje': 'Malanje',
        'pungo andongo': 'Malanje', 'soyo': 'Soyo',
        'cabinda': 'Cabinda', 'sumbe': 'Sumbe',
    },
    // ── Democratic Republic of Congo ──────────────────────────────────────────
    CD: {
        'kinshasa city': 'Kinshasa', 'gombe kinshasa': 'Kinshasa',
        'lemba kinshasa': 'Kinshasa', 'ngaliema kinshasa': 'Kinshasa',
        'kintambo kinshasa': 'Kinshasa', 'lingwala kinshasa': 'Kinshasa',
        'lubumbashi drc': 'Lubumbashi', 'katanga lubumbashi': 'Lubumbashi',
        'mbuji mayi': 'Mbuji-Mayi', 'kisangani drc': 'Kisangani',
        'goma drc': 'Goma', 'bukavu drc': 'Bukavu',
        'bunia drc': 'Bunia',
        // More Kinshasa communes
        'kalamu': 'Kinshasa', 'kasa-vubu': 'Kinshasa', 'bandalungwa': 'Kinshasa',
        'barumbu': 'Kinshasa', 'bumbu': 'Kinshasa', 'selembao': 'Kinshasa',
        'makala kinshasa': 'Kinshasa', 'mont ngafula': 'Kinshasa',
        'ndjili kinshasa': 'Kinshasa', 'masina kinshasa': 'Kinshasa',
        'kisenso': 'Kinshasa', 'maluku drc': 'Kinshasa',
        // More DRC cities
        'kananga drc': 'Kananga', 'tshikapa': 'Tshikapa',
        'kolwezi drc': 'Kolwezi', 'likasi drc': 'Likasi',
        'kalemie': 'Kalemie', 'uvira drc': 'Uvira',
        'beni drc': 'Beni', 'butembo drc': 'Butembo',
        'gbadolite': 'Gbadolite', 'gemena': 'Gemena',
        'lisala drc': 'Lisala', 'bumba drc': 'Bumba',
        'boende drc': 'Boende', 'ilebo drc': 'Ilebo',
        // ── extended coverage ──
        'kinshasa centre': 'Kinshasa', 'lingwala': 'Kinshasa',
        'ngaliema': 'Kinshasa', 'bandal': 'Kinshasa',
        'lubumbashi centre': 'Lubumbashi', 'goma centre': 'Goma',
        'nyiragongo': 'Goma', 'virunga': 'Goma',
        'bukavu': 'Bukavu', 'kahuzi biega': 'Bukavu',
        'idjwi': 'Bukavu', 'kisangani': 'Kisangani',
        'boyoma falls': 'Kisangani', 'kananga': 'Kananga',
        'matadi': 'Matadi', 'muanda': 'Muanda',
        'kolwezi': 'Kolwezi', 'zongo falls': 'Kinshasa',
        'lola ya bonobo': 'Kinshasa',
    },
    // ── Republic of Congo ─────────────────────────────────────────────────────
    CG: {
        'brazzaville city': 'Brazzaville', 'poto-poto': 'Brazzaville',
        'bacongo': 'Brazzaville', 'makabana': 'Brazzaville',
        'pointe noire congo': 'Pointe-Noire', 'tchiamba nzassi': 'Pointe-Noire',
        // More Brazzaville areas
        'moungali': 'Brazzaville', 'poto poto': 'Brazzaville',
        'ouenze': 'Brazzaville', 'talangai': 'Brazzaville',
        'madibou': 'Brazzaville', 'makeleleke': 'Brazzaville',
        'djiri': 'Brazzaville', 'ngamakosso': 'Brazzaville',
        // More Pointe-Noire areas
        'mvou-mvou': 'Pointe-Noire', 'loandjili': 'Pointe-Noire',
        'nkouikou': 'Pointe-Noire', 'tié-tié': 'Pointe-Noire',
        // Congo other cities
        'nkayi congo': 'Nkayi', 'dolisie': 'Dolisie',
        'mossendjo': 'Mossendjo', 'sibiti': 'Sibiti',
        'impfondo': 'Impfondo', 'ouesso congo': 'Ouesso',
        'sangha region': 'Ouesso',
        // ── extended coverage ──
        'brazzaville centre': 'Brazzaville', 'les rapides': 'Brazzaville',
        'pointe noire': 'Pointe-Noire', 'cote sauvage': 'Pointe-Noire',
        'diosso': 'Pointe-Noire', 'odzala': 'Ouesso',
        'ouesso': 'Ouesso', 'nouabale ndoki': 'Ouesso',
        'lesio louna': 'Brazzaville', 'oyo congo': 'Oyo',
    },
    // ── Gabon ─────────────────────────────────────────────────────────────────
    GA: {
        'libreville city': 'Libreville', 'louis': 'Libreville',
        'port gentil gabon': 'Port-Gentil',
        'franceville gabon': 'Franceville',
        'lopé national park': 'Lopé',
        // More Libreville areas
        'derrière la prison': 'Libreville', 'akanda': 'Libreville',
        'owendo': 'Libreville', 'ntoum': 'Libreville',
        'la sablière': 'Libreville', 'montagne sainte': 'Libreville',
        // More Gabon cities
        'oyem gabon': 'Oyem', 'minvoul': 'Minvoul',
        'makokou gabon': 'Makokou', 'booue': 'Booué',
        'mouila gabon': 'Mouila', 'tchibanga': 'Tchibanga',
        'lambarene gabon': 'Lambaréné', 'ndjole': 'Ndjolé',
        'mitzic': 'Mitzic', 'bitam gabon': 'Bitam',
        // ── extended coverage ──
        'libreville centre': 'Libreville', 'quartier louis': 'Libreville',
        'glass libreville': 'Libreville', 'pointe denis': 'Libreville',
        'port gentil': 'Port-Gentil', 'loango national park': 'Gamba',
        'gamba': 'Gamba', 'lope national park': 'Lopé',
        'lope': 'Lopé', 'ivindo': 'Makokou',
        'makokou': 'Makokou', 'kongou falls': 'Makokou',
        'franceville': 'Franceville', 'lekedi': 'Bakoumba',
        'oyem': 'Oyem', 'lambarene': 'Lambaréné',
        'mouila': 'Mouila', 'tchimbele': 'Libreville',
    },
    // ── Nigeria extras ────────────────────────────────────────────────────────
    // (NG already defined, adding more cities)
    // ── Togo ──────────────────────────────────────────────────────────────────
    TG: {
        'lome city': 'Lomé', 'lomé': 'Lomé', 'tokoin': 'Lomé',
        'nyekonakpoe': 'Lomé', 'baguida': 'Lomé',
        'kpalime': 'Kpalimé', 'atakpame': 'Atakpamé',
        'sokode togo': 'Sokodé', 'kara togo': 'Kara',
        // More Lomé quarters
        'adewui': 'Lomé', 'bé lomé': 'Lomé', 'agoe lomé': 'Lomé',
        'kodjoviakope': 'Lomé', 'hanoukopé': 'Lomé', 'adidogome': 'Lomé',
        'ablogame': 'Lomé', 'cacaveli': 'Lomé', 'djidjolé': 'Lomé',
        'avépozo': 'Lomé', 'porto seguro togo': 'Lomé',
        // More Togo cities
        'dapaong': 'Dapaong', 'mango togo': 'Mango',
        'bafilo': 'Bafilo', 'bassar': 'Bassar',
        'notse togo': 'Notsé', 'vogan': 'Vogan',
        'aneho togo': 'Aného', 'grande anse togo': 'Aného',
        'tsévié': 'Tsévié', 'tabligbo': 'Tabligbo',
        // ── extended coverage ──
        'lome centre': 'Lomé', 'bd du mono': 'Lomé',
        'grand marche lome': 'Lomé', 'agbodrafo': 'Agbodrafo',
        'lake togo': 'Agbodrafo', 'aneho': 'Aného',
        'mount agou': 'Kpalimé', 'koutammakou': 'Kara',
        'tamberma': 'Kara', 'sokode': 'Sokodé',
        'togoville': 'Togoville', 'fazao': 'Sokodé',
    },
    // ── Benin ─────────────────────────────────────────────────────────────────
    BJ: {
        'cotonou city': 'Cotonou', 'ganhi': 'Cotonou',
        'cadjehoun': 'Cotonou', 'godomey': 'Cotonou',
        'porto novo benin': 'Porto-Novo', 'parakou benin': 'Parakou',
        'abomey calavi': 'Abomey-Calavi',
        'ouidah benin': 'Ouidah', 'grand popo': 'Grand-Popo',
        // More Cotonou districts
        'fidjrosse': 'Cotonou', 'haie vive': 'Cotonou',
        'cadjehoun airport': 'Cotonou', 'missebo': 'Cotonou',
        'gbeto': 'Cotonou', 'ladji cotonou': 'Cotonou',
        'akpakpa': 'Cotonou', 'dantokpa market': 'Cotonou',
        'jonquet cotonou': 'Cotonou', 'zongo cotonou': 'Cotonou',
        // More Benin cities
        'abomey benin': 'Abomey', 'bohicon': 'Bohicon',
        'natitingou': 'Natitingou', 'djougou': 'Djougou',
        'kandi benin': 'Kandi', 'malanville': 'Malanville',
        'nikki benin': 'Nikki', 'savè benin': 'Savè',
        'lokossa': 'Lokossa', 'comé benin': 'Comé',
        'porto novo downtown': 'Porto-Novo', 'hogbonou': 'Porto-Novo',
        // ── extended coverage ──
        'cotonou centre': 'Cotonou', 'ganvie': 'Cotonou',
        'ouidah': 'Ouidah', 'door of no return': 'Ouidah',
        'abomey': 'Abomey', 'royal palaces of abomey': 'Abomey',
        'pendjari': 'Natitingou', 'tanguieta': 'Tanguieta',
        'parakou': 'Parakou', 'dassa zoume': 'Dassa-Zoume',
        'possotome': 'Comé',
    },
    // ── Burkina Faso ──────────────────────────────────────────────────────────
    BF: {
        'ouagadougou city': 'Ouagadougou', 'ouaga 2000': 'Ouagadougou',
        'zaca': 'Ouagadougou', 'paspanga': 'Ouagadougou',
        'bobo dioulasso': 'Bobo-Dioulasso', 'bobo': 'Bobo-Dioulasso',
        'ouahigouya': 'Ouahigouya', 'banfora': 'Banfora',
        'koudougou burkina': 'Koudougou',
        // More Ouagadougou districts
        'pissy': 'Ouagadougou', 'gounghin': 'Ouagadougou',
        'dapoya': 'Ouagadougou', 'bilbalogho': 'Ouagadougou',
        'tampouy': 'Ouagadougou', 'nongr-masson': 'Ouagadougou',
        'rotonde ouaga': 'Ouagadougou', 'ouaga 2000 cite': 'Ouagadougou',
        // More Bobo-Dioulasso areas
        'secteur 22 bobo': 'Bobo-Dioulasso', 'kibidwe': 'Bobo-Dioulasso',
        'dioulassoba': 'Bobo-Dioulasso', 'guimbi': 'Bobo-Dioulasso',
        // More Burkina cities
        'dedougou': 'Dédougou', 'nouna burkina': 'Nouna',
        'tenkodogo': 'Tenkodogo', 'manga burkina': 'Manga',
        'leo burkina': 'Léo', 'gaoua burkina': 'Gaoua',
        'diapaga': 'Diapaga', 'fada ngourma': "Fada N'gourma",
        'dori burkina': 'Dori', 'djibo burkina': 'Djibo',
        // ── extended coverage ──
        'ouagadougou centre': 'Ouagadougou', 'koulouba': 'Ouagadougou',
        'zone du bois': 'Ouagadougou', 'karfiguela': 'Banfora',
        'sindou peaks': 'Sindou', 'sindou': 'Sindou',
        'nazinga': 'Po', 'po burkina': 'Po',
        'tiebele': 'Tiebele', 'koudougou': 'Koudougou',
        'gorom gorom': 'Gorom-Gorom', 'bazoule': 'Ouagadougou',
    },
    // ── Mali ──────────────────────────────────────────────────────────────────
    ML: {
        'bamako city': 'Bamako', 'hamdallaye': 'Bamako',
        'badalabougou': 'Bamako', 'magnambougou': 'Bamako',
        'hippodrome bamako': 'Bamako', 'aci 2000': 'Bamako',
        'baco djicoroni': 'Bamako', 'niarelah': 'Bamako',
        'lafiabougou': 'Bamako', 'missira bamako': 'Bamako',
        'timbuktu': 'Timbuktu', 'tombouctou': 'Timbuktu',
        'mopti mali': 'Mopti', 'djenne': 'Djenné', 'djenné': 'Djenné',
        'san mali': 'San', 'bandiagara': 'Bandiagara', 'dogon country': 'Bandiagara',
        'segou mali': 'Segou', 'san segou': 'San',
        'kayes mali': 'Kayes', 'kita mali': 'Kita',
        'gao mali': 'Gao', 'kidal mali': 'Kidal',
        'sikasso': 'Sikasso', 'koutiala': 'Koutiala',
        'bougouni': 'Bougouni', 'kolondieba': 'Kolondieba',
        'niono mali': 'Niono', 'markala': 'Markala',
        // ── extended coverage ──
        'bamako centre': 'Bamako', 'great mosque of djenne': 'Djenné',
        'mopti': 'Mopti', 'gao': 'Gao',
        'segou': 'Segou', 'kayes': 'Kayes',
        'koulikoro': 'Koulikoro', 'siby': 'Siby',
        'manantali': 'Manantali',
    },
    // ── Niger ─────────────────────────────────────────────────────────────────
    NE: {
        'niamey city': 'Niamey', 'niamey plateau': 'Niamey',
        'plateau niamey': 'Niamey', 'yantala': 'Niamey',
        'zinder city': 'Zinder', 'maradi niger': 'Maradi',
        'agadez': 'Agadez', 'arlit niger': 'Arlit',
        'tahoua niger': 'Tahoua',
        // More Niamey districts
        'gamkale': 'Niamey', 'boukoki': 'Niamey', 'recasement': 'Niamey',
        'goudel': 'Niamey', 'cite caisse niamey': 'Niamey', 'talladje': 'Niamey',
        // More Niger cities
        'dosso niger': 'Dosso', 'birni ngaouré': 'Dosso',
        'diffa niger': 'Diffa', 'maine-soroa': 'Diffa',
        'tillaberi': 'Tillabéri', 'say niger': 'Say',
        'birni nkonni': "Birni-N'Konni", 'madaoua': 'Madaoua',
        'konni niger': "Birni-N'Konni",
        'ayerou niger': 'Ayerou', 'filingue': 'Filingué',
        'téra niger': 'Téra', 'gotheye': 'Gothèye',
        // ── extended coverage ──
        'niamey centre': 'Niamey', 'grand marche niamey': 'Niamey',
        'air mountains': 'Agadez', 'tenere': 'Agadez',
        'zinder': 'Zinder', 'maradi': 'Maradi',
        'tahoua': 'Tahoua', 'dosso': 'Dosso',
        'w national park': 'Dosso', 'ayorou': 'Ayorou',
        'diffa': 'Diffa', 'arlit': 'Arlit',
    },
    // ── Chad ──────────────────────────────────────────────────────────────────
    TD: {
        "n'djamena city": "N'Djamena", 'ndjamena': "N'Djamena",
        'farcha ndjamena': "N'Djamena",
        'moundou chad': 'Moundou', 'sarh chad': 'Sarh',
        'abeche chad': 'Abéché',
        // More N'Djamena districts
        'chagoua': "N'Djamena", 'moursal': "N'Djamena", 'klela': "N'Djamena",
        'diguel': "N'Djamena", 'ndjamena centre': "N'Djamena",
        'paris congo ndjamena': "N'Djamena",
        // More Chad cities
        'mongo chad': 'Mongo', 'am timan': 'Am Timan',
        'faya largeau': 'Faya Largeau', 'fada chad': 'Fada',
        'bol chad': 'Bol', 'lake chad': 'Bol',
        'bongor chad': 'Bongor', 'kelo chad': 'Kélo',
        'lai chad': 'Laï', 'koumra': 'Koumra',
        'doba chad': 'Doba', 'gore chad': 'Goré',
        // ── extended coverage ──
        "n'djamena centre": "N'Djamena", 'zakouma': 'Am Timan',
        'ennedi': 'Fada', 'ounianga': 'Faya-Largeau',
        'abeche': 'Abéché', 'moundou': 'Moundou',
        'sarh': 'Sarh', 'doba': 'Doba',
    },
    // ── Liberia ───────────────────────────────────────────────────────────────
    LR: {
        'monrovia city': 'Monrovia', 'sinkor': 'Monrovia',
        'mamba point': 'Monrovia', 'old road': 'Monrovia',
        'gbarnga': 'Gbarnga', 'buchanan liberia': 'Buchanan',
        // More Monrovia areas
        'paynesville': 'Monrovia', 'redlight': 'Monrovia',
        'claratown': 'Monrovia', 'new kru town': 'Monrovia',
        'logan town': 'Monrovia', 'vai town': 'Monrovia',
        'duport road': 'Monrovia', 'chocolate city': 'Monrovia',
        'fiamah': 'Monrovia', 'airfield monrovia': 'Monrovia',
        'roberts international': 'Monrovia',
        // More Liberia cities
        'voinjama': 'Voinjama', 'zorzor liberia': 'Zorzor',
        'harper liberia': 'Harper', 'fishtown liberia': 'Fishtown',
        'zwedru': 'Zwedru', 'greenville liberia': 'Greenville',
        'sanniquellie': 'Sanniquellie', 'kakata': 'Kakata',
        'tubmanburg': 'Tubmanburg',
        // ── extended coverage ──
        'monrovia centre': 'Monrovia', 'congo town': 'Monrovia',
        'robertsport': 'Robertsport', 'ganta': 'Ganta',
        'sapo national park': 'Greenville', 'kpatawee': 'Gbarnga',
        'marshall liberia': 'Marshall',
    },
    // ── Sierra Leone ──────────────────────────────────────────────────────────
    SL: {
        'freetown city': 'Freetown', 'lumley beach': 'Freetown',
        'aberdeen freetown': 'Freetown', 'murray town': 'Freetown',
        'wilberforce barracks': 'Freetown',
        'kenema sierra leone': 'Kenema', 'makeni sierra leone': 'Makeni',
        'bo sierra leone': 'Bo',
        // More Freetown areas
        'hill station freetown': 'Freetown', 'brookfields': 'Freetown',
        'east end freetown': 'Freetown', 'west end freetown': 'Freetown',
        'susans bay': 'Freetown', 'kroo bay': 'Freetown',
        'kissy freetown': 'Freetown', 'magazine cut': 'Freetown',
        'pademba road': 'Freetown', 'tengbeh town': 'Freetown',
        'peninsular beach': 'Freetown', 'tokeh beach': 'Freetown',
        'bureh beach': 'Freetown', 'john obey': 'Freetown',
        // More Sierra Leone cities
        'koidu city': 'Koidu', 'kono sierra leone': 'Koidu',
        'kabala sierra leone': 'Kabala', 'kailahun': 'Kailahun',
        'bonthe sierra leone': 'Bonthe', 'moyamba': 'Moyamba',
        'port loko': 'Port Loko', 'lunsar': 'Lunsar',
        'waterloo sl': 'Waterloo',
        // ── extended coverage ──
        'freetown centre': 'Freetown', 'river no 2': 'Freetown',
        'banana islands': 'Kent', 'turtle islands sierra leone': 'Bonthe',
        'bonthe': 'Bonthe', 'tiwai island': 'Bo',
        'kenema': 'Kenema', 'makeni': 'Makeni',
        'lungi': 'Lungi', 'outamba': 'Kamakwie',
    },
    // ── Guinea ────────────────────────────────────────────────────────────────
    GN: {
        'conakry city': 'Conakry', 'kaloum': 'Conakry',
        'dixinn conakry': 'Conakry', 'matam conakry': 'Conakry',
        'kankan guinea': 'Kankan', 'kindia': 'Kindia',
        'labé guinea': 'Labé', 'nzerekoré': 'Nzérékoré',
        // More Conakry districts
        'ratoma': 'Conakry', 'matoto': 'Conakry', 'coleah': 'Conakry',
        'hamdallaye guinea': 'Conakry', 'kaporo': 'Conakry',
        'sangoyah': 'Conakry', 'cosa': 'Conakry', 'bonfi': 'Conakry',
        'camayenne': 'Conakry', 'rogbane': 'Conakry',
        // More Guinea cities
        'boke guinea': 'Boké', 'kamsar': 'Boké',
        'mamou guinea': 'Mamou', 'pita guinea': 'Pita',
        'faranah guinea': 'Faranah', 'kissidougou': 'Kissidougou',
        'gueckedou': 'Guéckédou', 'macenta guinea': 'Macenta',
        'beyla guinea': 'Beyla', 'kerouane': 'Kérouané',
        // ── extended coverage ──
        'conakry centre': 'Conakry', 'dixinn': 'Conakry',
        'iles de los': 'Conakry', 'fouta djallon': 'Dalaba',
        'dalaba': 'Dalaba', 'pita': 'Pita',
        'chutes de kinkon': 'Pita', 'labe': 'Labé',
        'mali guinea': 'Mali', 'kankan': 'Kankan',
        'nzerekore': 'Nzérékoré', 'boke': 'Boké',
        'fria': 'Fria',
    },
    // ── Guinea-Bissau ─────────────────────────────────────────────────────────
    GW: {
        'bissau city': 'Bissau', 'mindara': 'Bissau',
        'bafatá': 'Bafatá', 'gabu guinea bissau': 'Gabú',
        // More Bissau areas
        'bandim': 'Bissau', 'bairro militar': 'Bissau',
        'santa luzia bissau': 'Bissau', 'antula': 'Bissau',
        'belém bissau': 'Bissau',
        // Guinea-Bissau other towns
        'cacheu': 'Cacheu', 'farim': 'Farim',
        'quinhamel': 'Quinhamel', 'bolama': 'Bolama',
        'bijagos archipelago': 'Bolama', 'bubaque': 'Bubaque',
        'canchungo': 'Canchungo', 'mansôa': 'Mansôa',
        'bissorã': 'Bissorã',
        // ── extended coverage ──
        'bissau centre': 'Bissau', 'bissau velho': 'Bissau',
        'bijagos': 'Bubaque', 'orango': 'Bubaque',
        'rubane': 'Bubaque', 'joao vieira': 'Bubaque',
        'bafata': 'Bafatá', 'gabu': 'Gabú',
        'varela': 'Sao Domingos', 'catio': 'Catio',
    },
    // ── Gambia ────────────────────────────────────────────────────────────────
    GM: {
        'banjul city': 'Banjul', 'banjul capital': 'Banjul',
        'kanifing': 'Kanifing', 'serrekunda': 'Kanifing',
        'kololi gambia': 'Kololi', 'senegambia': 'Kololi',
        'brikama gambia': 'Brikama', 'bakau': 'Bakau',
        'janjanbureh': 'Janjanbureh',
        // More Gambia areas
        'fajara gambia': 'Fajara', 'kairaba avenue': 'Fajara',
        'brufut gambia': 'Brufut', 'tanji gambia': 'Tanji',
        'gunjur gambia': 'Gunjur', 'kartong': 'Kartong',
        'sanyang beach': 'Sanyang', 'tujering': 'Tujering',
        'soma gambia': 'Soma', 'farafenni': 'Farafenni',
        'kerewan gambia': 'Kerewan', 'basse santa su': 'Basse',
        'basse gambia': 'Basse', 'gambissara': 'Gambissara',
        'abuko nature reserve': 'Abuko', 'tendaba': 'Tendaba',
        'makasutu culture forest': 'Brikama',
        // ── extended coverage ──
        'banjul centre': 'Banjul', 'kololi': 'Kololi',
        'senegambia strip': 'Kololi', 'kotu': 'Kotu',
        'fajara': 'Fajara', 'cape point gambia': 'Bakau',
        'brufut': 'Brufut', 'tanji': 'Tanji',
        'sanyang': 'Sanyang', 'gunjur': 'Gunjur',
        'bijilo': 'Kololi', 'georgetown gambia': 'Janjanbureh',
        'makasutu': 'Brikama', 'brikama': 'Brikama',
        'bintang': 'Bintang',
    },
    // ── Senegal extras ────────────────────────────────────────────────────────
    // (SN already defined, extending)
    // ── Mauritania ────────────────────────────────────────────────────────────
    MR: {
        'nouakchott city': 'Nouakchott', 'tevrag-zeina': 'Nouakchott',
        'ksar mauritania': 'Nouakchott', 'dar naim': 'Nouakchott',
        'nouadhibou': 'Nouadhibou',
        'atar mauritania': 'Atar', 'chinguetti': 'Chinguetti',
        'tichitt': 'Tichitt', 'oualata': 'Oualata',
        'kaedi mauritania': 'Kaédi', 'rosso mauritania': 'Rosso',
        'zouerate': 'Zouérat', 'fdérik': 'Fdérik', 'aleg': 'Aleg',
        'kiffa mauritania': 'Kiffa', 'nema mauritania': 'Néma',
        'selibaby': 'Sélibaby', 'tidjikdja': 'Tidjikdja',
        'boutilimit': 'Boutilimit', 'akjoujt': 'Akjoujt',
        // ── extended coverage ──
        'nouakchott centre': 'Nouakchott', 'tevragh zeina': 'Nouakchott',
        'port de peche': 'Nouakchott', 'banc darguin': 'Nouadhibou',
        'iron ore train': 'Nouadhibou', 'ouadane': 'Ouadane',
        'atar': 'Atar', 'terjit': 'Atar',
        'adrar mauritania': 'Atar', 'rosso': 'Rosso',
        'kiffa': 'Kiffa', 'nema': 'Néma',
        'kaedi': 'Kaédi',
    },
    // ── Cape Verde ────────────────────────────────────────────────────────────
    CV: {
        'praia cape verde': 'Praia', 'plateau praia': 'Praia',
        'achada de santo antonio': 'Praia',
        'mindelo cape verde': 'Mindelo', 'sao vincent cape verde': 'Mindelo',
        'santa maria sal': 'Santa Maria', 'sal island': 'Santa Maria',
        'espargos sal': 'Espargos',
        'boa vista cape verde': 'Sal Rei', 'sal rei': 'Sal Rei',
        'sao filipe fogo': 'São Filipe',
        // Cape Verde extras
        'sao nicolau island': 'Ribeira Brava', 'ribeira brava cape verde': 'Ribeira Brava',
        'sao antao island': 'Porto Novo', 'porto novo cape verde': 'Porto Novo',
        'ribeira grande santo antao': 'Ribeira Grande',
        'maio island': 'Vila do Maio', 'vila do maio': 'Vila do Maio',
        'brava island': 'Nova Sintra', 'nova sintra': 'Nova Sintra',
        'tarrafal santiago': 'Tarrafal', 'assomada cape verde': 'Assomada',
        'santa catarina cape verde': 'Assomada',
        'ponta do sol santo antao': 'Ponta do Sol',
        // ── extended coverage ──
        'praia centre': 'Praia', 'cidade velha': 'Praia',
        'sal cape verde': 'Espargos', 'espargos': 'Espargos',
        'santa maria cape verde': 'Santa Maria', 'praia de chaves': 'Sal Rei',
        'mindelo': 'Mindelo', 'sao vicente': 'Mindelo',
        'santo antao': 'Porto Novo', 'ribeira grande cape verde': 'Ribeira Grande',
        'ponta do sol cape verde': 'Ponta do Sol', 'fogo cape verde': 'São Filipe',
        'sao filipe': 'São Filipe', 'tarrafal': 'Tarrafal',
        'assomada': 'Assomada',
    },
    // ── São Tomé and Príncipe ─────────────────────────────────────────────────
    ST: {
        'sao tome city': 'São Tomé', 'santana sao tome': 'Santana',
        'neves sao tome': 'Neves', 'santo antonio principe': 'Santo António',
        'principe island': 'Santo António', 'bom bom island': 'Santo António',
        'lagoa azul beach': 'São Tomé', 'praia das sete ondas': 'São Tomé',
        'agua ize': 'São Tomé', 'trindade sao tome': 'Trindade',
        'guadalupe sao tome': 'Guadalupe', 'angolares': 'Angolares',
        // ── extended coverage ──
        'sao tome centre': 'São Tomé', 'principe': 'Santo António',
        'praia jale': 'Porto Alegre', 'porto alegre sao tome': 'Porto Alegre',
        'neves': 'Neves', 'trindade': 'Trindade',
        'obo national park': 'São Tomé', 'lagoa azul': 'Neves',
    },
    // ── Equatorial Guinea ─────────────────────────────────────────────────────
    GQ: {
        'malabo city': 'Malabo', 'bioko island': 'Malabo',
        'luba equatorial guinea': 'Luba', 'riaba': 'Riaba',
        'bata city': 'Bata', 'ebebiyin': 'Ebebiyin',
        'mongomo': 'Mongomo', 'mbini': 'Mbini',
        'annobon island': 'San Antonio de Palé', 'san antonio pale': 'San Antonio de Palé',
        'akonibe': 'Akonibe',
        // ── extended coverage ──
        'malabo centre': 'Malabo', 'bioko': 'Malabo',
        'sipopo': 'Malabo', 'luba': 'Luba',
        'moka equatorial guinea': 'Moka', 'ureca': 'Luba',
        'bata': 'Bata', 'rio muni': 'Bata',
        'oyala': 'Ciudad de la Paz', 'ciudad de la paz': 'Ciudad de la Paz',
        'annobon': 'San Antonio de Palé', 'corisco': 'Corisco',
    },
    // ── Central African Republic ──────────────────────────────────────────────
    CF: {
        'bangui city': 'Bangui', 'bimbo bangui': 'Bangui',
        'boy-rabe': 'Bangui', 'km5 bangui': 'Bangui',
        'berengo': 'Bangui', 'mbaiki': 'Mbaïki',
        'bossembele': 'Bossembélé', 'berbérati': 'Berbérati',
        'bambari': 'Bambari', 'bossangoa': 'Bossangoa',
        'kaga bandoro': 'Kaga-Bandoro', 'bouca': 'Bozoum',
        'nola car': 'Nola', 'ndele car': 'Ndélé',
        'bangassou': 'Bangassou', 'obo car': 'Obo',
        // ── extended coverage ──
        'bangui centre': 'Bangui', 'dzanga sangha': 'Bayanga',
        'bayanga': 'Bayanga', 'berberati': 'Berbérati',
        'bouar': 'Bouar', 'bria': 'Bria',
        'boali falls': 'Boali',
    },
    // ── Eswatini (Swaziland) ──────────────────────────────────────────────────
    SZ: {
        'mbabane city': 'Mbabane', 'lobamba': 'Mbabane',
        'manzini swaziland': 'Manzini', 'matsapha': 'Manzini',
        'ezulwini valley': 'Ezulwini',
        'nhlangano swaziland': 'Nhlangano', 'lavumisa': 'Lavumisa',
        'siteki eswatini': 'Siteki', 'big bend eswatini': 'Big Bend',
        'piggs peak': 'Piggs Peak', 'hlane royal national park': 'Siphofaneni',
        'mlilwane wildlife sanctuary': 'Mbabane', 'swazi spa': 'Ezulwini',
        'royal swazi convention centre': 'Ezulwini', 'mantenga': 'Ezulwini',
        'motshane': 'Mbabane', 'mankayane': 'Mankayane',
        // ── extended coverage ──
        'mbabane centre': 'Mbabane', 'ezulwini': 'Ezulwini',
        'manzini': 'Manzini', 'malkerns': 'Malkerns',
        'mlilwane': 'Lobamba', 'simunye': 'Simunye',
        'mkhaya': 'Siphofaneni', 'nhlangano': 'Nhlangano',
        'siteki': 'Siteki', 'eswatini': 'Mbabane',
    },
    // ── Lesotho ───────────────────────────────────────────────────────────────
    LS: {
        'maseru city': 'Maseru', 'teyateyaneng': 'Teyateyaneng',
        'leribe lesotho': 'Leribe', 'mafeteng': 'Mafeteng',
        'semonkong': 'Semonkong', 'malealea': 'Malealea',
        'mohales hoek': "Mohale's Hoek", 'mohale dam': 'Maseru',
        'katse dam': 'Katse', 'quthing lesotho': 'Quthing',
        'qacha nek': "Qacha's Nek", 'thaba tseka': 'Thaba-Tseka',
        'butha buthe': 'Butha-Buthe', 'mokhotlong': 'Mokhotlong',
        'maputsoe': 'Maputsoe', 'masianokeng': 'Maseru',
        'roma lesotho': 'Roma', 'hlotse leribe': 'Leribe',
        // ── extended coverage ──
        'maseru centre': 'Maseru', 'maletsunyane': 'Semonkong',
        'sani pass': 'Mokhotlong', 'afriski': 'Butha-Buthe',
        'thaba bosiu': 'Maseru', 'leribe': 'Hlotse',
        'hlotse': 'Hlotse', 'quthing': 'Quthing',
    },
    // ── Burundi ───────────────────────────────────────────────────────────────
    BI: {
        'bujumbura city': 'Bujumbura', 'rohero': 'Bujumbura',
        'mukaza': 'Bujumbura', 'muha': 'Bujumbura',
        'gitega burundi': 'Gitega',
        // More Bujumbura districts
        'kinama bujumbura': 'Bujumbura', 'cibitoke bujumbura': 'Bujumbura',
        'kamenge': 'Bujumbura', 'ngagara': 'Bujumbura',
        'quartier asiatique': 'Bujumbura', 'nyakabiga': 'Bujumbura',
        'kinindo': 'Bujumbura', 'kabondo': 'Bujumbura',
        'bwiza': 'Bujumbura',
        // More Burundi cities
        'ngozi burundi': 'Ngozi', 'kayanza burundi': 'Kayanza',
        'kirundo': 'Kirundo', 'muyinga': 'Muyinga',
        'rutana burundi': 'Rutana', 'makamba': 'Makamba',
        'bururi burundi': 'Bururi', 'rumonge': 'Rumonge',
        'cibitoke burundi': 'Cibitoke', 'bubanza': 'Bubanza',
        'bujumbura rural': 'Bujumbura', 'lake tanganyika burundi': 'Bujumbura',
    },
    // ── South Sudan ───────────────────────────────────────────────────────────
    SS: {
        'juba city': 'Juba', 'konyokonyo': 'Juba',
        'customs juba': 'Juba', 'munuki': 'Juba',
        'wau south sudan': 'Wau', 'malakal': 'Malakal',
        // More Juba areas
        'gudele juba': 'Juba', 'tong ping': 'Juba', 'jubek': 'Juba',
        'kololo juba': 'Juba', 'hai cinema': 'Juba', 'hai malakal': 'Juba',
        'jebel juba': 'Juba', 'lologo juba': 'Juba',
        'rejaf': 'Juba', 'nyakuron': 'Juba', 'rumbek road juba': 'Juba',
        // More South Sudan cities
        'rumbek south sudan': 'Rumbek', 'aweil south sudan': 'Aweil',
        'torit south sudan': 'Torit', 'yambio': 'Yambio',
        'yei south sudan': 'Yei', 'nimule': 'Nimule',
        'bor south sudan': 'Bor', 'bentiu': 'Bentiu',
        'leer south sudan': 'Leer', 'kodok': 'Kodok',
        // ── extended coverage ──
        'juba centre': 'Juba', 'juba town': 'Juba',
        'boma national park': 'Bor', 'wau': 'Wau',
        'yei': 'Yei', 'torit': 'Torit',
        'kapoeta': 'Kapoeta', 'rumbek': 'Rumbek',
        'aweil': 'Aweil', 'sudd': 'Bor',
    },
    // ── Haiti ─────────────────────────────────────────────────────────────────
    HT: {
        'port au prince': 'Port-au-Prince', 'port-au-prince': 'Port-au-Prince',
        'petion-ville': 'Port-au-Prince', 'petionville': 'Port-au-Prince',
        'delmas haiti': 'Port-au-Prince', 'cite soleil': 'Port-au-Prince',
        'cap haitien': 'Cap-Haïtien', 'cap haïtien': 'Cap-Haïtien',
        'jacmel haiti': 'Jacmel', 'les cayes': 'Les Cayes',
        'gonaives haiti': 'Gonaïves',
        // Haiti expanded
        'tabarre haiti': 'Port-au-Prince', 'toussaint louverture airport': 'Port-au-Prince',
        'carrefour haiti': 'Carrefour', 'martissant': 'Port-au-Prince',
        'kenscoff': 'Kenscoff', 'furcy haiti': 'Kenscoff',
        'laboule haiti': 'Port-au-Prince', 'thomassin': 'Port-au-Prince',
        'croix des bouquets': 'Croix-des-Bouquets', 'ganthier': 'Ganthier',
        'arcahaie': 'Arcahaie', 'montrouis': 'Montrouis', 'amani': 'Montrouis',
        'saint marc haiti': 'Saint-Marc', 'dessalines': 'Dessalines',
        'hinche haiti': 'Hinche', 'mirebalais': 'Mirebalais',
        'lascahobas': 'Lascahobas', 'belladere': 'Belladère',
        'port de paix': 'Port-de-Paix', 'saint louis du nord': 'Saint-Louis-du-Nord',
        'môle saint nicolas': 'Môle-Saint-Nicolas',
        'jeremie haiti': 'Jérémie', 'grand goave': 'Grand-Goâve',
        'petit goave': 'Petit-Goâve', 'leogane': 'Léogâne',
        'gressier haiti': 'Gressier',
        'cap haitian downtown': 'Cap-Haïtien', 'milot cap': 'Cap-Haïtien',
        'labadie beach': 'Cap-Haïtien', 'labadee': 'Cap-Haïtien',
        'fort liberté': 'Fort-Liberté', 'ouanaminthe': 'Ouanaminthe',
        'trou du nord': 'Trou-du-Nord', 'limonade': 'Limonade',
        'jacmel center': 'Jacmel', 'cyvadier jacmel': 'Jacmel',
        'raymond les bains jacmel': 'Jacmel',
        'cayes downtown': 'Les Cayes', 'port salut': 'Port-Salut',
        'bainet haiti': 'Bainet', 'belle anse': 'Belle-Anse',
        'aquin haiti': 'Aquin', 'saint louis du sud': 'Saint-Louis-du-Sud',
        'miragoane': 'Miragoâne', 'anse a veau': 'Anse-à-Veau',
        'nippes haiti': 'Miragoâne',
        // ── extended coverage ──
        'petion ville': 'Port-au-Prince', 'delmas': 'Port-au-Prince',
        'downtown port au prince': 'Port-au-Prince', 'jacmel': 'Jacmel',
        'bassin bleu': 'Jacmel', 'citadelle laferriere': 'Cap-Haïtien',
        'jeremie': 'Jérémie', 'ile a vache': 'Les Cayes',
        'kaliko beach': 'Montrouis', 'gonaives': 'Gonaïves',
        'hinche': 'Hinche',
    },
    // ── Nicaragua ─────────────────────────────────────────────────────────────
    NI: {
        'managua city': 'Managua', 'altamira managua': 'Managua',
        'bolonia managua': 'Managua', 'linda vista managua': 'Managua',
        'granada nicaragua': 'Granada', 'lago de granada': 'Granada',
        'leon nicaragua': 'León', 'san juan del sur': 'San Juan del Sur',
        'masaya nicaragua': 'Masaya', 'ometepe island': 'Rivas',
        'corn island nicaragua': 'Corn Island', 'matagalpa city': 'Matagalpa',
        // Nicaragua expanded
        'playa maderas': 'San Juan del Sur', 'playa remanso': 'San Juan del Sur',
        'rivas nicaragua': 'Rivas', 'peñas blancas': 'Rivas',
        'puerto cabezas': 'Puerto Cabezas', 'bluefields': 'Bluefields',
        'big corn island': 'Corn Island', 'little corn island': 'Corn Island',
        'chinandega': 'Chinandega', 'corinto nicaragua': 'Corinto',
        'esteli nicaragua': 'Estelí', 'ocotal nicaragua': 'Ocotal',
        'jinotega': 'Jinotega', 'boaco': 'Boaco', 'juigalpa': 'Juigalpa',
        'nueva guinea': 'Nueva Guinea', 'laguna de apoyo': 'Masaya',
        'mombacho': 'Granada', 'zapatera island': 'Granada',
        'volcano concepcion': 'Rivas', 'moyogalpa ometepe': 'Rivas',
        // ── extended coverage ──
        'calzada granada': 'Granada', 'las isletas': 'Granada',
        'playa hermosa nicaragua': 'San Juan del Sur', 'popoyo': 'Popoyo',
        'las penitas': 'León', 'cerro negro': 'León',
        'ometepe': 'Moyogalpa', 'moyogalpa': 'Moyogalpa',
        'altagracia': 'Altagracia', 'managua centro': 'Managua',
        'masaya': 'Masaya', 'catarina': 'Catarina',
        'matagalpa': 'Matagalpa', 'esteli': 'Estelí',
        'corn islands': 'Corn Island', 'rivas': 'Rivas',
    },
    // ── Afghanistan ───────────────────────────────────────────────────────────
    AF: {
        'kabul city': 'Kabul', 'wazir akbar khan': 'Kabul',
        'shar-e-naw': 'Kabul', 'karte char': 'Kabul',
        'share naw': 'Kabul', 'taimani': 'Kabul', 'karte seh': 'Kabul',
        'macroryan kabul': 'Kabul', 'qale fatullah': 'Kabul',
        'darlaman kabul': 'Kabul', 'khair khana': 'Kabul',
        'herat city': 'Herat', 'herat old city': 'Herat',
        'kandahar city': 'Kandahar', 'kandahar old city': 'Kandahar',
        'mazar-i-sharif': 'Mazar-i-Sharif', 'mazar e sharif': 'Mazar-i-Sharif',
        'balkh mazar': 'Mazar-i-Sharif', 'blue mosque mazar': 'Mazar-i-Sharif',
        'jalalabad afghanistan': 'Jalalabad', 'nangarhar': 'Jalalabad',
        'bamyan afghanistan': 'Bamyan', 'band-e-amir': 'Bamyan',
        'kunduz city': 'Kunduz', 'khanabad kunduz': 'Kunduz',
        'ghazni city': 'Ghazni', 'ghazni ruins': 'Ghazni',
        'lashkar gah': 'Lashkar Gah', 'helmand afghanistan': 'Lashkar Gah',
        'taloqan': 'Taloqan', 'taluqan': 'Taloqan',
        'zaranj nimroz': 'Zaranj', 'faizabad afghanistan': 'Fayzabad',
        'mehtarlam': 'Mehtarlam', 'charikar': 'Charikar',
        'pul-e-khumri': 'Pul-i-Khumri', 'sheberghan': 'Sheberghan',
        'aybak afghanistan': 'Aybak', 'sar-e-pol': 'Sar-e-Pol',
        // More Kabul neighborhoods
        'shahr-e-naw': 'Kabul', 'karte parwan': 'Kabul', 'dasht-e-barchi': 'Kabul',
        'pul-e-charkhi': 'Kabul', 'khair khwa': 'Kabul',
        'shahr ara': 'Kabul', 'chahardahi': 'Kabul', 'bagrami': 'Kabul',
        // Herat extras
        'herat citadel': 'Herat', 'gawharshad mosque': 'Herat',
        'minarets of herat': 'Herat', 'injil district': 'Herat',
        // Cultural / UNESCO sites
        'minaret of jam': 'Chakhcharan', 'jam afghanistan': 'Chakhcharan',
        'bamiyan valley': 'Bamyan', 'boddhisatva niches': 'Bamyan',
        'band-i-amir lake': 'Bamyan', 'dragon valley': 'Bamyan',
        // More provinces / cities
        'maimana': 'Maimana', 'faryab afghanistan': 'Maimana',
        'gardez': 'Gardez', 'paktia afghanistan': 'Gardez',
        'khost city': 'Khost', 'asadabad': 'Asadabad',
        'mahmud-i-raqi': 'Mahmud-i-Raqi', 'kapisa province': 'Mahmud-i-Raqi',
        'puli alam': 'Puli Alam', 'logar province': 'Puli Alam',
        // Dari/Pashto script names
        'کابل': 'Kabul', 'هرات': 'Herat', 'کندهار': 'Kandahar',
        'مزار شریف': 'Mazar-i-Sharif', 'جلال آباد': 'Jalalabad',
        'بامیان': 'Bamyan', 'کندز': 'Kunduz', 'افغانستان': 'Kabul',
    },
    // ── Iran ──────────────────────────────────────────────────────────────────
    IR: {
        'tehran city': 'Tehran', 'downtown tehran': 'Tehran',
        'jordan tehran': 'Tehran', 'elahiye': 'Tehran',
        'tajrish': 'Tehran', 'vanak': 'Tehran', 'yousefabad': 'Tehran',
        'isfahan city': 'Isfahan', 'esfahan': 'Isfahan',
        'naghsh-e-jahan': 'Isfahan', 'vank cathedral': 'Isfahan',
        'shiraz city': 'Shiraz', 'vakil bazaar': 'Shiraz',
        'mashhad city': 'Mashhad', 'imam reza shrine': 'Mashhad',
        'tabriz city': 'Tabriz', 'yazd city': 'Yazd',
        'persepolis': 'Marvdasht', 'marvdasht': 'Marvdasht',
        'kashan city': 'Kashan', 'kerman city': 'Kerman',
        'qom city': 'Qom', 'ahvaz city': 'Ahvaz',
        'kish island': 'Kish', 'qeshm island': 'Qeshm',
        'rasht city': 'Rasht',
        // More Tehran neighborhoods
        'saadat abad': 'Tehran', 'shahrak gharb': 'Tehran', 'jannat abad': 'Tehran',
        'narmak': 'Tehran', 'lavasan': 'Tehran', 'shahriar': 'Tehran',
        'shemiran': 'Tehran', 'zafaraniyeh': 'Tehran', 'niavaran': 'Tehran',
        'punak': 'Tehran', 'shahran': 'Tehran', 'poonak': 'Tehran',
        // More Iranian cities
        'hamadan city': 'Hamadan', 'hamedan': 'Hamadan', 'bistoun': 'Hamadan',
        'sanandaj city': 'Sanandaj', 'kurdistan iran': 'Sanandaj',
        'urmia city': 'Urmia', 'orumiyeh': 'Urmia', 'urmia lake': 'Urmia',
        'sari mazandaran': 'Sari', 'babol city': 'Babol',
        'gorgan city': 'Gorgan', 'golestan iran': 'Gorgan',
        'zahedan city': 'Zahedan', 'chabahar': 'Chabahar',
        'bandar abbas': 'Bandar Abbas', 'hormuz island': 'Bandar Abbas',
        'arak iran': 'Arak', 'saveh': 'Saveh',
        'semnan city': 'Semnan', 'shahroud': 'Shahroud',
        'birjand': 'Birjand', 'neyshabur': 'Neyshabur',
        'sabzevar': 'Sabzevar', 'bojnord': 'Bojnord',
        // Natural sites
        'dasht-e kavir': 'Isfahan', 'dasht-e lut': 'Kerman',
        'alborz mountains': 'Tehran', 'kandovan village': 'Tabriz',
        'shandiz mashhad': 'Mashhad', 'torghabeh': 'Mashhad',
        'kish bazaar': 'Kish', 'qeshm geopark': 'Qeshm',
        // More Isfahan
        'naghsh e jahan square': 'Isfahan', 'jolfa isfahan': 'Isfahan',
        'abbasi hotel area': 'Isfahan',
        // More Iranian cities / UNESCO
        'zanjan city': 'Zanjan', 'soltaniyeh': 'Zanjan',
        'ardabil city': 'Ardabil', 'sheikh safi shrine': 'Ardabil',
        'khorramabad': 'Khorramabad', 'lorestan iran': 'Khorramabad',
        'bushehr city': 'Bushehr', 'bushehr port': 'Bushehr',
        'bam citadel': 'Bam', 'bam iran': 'Bam',
        'ilam iran': 'Ilam',
        // Caspian coast
        'bandar anzali': 'Bandar Anzali', 'anzali lagoon': 'Bandar Anzali',
        'rasht bazaar': 'Rasht', 'lahijan': 'Lahijan',
        'ramsar iran': 'Ramsar', 'nowshahr': 'Nowshahr',
        'chalus': 'Chalus', 'kelarabad': 'Chalus',
        'amol': 'Amol', 'babol beach': 'Babol',
        // Historic villages
        'abyaneh village': 'Natanz', 'meybod': 'Meybod',
        'nain iran': 'Naeen', 'varzaneh': 'Isfahan',
        'masuleh village': 'Rasht', 'palangan': 'Sanandaj',
        // More southeast
        'zabol iran': 'Zabol', 'iranshahr': 'Iranshahr',
        'jiroft': 'Jiroft',
        // Persian language city names
        'تهران': 'Tehran', 'اصفهان': 'Isfahan', 'شیراز': 'Shiraz',
        'مشهد': 'Mashhad', 'تبریز': 'Tabriz', 'یزد': 'Yazd',
        'کرمان': 'Kerman', 'اهواز': 'Ahvaz', 'رشت': 'Rasht',
        'قم': 'Qom', 'همدان': 'Hamadan', 'کرمانشاه': 'Kermanshah',
        'سنندج': 'Sanandaj', 'ارومیه': 'Urmia', 'زاهدان': 'Zahedan',
        'بندر عباس': 'Bandar Abbas', 'کیش': 'Kish', 'قشم': 'Qeshm',
    },
    // ── Iraq ──────────────────────────────────────────────────────────────────
    IQ: {
        'baghdad city': 'Baghdad', 'karada baghdad': 'Baghdad',
        'mansour baghdad': 'Baghdad', 'al-rasheed baghdad': 'Baghdad',
        'al-karkh': 'Baghdad', 'green zone baghdad': 'Baghdad',
        'erbil city': 'Erbil', 'ankawa erbil': 'Erbil',
        'sulaymaniyah city': 'Sulaymaniyah', 'duhok city': 'Duhok',
        'basra city': 'Basra', 'ashar basra': 'Basra',
        'mosul city': 'Mosul', 'najaf city': 'Najaf',
        'karbala city': 'Karbala',
        // Iraq extras
        'kirkuk city': 'Kirkuk', 'hawija': 'Kirkuk', 'tuz khurmatu': 'Kirkuk',
        'tikrit city': 'Tikrit', 'samarra': 'Samarra',
        'hillah city': 'Hillah', 'babylon ruins': 'Hillah',
        'kut city': 'Kut', 'amarah city': 'Amarah',
        'nasiriyah': 'Nasiriyah', 'ur ruins': 'Nasiriyah',
        'diwaniyah': 'Diwaniyah', 'samawah': 'Samawah',
        'kurdistan iraq': 'Erbil', 'barzan': 'Erbil',
        'zakho': 'Zakho', 'amadiyah': 'Amadiya',
        'halabja': 'Halabja',
        // More Iraq cities
        'ramadi': 'Ramadi', 'fallujah': 'Fallujah', 'al anbar': 'Ramadi',
        'baqubah': 'Baqubah', 'diyala iraq': 'Baqubah',
        'haditha': 'Haditha', 'ana iraq': 'Ana', 'rawah': 'Rawah',
        'sinjar mountain': 'Sinjar', 'sinjar yazidi': 'Sinjar',
        'lalish temple': 'Duhok', 'lalish yazidi': 'Duhok',
        'akre town': 'Aqrah', 'aqrah': 'Aqrah',
        'sulaymaniyah bazaar': 'Sulaymaniyah', 'sulaymaniyah city center': 'Sulaymaniyah',
        'slemani': 'Sulaymaniyah',
        'hawler': 'Erbil', 'citadel erbil': 'Erbil',
        'al-rasheed street': 'Baghdad', 'al-mutanabbi street': 'Baghdad',
        'kadhimiya': 'Baghdad', 'sadr city': 'Baghdad',
        'abu ghraib': 'Baghdad', 'taji': 'Baghdad',
        'hilla': 'Hillah', 'al hillah': 'Hillah',
        'al najaf': 'Najaf', 'imam ali shrine': 'Najaf',
        'al karbala': 'Karbala', 'imam hussein shrine': 'Karbala',
        'al-nasiriyah': 'Nasiriyah', 'thi qar': 'Nasiriyah',
        'al-basrah': 'Basra', 'shatt al-arab': 'Basra',
        // Arabic language city names
        'بغداد': 'Baghdad', 'أربيل': 'Erbil', 'البصرة': 'Basra',
        'الموصل': 'Mosul', 'النجف': 'Najaf', 'كربلاء': 'Karbala',
        'كركوك': 'Kirkuk', 'السليمانية': 'Sulaymaniyah', 'دهوك': 'Duhok',
        'تكريت': 'Tikrit', 'سامراء': 'Samarra', 'الحلة': 'Hillah',
        'الناصرية': 'Nasiriyah', 'الرمادي': 'Ramadi', 'الفلوجة': 'Fallujah',
    },
    // ── Syria ─────────────────────────────────────────────────────────────────
    SY: {
        'damascus city': 'Damascus', 'old city damascus': 'Damascus',
        'malki damascus': 'Damascus', 'mezzeh': 'Damascus',
        'aleppo city': 'Aleppo', 'latakia city': 'Latakia',
        'tartus city': 'Tartus', 'homs city': 'Homs',
        'palmyra': 'Palmyra',
        // Syria extras
        'al hamidiyah souk': 'Damascus', 'abu rummaneh': 'Damascus',
        'kafrsouseh': 'Damascus', 'mazzeh syria': 'Damascus',
        'aleppo old city': 'Aleppo', 'hama city': 'Hama',
        'deir ez zor': 'Deir ez-Zor', 'bosra syria': 'Bosra',
        'sweida': 'As-Suwayda', 'daraa syria': 'Daraa',
        'qamishli': 'Qamishli', 'raqqa': 'Raqqa',
        // More Damascus neighborhoods
        'bab touma': 'Damascus', 'jaramana': 'Damascus', 'qudsaya': 'Damascus',
        'al tal damascus': 'Damascus', 'douma': 'Damascus',
        'darayya': 'Damascus', 'sahnaya': 'Damascus',
        // More Aleppo neighborhoods
        'aziziyya aleppo': 'Aleppo', 'sulaymaniyya aleppo': 'Aleppo',
        'jazmati': 'Aleppo', 'sakhour': 'Aleppo',
        // More cities
        'idlib city': 'Idlib', 'al bab': 'Al Bab',
        'hasakah city': 'Al-Hasakah', 'al hasakah': 'Al-Hasakah',
        'deir ezzor city': 'Deir ez-Zor', 'abu kamal': 'Deir ez-Zor',
        'latakia beach': 'Latakia', 'ras al basit': 'Latakia',
        'tartus marina': 'Tartus', 'arwad island': 'Tartus',
        // Arabic language names
        'دمشق': 'Damascus', 'حلب': 'Aleppo', 'اللاذقية': 'Latakia',
        'طرطوس': 'Tartus', 'حمص': 'Homs', 'حماة': 'Hama',
        'إدلب': 'Idlib', 'دير الزور': 'Deir ez-Zor', 'الحسكة': 'Al-Hasakah',
        'القامشلي': 'Qamishli', 'الرقة': 'Raqqa', 'درعا': 'Daraa',
    },
    // ── Yemen ─────────────────────────────────────────────────────────────────
    YE: {
        'sanaa city': "Sana'a", "sana'a": "Sana'a", 'sana a': "Sana'a",
        'old city sanaa': "Sana'a",
        'aden city': 'Aden', 'crater aden': 'Aden',
        'mukalla': 'Al Mukalla', 'socotra island': 'Hadibo',
        // Yemen extras
        'hodeidah': 'Hudaydah', 'al hudaydah': 'Hudaydah',
        'taiz city': 'Taiz', 'marib city': 'Marib', 'marib dam': 'Marib',
        'sayun hadramawt': 'Sayun', 'shibam city': 'Shibam',
        'hadibo socotra': 'Hadibo', 'ma alla aden': 'Aden',
        'ibb city': 'Ibb', 'dhamar city': 'Dhamar', 'hajjah': 'Hajjah',
        // ── extended coverage ──
        'sanaa centre': "Sana'a", 'aden crater': 'Aden',
        'tawahi': 'Aden', 'gold mohur': 'Aden',
        'socotra': 'Hadibu', 'hadibu': 'Hadibu',
        'detwah lagoon': 'Hadibu', 'shibam': 'Shibam',
        'hadramawt': 'Seiyun', 'seiyun': 'Seiyun',
        'tarim': 'Tarim', 'taiz': 'Taiz',
        'ibb': 'Ibb', 'jibla': 'Ibb',
        'manakhah': 'Manakhah', 'kawkaban': 'Shibam Kawkaban',
        'zabid': 'Zabid',
    },
    // ── Kyrgyzstan ────────────────────────────────────────────────────────────
    KG: {
        'bishkek city': 'Bischkek', 'chui bishkek': 'Bischkek',
        'osh city': 'Osch', 'jalal-abad': 'Jalal-Abad',
        'issyk-kul': 'Tscholpon-Ata', 'cholpon ata': 'Tscholpon-Ata',
        'karakol kyrgyzstan': 'Karakol',
        // More Bishkek districts
        'pervomaysky bishkek': 'Bischkek', 'oktyabrsky bishkek': 'Bischkek',
        'sverdlovsky bishkek': 'Bischkek', 'leninsky bishkek': 'Bischkek',
        'dordoi bazaar': 'Bischkek', 'ak-orgo': 'Bischkek',
        'ulanor bishkek': 'Bischkek', 'alamedin bishkek': 'Bischkek',
        // More Kyrgyzstan cities
        'tokmok': 'Tokmok', 'kant kyrgyzstan': 'Kant',
        'kara balta': 'Kara-Balta', 'talas kyrgyzstan': 'Talas',
        'naryn kyrgyzstan': 'Naryn', 'at bashi': 'At-Bashi',
        'balykchy': 'Balykchy', 'tamga kyrgyzstan': 'Tamga',
        'bokonbaevo': 'Bokonbaevo', 'jeti oguz': 'Jeti-Ögüz',
        'altyn arashan': 'Karakol', 'ak suu': 'Karakol',
        'kochkor': 'Kochkor', 'son kul lake': 'Kochkor',
        'arslanbob': 'Arslanbob', 'jalal abad city': 'Jalal-Abad',
        'uzgen': 'Uzgen', 'batken': 'Batken',
        'isfana': 'Isfana', 'suluktu': 'Suluktu',
        // More Lake Issyk-Kul resorts
        'bosteri': 'Tscholpon-Ata', 'grigorievka': 'Tscholpon-Ata',
        'ananyevo': 'Tscholpon-Ata', 'sary oj': 'Karakol',
        'barskoon': 'Karakol', 'tamga village': 'Tamga',
        'kaji say': 'Bokonbaevo', 'tosor': 'Bokonbaevo',
        'chon kemin': 'Chong-Kemin',
        // Ala-Archa
        'ala archa canyon': 'Bischkek', 'ala archa park': 'Bischkek',
        // Tash Rabat caravanserai
        'tash rabat': 'At-Bashi', 'tash rabat caravanserai': 'At-Bashi',
        // More Bishkek areas
        'alamudun': 'Bischkek', 'sokuluk': 'Bischkek', 'kant bishkek': 'Bischkek',
        'kemin bishkek': 'Bischkek', 'chuy oblast': 'Bischkek',
        // More Osh areas
        'osh bazaar': 'Osch', 'sulayman mountain': 'Osch', 'suleiman too': 'Osch',
        // More Kyrgyzstan nature
        'toktogul reservoir': 'Toktogul', 'besh tash': 'Talas',
        'manas ordo': 'Talas', 'talas city': 'Talas',
        // Russian language names
        'Бишкек': 'Bischkek', 'Ош': 'Osch', 'Жалал-Абад': 'Jalal-Abad',
        'Каракол': 'Karakol', 'Нарын': 'Naryn', 'Талас': 'Talas',
        'Чолпон-Ата': 'Tscholpon-Ata', 'Иссык-Куль': 'Tscholpon-Ata',
        // ── extended coverage ──
        'bishkek centre': 'Bishkek', 'ala too square': 'Bishkek',
        'issyk kul': 'Cholpon-Ata', 'karakol': 'Karakol',
        'ala kul': 'Karakol', 'song kol': 'Kochkor',
        'naryn': 'Naryn', 'osh centre': 'Osh',
        'sulaiman too': 'Osh', 'jalal abad': 'Jalal-Abad',
        'sary chelek': 'Jalal-Abad', 'ala archa': 'Bishkek',
        'bokonbayevo': 'Bokonbayevo', 'kyzyl oi': 'Kyzyl-Oi',
        'talas': 'Talas',
    },
    // ── Tajikistan ────────────────────────────────────────────────────────────
    TJ: {
        'dushanbe city': 'Duschanbe', 'ismoil somoni': 'Duschanbe',
        'khujand city': 'Chudshand', 'kulob': 'Kulob',
        'pamir tajikistan': 'Khorog', 'khorog': 'Khorog',
        'wakhan corridor': 'Ishkashim',
        // More Dushanbe areas
        'shohmansur': 'Duschanbe', 'sino dushanbe': 'Duschanbe',
        'firdavsi': 'Duschanbe', 'ismoil somoni district': 'Duschanbe',
        'hisor dushanbe': 'Duschanbe',
        // More Tajikistan cities
        'khujand downtown': 'Chudshand', 'leninabad': 'Chudshand',
        'konibodom': 'Konibodom', 'istaravshan': 'Istaravshan',
        'panjakent': 'Panjakent', 'sarazm ruins': 'Panjakent',
        'bokhtar': 'Bokhtar', 'qurghonteppa': 'Bokhtar',
        'kulob city': 'Kulob', 'danghara': 'Danghara',
        'ishkashim': 'Ishkashim', 'murghab': 'Murghab',
        'bartang valley': 'Khorog', 'bartang tajikistan': 'Khorog',
        'rushan tajikistan': 'Rushan', 'shughnon': 'Rushan',
        'norak': 'Norak', 'nurek reservoir': 'Norak',
        'ayni tajikistan': 'Ayni', 'zerafshan valley': 'Ayni',
        // Pamir extras
        'wakhan valley': 'Ishkashim', 'yamchun fort': 'Ishkashim',
        'langar tajikistan': 'Ishkashim', 'bibi fatima springs': 'Ishkashim',
        'yashikul lake': 'Murghab', 'karakul lake': 'Murghab',
        'khargush pass': 'Murghab',
        // More cities
        'tursunzoda': 'Tursunzoda', 'vahdat': 'Vahdat',
        'rogun': 'Rogun', 'rogun dam': 'Rogun',
        'penjikent': 'Panjakent', 'qurghonteppa city': 'Bokhtar',
        // Tajik/Russian language names
        'Душанбе': 'Duschanbe', 'Худжанд': 'Chudshand',
        'Куляб': 'Kulob', 'Хорог': 'Khorog',
        'Бохтар': 'Bokhtar', 'Панjakент': 'Panjakent',
        // ── extended coverage ──
        'dushanbe centre': 'Dushanbe', 'rudaki avenue': 'Dushanbe',
        'pamir highway': 'Khorog', 'gorno badakhshan': 'Khorog',
        'karakul tajikistan': 'Murghab', 'iskanderkul': 'Ayni',
        'ayni': 'Ayni', 'fann mountains': 'Panjakent',
        'khujand': 'Khujand', 'hisor': 'Hisor',
    },
    // ── Turkmenistan ──────────────────────────────────────────────────────────
    TM: {
        'ashgabat city': 'Ashgabat', 'ashkhabad': 'Ashgabat',
        'turkmenabat': 'Tschardshou', 'mary turkmenistan': 'Mary',
        'darvaza gas crater': 'Darvaza',
        // More Ashgabat areas
        'berzengi': 'Ashgabat', 'choganly': 'Ashgabat',
        'annau ashgabat': 'Ashgabat', 'chandibil': 'Ashgabat',
        'gurtly ashgabat': 'Ashgabat',
        // More Turkmenistan cities
        'turkmenbashi': 'Krasnowodsk', 'avaza beach': 'Krasnowodsk',
        'balkanabat': 'Balkanabat', 'serdar city': 'Serdar',
        'yolotan': 'Yolöten', 'bairamali': 'Bairamaly',
        'tejen': 'Tejen', 'kaka turkmenistan': 'Kaka',
        'dasoguz': 'Daşoguz', 'koneurgench': 'Köneürgenç',
        'urgench turkmenistan': 'Köneürgenç',
        // Historic sites
        'merv ruins': 'Mary', 'sultan sanjar': 'Mary', 'ancient merv': 'Mary',
        'nisa ruins': 'Ashgabat', 'old nisa': 'Ashgabat',
        'kow ata underground lake': 'Ashgabat',
        'yangykala canyon': 'Krasnowodsk',
        // More cities
        'gokdepe': 'Ashgabat', 'arkadag': 'Ashgabat',
        'turkmenabat city': 'Tschardshou', 'lebap region': 'Tschardshou',
        'mary city': 'Mary', 'bayramaly': 'Bairamaly',
        // Turkmen language names
        'Aşgabat': 'Ashgabat', 'Türkmenabat': 'Tschardshou',
        'Daşoguz': 'Daşoguz', 'Mary': 'Mary',
        // ── extended coverage ──
        'ashgabat centre': 'Ashgabat', 'kipchak': 'Ashgabat',
        'darvaza': 'Darvaza', 'door to hell': 'Darvaza',
        'gates of hell': 'Darvaza', 'merv': 'Mary',
        'kunya urgench': 'Kunya-Urgench', 'konye urgench': 'Kunya-Urgench',
        'dashoguz': 'Dashoguz', 'awaza': 'Turkmenbashi',
        'nisa': 'Ashgabat', 'yangykala': 'Turkmenbashi',
    },
    // ── New Caledonia (France) ────────────────────────────────────────────────
    NC: {
        'noumea city': 'Nouméa', 'noumea': 'Nouméa',
        'anse vata': 'Nouméa', 'baie des citrons': 'Nouméa',
        'magenta noumea': 'Nouméa', 'bourail': 'Bourail',
        'kone new caledonia': 'Kone',
        'paita new caledonia': 'Paita', 'dumbea': 'Dumbéa',
        'mont dore nc': 'Mont-Dore', 'la foa': 'La Foa',
        'hienghene': 'Hienghène', 'poindimie': 'Poindimié',
        'mare island': 'Tadine', 'lifou island': 'Lifou',
        'ouvea island': 'Ouvéa', 'isle of pines': 'Île des Pins',
        'ile des pins': 'Île des Pins', 'thio new caledonia': 'Thio',
        // ── extended coverage ──
        'noumea centre': 'Nouméa', 'quartier latin noumea': 'Nouméa',
        'ducos': 'Nouméa', 'magenta': 'Nouméa',
        'vao': 'Vao', 'kuto': 'Vao',
        'oro bay': 'Vao', 'lifou': 'We',
        'we lifou': 'We', 'mare new caledonia': 'Tadine',
        'tadine': 'Tadine', 'ouvea': 'Fayaoue',
        'fayaoue': 'Fayaoue', 'koumac': 'Koumac',
        'mont dore': 'Mont-Dore',
    },
    // ── Cook Islands ──────────────────────────────────────────────────────────
    CK: {
        'rarotonga': 'Avarua', 'avarua cook islands': 'Avarua',
        'muri beach': 'Avarua', 'aitutaki': 'Aitutaki',
        'avatiu harbour': 'Avarua', 'muri lagoon': 'Avarua',
        'sooretaam': 'Avarua', 'arorangi': 'Arorangi',
        'aitutaki lagoon': 'Aitutaki', 'one foot island': 'Aitutaki',
        'mangaia island': 'Mangaia', 'atiu island': 'Atiu',
        'mauke cook islands': 'Mauke', 'mitiaro': 'Mitiaro',
        'rarotonga island': 'Avarua',
        // ── extended coverage ──
        'avarua': 'Avarua', 'muri': 'Muri',
        'titikaveka': 'Titikaveka', 'aroa': 'Arorangi',
        'black rock rarotonga': 'Arorangi', 'arutanga': 'Arutanga',
        'atiu': 'Atiu', 'mangaia': 'Mangaia',
        'mauke': 'Mauke', 'palmerston': 'Palmerston',
    },
    // ── Palau ─────────────────────────────────────────────────────────────────
    PW: {
        'koror city': 'Koror', 'malakal island': 'Koror',
        'ngermechau': 'Koror', 'airai': 'Airai',
        'rock islands': 'Koror',
        'melekeok': 'Ngerulmud',
        'peleliu island': 'Peleliu', 'angaur island': 'Angaur',
        'babeldaob': 'Airai', 'ngchesar': 'Ngchesar',
        'ngiwal': 'Ngiwal', 'kayangel atoll': 'Kayangel',
        'palau lagoon': 'Koror', 'jellyfish lake palau': 'Koror',
        // ── extended coverage ──
        'koror centre': 'Koror', 'malakal palau': 'Koror',
        'jellyfish lake': 'Koror', 'blue corner': 'Koror',
        'ngerulmud': 'Ngerulmud', 'peleliu': 'Peleliu',
        'angaur': 'Angaur', 'kayangel': 'Kayangel',
        'ngardmau': 'Ngardmau',
    },
    // ── Marshall Islands ──────────────────────────────────────────────────────
    MH: {
        'majuro atoll': 'Majuro', 'djarrit': 'Majuro',
        'delap uliga darrit': 'Majuro',
        'kwajalein atoll': 'Kwajalein',
        'laura beach majuro': 'Majuro', 'ebeye island': 'Ebeye',
        'arno atoll': 'Arno', 'jaluit atoll': 'Jabor',
        'mili atoll': 'Mili', 'ailinglaplap': 'Ailinglaplap',
        // ── extended coverage ──
        'majuro centre': 'Majuro', 'delap': 'Majuro',
        'uliga': 'Majuro', 'laura majuro': 'Majuro',
        'ebeye': 'Ebeye', 'kwajalein': 'Ebeye',
        'arno': 'Arno', 'bikini atoll': 'Majuro',
        'jaluit': 'Jabor', 'wotje': 'Wotje',
        'likiep': 'Likiep', 'mili': 'Mili',
        'rongelap': 'Majuro',
    },
    // ── Micronesia ────────────────────────────────────────────────────────────
    FM: {
        'pohnpei': 'Palikir', 'kolonia pohnpei': 'Kolonia',
        'chuuk lagoon': 'Weno', 'weno island': 'Weno',
        'yap island': 'Colonia',
        'palikir capital': 'Palikir', 'kosrae island': 'Tofol',
        'tofol kosrae': 'Tofol', 'lelu harbor': 'Tofol',
        'nan madol': 'Kolonia', 'pohnpei island': 'Palikir',
        // ── extended coverage ──
        'kolonia': 'Kolonia', 'sokehs': 'Kolonia',
        'chuuk': 'Weno', 'weno': 'Weno',
        'truk lagoon': 'Weno', 'yap': 'Colonia',
        'colonia yap': 'Colonia', 'kosrae': 'Tofol',
        'tofol': 'Tofol', 'lelu': 'Tofol',
        'utwe': 'Tofol', 'palikir': 'Palikir',
    },
    // ── Nauru ─────────────────────────────────────────────────────────────────
    NR: {
        'yaren district': 'Yaren', 'aiwo nauru': 'Aiwo',
        'boe nauru': 'Boe',
        'meneng district': 'Meneng', 'baiti nauru': 'Baiti',
        'anibare': 'Anibare', 'nauru island': 'Yaren',
        // ── extended coverage ──
        'yaren': 'Yaren', 'nauru': 'Yaren',
        'aiwo': 'Aiwo', 'denigomodu': 'Denigomodu',
        'anibare bay': 'Anibare', 'buada lagoon': 'Buada',
        'meneng': 'Meneng', 'ewa nauru': 'Ewa',
        'anabar': 'Anabar', 'boe': 'Boe',
    },
    // ── Kiribati ──────────────────────────────────────────────────────────────
    KI: {
        'south tarawa': 'Bairiki', 'bairiki': 'Bairiki',
        'betio tarawa': 'Betio',
        'christmas island kiribati': 'London',
        'north tarawa': 'Buariki', 'abaiang atoll': 'Tuarabu',
        'kiritimati island': 'London', 'canton island': 'Kanton',
        'tarawa atoll': 'Bairiki', 'bonriki': 'Bonriki',
        // ── extended coverage ──
        'tarawa': 'Tarawa', 'betio': 'Betio',
        'bikenibeu': 'Tarawa', 'kiritimati': 'London',
        'london kiritimati': 'London', 'banana kiritimati': 'London',
        'abaiang': 'Abaiang', 'butaritari': 'Butaritari',
        'fanning island': 'London',
    },
    // ── Tuvalu ────────────────────────────────────────────────────────────────
    TV: {
        'funafuti atoll': 'Funafuti', 'vaiaku': 'Funafuti',
        'fogafale': 'Funafuti', 'funafuti city': 'Funafuti',
        'nukufetau atoll': 'Savave', 'nanumea': 'Nanumea',
        'nukulaelae': 'Fangaua', 'vaitupu': 'Asau',
        // ── extended coverage ──
        'funafuti': 'Funafuti', 'fongafale': 'Funafuti',
        'funafuti lagoon': 'Funafuti', 'funafala': 'Funafuti',
        'nui tuvalu': 'Nui', 'nukufetau': 'Nukufetau',
        'nanumanga': 'Nanumanga', 'niutao': 'Niutao',
    },
    // ── Russia ────────────────────────────────────────────────────────────────
    RU: {
        // Moscow
        'moscow city': 'Moscow', 'downtown moscow': 'Moscow',
        'red square': 'Moscow', 'kremlin': 'Moscow',
        'arbat': 'Moscow', 'old arbat': 'Moscow', 'new arbat': 'Moscow',
        'tverskoy': 'Moscow', 'zamoskvorechye': 'Moscow',
        'kitay-gorod': 'Moscow', 'patriarshy ponds': 'Moscow',
        'presnensky': 'Moscow', 'khamovniki': 'Moscow',
        'yakimanka': 'Moscow', 'taganka': 'Moscow', 'baumanskaya': 'Moscow',
        'izmailovo': 'Moscow', 'sokolniki': 'Moscow',
        'vnukovo area': 'Moscow', 'sheremetyevo area': 'Moscow',
        'domodedovo area': 'Moscow',
        'moscow city district': 'Moscow', 'expocenter moscow': 'Moscow',
        'luzhniki': 'Moscow', 'sparrow hills': 'Moscow',
        'vorobyovy gory': 'Moscow', 'moscow state university area': 'Moscow',
        // Saint Petersburg
        'saint petersburg russia': 'Saint Petersburg',
        'nevsky prospect': 'Saint Petersburg', 'palace square': 'Saint Petersburg',
        'vasilievsky island': 'Saint Petersburg', 'petrogradsky': 'Saint Petersburg',
        'admiralteysky': 'Saint Petersburg', 'tsentralny spb': 'Saint Petersburg',
        'vyborgsky': 'Saint Petersburg', 'peterhof': 'Saint Petersburg',
        'pushkin tsarskoe selo': 'Saint Petersburg',
        'pavlovsk spb': 'Saint Petersburg', 'gatchina': 'Gatchina',
        // Other Russian cities
        'novosibirsk city': 'Novosibirsk', 'akademgorodok': 'Novosibirsk',
        'yekaterinburg city': 'Yekaterinburg', 'ekaterinburg': 'Yekaterinburg',
        'kazan city': 'Kazan', 'kazan kremlin': 'Kazan',
        'nizhny novgorod': 'Nizhny Novgorod', 'gorky russia': 'Nizhny Novgorod',
        'chelyabinsk city': 'Chelyabinsk',
        'samara city': 'Samara', 'omsk city': 'Omsk',
        'rostov-on-don': 'Rostov-on-Don', 'rostov na donu': 'Rostov-on-Don',
        'ufa city': 'Ufa', 'krasnoyarsk city': 'Krasnoyarsk',
        'perm city': 'Perm', 'voronezh city': 'Voronezh',
        'volgograd city': 'Volgograd',
        'sochi resort': 'Sochi', 'sochi russia': 'Sochi',
        'adler sochi': 'Sochi', 'rosa khutor': 'Sochi',
        'krasnaya polyana': 'Sochi', 'olympic park sochi': 'Sochi',
        'kaliningrad city': 'Kaliningrad',
        'vladivostok city': 'Vladivostok', 'khabarovsk city': 'Khabarovsk',
        'irkutsk city': 'Irkutsk', 'lake baikal': 'Irkutsk',
        'listvyanka': 'Irkutsk',
        'murmansk city': 'Murmansk', 'petrozavodsk': 'Petrozavodsk',
        'arkhangelsk city': 'Arkhangelsk',
        'yaroslavl city': 'Yaroslavl', 'suzdal': 'Suzdal',
        'vladimir russia': 'Vladimir', 'golden ring russia': 'Vladimir',
        'tula russia': 'Tula', 'ryazan russia': 'Ryazan',
        'sergiev posad': 'Sergiev Posad',
        'novgorod russia': 'Veliky Novgorod', 'veliky novgorod': 'Veliky Novgorod',
        'pskov russia': 'Pskov',
        'saratov russia': 'Saratov', 'astrakhan russia': 'Astrakhan',
        'krasnodar city': 'Krasnodar', 'anapa resort': 'Anapa',
        'gelendzhik': 'Gelendzhik',
        'stavropol russia': 'Stavropol',
        'tyumen russia': 'Tyumen', 'tobolsk': 'Tobolsk',
        'surgut russia': 'Surgut', 'khanty-mansiysk': 'Khanty-Mansiysk',
        'norilsk': 'Norilsk', 'yakutsk russia': 'Yakutsk',
        'magadan russia': 'Magadan',
        'petropavlovsk-kamchatsky': 'Petropavlovsk-Kamchatsky',
        'yuzhno-sakhalinsk': 'Yuzhno-Sakhalinsk', 'sakhalin island': 'Yuzhno-Sakhalinsk',
        'izhevsk russia': 'Izhevsk', 'ulyanovsk': 'Ulyanovsk',
        'orenburg russia': 'Orenburg',
        'belgorod russia': 'Belgorod',
        'lipetsk russia': 'Lipetsk', 'tambov russia': 'Tambov',
        'kirov russia': 'Kirov', 'cheboksary': 'Cheboksary',
        'saransk russia': 'Saransk',
        'makhachkala': 'Makhachkala', 'vladikavkaz': 'Vladikavkaz',
        'nalchik': 'Nalchik', 'grozny': 'Grozny',
        'cherkessk': 'Cherkessk', 'maykop': 'Maykop',
        // More Moscow districts
        'kuzminki': 'Moscow', 'lyublino': 'Moscow', 'maryino': 'Moscow',
        'ostankino': 'Moscow', 'mitino': 'Moscow', 'strogino': 'Moscow',
        'kuntsevo': 'Moscow', 'fili': 'Moscow', 'khoroshevo': 'Moscow',
        'butovo': 'Moscow', 'zyuzino': 'Moscow', 'konkovo': 'Moscow',
        'troparyovo': 'Moscow', 'teply stan': 'Moscow',
        'zelenograd': 'Moscow', 'korolev moscow': 'Moscow',
        // More Saint Petersburg districts
        'moskovskiy spb': 'Saint Petersburg', 'kirovsky spb': 'Saint Petersburg',
        'nevsky spb': 'Saint Petersburg', 'primorsky spb': 'Saint Petersburg',
        'kalininsky spb': 'Saint Petersburg', 'krasnoselsky spb': 'Saint Petersburg',
        'kolpino': 'Saint Petersburg', 'kronstadt': 'Saint Petersburg',
        'lomonosov spb': 'Saint Petersburg',
        // Siberia extras
        'tomsk city': 'Tomsk', 'barnaul city': 'Barnaul',
        'kemerovo city': 'Kemerovo', 'novokuznetsk': 'Novokuznetsk',
        'abakan city': 'Abakan', 'kyzyl tuva': 'Kyzyl',
        'gorno-altaysk': 'Gorno-Altaysk', 'altai republic': 'Gorno-Altaysk',
        'teletskoye lake': 'Gorno-Altaysk', 'aktash altai': 'Gorno-Altaysk',
        'belokurikha': 'Belokurikha',
        // Buryatia / Baikal extras
        'ulan-ude city': 'Ulan-Ude', 'ulan ude': 'Ulan-Ude',
        'olkhon island': 'Irkutsk', 'khuzhir': 'Irkutsk',
        'baikal shore': 'Irkutsk', 'slyudyanka': 'Irkutsk',
        'tankhoy': 'Irkutsk',
        // Far East extras
        'komsomolsk-on-amur': 'Komsomolsk-on-Amur',
        'blagoveshchensk russia': 'Blagoveshchensk',
        'yuzhno-kurilsk': 'Yuzhno-Sakhalinsk',
        'anadyr chukotka': 'Anadyr',
        'petropavlovsk kamchatka': 'Petropavlovsk-Kamchatsky',
        'valley of geysers': 'Petropavlovsk-Kamchatsky',
        'avacha bay': 'Petropavlovsk-Kamchatsky',
        // Ural extras
        'magnitogorsk': 'Magnitogorsk',
        'zlatoust': 'Zlatoust', 'miass': 'Miass',
        'perm krai': 'Perm', 'kungur': 'Kungur',
        // Russian language city names
        'Москва': 'Moscow', 'Санкт-Петербург': 'Saint Petersburg',
        'Новосибирск': 'Novosibirsk', 'Екатеринбург': 'Yekaterinburg',
        'Казань': 'Kazan', 'Нижний Новгород': 'Nizhny Novgorod',
        'Самара': 'Samara', 'Уфа': 'Ufa', 'Красноярск': 'Krasnoyarsk',
        'Пермь': 'Perm', 'Воронеж': 'Voronezh', 'Сочи': 'Sochi',
        'Владивосток': 'Vladivostok', 'Иркутск': 'Irkutsk',
        'Краснодар': 'Krasnodar', 'Тюмень': 'Tyumen',
        'Калининград': 'Kaliningrad', 'Мурманск': 'Murmansk',
        'Хабаровск': 'Khabarovsk', 'Омск': 'Omsk',
    },
    // ── Ukraine ─── (already has entries, extending) ──────────────────────────
    // ── Belarus ───────────────────────────────────────────────────────────────
    BY: {
        'minsk city': 'Minsk', 'downtown minsk': 'Minsk',
        'nemiga': 'Minsk', 'niamiha': 'Minsk',
        'oktyabrsky minsk': 'Minsk', 'frunzensky minsk': 'Minsk',
        'brest belarus': 'Brest', 'grodno belarus': 'Hrodna',
        'vitebsk belarus': 'Witebsk', 'gomel belarus': 'Gomel',
        'mogilev belarus': 'Mogilev', 'baranovichi': 'Baranawitschy',
        'pinsk belarus': 'Pinsk',
        // More Minsk districts
        'partyzanski minsk': 'Minsk', 'leninskiy minsk': 'Minsk',
        'moskovsky minsk': 'Minsk', 'pervomaysky minsk': 'Minsk',
        'zavodskoy minsk': 'Minsk', 'sovetsky minsk': 'Minsk',
        'central minsk': 'Minsk', 'komarovka market': 'Minsk',
        'troitskoe predmestye': 'Minsk', 'nemiga street': 'Minsk',
        // Other Belarus cities
        'bobruisk': 'Bobrujsk', 'molodechno': 'Maladsetschna',
        'zhlobin': 'Gomel', 'soligorsk': 'Soligorsk',
        'slutsk belarus': 'Sluzk', 'lida belarus': 'Lida',
        'polotsk': 'Polozk', 'novopolotsk': 'Nawapolazk',
        'orsha': 'Orscha', 'borisov belarus': 'Borissow',
        'zhodino': 'Schodsina', 'maryina horka': 'Minsk',
        'brest fortress': 'Brest', 'belovezhskaya pushcha': 'Brest',
        'mir castle': 'Mir', 'nesvizh castle': 'Njaswisch',
        'grodno old town': 'Hrodna', 'farny church grodno': 'Hrodna',
        'vitebsk old town': 'Witebsk', 'marc chagall vitebsk': 'Witebsk',
        'gomel palace': 'Gomel', 'khatyn memorial': 'Minsk',
        // ── extended coverage ──
        'minsk centre': 'Minsk', 'independence avenue': 'Minsk',
        'trinity hill': 'Minsk', 'oktyabrskaya': 'Minsk',
        'uruchcha': 'Minsk', 'nesvizh': 'Nesvizh',
        'grodno': 'Grodno', 'hrodna': 'Grodno',
        'vitebsk': 'Vitebsk', 'mogilev': 'Mogilev',
        'gomel': 'Gomel', 'homyel': 'Gomel',
        'braslav': 'Braslav',
    },
    // ── Moldova ───────────────────────────────────────────────────────────────
    MD: {
        'chisinau city': 'Chisinau', 'chișinău': 'Chisinau',
        'centru chisinau': 'Chisinau', 'botanica chisinau': 'Chisinau',
        'riscani chisinau': 'Chisinau', 'buiucani chisinau': 'Chisinau',
        'balti moldova': 'Balti', 'tiraspol moldova': 'Tiraspol',
        'cahul moldova': 'Cahul',
        // More Chisinau neighborhoods
        'ciocana chisinau': 'Chisinau', 'telecentru': 'Chisinau',
        'dubasari': 'Chisinau', 'aeroport chisinau': 'Chisinau',
        'poșta veche': 'Chisinau', 'sculeni': 'Chisinau',
        'stauceni': 'Chisinau', 'singera': 'Chisinau',
        // Moldova other cities/towns
        'orhei moldova': 'Orhei', 'old orhei': 'Orhei',
        'soroca moldova': 'Soroca', 'ungheni moldova': 'Ungheni',
        'edinet moldova': 'Edineț', 'drochia': 'Drochia',
        'rezina moldova': 'Rezina', 'straseni': 'Straseni',
        'ialoveni': 'Ialoveni', 'nisporeni': 'Nisporeni',
        'cricova winery': 'Cricova', 'milestii mici winery': 'Milestii Mici',
        // ── extended coverage ──
        'chisinau centre': 'Chisinau', 'botanica': 'Chisinau',
        'riscani': 'Chisinau', 'buiucani': 'Chisinau',
        'ciocana': 'Chisinau', 'orheiul vechi': 'Orhei',
        'orhei': 'Orhei', 'cricova': 'Cricova',
        'milestii mici': 'Ialoveni', 'tiraspol': 'Tiraspol',
        'transnistria': 'Tiraspol', 'bender moldova': 'Bender',
        'balti': 'Balti', 'cahul': 'Cahul',
        'soroca': 'Soroca', 'comrat': 'Comrat',
        'gagauzia': 'Comrat',
    },
    // ── Kosovo ────────────────────────────────────────────────────────────────
    XK: {
        'pristina city': 'Pristina', 'prishtina': 'Pristina',
        'city centre pristina': 'Pristina',
        'dardania pristina': 'Pristina', 'pejton pristina': 'Pristina',
        'bregu i diellit pristina': 'Pristina', 'velania pristina': 'Pristina',
        'newborn monument pristina': 'Pristina', 'rilindja pristina': 'Pristina',
        'prizren': 'Prizren', 'prizren old bazaar': 'Prizren', 'lumbardhi prizren': 'Prizren',
        'peja kosovo': 'Peja', 'pec kosovo': 'Peja', 'rugova canyon': 'Peja',
        'gjakova': 'Gjakove', 'gjakove': 'Gjakove',
        'mitrovica': 'Mitrovica', 'mitrovice': 'Mitrovica',
        'ferizaj': 'Ferizaj', 'gjilan': 'Gjilan', 'vushtrri': 'Vushtrri',
        'rahovec': 'Rahovec', 'suhareka': 'Suhareka', 'decan': 'Deçan',
        // ── extended coverage ──
        'pristina centre': 'Pristina', 'newborn monument': 'Pristina',
        'prizren old town': 'Prizren', 'shadervan': 'Prizren',
        'peja': 'Peja', 'pec': 'Peja',
        'rugova': 'Peja', 'brezovica': 'Strpce',
        'strpce': 'Strpce', 'gracanica': 'Gracanica',
    },
    // ── Luxembourg ────────────────────────────────────────────────────────────
    LU: {
        'luxembourg city': 'Luxembourg', 'ville haute': 'Luxembourg',
        'kirchberg luxembourg': 'Luxembourg', 'limpertsberg': 'Luxembourg',
        'grund luxembourg': 'Luxembourg', 'clausen': 'Luxembourg',
        'esch-sur-alzette': 'Esch-sur-Alzette',
        'dudelange luxembourg': 'Dudelange', 'differdange': 'Differdange',
        'schifflange': 'Schifflange', 'bettembourg': 'Bettembourg',
        'ettelbruck': 'Ettelbruck', 'diekirch luxembourg': 'Diekirch',
        'echternach': 'Echternach', 'vianden': 'Vianden',
        'wiltz luxembourg': 'Wiltz', 'clervaux': 'Clervaux',
        'contern luxembourg': 'Contern', 'mondorf les bains': 'Mondorf-les-Bains',
        // ── extended coverage ──
        'grund': 'Luxembourg', 'kirchberg': 'Luxembourg',
        'gare luxembourg': 'Luxembourg', 'bock casemates': 'Luxembourg',
        'belair luxembourg': 'Luxembourg', 'findel': 'Luxembourg',
        'esch sur alzette': 'Esch-sur-Alzette', 'belval': 'Esch-sur-Alzette',
        'dudelange': 'Dudelange', 'diekirch': 'Diekirch',
        'mullerthal': 'Echternach', 'little switzerland luxembourg': 'Echternach',
        'remich': 'Remich', 'moselle luxembourg': 'Remich',
        'grevenmacher': 'Grevenmacher', 'wiltz': 'Wiltz',
        'bourscheid': 'Bourscheid',
    },
    // ── Andorra ───────────────────────────────────────────────────────────────
    AD: {
        'andorra la vella': 'Andorra la Vella', 'andorra city': 'Andorra la Vella',
        'escaldes andorra': 'Escaldes-Engordany', 'grandvalira': 'Soldeu',
        'soldeu ski resort': 'Soldeu', 'ordino': 'Ordino',
        'pas de la casa': 'Pas de la Casa',
        // ── extended coverage ──
        'escaldes engordany': 'Escaldes-Engordany', 'les escaldes': 'Escaldes-Engordany',
        'canillo': 'Canillo', 'soldeu': 'Canillo',
        'el tarter': 'Canillo', 'encamp': 'Encamp',
        'la massana': 'La Massana', 'vallnord': 'La Massana',
        'arinsal': 'La Massana', 'pal arinsal': 'La Massana',
        'sant julia de loria': 'Sant Julia de Loria', 'caldea': 'Escaldes-Engordany',
    },
    // ── San Marino ────────────────────────────────────────────────────────────
    SM: {
        'city of san marino': 'San Marino', 'san marino city': 'San Marino',
        'serravalle san marino': 'Serravalle', 'borgomilano': 'Borgo Maggiore',
        'borgo maggiore': 'Borgo Maggiore',
        // ── extended coverage ──
        'citta di san marino': 'San Marino', 'monte titano': 'San Marino',
        'serravalle': 'Serravalle', 'domagnano': 'Domagnano',
        'fiorentino': 'Fiorentino', 'acquaviva': 'Acquaviva',
        'chiesanuova': 'Chiesanuova', 'faetano': 'Faetano',
    },
    // ── Liechtenstein ─────────────────────────────────────────────────────────
    LI: {
        'vaduz city': 'Vaduz', 'schaan liechtenstein': 'Schaan',
        'balzers': 'Balzers', 'triesenberg': 'Triesenberg',
        'malbun ski': 'Malbun',
        // ── extended coverage ──
        'vaduz castle': 'Vaduz', 'staedtle': 'Vaduz',
        'schaan': 'Schaan', 'malbun': 'Triesenberg',
        'triesen': 'Triesen', 'eschen': 'Eschen',
        'mauren': 'Mauren', 'ruggell': 'Ruggell',
        'gamprin': 'Gamprin', 'planken': 'Planken',
        'schellenberg': 'Schellenberg',
    },
    // ── Faroe Islands (Denmark) ───────────────────────────────────────────────
    FO: {
        'torshavn': 'Tórshavn', 'tórshavn': 'Tórshavn',
        'vagar faroe islands': 'Sørvágur', 'sorvagur': 'Sørvágur',
        'klaksvik faroe': 'Klaksvík',
        'vestmanna': 'Vestmanna', 'leynar faroe': 'Leynar',
        'eidi faroe': 'Eiði', 'gjogv': 'Gjógv',
        'saksun faroe': 'Saksun', 'gasadalur': 'Gásadalur',
        'mykines faroe': 'Mykines', 'suduroy': 'Tvøroyri',
        'tvoroyri': 'Tvøroyri', 'runavik faroe': 'Runavík',
        'hoyvik faroe': 'Hoyvík', 'streymoy': 'Tórshavn',
        // ── extended coverage ──
        'torshavn centre': 'Tórshavn', 'tinganes': 'Tórshavn',
        'klaksvik': 'Klaksvík', 'vagar airport': 'Sorvagur',
        'saksun': 'Saksun', 'eidi': 'Eidi',
        'runavik': 'Runavík', 'mykines': 'Mykines',
        'kirkjubour': 'Kirkjubour',
    },
    // ── Greenland (Denmark) ───────────────────────────────────────────────────
    GL: {
        'nuuk greenland': 'Nuuk', 'godthab': 'Nuuk',
        'ilulissat': 'Ilulissat', 'disko bay': 'Ilulissat',
        'kangerlussuaq': 'Kangerlussuaq', 'sisimiut': 'Sisimiut',
        'tasiilaq': 'Tasiilaq', 'ammassalik': 'Tasiilaq',
        'aasiaat': 'Aasiaat', 'qaqortoq': 'Qaqortoq',
        'maniitsoq greenland': 'Maniitsoq', 'paamiut': 'Paamiut',
        'narsaq greenland': 'Narsaq', 'narsarsuaq': 'Narsarsuaq',
        'qaanaaq': 'Qaanaaq', 'thule greenland': 'Qaanaaq',
        'uummannaq': 'Uummannaq', 'upernavik': 'Upernavik',
        'pituffik': 'Pituffik', 'north greenland': 'Qaanaaq',
        // ── extended coverage ──
        'nuuk centre': 'Nuuk', 'ilulissat icefjord': 'Ilulissat',
        'jakobshavn': 'Ilulissat', 'maniitsoq': 'Maniitsoq',
        'qeqertarsuaq': 'Qeqertarsuaq',
    },
    // ── French Polynesia extras (PF already defined) ──────────────────────────
    // ── New Zealand extras ────────────────────────────────────────────────────
    // NZ already defined — adding more
    // ── US extras ────────────────────────────────────────────────────────────
    // US already defined — key popular spots below
    // ── More Caribbean ────────────────────────────────────────────────────────
    // ── Antigua and Barbuda ───────────────────────────────────────────────────
    AG: {
        'st johns antigua': "St. John's", "st. john's antigua": "St. John's",
        'dickenson bay': "St. John's", 'jolly harbour': "St. John's",
        'english harbour': 'English Harbour',
        'nelson dockyard': 'English Harbour', 'shirley heights': 'English Harbour',
        'falmouth harbour': 'Falmouth Harbour',
        'barbuda island': 'Codrington',
        // Antigua extra areas
        'antigua city': "St. John's", 'redcliffe quay': "St. John's",
        'heritage quay': "St. John's", 'antigua cruise port': "St. John's",
        'runaway bay antigua': "St. John's", 'fort james antigua': "St. John's",
        'five islands antigua': "St. John's", 'cedar valley antigua': "St. John's",
        'coolidge antigua': "St. John's", 'vc bird airport area': "St. John's",
        'long bay antigua': 'Long Bay', 'half moon bay antigua': 'Half Moon Bay',
        'willoughby bay': 'Willoughby Bay', 'freemans village': "St. John's",
        'all saints antigua': 'All Saints', 'liberta': 'Liberta',
        'seatons village': 'Seatons', 'green bay antigua': "St. John's",
        // Barbuda extra areas
        'codrington lagoon': 'Codrington', 'palmetto point barbuda': 'Codrington',
        'dark cave barbuda': 'Codrington', 'frigate bird sanctuary': 'Codrington',
        // ── extended coverage ──
        'nelsons dockyard': 'English Harbour', 'darkwood beach': 'Jolly Harbour',
        'barbuda': 'Codrington', 'codrington': 'Codrington',
        'valley church': 'Jolly Harbour',
    },
    // ── Dominica ──────────────────────────────────────────────────────────────
    DM: {
        'roseau dominica': 'Roseau', 'roseau city': 'Roseau',
        'portsmouth dominica': 'Portsmouth',
        'boiling lake': 'Roseau', 'syndicate dominica': 'Roseau',
        // Dominica extra areas
        'calibishie': 'Calibishie', 'hampstead beach': 'Calibishie',
        'marigot dominica': 'Marigot', 'wesley dominica': 'Wesley',
        'castle bruce': 'Castle Bruce', 'emerald pool': 'Castle Bruce',
        'grand bay dominica': 'Grand Bay', 'soufriere dominica': 'Soufriere',
        'scott s head': 'Scott\'s Head', 'champagne reef': 'Scott\'s Head',
        'mero beach': 'Mero', 'layou dominica': 'Layou',
        'st joseph dominica': 'Saint Joseph', 'mahaut dominica': 'Mahaut',
        'trafalgar falls': 'Roseau', 'morne trois pitons': 'Roseau',
        'indian river portsmouth': 'Portsmouth', 'cabrits national park': 'Portsmouth',
        'douglas bay': 'Portsmouth',
        // ── extended coverage ──
        'roseau centre': 'Roseau', 'scotts head': 'Soufriere',
        'canefield': 'Roseau', 'kalinago territory': 'Castle Bruce',
    },
    // ── Saint Kitts and Nevis ─────────────────────────────────────────────────
    KN: {
        'basseterre st kitts': 'Basseterre', 'basseterre city': 'Basseterre',
        'frigate bay': 'Basseterre', 'south frigate bay': 'Basseterre',
        'charlestown nevis': 'Charlestown', 'pinney s beach': 'Charlestown',
        // Saint Kitts extra areas
        'south peninsula st kitts': 'Basseterre', 'timothy beach': 'Basseterre',
        'cockleshell bay': 'Basseterre', 'whitehouse bay': 'Basseterre',
        'brimstone hill': 'Brimstone Hill', 'sandy point st kitts': 'Sandy Point',
        'dieppe bay': 'Dieppe Bay', 'cayon': 'Cayon', 'st pauls st kitts': 'Saint Paul',
        'tabernacle st kitts': 'Tabernacle', 'old road bay': 'Old Road',
        'middle island st kitts': 'Middle Island',
        // Nevis extra areas
        'pinney s beach nevis': 'Charlestown', 'four seasons nevis': 'Charlestown',
        'nisbet plantation': 'Newcastle', 'newcastle nevis': 'Newcastle',
        'oualie beach': 'Newcastle', 'mount nevis': 'Charlestown',
        'bath hotel nevis': 'Charlestown', 'gingerland': 'Gingerland',
        // ── extended coverage ──
        'basseterre centre': 'Basseterre', 'south friars bay': 'Frigate Bay',
        'christophe harbour': 'Basseterre', 'nevis': 'Charlestown',
        'pinneys beach': 'Charlestown',
    },
    // ── Saint Vincent and the Grenadines ──────────────────────────────────────
    VC: {
        'kingstown st vincent': 'Kingstown', 'kingstown': 'Kingstown',
        'bequia island': 'Port Elizabeth', 'port elizabeth bequia': 'Port Elizabeth',
        'union island': 'Clifton', 'palm island': 'Clifton',
        'mustique island': 'Mustique',
        // SVG extra areas
        'villa st vincent': 'Kingstown', 'young island': 'Kingstown',
        'indian bay beach': 'Kingstown', 'arnos vale': 'Kingstown',
        'edinburgh st vincent': 'Kingstown', 'mesopotamia valley': 'Kingstown',
        'diamond beach': 'Kingstown', 'black point tunnel': 'Kingstown',
        'dark view falls': 'Georgetown',
        'georgetown st vincent': 'Georgetown', 'owia': 'Georgetown',
        'fancy village': 'Georgetown', 'chateaubelair': 'Chateaubelair',
        'barrouallie': 'Barrouallie', 'layou st vincent': 'Layou',
        // Bequia extra
        'friendship bay bequia': 'Port Elizabeth', 'industry bay bequia': 'Port Elizabeth',
        'spring bay bequia': 'Port Elizabeth', 'lower bay bequia': 'Port Elizabeth',
        // Tobago Cays area
        'tobago cays': 'Clifton', 'mayreau island': 'Mayreau', 'canouan island': 'Canouan',
        'salt whistle bay mayreau': 'Mayreau',
        // ── extended coverage ──
        'kingstown svg': 'Kingstown', 'villa beach': 'Kingstown',
        'indian bay': 'Kingstown', 'bequia': 'Port Elizabeth',
        'princess margaret beach': 'Port Elizabeth', 'mustique': 'Mustique',
        'canouan': 'Canouan', 'clifton union island': 'Clifton',
        'palm island svg': 'Clifton', 'mayreau': 'Mayreau',
        'la soufriere svg': 'Georgetown',
    },
    // ── Anguilla ──────────────────────────────────────────────────────────────
    AI: {
        'the valley anguilla': 'The Valley', 'meads bay': 'The Valley',
        'shoal bay anguilla': 'The Valley', 'sandy ground': 'The Valley',
        // Anguilla extra areas
        'anguilla island': 'The Valley', 'the valley city': 'The Valley',
        'blowing point': 'Blowing Point', 'rendezvous bay': 'Blowing Point',
        'cap juluca': 'Blowing Point', 'cove bay anguilla': 'Blowing Point',
        'west end anguilla': 'West End', 'sandy hill anguilla': 'Sandy Hill',
        'east end anguilla': 'East End', 'island harbour': 'Island Harbour',
        'scrub island anguilla': 'Island Harbour', 'barnes bay': 'West End',
        'maundays bay': 'West End', 'shoal bay east': 'Shoal Bay',
        'little bay anguilla': 'The Valley', 'crocus bay': 'The Valley',
        'forest bay': 'The Valley', 'captain s bay': 'East End',
        // ── extended coverage ──
        'shoal bay': 'Shoal Bay Village', 'sandy ground anguilla': 'Sandy Ground',
    },
    // ── British Virgin Islands ────────────────────────────────────────────────
    VG: {
        'road town bvi': 'Road Town', 'road town tortola': 'Road Town',
        'virgin gorda bvi': 'Virgin Gorda', 'the baths': 'Virgin Gorda',
        'jost van dyke': 'Jost Van Dyke',
        'anegada bvi': 'Anegada',
        // ── extended coverage ──
        'road town': 'Road Town', 'tortola': 'Road Town',
        'cane garden bay': 'Cane Garden Bay', 'virgin gorda': 'Spanish Town',
        'spanish town bvi': 'Spanish Town', 'white bay jost van dyke': 'Great Harbour',
        'anegada': 'The Settlement', 'north sound bvi': 'Spanish Town',
        'soper hole': 'West End', 'west end tortola': 'West End',
    },
    // ── US Virgin Islands ─────────────────────────────────────────────────────
    VI: {
        'charlotte amalie': 'Charlotte Amalie', 'st thomas usvi': 'Charlotte Amalie',
        'havensight': 'Charlotte Amalie', 'frenchtown': 'Charlotte Amalie',
        'frederiksted': 'Frederiksted', 'christiansted': 'Christiansted',
        'st croix usvi': 'Christiansted', 'st john usvi': 'Cruz Bay',
        'cruz bay': 'Cruz Bay', 'trunk bay': 'Cruz Bay',
        // ── extended coverage ──
        'magens bay': 'Charlotte Amalie', 'red hook': 'Charlotte Amalie',
        'coral bay': 'Coral Bay', 'st croix': 'Christiansted',
        'buck island': 'Christiansted',
    },
    // ── Sint Maarten / Saint Martin ───────────────────────────────────────────
    SX: {
        'philipsburg': 'Philipsburg', 'maho beach': 'Philipsburg',
        'cole bay': 'Philipsburg', 'simpson bay': 'Philipsburg',
        'dawn beach': 'Philipsburg',
        'cupecoy': 'Philipsburg', 'mullet bay': 'Philipsburg',
        'st maarten dutch side': 'Philipsburg', 'great bay beach': 'Philipsburg',
        'wathey square': 'Philipsburg', 'front street philipsburg': 'Philipsburg',
        'airport sx': 'Philipsburg', 'princess juliana airport': 'Philipsburg',
        // ── extended coverage ──
        'front street sint maarten': 'Philipsburg', 'maho sint maarten': 'Maho',
        'oyster pond': 'Oyster Pond', 'pelican key': 'Simpson Bay',
    },
    MF: {
        'marigot st martin': 'Marigot', 'grand case': 'Grand Case',
        'orient beach': 'Orient Bay', 'friar s bay': 'Marigot',
        'french side st martin': 'Marigot', 'anse marcel': 'Anse Marcel',
        'cul de sac st martin': 'Marigot', 'hope estate': 'Marigot',
        'saint martin fwi': 'Marigot', 'baie orientale': 'Orient Bay',
        'galisbay': 'Marigot',
        // ── extended coverage ──
        'marigot': 'Marigot', 'orient bay': 'Orient Bay',
        'terres basses': 'Terres Basses', 'friars bay': 'Marigot',
        'happy bay': 'Grand Case', 'st martin french side': 'Marigot',
    },
    // ── Turks and Caicos extras ───────────────────────────────────────────────
    // TC already defined, extending
    // ── Bermuda ───────────────────────────────────────────────────────────────
    BM: {
        'hamilton bermuda': 'Hamilton', 'city of hamilton': 'Hamilton',
        'tucker s town': 'Hamilton', 'st george bermuda': "St. George's",
        'warwick bermuda': 'Warwick', 'southampton bermuda': 'Southampton',
        'dockyard bermuda': 'Royal Naval Dockyard',
        'pembroke bermuda': 'Pembroke', 'devonshire bermuda': 'Devonshire',
        'paget bermuda': 'Paget', 'sandys bermuda': "Sandy's",
        'smiths bermuda': "Smith's", 'elbow beach bermuda': 'Paget',
        'horseshoe bay bermuda': 'Southampton', 'shelly bay': 'Hamilton',
        'flatt village': 'Hamilton', 'bermuda city': 'Hamilton',
        // ── extended coverage ──
        'front street': 'Hamilton', 'st georges bermuda': "St. George's",
        'town of st george': "St. George's", 'royal naval dockyard': "Sandy's",
        'kings wharf': "Sandy's", 'somerset bermuda': "Sandy's",
        'horseshoe bay': 'Southampton', 'elbow beach': 'Paget',
        'tuckers town': "St. George's",
    },
    // ── Cayman Islands extras ─────────────────────────────────────────────────
    // KY already defined, extending
    // ── French Guiana ─────────────────────────────────────────────────────────
    GF: {
        'cayenne french guiana': 'Cayenne', 'kourou': 'Kourou',
        'space centre kourou': 'Kourou', 'saint-laurent du maroni': 'Saint-Laurent-du-Maroni',
        'remire montjoly': 'Rémire-Montjoly', 'matoury': 'Matoury',
        'macouria': 'Macouria', 'roura': 'Roura', 'montsinery': 'Montsinéry',
        'sinnamary french guiana': 'Sinnamary', 'iracoubo': 'Iracoubo',
        'mana french guiana': 'Mana', 'saint-jean du maroni': 'Saint-Laurent-du-Maroni',
        'papaichton': 'Papaichton', 'saul french guiana': 'Saül',
        // ── extended coverage ──
        'cayenne centre': 'Cayenne', 'iles du salut': 'Kourou',
        'devils island': 'Kourou', 'saint laurent du maroni': 'Saint-Laurent-du-Maroni',
        'cayenne airport': 'Matoury', 'sinnamary': 'Sinnamary',
        'kaw': 'Roura', 'awala yalimapo': 'Awala-Yalimapo',
    },
    // ── Martinique ────────────────────────────────────────────────────────────
    MQ: {
        'fort de france': 'Fort-de-France', 'fort-de-france': 'Fort-de-France',
        'le marin martinique': 'Le Marin', 'sainte anne martinique': 'Sainte-Anne',
        'le diamant': 'Le Diamant', 'les trois ilets': 'Les Trois-Îlets',
        'marin martinique': 'Le Marin',
        'lamentin martinique': 'Le Lamentin', 'schoelcher': 'Schœlcher',
        'le carbet': 'Le Carbet', 'saint pierre martinique': 'Saint-Pierre',
        'la trinite': 'La Trinité', 'le robert': 'Le Robert',
        'le francois': 'Le François', 'le vauclin': 'Le Vauclin',
        'riviere salee': 'Rivière-Salée', 'case pilote': 'Case-Pilote',
        'balata martinique': 'Fort-de-France',
        // ── extended coverage ──
        'pointe du bout': 'Les Trois-Îlets', 'anse mitan': 'Les Trois-Îlets',
        'les salines': 'Sainte-Anne', 'sainte luce': 'Sainte-Luce',
        'diamant': 'Le Diamant', 'mont pelee': 'Saint-Pierre',
        'le marin': 'Le Marin', 'tartane': 'La Trinité',
        'la trinite martinique': 'La Trinité',
    },
    // ── Guadeloupe ────────────────────────────────────────────────────────────
    GP: {
        'pointe a pitre': 'Pointe-à-Pitre', 'pointe-à-pitre': 'Pointe-à-Pitre',
        'gosier guadeloupe': 'Gosier', 'saint francois guadeloupe': 'Saint-François',
        'sainte anne guadeloupe': 'Sainte-Anne', 'basse terre guadeloupe': 'Basse-Terre',
        'les saintes': 'Terre-de-Haut',
        'abymes guadeloupe': 'Les Abymes', 'baie mahault': 'Baie-Mahault',
        'capesterre belle eau': 'Capesterre-Belle-Eau',
        'marie galante': 'Grand-Bourg', 'grand bourg marie galante': 'Grand-Bourg',
        'la desirade': 'Grande-Anse', 'bouillante': 'Bouillante',
        'deshaies guadeloupe': 'Deshaies', 'moule guadeloupe': 'Le Moule',
        'terre de haut': 'Terre-de-Haut', 'anse bertrand': 'Anse-Bertrand',
        'petit canal': 'Petit-Canal',
        // ── extended coverage ──
        'gosier': 'Le Gosier', 'le gosier': 'Le Gosier',
        'bas du fort': 'Le Gosier', 'basse terre': 'Basse-Terre',
        'deshaies': 'Deshaies', 'grande anse deshaies': 'Deshaies',
        'sainte rose guadeloupe': 'Sainte-Rose', 'grand bourg': 'Grand-Bourg',
        'le moule': 'Le Moule', 'petit bourg': 'Petit-Bourg',
        'la soufriere guadeloupe': 'Saint-Claude',
    },
    // ── Reunion ───────────────────────────────────────────────────────────────
    RE: {
        'saint denis reunion': 'Saint-Denis', 'saint-denis': 'Saint-Denis',
        'saint gilles les bains': 'Saint-Gilles-les-Bains', 'l hermitage': 'Saint-Gilles-les-Bains',
        'saint pierre reunion': 'Saint-Pierre', 'cilaos': 'Cilaos',
        'piton de la fournaise': 'Saint-Philippe',
        'saint paul reunion': 'Saint-Paul', 'le tampon': 'Le Tampon',
        'saint benoit reunion': 'Saint-Benoît', 'saint andre reunion': 'Saint-André',
        'saint louis reunion': 'Saint-Louis', 'bras panon': 'Bras-Panon',
        'sainte rose reunion': 'Sainte-Rose', 'saint philippe reunion': 'Saint-Philippe',
        'entre deux': 'Entre-Deux', 'petit ile': 'Petite-Île',
        'les avirons': 'Les Avirons', 'la possession': 'La Possession',
        'sainte marie reunion': 'Sainte-Marie', 'sainte suzanne': 'Sainte-Suzanne',
        'hell bourg': 'Salazie', 'salazie': 'Salazie',
        // ── extended coverage ──
        'hermitage les bains': 'Saint-Gilles-les-Bains', 'boucan canot': 'Saint-Gilles-les-Bains',
        'saint leu': 'Saint-Leu', 'etang sale': "L'Etang-Sale",
        'mafate': 'La Possession', 'plaine des cafres': 'Le Tampon',
        'sainte anne reunion': 'Sainte-Suzanne', 'piton des neiges': 'Cilaos',
    },
    // ── Mayotte ───────────────────────────────────────────────────────────────
    YT: {
        'mamoudzou': 'Mamoudzou', 'kaweni': 'Mamoudzou',
        'dzaoudzi': 'Dzaoudzi', 'koungou': 'Koungou',
        'bandraboua': 'Bandraboua', 'mtsamboro': 'Mtsamboro',
        'acoua': 'Acoua', 'mtsangamouji': 'Mtsangamouji',
        'pamandzi': 'Pamandzi', 'petite terre': 'Dzaoudzi',
        'grande terre mayotte': 'Mamoudzou', 'boueni': 'Bouéni',
        'kani keli': 'Kani-Kéli', 'chirongui': 'Chirongui',
        'ouangani': 'Ouangani', 'sada mayotte': 'Sada',
        // ── extended coverage ──
        'mamoudzou centre': 'Mamoudzou', 'sada': 'Sada',
        'bandrele': 'Bandrele', 'ngouja': 'Kani-Kéli',
        'tsingoni': 'Tsingoni', 'lagon de mayotte': 'Mamoudzou',
    },
    // ── Comoros ───────────────────────────────────────────────────────────────
    KM: {
        'moroni comoros': 'Moroni', 'itsandra': 'Moroni',
        'mombasa hinterland': 'Moroni',
        'anjouan island': 'Mutsamudu', 'mutsamudu': 'Mutsamudu',
        'fomboni moheli': 'Fomboni', 'moheli island': 'Fomboni',
        'mwali island': 'Fomboni', 'ngazidja island': 'Moroni',
        'ndzuani island': 'Mutsamudu', 'domoni anjouan': 'Domoni',
        'sima anjouan': 'Sima', 'foumbouni': 'Foumbouni',
        'mitsamiouli': 'Mitsamiouli',
        // ── extended coverage ──
        'moroni centre': 'Moroni', 'grande comore': 'Moroni',
        'ngazidja': 'Moroni', 'chomoni': 'Moroni',
        'moheli': 'Fomboni', 'fomboni': 'Fomboni',
        'anjouan': 'Mutsamudu', 'domoni': 'Domoni',
        'mount karthala': 'Moroni', 'iconi': 'Moroni',
    },
    // ── Western Sahara ────────────────────────────────────────────────────────
    EH: {
        'laayoune city': 'Laâyoune', 'laâyoune': 'Laâyoune',
        'dakhla western sahara': 'Dakhla',
        // ── extended coverage ──
        'laayoune centre': 'Laâyoune', 'el aaiun': 'Laâyoune',
        'dakhla bay': 'Dakhla', 'foum el oued': 'Laâyoune',
        'boujdour': 'Boujdour', 'smara': 'Smara',
        'aousserd': 'Aousserd', 'pk25 dakhla': 'Dakhla',
        'la sarga': 'Dakhla',
    },
    // ── Lebanon ───────────────────────────────────────────────────────────────
    LB: {
        // Beirut districts
        'hamra': 'Beirut', 'gemmayzeh': 'Beirut', 'mar mikhael': 'Beirut',
        'achrafieh': 'Beirut', 'verdun': 'Beirut', 'ras beirut': 'Beirut',
        'badaro': 'Beirut', 'rmeil': 'Beirut', 'saifi village': 'Beirut',
        'sodeco': 'Beirut', 'monot': 'Beirut', 'gemmayze': 'Beirut',
        'sin el fil': 'Beirut', 'hazmieh': 'Beirut', 'jal el dib': 'Beirut',
        'bourj hammoud': 'Beirut', 'corniche beirut': 'Beirut',
        'downtown beirut': 'Beirut', 'solidere': 'Beirut', 'zaitunay bay': 'Beirut',
        // Other Lebanese cities
        'jounieh': 'Jounieh', 'kaslik': 'Jounieh', 'byblos': 'Byblos', 'jbeil': 'Byblos',
        'tripoli lebanon': 'Tripoli', 'mina tripoli': 'Tripoli',
        'sidon': 'Sidon', 'saida': 'Sidon',
        'tyre': 'Tyre', 'sour': 'Tyre',
        'baalbek': 'Baalbek', 'temple of bacchus area': 'Baalbek',
        'zahle': 'Zahle', 'broummana': 'Broummana', 'beit mery': 'Beit Mery',
        'faraya': 'Faraya', 'mzaar ski': 'Faraya', 'faqra': 'Faraya',
        'ehden': 'Ehden', 'bcharreh': 'Bcharre', 'qadisha valley': 'Bcharre',
        'beiteddine': 'Deir el Qamar', 'deir el qamar': 'Deir el Qamar',
        'batroun': 'Batroun', 'jezzine': 'Jezzine',
        // More Beirut neighborhoods
        'mar elias': 'Beirut', 'choueifat': 'Beirut', 'chiyah': 'Beirut',
        'haret hreik': 'Beirut', 'ain el mreisseh': 'Beirut', 'raouche': 'Beirut',
        'tallet el khayat': 'Beirut', 'koraytem': 'Beirut', 'manara': 'Beirut',
        'ashrafieh': 'Beirut', 'furn el chebbak': 'Beirut', 'dekwaneh': 'Beirut',
        'sin el fil beirut': 'Beirut', 'antelias': 'Beirut',
        'dbayeh': 'Beirut', 'zouk mikael': 'Jounieh', 'zouk mosbeh': 'Jounieh',
        'harissa shrine': 'Jounieh', 'jeita grotto': 'Jounieh',
        // North Lebanon
        'zgharta': 'Zgharta', 'amioun': 'Amioun', 'bcharre': 'Bcharre',
        'akkar': 'Akkar', 'halba': 'Halba',
        'tripoli el mina': 'Tripoli', 'al mina tripoli': 'Tripoli',
        'bab el tabbaneh': 'Tripoli', 'koura lebanon': 'Amioun',
        // South Lebanon
        'nabatieh': 'Nabatieh', 'marjayoun': 'Marjayoun',
        'bint jbeil': 'Bint Jbeil', 'tyre beach': 'Tyre',
        'al bass tyre': 'Tyre', 'maghdouche': 'Sidon',
        // Bekaa Valley
        'chtaura': 'Chtaura', 'anjar ruins': 'Anjar', 'anjar bekaa': 'Anjar',
        'deir el ahmar': 'Baalbek', 'yammouneh lake': 'Baalbek',
        'qaraoun lake': 'Zahle', 'west bekaa': 'Zahle',
        // Mountain villages
        'aley': 'Aley', 'bhamdoun': 'Aley', 'sofar': 'Aley',
        'dhour el choueir': 'Broummana', 'bikfaya': 'Broummana',
        'ajaltoun': 'Jounieh', 'kfardebian': 'Faraya',
        'laklouk': 'Bcharre', 'the cedars': 'Bcharre',
        // Arabic language names
        'بيروت': 'Beirut', 'طرابلس': 'Tripoli', 'صيدا': 'Sidon',
        'صور': 'Tyre', 'بعلبك': 'Baalbek', 'زحلة': 'Zahle',
        'جبيل': 'Byblos', 'جونيه': 'Jounieh', 'لبنان': 'Beirut',
    },
    // ── Palestine ─────────────────────────────────────────────────────────────
    PS: {
        'old city jerusalem': 'Jerusalem', 'muslim quarter': 'Jerusalem',
        'christian quarter': 'Jerusalem', 'jewish quarter': 'Jerusalem',
        'armenian quarter': 'Jerusalem', 'mount of olives': 'Jerusalem',
        'ramallah': 'Ramallah', 'al bireh': 'Ramallah', 'beitunia': 'Ramallah',
        'bethlehem city': 'Bethlehem', 'beit sahour': 'Bethlehem',
        'beit jala': 'Bethlehem', 'manger square': 'Bethlehem',
        'nablus': 'Nablus', 'jericho': 'Jericho',
        'hebron city': 'Hebron', 'al khalil': 'Hebron',
        'jenin city': 'Jenin', 'tulkarm': 'Tulkarm', 'qalqilya': 'Qalqilya',
        'gaza city': 'Gaza', 'rafah': 'Rafah', 'khan yunis': 'Khan Yunis',
        // More Gaza Strip
        'jabalia': 'Gaza', 'beit hanoun': 'Gaza', 'beit lahiya': 'Gaza',
        'deir al balah': 'Deir al-Balah', 'nuseirat': 'Deir al-Balah',
        // More West Bank
        'salfit': 'Salfit', 'tubas': 'Tubas', 'ariha': 'Jericho',
        'halhul': 'Hebron', 'dura hebron': 'Hebron',
        'yatta': 'Hebron', 'beit ummar': 'Hebron',
        'anabta': 'Tulkarm', 'beit iba': 'Nablus',
        // Key landmarks
        'church of nativity': 'Bethlehem', 'nativity church': 'Bethlehem',
        'ibrahimi mosque': 'Hebron', 'al-aqsa area': 'Jerusalem',
        'dome of the rock': 'Jerusalem',
        // Arabic language names
        'فلسطين': 'Ramallah', 'القدس': 'Jerusalem', 'غزة': 'Gaza',
        'رام الله': 'Ramallah', 'بيت لحم': 'Bethlehem', 'الخليل': 'Hebron',
        'نابلس': 'Nablus', 'أريحا': 'Jericho', 'جنين': 'Jenin',
    },
    // ── Bhutan ────────────────────────────────────────────────────────────────
    BT: {
        'thimphu city': 'Thimphu', 'chang lam': 'Thimphu', 'norzin lam': 'Thimphu',
        'paro valley': 'Paro', 'paro dzong': 'Paro', 'tiger nest area': 'Paro',
        'taktsang monastery': 'Paro',
        'punakha valley': 'Punakha', 'punakha dzong': 'Punakha',
        'bumthang': 'Bumthang', 'jakar': 'Bumthang', 'trongsa': 'Trongsa',
        'phuentsholing': 'Phuntsholing', 'gelephu': 'Gelephu',
        'haa valley': 'Haa', 'trashigang': 'Trashigang',
        // Bhutan extras
        'samdrup jongkhar': 'Samdrup Jongkhar', 'wangdue phodrang': 'Wangdue Phodrang',
        'phobjikha valley': 'Wangdue Phodrang', 'gangtey': 'Gangtey',
        'dochula pass': 'Thimphu', 'chelela pass': 'Haa',
        'sopsokha village': 'Punakha', 'lobesa': 'Punakha',
        'thimphu dzong': 'Thimphu', 'paro airport area': 'Paro',
        // More dzongs and monasteries
        'rinpung dzong': 'Paro', 'kyichu lhakhang': 'Paro',
        'drukgyel dzong': 'Paro', 'tachog lhakhang': 'Paro',
        'trongsa dzong': 'Trongsa', 'chumey valley': 'Bumthang',
        'ura valley': 'Bumthang', 'tang valley': 'Bumthang',
        'chimi lhakhang': 'Punakha', 'khamsum temple': 'Punakha',
        'sangchhen dorji': 'Punakha', 'nalanda institute': 'Punakha',
        'lhuntse dzong': 'Lhuntse', 'mongar bhutan': 'Mongar',
        'zhemgang': 'Zhemgang', 'sarpang': 'Sarpang',
        'phuentsholing city': 'Phuntsholing', 'gelephu city': 'Gelephu',
        // Treks / passes
        'snowman trek': 'Thimphu', 'jomolhari trek': 'Paro',
        'druk path trek': 'Thimphu', 'bumdra trek': 'Paro',
        'nabji trail': 'Trongsa', 'royal manas park': 'Sarpang',
        // Dzongkha/Latin names
        'bhutan': 'Thimphu', 'druk yul': 'Thimphu',
        'kingdom of bhutan': 'Thimphu',
        // ── extended coverage ──
        'thimphu centre': 'Thimphu', 'buddha dordenma': 'Thimphu',
        'tashichho dzong': 'Thimphu', 'tigers nest': 'Paro',
        'taktsang': 'Paro', 'paro airport': 'Paro',
        'punakha': 'Punakha', 'phobjikha': 'Gangtey',
        'haa': 'Haa', 'dochula': 'Thimphu',
        'chele la': 'Paro',
    },
    // ── Timor-Leste ───────────────────────────────────────────────────────────
    TL: {
        'dili city': 'Dili', 'colmera': 'Dili', 'farol dili': 'Dili',
        'motael': 'Dili', 'comoro dili': 'Dili',
        'baucau': 'Baucau', 'maliana': 'Maliana', 'same timor': 'Same',
        'los palos': 'Los Palos', 'viqueque': 'Viqueque',
        'suai': 'Suai', 'aileu': 'Aileu', 'maubisse': 'Maubisse',
        'ermera': 'Ermera', 'liquica': 'Liquiça',
        'atauro island': 'Atauro',
        // More Dili areas
        'cristo rei dili': 'Dili', 'bidau dili': 'Dili',
        'nain feto': 'Dili', 'dom aleixo': 'Dili',
        'vera cruz dili': 'Dili', 'delta dili': 'Dili',
        // More Timor-Leste towns
        'gleno ermera': 'Gleno', 'hatulia': 'Hatulia',
        'bobonaro': 'Bobonaro', 'cailaco': 'Cailaco',
        'ainaro': 'Ainaro', 'hato udo': 'Hato-Udo',
        'lautem': 'Lospalos', 'luro viqueque': 'Luro',
        'natarbora': 'Natarbora', 'soibada': 'Soibada',
        'manatuto': 'Manatuto', 'laclubar': 'Laclubar',
        'manufahi': 'Same', 'fatumean': 'Fatumean',
        // ── extended coverage ──
        'dili centre': 'Dili', 'areia branca': 'Dili',
        'atauro': 'Atauro', 'com timor': 'Com',
        'jaco island': 'Tutuala', 'tutuala': 'Tutuala',
        'lospalos': 'Lospalos', 'mount ramelau': 'Hato Builico',
        'oecusse': 'Pante Macassar', 'balibo': 'Balibo',
    },
    // ── Gibraltar ─────────────────────────────────────────────────────────────
    GI: {
        'main street gibraltar': 'Gibraltar', 'casemates square': 'Gibraltar',
        'catalan bay': 'Gibraltar', 'europa point': 'Gibraltar',
        'rock of gibraltar': 'Gibraltar', 'ocean village': 'Gibraltar',
        'westside gibraltar': 'Gibraltar', 'south district': 'Gibraltar',
        // ── extended coverage ──
        'gibraltar town': 'Gibraltar', 'upper rock': 'Gibraltar',
        'sandy bay gibraltar': 'Gibraltar', 'queensway quay': 'Gibraltar',
        'marina bay gibraltar': 'Gibraltar', 'irish town': 'Gibraltar',
        'st michaels cave': 'Gibraltar', 'the rock': 'Gibraltar',
    },
    // ── Isle of Man ───────────────────────────────────────────────────────────
    IM: {
        'douglas iom': 'Douglas', 'strand street': 'Douglas',
        'peel isle of man': 'Peel', 'ramsey iom': 'Ramsey',
        'castletown': 'Castletown', 'port erin': 'Port Erin',
        'laxey': 'Laxey', 'snaefell': 'Laxey',
        // ── extended coverage ──
        'douglas promenade': 'Douglas', 'onchan': 'Douglas',
        'port st mary': 'Port St Mary', 'ballasalla': 'Ballasalla',
        'isle of man airport': 'Ballasalla', 'ramsey isle of man': 'Ramsey',
        'peel iom': 'Peel', 'st johns iom': 'St Johns',
        'kirk michael': 'Kirk Michael', 'tt course': 'Douglas',
    },
    // ── Falkland Islands ──────────────────────────────────────────────────────
    FK: {
        'stanley falklands': 'Stanley', 'port stanley': 'Stanley',
        'west falkland': 'Fox Bay', 'fox bay': 'Fox Bay',
        'mount pleasant': 'Mount Pleasant',
    },
    // ── Romania extras ───────────────────────────────────────────────────────
    // RO already defined above, extending
    // ── Croatia extras ───────────────────────────────────────────────────────
    // HR already defined above, extending
    // ── Slovakia extras ──────────────────────────────────────────────────────
    // SK already defined above, extending
    // ── Denmark extras ───────────────────────────────────────────────────────
    // DK already defined above, extending
    // ── Belgium extras ───────────────────────────────────────────────────────
    // BE already defined above, extending
    // ── NL extras ────────────────────────────────────────────────────────────
    // NL already defined above, extending
    // ── AT extras ────────────────────────────────────────────────────────────
    // AT already defined above, extending
    // ── CH extras ────────────────────────────────────────────────────────────
    // CH already defined above, extending
    // ── PT extras ────────────────────────────────────────────────────────────
    // PT already defined above, extending
    // ── GR extras ────────────────────────────────────────────────────────────
    // GR already defined above, extending
    // ── Iraq extras ───────────────────────────────────────────────────────────
    // IQ already defined above, extending with more districts
    // ── Iran extras ───────────────────────────────────────────────────────────
    // IR already defined above, extending with more cities
    // ── Extra South Asia ──────────────────────────────────────────────────────
    // ── Myanmar expanded ──────────────────────────────────────────────────────
    // MM already defined above
    // ── South Korea district expansions ───────────────────────────────────────
    // KR already defined above, extending with more areas
    // ── China extra districts ─────────────────────────────────────────────────
    // CN already defined above, extending with more areas
    // ── More Pacific / Oceania ────────────────────────────────────────────────
    // ── More Central America ──────────────────────────────────────────────────
    // ── Extra West Africa ─────────────────────────────────────────────────────
    // ── Extra East Africa ─────────────────────────────────────────────────────
    // ── Extra Southern Africa ─────────────────────────────────────────────────
    // ── Extra Caribbean ───────────────────────────────────────────────────────
    // ── Extra South America ───────────────────────────────────────────────────

    // ── Libya expanded ────────────────────────────────────────────────────────
    // LY already defined, extending
    // ── Sudan extras ──────────────────────────────────────────────────────────
    // SD already defined, extending
    // ── Tunisia extras ────────────────────────────────────────────────────────
    // TN already defined, extending
    // ── Morocco extras ────────────────────────────────────────────────────────
    // MA already defined, extending

    // ── Countries rarely represented ──────────────────────────────────────────
    NU: {
        'alofi': 'Alofi',
    },
    TK: {
        'fakaofo': 'Fakaofo', 'nukunonu': 'Nukunonu', 'atafu': 'Atafu',
    },
    WF: {
        'mata utu': 'Mata Utu',
    },
    // ── Jersey ─────────────────────────────────────────────────────────────
    JE: {
        'st helier': 'Saint Helier', 'saint helier': 'Saint Helier',
        'st brelade': 'Saint Brelade',
        // ── extended coverage ──
        'jersey st helier': 'Saint Helier', 'st aubin': 'Saint Brelade',
        'st brelades bay': 'Saint Brelade', 'gorey': 'Grouville',
        'grouville': 'Grouville', 'st ouen': 'Saint Ouen',
        'st clement': 'Saint Clement', 'st saviour jersey': 'Saint Saviour',
        'trinity jersey': 'Trinity', 'st martin jersey': 'Saint Martin',
        'jersey airport': 'Saint Peter', 'st peter jersey': 'Saint Peter',
        'liberation square': 'Saint Helier', 'mont orgueil': 'Grouville',
    },
    // ── Guernsey ─────────────────────────────────────────────────────────────
    GG: {
        'st peter port': 'Saint Peter Port', 'saint peter port': 'Saint Peter Port',
        // ── extended coverage ──
        'st martins guernsey': 'Saint Martin', 'st sampson': 'Saint Sampson',
        'vale guernsey': 'Vale', 'castel guernsey': 'Castel',
        'torteval': 'Torteval', 'st saviour guernsey': 'Saint Saviour',
        'forest guernsey': 'Forest', 'guernsey airport': 'Forest',
        'castle cornet': 'Saint Peter Port', 'sark': 'Sark',
        'herm': 'Herm', 'alderney': 'Saint Anne',
        'st anne alderney': 'Saint Anne',
    },
    // ── More African cities ───────────────────────────────────────────────────
    // ── Extra ZA (South Africa) ───────────────────────────────────────────────
    // ZA already defined above
    // ── Extra KE (Kenya) ─────────────────────────────────────────────────────
    // KE already defined above
    // ── Extra TZ (Tanzania) ──────────────────────────────────────────────────
    // TZ already defined above
    // ── Extra NG (Nigeria) ───────────────────────────────────────────────────
    // NG already defined above
    // ── Extra GH (Ghana) ─────────────────────────────────────────────────────
    // GH already defined above

    // ── Extra Caribbean entries ───────────────────────────────────────────────
    // ── Trinidad & Tobago extras ──────────────────────────────────────────────
    // TT already defined
    // ── Extra Cuba entries ────────────────────────────────────────────────────
    // CU already defined
    // ── Extra Jamaica entries ─────────────────────────────────────────────────
    // JM already defined

    // ── Extra US states / cities ──────────────────────────────────────────────
    // US already defined above, keeping
    // ── Extra Canada ──────────────────────────────────────────────────────────
    // CA already defined above, keeping

    // ── Extra IT (Italy) entries ──────────────────────────────────────────────
    // IT already defined above, keeping
    // ── Extra DE (Germany) entries ────────────────────────────────────────────
    // DE already defined above, keeping
    // ── Extra FR (France) entries ─────────────────────────────────────────────
    // FR already defined above, keeping
    // ── Extra ES (Spain) entries ──────────────────────────────────────────────
    // ES already defined above, keeping
    // ── Extra JP (Japan) entries ──────────────────────────────────────────────
    // JP already defined above, keeping
    // ── Extra CN (China) entries ──────────────────────────────────────────────
    // CN already defined above, keeping

    // ── More KH (Cambodia) district entries ──────────────────────────────────
    // KH already defined above, keeping
    // ── More LA (Laos) district entries ──────────────────────────────────────
    // LA already defined above, keeping
    // ── More NP (Nepal) district entries ─────────────────────────────────────
    // NP already defined above, keeping
    // ── More BD (Bangladesh) district entries ─────────────────────────────────
    // BD already defined above, keeping
    // ── More LK (Sri Lanka) district entries ──────────────────────────────────
    // LK already defined above, keeping
    // ── More PK (Pakistan) district entries ───────────────────────────────────
    // PK already defined above, keeping

    // ── South Africa extra suburbs ─────────────────────────────────────────────
    // ZA extras — Joburg suburbs
    // Note: ZA already defined above; inserting nested here causes TS1117.
    // All new ZA entries belong in a new-country-style block; we use a workaround
    // by extending via an extra non-duplicate block below.

    // ── Brazil extra cities/neighborhoods ─────────────────────────────────────
    // BR already defined; new entries added via separate key-value pairs at the
    // end using unique aliases that don't conflict.

    // ── More Colombia ──────────────────────────────────────────────────────────
    // CO already defined; new aliases only.

    // ── Venezuela, Bolivia, Paraguay extras ───────────────────────────────────
    // VE, BO, PY already defined above. Their entries are in their respective sections.

    // ── More DE (Germany) neighborhoods ───────────────────────────────────────
    // (Germany section already defined; these unique aliases add more coverage)
    // Hamburg extra neighborhoods
    // Munich extra neighborhoods
    // Frankfurt extra neighborhoods
    // Berlin extra neighborhoods (these aren't yet in the main DE section per name)
    // We add them as a new entry point via a fake separate section... no that won't work.
    // Instead, adding an entirely new section for extra DE content is not possible
    // since DE is already defined. We would need to edit the DE section directly.
    // So this is a placeholder comment. DE edits must be done inside the existing block.

    // ── Sweden extra cities ────────────────────────────────────────────────────
    // SE already defined; new aliases below via SE2 does not work. Skipping.

    // ── More IQ (Iraq) cities ─────────────────────────────────────────────────
    // IQ already defined. New entries must be added within the existing block.

    // ── Rwanda extra areas ─────────────────────────────────────────────────────
    // RW already defined. New entries must be added within the existing block.

    // ── More MZ (Mozambique) ──────────────────────────────────────────────────
    // MZ already defined. New entries must be added within the existing block.

    // ── More NA (Namibia) ─────────────────────────────────────────────────────
    // NA already defined. New entries must be added within the existing block.

    // ── More BW (Botswana) ────────────────────────────────────────────────────
    // BW already defined. New entries must be added within the existing block.

    // ── More SN (Senegal) ─────────────────────────────────────────────────────
    // SN already defined. New entries must be added within the existing block.

    // ── More CI (Ivory Coast) ─────────────────────────────────────────────────
    // CI already defined. New entries must be added within the existing block.

    // ── More CM (Cameroon) ────────────────────────────────────────────────────
    // CM already defined. New entries must be added within the existing block.

    // ── More SL (Sierra Leone) ────────────────────────────────────────────────
    // SL already defined. New entries must be added within the existing block.

    // ── More AO (Angola) ──────────────────────────────────────────────────────
    // AO already defined. New entries must be added within the existing block.

    // ── More ZM (Zambia) ──────────────────────────────────────────────────────
    // ZM already defined. New entries must be added within the existing block.

    // ── More ZW (Zimbabwe) ────────────────────────────────────────────────────
    // ZW already defined. New entries must be added within the existing block.

    // ── More MG (Madagascar) ──────────────────────────────────────────────────
    // MG already defined. New entries must be added within the existing block.

    // ── Montserrat ────────────────────────────────────────────────────────────
    MS: {
        'plymouth montserrat': 'Plymouth', 'little bay montserrat': 'Little Bay',
        'brades montserrat': 'Brades', 'st johns montserrat': 'Saint John\'s',
        'foxes bay': 'Brades', 'old towne montserrat': 'Old Towne',
        'cudjoe head': 'Cudjoe Head', 'davy hill': 'Davy Hill',
        'long ground': 'Long Ground', 'harris montserrat': 'Harris',
        'gerald s airport area': 'Brades', 'soufriere hills': 'Plymouth',
        'montserrat island': 'Brades', 'exclusion zone montserrat': 'Plymouth',
        // ── extended coverage ──
        'brades': 'Brades', 'salem montserrat': 'Salem',
        'olveston': 'Olveston', 'woodlands montserrat': 'Woodlands',
    },
    // ── Haiti expanded ────────────────────────────────────────────────────────
    // HT already has base entries — adding more neighborhoods and cities
    // ── Saint Barthelemy ──────────────────────────────────────────────────────
    BL: {
        'gustavia': 'Gustavia', 'gustavia harbor': 'Gustavia',
        'st barts': 'Gustavia', 'saint barthelemy': 'Gustavia',
        'st jean beach': 'Saint-Jean', 'st jean st barts': 'Saint-Jean',
        'lorient st barts': 'Lorient', 'saline beach': 'Saint-Louis',
        'flamands beach': 'Flamands', 'gouverneur beach': 'Gustavia',
        'shell beach st barts': 'Gustavia', 'toiny': 'Toiny',
        'grand cul de sac': 'Grand-Cul-de-Sac', 'grand fond st barts': 'Grand-Fond',
        'corossol st barts': 'Corossol', 'colombier beach': 'Colombier',
        'lurin st barts': 'Lurin', 'morne rouge st barts': 'Gustavia',
        // ── extended coverage ──
        'st barths': 'Gustavia', 'saint jean st barth': 'Saint Jean',
        'flamands': 'Flamands', 'lorient st barth': 'Lorient',
        'colombier st barth': 'Colombier',
    },
    // ── Sint Eustatius ────────────────────────────────────────────────────────
    BQ: {
        'oranjestad st eustatius': 'Oranjestad', 'statia island': 'Oranjestad',
        'saba island': 'The Bottom', 'the bottom saba': 'The Bottom',
        'windwardside saba': 'Windwardside', 'mt scenery saba': 'Windwardside',
        'bonaire island': 'Kralendijk', 'kralendijk': 'Kralendijk',
        'sorobon beach': 'Kralendijk', 'lac bay bonaire': 'Lac',
        // ── extended coverage ──
        'bonaire': 'Kralendijk', 'rincon bonaire': 'Rincon',
        'sorobon': 'Kralendijk', 'lac bay': 'Kralendijk',
        'washington slagbaai': 'Rincon', 'klein bonaire': 'Kralendijk',
        'oranjestad statia': 'Oranjestad', 'sint eustatius': 'Oranjestad',
        'the bottom': 'The Bottom', 'saba': 'The Bottom',
        'windwardside': 'Windwardside',
    },
    // ── American Samoa ────────────────────────────────────────────────────────
    AS: {
        'pago pago': 'Pago Pago', 'fagatogo': 'Pago Pago',
        'leone american samoa': 'Leone', 'nu uuli': 'Nu\'uuli',
        'tafuna': 'Tafuna', 'ili ili': 'Ili\'ili',
        'fagaitua': 'Fagaitua', 'ofu island': 'Ofu',
        'olosega island': 'Olosega', 'tau island': 'Fitiuta',
        'rose atoll': 'Rose Atoll', 'swains island': 'Swains Island',
        // ── extended coverage ──
        'utulei': 'Pago Pago', 'vatia': 'Vatia',
        'ofu': 'Ofu', 'olosega': 'Olosega',
        'tau american samoa': 'Tau', 'aunuu': 'Aunuu',
        'alega': 'Pago Pago', 'mount alava': 'Pago Pago',
    },
    // ── Northern Mariana Islands ──────────────────────────────────────────────
    MP: {
        'saipan island': 'Saipan', 'garapan': 'Garapan', 'chalan kanoa': 'Saipan',
        'beach road saipan': 'Saipan', 'susupe saipan': 'Saipan',
        'rota island cnmi': 'Rota', 'songsong rota': 'Songsong',
        'tinian island cnmi': 'Tinian', 'san jose tinian': 'San Jose',
        'capitol hill saipan': 'Capitol Hill',
        // ── extended coverage ──
        'saipan': 'Garapan', 'micro beach': 'Garapan',
        'managaha': 'Garapan', 'tinian': 'San Jose',
        'rota northern marianas': 'Songsong', 'songsong': 'Songsong',
        'susupe': 'Susupe', 'san antonio saipan': 'San Antonio',
        'marpi': 'Garapan', 'banzai cliff': 'Garapan',
        'grotto saipan': 'Garapan',
    },
    // ── Guam ──────────────────────────────────────────────────────────────────
    GU: {
        'hagatna': 'Hagåtña', 'agana guam': 'Hagåtña', 'hagåtña': 'Hagåtña',
        'tamuning': 'Tamuning', 'tumon bay': 'Tumon', 'tumon guam': 'Tumon',
        'dededo': 'Dededo', 'yigo guam': 'Yigo', 'barrigada': 'Barrigada',
        'mangilao': 'Mangilao', 'sinajana': 'Sinajana',
        'chalan pago': 'Chalan Pago', 'ordot guam': 'Ordot',
        'ipan guam': 'Talofofo', 'merizo': 'Merizo', 'umatac': 'Umatac',
        'agat guam': 'Agat', 'santa rita guam': 'Santa Rita',
        'piti guam': 'Piti', 'asan guam': 'Asan', 'yona guam': 'Yona',
        // ── extended coverage ──
        'tumon': 'Tumon', 'agana': 'Hagåtña',
        'yigo': 'Yigo', 'two lovers point': 'Tumon',
        'ypao beach': 'Tumon', 'asan': 'Asan',
        'piti': 'Piti', 'agat': 'Agat',
        'inarajan': 'Inarajan', 'talofofo': 'Talofofo',
        'ritidian': 'Yigo',
    },
    // ── BT/MM/IQ/SY/YE/VU already defined above ──────────────────────────────

    // ── Vatican City ──────────────────────────────────────────────────────────
    VA: {
        'vatican city': 'Vatican City', 'st peters square': 'Vatican City',
        'sistine chapel': 'Vatican City', 'piazza san pietro': 'Vatican City',
        'castel gandolfo': 'Castel Gandolfo',
    },
    // ── Saint Pierre and Miquelon ─────────────────────────────────────────────
    PM: {
        'saint pierre island': 'Saint-Pierre', 'miquelon island': 'Miquelon',
        'saint pierre miquelon': 'Saint-Pierre',
    },
    // ── Saint Helena ──────────────────────────────────────────────────────────
    SH: {
        'jamestown saint helena': 'Jamestown', 'longwood saint helena': 'Longwood',
        'ascension island': 'Georgetown', 'tristan da cunha': 'Edinburgh of the Seven Seas',
    },
    // ── Svalbard (Norway) ─────────────────────────────────────────────────────
    SJ: {
        'longyearbyen': 'Longyearbyen', 'barentsburg': 'Barentsburg',
        'ny alesund': 'Ny-Ålesund', 'pyramiden': 'Pyramiden',
        // ── extended coverage ──
        'svalbard': 'Longyearbyen', 'spitsbergen': 'Longyearbyen',
        'longyearbyen centre': 'Longyearbyen', 'adventdalen': 'Longyearbyen',
        'isfjorden': 'Longyearbyen', 'svalbard airport': 'Longyearbyen',
        'jan mayen': 'Olonkinbyen',
    },
    // ── Åland Islands (Finland) ───────────────────────────────────────────────
    AX: {
        'mariehamn': 'Mariehamn', 'aland islands': 'Mariehamn',
        'eckerö åland': 'Eckerö', 'hammarland': 'Hammarland',
        // ── extended coverage ──
        'mariehamn centre': 'Mariehamn', 'aland': 'Mariehamn',
        'jomala': 'Jomala', 'finstrom': 'Finstrom',
        'saltvik': 'Saltvik', 'sund aland': 'Sund',
        'kastelholm': 'Sund', 'lemland': 'Lemland',
        'foglo': 'Foglo', 'kumlinge': 'Kumlinge',
        'brando': 'Brando', 'geta': 'Geta',
    },
    // SX (Sint Maarten), MF (Saint Martin), XK (Kosovo) already defined above
    // ── More Philippines barangays (PH already defined above) ────────────────
    // PH block is already very comprehensive
    // ── Global Catch-Alls ─────────────────────────────────────────────────────
    // Generic English-language terms that users may search globally
    // (These are country-specific so each is in the right country block above)
    // This section is intentionally empty — all entries live in country blocks
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
    // Confirmed against live hotel_content: ETG/OTV (German OTA) stores these under German names.
    'Tokyo|JP':                     'Tokio',       // 500 DB rows as "Tokio", 1 as "Tokyo"
    'Beijing|CN':                   'Peking',      // 500 as "Peking", 2 as "Beijing"
    'Cape Town|ZA':                 'Kapstadt',    // 500 as "Kapstadt", 1 as "Cape Town"
    'New Delhi|IN':                 'Neu Delhi',   // 500 as "Neu Delhi", 1 as "New Delhi"
    'Lviv|UA':                      'Lemberg',     // 86 as "Lemberg", 0 as "Lviv"
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
    'Baguio City|PH':               'Baguio',
    'Angeles City|PH':              'Angeles',
    'Cagayan de Oro City|PH':       'Cagayan de Oro',
    'General Santos City|PH':       'General Santos',
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
    'Marrakech|MA':                 'Marrakesch',
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
    'Warsaw|PL':                    'Warschau',
    'Bucharest|RO':                 'Bukarest',
    'Tbilisi|GE':                   'Tiflis',
    'Yerevan|AM':                   'Jerewan',
    'Tashkent|UZ':                  'Taschkent',
    'Macau|MO':                     'Macao',
    'Kathmandu|NP':                 'Katmandu',
    // ── German names for Polish cities (ETG uses historical German names) ────
    'Wroclaw|PL':                   'Breslau',     // 469 as "Breslau", 2 as "Wroclaw"
    'Wrocław|PL':                   'Breslau',     // Polish spelling variant
    'Poznan|PL':                    'Posen',       // 369 as "Posen", 0 as "Poznan"
    'Poznań|PL':                    'Posen',       // Polish spelling variant
    'Szczecin|PL':                  'Stettin',     // 219 as "Stettin", 15 as "Szczecin"
    'Bydgoszcz|PL':                 'Bromberg',    // 162 as "Bromberg", 1 as "Bydgoszcz"
    // ── Kazakhstan capital (ETG uses old name "Astana") ───────────────────
    'Nur-Sultan|KZ':                'Astana',      // renamed back to Astana 2022; ETG still uses "Astana"
    // ── Indian city alternate names ───────────────────────────────────────
    'Trivandrum|IN':                'Thiruvananthapuram', // 211 as "Thiruvananthapuram", 0 as "Trivandrum"
    'Calicut|IN':                   'Kozhikode',   // 89 as "Kozhikode", 0 as "Calicut"
    // ── German names for German cities ──────────────────────────────────────
    'Munich|DE':                    'München',
    'Cologne|DE':                   'Köln',
    'Dusseldorf|DE':                'Düsseldorf',
    'Nuremberg|DE':                 'Nürnberg',
    'Lubeck|DE':                    'Lübeck',
    // ── German names for French/Italian/Greek cities ─────────────────────────
    'Nice|FR':                      'Nizza',
    'Strasbourg|FR':                'Straßburg',
    'Genoa|IT':                     'Genua',
    'Milan|IT':                     'Mailand',
    'Venice|IT':                    'Venedig',
    'Florence|IT':                  'Florenz',
    'Naples|IT':                    'Neapel',
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
    'Sarajevo|BA':                  'Sarajewo',
    'Muscat|OM':                    'Maskat',
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
    'Lisbon|PT':                    'Lissabon',
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
    'Sao Paulo|BR':                 'São Paulo',
    'Buzios|BR':                    'Armação dos Búzios',
    'Cusco|PE':                     'Cuzco',
    'Asuncion|PY':                  'Asunción (und Umgebung)',
    'Cordoba|AR':                   'Córdoba',
    // ── Asian name variants ──────────────────────────────────────────────────
    'Bangalore|IN':                 'Bengaluru',
    'Ahmedabad|IN':                 'Ahmadabad',
    'Kolkata|IN':                   'Kalkutta',
    'Ooty|IN':                      'Udagamandalam',
    'Jorhat|IN':                    'Jorhãt',
    'Incheon|KR':                   "Inch'on",
    // Found by scripts/city-spelling-candidates.mjs against real search demand —
    // each was searched for and returned nothing at all.
    'Fez|MA':                       'Fès',            // 354 hotels, French spelling
    'Alcudia|ES':                   'Alcúdia',        // 330 hotels, Catalan accent
    'Quebec City|CA':               'Québec',         // 192 hotels
    'Quebec|CA':                    'Québec',
    'Taipei|TW':                    'Taipeh',         // 697 hotels, German spelling
    'San Jose|US':                  'San José',       // 104 hotels
    'Koh Samui|TH':                 'Ko Samui',       // 1,182 hotels
    'Can Tho|VN':                   'Cân Tho',        // 184 hotels
    'Grindavik|IS':                 'Grindavík',
    'Goa|IN':                       'Süd-Goa',
    'Dar es Salaam|TZ':             'Daressalam',
    'Zanzibar|TZ':                  'Sansibar',
    'Bali|ID':                      'Kuta',
    'Lombok|ID':                    'Mataram',
    'Koh Tao|TH':                   'Ko Tao',
    'Johor Bahru|MY':               'Johore Baharu',
    'Penang|MY':                    'George Town',
    'Vung Tau|VN':                  'Vung Tàu',
    // ── Other name variants ──────────────────────────────────────────────────
    'Larnaca|CY':                   'Larnaka',
    'Nicosia|CY':                   'Nikosia',     // 118 as "Nikosia", 32 as "Nicosia", 27 as "North Nicosia"
    'St. Paul|MT':                  "St. Paul's Bay",
    'Parnu|EE':                     'Pärnu',
    'Reykjavik|IS':                 'Reykjavík',
    'Mauritius|MU':                 'Grand Baie',
    'Saint Petersburg|US':          'St. Petersburg',
};

/**
 * Cities the catalog stores under more than one spelling at once.
 *
 * HOTEL_DB_CITY_MAP maps a canonical name to *one* DB value, which is right when
 * a supplier consistently uses a single localization ("Tokio", "Rom"). It is
 * wrong when several coexist, and several often do: Seoul is filed as both
 * `Seoul` (1,094 hotels) and `Seúl` (936), so mapping it either way hid roughly
 * half the city's inventory from a city-scoped search. Beijing has the same
 * split — `Peking` 4,136 against `Beijing` 964.
 *
 * Each entry lists every spelling to search, including the canonical one.
 *
 * These were confirmed by hand, not derived. `scripts/city-spelling-candidates.mjs`
 * finds candidates by clustering catalog cities on hotel centroid and name
 * similarity, but its precision is about one in two: it cannot tell `Seoul`/`Seúl`
 * apart from `Gili Air`/`Gili Meno`, two different Indonesian islands 2.9 km
 * apart whose names are equally alike. Auto-merging would trade a visible bug
 * (missing hotels) for an invisible one (wrong hotels), so the script reports and
 * a person decides.
 *
 * _Avoid_ adding a district here — `Chersonissos` and `Limenas Hersonissos` are a
 * town and its port, not two spellings. Sub-areas belong in CITY_ALIASES.
 */
export const HOTEL_DB_CITY_SYNONYMS: Record<string, string[]> = {
    'Seoul|KR':             ['Seoul', 'Seúl', 'Seoel'],   // Seoel seen in production, absent locally
    'Beijing|CN':           ['Peking', 'Beijing'],
    'Tokyo|JP':             ['Tokio', 'Tokyo'],
    'Athens|GR':            ['Athen', 'Athens'],
    'London|GB':            ['London', 'Londen'],
    'New Delhi|IN':         ['Neu Delhi', 'New Delhi'],
    'Haridwar|IN':          ['Haridwar', 'Haridwār'],
    'Jorhat|IN':            ['Jorhãt', 'Jorhat'],
    'Marrakesh|MA':         ['Marrakesh', 'Marrakesch'],
    // Three spellings, and the canonical is Kyiv — Mapbox returns the Ukrainian
    // transliteration, not the Russian one.
    'Kyiv|UA':              ['Kiew', 'Kiev', 'Kyiv'],
    'Lucerne|CH':           ['Luzern', 'Lucerne'],
    // The catalog holds almost nothing under the English name: 599 as "Singapur",
    // 45 in Cyrillic, 4 as "Singapore". Mapbox returns "Singapore", so without
    // this a search for the city reached 4 of its 648 hotels.
    'Singapore|SG':         ['Singapur', 'Сингапур', 'Singapore'],
    // "-stad" is Dutch for "town". Not a sub-area — the same island town under a
    // localized name, which is why the containment rule that correctly rejects
    // "Kerobokan Kelod" must not be trusted on its own.
    'Skiathos|GR':          ['Skiathos', 'Skiathos-stad'],
    'Ho Chi Minh City|VN':  ['Ho-Chi-Minh-Stadt', 'Ho Chi Minh City'],
    'Ha Long|VN':           ['Ha Long', 'Halong'],
};

/**
 * Every hotel_content city spelling to search for a canonical city name.
 *
 * Prefer this over `resolveHotelDbCity`: a city with two spellings needs both,
 * and picking one silently halves the results.
 */
// Both tables are written with cities capitalised as Mapbox returns them, but a
// city name reaches the resolver from several places — a URL, a stored search
// key, a supplier payload — and not all of them preserve case. A case-sensitive
// lookup fails silently and completely: "rome" misses `Rome|IT` and searches the
// catalog for a spelling that has no rows, so Rome returns nothing at all.
// Indexed once at module load rather than lower-casing on every call.
const DB_CITY_INDEX: Record<string, string[]> = (() => {
    const index: Record<string, string[]> = {};
    for (const [key, mapped] of Object.entries(HOTEL_DB_CITY_MAP)) {
        index[key.toLowerCase()] = [mapped];
    }
    // Synonyms win over the one-to-one map for the same city.
    for (const [key, spellings] of Object.entries(HOTEL_DB_CITY_SYNONYMS)) {
        index[key.toLowerCase()] = spellings;
    }
    return index;
})();

/**
 * Fold a district or neighbourhood onto the city whose inventory it sits in:
 * "Gangnam District" to Seoul, "Manhattan" to New York. Returns the input when
 * nothing matches.
 *
 * The same rule the search path applies to Mapbox output, exposed for callers
 * that start from a stored or user-typed name instead — the daily content
 * refresh reads `hotel_search_stats`, where "gangnam", "gangnam district" and
 * "seoul" are three separate rows competing for the same budget.
 *
 * Exact match first, then the longest whole-word prefix so "jamaica plain"
 * (Boston) beats the shorter "jamaica" (New York).
 */
export function resolveCanonicalCity(city: string, countryCode: string): string {
    const countryMap = CITY_ALIASES[countryCode.toUpperCase()];
    if (!countryMap) return city;

    const lower = city.toLowerCase().trim();
    if (countryMap[lower]) return countryMap[lower];

    const prefixKey = Object.keys(countryMap)
        .filter(key => lower.startsWith(key + ' ') || lower.startsWith(key + '-'))
        .sort((a, b) => b.length - a.length)[0];
    return prefixKey ? countryMap[prefixKey] : city;
}

export function resolveHotelDbCities(city: string, countryCode: string): string[] {
    const hit = DB_CITY_INDEX[`${city}|${countryCode}`.toLowerCase()];
    return hit ?? [city];
}

/** Resolve the canonical city name to its actual hotel_content DB value.
 *  Returns the input unchanged when no mapping exists.
 *  Prefer `resolveHotelDbCities` — this returns only the first of several
 *  spellings and will under-count any city the catalog files more than one way. */
export function resolveHotelDbCity(city: string, countryCode: string): string {
    return resolveHotelDbCities(city, countryCode)[0];
}

// ─── Query-side alias index ───────────────────────────────────────────────────
// CITY_ALIASES is normally applied to Mapbox's *output* (see fetchCitiesFromMapbox).
// That only works for places Mapbox actually returns. Some destinations are absent
// from its index entirely — "Clark" / "Clark Freeport" (PH) resolve to Clark, New
// Jersey no matter how the query is phrased, even with country=ph — so the alias
// never gets a chance to fire. This index matches the *user's raw query* instead,
// letting autocomplete suggest a destination Mapbox cannot find on its own.

export interface AliasMatch {
    /** The dict key that matched, e.g. 'clark'. */
    alias: string;
    /** The city the hotel search actually runs against, e.g. 'Angeles'. */
    canonicalCity: string;
    countryCode: string;
}

interface AliasIndexEntry extends AliasMatch { }

let _aliasIndex: AliasIndexEntry[] | null = null;

/** Flatten CITY_ALIASES into a single searchable list. Built once per process.
 *  Keys are lowercased here, so stray mixed-case entries (e.g. 'Clark') collapse
 *  onto their lowercase twin instead of sitting unreachable. */
function getAliasIndex(): AliasIndexEntry[] {
    if (_aliasIndex) return _aliasIndex;
    const seen = new Set<string>();
    const out: AliasIndexEntry[] = [];
    for (const [countryCode, map] of Object.entries(CITY_ALIASES)) {
        for (const [rawAlias, canonicalCity] of Object.entries(map)) {
            const alias = rawAlias.toLowerCase().trim();
            if (!alias || !canonicalCity) continue;
            const dedupeKey = `${alias}|${countryCode}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            out.push({ alias, canonicalCity, countryCode });
        }
    }
    _aliasIndex = out;
    return out;
}

/** True when `hay` contains `needle` at a word boundary — avoids "san" matching
 *  the middle of "pasandalan" while still matching "san juan". */
function containsAtWordBoundary(hay: string, needle: string): boolean {
    let from = 0;
    for (;;) {
        const i = hay.indexOf(needle, from);
        if (i === -1) return false;
        const before = i === 0 || /[\s\-]/.test(hay[i - 1]);
        if (before) return true;
        from = i + 1;
    }
}

/**
 * Match a raw autocomplete query against the alias keys.
 *
 * Ranked: exact key > key is a prefix of the query ("clark pampanga" → 'clark')
 * > query is a prefix of the key ("cla" → 'clark') > word-boundary substring.
 * Results are deduped by destination, so 'clark', 'clark freeport' and
 * 'clark pampanga' collapse into a single Angeles suggestion.
 */
export function matchAliasQuery(query: string, limit = 3): AliasMatch[] {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return [];

    const scored: Array<{ entry: AliasIndexEntry; tier: number }> = [];
    for (const entry of getAliasIndex()) {
        const { alias } = entry;
        let tier: number;
        if (alias === q) tier = 0;
        else if (q.startsWith(alias + ' ') || q.startsWith(alias + '-')) tier = 1;
        else if (alias.startsWith(q)) tier = 2;
        else if (containsAtWordBoundary(alias, q)) tier = 3;
        else continue;
        scored.push({ entry, tier });
    }
    if (!scored.length) return [];

    scored.sort((a, b) =>
        a.tier - b.tier ||
        a.entry.alias.length - b.entry.alias.length ||
        a.entry.alias.localeCompare(b.entry.alias)
    );

    const seenDestination = new Set<string>();
    const out: AliasMatch[] = [];
    for (const { entry } of scored) {
        const key = `${entry.canonicalCity.toLowerCase()}|${entry.countryCode}`;
        if (seenDestination.has(key)) continue;
        seenDestination.add(key);
        out.push(entry);
        if (out.length >= limit) break;
    }
    return out;
}
