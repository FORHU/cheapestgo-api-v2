import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));

import { getDuffelOffer } from '@/lib/flights/duffel';

const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });

describe('getDuffelOffer', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it('reads one offer by id', async () => {
        const fetchMock = vi.fn().mockResolvedValue(ok({ id: 'off_1', total_amount: '100.00' }));
        vi.stubGlobal('fetch', fetchMock);

        expect(await getDuffelOffer('off_1')).toEqual({ id: 'off_1', total_amount: '100.00' });
        expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/air\/offers\/off_1$/);
    });

    it('asks for the seats and bags on sale only when told to — they are what a chosen service is priced from', async () => {
        const fetchMock = vi.fn().mockResolvedValue(ok({ id: 'off_1', available_services: [{ id: 'ase_1' }] }));
        vi.stubGlobal('fetch', fetchMock);

        await getDuffelOffer('off_1', { withServices: true });

        expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/air\/offers\/off_1\?return_available_services=true$/);
    });

    it('answers null for an offer that is gone', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
        expect(await getDuffelOffer('off_gone')).toBeNull();
    });

    it('throws on any other failure — gone and unreachable are different answers', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ errors: [{ message: 'Service unavailable' }] }), { status: 503 }),
        ));
        await expect(getDuffelOffer('off_1')).rejects.toThrow('Service unavailable');
    });
});
