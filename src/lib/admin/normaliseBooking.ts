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
        summary:     type === 'hotel' ? (row.property_name ?? undefined) : (row.pnr ?? undefined),
    };
}

/** Both kinds in one list, newest first. */
export function mergeAdminBookings(hotelRows: any[], flightRows: any[]): AdminBooking[] {
    return [
        ...hotelRows.map(r => normaliseBooking(r, 'hotel')),
        ...flightRows.map(r => normaliseBooking(r, 'flight')),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
