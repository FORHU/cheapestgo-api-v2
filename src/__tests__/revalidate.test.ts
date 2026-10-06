import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config', () => ({ config: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' } }));

import { revalidateFlight } from '@/lib/flights/revalidate';

/**
 * The price check before the card is entered. Two rules carry it: only an increase is worth
 * interrupting a traveller for, and a provider that cannot answer must not block a booking
 * the order path could still complete.
 */

const offer = (price: number) => ({ _rawOffer: { id: 'off_1' }, price: { total: price } });

const priced = (total: string) => new Response(JSON.stringify({
    data: {
        total_amount: total,
        conditions: {
            refund_before_departure: { allowed: true, penalty_amount: '25.00', penalty_currency: 'USD' },
            change_before_departure: { allowed: false },
        },
    },
}), { status: 200 });

beforeEach(() => vi.unstubAllGlobals());

describe('revalidateFlight', () => {
    it('asks the traveller to confirm a rise beyond the tolerance', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => priced('320.00')));
        await expect(revalidateFlight({ provider: 'duffel', flightPayload: offer(250) }))
            .resolves.toMatchObject({ success: true, priceChanged: true, newPrice: 320 });
    });

    it('adopts a drop instead of confirming it', async () => {
        // A confirmation with no decision in it — and roughly half of all observed drift.
        vi.stubGlobal('fetch', vi.fn(async () => priced('199.00')));
        const result = await revalidateFlight({ provider: 'duffel', flightPayload: offer(250) });
        expect(result.priceChanged).toBe(false);
        expect(result.newPrice).toBe(199);
    });

    it('reports the fare conditions the offer came back with', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => priced('250.00')));
        const { farePolicy } = await revalidateFlight({ provider: 'duffel', flightPayload: offer(250) });
        expect(farePolicy).toMatchObject({
            isRefundable: true, isChangeable: false,
            refundPenaltyAmount: 25, refundPenaltyCurrency: 'USD',
            policyVersion: 'revalidated', policySource: 'duffel',
        });
    });

    it('lets the booking proceed when Duffel cannot answer', async () => {
        // The order path re-quotes and surfaces the real error in its own words; refusing here
        // would block a booking over a provider hiccup.
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
        await expect(revalidateFlight({ provider: 'duffel', flightPayload: offer(250) }))
            .resolves.toMatchObject({ success: true, priceChanged: false });

        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
        await expect(revalidateFlight({ provider: 'duffel', flightPayload: offer(250) }))
            .resolves.toMatchObject({ success: true, priceChanged: false });
    });

    it('passes an offer with no id rather than refusing it', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        await expect(revalidateFlight({ provider: 'duffel', flightPayload: { price: { total: 250 } } }))
            .resolves.toMatchObject({ success: true, priceChanged: false });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refuses a request it cannot act on', async () => {
        await expect(revalidateFlight({})).resolves.toMatchObject({ success: false, badRequest: true });
        await expect(revalidateFlight({ provider: 'amadeus', flightPayload: offer(250) }))
            .resolves.toMatchObject({ success: false, badRequest: true });
    });
});
