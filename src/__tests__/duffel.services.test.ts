import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));

import { getDuffelAvailableServices } from '@/lib/flights/duffel';

describe('getDuffelAvailableServices', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('surfaces the Duffel status when the offer is gone', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ errors: [{ code: 'not_found', message: 'Not found' }] }), { status: 404 }),
        ));
        await expect(getDuffelAvailableServices('off_gone')).rejects.toMatchObject({ status: 404 });
    });
});
