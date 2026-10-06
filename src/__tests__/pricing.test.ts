import { describe, it, expect } from 'vitest';
import {
    applyMarkup, bundleSavingPercent, calculateStripeFee, enrichBookingFinances,
    estimateNetProfit, fromStripeAmount, hotelServiceFee, toStripeAmount,
    FLIGHT_MARKUP_SPEC, HOTEL_MARKUP_SPEC, STRIPE_RATE, HOTEL_FX_DISPLAY_TOLERANCE,
} from '@/lib/pricing';
import { capAtDisplayedTotal } from '@/lib/payments/chargeBase';

/**
 * What a customer is charged, and what is left afterwards.
 *
 * The figures below are the ones ADR-0036 was written around, so a change that moves them
 * should fail here and be argued for, rather than land as a quiet repricing.
 */

describe('the markup is flat plus proportional', () => {
    it('charges a flight the rate plus the flat component', () => {
        // $100 → 7.2% + $4.40 = $11.60. The cap (12% = $12.00) does not bind.
        const p = applyMarkup(100, FLIGHT_MARKUP_SPEC);
        expect(p.markupAmount).toBe(11.60);
        expect(p.chargedPrice).toBe(111.60);
        expect(p.capped).toBe(false);
    });

    it('caps the fee on a cheap fare', () => {
        // $50 → 7.2% + $4.40 = $8.00 uncapped, which is 16% of the fare. The flat part is a
        // large share of a small number, and the cap is what stops the checkout jump.
        const p = applyMarkup(50, FLIGHT_MARKUP_SPEC);
        expect(p.capped).toBe(true);
        expect(p.markupAmount).toBe(6.00);         // 12% of 50
        expect(p.markupRate).toBe(0.12);
    });

    it('reports the effective rate, not the configured one', () => {
        // markup_pct is stored beside the amounts, so it has to be the rate those amounts
        // actually imply — after the flat component and the cap.
        const p = applyMarkup(300, FLIGHT_MARKUP_SPEC);
        expect(p.markupRate).toBeCloseTo(p.markupAmount / 300, 4);
        expect(p.markupRate).not.toBe(FLIGHT_MARKUP_SPEC.rate);
    });

    it('converges towards the rate as the fare grows', () => {
        // The flat component matters less the larger the fare, which is the whole reason a
        // single percentage cannot recover this cost.
        const big = applyMarkup(100_000, FLIGHT_MARKUP_SPEC);
        expect(big.markupRate).toBeCloseTo(FLIGHT_MARKUP_SPEC.rate, 3);
    });

    it('takes the flat component in the base price currency, not in USD', () => {
        // ₱5,800 fare: adding 4.40 without converting charges ₱4.40, about eight US cents.
        const pesos = applyMarkup(5800, FLIGHT_MARKUP_SPEC, 4.40 * 58);
        expect(pesos.markupFlat).toBe(255.20);
        expect(pesos.markupAmount).toBe(672.80);   // 7.2% of 5800 = 417.60, + 255.20
    });

    it('charges a hotel the rate plus the flat component ADR-0036 set', () => {
        // $0.40 + 5.9%. Both were decided; the flat part used to be passed as zero.
        const fee = hotelServiceFee(300, 'USD', (a) => a);
        expect(fee.serviceFee).toBe(18.10);
        expect(fee.chargedTotal).toBe(318.10);
    });

    it('adds nothing to a zero or negative base', () => {
        // A flat fee on a zero base is an unbounded rate, and there is nothing to cap it
        // against.
        expect(applyMarkup(0, FLIGHT_MARKUP_SPEC).chargedPrice).toBe(0);
        expect(applyMarkup(0, FLIGHT_MARKUP_SPEC).markupAmount).toBe(0);
        expect(applyMarkup(-10, FLIGHT_MARKUP_SPEC).markupAmount).toBe(0);
    });

    it('never advertises a bundle saving', () => {
        // Bundling swapped one rate for a lower one and called the gap a discount; the gap
        // is an earmarked provision, so spending it would spend committed money.
        expect(bundleSavingPercent()).toBe(0);
    });
});

describe('the hotel fee a customer is shown is the fee they are charged', () => {
    const pesosPerDollar = (a: number, from: string, to: string) =>
        from === to ? a : from === 'USD' && to === 'PHP' ? a * 58 : NaN;

    it('converts the flat part into the charge currency', () => {
        // ₱0.40 would be about seven US cents; $0.40 is ₱23.20.
        const fee = hotelServiceFee(17_400, 'PHP', pesosPerDollar);
        expect(fee.markupFlat).toBe(23.20);
        expect(fee.serviceFee).toBe(1049.80);    // 5.9% of 17,400 = 1,026.60, + 23.20
    });

    it('drops the flat part rather than refusing the sale when rates are missing', () => {
        // Forty cents is not worth losing a booking over, and a fee shown without it is never
        // higher than the fee charged with it.
        const fee = hotelServiceFee(17_400, 'PHP', () => { throw new Error('no rates'); });
        expect(fee.markupFlat).toBe(0);
        expect(fee.serviceFee).toBe(1026.60);
    });

    it('is what the old hardcoded checkout percentages were not', () => {
        // v1 showed 5% and app-v2 showed 6% while the server charged 5.9% — the displayed
        // total came from arithmetic the charge never used.
        const fee = hotelServiceFee(300, 'USD', (a) => a);
        expect(fee.chargedTotal).not.toBe(315.00);   // v1's 5%
        expect(fee.chargedTotal).not.toBe(318.00);   // app-v2's rounded 6%
    });
});

