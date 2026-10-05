import { describe, it, expect, vi, afterEach } from 'vitest';
import zlib from 'zlib';
import { getDumpUrl, processDump } from '@/lib/hotels/etgDump';

vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn() } }));

/**
 * C6: the ETG content dump, which is what fills the catalog.
 *
 * The URL handshake is checked here because a supplier response that changed shape would
 * otherwise surface as a 500 inside a nightly cron nobody reads, and the symptom — hotels with
 * no photographs — looks nothing like its cause.
 */

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (response: unknown) => {
    const fetchMock = vi.fn(async (_url?: unknown, _init?: unknown) => response as Response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

describe('getDumpUrl', () => {
    it('asks for the incremental dump when that is what was wanted', async () => {
        const fetchMock = stubFetch({
            ok: true,
            json: async () => ({ data: { url: 'https://example.test/dump.jsonl.zst' } }),
        });

        await expect(getDumpUrl('incremental')).resolves.toBe('https://example.test/dump.jsonl.zst');
        expect(String((fetchMock.mock.calls[0] ?? [])[0])).toContain('/hotel/info/incremental_dump/');
    });

    it('asks for the full dump otherwise', async () => {
        const fetchMock = stubFetch({
            ok: true,
            json: async () => ({ data: { url: 'https://example.test/full.jsonl.zst' } }),
        });

        await getDumpUrl('full');
        expect(String((fetchMock.mock.calls[0] ?? [])[0])).toContain('/hotel/info/dump/');
    });

    it('says what went wrong when the supplier answers without a URL', async () => {
        stubFetch({ ok: true, json: async () => ({ data: {} }) });
        await expect(getDumpUrl('full')).rejects.toThrow(/No dump URL/);
    });

    it('does not swallow a refusal from ETG', async () => {
        stubFetch({ ok: false, status: 403, json: async () => ({}) });
        await expect(getDumpUrl('full')).rejects.toThrow(/403/);
    });
});

/**
 * The download gives up on silence, not on duration.
 *
 * `AbortSignal.timeout` on a `fetch` bounds the body stream as well as the handshake, so a
 * whole-transfer deadline is really a bet on the dump's size against the link's speed. The
 * dump grows; a developer's connection does not. At 250 s that bet was lost locally on
 * 2026-10-01 after 1,000,000 lines and 323,538 matched hotels, all discarded.
 *
 * The stream below delivers steadily but takes far longer in total than any fixed budget
 * would have allowed, with every gap comfortably inside the stall window. It must finish.
 */
describe('processDump — a slow but moving download', () => {
    /**
     * Three zstd frames of JSONL, handed over one at a time on the test's own clock.
     *
     * The reader honours `signal`, which is the whole point: a stub that ignores it cannot
     * tell a re-armed timeout from a fixed one, because the abort reaches nothing. A first
     * version of this test did ignore it and passed just as happily against the bug.
     */
    function trickleResponse(gapMs: number, lines: string[], signal?: AbortSignal) {
        // Through a shim for the same reason etgDump.ts decompresses through one: the
        // @types/node this repo is pinned against predates Node's native Zstandard.
        const zstdCompressSync = (zlib as unknown as {
            zstdCompressSync: (buf: Buffer) => Buffer;
        }).zstdCompressSync;
        const chunks = lines.map(l => zstdCompressSync(Buffer.from(l + '\n')));
        let i = 0;
        return {
            ok: true,
            status: 200,
            body: {
                getReader: () => ({
                    read: () => new Promise<{ value?: Uint8Array; done: boolean }>((resolve, reject) => {
                        if (signal?.aborted) return reject(abortError());
                        const timer = setTimeout(
                            () => resolve(i < chunks.length
                                ? { value: new Uint8Array(chunks[i++]), done: false }
                                : { done: true }),
                            gapMs,
                        );
                        signal?.addEventListener('abort', () => {
                            clearTimeout(timer);
                            reject(abortError());
                        }, { once: true });
                    }),
                }),
            },
        } as unknown as Response;
    }

    const abortError = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

    it('is not aborted by a transfer that simply takes a long time', async () => {
        const { prisma } = await import('@/lib/prisma');
        // Two hotels in the catalog; the dump carries one of them and one stranger.
        vi.mocked(prisma.$queryRaw).mockResolvedValue([{ hotel_id: '111' }, { hotel_id: '222' }] as never);

        // Eight lines, so the transfer runs well past the 250 s a fixed deadline allowed.
        // Shorten it and the stream finishes inside the old budget, and the test passes
        // against the bug — which is exactly what the first version of it did.
        const lines = [
            JSON.stringify({ hid: 111, id: 'one', room_groups: [{ name_struct: { main_name: 'Standard' }, images: ['a'] }] }),
            JSON.stringify({ hid: 222, id: 'two', room_groups: [] }),
            ...Array.from({ length: 6 }, (_, n) => JSON.stringify({ hid: 900 + n, id: `x${n}`, room_groups: [] })),
        ];
        vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: { signal?: AbortSignal }) =>
            trickleResponse(60_000, lines, init?.signal)));

        vi.useFakeTimers();
        try {
            const run = processDump('https://example.invalid/dump.jsonl.zst', { force: true, dryRun: true });
            // Nine reads a minute apart — nine minutes in all, with no single gap within
            // reach of the stall window.
            for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(60_000);
            const stats = await run;

            expect(stats.linesRead).toBe(8);
            expect(stats.matched).toBe(2);
        } finally {
            vi.useRealTimers();
        }
    });
});

