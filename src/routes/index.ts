import { Router } from 'express';
import authRoutes          from './auth.route';
import flightRoutes        from './flights.route';
import hotelRoutes         from './hotels.route';
import bookingRoutes       from './bookings.route';
import exchangeRatesRoutes from './exchange-rates.route';
import airportsRoutes      from './airports.route';
import usersRoutes         from './users.route';
import cronRoutes          from './cron.route';
import internalRoutes      from './internal.route';
import emailRoutes         from './email.route';
import voucherRoutes       from './vouchers.route';
import adminRoutes         from './admin.route';
import photosRoutes        from './photos.route';
import chatRoutes          from './chat.route';
import mobileRoutes        from './mobile.route';
import weatherRoutes       from './weather.route';
import invoicesRoutes      from './invoices.route';
import priceAlertsRoutes   from './price-alerts.route';
import savedTripsRoutes    from './saved-trips.route';
import autocompleteRoutes  from './autocomplete.route';
import googleRoutes        from './google.route';

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
router.use('/internal',       internalRoutes);
router.use('/email',          emailRoutes);
router.use('/vouchers',       voucherRoutes);
router.use('/admin',          adminRoutes);
router.use('/photos',         photosRoutes);
router.use('/chat',           chatRoutes);
router.use('/mobile',         mobileRoutes);
router.use('/weather',        weatherRoutes);
router.use('/invoices',       invoicesRoutes);
router.use('/price-alerts',   priceAlertsRoutes);
router.use('/saved-trips',    savedTripsRoutes);
router.use('/autocomplete',   autocompleteRoutes);
router.use('/google',         googleRoutes);

// NOTE: /webhooks is mounted directly on the Express app (in app.ts) BEFORE
// the global JSON body parser, so it does NOT appear here.

export default router;
