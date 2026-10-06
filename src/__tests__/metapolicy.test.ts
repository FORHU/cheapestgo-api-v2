import { describe, it, expect } from 'vitest';
import { normalizeMetapolicy } from '@/lib/hotels/metapolicy';

/** The shape ETG actually sends: every key present, most of them empty. */
const etg = (over: Record<string, any> = {}) => ({
    cot: [], meal: [], pets: [], add_fee: [], deposit: [], parking: [],
    shuttle: [], children: [], internet: [], extra_bed: [], children_meal: [],
    check_in_check_out: [],
    visa:    { visa_support: 'unspecified' },
    no_show: { time: null, day_period: 'unspecified', availability: 'unspecified' },
    ...over,
});

const section = (m: ReturnType<typeof normalizeMetapolicy>, id: string) =>
    m?.sections.find(s => s.id === id);

/** The one row of a section that has exactly one. */
const onlyItem = (m: ReturnType<typeof normalizeMetapolicy>, id: string) => {
    const s = section(m, id);
    expect(s?.items).toHaveLength(1);
    return s!.items[0];
};

describe('normalizeMetapolicy', () => {
    it('says nothing when the hotel stated nothing', () => {
        // Every group empty and both singletons unspecified — which is what most
        // of the hotels carrying a metapolicy actually look like.
        expect(normalizeMetapolicy(etg())).toBeUndefined();
    });

    it('keeps the free text even when no section survives', () => {
        const m = normalizeMetapolicy(etg(), '  Guests must present a photo ID.  ');
        expect(m?.sections).toEqual([]);
        expect(m?.additionalInfo).toBe('Guests must present a photo ID.');
    });

    it('scopes its sections to the property, not the room', () => {
        // They are the hotel's rules, so the modal shows them whether or not a
        // room group matched.
        const m = normalizeMetapolicy(etg({ pets: [{ price: '350.00', currency: 'BRL', inclusion: 'not_included' }] }));
        expect(m!.sections.every(s => s.scope === 'property')).toBe(true);
    });

    it('drops a group ETG sent empty rather than drawing a bare heading', () => {
        const m = normalizeMetapolicy(etg({ pets: [{ price: '350.00', currency: 'BRL', inclusion: 'not_included' }] }));
        expect(m!.sections.map(s => s.id)).toEqual(['general']);
    });

    it('words a charge with its currency and unit', () => {
        const m = normalizeMetapolicy(etg({
            parking: [{ price: '80.00', currency: 'BRL', inclusion: 'not_included', price_unit: 'per_car_per_night', territory_type: 'on_side' }],
        }));
        expect(onlyItem(m, 'general')).toEqual({
            label: 'Parking (on site)',
            note:  'BRL 80 per car, per night',
        });
    });

    it('groups thousands and drops decimals that are all zero', () => {
        const m = normalizeMetapolicy(etg({
            shuttle: [{ price: '400000.00', currency: 'IDR', inclusion: 'not_included', shuttle_type: 'two_ways', destination_type: 'airport' }],
        }));
        // "two_ways" is ETG's plural; a guest calls it a return trip.
        expect(onlyItem(m, 'general')).toEqual({
            label: 'Shuttle (airport, return)',
            note:  'IDR 400,000',
        });
    });

    it('keeps the cents on an amount that has them', () => {
        const m = normalizeMetapolicy(etg({ meal: [{ price: '12.50', currency: 'EUR', inclusion: 'not_included', meal_type: 'breakfast' }] }));
        expect(onlyItem(m, 'food-drink').note).toBe('EUR 12.50');
    });

    it('reads a deposit availability, which states no inclusion of its own', () => {
        const m = normalizeMetapolicy(etg({
            deposit: [{ price: '500.00', currency: 'BRL', price_unit: 'per_guest_per_night', availability: 'available', deposit_type: 'unspecified', payment_type: 'unspecified' }],
        }));
        // Both qualifiers were "unspecified", so the row carries no parenthetical
        // rather than printing the word at a guest.
        expect(onlyItem(m, 'general')).toEqual({
            label: 'Deposit',
            icon:  'safe',
            note:  'BRL 500 per guest, per night',
        });
    });

    it('names a deposit that is taken in cash for a pet', () => {
        const m = normalizeMetapolicy(etg({
            deposit: [{ price: '25.00', currency: 'USD', price_unit: 'per_guest_per_stay', availability: 'available', deposit_type: 'pet', payment_type: 'cash' }],
        }));
        expect(onlyItem(m, 'general').label).toBe('Deposit (pet, cash)');
    });

    it('calls a zero price with a currency free', () => {
        const m = normalizeMetapolicy(etg({
            cot: [{ price: '0.00', amount: 1, currency: 'EUR', inclusion: 'not_included', price_unit: 'per_room_per_night' }],
        }));
        expect(onlyItem(m, 'beds-extra')).toEqual({ label: 'Cot (up to 1)', icon: 'child', note: 'Free' });
    });

    it('treats a zero price with no currency as no price at all', () => {
        // ETG writes "0.00" both for a genuinely free extra and for a charge the
        // hotel never filled in. Printing "Free" for the second would disclose
        // the opposite of the truth, so the currency is what decides.
        const m = normalizeMetapolicy(etg({
            children: [{ price: '0.00', currency: null, age_start: 0, age_end: 17, extra_bed: 'available' }],
        }));
        expect(onlyItem(m, 'child-policy')).toEqual({
            label: 'Children (ages 0–17)',
            icon:  'child',
            note:  'Extra bed available',
        });
    });

    it('still discloses a charge whose amount the hotel left blank', () => {
        // The guest needs to know to ask at the desk; what it must not read as
        // is an amount of zero.
        const m = normalizeMetapolicy(etg({
            pets: [{ price: '0.00', currency: null, inclusion: 'not_included', pets_type: 'unspecified' }],
        }));
        expect(onlyItem(m, 'general')).toEqual({ label: 'Pets', note: 'Not included in the rate' });
    });

    it('ignores a 0–0 age range, which is ETG leaving the field blank', () => {
        const m = normalizeMetapolicy(etg({
            children_meal: [{ price: '228.00', currency: 'BRL', age_start: 0, age_end: 0, inclusion: 'not_included', meal_type: 'breakfast' }],
        }));
        expect(onlyItem(m, 'child-policy').label).toBe("Children's meal (breakfast)");
    });

    it('drops a row that states nothing at all', () => {
        const m = normalizeMetapolicy(etg({
            pets: [{ price: '0.00', currency: null, inclusion: 'unspecified', pets_type: 'unspecified' }],
        }));
        expect(m).toBeUndefined();
    });

    it('carries no-show as a deadline, never as a fee', () => {
        // ETG's no_show has no price field. v1 tries to read a `noShowPenalty`
        // number out of a LiteAPI blob TravelgateX never sends; there is nothing
        // here to compute one from, and inventing one would be the worse error.
        const m = normalizeMetapolicy(etg({
            no_show: { time: '18:00', day_period: 'day_of_arrival', availability: 'available' },
        }));
        expect(onlyItem(m, 'general')).toEqual({ label: 'No-show', note: '18:00 day of arrival' });
    });

    it('drops the no-show row when ETG filled none of it in', () => {
        expect(normalizeMetapolicy(etg({ no_show: { time: null, day_period: 'unspecified', availability: 'unspecified' } }))).toBeUndefined();
    });

    it('reads visa support, the one singleton that is ever set', () => {
        const m = normalizeMetapolicy(etg({ visa: { visa_support: 'support_enable' } }));
        expect(onlyItem(m, 'general')).toEqual({ label: 'Visa support', note: 'Available' });
    });

    it('merges groups that share a heading, in the order a guest wants them', () => {
        const m = normalizeMetapolicy(etg({
            pets:      [{ price: '10.00', currency: 'EUR', inclusion: 'not_included' }],
            deposit:   [{ price: '50.00', currency: 'EUR', availability: 'available' }],
            extra_bed: [{ price: '20.00', currency: 'EUR', inclusion: 'not_included' }],
            meal:      [{ price: '9.00',  currency: 'EUR', inclusion: 'not_included', meal_type: 'breakfast' }],
        }));
        expect(m!.sections.map(s => s.id)).toEqual(['general', 'beds-extra', 'food-drink']);
        // Deposit before pets — it is the one that comes off a card on arrival.
        expect(section(m, 'general')!.items.map(i => i.label)).toEqual(['Deposit', 'Pets']);
    });

    it('keeps every row of a group that ETG sent more than once', () => {
        const m = normalizeMetapolicy(etg({
            check_in_check_out: [
                { price: '100.00', currency: 'THB', inclusion: 'not_included', check_in_check_out_type: 'early_check_in' },
                { price: '600.00', currency: 'THB', inclusion: 'not_included', check_in_check_out_type: 'late_check_out' },
            ],
        }));
        expect(section(m, 'general')!.items.map(i => i.label)).toEqual([
            'Early check-in / late check-out (early check-in)',
            'Early check-in / late check-out (late check-out)',
        ]);
    });

    it('parses a struct that arrived double-encoded as a JSON string', () => {
        // The same defect `normalizeAmenityList` absorbs: a jsonb column written
        // with an extra round of JSON.stringify.
        const m = normalizeMetapolicy(JSON.stringify(etg({
            parking: [{ price: '80.00', currency: 'BRL', inclusion: 'not_included' }],
        })));
        expect(onlyItem(m, 'general').note).toBe('BRL 80');
    });

    it('survives anything that is not a metapolicy', () => {
        expect(normalizeMetapolicy(null)).toBeUndefined();
        expect(normalizeMetapolicy(undefined)).toBeUndefined();
        expect(normalizeMetapolicy('not json at all')).toBeUndefined();
        expect(normalizeMetapolicy([1, 2, 3])).toBeUndefined();
        expect(normalizeMetapolicy({ pets: 'nonsense' })).toBeUndefined();
    });
});
