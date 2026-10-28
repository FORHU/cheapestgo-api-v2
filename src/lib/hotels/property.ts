import type { RoomType } from '@/types/hotels';
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
 * Groups the flat per-rate options a hotel-scoped TGX search returns into one
 * card per room name, each carrying every board/cancellation variant TGX
 * quoted for it — matching the property page's room cards, which show one
 * room with several selectable rates rather than a duplicate card per rate.
 */
export function groupByRoomName(roomTypes: RoomType[]): RoomOption[] {
    const groups = new Map<string, RoomType[]>();
    for (const rt of roomTypes) {
        const key = rt.roomName ?? 'Room';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(rt);
    }

    const result: RoomOption[] = [];
    for (const [name, opts] of groups) {
        opts.sort((a, b) => a.price - b.price);
        const best = opts[0];

        const rates: RateRow[] = opts.map(rt => ({
            offerId:              rt.offerId ?? '',
            price:                rt.price,
            currency:             rt.currency,
            boardCode:            rt.boardCode,
            boardName:            BOARD_LABELS[rt.boardCode] ?? rt.boardCode ?? 'Room only',
            refundable:           rt.refundable ?? false,
            refundableTag:        rt.refundableTag ?? 'NON_REFUNDABLE',
            cancellationDeadline: rt.cancelPolicy?.cancelPenalties?.[0]?.deadline,
        }));

        result.push({
            id:                   best.offerId ?? best.roomCode ?? name,
            offerId:              best.offerId,
            name,
            price:                best.price,
            currency:             best.currency,
            refundableTag:        best.refundableTag,
            boardType:            best.boardCode,
            boardName:            BOARD_LABELS[best.boardCode] ?? best.boardCode ?? 'Room only',
            cancellationDeadline: best.cancelPolicy?.cancelPenalties?.[0]?.deadline,
            cancelPolicy:         best.cancelPolicy,
            rates,
        });
    }
    return result;
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
