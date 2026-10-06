import zlib from 'zlib';
import { once } from 'events';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseRoomGroups } from '@/lib/hotels/roomGroups';

/**
 * The ETG static content dump: every hotel's rooms, photos, description, amenities and
 * policies, in one file (ported from v1's /api/cron/etg-dump-sync, C6).
 *
 * This is what fills the catalog. Without it a hotel in search results has a name, a price and
 * nothing else — no photographs, no check-in time, no cancellation metapolicy — and the room
 * cards show grey boxes. The per-hotel seed (roomCatalog) covers one hotel at a time on demand;
 * this covers the catalog in one pass.
 *
 * Format: JSON Lines compressed with Zstandard. Decompressed with Node's own zlib — v1 carries
 * the `fzstd` package for this, which Node 24 has made unnecessary.
 */

const ETG_BASE = 'https://api.worldota.net/api/b2b/v3';

/** Rows written per statement. Large enough to be worth the round trip, small enough to retry. */
const BATCH_SIZE = 400;

/**
 * How long the download may go **without a byte arriving** before it is given up on.
 *
 * Deliberately not a deadline for the whole transfer. `AbortSignal.timeout` on a `fetch`
 * bounds the body stream too, so a fixed budget is really a bet on the file's size and the
 * link's speed — and the dump grows while a developer's connection does not. A 250 s budget
 * (what this was, and what v1 still has) is met on production egress and missed everywhere
 * else: locally on 2026-10-01 it aborted at 262 s having already read 1,000,000 lines and
 * matched 323,538 hotels, and threw all of it away.
 *
 * A stalled connection is the thing worth aborting, and silence is what identifies it.
 */
const STALL_TIMEOUT_MS = 120_000;

export interface DumpStats {
    linesRead:  number;
    /** Lines whose hotel we already carry. The dump is far larger than our catalog. */
    matched:    number;
    withGroups: number;
    written:    number;
    skipped:    number;
    errors:     number;
}

function etgToken(): string {
    const keyId  = process.env.RATEHAWK_KEY_ID  ?? process.env.ETG_KEY_ID  ?? '';
    const apiKey = process.env.RATEHAWK_API_KEY ?? process.env.ETG_API_KEY ?? '';
    return Buffer.from(`${keyId}:${apiKey}`).toString('base64');
}

/**
 * Where this run's dump lives. ETG mints a signed URL per request.
 *
 * `incremental` carries only what changed since the last full dump, and is what a nightly run
 * should ask for; `full` is for a first load or a rebuild.
 */
