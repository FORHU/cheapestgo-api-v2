/**
 * The passengers of a Duffel order, built from what the traveller typed and the offer being
 * bought.
 *
 * Extracted from `FlightsService.book` so the order can be placed later than the booking form
 * is submitted — once the card has been authorised — from what the session stored.
 */

import { duffelIdentityDocuments } from '@/lib/flights/duffelIdentityDocuments';

/**
 * The contact phone in E.164, which Duffel requires on every passenger, or null when what was
 * typed cannot be one. A number without a `+` is national: its country code is put in front
 * (Korea when none was given) and its trunk zeros dropped.
 */
export function orderPhoneNumber(contact: { phone: string; countryCode?: string }): string | null {
    const phoneInput = String(contact.phone ?? '').trim();
    let e164Phone: string;
    if (phoneInput.startsWith('+')) {
        e164Phone = phoneInput.replace(/[\s\-()]/g, '');
    } else {
        const rawCountryCode = String(contact.countryCode ?? '82').replace(/\D/g, '') || '82';
        const cleaned = phoneInput.replace(/\D/g, '').replace(/^0+/, '');
        e164Phone = `+${rawCountryCode}${cleaned}`;
    }
    return /^\+\d{7,15}$/.test(e164Phone) ? e164Phone : null;
}

const duffelTitle = (pax: any): string => {
    const g = (pax.gender ?? '').toUpperCase();
    const t = (pax.type ?? '').toUpperCase();
    if (t === 'CHD' || t === 'INF') return g === 'M' ? 'mr' : 'miss';
    return g === 'M' ? 'mr' : 'ms';
};

/**
 * One order passenger per traveller, by position: the ids an order must quote come from the
 * offer, in the order the offer request listed them.
 *
 * @param contact `phone` already in E.164 — see `orderPhoneNumber`.
 */
export function buildOrderPassengers(
    rawOffer: any,
    passengers: any[],
    contact: { email: string; phone: string },
): any[] {
    const duffelPaxTemplates: any[] = rawOffer.passengers ?? [];

    const built = passengers.map((pax: any, idx: number) => ({
        id: duffelPaxTemplates[idx]?.id,
        title: duffelTitle(pax),
        given_name: pax.firstName,
        family_name: pax.lastName,
        born_on: pax.dateOfBirth ?? pax.birthDate,
        email: contact.email,
        phone_number: contact.phone,
        gender: (pax.gender ?? '').toUpperCase() === 'M' ? 'm' : 'f',
        // Passport details for the airline's APIS feed. The form requires them and
        // then none of it was sent, so the traveller had to supply it again at
        // check-in. Only where the offer asks — some sources reject an order that
        // volunteers them.
        ...duffelIdentityDocuments(rawOffer, {
            passport:       pax.passport ?? pax.passportNumber,
            passportExpiry: pax.passportExpiry,
            nationality:    pax.nationality,
        }),
    }));

    linkInfantsToAdults(built, passengers, duffelPaxTemplates);
    return built;
}

type Role = 'adult' | 'infant' | 'other';

/**
 * Who a traveller is to the airline. The offer's own passenger type is the authority — it is
 * what the fare was priced for — and the form's label is only the fallback for an offer that
 * lists none.
 */
function roleOf(pax: any, template: any): Role {
    const offerType = String(template?.type ?? '').toLowerCase();
    if (offerType) return offerType.startsWith('infant') ? 'infant' : offerType === 'adult' ? 'adult' : 'other';
    const formType = String(pax?.type ?? '').toUpperCase();
    return formType === 'INF' ? 'infant' : formType === 'ADT' ? 'adult' : 'other';
}

/**
 * Name each infant on a responsible adult: the adult's `infant_passenger_id` is the infant's
 * passenger id. Duffel refuses an order with infants that does not, and every infant needs an
 * adult of its own, so the first infant goes with the first adult, the second with the second.
 * An infant with no adult left is left unlinked for Duffel to refuse in its own words.
 */
function linkInfantsToAdults(built: any[], travellers: any[], templates: any[]): void {
    const roles = travellers.map((pax, i) => roleOf(pax, templates[i]));
    const adults  = roles.flatMap((r, i) => (r === 'adult' ? [i] : []));
    const infants = roles.flatMap((r, i) => (r === 'infant' ? [i] : []));

    infants.forEach((infantIdx, n) => {
        const adultIdx = adults[n];
        const infantId = built[infantIdx]?.id;
        if (adultIdx === undefined || !infantId) return;
        built[adultIdx].infant_passenger_id = infantId;
    });
}
