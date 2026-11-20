import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@/config', () => ({ config: {} }));

import { placeDuffelOrder } from '@/lib/flights/duffel';

/**
 * The switch that stops a deployment buying a real airline ticket.
 *
 * Hotels have had HOTEL_BOOKING_ENABLED since the Kyoto incident; flights never did, and Duffel
 * is live wherever a `duffel_live_` token is set. On 2026-11-18 production held a test Stripe key
 * and a live Duffel token at once, so a test card could have paid for a real ticket.
 *
 * What is asserted here is not only that it refuses, but the SHAPE of the refusal: the lifecycle
 * only releases the payment hold when `!timedOut && status < 500`. A refusal that got that wrong
 * would read as "the airline may have taken it", keep the traveller's money and need a human.
 */
const switchOff = () => { process.env.FLIGHT_BOOKING_ENABLED = 'false'; };

afterEach(() => { delete process.env.FLIGHT_BOOKING_ENABLED; });

const order = () => placeDuffelOrder({
    rawOffer: { id: 'off_test' }, passengers: [], total: '100.00', currency: 'PHP',
    priceTolerance: 0, idempotencyKey: 'k',
} as any);

describe('FLIGHT_BOOKING_ENABLED=false', () => {
    it('refuses before the airline is asked', async () => {
        switchOff();
        const result = await order();
        expect(result.kind).toBe('error');
    });

    it('refuses definitively, so the hold is released rather than kept', async () => {
        switchOff();
        const result: any = await order();
        // Both halves of the lifecycle's test for "we know this did not happen".
        expect(result.timedOut).toBeFalsy();
        expect(result.status).toBeLessThan(500);
    });

    it('says why, in words the traveller is shown', async () => {
        switchOff();
        const result: any = await order();
        expect(result.data?.errors?.[0]?.message).toContain('switched off');
    });
});

describe('unset', () => {
    it('is not a refusal — no environment changes behaviour until somebody sets it', async () => {
        expect(process.env.FLIGHT_BOOKING_ENABLED).toBeUndefined();
        // It gets as far as needing a Duffel token, which is the proof it did not short-circuit.
        const result = await order().catch((err: any) => ({ kind: 'threw', err }));
        expect((result as any).status).not.toBe(403);
    });
});
