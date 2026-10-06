import { describe, it, expect } from 'vitest';
import { duffelIdentityDocuments, offerWantsIdentityDocuments } from '@/lib/flights/duffelIdentityDocuments';

const wants = { passenger_identity_documents_required: true };
const pax = { passport: 'P1234567', passportExpiry: '2031-05-14', nationality: 'ph' };

describe('offerWantsIdentityDocuments', () => {
    it('reads the offer flag strictly', () => {
        expect(offerWantsIdentityDocuments(wants)).toBe(true);
        expect(offerWantsIdentityDocuments({ passenger_identity_documents_required: false })).toBe(false);
        expect(offerWantsIdentityDocuments({})).toBe(false);
        expect(offerWantsIdentityDocuments(null)).toBe(false);
    });
});

describe('duffelIdentityDocuments', () => {
    it('sends the passport the traveller was required to enter', () => {
        expect(duffelIdentityDocuments(wants, pax)).toEqual({
            identity_documents: [{
                type: 'passport',
                unique_identifier: 'P1234567',
                issuing_country_code: 'PH',
                expires_on: '2031-05-14',
            }],
        });
    });

    it('stays silent when the offer did not ask — some sources reject the extra field', () => {
        expect(duffelIdentityDocuments({}, pax)).toEqual({});
    });

    it('omits the block entirely rather than sending a partial document', () => {
        expect(duffelIdentityDocuments(wants, { ...pax, passport: '' })).toEqual({});
        expect(duffelIdentityDocuments(wants, { ...pax, passportExpiry: '' })).toEqual({});
        expect(duffelIdentityDocuments(wants, { ...pax, nationality: 'PHL' })).toEqual({});
        expect(duffelIdentityDocuments(wants, {})).toEqual({});
    });

    it('trims stray whitespace off a pasted passport number', () => {
        const out = duffelIdentityDocuments(wants, { ...pax, passport: '  P1234567 ' });
        expect(out.identity_documents?.[0].unique_identifier).toBe('P1234567');
    });
});
