import { Router, Request, Response, NextFunction } from 'express';
import { BookingsController } from '@/controllers/bookings.controller';
import { requireAuth } from '@/middleware/auth.middleware';
import { AppError } from '@/middleware/error.middleware';
import { prisma } from '@/lib/prisma';
import { config } from '@/config';

const router = Router();
const ctrl = new BookingsController();

// All booking routes require auth
router.use(requireAuth);

router.get('/', ctrl.list);
router.get('/:id', ctrl.details);

// ── POST /amend ───────────────────────────────────────────────────────────────
// Updates contact details and special requests on an existing hotel booking.
// Does NOT call TGX — local DB update only.

router.post('/amend', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const { bookingId, firstName, lastName, email, remarks } = req.body as {
            bookingId: string;
            firstName?: string;
            lastName?: string;
            email?: string;
            remarks?: string;
        };

        if (!bookingId) throw new AppError(400, 'bookingId is required', 'VALIDATION_ERROR');

        const booking = await prisma.bookings.findFirst({
            where: { booking_id: bookingId },
            select: { user_id: true },
        });

        if (!booking) throw new AppError(404, 'Booking not found', 'NOT_FOUND');
        if (booking.user_id !== userId) throw new AppError(403, 'Unauthorized', 'FORBIDDEN');

        const full = await prisma.bookings.findFirst({
            where:  { booking_id: bookingId },
            select: { user_id: true, property_name: true, holder_email: true, holder_first_name: true, holder_last_name: true },
        });

        await prisma.bookings.updateMany({
            where: { booking_id: bookingId },
            data: {
                ...(firstName  !== undefined && { holder_first_name: firstName }),
                ...(lastName   !== undefined && { holder_last_name: lastName }),
                ...(email      !== undefined && { holder_email: email }),
                ...(remarks    !== undefined && { special_requests: remarks }),
                updated_at: new Date(),
            },
        });

        // Fire amendment email non-blocking
        if (config.RESEND_API_KEY && full?.holder_email) {
            const toEmail   = email || full.holder_email;
            const guestName = `${firstName || full.holder_first_name} ${lastName || full.holder_last_name}`.trim();
            const changes   = [
                firstName || lastName ? 'Guest name' : '',
                email   ? 'Email' : '',
                remarks ? 'Special requests' : '',
            ].filter(Boolean).join(', ') || 'Booking details';

            fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from:    'CheapestGo <no-reply@mail.cheapestgo.com>',
                    to:      [toEmail],
                    subject: `Booking Updated — #${bookingId}`,
                    html:    `<p>Hi ${guestName},</p><p>Your booking <strong>${bookingId}</strong> at <strong>${full.property_name}</strong> has been updated (${changes}).</p>`,
                }),
            }).catch(e => console.error('[amend] Email error:', e));
        }

        return res.json({ success: true, data: { bookingId, status: 'confirmed' } });
    } catch (err) {
        next(err);
    }
});

// Saved trips
router.get( '/saved-trips',         ctrl.getSavedTrips);
router.post('/saved-trips',         ctrl.saveTrip);
router.delete('/saved-trips/:id',   ctrl.deleteSavedTrip);

// Price alerts
router.get( '/price-alerts',        ctrl.getPriceAlerts);
router.post('/price-alerts',        ctrl.createPriceAlert);
router.delete('/price-alerts/:id',  ctrl.deletePriceAlert);

export default router;
