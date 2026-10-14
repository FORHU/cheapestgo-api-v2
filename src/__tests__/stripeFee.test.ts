import { describe, it, expect, vi } from 'vitest';

vi.mock('@/config', () => ({ config: {} }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({}) }));

import { extractStripeFee } from '@/lib/payments/stripeFee';

/**
 * What Stripe actually took, as opposed to what pricing.ts guessed it would.
 *
 * `STRIPE_RATE` has to be an estimate — the markup is computed before a charge exists — but
 * it was never checked against anything, and carried 2.9% while every live charge on this
 * account settles at 4.4%. Recording the real figure is what makes the estimate
 * reconcilable rather than assumed.
 */

const pi = (overrides: any = {}) => ({
    latest_charge: {
        balance_transaction: { fee: 528, amount: 12000, net: 11472, currency: 'usd' },
        payment_method_details: { card: { country: 'PH' } },
        ...overrides.charge,
    },
    ...overrides.pi,
}) as any;

describe('extractStripeFee', () => {
    it('reads the fee, the net and the rate off the balance transaction', () => {
        const fee = extractStripeFee(pi());
        expect(fee.stripeFee).toBe(5.28);
        expect(fee.stripeNet).toBe(114.72);
        expect(fee.stripeFeeRate).toBe(0.044);
        expect(fee.stripeFeeCurrency).toBe('USD');
    });

    it('records the card country, which is why the rate is what it is', () => {
        // A US-registered Stripe account and a non-US card is the international tier; that
        // is the 1.5 points over the headline rate.
        expect(extractStripeFee(pi()).stripeCardCountry).toBe('PH');
    });

    it('reads a zero-decimal settlement at its own scale', () => {
        // The balance transaction settles in the account's currency, which is not always
        // what the customer was charged in, so its own currency decides the minor-unit rule.
        const krw = extractStripeFee(pi({ charge: {
            balance_transaction: { fee: 52800, amount: 1_200_000, net: 1_147_200, currency: 'krw' },
        } }));
        expect(krw.stripeFee).toBe(52_800);
        expect(krw.stripeNet).toBe(1_147_200);
    });

    it('reports why it could not read rather than throwing', () => {
        // A booking must never fail, nor lose its ledger row, because a reporting figure
        // could not be read.
        expect(extractStripeFee({ latest_charge: 'ch_123' } as any).stripeFeeError)
            .toBe('latest_charge not expanded');
        expect(extractStripeFee({ latest_charge: { balance_transaction: 'txn_1' } } as any).stripeFeeError)
            .toBe('balance_transaction not expanded');
        expect(extractStripeFee({} as any).stripeFeeError).toBeTruthy();
    });

    it('never reports a rate it cannot compute', () => {
        const zero = extractStripeFee(pi({ charge: {
            balance_transaction: { fee: 0, amount: 0, net: 0, currency: 'usd' },
        } }));
        expect(zero.stripeFeeRate).toBeUndefined();
    });
});
