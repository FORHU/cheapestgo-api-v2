// The cases. Each returns { steps, expect, st, v, orders } and is run by run.js.
const L = require('./lib');

const ORDER = '^/air/orders$';
const OFFER = '^/air/offers/[^/]+$';

/** Search, sign up, book. Shared by every case. */
async function start(tag) {
  const user = await L.registerUser(tag);
  const offer = await L.findOffer(30 + Math.floor(Math.random() * 60));
  const b = await L.book(user.token, offer);
  if (b.status !== 200) throw Object.assign(new Error(`book ${b.status}: ${JSON.stringify(b.body).slice(0, 300)}`), { step: 'book' });
  return { user, offer, sessionId: b.body.sessionId, pi: b.body.paymentIntentId, held: { amount: b.body.amount, currency: b.body.currency, fare: b.body.fare, fee: b.body.serviceFee }, since: new Date(Date.now() - 5000).toISOString() };
}

const brief = (r) => ({ status: r.status, error: r.body?.error, message: typeof r.body?.message === 'string' ? r.body.message.slice(0, 140) : undefined, pnr: r.body?.pnr, bookingStatus: r.body?.status, pending: r.body?.pending, needsReview: r.body?.needsReview });

async function finish(ctx, steps, expect) {
  const st = await L.state(ctx.sessionId, ctx.pi);
  const orders = await L.duffelOrdersSince(ctx.since);
  return { steps, expect, held: ctx.held, st, v: L.verdict(st), orders };
}

