import { describe, it, expect } from 'vitest';
import { isSameAttempt, type AttemptTerms } from '@/lib/flights/lifecycle/sameAttempt';

const TERMS: AttemptTerms = {
    passengers:     [{ firstName: 'Juan', lastName: 'Cruz', birthDate: '1990-01-01', gender: 'M', type: 'ADT' }],
    contact:        { email: 'juan@example.com', phone: '9171234567', countryCode: '63' },
    seatServiceIds: ['seat_1'],
    bagServiceIds:  [],
    bundleHotelId:  null,
    amountMinor:    11160,
    currency:       'usd',
};

describe('isSameAttempt', () => {
    it('is the same attempt when only the order of the keys differs', () => {
        // The earlier attempt is read back from jsonb, which stores object keys in an order of
        // its own. The traveller sent the same details; they are the same attempt.
        const readBack: AttemptTerms = {
            ...TERMS,
            passengers: [{ type: 'ADT', gender: 'M', lastName: 'Cruz', firstName: 'Juan', birthDate: '1990-01-01' }],
            contact:    { phone: '9171234567', countryCode: '63', email: 'juan@example.com' },
            currency:   'USD',
        };
        expect(isSameAttempt(readBack, TERMS)).toBe(true);
    });

    it.each<[string, Partial<AttemptTerms>]>([
        ['a traveller\'s name was corrected',  { passengers: [{ ...(TERMS.passengers as any[])[0], lastName: 'Santos' }] }],
        ['a traveller was added',               { passengers: [...(TERMS.passengers as any[]), { firstName: 'Ana', lastName: 'Cruz', type: 'ADT' }] }],
        ['the contact phone changed',           { contact: { ...(TERMS.contact as any), phone: '9179999999' } }],
        ['a different seat was chosen',         { seatServiceIds: ['seat_2'] }],
        ['a bag was added',                     { bagServiceIds: ['bag_1'] }],
        ['the fare moved, so the hold would',   { amountMinor: 11500 }],
        ['it is held in another currency',      { currency: 'php' }],
        ['it is now bundled with a hotel',      { bundleHotelId: 'hotel_1' }],
    ])('is a different attempt when %s', (_, change) => {
        expect(isSameAttempt({ ...TERMS, ...change }, TERMS)).toBe(false);
    });

    it('reads no bundle the same however it is written', () => {
        // Stripe metadata has no null: an unbundled payment carries no key, or an empty one.
        expect(isSameAttempt({ ...TERMS, bundleHotelId: '' }, { ...TERMS, bundleHotelId: undefined })).toBe(true);
    });
});
