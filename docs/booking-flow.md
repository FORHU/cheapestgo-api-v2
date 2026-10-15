# The hotel booking flow

How a traveller searches, picks a room, pays, and ends up with a confirmed booking — and what
happens on every path where that does not go to plan. Written for whoever changes this next.

The design and its constraints are in the app repo's
`docs/superpowers/specs/2026-10-14-hotel-booking-flow-design.md`. This is what was built.

- **Domain logic lives here**, in api-v2 ([ADR-0017](../../cheapest-go-app/docs/adr/0017-api-v2-owns-all-domain-logic.md)).
  The app renders state and sends what the traveller typed; it computes no prices and enforces no rules.
- **Layers** are `Route → Controller → Service → Repository`, with supplier clients in `src/lib/`
  (see `CONTEXT.md`).

---

## 1. The shape of it

```
 search ──► property ──► prebook ──► create-payment ──► [card] ──► confirm ──► booking
                            │              │                          ▲
                            │              └── Stripe authorises ─────┤  (webhook can
                            ▼                  (manual capture)       │   finish it too)
                     price moved? ◄── priceChange                     │
                                                                      ▼
                                                      supplier books ─► capture ─► CONFIRMED
```

Money moves in a fixed order — **authorise → ask the supplier → capture** — because a void is
free and instant and a refund is neither.

| Step | Endpoint | Auth | What it does |
|---|---|---|---|
| Search | `POST /hotels/search`, `POST /hotels/search/stream` | – | Listings priced per night (`price`) with the whole stay beside it (`stayTotal`, `nights`). |
| Property | `GET /hotels/property/:id` | – | Content, rooms and rates; each rate has `price` (per night) and `stayTotal`. |
| Prebook | `POST /hotels/prebook` | – | Re-checks availability and price with the supplier, records the quote. `expectedTotal` in → `priceChange` out. |
| Pay | `POST /hotels/create-payment` | ✔ | Opens a manual-capture PaymentIntent *from the recorded quote*, never from the client's figure. Returns `bookingReference`. |
| Confirm | `POST /hotels/confirm` | ✔ | Claims the booking, asks the supplier, captures, writes the sale. |
| Status | `GET /hotels/bookings/:reference` | ✔ | Where the booking is. Owner only (404 for anyone else). |
| Cancel preview | `GET /hotels/bookings/:reference/cancel-preview` | ✔ | What cancelling would return, by the same engine that will decide it. Read-only. |
| Cancel | `POST /hotels/cancel` | ✔ | Cancels at the supplier, then refunds what the recorded terms allow. |
| Sweep | `GET /cron/hotel-booking-sweep` | cron secret | Releases abandoned payments; reports bookings stuck with a supplier. |

Stripe's `payment_intent.amount_capturable_updated` also reaches the same confirm routine
(§4) — so a traveller whose tab closes after paying is not left with a hold and no room.

---

## 2. The provider seam

A hotel supplier is a class implementing `HotelProvider`
(`src/lib/hotels/providers/types.ts`). Nothing above `src/lib/hotels/providers/` knows which one.

```ts
interface HotelProvider {
  id, displayName, capabilities: { bookingRead, providesContent }
  ownsRef(ref): boolean
  searchHotels(q), getHotelDetails(id), getRates(id, stay)
  prebook(input)   // throws SOLD_OUT / PRICE_CHANGED / NOT_PAYABLE_ONLINE / TIMEOUT / …
  book(input)      // throws REJECTED / UNKNOWN_OUTCOME / …
  getBooking?(ref) // only when capabilities.bookingRead
  cancelBooking(input)
}
```

- **References are opaque**: `<PROVIDER>:<payload>`. `ownsRef` replaces `startsWith('TGX:')`.
- **Failures are typed**, and the one distinction that matters is *definitive* (`SOLD_OUT`,
  `REJECTED` — nothing was booked, release the money) versus *ambiguous* (`UNKNOWN_OUTCOME`,
  `TIMEOUT`, `UNAVAILABLE` — the request may have landed, **never** void on this alone).
- **Selection**: `HOTEL_PROVIDER=travelgatex|mock` (default `travelgatex`) through
  `getHotelProvider()`. `mock` is refused when `NODE_ENV=production` unless
  `ALLOW_MOCK_HOTEL_PROVIDER=true`, in both `config.ts` and the factory. A booking remembers its
  provider, so a cancellation goes back the way the booking came.

### Adding a provider

1. A class implementing `HotelProvider`, in `src/lib/hotels/providers/`.
2. One `case` in `factory.ts`, and its id in the `HOTEL_PROVIDER` enum in `config.ts` and
   `ProviderId` in `types.ts`.
