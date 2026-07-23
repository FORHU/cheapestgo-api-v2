import { Router } from 'express';
import authRoutes          from './auth.route';
import flightRoutes        from './flights.route';
import hotelRoutes         from './hotels.route';
import bookingRoutes       from './bookings.route';
import exchangeRatesRoutes from './exchange-rates.route';
import airportsRoutes      from './airports.route';
import usersRoutes         from './users.route';
import cronRoutes          from './cron.route';
import emailRoutes         from './email.route';
import voucherRoutes       from './vouchers.route';
import adminRoutes         from './admin.route';
import photosRoutes        from './photos.route';
import chatRoutes          from './chat.route';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

router.use('/auth',           authRoutes);
router.use('/flights',        flightRoutes);
router.use('/hotels',         hotelRoutes);
router.use('/bookings',       bookingRoutes);
router.use('/exchange-rates', exchangeRatesRoutes);
router.use('/airports',       airportsRoutes);
router.use('/users',          usersRoutes);
router.use('/cron',           cronRoutes);
router.use('/email',          emailRoutes);
router.use('/vouchers',       voucherRoutes);
router.use('/admin',          adminRoutes);
router.use('/photos',         photosRoutes);
router.use('/chat',           chatRoutes);

// NOTE: /webhooks is mounted directly on the Express app (in app.ts) BEFORE
// the global JSON body parser, so it does NOT appear here.

export default router;
