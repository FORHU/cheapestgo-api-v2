/**
 * Lazy-initialised Stripe client.
 * Import `stripe` for any Stripe API calls within the api-v2 server.
 */

import Stripe from 'stripe';
import { config } from '@/config';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
    if (!_stripe) {
        _stripe = new Stripe(config.STRIPE_SECRET_KEY, {
            apiVersion: '2025-02-24.acacia' as any,
        });
    }
    return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
    get(_target, prop) {
        return (getStripe() as any)[prop];
    },
});
