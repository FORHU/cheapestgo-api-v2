import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config', () => ({ config: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { resolveTgxDestinationCode } from '@/lib/hotels/travelgatex';
import { UnansweredSearchError } from '@/lib/hotels/search';

/**
 * An Unanswered Search is one the supplier never usefully answered — a timeout, an
 * overloaded handler, a destination code that never resolved, an empty catalog to fall
 * back on. It is not a No-Availability result, where the supplier answered and said
 * there is nothing. Only the second justifies pruning the Phase 1 catalog.
 */

describe('UnansweredSearchError', () => {
    it('carries the city and the reasons in its message', () => {
        const err = new UnansweredSearchError('Seoul', '2/5 hotel-code batches did not answer');
        expect(err.message).toContain('Seoul');
        expect(err.message).toContain('2/5 hotel-code batches did not answer');
        expect(err.cityName).toBe('Seoul');
    });

    it('is identifiable by name, which is how the stream controller tells it apart', () => {
        // The controller branches on `err?.name`, so this is load-bearing rather than
        // cosmetic — renaming it silently turns an unanswered search back into a
        // generic failure and the "prices could not be loaded" message is lost.
        expect(new UnansweredSearchError('Cebu', 'x').name).toBe('UnansweredSearchError');
        expect(new UnansweredSearchError('Cebu', 'x')).toBeInstanceOf(Error);
    });
});

describe('NONE sentinel', () => {
    const prismaWith = (destination_code: string | null) => ({
        tgx_destination_cache: {
            findUnique: vi.fn().mockResolvedValue(destination_code === null ? null : { destination_code }),
        },
    });

    it('is not a destination code — resolving it yields nothing', async () => {
        // `NONE` records that destinationSearcher had no destination for the city. It is
        // truthy, so a plain existence check hands the literal string to TGX as a
        // destination. v1 writes these rows and v2 reads the same schema.
        const code = await resolveTgxDestinationCode('none-sentinel-city', prismaWith('NONE'));
        expect(code).toBeUndefined();
    });

    it('still returns a real cached code', async () => {
        const code = await resolveTgxDestinationCode('real-code-city', prismaWith('3124'));
        expect(code).toBe('3124');
    });

    it('does not call the supplier when the sentinel is present', async () => {
        // The point of the sentinel is skipping an 18-second round-trip that already
        // failed once. Reaching destinationSearcher here would defeat it.
        const p = prismaWith('NONE');
        await resolveTgxDestinationCode('none-no-network-city', p);
        expect(p.tgx_destination_cache.findUnique).toHaveBeenCalledOnce();
    });
});
