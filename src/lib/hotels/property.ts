import type { RoomType } from '@/types/hotels';
import { groupRoomsByName } from './roomGrouping';
import type { AmenityGroup, DetailSection, RoomContent } from './roomContent.types';

export interface RateRow {
    offerId:               string;
    price:                 number;
    currency:              string;
    boardCode?:            string;
    boardName?:            string;
    refundable:            boolean;
    refundableTag:         string;
    cancellationDeadline?: string;
}

export interface RoomOption {
    id:                    string;
    offerId?:              string;
    name:                  string;
    price:                 number;
    currency:              string;
    refundableTag?:        string;
    boardType?:            string;
    boardName?:            string;
    cancellationDeadline?: string;
    cancelPolicy?:         RoomType['cancelPolicy'];
    rates:                 RateRow[];
    content?:              RoomContent;
}

export interface PropertyContentExtras {
  amenityGroups?: AmenityGroup[];
  roomPolicySections?: DetailSection[];
  additionalInfo?: string;
}

const BOARD_LABELS: Record<string, string> = {
    RO: 'Room only', BB: 'Bed & Breakfast', HB: 'Half Board',
    FB: 'Full Board', AI: 'All Inclusive', SC: 'Self Catering',
    CB: 'Continental Breakfast', AB: 'American Breakfast', EB: 'English Breakfast',
    nomeal: 'Room only', breakfast: 'Breakfast included',
    halfboard: 'Half Board', fullboard: 'Full Board', allinclusive: 'All Inclusive',
};

/**
 * The flat per-rate lines a hotel-scoped TGX search returns, as one card per **Room** with
 * its **Offers** inside it.
 *
 * The rules are [groupRoomsByName]'s and live there — which Room a line belongs to, and which
 * Offers are the same promise, are domain decisions under ADR-0017 and ADR-0007. This is the
 * adapter that puts them in the shape the property response has always used; until
 * 2026-11-12 it was a second, simpler implementation that grouped on the raw supplier name,
 * and the browser had to redo the work to get a readable page.
 */
export function groupByRoomName(roomTypes: RoomType[]): RoomOption[] {
    const grouped = groupRoomsByName(roomTypes.map(rt => ({
        id:            rt.offerId ?? rt.roomCode ?? rt.roomName ?? 'Room',
        offerId:       rt.offerId ?? '',
        name:          rt.roomName ?? 'Room',
        price:         rt.price,
        currency:      rt.currency,
        refundableTag: rt.refundableTag ?? 'NON_REFUNDABLE',
        cancelPolicy:  rt.cancelPolicy,
        boardType:     rt.boardCode,
        roomCode:      rt.roomCode,
    })));

    const named = (code?: string) => BOARD_LABELS[code ?? ''] ?? code ?? 'Room only';
    const original = new Map(roomTypes.map(rt => [rt.offerId, rt]));

    return grouped.map(room => ({
        id:                   room.id,
        offerId:              room.offerId,
        name:                 room.name,
        price:                room.price,
        currency:             room.currency,
        refundableTag:        room.refundableTag,
        boardType:            room.boardType,
        boardName:            named(room.boardType),
        cancellationDeadline: room.rates[0]?.cancellationDeadline,
        // The headline Offer's own policy, which checkout and the cancellation copy read.
        cancelPolicy:         original.get(room.offerId)?.cancelPolicy,
        rates: room.rates.map(rate => ({
            ...rate,
            boardName: named(rate.boardCode),
        })),
    }));
}

function formatDateForApi(date: Date): string {
    const yyyy = date.getFullYear();
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const dd   = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function sanitizeDate(dateStr: string | undefined): string | undefined {
    if (!dateStr) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? undefined : formatDateForApi(d);
}

/** Same-day / next-day dates have near-zero OTV inventory, so the default
 *  stay is next Friday → Sunday rather than tomorrow. */
function getDefaultDates(): { checkIn: string; checkOut: string } {
    const now         = new Date();
    const dayOfWeek   = now.getDay(); // 0=Sun … 6=Sat
    const daysUntilFri = ((5 - dayOfWeek + 7) % 7) || 7; // at least 1 day ahead
    const checkin  = new Date(now);
    checkin.setDate(now.getDate() + daysUntilFri);
    const checkout = new Date(checkin);
    checkout.setDate(checkin.getDate() + 2); // Fri → Sun
    return { checkIn: formatDateForApi(checkin), checkOut: formatDateForApi(checkout) };
}

/**
 * Resolves the stay a property page request is actually quoting for. A
 * request that arrives with no dates, malformed dates, or a check-in that
 * has already passed falls back to the default Friday → Sunday stay rather
 * than failing — a hotel page reached without dates (a bookmark, a direct
 * link) should still show rooms, priced for *some* stay, rather than an
 * error page. Mirrors V1's `resolveStayDates` (cheapest-go-app).
 */
export function resolveStayDates(checkInParam?: string, checkOutParam?: string): { checkIn: string; checkOut: string } {
    const defaults = getDefaultDates();
    let checkIn  = sanitizeDate(checkInParam)  || defaults.checkIn;
    let checkOut = sanitizeDate(checkOutParam) || defaults.checkOut;

    if (checkIn <= formatDateForApi(new Date())) {
        checkIn = defaults.checkIn;
        if (checkOut <= checkIn) checkOut = defaults.checkOut;
    }

    return { checkIn, checkOut };
}
