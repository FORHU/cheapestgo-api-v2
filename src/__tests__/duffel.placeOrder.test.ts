import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));

import { placeDuffelOrder } from '@/lib/flights/duffel';

const RAW_OFFER = { id: 'off_1', total_amount: '100.00', total_currency: 'USD', passengers: [{ id: 'pas_1' }] };
const PAX = [{ id: 'pas_1', given_name: 'Test', family_name: 'Sandbox' }];

/** Routes fetch by method + URL prefix; records every /air/orders body. */
function duffel(routes: Array<[string, string, () => { status: number; body: unknown }]>) {
    const orderBodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.endsWith('/air/orders')) orderBodies.push(JSON.parse(String(init!.body)).data);
        const route = routes.find(([m, p]) => m === method && url.startsWith(`https://api.duffel.com${p}`));
        if (!route) return new Response('{}', { status: 404 });
        const { status, body } = route[2]();
        return new Response(JSON.stringify(body), { status });
    }));
    return orderBodies;
}

describe('placeDuffelOrder — fare changes while ordering', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('re-prices the selected bag, because the price action never returns services', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        let orderCalls = 0;
        const orders = duffel([
            ['POST', '/air/orders', () => (++orderCalls === 1
                ? { status: 422, body: { errors: [{ code: 'price_changed', source: { offer_id: 'off_1' } }] } }
                : { status: 201, body: { data: { id: 'ord_1', total_amount: '125.00' } } })],
            // What Duffel really answers: the new fare, and no services at all.
            ['POST', '/air/offers/off_1/actions/price', () => ({ status: 200, body: { data: { id: 'off_1', total_amount: '105.00', total_currency: 'USD', available_services: [] } } })],
            ['GET', '/air/offers/off_1?return_available_services=true', () => ({ status: 200, body: { data: { id: 'off_1', available_services: [{ id: 'ase_bag', type: 'baggage', total_amount: '20.00' }] } } })],
        ]);

        const result = await placeDuffelOrder({
            rawOffer: RAW_OFFER, passengers: PAX, total: '120.00', currency: 'USD',
            bagServiceIds: ['ase_bag'], priceTolerance: 10, idempotencyKey: 'idem-1',
        });

        expect(result.kind).toBe('success');
        expect(orders).toHaveLength(2);
        expect(orders[1].payments[0].amount).toBe('125.00');
        expect(orders[1].services).toEqual([{ id: 'ase_bag', quantity: 1 }]);
    });

    it('re-prices a selected seat from the seat map', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        let orderCalls = 0;
        const orders = duffel([
            ['POST', '/air/orders', () => (++orderCalls === 1
                ? { status: 422, body: { errors: [{ code: 'price_changed', source: { offer_id: 'off_1' } }] } }
                : { status: 201, body: { data: { id: 'ord_1' } } })],
            ['POST', '/air/offers/off_1/actions/price', () => ({ status: 200, body: { data: { id: 'off_1', total_amount: '105.00', total_currency: 'USD', available_services: [] } } })],
            ['GET', '/air/seat_maps?offer_id=off_1', () => ({ status: 200, body: { data: [{ cabins: [{ rows: [{ sections: [{ elements: [
                { type: 'seat', available_services: [{ id: 'ase_seat', passenger_id: 'pas_1', total_amount: '12.50' }] },
            ] }] }] }] }] } })],
        ]);

        await placeDuffelOrder({
            rawOffer: RAW_OFFER, passengers: PAX, total: '112.50', currency: 'USD',
            seatServiceIds: ['ase_seat'], priceTolerance: 10, idempotencyKey: 'idem-2',
        });

        expect(orders[1].payments[0].amount).toBe('117.50');
    });
});
