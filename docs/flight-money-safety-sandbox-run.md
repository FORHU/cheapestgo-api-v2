# Flight money safety: sandbox end-to-end run (2026-11-11)

**Question:** can any path leave a traveller charged without a confirmed flight booking?

**Answer:** one can. A cancelled booking whose Stripe refund **fails after Stripe accepted it** keeps
the money, and the booking still reads `refunded` (BUG-1 below). Every other path tested holds:
money is captured only with a live Duffel order and a written booking, and otherwise it is voided,
refunded, or (deliberately) left as an uncaptured hold for a person to settle.

21 cases, run against the **Duffel sandbox** (`duffel_test_` token, Duffel Airways `ZZ` offers) and
**Stripe test mode** (`sk_test_`), through the real API on a private port. 20 pass, 1 fails.

## Method

- **The real flow.** Each case signs up a fresh user, searches LHR→JFK, calls `POST /flights/book`,
  authorises the PaymentIntent with a Stripe test card (what the browser's Stripe step does), then
  `POST /flights/confirm` — or the signed `payment_intent.amount_capturable_updated` webhook, or the
  sweeper, depending on the case.
- **Failures injected at the network edge, not in the code.** A preload (`faults.js`) wraps `fetch`
  for `api.duffel.com` calls only, and per case either drops a request before it leaves, lets it
  reach Duffel and then withholds the answer (a real order is made — the timeout case that matters),
  answers on Duffel's behalf (422 / 404 / 503), or edits a real response (strip ticket documents,
  scale a refund). Stripe failures use Stripe's own test cards.
- **Verdict from three sources**, never from the API's own answer: Stripe (captured, refunded, held),
  our database (`booking_sessions.lifecycle_status`, `flight_booking_events`, `flight_bookings`), and
  Duffel (the order and whether it is cancelled), plus every sandbox order made under the test
  passenger's name since the case began — so an order nobody recorded would show up.
- **The rule:** *money taken* = captured − refunded. **Pass** when it is 0, or when a written booking
  (`ticketed` / `awaiting_ticket`) stands on a live Duffel order. A held-but-uncaptured card is not
  money taken; it is reported beside the verdict. For a partial refund, pass = the refund equals the
  airline's share applied to what the card paid.
- **Safety:** the harness refuses to run unless the keys are test keys and the database is local
  (`127.0.0.1:5434`). The API ran with `EMAIL_TRANSPORT=log`, so no mail went out.

## Results

| # | Case | API answer | Stripe | Booking | Duffel order | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Successful booking** | 200 `ticketed` | captured 246.41 | `ticketed` | live, 1 ticket | ✅ |
| 2a | Card declined | 402 `PAYMENT_NOT_COMPLETED` | not authorised | none | none | ✅ |
| 2b | Insufficient funds | 402 | not authorised | none | none | ✅ |
| 2c | 3-D Secure never completed | 402 | `requires_action` | none | none | ✅ |
| 3a | Paid, offer gone at order time | 410 `OFFER_EXPIRED` | hold voided | none | none | ✅ |
| 3b | Paid, airline refuses the order | 409 `PRICE_CHANGED` ⚠️ | hold voided | none | none | ✅ (BUG-2) |
| 3b′ | Paid, Duffel **really** refused (phone) | 400 `DUFFEL_ORDER_FAILED` | hold voided | none | none | ✅ |
| 3c | Paid, fare rose beyond tolerance | 409 `PRICE_CHANGED` | hold voided | none | none | ✅ |
| 4 | **Booked, ticketing delayed** | 200 `awaiting_ticket` | captured | `awaiting_ticket` → `ticketed` by the poll cron | live | ✅ |
| 5a | **Timeout, order made at Duffel** | 200 `ticketed` (read back) | captured once | `ticketed` | live, exactly 1 | ✅ |
| 5b | Timeout, order never reached Duffel | 409 `BOOKING_PROCESSING` | **held**, not captured | `NEEDS_REVIEW` | none | ✅ (by design) |
| 5c | Duffel 503 on the order | 409 `BOOKING_PROCESSING` | **held**, not captured | `NEEDS_REVIEW` | none | ✅ (by design) |
| 5d | Duffel unreachable at confirm | 503 `UPSTREAM_UNAVAILABLE` | hold voided | none | none | ✅ |
| 6 | Browser closed, webhook finishes | webhook 200; late confirm 200 | captured once | `ticketed` | live, 1 | ✅ |
| 7 | Two confirms + webhook at once | both 200, same PNR | captured once | `ticketed` once | exactly 1 | ✅ |
| 8a | Authorised, abandoned (recorded) | sweeper; late confirm 410 | hold voided | `EXPIRED` | none | ✅ |
| 8a′ | Authorised at Stripe, **nothing recorded it** | sweeper; late confirm 410 | hold voided | `EXPIRED` | none | ✅ |
| 8b | Never paid, abandoned | sweeper | PI cancelled (cannot be paid later) | `EXPIRED` | none | ✅ |
| 9 | **Traveller cancels** (full refund) | 200 `refunded` | refunded in full | `refunded` | cancelled | ✅ |
| 9b | **Cancelled, refund fails afterwards** | 200 `refunded` | **captured 246.20, refunded 0** | `refunded` | cancelled | ❌ **BUG-1** |
| 9c | Cancelled with a 50% airline penalty | 200 `refunded` | refunded 119.76 of 239.54 (= airline share) | `refunded` | cancelled | ✅ (BUG-3) |
| 10 | Cancelled at Duffel; booking page notices | `refresh-status` 200 `refunded` | refunded in full | `refunded` | cancelled | ✅ |

