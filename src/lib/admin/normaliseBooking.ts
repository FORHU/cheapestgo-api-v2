/**
 * Put a hotel row and a flight row into one shape for the admin list.
 *
 * They live in separate tables with different column names — a hotel is identified by
 * `booking_id` and a flight by `pnr`, a flight's real charge is `charged_price` where a
 * hotel's is `total_price` — and admin needs one sortable list of both.
 *
 * The endpoint used to return raw Prisma rows while the client read `userId`,
 * `totalAmount` and `createdAt`, so a single booking crashed the page on
 * `booking.userId.slice()`. The mapping is here, and tested, so the contract the client
 * declares is one the server actually meets.
 */

export type AdminBookingType = 'hotel' | 'flight';

export interface AdminBooking {
    id: string;
    userId: string;
    type: AdminBookingType;
    status: string;
    totalAmount: number;
    currency: string;
    createdAt: string | Date;
    reference?: string;
    /** Names the booking, so an agent can match a caller without opening a row. */
    summary?: string;
}

/**
 * "9 Sep – 11 Sep", or a single date when there is only one to show.
 *
 * A Postgres `date` column arrives as a `Date`, not a string, and the row is passed through
 * as `any` so the declared type is never checked. A `Date` reaching the client and then JSX
 * throws "Objects are not valid as a React child" — which is what opening a hotel booking in
 * v1's admin detail dialog did. Everything here returns a string.
 */
export function dateRange(from?: string | Date | null, to?: string | Date | null): string {
    const fmt = (d: string | Date) => {
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };
    if (!from) return '';
    const start = fmt(from);
    if (!start) return '';
    const end = to ? fmt(to) : '';
    return end ? `${start} – ${end}` : start;
}

/**
 * What the booking actually is, in one line.
 *
 * The admin was built around money and recovery — supplier cost, markup, PNR, ticket state —
 * and carried nothing naming the trip. An agent taking a call about "the Hilton on the 9th"
 * could match the caller only by reference or email, though the property, dates, airline and
 * route are all stored.
 *
 * A flight is named by the **whole journey**, not its first leg: a connecting itinerary
 * should read MNL→NRT, because MNL→ICN hides where the traveller is actually going, which is
 * the one thing the column exists to answer.
 */
function summaryOf(row: any, type: AdminBookingType): string {
    if (type === 'hotel') {
        const stay = dateRange(row.check_in, row.check_out);
        // Falls back to the room, then to a plain label, so the cell is never blank — an
        // empty cell reads as a loading fault rather than as missing data.
        return [row.property_name || row.room_name || 'Hotel booking', stay].filter(Boolean).join(' · ');
    }

    const segments: any[] = Array.isArray(row.segments) ? row.segments : [];
    const first = segments[0];
    const last  = segments[segments.length - 1];
    // A return trip ends where it started, so first→last reads "CRK→CRK" and names nowhere.
    // The turnaround point is what the agent needs, and ⇄ says it is a return.
    const finalStop = segments.length > 1 ? last.destination : first?.destination;
    const route = !first
        ? ''
        : finalStop === first.origin && segments.length > 1
            ? `${first.origin}⇄${first.destination}`
            : `${first.origin}→${finalStop}`;
    const flight = first ? `${first.airline ?? ''} ${first.flight_number ?? ''}`.trim() : '';
    const when   = first?.departure ? dateRange(first.departure) : '';

    return [flight, route, when, row.pnr].filter(Boolean).join(' · ') || 'Flight booking';
}

/** Raw `numeric` can arrive as a number, a string, or a Decimal object. */
function toAmount(value: unknown): number {
    if (value === null || value === undefined) return 0;
    const n = typeof value === 'number' ? value : Number(String(value));
    return Number.isFinite(n) ? n : 0;
}

export function normaliseBooking(row: any, type: AdminBookingType): AdminBooking {
    return {
        id:     String(row.id ?? ''),
        // Empty string rather than undefined: the client indexes a lookup with it and
        // then calls string methods on the fallback.
        userId: row.user_id ? String(row.user_id) : '',
        type,
        status: row.status ?? 'unknown',
        // A flight's charged price is what the customer actually paid; total_price is
        // the pre-capture figure and can differ after a reprice.
        totalAmount: toAmount(row.charged_price ?? row.total_price),
        currency:    row.currency ?? 'PHP',
        createdAt:   row.created_at,
        reference:   row.booking_id ?? row.pnr ?? undefined,
        summary:     summaryOf(row, type),
    };
}

/** Both kinds in one list, newest first. */
export function mergeAdminBookings(hotelRows: any[], flightRows: any[]): AdminBooking[] {
    return [
        ...hotelRows.map(r => normaliseBooking(r, 'hotel')),
        ...flightRows.map(r => normaliseBooking(r, 'flight')),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
