/**
 * Reading Duffel's errors. Kept apart from the client (`duffel.ts`) so code that decides what an
 * error means can use it without pulling in, or being mocked out with, the HTTP client.
 */

/**
 * Does this Duffel error say the offer itself is gone — expired, sold, or replaced?
 *
 * Not every 422 does. A passenger, phone or document the airline will not take is a 422 too, and
 * reading those as "gone" searched the flight again and either reported a price change or placed a
 * second order (sandbox run 2026-11-11, BUG-2). A seat or bag that is no longer sold is its own
 * refusal, not a gone offer, so it is left out.
 */
export function isOfferGoneError(data: any): boolean {
    const err = data?.errors?.[0];
    if (!err) return false;
    if (err.code === 'offer_no_longer_available') return true;
    const message = String(err.message ?? err.title ?? '');
    if (/seat|service/i.test(message)) return false;
    return /expired|no longer available|select another offer/i.test(message);
}
