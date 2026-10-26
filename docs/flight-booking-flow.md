# The flight booking flow

How a traveller pays for a flight and ends up with a ticket — and what happens on every path
where that does not go to plan. Written for whoever changes this next.

The plan this was built from is in the app repo's
`docs/superpowers/plans/2026-10-16-flight-booking-money-safety.md`. This is what was built.
It mirrors the hotel flow (`docs/booking-flow.md`); where the two agree, that document says
why at more length.

- **Domain logic lives here**, in api-v2 ([ADR-0017](../../cheapest-go-app/docs/adr/0017-api-v2-owns-all-domain-logic.md)).
- **Layers** are `Route → Controller → Service → Repository`, with supplier clients in `src/lib/`
  (see `CONTEXT.md`).

---

## 1. The shape of it

```
 search ──► book ──────────────► [card] ──► confirm ──► claim ──► Duffel order ──► capture ──► booking
             │                      │                    ▲
             │  re-read offer,      └─ Stripe authorises ┤  (the payment webhook
             │  check, price,          (manual capture)  │   can finish it too)
             │  open a HOLD                              │
             ▼                                           │
   OFFER_EXPIRED / PRICE_CHANGED /              sweeper releases holds nobody finished
   INVALID_PHONE / SERVICE_UNAVAILABLE
   (before the card, nothing to undo)
```

Money moves in a fixed order — **authorise → ask the airline → capture** — because a void is
free and instant and a refund is neither. Flights used to run the other way round: `book`
placed a paid Duffel order before the card was shown, so a refusal after it meant cancelling a
real ticket, and a traveller could be charged for one the airline then would not issue.

| Step | Endpoint | Auth | What it does |
|---|---|---|---|
| Book | `POST /flights/book` | ✔ | Re-reads the offer from Duffel, checks what it can, prices it, opens a **manual-capture** PaymentIntent. Places **no** order. |
| Confirm | `POST /flights/confirm` | ✔ | Claims the attempt, places the Duffel order, captures, writes the booking. |
| Status | `GET /flights/booking-status?sessionId=` | ✔ | The booking, or — before there is one — where the attempt is. Owner only. |
| Sweep | `GET /cron/flight-booking-sweep` | cron secret | Releases abandoned holds; reports attempts stuck with the airline. |

Mobile reaches the same `book` and `confirm` through `/mobile/flights/*`.

Stripe's `payment_intent.amount_capturable_updated` reaches the same completion routine as
`confirm` (§3), so a traveller whose tab closes after paying is not left with a hold and no
ticket. `flight` and `flight_bundle` PaymentIntents go there; the hotel half of a bundle is its
own PaymentIntent and completes as `hotel_bundle`.

---

## 2. What `book` checks before the card

`FlightsService.book` (`src/services/flights.service.ts`). Everything here is free to refuse:
nothing has been ordered and nothing authorised.

| Check | Answer |
|---|---|
| Mystifly fare | `422 FARE_UNAVAILABLE` — Mystifly is not live in v2 |
| The offer, **always fetched again** from Duffel by id — a browser copy is never priced from | `410 OFFER_EXPIRED` when gone, `503 UPSTREAM_UNAVAILABLE` when Duffel does not answer |
| Duplicate departure (ADR-0011) | `409 DUPLICATE_BOOKING` unless `acknowledgeDuplicate` |
| One traveller for every passenger the fare was priced for (none, or a different number, is refused) | `400 INVALID_PASSENGERS` |
| A contact is present, and its phone becomes E.164 (`orderPhoneNumber`) | `400 INVALID_PHONE` |
| Every chosen seat and bag is on sale in the offer | `409 SERVICE_UNAVAILABLE` |
| The fare has not risen beyond tolerance since the traveller saw it (`confirmedPrice`, or the offer the browser sent) | `409 PRICE_CHANGED` with `oldPrice`, `newPrice`, `currency` |

The hold is priced from the offer — fare plus seats and bags, every price from Duffel
(`orderTotal`), never the browser's `seatTotal`/`bagTotal` — with `applyMarkup` and strict FX,
as before. Duffel leaves services out of an offer unless asked, so `getDuffelOffer(id,
{ withServices: true })` asks when any were chosen. Pricing runs before anything is written,
so a rates outage leaves no session behind.

