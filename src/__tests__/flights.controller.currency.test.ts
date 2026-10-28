import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The currency a traveller picked at checkout has to reach the two places that price a flight:
 * the quote (`GET /flights/offers/:offerId`) and the hold (`POST /flights/book`).
 *
 * `priceFlightCharge` has always taken a `displayCurrency`, but neither route ever passed one —
 * the web checkout's currency selector rewrote `?currency=` and nothing downstream listened, so
 * every flight was quoted and held in the airline's own currency whatever was chosen.
 */

const svc = vi.hoisted(() => ({ getOffer: vi.fn(), book: vi.fn() }));
vi.mock('@/services/flights.service', () => ({ FlightsService: vi.fn(function (this: any) { this.getOffer = svc.getOffer; this.book = svc.book; }) }));
vi.mock('@/lib/flights/revalidate', () => ({ revalidateFlight: vi.fn() }));

import { FlightsController } from '@/controllers/flights.controller';

const run = async (handler: (req: any, res: any, next: any) => Promise<void>, req: Record<string, unknown>) => {
    const res = { json: vi.fn() };
    const next = vi.fn();
    await handler({ params: {}, query: {}, body: {}, ...req }, res, next);
    return { res, next };
};

let ctrl: FlightsController;
beforeEach(() => {
    vi.clearAllMocks();
    svc.getOffer.mockResolvedValue({ offerId: 'off-1' });
    svc.book.mockResolvedValue({ clientSecret: 'cs' });
    ctrl = new FlightsController();
});

describe('GET /flights/offers/:offerId', () => {
    it('quotes in the currency asked for', async () => {
        await run(ctrl.offer, { params: { offerId: 'off-1' }, query: { currency: 'php' } });
        expect(svc.getOffer).toHaveBeenCalledWith('off-1', undefined, 'PHP');
    });

    it('quotes in the airline\'s currency when none is asked for', async () => {
        await run(ctrl.offer, { params: { offerId: 'off-1' } });
        expect(svc.getOffer).toHaveBeenCalledWith('off-1', undefined, undefined);
    });

    it('refuses something that is not a currency code, rather than pricing in it', async () => {
        const { next } = await run(ctrl.offer, { params: { offerId: 'off-1' }, query: { currency: 'pesos' } });
        expect(next).toHaveBeenCalledTimes(1);
        expect(svc.getOffer).not.toHaveBeenCalled();
    });
});

describe('POST /flights/book', () => {
    it('holds the card in the currency asked for', async () => {
        await run(ctrl.book, { user: { sub: 'u1' }, body: { offerId: 'off-1', displayCurrency: 'krw' } });
        expect(svc.book).toHaveBeenCalledWith(expect.objectContaining({ offerId: 'off-1', displayCurrency: 'KRW', userId: 'u1' }));
    });

    it('holds it in the airline\'s currency when none is asked for', async () => {
        await run(ctrl.book, { user: { sub: 'u1' }, body: { offerId: 'off-1' } });
        expect(svc.book.mock.calls[0][0].displayCurrency).toBeUndefined();
    });

    it('refuses something that is not a currency code before any card is held', async () => {
        const { next } = await run(ctrl.book, { user: { sub: 'u1' }, body: { offerId: 'off-1', displayCurrency: 'x' } });
        expect(next).toHaveBeenCalledTimes(1);
        expect(svc.book).not.toHaveBeenCalled();
    });
});