Notes on the passes:

- **5b / 5c leave the card held on purpose** (ADR-0026: an unanswered order is never voided, Duffel
  may hold a ticket). The sweeper never voids them and raised **exactly one** "Flight booking needs
  review" notification per attempt after 15 minutes (a second sweep raised none). If nobody settles
  it, Stripe lets the authorisation lapse after about seven days, so the traveller is still not
  charged — but they see a pending hold until then.
- **4:** money is captured while the ticket is pending. The Duffel order is confirmed, so the rule
  holds; the ticket arrived on the next `poll-pending-tickets` run.
- **5a** is the case the 130s order timeout exists for: Duffel made the order, our request "timed
  out", the lifecycle read the order back, captured, and wrote the booking. One order, no second
  attempt.

## Fixes (same day, branch `fix/flight-money-bugs`)

All three bugs below are fixed test-first and re-run against the sandboxes (evidence in
`e2e/flight-money-safety/results-2026-11-11-after-fixes/`). API suite: 142 files / 1993 tests green.

| Bug | Fix | Sandbox re-run |
|---|---|---|
| BUG-1 | New `services/flightRefundFailure.ts`, reached from the Stripe webhook on `refund.failed` and on `charge.refund.updated` with status `failed`: the booking goes `refunded` → `refund_failed` (status-guarded, logged), the refund log row → `failed` (`markRefundFailed`), and one notification per refund tells the team the traveller must be paid another way. | Stripe's real `refund.failed` event, delivered twice: booking `refund_failed`, refund log `failed`, exactly **one** alert. |
| BUG-2 | `isOfferGoneError` (`lib/flights/duffelErrors.ts`). `placeDuffelOrder` searches the flight again only for a gone offer or an unsettled `price_changed`; any other 422 is handed back as a refusal. The lifecycle's `refusal()` calls a 422 an expired offer only when it is one. | `DUFFEL_ORDER_FAILED` with the airline's reason, one order request, no re-search, hold voided. |
| BUG-3 | `cancelQuote` answers the penalty: what was paid minus the refund, in the card's currency. | Quote: refund 124.40, penalty 124.39 of 248.79 paid. |

**BUG-1 still leaves the money with us** — Stripe cannot repay a closed card, so a person has to.
What changed is that the system now says so instead of claiming a refund that never landed.

**Deploy step:** the Stripe webhook endpoint must be subscribed to **`refund.failed`** (Stripe
Dashboard → Developers → Webhooks → the endpoint → events). Stripe delivers only subscribed events;
without it the fix never runs. `charge.refund.updated` also works if it is already subscribed.

## Bugs found

### BUG-1 — A refund that fails after Stripe accepted it leaves the money taken (money safety, high)

**Repro (9b):** book and pay with Stripe's `pm_card_refundFail` card, cancel through
`/flights/cancel-booking`. Duffel cancels the order. Stripe accepts the refund (`succeeded`), then
fails it about a minute later (`failure_reason: expired_or_canceled_card`). Stripe emits
`refund.failed` and `charge.refund.updated` (`failed`); the charge's `amount_refunded` returns to 0.

**Result:** the traveller has paid 246.20 for a flight that no longer exists. Our booking says
`refunded`, the API told them they were refunded, the refund log is closed as issued, and nothing
will ever notice.

**Root cause:** `cancelBooking` (`src/services/flights.service.ts` ~L1321) treats a refund Stripe
*accepted* (`succeeded` or `pending`) as final and writes `refunded`. Stripe can still fail it
later, and the Stripe webhook (`src/routes/webhooks.route.ts`) handles only
`payment_intent.succeeded`, `payment_intent.amount_capturable_updated`,
`payment_intent.payment_failed` and `charge.refunded` — not `refund.failed` /
`charge.refund.updated`. The same refund code serves the Duffel-side cancellation sync, so case 10
has the same exposure. Not checked: whether hotel and golf refunds share it (same webhook, so
likely).

