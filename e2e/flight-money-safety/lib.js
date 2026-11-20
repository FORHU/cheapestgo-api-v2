// Driver for the flight money-safety E2E run against the Duffel and Stripe sandboxes.
// Talks to the private API on 4010. Reads Stripe and Duffel directly with the same test keys.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const REPO = process.env.API_REPO ?? path.resolve(__dirname, '..', '..');
require(path.join(REPO, 'node_modules', 'dotenv')).config({ path: path.join(REPO, '.env'), quiet: true });
const Stripe = require(path.join(REPO, 'node_modules', 'stripe'));
const { q, prisma } = require('./db');

// Refuse to run anywhere but the sandboxes and the local database.
if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('not a Stripe test key');
if (!process.env.DUFFEL_ACCESS_TOKEN?.startsWith('duffel_test_')) throw new Error('not a Duffel test token');
if (!/127\.0\.0\.1:5434|localhost:5434/.test(process.env.DATABASE_URL ?? '')) throw new Error('not the local database');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const BASE = 'http://localhost:4010/api/v2';
const S = __dirname;
const FAULT_FILE = path.join(S, 'fault.json');

const setFaults = (rules) => fs.writeFileSync(FAULT_FILE, JSON.stringify({ rules }, null, 1));
const clearFaults = () => setFaults([]);

async function api(method, p, body, token, headers = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

async function registerUser(tag) {
  const email = `e2e-${tag}-${Date.now()}@example.test`;
  const r = await api('POST', '/auth/register', { email, password: 'E2e-sandbox-pass-1', first_name: 'Sandbox', last_name: 'Tester' });
  const cookie = (r.headers.getSetCookie?.() ?? []).find((c) => /access_token=/.test(c));
  const token = cookie?.match(/access_token=([^;]+)/)?.[1] ?? r.body?.accessToken ?? r.body?.data?.accessToken;
  if (!token) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return { email, token };
}

function departure(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** A Duffel Airways (ZZ, the sandbox's own airline) offer when there is one, else the cheapest Duffel offer. */
async function findOffer(daysAhead = 45, route = { origin: 'LHR', destination: 'JFK' }) {
  const r = await api('POST', '/flights/search', { ...route, departureDate: departure(daysAhead), adults: 1, cabinClass: 'economy', tripType: 'one-way' });
  if (r.status !== 200) throw new Error(`search ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  const offers = (r.body.offers ?? r.body.data ?? r.body.results ?? []).filter((o) => (o.provider ?? 'duffel') === 'duffel');
  if (!offers.length) throw new Error(`no Duffel offers: ${JSON.stringify(Object.keys(r.body))}`);
  const zz = offers.filter((o) => o._rawOffer?.owner?.iata_code === 'ZZ').sort((a, b) => a.price.total - b.price.total);
  return zz[0] ?? offers.sort((a, b) => a.price.total - b.price.total)[0];
}

const offerIdOf = (o) => o.offerId ?? o._rawOffer?.id;

async function book(token, offer, over = {}) {
  return api('POST', '/flights/book', {
    provider: 'duffel',
    offerId: offerIdOf(offer),
    flight: offer,
    tripType: 'one-way',
    passengers: [{ firstName: 'Sandbox', lastName: 'Tester', birthDate: '1990-04-12', gender: 'M', type: 'ADT', title: 'mr' }],
    contact: { email: 'sandbox.tester@example.test', phone: '+442080160509', countryCode: 'GB' },
    idempotencyKey: crypto.randomUUID(),
    displayCurrency: 'USD',
    acknowledgeDuplicate: true,
    ...over,
  }, token);
}

/** What the browser's Stripe step does: confirm the PaymentIntent with a test card. */
async function authorise(paymentIntentId, paymentMethod = 'pm_card_visa') {
  try {
    const pi = await stripe.paymentIntents.confirm(paymentIntentId, { payment_method: paymentMethod });
    return { status: pi.status };
  } catch (err) {
    return { status: 'error', code: err.code, decline: err.decline_code, message: err.message };
  }
}

const confirm = (token, sessionId, paymentIntentId) => api('POST', '/flights/confirm', { sessionId, paymentIntentId }, token);

/** Stripe's amount_capturable_updated, signed with the endpoint secret, as the browser-closed path receives it. */
async function sendAuthorisedWebhook(paymentIntentId) {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  const payload = JSON.stringify({
    id: `evt_e2e_${crypto.randomUUID().replace(/-/g, '')}`, object: 'event', api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000), type: 'payment_intent.amount_capturable_updated',
    data: { object: pi }, livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const res = await fetch(BASE + '/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
  return { status: res.status, body: await res.text() };
}

/** Re-deliver a real Stripe event (fetched from Stripe) to the local webhook, signed. Stripe cannot reach localhost. */
async function replayStripeEvent(type, objectId) {
  let ev;
  for (let i = 0; i < 20 && !ev; i++) {
    ev = (await stripe.events.list({ type, limit: 20 })).data.find((e) => e.data.object.id === objectId);
    if (!ev) await new Promise((r) => setTimeout(r, 3000));
  }
  if (!ev) return { status: 'no event', type, objectId };
  const payload = JSON.stringify(ev);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  const res = await fetch(BASE + '/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
  return { status: res.status, eventId: ev.id, body: await res.text() };
}

const cron = (name) => api('GET', `/cron/${name}`, undefined, undefined, { authorization: `Bearer ${process.env.CRON_SECRET}` });

async function duffelOrder(orderId) {
  if (!orderId) return null;
  const res = await fetch(`https://api.duffel.com/air/orders/${orderId}`, {
    headers: { authorization: `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`, 'Duffel-Version': 'v2', accept: 'application/json' },
  });
  if (res.status === 404) return { id: orderId, missing: true };
  const j = await res.json();
  const d = j.data ?? {};
  return { id: d.id, booking_reference: d.booking_reference, cancelled_at: d.cancelled_at ?? null, documents: (d.documents ?? []).length, total: d.total_amount, currency: d.total_currency };
}

/** Duffel orders made in the sandbox since `sinceIso` for this family name: catches an order nobody recorded. */
async function duffelOrdersSince(sinceIso, familyName = 'Tester') {
  const res = await fetch(`https://api.duffel.com/air/orders?limit=50`, {
    headers: { authorization: `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`, 'Duffel-Version': 'v2', accept: 'application/json' },
  });
  const j = await res.json();
  return (j.data ?? []).filter((o) => o.created_at >= sinceIso && (o.passengers ?? []).some((p) => p.family_name === familyName))
    .map((o) => ({ id: o.id, created_at: o.created_at, cancelled_at: o.cancelled_at, documents: (o.documents ?? []).length }));
}

const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x)));

