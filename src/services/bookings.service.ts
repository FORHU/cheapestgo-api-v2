import { BookingsRepository } from '@/repositories/bookings.repository';
import { AppError } from '@/middleware/error.middleware';

export class BookingsService {
    private repo = new BookingsRepository();

    async list(userId: string, tripType?: 'flight' | 'hotel') {
        return this.repo.listForUser(userId, tripType);
    }

    async getDetails(bookingId: string, userId: string) {
        const booking = await this.repo.findByIdForUser(bookingId, userId);
        if (!booking) throw new AppError(404, 'Booking not found', 'NOT_FOUND');
        return booking;
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