**One price, quoted and charged.** The figure comes from `priceFlightCharge`
(`src/lib/flights/flightCharge.ts`): the airline's fare, our markup (`FLIGHT_MARKUP_SPEC`),
the conversion, and the Stripe amount. `book` holds the card with it and answers
`{ amount, currency, fare, serviceFee }` beside the PaymentIntent. `GET /flights/offers/:offerId`
answers a `quote { currency, fare, serviceFee, total }` from the same function, so the checkout
can show the total — fee included — before the traveller commits to anything, and a quote and a
hold for the same offer agree to the cent. A quote that cannot be made (rates down for a non-USD
fare) is left out and the offer is still answered. The browser works nothing out itself.

The web checkout sends the fare it showed as `confirmedPrice`, so a fare that has risen since is
refused here (`409 PRICE_CHANGED`), before any card is held.

The session (`booking_sessions`) is written with `capture_method = 'manual'` and the pre-markup
total in the fare's currency as `original_price`. **`capture_method = 'manual'` is what marks
an attempt as the lifecycle's** — the sweeper and the crons in §5 key on it.

---

## 3. The lifecycle

`booking_sessions` is the attempt. `flight_bookings` is the **sale**: written once the airline
has ordered and the money is captured, and read by trips, invoices, admin and the crons.

```
 PAYMENT_PENDING ─► PAYMENT_AUTHORIZED ─► SUPPLIER_BOOKING ─► CONFIRMED
        │                   │                    │    │
        ▼                   ▼                    │    └─► NEEDS_REVIEW ─► CONFIRMED | FAILED
  FAILED / EXPIRED    FAILED / EXPIRED           └─► FAILED
```

(`src/lib/flights/lifecycle/stateMachine.ts`.) Once the airline has been asked an attempt
cannot expire: abandonment is not an answer when Duffel may hold an order. There are no cancel
or refund states — cancellation is unchanged and a confirmed flight is terminal here.

- The state is `booking_sessions.lifecycle_status`. The free-form `status` beside it is kept
  truthful for the code that still reads it (`completed`, `failed`, `expired`) but **nothing
  new may decide on it**.
- Every move appends a `flight_booking_events` row: **who** (`browser | webhook | sweeper |
  admin`), **why**, and a `payload`. `booking_sessions` has no column for why an attempt
  failed or which Duffel order it holds; both travel in the payload (`failureCode`,
  `failureMessage`, `supplierOrderId`) and are read back from the latest event that recorded
  them.
- Additive. The code runs on the old tables while the migration is absent (§7).

---

## 4. What happens to the money

`FlightBookingLifecycleService` (`src/services/flightBookingLifecycle.service.ts`) owns every
decision between "the card was authorised" and "the traveller has a ticket".

### Before the claim

The session must exist, belong to the caller (the webhook has none), and name this
PaymentIntent, and the PaymentIntent must name this session. Then, by Stripe's status:
`requires_capture` → claim. `succeeded` or `canceled` → answered from the record, never
ordered again. Anything else → `402 PAYMENT_NOT_COMPLETED`.

### The claim

`PAYMENT_PENDING → PAYMENT_AUTHORIZED` (the authorisation, recorded by whoever sees it first),
then `PAYMENT_AUTHORIZED → SUPPLIER_BOOKING` — one statement, so of any number of callers
racing for a payment (a double click, the browser and the webhook) exactly one asks Duffel. A
loser waits for the winner (up to 20s) and is answered with its result. A unique index on
`booking_sessions.payment_intent_id` backs it.

### The order

From what the session stored: the offer fetched again by `flight._offerId`, the passengers
rebuilt (`buildOrderPassengers`), seats and bags priced from the offer. Each infant is named on
a responsible adult of its own (`infant_passenger_id`, the first infant on the first adult) —
Duffel refuses an order with infants that does not — and when the order is retried against a
refreshed offer, that link is re-pointed at the fresh offer's infant. A
`supplier_booking_attempts` row is written **before** the call (`client_reference` = session
id). The Duffel idempotency key is `flight-order-<session id>` — per attempt, not the browser's
per-offer key, which would answer a corrected retry with the first attempt's refusal.

### The outcome table

