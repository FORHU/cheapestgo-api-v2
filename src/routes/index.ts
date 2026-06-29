import { Router } from 'express';
import authRoutes from './auth.route';
// import hotelRoutes from './hotels.route';
// import flightRoutes from './flights.route';
// import bookingRoutes from './bookings.route';
// import webhookRoutes from './webhooks.route';
// import cronRoutes from './cron.route';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

router.use('/auth', authRoutes);
// router.use('/hotels', hotelRoutes);
// router.use('/flights', flightRoutes);
// router.use('/bookings', bookingRoutes);
// router.use('/webhooks', webhookRoutes);
// router.use('/cron', cronRoutes);

export default router;
