// Read-only DB helper for the E2E run. Loads the API's .env and its generated Prisma client.
const path = require('path');
const repo = process.env.API_REPO ?? path.resolve(__dirname, '..', '..');
require(path.join(repo, 'node_modules', 'dotenv')).config({ path: path.join(repo, '.env'), quiet: true });
const { PrismaClient } = require(path.join(repo, 'node_modules', '@prisma/client'));
const prisma = new PrismaClient();
module.exports = { prisma, q: (sql, ...args) => prisma.$queryRawUnsafe(sql, ...args) };
if (require.main === module) {
  (async () => {
    const { q } = module.exports;
    const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='booking_sessions' AND column_name IN ('lifecycle_status','capture_method','payment_intent_id')`);
    const ev = await q(`SELECT to_regclass('public.flight_booking_events')::text AS t, to_regclass('public.supplier_booking_attempts')::text AS s`);
    const mig = await q(`SELECT version FROM schema_migrations WHERE version LIKE '2026101600%' OR version LIKE '2026110900%'`).catch(e => e.message);
    const fbCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='flight_bookings' AND column_name IN ('updated_at','supplier_cost','charged_price','ticketed_at','status')`);
    console.log(JSON.stringify({ sessionCols: cols.map(c => c.column_name), tables: ev[0], migrations: mig, flightBookingCols: fbCols.map(c => c.column_name) }, (k, v) => typeof v === 'bigint' ? String(v) : v));
    await prisma.$disconnect();
  })();
}
