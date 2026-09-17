/**
 * The identifier CheapestGo puts on a sale.
 *
 * FORHU Inc settles several products into one Stripe account and one bank account, and
 * Stripe pays out daily as a single pooled deposit — so no per-charge field can split the
 * bank line. Attribution therefore has to happen inside Stripe, which means every charge
 * needs a reference that names the platform it came from. The old hotel reference was
 * `FORHU-<millis>-<rand>`, which named the *company* — the one thing every project shares —
 * and so carried no signal at all. Flights had no reference of ours whatsoever; admin showed
 * the airline's PNR and called it a ref.
 *
 * The prefix is derived from the brand rather than stored beside it, so a reference and its
 * `source_brand` cannot drift apart.
 */

/** Crockford base32: no I, L, O or U, so nothing is misheard as 1, 0 or read as a word. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 6;

const BRAND_PREFIX: Record<string, string> = {
    CheapestGo: 'CG',
    AirangGo: 'GG',
    // GeomeeGo was AirangGo's name until the 2026-09 rebrand. Kept because the prefix is
    // resolved from whatever NEXT_PUBLIC_BRAND_NAME the process was started with, and the
    // Korean instance keeps serving the old value until it is redeployed — dropping this
    // would silently mint CG- references for AirangGo sales in that window and file them
    // under the wrong brand in Stripe. The prefix stays GG so references already issued
    // remain readable and no two brands ever share one.
    GeomeeGo: 'GG',
};

/** Falls back to CG so an unrecognised brand still yields a usable reference. */
export function brandPrefix(brand?: string | null): string {
    return BRAND_PREFIX[(brand ?? '').trim()] ?? 'CG';
}

/**
 * A new reference, e.g. `CG-7K2M9Q`. Random rather than sequential: a counter would let
 * anyone holding two references read off the booking volume between them.
 *
 * 32^6 ≈ 1.07e9 combinations. Collisions are still possible, so the column carries a unique
 * index and callers retry — see `mintUniqueBookingReference`.
 */
export function mintBookingReference(brand?: string | null): string {
    const bytes = new Uint8Array(LENGTH);
    crypto.getRandomValues(bytes);
    return bookingReferenceFromBytes(bytes, brand);
}

/**
 * The reference for a given seed — the same seed always yields the same reference.
 *
 * For a charge created under an idempotency key. Stripe replays an idempotent request only
 * when its parameters are identical; a reference minted at random on each attempt made a
 * retry's metadata differ, and Stripe refused it outright ("Keys for idempotent requests can
 * only be used with the same parameters"). A customer who went to payment, stepped back and
 * proceeded again could not pay at all (QA BG-19). Seeded from a hash of the key, a retry
 * sends the same reference and gets the same PaymentIntent back.
 *
 * Pass at least LENGTH bytes of a cryptographic hash, so references stay unpredictable.
 */
export function bookingReferenceFromBytes(bytes: Uint8Array, brand?: string | null): string {
    if (bytes.length < LENGTH) throw new Error(`A booking reference needs at least ${LENGTH} bytes.`);
    // 256 is an exact multiple of 32, so the modulo is unbiased.
    let suffix = '';
    for (const b of bytes.subarray(0, LENGTH)) suffix += ALPHABET[b % ALPHABET.length];
    return `${brandPrefix(brand)}-${suffix}`;
}

/** Matches a reference of any known brand. Anchored — a substring match would accept a PNR. */
export const BOOKING_REFERENCE_PATTERN = /^(CG|GG)-[0-9A-HJKMNP-TV-Z]{6}$/;

export function isBookingReference(value: unknown): value is string {
    return typeof value === 'string' && BOOKING_REFERENCE_PATTERN.test(value);
}

/**
 * Mints a reference that no row already holds.
 *
 * `exists` is injected rather than importing a db handle so this stays usable from any
 * booking path — the hotel and flight flows write to different tables. Gives up after a few
 * attempts and returns the last candidate: at this volume a run of collisions means the
 * probe is broken, and failing the sale over a reference would be the wrong trade.
 */
export async function mintUniqueBookingReference(
    brand: string | null | undefined,
    exists: (ref: string) => Promise<boolean>,
    attempts = 5,
): Promise<string> {
    let ref = mintBookingReference(brand);
    for (let i = 0; i < attempts; i++) {
        try {
            if (!(await exists(ref))) return ref;
        } catch {
            return ref; // a failing probe must not block the sale
        }
        ref = mintBookingReference(brand);
    }
    return ref;
}
