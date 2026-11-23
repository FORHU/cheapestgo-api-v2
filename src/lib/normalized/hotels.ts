/**
 * Hotel listings and rates into `NormalizedHotel` — one mapper per supplier (#53).
 *
 * The inputs are what each provider adapter already returns (`HotelListing`, `RoomType`): the
 * adapters own the wire formats, and the AI tools ask the same search the site does. What these
 * mappers remove is the vocabulary that still leaks through those shapes — `refundableTag`,
 * `_tgxToken`, `TgxCancelPolicy`, a supplier's board code, a review rating of 0 that means "none".
 *
 * See `src/types/normalized.ts` for which supplier fills which field.
 */

import type { HotelListing, RoomType, TgxCancelPenalty } from '@/types/hotels';
import type {
    BoardBasis,
    CancellationPenalty,
    HotelSupplier,
    Money,
    NormalizedCancellation,
    NormalizedHotel,
    NormalizedRoom,
} from '@/types/normalized';

// ─── Per supplier ─────────────────────────────────────────────────────────────

/**
 * A TravelgateX listing. A city search carries only the cheapest room, and that room's
 * cancellation penalties are not asked for there (only whether it is refundable); pass `rooms`
 * from `getRates` for the full set.
 */
export function travelgatexHotel(listing: HotelListing, rooms?: RoomType[]): NormalizedHotel {
    return core('travelgatex', listing, rooms ?? listing.roomTypes ?? []);
}

/**
 * An ETG region-search listing (province and country searches). ETG prices the hotel, not its
 * rooms, and says nothing about cancellation at that point, so it has no rooms here: the hotel
 * has to be re-asked through TravelgateX to be booked.
 */
export function etgHotel(listing: HotelListing): NormalizedHotel {
    return core('etg', listing, []);
}

/** A listing from the development supplier. Same shape as TravelgateX's, priced by our own rules. */
export function mockHotel(listing: HotelListing, rooms?: RoomType[]): NormalizedHotel {
    return core('mock', listing, rooms ?? listing.roomTypes ?? []);
}

/** Which supplier a listing came from, by what the adapters stamp on it. */
export function hotelSupplierOf(listing: Pick<HotelListing, 'provider' | 'offerId'>): HotelSupplier {
    if (listing.provider === 'etg' || listing.offerId?.startsWith('ETG:')) return 'etg';
    if (listing.provider === 'mock' || listing.offerId?.startsWith('MOCK:')) return 'mock';
    return 'travelgatex';
}

/** Any listing, by its supplier. What the AI tools call. */
export function normalizeHotel(listing: HotelListing, rooms?: RoomType[]): NormalizedHotel {
    switch (hotelSupplierOf(listing)) {
        case 'etg':  return etgHotel(listing);
        case 'mock': return mockHotel(listing, rooms);
        default:     return travelgatexHotel(listing, rooms);
    }
}

// ─── Shared core ──────────────────────────────────────────────────────────────

function core(supplier: HotelSupplier, l: HotelListing, rooms: RoomType[]): NormalizedHotel {
    const lat = positive(l.lat ?? l.coordinates?.lat, true);
    const lng = positive(l.lng ?? l.coordinates?.lng, true);
    // No coordinates is 0,0 in the listings — a point in the Atlantic, not a hotel.
    const located = lat !== null && lng !== null && !(lat === 0 && lng === 0);

    const reviewCount = positive(l.reviewCount ?? l.reviews);
    const nightly = positive(l.price);

    return {
        id:           String(l.hotelId ?? l.id),
        supplier,
        name:         l.name,
        starRating:   positive(l.starRating),
        // A rating with no reviews behind it is the catalog's default, not a score.
        guestRating:  reviewCount === null ? null : positive(l.reviewRating ?? l.rating),
        reviewCount,
        amenities:    uniqueText(l.amenities),
        location: {
            address:            text(l.address),
            city:               text(l.city),
            country:            text(l.country),
            lat:                located ? lat : null,
            lng:                located ? lng : null,
            neighborhood:       null,
            distanceToCenterKm: null,
            distanceToMetroKm:  null,
        },
        checkInTime:  text(l.checkInTime),
        checkOutTime: text(l.checkOutTime),
        image:        text(l.image) ?? text(l.images?.[0]),
        nightlyFrom:  nightly === null || !l.currency ? null : { amount: nightly, currency: l.currency },
        rooms:        rooms.map(room),
    };
}

