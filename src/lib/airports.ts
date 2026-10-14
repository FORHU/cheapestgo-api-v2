export interface Airport {
    iata: string;
    name: string;
    city: string;
    country: string;
    countryCode: string;
}

const AIRPORTS: Airport[] = [
    // ── Philippines ──
    { iata: "MNL", name: "Ninoy Aquino International Airport", city: "Manila", country: "Philippines", countryCode: "PH" },
    { iata: "CEB", name: "Mactan-Cebu International Airport", city: "Cebu", country: "Philippines", countryCode: "PH" },
    { iata: "CRK", name: "Clark International Airport", city: "Clark", country: "Philippines", countryCode: "PH" },
    { iata: "DVO", name: "Francisco Bangoy International Airport", city: "Davao", country: "Philippines", countryCode: "PH" },
    { iata: "ILO", name: "Iloilo International Airport", city: "Iloilo", country: "Philippines", countryCode: "PH" },
    { iata: "KLO", name: "Kalibo International Airport", city: "Kalibo", country: "Philippines", countryCode: "PH" },
    { iata: "PPS", name: "Puerto Princesa International Airport", city: "Puerto Princesa", country: "Philippines", countryCode: "PH" },
    { iata: "TAG", name: "Bohol-Panglao International Airport", city: "Tagbilaran", country: "Philippines", countryCode: "PH" },
    // ── South Korea ──
    { iata: "ICN", name: "Incheon International Airport", city: "Seoul", country: "South Korea", countryCode: "KR" },
    { iata: "GMP", name: "Gimpo International Airport", city: "Seoul", country: "South Korea", countryCode: "KR" },
    { iata: "PUS", name: "Gimhae International Airport", city: "Busan", country: "South Korea", countryCode: "KR" },
    { iata: "CJU", name: "Jeju International Airport", city: "Jeju", country: "South Korea", countryCode: "KR" },
    // ── Japan ──
    { iata: "NRT", name: "Narita International Airport", city: "Tokyo", country: "Japan", countryCode: "JP" },
    { iata: "HND", name: "Haneda Airport", city: "Tokyo", country: "Japan", countryCode: "JP" },
    { iata: "KIX", name: "Kansai International Airport", city: "Osaka", country: "Japan", countryCode: "JP" },
    { iata: "ITM", name: "Osaka Itami Airport", city: "Osaka", country: "Japan", countryCode: "JP" },
    { iata: "NGO", name: "Chubu Centrair International Airport", city: "Nagoya", country: "Japan", countryCode: "JP" },
    { iata: "FUK", name: "Fukuoka Airport", city: "Fukuoka", country: "Japan", countryCode: "JP" },
    { iata: "CTS", name: "New Chitose Airport", city: "Sapporo", country: "Japan", countryCode: "JP" },
    { iata: "OKA", name: "Naha Airport", city: "Okinawa", country: "Japan", countryCode: "JP" },
    // ── China ──
    { iata: "PEK", name: "Beijing Capital International Airport", city: "Beijing", country: "China", countryCode: "CN" },
    { iata: "PKX", name: "Beijing Daxing International Airport", city: "Beijing", country: "China", countryCode: "CN" },
    { iata: "PVG", name: "Shanghai Pudong International Airport", city: "Shanghai", country: "China", countryCode: "CN" },
    { iata: "SHA", name: "Shanghai Hongqiao International Airport", city: "Shanghai", country: "China", countryCode: "CN" },
    { iata: "CAN", name: "Guangzhou Baiyun International Airport", city: "Guangzhou", country: "China", countryCode: "CN" },
    { iata: "SZX", name: "Shenzhen Bao'an International Airport", city: "Shenzhen", country: "China", countryCode: "CN" },
    { iata: "CTU", name: "Chengdu Tianfu International Airport", city: "Chengdu", country: "China", countryCode: "CN" },
    { iata: "CKG", name: "Chongqing Jiangbei International Airport", city: "Chongqing", country: "China", countryCode: "CN" },
    { iata: "KMG", name: "Kunming Changshui International Airport", city: "Kunming", country: "China", countryCode: "CN" },
    { iata: "XIY", name: "Xi'an Xianyang International Airport", city: "Xi'an", country: "China", countryCode: "CN" },
    { iata: "HGH", name: "Hangzhou Xiaoshan International Airport", city: "Hangzhou", country: "China", countryCode: "CN" },
    // ── Hong Kong / Macau / Taiwan ──
    { iata: "HKG", name: "Hong Kong International Airport", city: "Hong Kong", country: "Hong Kong", countryCode: "HK" },
    { iata: "MFM", name: "Macau International Airport", city: "Macau", country: "Macau", countryCode: "MO" },
    { iata: "TPE", name: "Taiwan Taoyuan International Airport", city: "Taipei", country: "Taiwan", countryCode: "TW" },
    { iata: "KHH", name: "Kaohsiung International Airport", city: "Kaohsiung", country: "Taiwan", countryCode: "TW" },
    // ── Southeast Asia ──
    { iata: "SIN", name: "Changi Airport", city: "Singapore", country: "Singapore", countryCode: "SG" },
    { iata: "KUL", name: "Kuala Lumpur International Airport", city: "Kuala Lumpur", country: "Malaysia", countryCode: "MY" },
    { iata: "PEN", name: "Penang International Airport", city: "Penang", country: "Malaysia", countryCode: "MY" },
    { iata: "LGK", name: "Langkawi International Airport", city: "Langkawi", country: "Malaysia", countryCode: "MY" },
    { iata: "BKK", name: "Suvarnabhumi Airport", city: "Bangkok", country: "Thailand", countryCode: "TH" },
    { iata: "DMK", name: "Don Mueang International Airport", city: "Bangkok", country: "Thailand", countryCode: "TH" },
    { iata: "HKT", name: "Phuket International Airport", city: "Phuket", country: "Thailand", countryCode: "TH" },
    { iata: "CNX", name: "Chiang Mai International Airport", city: "Chiang Mai", country: "Thailand", countryCode: "TH" },
    { iata: "CGK", name: "Soekarno-Hatta International Airport", city: "Jakarta", country: "Indonesia", countryCode: "ID" },
    { iata: "DPS", name: "Ngurah Rai International Airport", city: "Bali", country: "Indonesia", countryCode: "ID" },
    { iata: "SUB", name: "Juanda International Airport", city: "Surabaya", country: "Indonesia", countryCode: "ID" },
    { iata: "HAN", name: "Noi Bai International Airport", city: "Hanoi", country: "Vietnam", countryCode: "VN" },
    { iata: "SGN", name: "Tan Son Nhat International Airport", city: "Ho Chi Minh City", country: "Vietnam", countryCode: "VN" },
    { iata: "DAD", name: "Da Nang International Airport", city: "Da Nang", country: "Vietnam", countryCode: "VN" },
    { iata: "PNH", name: "Phnom Penh International Airport", city: "Phnom Penh", country: "Cambodia", countryCode: "KH" },
    { iata: "REP", name: "Siem Reap International Airport", city: "Siem Reap", country: "Cambodia", countryCode: "KH" },
    { iata: "RGN", name: "Yangon International Airport", city: "Yangon", country: "Myanmar", countryCode: "MM" },
    { iata: "VTE", name: "Wattay International Airport", city: "Vientiane", country: "Laos", countryCode: "LA" },
    // ── South Asia ──
    { iata: "DEL", name: "Indira Gandhi International Airport", city: "Delhi", country: "India", countryCode: "IN" },
    { iata: "BOM", name: "Chhatrapati Shivaji Maharaj International Airport", city: "Mumbai", country: "India", countryCode: "IN" },
    { iata: "BLR", name: "Kempegowda International Airport", city: "Bangalore", country: "India", countryCode: "IN" },
    { iata: "MAA", name: "Chennai International Airport", city: "Chennai", country: "India", countryCode: "IN" },
    { iata: "CCU", name: "Netaji Subhas Chandra Bose International Airport", city: "Kolkata", country: "India", countryCode: "IN" },
    { iata: "HYD", name: "Rajiv Gandhi International Airport", city: "Hyderabad", country: "India", countryCode: "IN" },
    { iata: "COK", name: "Cochin International Airport", city: "Kochi", country: "India", countryCode: "IN" },
    { iata: "CMB", name: "Bandaranaike International Airport", city: "Colombo", country: "Sri Lanka", countryCode: "LK" },
    { iata: "DAC", name: "Hazrat Shahjalal International Airport", city: "Dhaka", country: "Bangladesh", countryCode: "BD" },
    { iata: "KTM", name: "Tribhuvan International Airport", city: "Kathmandu", country: "Nepal", countryCode: "NP" },
    { iata: "ISB", name: "Islamabad International Airport", city: "Islamabad", country: "Pakistan", countryCode: "PK" },
    { iata: "KHI", name: "Jinnah International Airport", city: "Karachi", country: "Pakistan", countryCode: "PK" },
    { iata: "LHE", name: "Allama Iqbal International Airport", city: "Lahore", country: "Pakistan", countryCode: "PK" },
    { iata: "MLE", name: "Velana International Airport", city: "Malé", country: "Maldives", countryCode: "MV" },
    // ── Middle East ──
    { iata: "DXB", name: "Dubai International Airport", city: "Dubai", country: "United Arab Emirates", countryCode: "AE" },
    { iata: "AUH", name: "Abu Dhabi International Airport", city: "Abu Dhabi", country: "United Arab Emirates", countryCode: "AE" },
    { iata: "DOH", name: "Hamad International Airport", city: "Doha", country: "Qatar", countryCode: "QA" },
    { iata: "JED", name: "King Abdulaziz International Airport", city: "Jeddah", country: "Saudi Arabia", countryCode: "SA" },
    { iata: "RUH", name: "King Khalid International Airport", city: "Riyadh", country: "Saudi Arabia", countryCode: "SA" },
    { iata: "BAH", name: "Bahrain International Airport", city: "Manama", country: "Bahrain", countryCode: "BH" },
    { iata: "MCT", name: "Muscat International Airport", city: "Muscat", country: "Oman", countryCode: "OM" },
    { iata: "KWI", name: "Kuwait International Airport", city: "Kuwait City", country: "Kuwait", countryCode: "KW" },
    { iata: "TLV", name: "Ben Gurion Airport", city: "Tel Aviv", country: "Israel", countryCode: "IL" },
    { iata: "AMM", name: "Queen Alia International Airport", city: "Amman", country: "Jordan", countryCode: "JO" },
    { iata: "IST", name: "Istanbul Airport", city: "Istanbul", country: "Turkey", countryCode: "TR" },
    { iata: "SAW", name: "Sabiha Gökçen International Airport", city: "Istanbul", country: "Turkey", countryCode: "TR" },
    { iata: "AYT", name: "Antalya Airport", city: "Antalya", country: "Turkey", countryCode: "TR" },
    // ── United States ──
    { iata: "JFK", name: "John F. Kennedy International Airport", city: "New York", country: "United States", countryCode: "US" },
    { iata: "EWR", name: "Newark Liberty International Airport", city: "Newark", country: "United States", countryCode: "US" },
    { iata: "LGA", name: "LaGuardia Airport", city: "New York", country: "United States", countryCode: "US" },
    { iata: "LAX", name: "Los Angeles International Airport", city: "Los Angeles", country: "United States", countryCode: "US" },
    { iata: "SFO", name: "San Francisco International Airport", city: "San Francisco", country: "United States", countryCode: "US" },
    { iata: "ORD", name: "O'Hare International Airport", city: "Chicago", country: "United States", countryCode: "US" },
    { iata: "ATL", name: "Hartsfield-Jackson Atlanta International Airport", city: "Atlanta", country: "United States", countryCode: "US" },
    { iata: "DFW", name: "Dallas/Fort Worth International Airport", city: "Dallas", country: "United States", countryCode: "US" },
    { iata: "DEN", name: "Denver International Airport", city: "Denver", country: "United States", countryCode: "US" },
    { iata: "MIA", name: "Miami International Airport", city: "Miami", country: "United States", countryCode: "US" },
    { iata: "SEA", name: "Seattle-Tacoma International Airport", city: "Seattle", country: "United States", countryCode: "US" },
    { iata: "IAD", name: "Washington Dulles International Airport", city: "Washington", country: "United States", countryCode: "US" },
    { iata: "BOS", name: "Boston Logan International Airport", city: "Boston", country: "United States", countryCode: "US" },
    { iata: "LAS", name: "Harry Reid International Airport", city: "Las Vegas", country: "United States", countryCode: "US" },
    { iata: "MCO", name: "Orlando International Airport", city: "Orlando", country: "United States", countryCode: "US" },
    { iata: "PHX", name: "Phoenix Sky Harbor International Airport", city: "Phoenix", country: "United States", countryCode: "US" },
    { iata: "IAH", name: "George Bush Intercontinental Airport", city: "Houston", country: "United States", countryCode: "US" },
    { iata: "HNL", name: "Daniel K. Inouye International Airport", city: "Honolulu", country: "United States", countryCode: "US" },
    // ── Canada ──
    { iata: "YYZ", name: "Toronto Pearson International Airport", city: "Toronto", country: "Canada", countryCode: "CA" },
    { iata: "YVR", name: "Vancouver International Airport", city: "Vancouver", country: "Canada", countryCode: "CA" },
    { iata: "YUL", name: "Montréal-Pierre Elliott Trudeau International Airport", city: "Montreal", country: "Canada", countryCode: "CA" },
    { iata: "YYC", name: "Calgary International Airport", city: "Calgary", country: "Canada", countryCode: "CA" },
    // ── Europe ──
    { iata: "LHR", name: "Heathrow Airport", city: "London", country: "United Kingdom", countryCode: "GB" },
    { iata: "LGW", name: "Gatwick Airport", city: "London", country: "United Kingdom", countryCode: "GB" },
    { iata: "STN", name: "London Stansted Airport", city: "London", country: "United Kingdom", countryCode: "GB" },
    { iata: "MAN", name: "Manchester Airport", city: "Manchester", country: "United Kingdom", countryCode: "GB" },
    { iata: "EDI", name: "Edinburgh Airport", city: "Edinburgh", country: "United Kingdom", countryCode: "GB" },
    { iata: "CDG", name: "Charles de Gaulle Airport", city: "Paris", country: "France", countryCode: "FR" },
    { iata: "ORY", name: "Paris Orly Airport", city: "Paris", country: "France", countryCode: "FR" },
    { iata: "NCE", name: "Nice Côte d'Azur Airport", city: "Nice", country: "France", countryCode: "FR" },
    { iata: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany", countryCode: "DE" },
    { iata: "MUC", name: "Munich Airport", city: "Munich", country: "Germany", countryCode: "DE" },
    { iata: "BER", name: "Berlin Brandenburg Airport", city: "Berlin", country: "Germany", countryCode: "DE" },
    { iata: "AMS", name: "Amsterdam Schiphol Airport", city: "Amsterdam", country: "Netherlands", countryCode: "NL" },
    { iata: "MAD", name: "Adolfo Suárez Madrid-Barajas Airport", city: "Madrid", country: "Spain", countryCode: "ES" },
    { iata: "BCN", name: "Barcelona–El Prat Airport", city: "Barcelona", country: "Spain", countryCode: "ES" },
    { iata: "FCO", name: "Leonardo da Vinci–Fiumicino Airport", city: "Rome", country: "Italy", countryCode: "IT" },
    { iata: "MXP", name: "Milan Malpensa Airport", city: "Milan", country: "Italy", countryCode: "IT" },
    { iata: "ZRH", name: "Zürich Airport", city: "Zurich", country: "Switzerland", countryCode: "CH" },
    { iata: "VIE", name: "Vienna International Airport", city: "Vienna", country: "Austria", countryCode: "AT" },
    { iata: "LIS", name: "Humberto Delgado Airport", city: "Lisbon", country: "Portugal", countryCode: "PT" },
    { iata: "ATH", name: "Athens International Airport", city: "Athens", country: "Greece", countryCode: "GR" },
    { iata: "DUB", name: "Dublin Airport", city: "Dublin", country: "Ireland", countryCode: "IE" },
    { iata: "BRU", name: "Brussels Airport", city: "Brussels", country: "Belgium", countryCode: "BE" },
    { iata: "CPH", name: "Copenhagen Airport", city: "Copenhagen", country: "Denmark", countryCode: "DK" },
    { iata: "ARN", name: "Stockholm Arlanda Airport", city: "Stockholm", country: "Sweden", countryCode: "SE" },
    { iata: "OSL", name: "Oslo Gardermoen Airport", city: "Oslo", country: "Norway", countryCode: "NO" },
    { iata: "HEL", name: "Helsinki-Vantaa Airport", city: "Helsinki", country: "Finland", countryCode: "FI" },
    { iata: "WAW", name: "Warsaw Chopin Airport", city: "Warsaw", country: "Poland", countryCode: "PL" },
    { iata: "PRG", name: "Václav Havel Airport Prague", city: "Prague", country: "Czech Republic", countryCode: "CZ" },
    { iata: "BUD", name: "Budapest Ferenc Liszt International Airport", city: "Budapest", country: "Hungary", countryCode: "HU" },
    // ── Africa ──
    { iata: "JNB", name: "O.R. Tambo International Airport", city: "Johannesburg", country: "South Africa", countryCode: "ZA" },
    { iata: "CPT", name: "Cape Town International Airport", city: "Cape Town", country: "South Africa", countryCode: "ZA" },
    { iata: "CAI", name: "Cairo International Airport", city: "Cairo", country: "Egypt", countryCode: "EG" },
    { iata: "NBO", name: "Jomo Kenyatta International Airport", city: "Nairobi", country: "Kenya", countryCode: "KE" },
    { iata: "ADD", name: "Bole International Airport", city: "Addis Ababa", country: "Ethiopia", countryCode: "ET" },
    { iata: "LOS", name: "Murtala Muhammed International Airport", city: "Lagos", country: "Nigeria", countryCode: "NG" },
    // ── Oceania ──
    { iata: "SYD", name: "Sydney Kingsford Smith Airport", city: "Sydney", country: "Australia", countryCode: "AU" },
    { iata: "MEL", name: "Melbourne Airport", city: "Melbourne", country: "Australia", countryCode: "AU" },
    { iata: "BNE", name: "Brisbane Airport", city: "Brisbane", country: "Australia", countryCode: "AU" },
    { iata: "PER", name: "Perth Airport", city: "Perth", country: "Australia", countryCode: "AU" },
    { iata: "AKL", name: "Auckland Airport", city: "Auckland", country: "New Zealand", countryCode: "NZ" },
    // ── Latin America ──
    { iata: "MEX", name: "Mexico City International Airport", city: "Mexico City", country: "Mexico", countryCode: "MX" },
    { iata: "CUN", name: "Cancún International Airport", city: "Cancún", country: "Mexico", countryCode: "MX" },
    { iata: "GRU", name: "São Paulo–Guarulhos International Airport", city: "São Paulo", country: "Brazil", countryCode: "BR" },
    { iata: "GIG", name: "Rio de Janeiro–Galeão International Airport", city: "Rio de Janeiro", country: "Brazil", countryCode: "BR" },
    { iata: "EZE", name: "Ministro Pistarini International Airport", city: "Buenos Aires", country: "Argentina", countryCode: "AR" },
    { iata: "SCL", name: "Arturo Merino Benítez International Airport", city: "Santiago", country: "Chile", countryCode: "CL" },
    { iata: "BOG", name: "El Dorado International Airport", city: "Bogotá", country: "Colombia", countryCode: "CO" },
    { iata: "LIM", name: "Jorge Chávez International Airport", city: "Lima", country: "Peru", countryCode: "PE" },
    { iata: "PTY", name: "Tocumen International Airport", city: "Panama City", country: "Panama", countryCode: "PA" },
];

interface IndexedAirport extends Airport {
    _iataLower: string;
    _nameLower: string;
    _cityLower: string;
    _countryLower: string;
}

const INDEXED: IndexedAirport[] = AIRPORTS.map(a => ({
    ...a,
    _iataLower:    a.iata.toLowerCase(),
    _nameLower:    a.name.toLowerCase(),
    _cityLower:    a.city.toLowerCase(),
    _countryLower: a.country.toLowerCase(),
}));

export function searchAirports(query: string, limit = 8): Airport[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const scored: { airport: Airport; score: number }[] = [];

    for (const a of INDEXED) {
        let score = 0;
        if (a._iataLower === q)              score = 100;
        else if (a._iataLower.startsWith(q)) score = 80;
        else if (a._cityLower.startsWith(q)) score = 60;
        else if (a._cityLower.includes(q))   score = 40;
        else if (a._nameLower.includes(q))   score = 30;
        else if (a._countryLower.includes(q)) score = 20;
        if (score > 0) scored.push({ airport: a, score });
    }

    scored.sort((a, b) => b.score - a.score || a.airport.city.localeCompare(b.airport.city));

    return scored.slice(0, limit).map(s => ({
        iata:        s.airport.iata,
        name:        s.airport.name,
        city:        s.airport.city,
        country:     s.airport.country,
        countryCode: s.airport.countryCode,
    }));
}

export function getAirportByCode(iataCode: string): Airport | undefined {
    return AIRPORTS.find(a => a.iata === iataCode.toUpperCase());
}