/** Money and booking state for one attempt, from Stripe, our database and Duffel. */
async function state(sessionId, paymentIntentId) {
  const pi = paymentIntentId ? await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] }) : null;
  const charge = pi?.latest_charge && typeof pi.latest_charge !== 'string' ? pi.latest_charge : null;
  const [session] = await q(`SELECT id, lifecycle_status, status, capture_method FROM booking_sessions WHERE id = $1::uuid`, sessionId);
  const events = await q(`SELECT from_status, to_status, actor, reason, payload FROM flight_booking_events WHERE session_id = $1::uuid ORDER BY created_at, id`, sessionId);
  const [sale] = await q(`SELECT id, status, pnr, provider_order_id, total_price::text, charged_price::text, currency, supplier_cost::text FROM flight_bookings WHERE payment_intent_id = $1 OR session_id::text = $2`, paymentIntentId ?? '', sessionId);
  const attempts = await q(`SELECT completed_at IS NOT NULL AS completed, outcome FROM supplier_booking_attempts WHERE client_reference = $1`, sessionId).catch(() => []);
  const orderId = sale?.provider_order_id ?? [...events].reverse().map((e) => e.payload?.supplierOrderId).find(Boolean) ?? null;
  const order = await duffelOrder(orderId);
  return plain({
    stripe: pi && {
      status: pi.status, amount: pi.amount, currency: pi.currency,
      capturable: pi.amount_capturable, received: pi.amount_received,
      refunded: charge?.amount_refunded ?? 0,
    },
    session: session && { lifecycle: session.lifecycle_status, status: session.status, capture: session.capture_method },
    events: events.map((e) => `${e.from_status ?? '∅'}→${e.to_status} [${e.actor}] ${e.reason ?? ''}${e.payload?.failureCode ? ` (${e.payload.failureCode})` : ''}`),
    sale: sale ?? null,
    supplierAttempts: attempts,
    duffelOrder: order,
  });
}

/**
 * The invariant this run proves: money is kept only when a confirmed booking stands behind it.
 *   taken = captured − refunded (in minor units)
 *   PASS when taken = 0, or when the sale is written (ticketed / awaiting_ticket) on a live Duffel order.
 * A hold (authorised, not captured) is not money taken; it is reported beside the verdict.
 */
function verdict(st) {
  // A voided hold shows its whole amount as 'refunded' on the charge; only captured money can be refunded.
  const taken = st.stripe ? Math.max(0, st.stripe.received - st.stripe.refunded) : 0;
  const saleLive = !!st.sale && ['ticketed', 'awaiting_ticket', 'confirmed'].includes(st.sale.status);
  const orderLive = !!st.duffelOrder && !st.duffelOrder.missing && !st.duffelOrder.cancelled_at;
  const pass = taken === 0 || (saleLive && orderLive);
  const notes = [];
  if (st.stripe?.status === 'requires_capture') notes.push(`card HELD ${st.stripe.capturable} (not captured)`);
  if (orderLive && taken === 0) notes.push('LIVE ORDER WITHOUT PAYMENT (revenue, not customer money)');
  if (taken > 0 && saleLive && !orderLive) notes.push('charged, sale written, but Duffel order not live');
  return { pass, taken, saleLive, orderLive, notes };
}

module.exports = {
  stripe, api, registerUser, findOffer, offerIdOf, book, authorise, confirm, sendAuthorisedWebhook, cron,
  state, verdict, setFaults, clearFaults, replayStripeEvent, duffelOrder, duffelOrdersSince, q, prisma, departure,
};
