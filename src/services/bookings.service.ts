import { BookingsRepository } from '@/repositories/bookings.repository';
import { AppError } from '@/middleware/error.middleware';
import { checkName } from '@/lib/users/names';
import { canonicalBrandName, fromNoReply } from '@/lib/brand';
import { escapeHtml } from '@/lib/html';
import { config } from '@/config';

/** Deliberately plain: the address is proven by the mail arriving, not by a regex. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Long enough for any real request to a hotel; short enough not to be a document. */
const REMARKS_MAX_LENGTH = 1000;

export class BookingsService {
    private repo = new BookingsRepository();

    /**
     * Change the contact details and special requests on a hotel booking (ported from v1's
     * `amendBooking`). A local change only: nothing about the stay is re-quoted, so nothing is
     * sent to the supplier.
     *
     * Three things the old route did not do, each of which mattered:
     *  - **It validated nothing.** A blank name or `not-an-email` was stored, and the address a
     *    booking's confirmation and cancellation emails go to is exactly the one field that must
     *    be real. v1 required all three.
     *  - **It capped nothing.** The holder name is the same kind of field as the profile name
     *    that was once saved at 13,708 characters (QA BG-9), and gets the same 30-character cap.
     *  - **It put what the customer typed straight into an email to whatever address they
     *    typed.** That is a way to send arbitrary HTML, links included, from the brand's own
     *    no-reply domain to anyone. Everything is escaped now, and sent under the brand the
     *    booking was made on rather than a literal CheapestGo.
     */
    async amend(userId: string, input: {
        bookingId: string;
        firstName: string;
        lastName:  string;
        email:     string;
        remarks?:  string | null;
    }) {
        const first = checkName(input.firstName ?? '', 'First name');
        if (!first.ok) throw new AppError(400, first.error!, 'VALIDATION_ERROR');
        const last = checkName(input.lastName ?? '', 'Last name');
        if (!last.ok) throw new AppError(400, last.error!, 'VALIDATION_ERROR');

        const email = String(input.email ?? '').trim();
        if (!EMAIL.test(email)) throw new AppError(400, 'Valid email required', 'VALIDATION_ERROR');

        const remarks = input.remarks == null ? null : String(input.remarks).slice(0, REMARKS_MAX_LENGTH);

        const before = await this.repo.findAmendable(input.bookingId);
        if (!before) throw new AppError(404, 'Booking not found', 'NOT_FOUND');
        if (before.user_id !== userId) throw new AppError(403, 'Not authorized to modify this booking', 'FORBIDDEN');

        await this.repo.amendContact(input.bookingId, { firstName: first.value, lastName: last.value, email, remarks });

        this.repo.notifyAdmins('Booking Amended', `Booking ${input.bookingId} contact details were changed by the guest.`);

        const previous = {
            firstName: before.holder_first_name ?? '',
            lastName:  before.holder_last_name ?? '',
            email:     before.holder_email ?? '',
            remarks:   before.special_requests ?? null,
        };
        this.sendAmendmentEmail({
            to:        email,
            bookingId: input.bookingId,
            hotelName: before.property_name ?? '',
            guestName: `${first.value} ${last.value}`.trim(),
            next:      { firstName: first.value, lastName: last.value, email, remarks },
            previous,
        }).catch((err) => console.error('[amend] Email error:', err?.message));

        return {
            success: true,
            data: {
                bookingId:     input.bookingId,
                status:        'confirmed',
                dbId:          before.id,
                propertyImage: before.property_image ?? undefined,
                roomName:      before.room_name ?? undefined,
                checkIn:       before.check_in ?? undefined,
                checkOut:      before.check_out ?? undefined,
                adults:        before.guests_adults ?? undefined,
                children:      before.guests_children ?? undefined,
                previous,
            },
        };
    }