export async function getDumpUrl(type: 'full' | 'incremental'): Promise<string> {
    const endpoint = type === 'incremental'
        ? `${ETG_BASE}/hotel/info/incremental_dump/`
        : `${ETG_BASE}/hotel/info/dump/`;

    const res = await fetch(endpoint, {
        method:  'POST',
        headers: { Authorization: `Basic ${etgToken()}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ language: 'en' }),
        signal:  AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`ETG dump endpoint ${res.status}`);

    const json = await res.json() as { data?: { url?: string } };
    const url = json?.data?.url;
    if (!url) throw new Error(`No dump URL in response: ${JSON.stringify(json).slice(0, 200)}`);
    return url;
}

/** ETG sizes its image URLs with a placeholder; everything here reads them at one size. */
function resolveImage(url: unknown): string | null {
    return typeof url === 'string' ? url.replace(/\{size\}/g, '1024x768') : null;
}

function parseDescription(descStruct: unknown): string | null {
    if (!Array.isArray(descStruct) || !descStruct.length) return null;
    return (descStruct as { paragraphs?: string[] }[])
        .map(section => section.paragraphs?.join(' ') ?? '')
        .filter(Boolean)
        .join('\n\n') || null;
}

function parseAmenityGroups(raw: unknown): object[] {
    if (!Array.isArray(raw)) return [];
    return (raw as { group_name?: string; amenities?: unknown; non_free_amenities?: unknown }[])
        .map(group => ({
            group_name:         group.group_name ?? '',
            amenities:          Array.isArray(group.amenities) ? group.amenities : [],
            non_free_amenities: Array.isArray(group.non_free_amenities) ? group.non_free_amenities : [],
        }))
        .filter(group => group.group_name);
}

function parseImages(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[]).map(resolveImage).filter((u): u is string => u !== null).slice(0, 20);
}

interface BatchRow { hid: string; slug: string; roomGroups: string; extra: string }

/**
 * Write a batch, and on failure write its rows one at a time.
 *
 * One malformed row in a batch of 400 would otherwise lose the other 399 — and the dump is
 * supplier data, so malformed rows are a matter of when.
 */
async function flushBatch(batch: BatchRow[], stats: DumpStats): Promise<void> {
    if (!batch.length) return;

    const hids   = batch.map(r => r.hid);
    const slugs  = batch.map(r => r.slug);
    const groups = batch.map(r => r.roomGroups);
    const extras = batch.map(r => r.extra);

    try {
        await prisma.$executeRaw(Prisma.sql`
            UPDATE hotel_content AS hc
               SET room_groups           = d.rg::jsonb,
                   ratehawk_hid          = COALESCE(hc.ratehawk_hid, d.slug),
                   room_groups_seeded_at = NOW(),
                   check_in_time         = COALESCE(NULLIF(d.x->>'ci', ''), hc.check_in_time),
                   check_out_time        = COALESCE(NULLIF(d.x->>'co', ''), hc.check_out_time),
                   description           = COALESCE(NULLIF(d.x->>'desc', ''), hc.description),
                   amenity_groups        = CASE WHEN jsonb_array_length(d.x->'ag') > 0 THEN d.x->'ag' ELSE hc.amenity_groups END,
                   images                = CASE WHEN jsonb_array_length(d.x->'imgs') > 0
                                                THEN ARRAY(SELECT jsonb_array_elements_text(d.x->'imgs'))
                                                ELSE hc.images END,
                   serp_filters          = ARRAY(SELECT jsonb_array_elements_text(d.x->'sf')),
                   metapolicy_struct     = CASE WHEN d.x->'mp' IS NOT NULL AND d.x->>'mp' <> 'null' THEN d.x->'mp' ELSE hc.metapolicy_struct END,
                   metapolicy_extra_info = COALESCE(NULLIF(d.x->>'mpe', ''), hc.metapolicy_extra_info)
              FROM unnest(${hids}::text[], ${slugs}::text[], ${groups}::text[], ${extras}::jsonb[])
                   AS d(hotel_id, slug, rg, x)
             WHERE hc.hotel_id = d.hotel_id
        `);
        stats.written += batch.length;
    } catch (err) {
        console.warn('[etg-dump] batch failed, retrying row by row:', (err as Error).message?.slice(0, 100));
        for (const row of batch) {
            try {
                await flushBatch([row], stats);
            } catch {
                stats.errors++;
            }
        }
    }

    batch.length = 0;
}

/**
 * Stream the dump and update every hotel in it that we already carry.
 *
 * Streamed, not buffered: the full dump does not fit comfortably in memory, and the catalog
 * only needs the lines matching hotels we hold — a small fraction of the file.
 */
export async function processDump(
    dumpUrl: string,
    options: { force: boolean; dryRun: boolean },
): Promise<DumpStats> {
    const stats: DumpStats = { linesRead: 0, matched: 0, withGroups: 0, written: 0, skipped: 0, errors: 0 };

    const known = await prisma.$queryRaw<{ hotel_id: string }[]>(
        Prisma.sql`SELECT hotel_id FROM hotel_content WHERE hotel_id ~ '^[0-9]+$'`,
    );
    const knownIds = new Set(known.map(row => String(row.hotel_id)));

    let seededIds = new Set<string>();
    if (!options.force) {
        const seeded = await prisma.$queryRaw<{ hotel_id: string }[]>(Prisma.sql`
            SELECT hotel_id FROM hotel_content
             WHERE room_groups_seeded_at IS NOT NULL AND hotel_id ~ '^[0-9]+$'
        `);
        seededIds = new Set(seeded.map(row => String(row.hotel_id)));
    }
    console.log(`[etg-dump] ${knownIds.size} hotels known, ${seededIds.size} already seeded`);

    // Armed before the request and pushed forward by every chunk, so it fires only when the
    // transfer has actually stopped moving.
    const stall = new AbortController();
    let stallTimer: NodeJS.Timeout = setTimeout(() => stall.abort(), STALL_TIMEOUT_MS);
    const keepAlive = () => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => stall.abort(), STALL_TIMEOUT_MS);
    };

    let res: Response;
    try {
        res = await fetch(dumpUrl, { signal: stall.signal });
    } catch (err) {
        clearTimeout(stallTimer);
        throw err;
    }
    if (!res.ok || !res.body) {
        clearTimeout(stallTimer);
        throw new Error(`Dump download ${res.status}`);
    }

    const batch: BatchRow[] = [];
    const decoder = new TextDecoder();
    // Node 24 decompresses Zstandard natively, which is why this file needs no package for it.
    // The typings in @types/node here still predate that, so the call is reached through a
    // narrow shim rather than by bumping types the rest of the repo is pinned against.
    const createZstdDecompress = (zlib as unknown as {
        createZstdDecompress: () => zlib.BrotliDecompress;
    }).createZstdDecompress;
    const decompressor = createZstdDecompress();
    let tail = '';

    // Lines are assembled from decompressed chunks; a chunk boundary rarely lands on a newline.
    const onChunk = async (chunk: Buffer) => {
        tail += decoder.decode(chunk, { stream: true });
        let newline: number;
        while ((newline = tail.indexOf('\n')) !== -1) {
            const line = tail.slice(0, newline).trim();
            tail = tail.slice(newline + 1);
            if (!line) continue;

            stats.linesRead++;
            if (stats.linesRead % 50_000 === 0) {
                console.log(`[etg-dump] ${stats.linesRead} lines | matched=${stats.matched} written=${stats.written}`);
            }

            let hotel: Record<string, unknown>;
            try { hotel = JSON.parse(line); } catch { stats.errors++; continue; }

            const hid  = String(hotel.hid ?? '');
            const slug = String(hotel.id ?? '');
            if (!hid || !knownIds.has(hid)) continue;
            stats.matched++;

            if (!options.force && seededIds.has(hid)) { stats.skipped++; continue; }

            const groups = parseRoomGroups((hotel.room_groups as unknown[]) ?? []);
            if (groups.length > 0) stats.withGroups++;
            if (options.dryRun) continue;

            batch.push({
                hid,
                slug,
                roomGroups: JSON.stringify(groups),
                extra: JSON.stringify({
                    ci:   hotel.check_in_time  ?? null,
                    co:   hotel.check_out_time ?? null,
                    desc: parseDescription(hotel.description_struct) ?? hotel.description ?? null,
                    ag:   parseAmenityGroups(hotel.amenity_groups),
                    imgs: parseImages(hotel.images),
                    sf:   Array.isArray(hotel.serp_filters) ? hotel.serp_filters : [],
                    mp:   hotel.metapolicy_struct ?? null,
                    mpe:  hotel.metapolicy_extra_info ?? null,
                }),
            });
            if (batch.length >= BATCH_SIZE) await flushBatch(batch, stats);
        }
    };

    // Fed by one loop, consumed by another, one chunk at a time.
    //
    // `onChunk` awaits a database round trip whenever a batch fills, and a `data` listener
    // does not wait for it. Chunks therefore kept arriving mid-flush and ran concurrently
    // over the same `tail`, the same `batch` and the same `batch.length = 0` — interleaving
    // line reassembly, letting the batch grow past its bound, and holding every chunk's
    // text live in a `pending` array until the stream ended. On 2026-10-01 that took the
    // whole api-v2 process down partway through a real run: the connection reset, and
    // nothing was left in the log to say why.
    //
    // A dry run could never have found it. `dryRun` returns before the first `await`, so
    // `onChunk` ran to completion synchronously and nothing interleaved — which is exactly
    // how the check written to prove the download fixed passed over this.
    //
    // `for await` takes one chunk at a time and stops pulling while one is in flight, and
    // the `drain` wait does the same for the writing side.
    let pumpError: unknown;
    const pump = (async () => {
        const reader = res.body!.getReader();
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            keepAlive();
            if (!decompressor.write(Buffer.from(value))) await once(decompressor, 'drain');
        }
        decompressor.end();
    })().catch((err: unknown) => {
        // Surfaced through the consumer, so an aborted download fails the run rather than
        // leaving `for await` waiting on a stream nobody is still feeding.
        pumpError = err;
        decompressor.destroy(err instanceof Error ? err : new Error(String(err)));
    });

    try {
        for await (const chunk of decompressor) await onChunk(chunk as Buffer);
    } finally {
        clearTimeout(stallTimer);
    }
    await pump;
    if (pumpError) throw pumpError;

    if (!options.dryRun) await flushBatch(batch, stats);
    return stats;
}