/**
 * One chunk is finished with before the next is started.
 *
 * `onChunk` awaits the database once a batch fills, and the stream used to be consumed by a
 * `data` listener that did not wait for it. Chunks arriving during a flush ran concurrently
 * over the same `tail`, the same `batch`, and the same `batch.length = 0` — so rows pushed
 * by one invocation were counted by another's `stats.written += batch.length` and then
 * discarded unwritten by its reset.
 *
 * Asserted on the hotel ids that actually reached the database, because that is the damage:
 * a run can report more written than it wrote.
 */
describe('processDump — writing while the stream is still arriving', () => {
    /** Every line in one frame per chunk, delivered as fast as the consumer will take them. */
    function burstResponse(lines: string[], perChunk: number) {
        const zstdCompressSync = (zlib as unknown as {
            zstdCompressSync: (buf: Buffer) => Buffer;
        }).zstdCompressSync;
        const frames: Buffer[] = [];
        for (let i = 0; i < lines.length; i += perChunk) {
            frames.push(zstdCompressSync(Buffer.from(lines.slice(i, i + perChunk).join('\n') + '\n')));
        }
        let i = 0;
        return {
            ok: true,
            status: 200,
            body: {
                getReader: () => ({
                    read: async () => (i < frames.length
                        ? { value: new Uint8Array(frames[i++]), done: false }
                        : { done: true }),
                }),
            },
        } as unknown as Response;
    }

    it('writes every matched hotel exactly once, and counts only what it wrote', async () => {
        const { prisma } = await import('@/lib/prisma');
        const HOTELS = 900;                       // more than BATCH_SIZE, so flushes land mid-stream
        const ids = Array.from({ length: HOTELS }, (_, n) => String(100000 + n));

        vi.mocked(prisma.$queryRaw).mockResolvedValue(ids.map(hotel_id => ({ hotel_id })) as never);

        // Each write yields, which is the window the old code let the next chunk run in.
        const writtenIds: string[] = [];
        vi.mocked(prisma.$executeRaw).mockImplementation((async (sql: { values: unknown[] }) => {
            await new Promise(r => setTimeout(r, 0));
            writtenIds.push(...(sql.values[0] as string[]));
            return (sql.values[0] as string[]).length;
        }) as never);

        vi.stubGlobal('fetch', vi.fn(async () => burstResponse(
            ids.map(hid => JSON.stringify({ hid: Number(hid), id: `slug-${hid}`, room_groups: [] })),
            50,
        )));

        const stats = await processDump('https://example.invalid/dump.jsonl.zst', { force: true, dryRun: false });

        expect(stats.linesRead).toBe(HOTELS);
        expect(stats.matched).toBe(HOTELS);
        // No id written twice, none missed, and the tally matches the writes.
        expect(new Set(writtenIds).size).toBe(HOTELS);
        expect(writtenIds).toHaveLength(HOTELS);
        expect(stats.written).toBe(HOTELS);
    });
});
