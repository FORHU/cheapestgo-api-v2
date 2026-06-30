import { HotelsRepository } from '@/repositories/hotels.repository';
import { runTgxSearch as searchHotels } from '@/lib/hotels/search';
import { quoteTgx, bookTgx, cancelTgx } from '@/lib/hotels/travelgatex';
import { stripe } from '@/lib/stripe';
import { AppError } from '@/middleware/error.middleware';
import { redis } from '@/lib/redis';

export class HotelsService {
    private repo = new HotelsRepository();

    // ── Search ────────────────────────────────────────────────────────────────

    async search(params: {
        destination:  string;
        checkIn:      string;
        checkOut:     string;
        adults:       number;
        children?:    number;
        rooms?:       number;
        lat?:         number;
        lng?:         number;
        countryCode?: string;
        currency?:    string;
        occupancies?: any[];
        filters?:     any;
    }) {
        const results = await searchHotels(params as any);
        await this.repo.recordSearchDemand(
            params.destination.toLowerCase().replace(/\s+/g, '-'),
            params.countryCode ?? 'XX',
        ).catch(() => {});
        return results;
    }

    // ── Property detail ───────────────────────────────────────────────────────

    async getProperty(hotelId: string) {
        const [content, reviews, reviewItems] = await Promise.all([
            this.repo.findHotelContent(hotelId),
            this.repo.findHotelReviews(hotelId),
            this.repo.findHotelReviewItems(hotelId, 20),
        ]);
        if (!content) throw new AppError(404, 'Property not found', 'NOT_FOUND');
        return { content, reviews, reviewItems };
    }

    // ── Pre-book (validate + hold) ────────────────────────────────────────────

    async preBook(params: {
        optionRefId: string;
        checkIn:     string;
        checkOut:    string;
        adults:      number;
        children?:   number;
        rooms?:      number;
        occupancies?: any[];
        hotelId:     string;
        rateKey:     string;
        currency?:   string;
    }) {
        const result = await quoteTgx(params.rateKey);
        return result;
    }

    // ── Get quote / booking price ─────────────────────────────────────────────

    async createPayment(params: {
        userId:      string;
        hotelId:     string;
        optionRefId: string;
        rateKey:     string;
        totalPrice:  number;
        currency:    string;
        checkIn:     string;
        checkOut:    string;
        guestName:   string;
        guestEmail:  string;
        details:     any;
    }) {
        const lockKey = `hotel-book-lock:${params.userId}:${params.hotelId}:${params.checkIn}`;
        const locked  = await redis.set(lockKey, '1', 'EX', 300, 'NX');
        if (!locked) throw new AppError(409, 'A booking for this property is already in progress.', 'BOOKING_IN_PROGRESS');

        try {
            const zeroDecimal = ['jpy', 'krw', 'clp', 'pyg', 'ugx', 'vnd'];
            const stripeAmount = zeroDecimal.includes(params.currency.toLowerCase())
                ? Math.round(params.totalPrice)
                : Math.round(params.totalPrice * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount:   stripeAmount,
                currency: params.currency.toLowerCase(),
                capture_method: 'manual',
                metadata: {
                    userId:    params.userId,
                    hotelId:   params.hotelId,
                    rateKey:   params.rateKey,
                    checkIn:   params.checkIn,
                    checkOut:  params.checkOut,
                    guestName: params.guestName,
                    type:      'hotel',
                },
            });

            return {
                clientSecret:    paymentIntent.client_secret!,
                paymentIntentId: paymentIntent.id,
            };
        } finally {
            await redis.del(lockKey).catch(() => {});
        }
    }

    // ── Confirm booking ───────────────────────────────────────────────────────

    async confirmBooking(params: {
        paymentIntentId: string;
        userId:          string;
        optionRefId:     string;
        rateKey:         string;
        guestName:       string;
        guestEmail:      string;
        guestPhone?:     string;
        checkIn:         string;
        checkOut:        string;
        hotelId:         string;
        currency?:       string;
        occupancies?:    any[];
    }) {
        const pi = await stripe.paymentIntents.retrieve(params.paymentIntentId);
        if (pi.metadata.userId !== params.userId) throw new AppError(403, 'Payment mismatch', 'FORBIDDEN');
        if (pi.status !== 'requires_capture') throw new AppError(402, 'Payment not authorized', 'PAYMENT_REQUIRED');

        const nameParts = params.guestName.split(' ');
        const bookingResult = await bookTgx({
            quoteToken:      params.optionRefId,
            clientReference: `CG-${params.userId}-${Date.now()}`,
            holder: {
                firstName: nameParts[0] ?? params.guestName,
                lastName:  (nameParts.slice(1).join(' ') || nameParts[0]) ?? '',
                email:     params.guestEmail,
            },
            rooms: (params.occupancies ?? [{ occupancyRefId: 1, paxes: [{ name: nameParts[0] ?? '', surname: nameParts[1] ?? '', age: 30 }] }]),
        } as any);

        await stripe.paymentIntents.capture(params.paymentIntentId);

        return {
            bookingRef: (bookingResult as any).clientRef ?? (bookingResult as any).supplierRef,
            status:     bookingResult.status,
            details:    bookingResult,
        };
    }

    // ── Cancel booking ────────────────────────────────────────────────────────

    async cancelBooking(params: {
        bookingRef: string;
        userId:     string;
        paymentIntentId?: string;
    }) {
        const cancelled = await cancelTgx({ clientReference: params.bookingRef });

        if (params.paymentIntentId) {
            try {
                const pi = await stripe.paymentIntents.retrieve(params.paymentIntentId);
                if (pi.status === 'requires_capture') {
                    await stripe.paymentIntents.cancel(params.paymentIntentId, { cancellation_reason: 'requested_by_customer' });
                } else if (pi.status === 'succeeded') {
                    await stripe.refunds.create({
                        payment_intent: params.paymentIntentId,
                        reason:         'requested_by_customer',
                    }, { idempotencyKey: `hotel-refund-${params.bookingRef}` });
                }
            } catch (stripeErr: any) {
                console.error('[hotels.cancelBooking] Stripe refund failed:', stripeErr.message);
            }
        }

        return { status: 'cancelled', cancelled };
    }

    // ── Deals ─────────────────────────────────────────────────────────────────

    async getDeals(limit = 12) {
        return this.repo.getHotelDeals(limit);
    }
}