3. Add it to `FIXTURES` in `src/__tests__/hotelProvider.contract.test.ts`. **It is acceptable
   when that suite passes against it** — that is what "a new provider is one class" means.

Nothing in the booking flow changes. Do not parse another supplier's reference above the seam.

### The mock

`MockHotelProvider` is in-process and deterministic: no network, no database, no credentials.
24 invented Philippine properties, 3 room types × 3 rate plans (room-only non-refundable;
breakfast refundable until check-in − 3 days; half-board tiered), whole-stay prices, weekend
uplift, fixed FX so a price never depends on today's rates.

It is deliberately a **naive** supplier: a repeated client reference books twice, so a
double-submit bug shows up as two reservations rather than being hidden by a forgiving fake.

**Scenarios** — set `MOCK_HOTEL_SCENARIO`, or just search for a "QA" hotel in Manila, which
carries one each:

| Scenario | Hotel id | What happens |
|---|---|---|
| `sold_out` | `MOCK-QA-SOLDOUT` | Listed, then gone at prebook |
| `price_up` / `price_down` | `MOCK-QA-PRICEUP` / `-PRICEDOWN` | Re-priced +8% / −5% at prebook |
| `prebook_timeout` | `MOCK-QA-PBTIMEOUT` | Supplier does not answer a quote |
| `book_rejected` | `MOCK-QA-BOOKFAIL` | Refused after payment; nothing booked |
| `book_timeout` | `MOCK-QA-BOOKTIMEOUT` | No answer, **but the reservation exists** |
| `cancel_rejected` | `MOCK-QA-CANCELFAIL` | Supplier will not cancel |
| `cancel_timeout` | – (`MOCK_HOTEL_SCENARIO`) | No answer, but the cancellation **was** applied |

With `HOTEL_PROVIDER=mock` the database catalog and ETG content are skipped (the provider is
the authority) and email is **logged, not sent** unless `EMAIL_TRANSPORT=resend` — a mock
reservation must never mail a real address.

---

## 3. The lifecycle

`bookings` records a **sale**: written once the supplier has confirmed and the money is
captured, and read by trips, invoices, admin and mobile. Everything before that moment — and
everything that goes wrong on the way — is the **attempt**, tracked in `hotel_bookings`
(`src/lib/hotels/lifecycle/stateMachine.ts`). The same reference string links the two.

```
 PAYMENT_PENDING ─► PAYMENT_AUTHORIZED ─► SUPPLIER_BOOKING ─► CONFIRMED ─► CANCEL_REQUESTED ─► CANCELLED
        │                   │                    │    │                          │  │             │
        ▼                   ▼                    │    └─► NEEDS_REVIEW ◄─────────┘  └─► CONFIRMED (refused)
     EXPIRED          FAILED / EXPIRED           └─► FAILED                                       
                                                                   CANCELLED/CANCEL_REQUESTED ─► REFUND_PENDING ─► REFUNDED | REFUND_FAILED
```

(`DRAFT` and `PREBOOKED` exist in the table but are not written yet: prebook is unauthenticated,
so there is no user to attach an attempt to until payment.)

- Every move appends a `hotel_booking_events` row: **who** (`browser | webhook | sweeper |
  admin`) and **why**.
- `projectLegacyStatus` maps a state onto `bookings.status`. States before payment is captured
  project to **no** `bookings` row, so an in-flight or abandoned attempt never appears as a trip
  and never trips the duplicate-booking guard.
- Tables are **additive**; the code degrades to the pre-lifecycle behaviour while they are
  absent, so deploy order does not matter (§7).

---

## 4. What happens to the money

`HotelBookingLifecycleService` (`src/services/hotelBookingLifecycle.service.ts`) owns every
decision between "the card was authorised" and "the guest has a room".

### The claim

`UPDATE … WHERE status = 'PAYMENT_AUTHORIZED'` — one statement, so of any number of callers
racing for a payment (a double click, the browser and the webhook) exactly one asks the
supplier. The rest get the winner's answer; a caller that loses while the winner is still
working waits for it (up to 20s) so a checkout not written with a "pending" state in mind
still gets the real result. A lost claim never carries on to the supplier.

### The outcome table

