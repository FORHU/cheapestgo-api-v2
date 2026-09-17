/**
 * What Stripe actually charged us on a payment, as opposed to what pricing.ts
 * guessed it would.
 *
 * `STRIPE_RATE` has to be an estimate — the markup is computed before a charge
 * exists — but it was never checked against anything. It carried 2.9%, Stripe's
 * US domestic-card rate, while **Charge Currency** is deliberately KRW, USD and
 * PHP; a foreign-issued card paying in a non-USD currency plausibly costs nearer
 * 5.4% once the international-card and conversion surcharges land. Nothing in the
 * system would have noticed, because `balance_transaction` was read nowhere.
 *
 * Stripe reports the exact figure per charge, for free, on the balance
 * transaction. Recording it makes the estimate reconcilable rather than assumed:
 * the model still prices from `STRIPE_RATE`, and the ledger knows what was really
 * taken, so drift shows up in a query instead of in an invoice. See ADR-0036.
 */
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { fromStripeAmount } from '@/lib/pricing';

/**
 * Recorded alongside a payment. Every field optional: a booking must never fail,
 * nor lose its ledger row, because a reporting figure could not be read.
 */
export interface RecordedStripeFee {
    /** What Stripe took, in major units of the settlement currency. */
    stripeFee?: number;
    /** Settlement currency — not necessarily the Charge Currency. */
    stripeFeeCurrency?: string;
    /** What landed in the balance, gross less fee. */
    stripeNet?: number;
    /** fee ÷ gross. The number `STRIPE_RATE` is estimating. */
    stripeFeeRate?: number;
    /** Issuing country of the card, which is *why* the rate is what it is. */
    stripeCardCountry?: string;
    /** Present instead of the rest when the fee could not be read. */
    stripeFeeError?: string;
}

/** The expand path a PaymentIntent needs before {@link extractStripeFee} can read it. */
export const STRIPE_FEE_EXPAND = ['latest_charge.balance_transaction'];

/**
 * Read the fee off an already-retrieved PaymentIntent.
 *
 * Requires the intent to have been retrieved with {@link STRIPE_FEE_EXPAND};
 * without it `latest_charge` is a bare id string and there is nothing to read.
 */
export function extractStripeFee(pi: Stripe.PaymentIntent): RecordedStripeFee {
    try {
        const charge = pi.latest_charge as Stripe.Charge | string | null;
        if (!charge || typeof charge === 'string') {
            return { stripeFeeError: 'latest_charge not expanded' };
        }

        const txn = charge.balance_transaction as Stripe.BalanceTransaction | string | null;
        if (!txn || typeof txn === 'string') {
            return { stripeFeeError: 'balance_transaction not expanded' };
        }

        // The balance transaction settles in the account's own currency, which is
        // not always what the customer was charged in — so its own currency
        // decides the minor-unit rule, never the PaymentIntent's.
        const fee = fromStripeAmount(txn.fee, txn.currency);
        const gross = fromStripeAmount(txn.amount, txn.currency);

        return {
            stripeFee: fee,
            stripeFeeCurrency: txn.currency.toUpperCase(),
            stripeNet: fromStripeAmount(txn.net, txn.currency),
            stripeFeeRate: gross > 0 ? Math.round((fee / gross) * 10000) / 10000 : undefined,
            stripeCardCountry: charge.payment_method_details?.card?.country ?? undefined,
        };
    } catch (err: any) {
        return { stripeFeeError: err?.message ?? 'unknown error reading balance transaction' };
    }
}

/**
 * Retrieve a PaymentIntent and read its fee. For callers that do not already
 * hold one — a webhook's event payload never has the balance transaction
 * expanded, so it has to be fetched.
 *
 * Never throws.
 */
export async function fetchStripeFee(paymentIntentId: string): Promise<RecordedStripeFee> {
    try {
        const pi = await getStripe().paymentIntents.retrieve(paymentIntentId, {
            expand: STRIPE_FEE_EXPAND,
        });
        return extractStripeFee(pi);
    } catch (err: any) {
        return { stripeFeeError: err?.message ?? 'retrieve failed' };
    }
}