    /** What changed, before and after, every value escaped. */
    private async sendAmendmentEmail(p: {
        to: string; bookingId: string; hotelName: string; guestName: string;
        next:     { firstName: string; lastName: string; email: string; remarks: string | null };
        previous: { firstName: string; lastName: string; email: string; remarks: string | null };
    }) {
        if (!config.RESEND_API_KEY) return;

        const rows: [string, string, string][] = [];
        const was = `${p.previous.firstName} ${p.previous.lastName}`.trim();
        const now = `${p.next.firstName} ${p.next.lastName}`.trim();
        if (was !== now) rows.push(['Guest name', was, now]);
        if (p.previous.email !== p.next.email) rows.push(['Email', p.previous.email, p.next.email]);
        if ((p.previous.remarks ?? '') !== (p.next.remarks ?? '')) rows.push(['Special requests', p.previous.remarks ?? '—', p.next.remarks ?? '—']);

        const brand = canonicalBrandName(process.env.BRAND_NAME ?? process.env.NEXT_PUBLIC_BRAND_NAME);
        const diff = rows.length
            ? `<table style="border-collapse:collapse;margin:16px 0;width:100%">${rows.map(([label, from, to]) =>
                `<tr><td style="padding:6px 8px;color:#64748b;font-size:13px">${escapeHtml(label)}</td>`
                + `<td style="padding:6px 8px;color:#94a3b8;font-size:13px;text-decoration:line-through">${escapeHtml(from)}</td>`
                + `<td style="padding:6px 8px;color:#1e293b;font-size:13px;font-weight:600">${escapeHtml(to)}</td></tr>`).join('')}</table>`
            : '';

        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from:    fromNoReply(),
                to:      [p.to],
                subject: `Booking Updated — #${p.bookingId}`,
                html: `<p>Hi ${escapeHtml(p.guestName)},</p>`
                    + `<p>Your booking <strong>${escapeHtml(p.bookingId)}</strong> at <strong>${escapeHtml(p.hotelName)}</strong> has been updated.</p>`
                    + diff
                    + `<p style="color:#94a3b8;font-size:12px">&copy; ${new Date().getFullYear()} ${escapeHtml(brand)}</p>`,
            }),
        });
    }

    async list(userId: string, tripType?: 'flight' | 'hotel') {
        const rows = await this.repo.listForUser(userId, tripType);
        return { success: true, data: rows };
    }

    async getDetails(bookingId: string, userId: string) {
        const booking = await this.repo.findByIdForUser(bookingId, userId);
        if (!booking) throw new AppError(404, 'Booking not found', 'NOT_FOUND');

        // Build structured cancellation policy from stored data (same as v1 TGX path)
        const isRefundable = booking.policy_type === 'free_cancellation';
        const stored = booking.cancellation_policy as any;
        const cancellationPolicies = stored ?? {
            refundableTag:    isRefundable ? 'RFN' : 'NRFN',
            cancelPolicyInfos: [],
        };

        return {
            success: true,
            data: {
                bookingId:    booking.booking_id,
                status:       booking.status ?? 'confirmed',
                provider:     booking.provider,
                propertyName: booking.property_name,
                propertyImage: booking.property_image,
                roomName:     booking.room_name,
                checkIn:      booking.check_in,
                checkOut:     booking.check_out,
                adults:       booking.guests_adults,
                children:     booking.guests_children,
                totalPrice:   Number(booking.total_price),
                currency:     booking.currency,
                holderFirstName: booking.holder_first_name,
                holderLastName:  booking.holder_last_name,
                holderEmail:     booking.holder_email,
                specialRequests: booking.special_requests,
                policyType:      booking.policy_type,
                cancellationPolicies,
                createdAt:    booking.created_at,
            },
        };
    }

    // ── Saved trips ───────────────────────────────────────────────────────────

    async getSavedTrips(userId: string) {
        return this.repo.getSavedTrips(userId);
    }

    async saveTrip(userId: string, data: { hotelId: string; hotelName?: string; details?: any }) {
        return this.repo.saveTrip({ userId, ...data });
    }

    async deleteSavedTrip(id: string, userId: string) {
        const result = await this.repo.deleteSavedTrip(id, userId);
        if (!result.count) throw new AppError(404, 'Saved trip not found', 'NOT_FOUND');
        return { success: true };
    }

    // ── Price alerts ──────────────────────────────────────────────────────────

    async getPriceAlerts(userId: string) {
        return this.repo.getPriceAlerts(userId);
    }

    async createPriceAlert(userId: string, data: {
        origin?:     string;
        destination: string;
        targetPrice: number;
        currency:    string;
        tripType:    string;
        details?:    any;
    }) {
        return this.repo.createPriceAlert({ userId, ...data });
    }

    async deletePriceAlert(id: string, userId: string) {
        await this.repo.deletePriceAlert(id, userId);
        return { success: true };
    }
}
