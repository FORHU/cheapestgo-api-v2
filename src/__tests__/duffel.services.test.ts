import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));

import { getDuffelAvailableServices } from '@/lib/flights/duffel';

describe('getDuffelAvailableServices', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('reads services from GET /air/offers/:id?return_available_services=true', async () => {
        // Duffel has no /air/offers/:id/available_services sub-resource — it 404s for every offer.
        const bag = { id: 'ase_1', type: 'baggage', total_amount: '30.00', total_currency: 'USD' };
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ data: { id: 'off_1', available_services: [bag] } }), { status: 200 }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(getDuffelAvailableServices('off_1')).resolves.toEqual([bag]);
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.duffel.com/air/offers/off_1?return_available_services=true');
    });

    it('surfaces the Duffel status when the offer is gone', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ errors: [{ code: 'not_found', message: 'Not found' }] }), { status: 404 }),
        ));
        await expect(getDuffelAvailableServices('off_gone')).rejects.toMatchObject({ status: 404 });
    });
});