module.exports = {
  /** 1. Everything works. */
  async happy() {
    const c = await start('happy');
    const steps = { authorise: await L.authorise(c.pi) };
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    const out = await finish(c, steps, 'confirm 200; captured in full; sale ticketed; order live');
    out.forLater = { token: c.user.token, bookingId: out.st.sale?.id };
    return out;
  },

  /** 2a. The card is declined. */
  async declined() {
    const c = await start('declined');
    const steps = { authorise: await L.authorise(c.pi, 'pm_card_chargeDeclined') };
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    return finish(c, steps, 'authorise declined; confirm 402 PAYMENT_NOT_COMPLETED; nothing ordered; nothing captured');
  },

  /** 2b. Declined for insufficient funds, then confirm is called anyway. */
  async insufficientFunds() {
    const c = await start('nsf');
    const steps = { authorise: await L.authorise(c.pi, 'pm_card_chargeDeclinedInsufficientFunds') };
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    return finish(c, steps, 'confirm 402; nothing ordered; nothing captured');
  },

  /** 2c. The card needs 3-D Secure and the challenge is never completed. */
  async threeDSAbandoned() {
    const c = await start('3ds');
    const steps = { authorise: await L.authorise(c.pi, 'pm_card_authenticationRequired') };
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    return finish(c, steps, 'PaymentIntent requires_action; confirm 402; nothing ordered or captured');
  },

  /** 3a. Paid, then the offer is gone when the order is placed. */
  async offerGoneAfterPayment() {
    const c = await start('offergone');
    const steps = { authorise: await L.authorise(c.pi) };
    L.setFaults([{ method: 'GET', path: OFFER, action: 'respond', status: 404, body: { errors: [{ code: 'not_found', title: 'Not found', message: 'Offer not found' }] }, times: 3 }]);
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    L.clearFaults();
    return finish(c, steps, 'confirm 410 OFFER_EXPIRED; hold voided (canceled); nothing ordered');
  },

  /** 3b. Paid, then the airline refuses the order. */
  async airlineRefuses() {
    // BUG-2 check: one order request, no re-search (fault log), and the airline's own reason back.
    const c = await start('refused');
    const steps = { authorise: await L.authorise(c.pi) };
    L.setFaults([{ method: 'POST', path: ORDER, action: 'respond', status: 422, body: { errors: [{ code: 'validation_error', title: 'Invalid passenger', message: 'The passenger name is not accepted by the airline' }] }, times: 1 }]);
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    L.clearFaults();
    return finish(c, steps, 'confirm 400 DUFFEL_ORDER_FAILED; hold voided; nothing ordered');
  },

  /** 3c. Paid, then the fare rises beyond tolerance at order time. */
  async priceRose() {
    const c = await start('pricerose');
    const steps = { authorise: await L.authorise(c.pi) };
    const raw = c.offer._rawOffer;
    const raised = (Number(raw.total_amount) * 1.5).toFixed(2);
    L.setFaults([
      { method: 'POST', path: ORDER, action: 'respond', status: 422, body: { errors: [{ code: 'price_changed', title: 'Price changed', message: 'The price of the offer has changed', source: { offer_id: raw.id } }] }, times: 3 },
      { method: 'POST', path: '^/air/offers/[^/]+/actions/price$', action: 'respond', status: 200, body: { data: { id: raw.id, total_amount: raised, total_currency: raw.total_currency } }, times: 3 },
    ]);
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    L.clearFaults();
    return finish(c, steps, 'confirm 409 PRICE_CHANGED; hold voided; nothing ordered');
  },

  /** 4. Ordered, but the tickets are not issued yet. */
  async ticketingDelayed() {
    const c = await start('ticketlate');
    const steps = { authorise: await L.authorise(c.pi) };
    L.setFaults([{ method: 'POST', path: ORDER, action: 'strip-documents', times: 1 }]);
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    L.clearFaults();
    steps.beforePoll = (await L.state(c.sessionId, c.pi)).sale?.status ?? null;
    steps.poll = brief(await L.cron('poll-pending-tickets'));
    return finish(c, steps, 'confirm 200 with awaiting_ticket; captured (booking confirmed, ticket pending); poll moves it to ticketed');
  },

  /** 5a. The order is made at Duffel but our request times out before the answer. */
  async timeoutOrderMade() {
    const c = await start('tmo-made');
    const steps = { authorise: await L.authorise(c.pi) };
    L.setFaults([{ method: 'POST', path: ORDER, action: 'throw-after', times: 1 }]);
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    L.clearFaults();
    return finish(c, steps, 'read-back finds the order → captured, sale written (confirm 200, or 409 processing then settled)');
  },

  /** 5b. The order request never reaches Duffel (connection dropped). */
  async timeoutNoOrder() {
    const c = await start('tmo-none');
    const steps = { authorise: await L.authorise(c.pi) };
    L.setFaults([{ method: 'POST', path: ORDER, action: 'throw-before', times: 1 }]);
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    L.clearFaults();
    steps.sweep = brief(await L.cron('flight-booking-sweep'));
    return finish(c, steps, 'NEEDS_REVIEW (UNKNOWN_OUTCOME); hold kept, NOT captured; sweeper leaves it and notifies; no order');
  },

  /** 5c. Duffel answers 503 to the order. */
  async duffel5xx() {
    const c = await start('d503');
    const steps = { authorise: await L.authorise(c.pi) };
    L.setFaults([{ method: 'POST', path: ORDER, action: 'respond', status: 503, body: { errors: [{ code: 'service_unavailable', message: 'Service unavailable' }] }, times: 1 }]);
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    L.clearFaults();
    return finish(c, steps, 'treated as no answer: read back, nothing found → NEEDS_REVIEW, hold kept, not captured');
  },

  /** 5d. Duffel cannot be reached when the offer is re-read at confirm. */
  async offerReadTimeout() {
    const c = await start('offer-tmo');
    const steps = { authorise: await L.authorise(c.pi) };
    L.setFaults([{ method: 'GET', path: OFFER, action: 'throw-before', times: 6 }]);
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    L.clearFaults();
    return finish(c, steps, 'confirm 503 UPSTREAM_UNAVAILABLE; hold voided; nothing ordered');
  },

  /** 6. The browser closes after paying: Stripe's webhook finishes the booking. */
  async webhookCompletes() {
    const c = await start('webhook');
    const steps = { authorise: await L.authorise(c.pi) };
    steps.webhook = await L.sendAuthorisedWebhook(c.pi);
    steps.lateConfirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    return finish(c, steps, 'webhook confirms and captures; a late confirm is answered from the record; one order');
  },

  /** 7. Double-click and webhook race for one payment. */
  async race() {
    const c = await start('race');
    const steps = { authorise: await L.authorise(c.pi) };
    const [a, b, w] = await Promise.all([
      L.confirm(c.user.token, c.sessionId, c.pi), L.confirm(c.user.token, c.sessionId, c.pi), L.sendAuthorisedWebhook(c.pi),
    ]);
    steps.confirmA = brief(a); steps.confirmB = brief(b); steps.webhook = w;
    return finish(c, steps, 'exactly one Duffel order; captured once; sale written once');
  },

  /** 8a. Paid but abandoned: the sweeper releases the hold. */
  async abandonedAuthorised() {
    const c = await start('abandon-auth');
    const steps = { authorise: await L.authorise(c.pi) };
    // What a webhook-less 30 minutes looks like: authorised, recorded, then left.
    await L.q(`UPDATE booking_sessions SET lifecycle_status = 'PAYMENT_AUTHORIZED', updated_at = now() - interval '45 minutes', created_at = now() - interval '45 minutes' WHERE id = $1::uuid AND lifecycle_status IN ('PAYMENT_PENDING','PAYMENT_AUTHORIZED')`, c.sessionId);
    steps.sweep = brief(await L.cron('flight-booking-sweep'));
    steps.lateConfirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    return finish(c, steps, 'sweeper expires then voids; a late confirm is refused (410); nothing ordered');
  },

  /** 8a'. Authorised at Stripe but nothing recorded it (tab closed, webhook missed); left 3h. */
  async abandonedAuthorisedUnrecorded() {
    const c = await start('abandon-unrec');
    const steps = { authorise: await L.authorise(c.pi) };
    await L.q(`UPDATE booking_sessions SET updated_at = now() - interval '3 hours', created_at = now() - interval '3 hours' WHERE id = $1::uuid`, c.sessionId);
    steps.lifecycleBeforeSweep = (await L.state(c.sessionId, c.pi)).session.lifecycle;
    steps.sweep = brief(await L.cron('flight-booking-sweep'));
    steps.lateConfirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    return finish(c, steps, 'sweeper releases the authorised-but-unrecorded hold; a late confirm is refused; nothing ordered');
  },

  /** 8b. Never paid and abandoned: the sweeper closes it and cancels the PaymentIntent. */
  async abandonedUnpaid() {
    const c = await start('abandon-unpaid');
    await L.q(`UPDATE booking_sessions SET updated_at = now() - interval '3 hours', created_at = now() - interval '3 hours' WHERE id = $1::uuid`, c.sessionId);
    const steps = { sweep: brief(await L.cron('flight-booking-sweep')) };
    steps.payAfterSweep = await L.authorise(c.pi);
    return finish(c, steps, 'session EXPIRED; PaymentIntent canceled so it cannot be paid later; nothing ordered');
  },

  /** 9. A confirmed booking cancelled by the traveller: the refund follows the airline's. */
  async customerCancels(prev) {
    const c = prev ?? await (async () => { const r = await module.exports.happy(); return { token: r.forLater.token, bookingId: r.forLater.bookingId }; })();
    const steps = {};
    const quote = await L.api('POST', '/flights/cancel-quote', { bookingId: c.bookingId }, c.token);
    steps.quote = { status: quote.status, body: quote.body };
    const cancel = await L.api('POST', '/flights/cancel-booking', { bookingId: c.bookingId, cancellationId: quote.body?.cancellationId ?? quote.body?.data?.cancellationId }, c.token);
    steps.cancel = { status: cancel.status, body: cancel.body };
    const [row] = await L.q(`SELECT session_id::text AS session_id, payment_intent_id FROM flight_bookings WHERE id::text = $1`, c.bookingId);
    const st = await L.state(row.session_id, row.payment_intent_id);
    return { steps, expect: 'Duffel order cancelled; Stripe refund = airline refund share of what was paid; booking cancelled', st, v: L.verdict(st), orders: [] };
  },

  /** 9b. Cancelled and refunded, but the refund fails afterwards at the bank (Stripe's refund-fail card). */
  async refundFailsLater() {
    const c = await start('refundfail');
    const steps = { authorise: await L.authorise(c.pi, 'pm_card_refundFail') };
    steps.confirm = brief(await L.confirm(c.user.token, c.sessionId, c.pi));
    const bookingId = (await L.state(c.sessionId, c.pi)).sale?.id;
    const quote = await L.api('POST', '/flights/cancel-quote', { bookingId }, c.user.token);
    const cancel = await L.api('POST', '/flights/cancel-booking', { bookingId, cancellationId: quote.body?.cancellationId }, c.user.token);
    steps.cancel = { status: cancel.status, body: cancel.body };
    let refund;
    for (let i = 0; i < 40; i++) {
      // Retrieved, not listed: the list kept answering `succeeded` after the refund had failed.
      const listed = (await L.stripe.refunds.list({ payment_intent: c.pi, limit: 5 })).data[0];
      refund = listed && await L.stripe.refunds.retrieve(listed.id);
      if (refund?.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    steps.stripeRefund = refund && { id: refund.id, status: refund.status, amount: refund.amount, failure_reason: refund.failure_reason };
    // What Stripe would deliver to the deployed endpoint: its real refund.failed event.
    steps.webhook = refund?.status === 'failed' ? await L.replayStripeEvent('refund.failed', refund.id) : null;
    steps.webhookAgain = refund?.status === 'failed' ? await L.replayStripeEvent('refund.failed', refund.id) : null;
    steps.alerts = (await L.q(`SELECT title, left(description, 200) AS d FROM notifications WHERE description LIKE $1`, `%${refund?.id}%`));
    steps.refundLog = (await L.q(`SELECT status::text, left(status_reason, 120) AS reason FROM refund_logs WHERE booking_id = $1`, bookingId));
    const out = await finish(c, steps, 'Stripe cannot repay a closed card, so the money stays taken; the fix is that the system now knows: booking refund_failed, refund log failed, one alert to the team');
    out.v.recordTrue = out.st.sale?.status === 'refund_failed' && steps.refundLog.every((r) => r.status === 'failed') && steps.alerts.length === 1;
    return out;
  },

  /** 9c. The airline keeps a penalty: half the fare comes back. The card gets the same share. */
  async partialRefund() {
    const r = await module.exports.happy();
    const { token, bookingId } = r.forLater;
    L.setFaults([
      { method: 'POST', path: '^/air/order_cancellations$', action: 'scale', field: 'refund_amount', factor: 0.5, times: 2 },
      { method: 'POST', path: '^/air/order_cancellations/[^/]+/actions/confirm$', action: 'scale', field: 'refund_amount', factor: 0.5, times: 1 },
    ]);
    const steps = { booked: r.steps.confirm };
    const quote = await L.api('POST', '/flights/cancel-quote', { bookingId }, token);
    steps.quote = quote.body;
    const cancel = await L.api('POST', '/flights/cancel-booking', { bookingId, cancellationId: quote.body?.cancellationId }, token);
    steps.cancel = cancel.body;
    L.clearFaults();
    const [row] = await L.q(`SELECT session_id::text AS session_id, payment_intent_id, supplier_cost::text, refund_amount::text, refund_penalty_amount::text FROM flight_bookings WHERE id::text = $1`, bookingId);
    const st = await L.state(row.session_id, row.payment_intent_id);
    // In the fare's currency, as the code computes it: what the airline returns of what it charged.
    // (`refund_amount` is overwritten with the CARD refund once Stripe succeeds, so it is not used here.)
    const share = (Number(row.supplier_cost) - Number(row.refund_penalty_amount)) / Number(row.supplier_cost);
    const expectedRefund = Math.round(st.stripe.received * share);
    steps.check = { airlineRefund: row.refund_amount, airlinePenalty: row.refund_penalty_amount, supplierCost: row.supplier_cost, share, expectedStripeRefund: expectedRefund, actualStripeRefund: st.stripe.refunded };
    const v = L.verdict(st);
    // A penalty the airline kept is kept here too, in the same share: that is policy, not money without a booking.
    v.pass = st.stripe.refunded === expectedRefund && !!st.duffelOrder?.cancelled_at;
    v.notes.push('pass = Stripe refund equals the airline refund share of what the card paid');
    return { steps, expect: 'Stripe refund = card amount × airline refund ÷ (refund + penalty); order cancelled', st, v, orders: [] };
  },

  /** 10. Cancelled at Duffel (dashboard/airline); the booking page notices and refunds. */
  async supplierCancels() {
    const r = await module.exports.happy();
    const orderId = r.st.sale?.provider_order_id;
    const steps = { booked: r.steps.confirm };
    const hdr = { authorization: `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`, 'Duffel-Version': 'v2', 'content-type': 'application/json', accept: 'application/json' };
    const qc = await (await fetch('https://api.duffel.com/air/order_cancellations', { method: 'POST', headers: hdr, body: JSON.stringify({ data: { order_id: orderId } }) })).json();
    steps.duffelQuote = { id: qc.data?.id, refund: qc.data?.refund_amount, currency: qc.data?.refund_currency, to: qc.data?.refund_to, errors: qc.errors };
    const cc = await (await fetch(`https://api.duffel.com/air/order_cancellations/${qc.data?.id}/actions/confirm`, { method: 'POST', headers: hdr })).json();
    steps.duffelConfirm = { confirmed_at: cc.data?.confirmed_at, errors: cc.errors };
    const rs = await L.api('POST', '/flights/refresh-status', { bookingId: r.forLater.bookingId }, r.forLater.token);
    steps.refresh = { status: rs.status, body: rs.body };
    const [row] = await L.q(`SELECT session_id::text AS session_id, payment_intent_id FROM flight_bookings WHERE id::text = $1`, r.forLater.bookingId);
    const st = await L.state(row.session_id, row.payment_intent_id);
    return { steps, expect: 'refresh-status sees the Duffel cancellation; refund = airline share; booking cancelled', st, v: L.verdict(st), orders: [] };
  },
};
