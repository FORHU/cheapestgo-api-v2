/**
 * Assembles everything the booking confirmation email and its PDF attachment
 * need, from the stored booking rather than the request body.
 *
 * The previous version of /api/email rendered whatever the caller passed in,
 * so a client could have mailed itself an arbitrary price or property name.
 * Everything here is read from `bookings` (scoped to the authenticated user)
 * and enriched from `hotel_content` and the policy snapshot.
 */

import { prisma } from '@/lib/prisma';
import { config } from '@/config';
import { otvCodeToLabel } from '@/lib/hotels/amenityCodes';
import {
    calculateCancellationFee,
    isCurrentlyFreeCancellation,
    type CancellationPolicy,
} from '@/lib/policies/normalizer';

// ── View model ───────────────────────────────────────────────────────────────

export interface BookingEmailView {
    /** Human-facing reference printed in the email and PDF. */
    reference:   string;
    /** UUID the /trips/:id routes resolve. */
    id:          string;
    status:      string;

    guest: {
        fullName:  string;
        firstName: string;
        lastName:  string;
        email:     string;
    };

    links: {
        view:       string;
        modify:     string;
        cancel:     string;
        flights:    string;
        thingsToDo: string;
    };

    hotel: {
        name:          string;
        starRating:    number;
        address:       string | null;
        city:          string | null;
        country:       string | null;
        checkInTime:   string | null;
        checkOutTime:  string | null;
        reviewRating:  number | null;
        reviewCount:   number | null;
        contact: {
            phone?:   string;
            email?:   string;
            website?: string;
        };
    };

    stay: {
        checkIn:      Date;
        checkOut:     Date;
        checkInLabel: string;
        checkOutLabel: string;
        nights:       number;
    };

    reservation: {
        roomName:        string;
        rooms:           number;
        adults:          number;
        children:        number;
        occupancy:       string;
        specialRequests: string | null;
    };

    amenities: string[];

    payment: {
        currency:      string;
        /** Per-night rate implied by the room subtotal. */
        ratePerNight:  number;
        roomSubtotal:  number;
        /** null when the provider did not itemise them — they are still in the total. */
        taxesAndFees:  number | null;
        discount:      number;
        voucherCode:   string | null;
        totalCharge:   number;
        totalPaid:     number;
    };