| Supplier says | Money | State |
|---|---|---|
| Booked | **Capture** (idempotency key per booking; one retry; if Stripe says it already succeeded, believed) | `CONFIRMED` |
| `SOLD_OUT`, `PRICE_CHANGED`, `REJECTED`, `NOT_PAYABLE_ONLINE`, `INVALID_RATE` | **Void** the authorisation | `FAILED` |
| `TIMEOUT`, `UNKNOWN_OUTCOME`, `UNAVAILABLE`, or an error it does not recognise | **Keep the hold.** Read back if the provider can: found → carry on as booked. Not found → ↓ | `NEEDS_REVIEW` |
| Booked, but capture fails after retry | Hold kept; guest told not to pay again | `NEEDS_REVIEW` (`CAPTURE_FAILED`) |
| Booked at a price beyond what was quoted (>5%) | Hold kept; a person decides | `NEEDS_REVIEW` (`PRICE_CHANGED_AFTER_BOOKING`) |
| Refused, but the void itself fails | Hold stuck | `NEEDS_REVIEW` (`VOID_FAILED`) |

**A timed-out booking is never auto-voided** ([ADR-0026](../../cheapest-go-app/docs/adr/0026-the-supplier-owns-reservation-state-and-divergence-is-derived.md)):
voiding on it is how a guest ends up holding a room we refunded them for. A captured payment is
never voided either.

### Cancellation

1. `CONFIRMED → CANCEL_REQUESTED`, then the supplier is asked.
2. **Only evidence the reservation is gone lets money move**: the supplier cancelled, or a
   read-back finds it cancelled, or a refusal says it was *already* cancelled.
3. Refused (→ `409 CANCEL_REFUSED`, booking returns to `CONFIRMED`) or unanswered and not
   readable (→ `502 CANCEL_UNCONFIRMED`, `NEEDS_REVIEW`) means **nothing is refunded**.
4. What is refunded is what the **recorded terms** allow, judged by `calculateCancellation`
   ([ADR-0023](../../cheapest-go-app/docs/adr/0023-a-cancellation-refunds-what-the-recorded-terms-allow.md)).
   The preview endpoint is that same function with no rules of its own.
5. A booking cancelled whose refund failed (`cancelled_refund_failed`) is retried without
   asking the supplier again.

### The sweeper

`GET /cron/hotel-booking-sweep`, every 10 minutes. It **never books and never calls a
supplier** (TravelgateX forbids scheduled searches, and it must not guess at reservations).

- Voids and expires attempts that were never completed **and have no supplier call recorded
  against their reference**: `PAYMENT_PENDING` > 2h, `PAYMENT_AUTHORIZED` > 30 min.
- Never touches a captured payment (reported as an anomaly instead).
- Raises one notification per booking stuck in `SUPPLIER_BOOKING` / `NEEDS_REVIEW` for > 15 min.

---

## 5. Prices

- **Supplier quotes** are whole-stay decimals in the supplier currency (the **Stay Total**).
- **Listings carry the Nightly Rate** in `price` ([ADR-0020](../../cheapest-go-app/docs/adr/0020-a-hotel-price-carries-the-stay-it-was-quoted-for.md));
  `stayTotal` and `nights` are beside it so nothing multiplies a rounded rate back up.
- **The charge is computed from the recorded prebook quote** ([ADR-0021](../../cheapest-go-app/docs/adr/0021-the-stripe-base-comes-from-the-prebook-quote.md)),
  converted server-side with strict rates, and **never above the total the traveller was shown**
  (`displayedTotal`). Client amounts are claims.
- `priceChange { previous, current, direction, currency, difference }` appears on prebook when
  `expectedTotal` was sent and the price has moved by more than rounding (~0.1%). It describes;
  it does not block. Send an `expectedTotal` only if it came from the server or was not
  converted in the browser — a browser's own arithmetic over its own FX is not comparable.

---

## 6. Errors the client maps

Body is always `{ error: CODE, message, ...details }`. Validation failures are `422`
`VALIDATION_ERROR` with `details: { field: [messages] }`.

| Code | Status | Meaning | Client should |
|---|---|---|---|
| `PRICE_CHANGED` | 409 | Beyond what could be absorbed; carries `serverPrice`, `currency` | Show the new price, ask |
| `UNAVAILABLE` | 409 | Room gone | Choose another room (retry cannot help) |
| `NON_MERCHANT` | 409 | Supplier collects payment itself | Choose another room |
| `QUOTE_EXPIRED` / `QUOTE_NOT_FOUND` / `INVALID_OFFER` | 409/400 | The quote lapsed | Take it again |
| `UPSTREAM_UNAVAILABLE` / `UPSTREAM_ERROR` / `FX_UNAVAILABLE` | 503/502 | Supplier or rates down | Retry; nothing is wrong |
| `DUPLICATE_BOOKING` | 409 | Overlapping booking; carries `existingBookingId` | Link to it |
| `PAYMENT_REQUIRED` | 402 | Authorisation not present | Back to payment |
| `CANCEL_REFUSED` | 409 | Hotel will not cancel; booking unchanged | Show message |
| `CANCEL_UNCONFIRMED` | 502 | Could not confirm; nothing refunded | Show message |
| `BOOKING_NOT_FOUND` | 404 | Not found, or not yours | – |