**Decided in the fix:** the booking moves to `refund_failed` and the team is alerted (the card cannot
be refunded again; the traveller has to be paid another way). **Still open:** whether the traveller is
emailed too — not done, since it needs a new `email_logs` type.

### BUG-2 — An order refusal is reported as "the price changed" (wrong error, money safe)

**Repro (3b):** Duffel answers `POST /air/orders` with a 422 that is not `offer_no_longer_available`
or `price_changed` (e.g. a passenger validation error).

**Result:** the hold is voided correctly, but the traveller is told the fare changed. When the price
has not moved, a second order is placed against a fresh offer instead (seen in 3b′, which then
failed again and answered `DUFFEL_ORDER_FAILED`).

**Root cause:** `placeDuffelOrder` (`src/lib/flights/duffel.ts` L488) sends every 422 other than
those two codes down the "offer expired — rebuilding offer_request" path (L495), which re-searches
the itinerary and either reports a price change or orders again.

### BUG-3 — The cancellation quote always says "no penalty" (wrong information before consent)

**Repro (9c):** an airline refund of half the fare. `/flights/cancel-quote` answers the correct
refund (119.76 of 239.54) but `penaltyAmount: 0`.

**Result:** the app's cancellation card (`CancellationFeeCard.tsx`, app repo) shows a green **"Full
refund"** badge and *Penalty 0.00* next to a refund of half — the traveller agrees to an
irreversible cancellation on a false summary. The money itself is right (the airline's penalty is
kept in the same share).

**Root cause:** `cancelQuote` returns a hard-coded `penaltyAmount: 0`
(`src/services/flights.service.ts`, end of `cancelQuote`); the app treats `penalty 0 and refund > 0`
as a full refund.

### Smaller findings

- **Audit text:** a hold authorised at Stripe but never recorded (8a′) is expired with the reason
  "payment never started", though the card was held; the event misdescribes what was released.
- **Mixed currencies in one row:** after a successful refund `flight_bookings.refund_amount` is
  overwritten with the *card* refund, while `refund_penalty_amount` stays in the *fare's* currency.
  Their sum is not the airline's charge (it confused this run's first partial-refund check).
- **Float in the API:** the cancel response returned `penaltyAmount: 109.67999999999999`.
- **Phone check:** `book` accepts `+447700900123` (UK drama range) as E.164; Duffel refuses it at
  order time, after the card. Money safe (voided), but the traveller learns it after paying.

## Not covered by this run

- **Capture fails after the order** (`CAPTURE_FAILED`) and **sale not written after capture**
  (`SALE_NOT_RECORDED`): Stripe's SDK does not go through `fetch`, so the preload cannot fail a
  capture, and there is no clean way to make the insert fail. Both stay covered by unit tests only
  (`flightLifecycle.service.test.ts`). A captured booking with no row is now also listed by the
  reconciliation page (`/admin/reconciliation`, flights included).
- **The Duffel `order_cancellation.confirmed` webhook** itself; case 10 went through
  `refresh-status`, which calls the same `syncSupplierCancellation`.
- **A real browser and real 3-D Secure challenge**, **non-USD charge currencies**, **bundles**,
  **mobile routes**, and **hotel/golf** money paths.

## Re-running it

The harness is in `e2e/flight-money-safety/` (evidence JSON for this run in `results-2026-11-11/`).

```bash
# 1. A private API with the fault preload and mail logged (keeps your :4000 untouched)
cd cheapestgo-api-v2   # repo root
H=e2e/flight-money-safety
echo '{"rules":[]}' > $H/fault.json
EMAIL_TRANSPORT=log PORT=4010 FAULT_FILE=$PWD/$H/fault.json FAULT_LOG=$PWD/$H/fault.log \
  npx ts-node --transpile-only -r tsconfig-paths/register -r ./$H/faults.js src/server.ts

# 2. Check the environment is a sandbox, then run cases (names are the keys of cases.js)
node $H/env-gate.js
node $H/run.js happy declined timeoutOrderMade refundFailsLater
```

It needs a `.env` with a `duffel_test_` token, an `sk_test_` key, `STRIPE_WEBHOOK_SECRET`,
`CRON_SECRET`, and the local database with the lifecycle migration applied. Each case places at
most one sandbox order. Test users are `e2e-*@example.test` in the local database.