function room(r: RoomType): NormalizedRoom {
    return {
        id:           r.offerId,
        name:         r.roomName,
        board:        boardBasis(r.boardCode),
        total:        { amount: r.price, currency: r.currency },
        cancellation: cancellation(r),
    };
}

/**
 * The room's cancellation terms. `refundable` comes from the room itself; the penalty steps from
 * its policy where the supplier sent them. The free window is the time before the first step —
 * only on a refundable room, since a non-refundable one has no free window to speak of.
 */
export function cancellation(r: Pick<RoomType, 'refundable' | 'refundableTag' | 'cancelPolicy'>): NormalizedCancellation {
    const refundable =
        typeof r.cancelPolicy?.refundable === 'boolean' ? r.cancelPolicy.refundable
        : r.refundableTag === 'RFN' ? true
        : r.refundableTag === 'NRFN' ? false
        : typeof r.refundable === 'boolean' && r.refundableTag !== 'UNKNOWN' ? r.refundable
        : null;

    const penalties = (r.cancelPolicy?.cancelPenalties ?? [])
        .map(penalty)
        .filter((p): p is CancellationPenalty => p !== null)
        .sort((a, b) => a.from.localeCompare(b.from));

    return {
        refundable,
        freeUntil: refundable === true && penalties.length > 0 ? penalties[0].from : null,
        penalties,
    };
}

/** One supplier penalty step. `PERCENT` and `NIGHTS` are said so; any other kind is an amount. */
function penalty(p: TgxCancelPenalty & { type?: string }): CancellationPenalty | null {
    if (!p?.deadline || typeof p.value !== 'number') return null;
    const kind = String(p.penaltyType ?? p.type ?? '').toUpperCase();
    if (kind === 'PERCENT') return { from: p.deadline, amount: null, percent: p.value, nights: null };
    if (kind === 'NIGHTS')  return { from: p.deadline, amount: null, percent: null, nights: p.value };
    const amount: Money = { amount: p.value, currency: p.currency };
    return { from: p.deadline, amount, percent: null, nights: null };
}

/**
 * The suppliers' meal words, into ours. TravelgateX passes RateHawk's (`nomeal`, `breakfast`,
 * `half-board`…), ETG sends the same as `meal`, the mock uses the trade codes (`RO`, `BB`, `HB`).
 */
export function boardBasis(code: string | null | undefined): BoardBasis | null {
    const c = String(code ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
    if (!c) return null;
    if (['ro', 'nomeal', 'no-meal', 'room-only', 'sc', 'self-catering'].includes(c)) return 'room_only';
    if (['bb', 'breakfast', 'breakfast-included', 'continental-breakfast', 'american-breakfast', 'english-breakfast', 'buffet-breakfast'].includes(c)) return 'breakfast';
    if (['hb', 'half-board', 'halfboard', 'dinner', 'half-board-lunch', 'half-board-dinner'].includes(c)) return 'half_board';
    if (['fb', 'full-board', 'fullboard'].includes(c)) return 'full_board';
    if (['ai', 'all-inclusive', 'allinclusive', 'ultra-all-inclusive'].includes(c)) return 'all_inclusive';
    return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A number worth reporting: finite and above zero, or (for coordinates) merely finite. */
function positive(value: unknown, allowAny = false): number | null {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    if (!Number.isFinite(n)) return null;
    return allowAny || n > 0 ? n : null;
}

function text(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t ? t : null;
}

function uniqueText(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
        const t = text(v);
        if (t && !seen.has(t.toLowerCase())) {
            seen.add(t.toLowerCase());
            out.push(t);
        }
    }
    return out;
}
