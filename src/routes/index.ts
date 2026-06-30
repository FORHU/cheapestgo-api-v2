import { Router } from 'express';
import authRoutes          from './auth.route';
import flightRoutes        from './flights.route';
import hotelRoutes         from './hotels.route';
import bookingRoutes       from './bookings.route';
import exchangeRatesRoutes from './exchange-rates.route';
import airportsRoutes      from './airports.route';
import usersRoutes         from './users.route';
import cronRoutes          from './cron.route';

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

export default router;
