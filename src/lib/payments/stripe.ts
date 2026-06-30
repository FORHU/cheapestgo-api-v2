import Stripe from 'stripe';
import { config } from '@/config';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
    if (!_stripe) {
        const key = config.STRIPE_SECRET_KEY;
        if (!key) throw new Error('STRIPE_SECRET_KEY is missing');
        _stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' as any });
    }
    return _stripe;
}

// Lazy proxy — safe to import at module load without a key being set yet
export const stripe = new Proxy({} as Stripe, {
    get(_target, prop) {
        return (getStripe() as any)[prop];
    },
});
