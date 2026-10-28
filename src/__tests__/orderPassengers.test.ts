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
            // The adult travels with the infant, so the airline is told which infant is theirs.
            { id: 'pas_adult', title: 'mr', given_name: 'Juan', family_name: 'Cruz', born_on: '1990-01-01',
                email: 'juan@example.com', phone_number: '+639171234567', gender: 'm', infant_passenger_id: 'pas_infant' },
            { id: 'pas_child', title: 'miss', given_name: 'Ana', family_name: 'Cruz', born_on: '2018-05-05',
                email: 'juan@example.com', phone_number: '+639171234567', gender: 'f' },
            { id: 'pas_infant', title: 'mr', given_name: 'Leo', family_name: 'Cruz', born_on: '2026-01-01',
                email: 'juan@example.com', phone_number: '+639171234567', gender: 'm' },
        ]);
    });

    // Duffel refuses an order with an infant unless a responsible adult names it
    // (`infant_passenger_id`), and every infant needs an adult of its own. Without this every
    // booking with an infant passed `book`, held the card, and was refused at `confirm`.
    describe('infants', () => {
        const family = {
            passengers: [
                { id: 'pas_a1', type: 'adult' }, { id: 'pas_a2', type: 'adult' },
                { id: 'pas_c1', type: 'child' },
                { id: 'pas_i1', type: 'infant_without_seat' }, { id: 'pas_i2', type: 'infant_without_seat' },
            ],
            passenger_identity_documents_required: false,
        };
        const person = (firstName: string, type: string, birthDate: string) =>
            ({ firstName, lastName: 'Cruz', birthDate, gender: 'M', type });

        it('names each infant on its own responsible adult, in order', () => {
            const out = buildOrderPassengers(family, [
                person('Juan', 'ADT', '1990-01-01'), person('Maria', 'ADT', '1991-01-01'),
                person('Ana', 'CHD', '2018-05-05'),
                person('Leo', 'INF', '2026-01-01'), person('Lia', 'INF', '2026-02-01'),
            ], contact);

            expect(out[0].infant_passenger_id).toBe('pas_i1');
            expect(out[1].infant_passenger_id).toBe('pas_i2');
        });

        it('puts the link on adults only — never on the child or the infants themselves', () => {
            const out = buildOrderPassengers(family, [
                person('Juan', 'ADT', '1990-01-01'), person('Maria', 'ADT', '1991-01-01'),
                person('Ana', 'CHD', '2018-05-05'),
                person('Leo', 'INF', '2026-01-01'), person('Lia', 'INF', '2026-02-01'),
            ], contact);

            for (const i of [2, 3, 4]) expect(out[i]).not.toHaveProperty('infant_passenger_id');
        });

        it('leaves an adult with no infant without the field', () => {
            const out = buildOrderPassengers(
                { passengers: [{ id: 'pas_a1', type: 'adult' }, { id: 'pas_a2', type: 'adult' }, { id: 'pas_i1', type: 'infant_without_seat' }] },
                [person('Juan', 'ADT', '1990-01-01'), person('Maria', 'ADT', '1991-01-01'), person('Leo', 'INF', '2026-01-01')],
                contact,
            );

            expect(out[0].infant_passenger_id).toBe('pas_i1');
            expect(out[1]).not.toHaveProperty('infant_passenger_id');
        });

        it('reads who is an infant from the form when the offer does not say', () => {
            // The offer fixture above this block lists no passenger types.
            const out = buildOrderPassengers(offer, [
                person('Juan', 'ADT', '1990-01-01'), person('Ana', 'CHD', '2018-05-05'), person('Leo', 'INF', '2026-01-01'),
            ], contact);

            expect(out[0].infant_passenger_id).toBe('pas_infant');
        });

        it('sends nothing extra when nobody is travelling with an infant', () => {
            const out = buildOrderPassengers(
                { passengers: [{ id: 'pas_a1', type: 'adult' }, { id: 'pas_c1', type: 'child' }] },
                [person('Juan', 'ADT', '1990-01-01'), person('Ana', 'CHD', '2018-05-05')],
                contact,
            );

            for (const p of out) expect(p).not.toHaveProperty('infant_passenger_id');
        });
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
