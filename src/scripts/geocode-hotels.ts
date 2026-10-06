/**
 * Geocodes hotels in hotel_content using Google Places Text Search API.
 * Updates lat/lng where the stored value differs from Google's result by >500m,
 * and stamps google_place_id + google_enriched_at on every processed row.
 *
 * Usage:
 *   npm run geocode-hotels -- [options]
 *
 * Options:
 *   --count-only      Show how many hotels need processing + cost estimate, then exit
 *   --export-sql      Export geocoded rows from local DB as SQL UPDATE statements (no API calls)
 *   --dry-run         Make API calls and print what would change without writing to DB
 *   --zero-only       Only process hotels where lat=0 AND lng=0 (definitely broken)
 *   --force           Re-geocode hotels already marked google_enriched_at
 *   --limit  N        Stop after N hotels (default: all)
 *   --city   CITY     Only process hotels in this city (case-insensitive)
 *   --country CODE    Only process hotels in this country (case-insensitive)
 *   --batch  N        Requests per second (default: 10)
 *   --threshold N     Metres offset before a coordinate is replaced (default: 500)
 */

import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { config } from '@/config';

// ─── CLI flags ────────────────────────────────────────────────────────────────

const argv       = process.argv.slice(2);
const flag       = (name: string) => argv.includes(`--${name}`);
const arg        = (name: string, fallback: string) => {
    const i = argv.indexOf(`--${name}`);
    return i !== -1 ? (argv[i + 1] ?? fallback) : fallback;
};

const COUNT_ONLY = flag('count-only');
const EXPORT_SQL = flag('export-sql');
const DRY_RUN    = flag('dry-run');
const ZERO_ONLY  = flag('zero-only');   // only lat=0,lng=0 hotels
const FORCE      = flag('force');
const LIMIT      = parseInt(arg('limit',     '999999'));
const CITY       = arg('city',      '');
const COUNTRY    = arg('country',   '');
const BATCH_RPS  = Math.max(1, parseInt(arg('batch', '10')));
const THRESHOLD  = parseInt(arg('threshold', '500'));

// Google API costs (USD per request)
const COST_PLACES = 0.032;   // Places Text Search

// ─── Country bounding boxes — reject results outside these ────────────────────
// [minLat, minLng, maxLat, maxLng]
const COUNTRY_BBOX: Record<string, [number, number, number, number]> = {
    'china':         [18,   73,  53,  135],
    'south korea':   [33,  124,  38,  132],
    'japan':         [24,  122,  46,  146],
    'thailand':      [ 5,   97,  21,  106],
    'vietnam':       [ 8,  102,  24,  110],
    'indonesia':     [-11,  95,   6,  141],
    'philippines':   [ 4,  116,  21,  127],
    'malaysia':      [ 1,  100,   7,  119],
    'singapore':     [ 1,  103,   2,  104],
    'india':         [ 6,   68,  36,   98],
    'australia':     [-44, 113,  -9,  154],
    'united states': [18,  -180, 72,  -66],
    'united kingdom':[ 49,  -8,  61,    2],
    'france':        [41,   -5,  51,   10],
    'germany':       [47,    6,  55,   15],
    'italy':         [36,    6,  47,   19],
    'spain':         [35,  -10,  44,    5],
    'austria':       [46,    9,  49,   17],
    'taiwan':        [21,  119,  26,  122],
    'hong kong':     [22,  113,  23,  115],
    'cambodia':      [10,  102,  15,  108],
    'myanmar':       [10,   92,  29,  101],
    'nepal':         [26,   80,  30,   89],
    'sri lanka':     [ 5,   79,  10,   82],
    'maldives':      [-1,   72,   8,   74],
    'uae':           [22,   51,  26,   56],
    'united arab emirates': [22, 51, 26, 56],
    'saudi arabia':  [16,   36,  33,   56],
    'turkey':        [35,   25,  43,   45],
    'egypt':         [22,   25,  32,   37],
    'kenya':         [-5,   34,   5,   42],
    'south africa':  [-35,  16, -22,   33],
    'brazil':        [-34,  -74,   5,  -34],
    'mexico':        [14,  -118,  33,   -87],
    'canada':        [41,  -141,  84,   -52],
    'new zealand':   [-47, 166,  -34,  179],
};

