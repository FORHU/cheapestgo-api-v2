// Prints only what proves the environment is a sandbox. Never prints a secret.
const path = require('path');
const repo = process.argv[2] ?? path.resolve(__dirname, '..', '..');
require(path.join(repo, 'node_modules', 'dotenv')).config({ path: path.join(repo, '.env') });
const e = process.env;
const prefix = (v, n) => (v ? v.slice(0, n) + '…' : '(unset)');
let dbHost = '(unset)';
try { const u = new URL(e.DATABASE_URL); dbHost = `${u.hostname}:${u.port}${u.pathname}`; } catch {}
console.log(JSON.stringify({
  DUFFEL_ACCESS_TOKEN: prefix(e.DUFFEL_ACCESS_TOKEN, 12),
  STRIPE_SECRET_KEY: prefix(e.STRIPE_SECRET_KEY, 8),
  STRIPE_WEBHOOK_SECRET: e.STRIPE_WEBHOOK_SECRET ? 'set' : '(unset)',
  STRIPE_EXPECTED_ACCOUNT: e.STRIPE_EXPECTED_ACCOUNT ? 'set' : '(unset)',
  DATABASE: dbHost,
  NODE_ENV: e.NODE_ENV ?? '(unset)',
  EMAIL_TRANSPORT: e.EMAIL_TRANSPORT ?? '(unset)',
  HOTEL_PROVIDER: e.HOTEL_PROVIDER ?? '(unset)',
  CRON_SECRET: e.CRON_SECRET ? 'set' : '(unset)',
  FLIGHT_MARKUP_SPEC: e.FLIGHT_MARKUP_SPEC ?? '(unset)',
}, null, 1));