| Duffel says | Money | State |
|---|---|---|
| Ordered | **Capture** (key `flight-capture-<session>`; one retry; a capture Stripe says succeeded is believed) → write the sale | `CONFIRMED` |
| `price_changed` beyond tolerance | **Void** | `FAILED` (`PRICE_CHANGED`) |
| Offer gone at fetch, `offer_replaced` (seats/bags would need choosing again), 422 expired | **Void** | `FAILED` (`OFFER_EXPIRED`) |
| Any other 4xx (invalid passenger, seat gone, phone) | **Void** | `FAILED` (`DUFFEL_ORDER_FAILED`) |
| Offer could not be read (nothing was ordered) | **Void** | `FAILED` (`UPSTREAM_UNAVAILABLE`) |
| Timeout, 5xx, dropped connection | **Keep the hold.** Read back (`findOrderFromTimedOutAttempt`): found → carry on as ordered. Not found → ↓ | `NEEDS_REVIEW` (`UNKNOWN_OUTCOME`) |
| Ordered, but capture fails after the retry | Hold kept; **no sale written**; order id on the event | `NEEDS_REVIEW` (`CAPTURE_FAILED`) |
| Ordered and captured, but the sale cannot be written | Nothing undone | `NEEDS_REVIEW` (`SALE_NOT_RECORDED`) |
| Refused, but the void fails | Hold stuck | `NEEDS_REVIEW` (`VOID_FAILED`) |

**An unanswered order is never voided** ([ADR-0026](../../cheapest-go-app/docs/adr/0026-the-supplier-owns-reservation-state-and-divergence-is-derived.md)):
Duffel may have issued the ticket. The supplier-attempt row is left open (`completed_at NULL`)
— "we asked and do not know" is the honest record. A captured payment is never voided.

### A fare that moved after the card

The hold can be captured for less, never for more.

- **Came down** → capture `authorised × markup(new) / markup(booked)`: the same `applyMarkup`
  as `book`, at the exchange rate the hold was taken at (the ratio carries it).
- **Went up within tolerance** → capture the authorisation; the difference is absorbed.
- **Went up beyond tolerance** → Duffel did not order; void, `PRICE_CHANGED`.

### What the sale is

`completeDuffelBooking` (`src/services/flightBookingCompletion.ts`) writes `flight_bookings`
(`ticketed` or `awaiting_ticket`, never a pending status), its segments from the order Duffel
holds, its passengers with their tickets, marks the session `completed` and sends the
confirmation. Only after a successful capture: the orphaned-order cron cancels the Duffel
order of a pending, unpaid `flight_bookings` row.

### What `confirm` answers

| Outcome | Answer |
|---|---|
| Confirmed | `200 { bookingId, pnr, status, source: 'lifecycle' }` |
| Not settled yet, or under review | `409 BOOKING_PROCESSING` with `pending: true`, `needsReview`, `sessionId` |
| Refused | `PRICE_CHANGED` 409 (with prices) · `OFFER_EXPIRED` 410 · `DUFFEL_ORDER_FAILED` / `INVALID_PHONE` 400 · `UPSTREAM_UNAVAILABLE` 503 · `BOOKING_EXPIRED` 410 |
| Not paid | `402 PAYMENT_NOT_COMPLETED` |
| Not yours / wrong payment | `403 SESSION_MISMATCH` |

`BOOKING_PROCESSING` is deliberately not a 2xx. The mobile route spreads `confirm`'s result
into `{ success: true, ... }`, and a client that does not know the code should show its
message — "check your trips" — rather than a confirmation with no ticket in it.

A session booked before this release (automatic capture, order placed at `book`) is finished
in process under its `status` lock, the way `/internal/create-booking` finishes it. Delete
`confirmPreOrdered` once none can still be open.

---

## 5. The sweeper, and the crons it shares sessions with

### The sweeper

`GET /cron/flight-booking-sweep`, every 10 minutes (`docker/cron/crontab`). It **never orders
and never calls Duffel**.

- Voids and expires (`ABANDONED`) attempts nobody finished — `PAYMENT_PENDING` > 2h,
  `PAYMENT_AUTHORIZED` > 30 min — **only** Duffel sessions with `capture_method = 'manual'` and
  **no supplier call recorded against them**. Old code never writes `manual`, so a session it
  writes (defaulting to `PAYMENT_PENDING` once the migration is applied) is never treated as a
  hold: its payment captures automatically.
- Closes an attempt whose PaymentIntent was never created, with nothing to release.
- Never touches a captured payment or a hold it could not release (reported as anomalies).
- Raises one notification per attempt in `SUPPLIER_BOOKING` / `NEEDS_REVIEW` for > 15 min,
  naming the Duffel order when there is one.

### Two older crons, kept off the lifecycle's attempts

| Cron | Would have | Now |
|---|---|---|
| `POST /internal/auto-recover` | Read an authorised card as unpaid and set the session `expired`; pushed a `SALE_NOT_RECORDED` attempt through create-booking | `FlightsRepository.findSessionsToAutoRecover` excludes Duffel + manual capture |
| `GET /cron/cleanup-orphaned-duffel-orders` | Cancel the order of a pending, unpaid `flight_bookings` row | The lifecycle never writes one; `findOrphanedOrderCandidates` excludes its rows anyway |