`confirm` can also answer **200 with `success:false`**, which is a response with a meaning:
`pending: true` (another caller is finishing it — poll status), `needsReview: true` (do not pay
again), `providerConfirmed: false` (definitive refusal — the hold was voided).

---

## 7. Operating it

### The migration

`db/migrations/20261015000001_hotel_booking_lifecycle.sql` — four additive tables. **Applied by
hand**: pipe in only the `-- migrate:up` section (the down section drops the tables). Then
`prisma db pull`. The code uses raw SQL against them until then, so nothing waits on it, and it
logs one warning — not one per request — while they are missing.

### Scheduling

The sweeper route exists; nothing schedules it. Call it every 10 minutes with
`Authorization: Bearer $CRON_SECRET`.

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `HOTEL_PROVIDER` | `travelgatex` | Which supplier |
| `MOCK_HOTEL_SCENARIO` | – | Force one mock scenario on every hotel |
| `MOCK_HOTEL_CURRENCY` | `USD` | What the mock quotes in (`USD`/`PHP`/`KRW`/`EUR`) |
| `ALLOW_MOCK_HOTEL_PROVIDER` | – | Permit the mock in production (don't) |
| `EMAIL_TRANSPORT` | `log` for the mock, else `resend` | Where confirmation mail goes |

### Looking at a booking

`hotel_booking_events` is the answer to "how did it get here": every move, who made it, why.
`supplier_booking_attempts` records the supplier call itself, written *before* it is made.

---

## 8. Where each scenario is tested

| Scenario | Test |
|---|---|
| Price moved between selection and prebook | `hotels.service.mockProvider.test.ts` › *price change since the traveller saw it* |
| Room sold out at prebook | `hotels.service.mockProvider.test.ts` › *answers 409 UNAVAILABLE* |
| Supplier does not answer a quote | `hotels.service.mockProvider.test.ts` › *answers 503 UPSTREAM_UNAVAILABLE* |
| Card not authorised at confirm / someone else's payment | `hotels.service.lifecycle.test.ts` › *a card that was not authorised* |
| Supplier refuses after payment | `hotels.service.lifecycle.test.ts` › *a supplier that said no* |
| Supplier times out, reservation exists | › *reads the reservation back and finishes the booking* |
| Supplier times out, cannot be asked | › *keeps the hold and asks for review* |
| Capture fails after booking | › *a payment that cannot be captured* |
| Double submit | › *two callers, one payment* |
| Webhook before / after the browser | › *completing from the payment event* |
| Lifecycle tables missing | › *when the lifecycle is unavailable* |
| Cancel: refused / unanswered / already gone | › *a supplier that will not cancel* |
| Cancel preview equals the refund | › *cancel preview* › *is the figure the real cancellation then refunds* |
| A provider honours the contract | `hotelProvider.contract.test.ts` |
| State machine | `hotelLifecycle.stateMachine.test.ts` |
| Route order (`/bookings/:id` vs fixed paths) | `bookings.route.order.test.ts` |
| Stripe event reaches completion | `webhooks.stripe.hotelAuthorisation.test.ts` |

The app side is covered by `src/__tests__/checkout-hotel-page.test.tsx` (the whole checkout
through a stubbed API and Stripe) and `src/features/trips/components/__tests__/trips-contract.test.tsx`
(the trips screens against the response the API actually sends).

---

## 9. Known limits

- **One room per booking.** Search builds one occupancy for the whole party and `book` sends
  `occupancyRefId: 1`. The app says so on a multi-room search rather than silently booking one.
- **Authentication is required at payment.** Guest checkout and lookup by reference + email are
  out of scope: an unverified email is not a credential
  ([ADR-0029](../../cheapest-go-app/docs/adr/0029-an-unverified-email-is-not-a-credential.md)).
- **TravelgateX cannot read a reservation back**, so an unanswered booking there goes to review
  rather than being resolved automatically.
- **Real OTV cancel refusals arrive as raw text**, so they classify as `UNKNOWN_OUTCOME` rather
  than `REJECTED`. The result is the same — nothing is refunded — but the user sees the
  "could not confirm" message rather than the "refused" one.
- **`_tgx` / `_tgxToken` are still on the wire** for the mobile app's fallback.
- **The trip detail page fetches the traveller's whole list** to find one booking. A by-id
  endpoint returning the full row would be cleaner.
- **Webhook completion needs holder and guests at `create-payment`.** Without them the
  authorisation is recorded and the browser's confirm completes the booking, as it always did.
- **Not exercised against real Stripe, a real browser, or 3DS.** The suites stub both.
