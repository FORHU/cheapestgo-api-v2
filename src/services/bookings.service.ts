import { BookingsRepository } from '@/repositories/bookings.repository';
import { AppError } from '@/middleware/error.middleware';

export class BookingsService {
    private repo = new BookingsRepository();

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