function countryBboxOk(
    country: string | null,
    lat: number, lng: number
): boolean {
    if (!country) return true; // no country stored — skip check
    const bbox = COUNTRY_BBOX[country.toLowerCase().trim()];
    if (!bbox) return true;    // country not in our list — allow
    const [minLat, minLng, maxLat, maxLng] = bbox;
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

// ─── Haversine distance in metres ─────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R    = 6_371_000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Google Places Text Search ($0.032/req) ───────────────────────────────────

async function placesSearch(
    name: string, city: string | null, country: string | null, attempt = 0
): Promise<{ lat: number; lng: number; placeId: string; name: string } | null> {
    const key   = config.GOOGLE_PLACES_API_KEY;
    if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not set');

    const query = [name, city, country].filter(Boolean).join(', ');
    const url   = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`;

    let res: Response;
    try { res = await fetch(url); }
    catch (err) {
        if (attempt < 3) { await sleep(2000 * (attempt + 1)); return placesSearch(name, city, country, attempt + 1); }
        throw err;
    }

    if (res.status === 429 || res.status >= 500) {
        if (attempt < 3) { await sleep(5000 * (attempt + 1)); return placesSearch(name, city, country, attempt + 1); }
        throw new Error(`Google HTTP ${res.status}`);
    }

    const data = await res.json() as any;
    // Check status BEFORE results length — REQUEST_DENIED returns results:[]
    // which would be misread as ZERO_RESULTS if we checked length first.
    if (data.status === 'ZERO_RESULTS') return null;
    if (data.status === 'OVER_QUERY_LIMIT') {
        if (attempt < 3) { await sleep(10_000); return placesSearch(name, city, country, attempt + 1); }
        throw new Error('OVER_QUERY_LIMIT');
    }
    if (data.status !== 'OK') throw new Error(`Places API error: ${data.status} — ${data.error_message ?? ''}`);
    if (!data.results?.length) return null;

    const top = data.results[0];
    const loc = top.geometry?.location;
    if (!loc) return null;

    return {
        lat:     loc.lat,
        lng:     loc.lng,
        placeId: top.place_id ?? '',
        name:    top.name     ?? '',
    };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function fmtDuration(ms: number): string {
    const s = Math.round(ms / 1000);
    if (s < 60)   return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ─── Build WHERE clause ───────────────────────────────────────────────────────

function buildWhere(): Record<string, any> {
    const where: Record<string, any> = {};
    if (!FORCE)   where.google_enriched_at = null;
    if (CITY)     where.city    = { equals: CITY,    mode: 'insensitive' };
    if (COUNTRY)  where.country = { equals: COUNTRY, mode: 'insensitive' };
    if (ZERO_ONLY) where.AND = [{ lat: 0 }, { lng: 0 }];
    return where;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const where = buildWhere();

    // ── Count-only: no API calls ───────────────────────────────────────────────
    if (COUNT_ONLY) {
        const total = await prisma.hotel_content.count({ where });
        const capped = Math.min(total, LIMIT);

        const estCost = capped * COST_PLACES;
        const estTime = fmtDuration(Math.ceil(capped / BATCH_RPS) * 1000);

        console.log('');
        console.log('  Hotels to process   :', capped.toLocaleString(),
            total > LIMIT ? `(${total.toLocaleString()} total, capped at ${LIMIT})` : '');
        console.log('  Estimated API cost  :', `$${estCost.toFixed(2)}`,
            `(${capped.toLocaleString()} × $${COST_PLACES} Places API)`);
        console.log('  Estimated time      :', estTime, `at ${BATCH_RPS} req/s`);
        console.log('  Filter              :', [
            ZERO_ONLY ? 'lat=0 AND lng=0 only'      : '',
            CITY      ? `city="${CITY}"`             : '',
            COUNTRY   ? `country="${COUNTRY}"`       : '',
            FORCE     ? 'force (re-geocode all)'     : 'unenriched only',
        ].filter(Boolean).join(', ') || 'all unenriched hotels');
        console.log('');

        // Show targeted alternatives if total is large
        if (capped > 50_000) {
            console.log('  ── Cheaper targeted alternatives ──────────────────────────────────');
            console.log('');
            console.log('  Zero-coordinate hotels only (lat=0,lng=0 — definitely broken):');
            const zeroWhere = { ...where, AND: [{ lat: 0 }, { lng: 0 }] };
            const zeroCount = await prisma.hotel_content.count({ where: zeroWhere });
            const zeroCost  = zeroCount * COST_PLACES;
            console.log(`    Count: ${zeroCount.toLocaleString()}   Cost: ~$${zeroCost.toFixed(2)}`);
            console.log(`    npm run geocode-hotels -- --zero-only`);
            console.log('');
            console.log('  Single city:');
            console.log('    npm run geocode-hotels -- --city Seoul');
            console.log('    npm run geocode-hotels -- --city Tokyo');
            console.log('    npm run geocode-hotels -- --city Bangkok');
            console.log('');
            console.log('  Single country:');
            console.log('    npm run geocode-hotels -- --country "South Korea"');
            console.log('    npm run geocode-hotels -- --country Japan');
            console.log('');
        }

        await prisma.$disconnect();
        return;
    }

    // ── Export-SQL: read already-geocoded rows from local DB, write .sql file ──
    if (EXPORT_SQL) {
        const exportWhere: Record<string, any> = { google_enriched_at: { not: null } };
        if (CITY)    exportWhere.city    = { equals: CITY,    mode: 'insensitive' };
        if (COUNTRY) exportWhere.country = { equals: COUNTRY, mode: 'insensitive' };

        const rows = await prisma.hotel_content.findMany({
            where:  exportWhere,
            select: { hotel_id: true, lat: true, lng: true, google_place_id: true, google_enriched_at: true },
            take:   LIMIT,
        });

        if (!rows.length) {
            console.log('\n  No geocoded rows found. Run the geocoder first, then --export-sql.\n');
            await prisma.$disconnect();
            return;
        }

        const label    = CITY || COUNTRY || 'all';
        const date     = new Date().toISOString().slice(0, 10);
        const filename = `geocoded_${label.toLowerCase().replace(/\s+/g, '_')}_${date}.sql`;

        const esc = (s: string) => s.replace(/'/g, "''");

        const lines: string[] = [
            `-- Hotel coordinate export`,
            `-- Filter: ${CITY ? `city="${CITY}"` : COUNTRY ? `country="${COUNTRY}"` : 'all geocoded'}`,
            `-- Generated: ${new Date().toISOString()}`,
            `-- Rows: ${rows.length}`,
            ``,
            `BEGIN;`,
            ``,
            ...rows.map(r => {
                const lat     = r.lat ?? 0;
                const lng     = r.lng ?? 0;
                const placeId = esc(r.google_place_id ?? '');
                const ts      = r.google_enriched_at!.toISOString();
                const id      = esc(r.hotel_id);
                return `UPDATE hotel_content SET lat=${lat}, lng=${lng}, google_place_id='${placeId}', google_enriched_at='${ts}' WHERE hotel_id='${id}';`;
            }),
            ``,
            `COMMIT;`,
            ``,
        ];

        const fs = await import('fs');
        fs.writeFileSync(filename, lines.join('\n'), 'utf8');

        console.log(`\n  Exported ${rows.length} rows → ${filename}`);
        console.log(`  Apply to RDS:`);
        console.log(`    psql '<DATABASE_URL>' -f ${filename}\n`);

        await prisma.$disconnect();
        return;
    }

    // ── Normal / dry-run mode ─────────────────────────────────────────────────
    const hotels = await prisma.hotel_content.findMany({
        where,
        select: {
            hotel_id:        true,
            name:            true,
            address:         true,
            city:            true,
            country:         true,
            lat:             true,
            lng:             true,
            google_place_id: true,
        },
        orderBy: { fetched_at: 'desc' },
        take:    LIMIT,
    });

    const total = hotels.length;
    if (total === 0) {
        console.log('\n  Nothing to do — all matching hotels already geocoded.');
        console.log('  Use --force to re-check, or run --count-only to see options.\n');
        await prisma.$disconnect();
        return;
    }

    const estCost = total * COST_PLACES;
    const estTime = fmtDuration(Math.ceil(total / BATCH_RPS) * 1000);

    console.log('');
    console.log(`  Hotels        : ${total.toLocaleString()}`);
    console.log(`  Est. cost     : ~$${estCost.toFixed(2)} (${total} × $${COST_PLACES} Places API)`);
    console.log(`  Est. time     : ${estTime} at ${BATCH_RPS} req/s`);
    console.log(`  Threshold     : ${THRESHOLD}m`);
    console.log(`  Mode          : ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
    console.log('');

    let updated = 0, confirmed = 0, noHit = 0, errored = 0;
    const startMs = Date.now();

    for (let i = 0; i < hotels.length; i++) {
        const h = hotels[i];

        if (i > 0 && i % BATCH_RPS === 0) {
            const elapsedMs = Date.now() - startMs;
            const etaMs     = (elapsedMs / i) * (total - i);
            process.stdout.write(
                `\r  Progress: ${i}/${total} | updated=${updated} | ETA ${fmtDuration(etaMs)}   `
            );
            await sleep(1000);
        }

        // Prefer cheap geocoding when address is known, fall back to places
        // Build the best hotel name available:
        //  1. stored name field
        //  2. de-slugified hotel_id  (e.g. "vienna_hotel_beijing_songzhuang" → "vienna hotel beijing songzhuang")
        //  3. skip — query would be too generic / invalid
        const storedName = h.name?.trim();
        const slugName   = storedName
            ? storedName
            : h.hotel_id.replace(/^_+/, '').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();

        // Skip if the "name" is a hex code (_0x…) or empty — Google would reject or return junk
        const isHexId = /^0x[0-9a-f]+$/i.test(slugName);
        if (!slugName || isHexId || slugName.length < 4) {
            console.log(`\n  [${i + 1}/${total}] SKIP   "${h.hotel_id}" — no usable name`);
            if (!DRY_RUN) {
                await prisma.hotel_content.update({
                    where: { hotel_id: h.hotel_id },
                    data:  { google_enriched_at: new Date() },
                });
            }
            noHit++;
            continue;
        }

        // Skip if there's no city AND no country — result can't be validated
        // and fuzzy slug matches land in completely wrong countries (e.g. "vienna" → Austria).
        if (!h.city?.trim() && !h.country?.trim()) {
            console.log(`\n  [${i + 1}/${total}] SKIP   "${h.hotel_id}" — no city or country to validate result`);
            if (!DRY_RUN) {
                await prisma.hotel_content.update({
                    where: { hotel_id: h.hotel_id },
                    data:  { google_enriched_at: new Date() },
                });
            }
            noHit++;
            continue;
        }

        // Build the best query: name + address (if known) + city + country.
        // Always uses Places Text Search — no Geocoding API needed.
        const addressPart = h.address?.trim() ?? '';
        const placeQuery  = [slugName, addressPart, h.city, h.country].filter(Boolean).join(', ');

        let result: { lat: number; lng: number; placeId: string; name: string } | null = null;
        try {
            result = await placesSearch(placeQuery, null, null); // city/country already in query

            // Reject results that land in the wrong country — e.g. "Vienna Hotel"
            // matching Vienna, Austria instead of the Chinese hotel chain in Beijing.
            if (result && !countryBboxOk(h.country, result.lat, result.lng)) {
                console.log(
                    `\n  [${i + 1}/${total}] COUNTRY-MISMATCH  "${slugName}" [${h.hotel_id}]\n` +
                    `             google returned (${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}) — "${result.name}"\n` +
                    `             but hotel.country="${h.country}" — discarding result`
                );
                result = null;
            }
        } catch (err) {
            console.log(`\n  [${i + 1}/${total}] ERROR  "${h.name}" (${h.hotel_id}) — ${err}`);
            errored++;
            continue;
        }

        if (!result) {
            if (!DRY_RUN) {
                await prisma.hotel_content.update({
                    where: { hotel_id: h.hotel_id },
                    data:  { google_enriched_at: new Date() },
                });
            }
            noHit++;
            continue;
        }

        const storedLat = h.lat ?? 0;
        const storedLng = h.lng ?? 0;
        const isZero    = storedLat === 0 && storedLng === 0;
        const dist      = isZero ? Infinity : haversineM(storedLat, storedLng, result.lat, result.lng);
        const needsMove = dist > THRESHOLD;

        if (needsMove) {
            console.log(
                `\n  [${i + 1}/${total}] UPDATE  "${h.name}" [${h.hotel_id}]\n` +
                `             stored  (${storedLat.toFixed(5)}, ${storedLng.toFixed(5)})` +
                (isZero ? ' [was 0,0]' : ` [${Math.round(dist)}m off]`) + '\n' +
                `             google  (${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}) — "${result.name}"`
            );
            if (!DRY_RUN) {
                await prisma.hotel_content.update({
                    where: { hotel_id: h.hotel_id },
                    data:  {
                        lat:               result.lat,
                        lng:               result.lng,
                        google_place_id:   result.placeId,
                        google_enriched_at: new Date(),
                    },
                });
            }
            updated++;
        } else {
            if (!DRY_RUN) {
                await prisma.hotel_content.update({
                    where: { hotel_id: h.hotel_id },
                    data:  {
                        google_place_id:    result.placeId || h.google_place_id,
                        google_enriched_at: new Date(),
                    },
                });
            }
            confirmed++;
        }
    }

    const elapsed = fmtDuration(Date.now() - startMs);
    console.log('');
    console.log(`\n  Done in ${elapsed}`);
    console.log(`  updated=${updated}  confirmed=${confirmed}  no-hit=${noHit}  errors=${errored}`);
    if (DRY_RUN) console.log('  DRY RUN — no changes written to DB');
    console.log('');

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('[geocode-hotels] Fatal:', err);
    process.exit(1);
});