    policy: {
        refundable:         boolean;
        label:              string;
        summary:            string | null;
        freeCancelDeadline: Date | null;
        /** Fee that would apply if the guest cancelled right now. */
        currentFee:         number | null;
        currentRefund:      number | null;
        tiers: Array<{ deadline: Date; penalty: number; penaltyType: string; currency: string }>;
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DAY_MS = 86_400_000;

function num(value: unknown): number {
    if (value == null) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

export function formatDate(date: Date): string {
    return date.toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
}

export function formatMoney(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        // Unknown/invalid ISO code — never let formatting break a confirmation.
        return `${currency} ${amount.toFixed(2)}`;
    }
}

function nightsBetween(checkIn: Date, checkOut: Date): number {
    const diff = Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS);
    return diff > 0 ? diff : 1;
}

/**
 * `hotel_content.amenities` is provider-shaped JSON: sometimes a bare string
 * array of OTV codes, sometimes objects carrying a code or a ready label.
 */
function readAmenities(raw: unknown, limit = 12): string[] {
    if (!Array.isArray(raw)) return [];

    const labels = raw
        .map((entry) => {
            if (typeof entry === 'string') return otvCodeToLabel(entry);
            if (entry && typeof entry === 'object') {
                const o = entry as Record<string, unknown>;
                const value = o.name ?? o.label ?? o.code ?? o.id;
                return typeof value === 'string' ? otvCodeToLabel(value) : '';
            }
            return '';
        })
        .filter((label): label is string => label.length > 0);

    return [...new Set(labels)].slice(0, limit);
}

/**
 * Providers itemise tax differently and the column does not exist on `bookings`,
 * so probe the shapes we actually store in `provider_metadata` and give up
 * quietly rather than inventing a number.
 */
function readTaxes(metadata: unknown): number | null {
    if (!metadata || typeof metadata !== 'object') return null;
    const meta = metadata as Record<string, any>;

    const direct =
        meta.taxes_and_fees ?? meta.taxesAndFees ?? meta.taxes ??
        meta.price_breakdown?.taxes ?? meta.priceBreakdown?.taxes ??
        meta.rate?.taxes ?? meta.rate?.taxes_and_fees;

    if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
    if (typeof direct === 'string' && direct.trim() !== '' && Number.isFinite(Number(direct))) {
        return Number(direct);
    }

    // Provider arrays: [{ amount, currency, included }]
    if (Array.isArray(direct)) {
        const sum = direct.reduce((acc, t) => acc + num(t?.amount ?? t?.value), 0);
        return sum > 0 ? sum : null;
    }
    return null;
}

function readContact(metadata: unknown): BookingEmailView['hotel']['contact'] {
    if (!metadata || typeof metadata !== 'object') return {};
    const meta = metadata as Record<string, any>;
    const source = meta.hotel ?? meta.property ?? meta.contact ?? meta;

    const pick = (...keys: string[]): string | undefined => {
        for (const key of keys) {
            const value = source?.[key];
            if (typeof value === 'string' && value.trim() !== '') return value.trim();
        }
        return undefined;
    };

    return {
        phone:   pick('phone', 'phone_number', 'phoneNumber', 'telephone', 'contact_phone'),
        email:   pick('email', 'contact_email', 'reservations_email'),
        website: pick('website', 'website_url', 'websiteUri', 'url'),
    };
}

function policyLabel(refundable: boolean, policyType: string | null): string {
    if (!refundable) return 'Non-refundable';
    switch (policyType) {
        case 'free_cancellation': return 'Free cancellation';
        case 'partial_refund':    return 'Partially refundable';
        case 'tiered':            return 'Refundable — tiered penalties';
        default:                  return 'Refundable';
    }
}

// ── Loader ───────────────────────────────────────────────────────────────────

/**
 * Loads a booking the given user owns. Accepts either the human `booking_id`
 * or the row UUID, since the emails go out from both the booking flow (which
 * knows the reference) and the trips UI (which knows the id).
 */
export async function loadBookingEmailView(
    bookingIdOrRef: string,
    userId: string,
): Promise<BookingEmailView | null> {
    const booking = await prisma.bookings.findFirst({
        where: {
            user_id: userId,
            OR: [
                { booking_id: bookingIdOrRef },
                // `id` is a uuid column — querying it with a non-uuid throws.
                ...(UUID_RE.test(bookingIdOrRef) ? [{ id: bookingIdOrRef }] : []),
            ],
        },
        include: {
            booking_policy_snapshots_booking_policy_snapshots_booking_idTobookings: {
                include: { policy_tiers: { orderBy: { tier_order: 'asc' } } },
            },
        },
    });

    if (!booking) return null;

    const hotel = booking.hotel_id
        ? await prisma.hotel_content.findUnique({ where: { hotel_id: booking.hotel_id } })
        : null;

    const currency = booking.currency ?? 'PHP';
    const checkIn  = booking.check_in;
    const checkOut = booking.check_out;
    const nights   = nightsBetween(checkIn, checkOut);

    // ── Money ────────────────────────────────────────────────────────────────
    // `total_price` is the booking total; `charged_price` is what the card was
    // actually billed, which is the total net of any voucher discount.
    const totalCharge  = num(booking.total_price);
    const discount     = num(booking.discount_amount);
    const totalPaid    = booking.charged_price != null ? num(booking.charged_price) : totalCharge - discount;
    const taxesAndFees = readTaxes(booking.provider_metadata);
    const roomSubtotal = taxesAndFees != null ? totalCharge - taxesAndFees : totalCharge;

    // ── Policy ───────────────────────────────────────────────────────────────
    const snapshot   = booking.booking_policy_snapshots_booking_policy_snapshots_booking_idTobookings;
    const rawPolicy  = (booking.cancellation_policy ?? null) as CancellationPolicy | null;
    const refundable = booking.policy_type !== 'non_refundable'
        || isCurrentlyFreeCancellation(rawPolicy, totalCharge, currency);
    const feeNow     = calculateCancellationFee(rawPolicy, totalCharge, currency);

    const adults   = booking.guests_adults   ?? 1;
    const children = booking.guests_children ?? 0;

    const city        = hotel?.city ?? null;
    const destination = city ?? hotel?.country ?? booking.property_name;

    const stayQuery = new URLSearchParams({
        destination,
        checkIn:  checkIn.toISOString().slice(0, 10),
        checkOut: checkOut.toISOString().slice(0, 10),
        adults:   String(adults),
        children: String(children),
        rooms:    '1',
        view:     'map',
    });

    return {
        reference: booking.booking_id,
        id:        booking.id,
        status:    booking.status ?? 'confirmed',

        guest: {
            fullName:  `${booking.holder_first_name} ${booking.holder_last_name}`.trim(),
            firstName: booking.holder_first_name,
            lastName:  booking.holder_last_name,
            email:     booking.holder_email,
        },

        links: {
            view:   `${config.SITE_URL}/trips/${booking.id}`,
            modify: `${config.SITE_URL}/trips/${booking.id}?action=modify`,
            cancel: `${config.SITE_URL}/trips/${booking.id}?action=cancel`,
            // Flight search needs an origin the booking cannot supply, so the
            // promo sends people to the home search rather than a dead end.
            flights:    `${config.SITE_URL}/`,
            thingsToDo: `${config.SITE_URL}/search?${stayQuery.toString()}`,
        },

        hotel: {
            name:         booking.property_name,
            starRating:   hotel?.star_rating ?? 0,
            address:      hotel?.address ?? null,
            city,
            country:      hotel?.country ?? null,
            checkInTime:  hotel?.check_in_time ?? null,
            checkOutTime: hotel?.check_out_time ?? null,
            reviewRating: hotel?.review_rating != null ? num(hotel.review_rating) : null,
            reviewCount:  hotel?.review_count ?? null,
            contact:      readContact(booking.provider_metadata),
        },

        stay: {
            checkIn,
            checkOut,
            checkInLabel:  formatDate(checkIn),
            checkOutLabel: formatDate(checkOut),
            nights,
        },

        reservation: {
            roomName:        booking.room_name,
            rooms:           1,
            adults,
            children,
            occupancy: [
                `${adults} adult${adults === 1 ? '' : 's'}`,
                children > 0 ? `${children} child${children === 1 ? '' : 'ren'}` : null,
            ].filter(Boolean).join(', '),
            specialRequests: booking.special_requests ?? null,
        },

        amenities: readAmenities(hotel?.amenities),

        payment: {
            currency,
            ratePerNight: roomSubtotal / nights,
            roomSubtotal,
            taxesAndFees,
            discount,
            voucherCode: booking.voucher_code ?? null,
            totalCharge,
            totalPaid,
        },

        policy: {
            refundable,
            label:              policyLabel(refundable, booking.policy_type),
            summary:            snapshot?.summary ?? null,
            freeCancelDeadline: snapshot?.free_cancel_deadline ?? null,
            currentFee:         feeNow?.fee ?? null,
            currentRefund:      feeNow?.refund ?? null,
            tiers: (snapshot?.policy_tiers ?? []).map((tier) => ({
                deadline:    tier.cancel_deadline,
                penalty:     num(tier.penalty_amount),
                penaltyType: tier.penalty_type,
                currency:    tier.currency ?? currency,
            })),
        },
    };
}
