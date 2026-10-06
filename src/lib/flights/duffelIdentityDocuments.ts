/**
 * Passport details for the airline's APIS feed, in Duffel's order shape.
 *
 * The booking form requires a passport number, an expiry date and a nationality,
 * and validates all three — and then none of it went anywhere. Neither order
 * body carried `identity_documents`, so the airline never received any of it and
 * the traveller had to supply it again at check-in. Data demanded of someone and
 * then discarded is worse than data never asked for.
 *
 * Gated on the offer's own flag. Duffel's guidance is to send these only where
 * the carrier asks for them, and some sources reject an order that volunteers
 * them unrequested — so an ungated version of this would have turned a silent
 * omission into a failed booking.
 */

export interface IdentityDocumentFields {
    identity_documents?: Array<{
        type: 'passport';
        unique_identifier: string;
        issuing_country_code: string;
        expires_on: string;
    }>;
}

/** True when the offer says the airline wants identity documents at booking. */
export function offerWantsIdentityDocuments(rawOffer: any): boolean {
    return rawOffer?.passenger_identity_documents_required === true;
}

/**
 * The `identity_documents` fragment to spread into a Duffel order passenger, or
 * an empty object when the offer does not want them or the details are
 * incomplete. Never partial: a half-filled document is rejected by Duffel and
 * would fail the whole booking over a field the airline never asked for.
 */
export function duffelIdentityDocuments(rawOffer: any, pax: any): IdentityDocumentFields {
    if (!offerWantsIdentityDocuments(rawOffer)) return {};

    const number = String(pax?.passport ?? '').trim();
    const expiresOn = String(pax?.passportExpiry ?? '').trim();
    const country = String(pax?.nationality ?? '').trim().toUpperCase();

    if (!number || !expiresOn || country.length !== 2) return {};

    return {
        identity_documents: [{
            type: 'passport',
            unique_identifier: number,
            issuing_country_code: country,
            expires_on: expiresOn,
        }],
    };
}
