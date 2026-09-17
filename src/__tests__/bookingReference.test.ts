import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { bookingReferenceFromBytes, mintBookingReference, isBookingReference } from '@/lib/payments/bookingReference';

/**
 * QA BG-19 (hotels): proceeding to payment a second time for the same room failed with
 * Stripe's "Keys for idempotent requests can only be used with the same parameters", because
 * each attempt minted a new random reference into the PaymentIntent. Reproduced against
 * Stripe test mode: first 200, second 500; with a seeded reference both return the same
 * PaymentIntent.
 */

const seed = (key: string) => createHash('sha256').update(key).digest();

describe('bookingReferenceFromBytes', () => {
    it('gives the same reference for the same idempotency key — so Stripe can replay it', () => {
        const key = 'hotel-pi-user-1-abc123';
        expect(bookingReferenceFromBytes(seed(key), 'CheapestGo')).toBe(bookingReferenceFromBytes(seed(key), 'CheapestGo'));
    });

    it('gives different references for different bookings', () => {
        expect(bookingReferenceFromBytes(seed('hotel-pi-user-1-a'), 'CheapestGo'))
            .not.toBe(bookingReferenceFromBytes(seed('hotel-pi-user-1-b'), 'CheapestGo'));
    });

    it('produces a well-formed reference for each brand', () => {
        expect(isBookingReference(bookingReferenceFromBytes(seed('k'), 'CheapestGo'))).toBe(true);
        expect(bookingReferenceFromBytes(seed('k'), 'AirangGo')).toMatch(/^GG-/);
    });

    it('refuses too few bytes', () => {
        expect(() => bookingReferenceFromBytes(new Uint8Array(3))).toThrow();
    });

    it('random minting still works as before', () => {
        expect(isBookingReference(mintBookingReference('CheapestGo'))).toBe(true);
    });
});