---

## 6. Errors the client maps

Body is always `{ error: CODE, message, ...details }`.

| Code | Status | From | Meaning | Client should |
|---|---|---|---|---|
| `OFFER_EXPIRED` | 410 | book, confirm | Fare gone; at confirm the hold was released | Search again |
| `PRICE_CHANGED` | 409 | book, confirm | Fare rose; carries `oldPrice`, `newPrice`, `currency`; at confirm the hold was released | Show both, start again |
| `SERVICE_UNAVAILABLE` | 409 | book | A seat or bag is no longer sold | Choose again |
| `INVALID_PHONE` | 400 | book, confirm | Not a phone Duffel will take, or no contact | Fix it |
| `INVALID_PASSENGERS` | 400 | book | No travellers, or not as many as the fare was priced for | Enter every traveller |
| `DUPLICATE_BOOKING` | 409 | book | Same departure already booked; `canProceed` | Warn, allow |
| `UPSTREAM_UNAVAILABLE` / `FX_UNAVAILABLE` | 503 | book, confirm | Duffel or rates down; nothing charged | Retry |
| `DUFFEL_ORDER_FAILED` | 400 | confirm | The airline refused; the hold was released | Show the message |
| `BOOKING_PROCESSING` | 409 | confirm | Paid for, not settled yet; `needsReview` when a person has it | Don't pay again; link to trips |
| `PAYMENT_NOT_COMPLETED` | 402 | confirm | The card was not authorised | Back to payment |

The web checkout reads these through `readFlightConfirmError`
(`cheapestgo-app-v2/src/features/checkout/lib/flight-confirm-errors.ts`).

---

## 7. Operating it

### The migration

`db/migrations/20261016000001_flight_booking_lifecycle.sql` — `booking_sessions.lifecycle_status`
(backfilled from the legacy `status`, then `NOT NULL DEFAULT 'PAYMENT_PENDING'`), a CHECK over
the seven states, a unique index on `payment_intent_id`, an index for the sweeper, and
`flight_booking_events`. **Applied by hand**: pipe in only the `-- migrate:up` section (it is
one transaction; the down section drops what it added). Run the duplicate-PaymentIntent check
in its header first. Then `prisma db pull`.

Until it is applied:

- the claim falls back to the session's `status` lock (`lockSessionForBooking`), so exactly one
  caller still orders;
- the sweeper finds nothing, the status read reports nothing beyond the booking, and no events
  are recorded — one warning per process names the migration;
- money still moves in the safe order: authorise, order, capture or void.

### Scheduling

