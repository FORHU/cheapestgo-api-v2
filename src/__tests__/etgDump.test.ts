import { describe, it, expect, vi, afterEach } from 'vitest';
import { getDumpUrl } from '@/lib/hotels/etgDump';

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
