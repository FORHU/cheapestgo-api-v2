import { describe, it, expect } from 'vitest';
import { buildOrderPassengers, orderPhoneNumber } from '@/lib/flights/orderPassengers';

describe('orderPhoneNumber', () => {
    it('keeps an international number, without its punctuation', () => {
        expect(orderPhoneNumber({ phone: '+63 (917) 123-4567' })).toBe('+639171234567');
    });

    it('puts the country code in front of a national number, dropping its trunk zero', () => {
        expect(orderPhoneNumber({ phone: '0917 123 4567', countryCode: '63' })).toBe('+639171234567');
        expect(orderPhoneNumber({ phone: '9171234567', countryCode: '+63' })).toBe('+639171234567');
    });

    it('assumes Korea when no country code was given', () => {
        expect(orderPhoneNumber({ phone: '010-1234-5678' })).toBe('+821012345678');
        expect(orderPhoneNumber({ phone: '01012345678', countryCode: '' })).toBe('+821012345678');
    });

    it('refuses what is not a phone number', () => {
        expect(orderPhoneNumber({ phone: '+12345' })).toBeNull();
        expect(orderPhoneNumber({ phone: '' })).toBeNull();
        expect(orderPhoneNumber({ phone: '+1234567890123456' })).toBeNull();
        expect(orderPhoneNumber({ phone: undefined as unknown as string })).toBeNull();
    });
});

describe('buildOrderPassengers', () => {
    const offer = {
        passengers: [{ id: 'pas_adult' }, { id: 'pas_child' }, { id: 'pas_infant' }],
        passenger_identity_documents_required: false,
    };
    const contact = { email: 'juan@example.com', phone: '+639171234567' };

    it('quotes the offer\'s passenger ids in order, and the contact on every passenger', () => {
        const out = buildOrderPassengers(offer, [
            { firstName: 'Juan', lastName: 'Cruz', dateOfBirth: '1990-01-01', gender: 'M', type: 'ADT' },
            { firstName: 'Ana', lastName: 'Cruz', birthDate: '2018-05-05', gender: 'F', type: 'CHD' },
            { firstName: 'Leo', lastName: 'Cruz', birthDate: '2026-01-01', gender: 'M', type: 'INF' },
        ], contact);

        expect(out).toEqual([
            { id: 'pas_adult', title: 'mr', given_name: 'Juan', family_name: 'Cruz', born_on: '1990-01-01',
                email: 'juan@example.com', phone_number: '+639171234567', gender: 'm' },
            { id: 'pas_child', title: 'miss', given_name: 'Ana', family_name: 'Cruz', born_on: '2018-05-05',
                email: 'juan@example.com', phone_number: '+639171234567', gender: 'f' },
            { id: 'pas_infant', title: 'mr', given_name: 'Leo', family_name: 'Cruz', born_on: '2026-01-01',
                email: 'juan@example.com', phone_number: '+639171234567', gender: 'm' },
        ]);
    });

    it('titles an adult woman ms and treats an unknown gender as female', () => {
        const out = buildOrderPassengers(offer, [{ firstName: 'Maria', lastName: 'Cruz', birthDate: '1985-02-02' }], contact);
        expect(out[0]).toMatchObject({ title: 'ms', gender: 'f' });
    });

    it('sends a passport only where the offer asks for one', () => {
        const pax = { firstName: 'Juan', lastName: 'Cruz', birthDate: '1990-01-01', gender: 'm',
            passportNumber: 'P1234567', passportExpiry: '2031-01-01', nationality: 'ph' };

        expect(buildOrderPassengers(offer, [pax], contact)[0]).not.toHaveProperty('identity_documents');
        expect(buildOrderPassengers({ ...offer, passenger_identity_documents_required: true }, [pax], contact)[0])
            .toMatchObject({
                identity_documents: [{ type: 'passport', unique_identifier: 'P1234567', issuing_country_code: 'PH', expires_on: '2031-01-01' }],
            });
    });
});