`flight-booking-sweep` is in `docker/cron/crontab`, every 10 minutes. (`hotel-booking-sweep` is
not scheduled there either; that is the hotel flow's open item.)

### Looking at an attempt

`flight_booking_events` answers "how did this get here":

```sql
SELECT created_at, from_status, to_status, actor, reason, payload
  FROM flight_booking_events
 WHERE session_id = '<booking_sessions.id>'
 ORDER BY created_at, id;
```

The PaymentIntent's metadata carries `bookingSessionId`, so from Stripe:

```sql
SELECT id, lifecycle_status, status, capture_method, created_at, updated_at
  FROM booking_sessions WHERE payment_intent_id = 'pi_…';
```

Attempts a person has to settle, with the order they hold:

```sql
SELECT s.id, s.lifecycle_status, s.payment_intent_id, s.updated_at,
       (SELECT e.payload FROM flight_booking_events e
         WHERE e.session_id = s.id AND e.payload IS NOT NULL
         ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS last_payload
  FROM booking_sessions s
 WHERE s.lifecycle_status IN ('SUPPLIER_BOOKING', 'NEEDS_REVIEW')
 ORDER BY s.updated_at;
```

`supplier_booking_attempts` (`client_reference` = session id) records the Duffel call itself,
written before it is made; one with `completed_at IS NULL` is a call whose outcome nobody knows.

### Settling a `NEEDS_REVIEW` attempt

There is no admin action for it yet. By `failureCode`:

| Code | The airline | The money | To settle |
|---|---|---|---|
| `UNKNOWN_OUTCOME` | May hold an order | Held | Find it in the Duffel dashboard (route, time, family name). Found: capture and write the booking. Not found: void. |
| `CAPTURE_FAILED` | Holds `supplierOrderId` | Held | Capture (or take payment another way), then write the booking. Never void with a ticket out. |
| `SALE_NOT_RECORDED` | Holds `supplierOrderId` | **Captured** | Write the booking (`completeDuffelBooking` with the order). |
| `VOID_FAILED` / `CAPTURED_WITHOUT_ORDER` | Holds nothing | Held / captured | Release the hold / refund. |

Record what you did as an `admin` event, and move the state to `CONFIRMED` or `FAILED`.

---

## 8. Where each scenario is tested

| Scenario | Test |
|---|---|
| State machine | `flightLifecycle.stateMachine.test.ts` |
| The claim, `lost` vs `unavailable`, events with actor and reason | `flightLifecycle.repository.test.ts` |
| `book` checks before the card; manual capture; no order | `flights.service.test.ts` › *FlightsService.book()* |
| `confirm` outcomes on the wire; a pre-release session | `flights.service.test.ts` › *FlightsService.confirm()* |
| Every row of the outcome table | `flightLifecycle.service.test.ts` |
| Price down → partial capture; up → absorbed / void | › *a price that moved after the card was authorised* |
| Timeout with an order found / not found; 5xx; dropped connection | › *an airline that did not answer* |
| Capture fails; sale cannot be written | › *a payment that cannot be captured* |
| Double submit / browser and webhook racing | › *two callers, one payment* |
| Migration absent | › *before the migration is applied* |
| Sweeper | › *sweep* |
| Stripe event reaches completion | `webhooks.stripe.flightAuthorisation.test.ts` |
| Crons kept off lifecycle rows | `flights.repository.cronGuards.test.ts` |
| Status read mid-completion | `flights.service.test.ts` › *getBookingStatus()* |
| The sale's shape (unchanged by the extraction) | `internal.createBooking.duffel.test.ts` |
| Order passengers (infants linked to adults), order total | `orderPassengers.test.ts`, `orderTotal.test.ts` |
| Infant link re-pointed when an expired offer is re-ordered | `duffelPlaceOrder.infants.test.ts` |
| `book` refuses a request that cannot become an order, before the card | `flights.book.inputs.test.ts` |
| The one price: fare, fee, total, conversion, the invariant `fare + fee = total` | `flightCharge.test.ts` |
| `book` reports what it holds; the offer's quote equals it to the cent | `flights.service.test.ts` › *book()*, *getOffer()* |
| A quote that cannot be made never costs the reader the offer | `flights.getOffer.quote.test.ts` |

The app side: `src/__tests__/checkout-flight-page.test.tsx` (the flight checkout after the card,
through a stubbed API and Stripe) and `flight-confirm-errors.test.ts`.

The repository, the sweeper and both cron guards were also run once against Postgres 17 with
the migration applied (the happy path with its event trail, three concurrent claims, refusal,
timeout, capture failure, the sweeper's selectivity), with Stripe and Duffel faked.

---

## 9. Known limits

- **Not exercised against the Duffel sandbox, real Stripe, a real browser, or 3DS.** The suites
  stub both. The sandbox run in the plan's Task 12 is still to do.
- **`NEEDS_REVIEW` is settled by hand** (§7). There is no admin action for it.
- **The webhook waits for completion**, and a Duffel order can take up to 130s — longer than
  Stripe waits. A retried event loses the claim and is answered from the record; it cannot
  order twice. The same is true of the hotel webhook.
- **An `offer_replaced` after the card is a refusal.** Duffel would substitute the same flight
  only if seats and bags are chosen again, which cannot happen after the card.
- **A rise within tolerance after the card is absorbed**, not charged.
- **The search results still show the airline's raw fare**, which is the comparison price. The
  service fee appears at checkout, from the quote. The checkout's total, its Pay button and its
  receipt show what `book` says the card is held for.
- **The receipt shows the held amount.** If the fare falls between the card and the order, the
  lifecycle captures less (§4); the receipt does not know, because `confirm` does not return
  the captured figure.
- **Flights are charged in the fare's currency.** The app sends `currency`, which `book` does not
  read; it reads `displayCurrency`, which the app does not send. The two agree today only because
  both are the fare's currency. Charging in the traveller's selected currency would mean sending
  `displayCurrency` and quoting in it.
- **The quote leaves out seats and bags**, which the web checkout does not offer yet.
- **Mobile shows `BOOKING_PROCESSING` as a "Booking Failed" alert** carrying the message ("check
  your trips"). It is not mistaken for a success, but the title is wrong for it.