describe('nothing is billed above the total the customer was shown', () => {
    it('charges the server figure when it is at or below what was shown', () => {
        expect(capAtDisplayedTotal(318.10, 318.10, 'USD')).toEqual({ ok: true, total: 318.10, absorbed: 0 });
        expect(capAtDisplayedTotal(318.00, 318.10, 'USD')).toEqual({ ok: true, total: 318.00, absorbed: 0 });
    });

    it('holds the displayed total when a rate refresh nudged the fee up', () => {
        // The flat part converts at whatever rate is current, so a refresh between prebook
        // and payment can move the total by a few cents. The customer pays what they saw.
        const r = capAtDisplayedTotal(18_450.12, 18_450.00, 'PHP');
        expect(r).toEqual({ ok: true, total: 18_450.00, absorbed: 0.12 });
    });

    it('asks the customer to confirm a total that moved beyond tolerance', () => {
        // A checkout still showing 5% against a 5.9% charge: that is not rounding, and it is
        // not absorbed.
        const r = capAtDisplayedTotal(318.10, 315.00, 'usd');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.code).toBe('PRICE_CHANGED');
            expect(r.serverPrice).toBe(318.10);
            expect(r.currency).toBe('USD');
        }
    });

    it('charges the server figure when no displayed total was sent', () => {
        expect(capAtDisplayedTotal(318.10, undefined, 'USD')).toEqual({ ok: true, total: 318.10, absorbed: 0 });
        expect(capAtDisplayedTotal(318.10, 0, 'USD')).toEqual({ ok: true, total: 318.10, absorbed: 0 });
        expect(capAtDisplayedTotal(318.10, Number.NaN, 'USD')).toEqual({ ok: true, total: 318.10, absorbed: 0 });
    });
});

describe('Stripe amounts', () => {
    it('sends minor units for a two-decimal currency', () => {
        expect(toStripeAmount(317.70, 'USD')).toBe(31770);
        expect(toStripeAmount(317.70, 'php')).toBe(31770);
    });

    it('sends whole units for a zero-decimal one', () => {
        expect(toStripeAmount(1_200_000, 'KRW')).toBe(1_200_000);
        expect(toStripeAmount(15_000, 'jpy')).toBe(15_000);
    });

    it('reads a zero-decimal amount back at its own scale', () => {
        // Dividing by 100 by hand is right by accident for USD and out by a hundredfold for
        // KRW: v1 quoted a ₩12,000 refund on a ₩1,200,000 booking that way.
        expect(fromStripeAmount(1_200_000, 'KRW')).toBe(1_200_000);
        expect(fromStripeAmount(31770, 'USD')).toBe(317.70);
    });

    it('round-trips', () => {
        for (const [amount, currency] of [[317.70, 'USD'], [1_200_000, 'KRW'], [58.05, 'EUR']] as const) {
            expect(fromStripeAmount(toStripeAmount(amount, currency), currency)).toBe(amount);
        }
    });
});

describe('what is left after Stripe', () => {
    it('measures Stripe at the rate this account actually pays', () => {
        // 4.4%, not the headline 2.9%: the account is US-registered and the cards are not,
        // so every charge carries the international surcharge.
        expect(STRIPE_RATE).toBe(0.044);
        expect(calculateStripeFee(100)).toBe(4.70);   // 4.4% + $0.30
    });

    it('leaves a hotel booking a thin but positive margin', () => {
        // $300 hotel: $18.10 markup against $14.30 of Stripe. This is the number
        // HOTEL_FX_DISPLAY_TOLERANCE is sized against — the tolerance must stay well under
        // the margin, or a difference absorbed inside it turns the booking into a loss.
        const net = estimateNetProfit(300, HOTEL_MARKUP_SPEC);
        expect(net).toBeGreaterThan(0);
        expect(HOTEL_FX_DISPLAY_TOLERANCE).toBeLessThan(net / (300 + 18.10));
    });
});

describe('reporting a booking whose finances are incomplete', () => {
    const booking = { totalAmount: 317.70, supplierCost: 300, markupAmount: 17.70, profit: 0 };

    it('reads the rate off the booking itself', () => {
        const out = enrichBookingFinances(booking);
        expect(out.markupPercentage).toBe(5.90);
        expect(out.isEstimated).toBe(false);
        expect(out.stripeFee).toBe(calculateStripeFee(317.70));
    });

    it('reconstructs a missing supplier cost from the recorded rate', () => {
        const out = enrichBookingFinances({ ...booking, supplierCost: 0, markupAmount: 0, markup_pct: 0.059 });
        expect(out.supplierCost).toBe(300);
        expect(out.isEstimated).toBe(true);
    });

    it('reports a zero markup rather than inventing one', () => {
        // The old version inverted the *configured* rate, which has no term for a flat
        // component and is not the rate this booking was sold at. A visibly missing figure
        // gets investigated; an invented one gets banked.
        const out = enrichBookingFinances({ ...booking, supplierCost: 0, markupAmount: 0 });
        expect(out.markupAmount).toBe(0);
        expect(out.supplierCost).toBe(317.70);
        expect(out.isEstimated).toBe(true);
    });
});
