# How the flight booking was built

A walk through the whole flight feature — search to ticket — covering what each part does, why it
is shaped the way it is, the order it was built in, and what is still open. It is a companion to
two shorter documents:

| Document | What it is for |
|---|---|
| [`flight-booking-flow.md`](./flight-booking-flow.md) | The as-built **reference** for the money path: outcome table, error codes, SQL for looking at an attempt, how to settle a `NEEDS_REVIEW`. Keep it open while operating the system. |
| `docs/superpowers/plans/2026-10-16-flight-booking-money-safety.md` (app repo) | The **plan** the money path was built from, with each task annotated with the commit that did it. |
| **This document** | The **story and the map**: the whole feature, both repos, how the pieces connect, and the reasoning behind them. |

**Snapshot.** Branch `feat/flight-booking-money-safety` in both repos, API at `b65775c` plus the
uncommitted work listed in [§13](#13-uncommitted-work-on-this-branch), written 2026-10-26. Where this document says a thing
was *run* or *tested*, it says what was run; where it only says what the code does, that is
reading, not execution. [§12](#12-what-has-and-has-not-been-verified) separates the two.

**Repos**

| Repo | Path | Role |
|---|---|---|
| API | `cheapestgo-api-v2-nearby` | Express + Prisma + raw SQL. Owns **all** domain logic (ADR-0017). Mounted at `/api/v2`. |
| Web app | `cheapestgo-app-v2-nearby` | Next.js (app router, `next-intl`). Holds no domain logic: it asks the API and draws the answer. |
| Mobile app | `cheapestGo-mobile-app` (not in this workspace) | React Native. Reaches the same booking service through `/mobile/flights/*`. |

---

## Contents

1. [The feature in one page](#1-the-feature-in-one-page)
2. [Design decisions that shape everything](#2-design-decisions-that-shape-everything)
3. [The order it was built in](#3-the-order-it-was-built-in)
4. [Search](#4-search)
5. [Choosing an offer, and the endpoints around it](#5-choosing-an-offer-and-the-endpoints-around-it)
6. [Pricing](#6-pricing)
7. [Book: opening the hold](#7-book-opening-the-hold)
8. [Confirm: the lifecycle](#8-confirm-the-lifecycle)
9. [After the sale](#9-after-the-sale)
10. [The web checkout](#10-the-web-checkout)
11. [Data model](#11-data-model)
12. [What has and has not been verified](#12-what-has-and-has-not-been-verified)
13. [Uncommitted work on this branch](#13-uncommitted-work-on-this-branch)
14. [Known gaps](#14-known-gaps)
15. [Appendices](#15-appendices) — file map · time budgets · idempotency keys · environment · extending it

---

## 1. The feature in one page

A traveller searches for flights, picks a fare, enters passenger details, authorises a card, and
ends up with an airline ticket. Four parties are involved, and the engineering is almost entirely
about what happens when one of them fails halfway.

```
  Browser (web app)            API (this repo)                 Duffel            Stripe
  ─────────────────            ───────────────                 ──────            ──────
  /flights/search ───────────► POST /flights/search ─────────► offer_requests
        ◄──── offers ────────── normalise, filter

  pick a fare ───────────────► POST /flights/revalidate ─────► offers/:id/actions/price
        ◄──── price moved? ───

  /checkout (details form)
  Continue ──────────────────► POST /flights/book ───────────► GET offers/:id           ┐ nothing
                                 checks, prices, opens hold ──────────────────────────► PaymentIntent
        ◄── clientSecret,        session = PAYMENT_PENDING                              │ (manual capture)
            sessionId                                                                   ┘ ordered yet
  Stripe card form ──────────────────────────────────────────────────────────────────► authorise
                                                                                       (requires_capture)
  Pay ───────────────────────► POST /flights/confirm ────────► POST air/orders
        ▲                        claim → order → capture/void ◄── order / refusal / silence
        │                                  │                 ─────────────────────────► capture | cancel
        │                        write the sale (flight_bookings)
        └─── booking, or ─────── "still processing", or a named refusal

  (card closed early) ───────── POST /webhooks/stripe  amount_capturable_updated ─► same routine
  (nobody finished)  ───────── GET  /cron/flight-booking-sweep  ────────────────► void stale holds
  (ticket arrives later) ────── POST /webhooks/flight-supplier  order.updated ───► status → ticketed
```

**The one rule everything serves:** money moves in a fixed order — **authorise → ask the airline →
capture** — because releasing an authorisation is free and instant, and refunding a charge is
neither.

**Three outcomes, and only three, from the traveller's side:** they have a ticket and were
charged; they have no ticket and were not charged; or they are told plainly that it is still being
settled and not to pay again. The state machine, the claim, the read-back after a timeout, the
sweeper and the settling panels all exist to make sure no fourth outcome (charged, no ticket, no
explanation) is reachable.

---

## 2. Design decisions that shape everything

These came before any of the code, and most of the code is a consequence of them.

### 2.1 The API owns the logic; the app only asks

ADR-0017. The web app never prices, never decides whether an offer is still good, never computes
a refund. This is why the pricing in [§6](#6-pricing) lives in one file (`src/lib/pricing.ts`) and why the
checkout can be a thin form over `book` and `confirm`.

### 2.2 The layer contract

`Route → Controller → Service → Repository`, each layer calling only the one below, with supplier
clients in `src/lib/` (`CONTEXT.md`). For flights:

| Layer | Flight files |
|---|---|
| Route | `src/routes/flights.route.ts` (+ `mobile.route.ts`, `webhooks.route.ts`, `cron.route.ts`, `internal.route.ts`) |
| Controller | `src/controllers/flights.controller.ts` — Zod-parses the body, calls the service |
| Service | `src/services/flights.service.ts`, `flightBookingLifecycle.service.ts`, `flightBookingCompletion.ts` |
| Repository | `src/repositories/flights.repository.ts`, `flightBookingLifecycle.repository.ts` |
| Provider client | `src/lib/flights/duffel.ts` (live), `mystifly.ts` (present, disabled) |

Layer debt is paid down *as a slice touches it*, not separately. That is why the money-safety work
also moved the Duffel booking writes out of `internal.route.ts` into `FlightsRepository` and
`completeDuffelBooking` (§3, Task 4).

### 2.3 Duffel only

Mystifly is still in the tree (`src/lib/flights/mystifly.ts`, `mystiflyRequest` for fare rules and
cancel) but `book` refuses it with `422 FARE_UNAVAILABLE`, `searchFlightsWithStatus` has its
provider commented out, and the `/mystifly/*` routes answer `503 MYSTIFLY_NOT_LIVE`. Nothing
removes the code so that re-enabling it later is a bounded job; nothing runs it.

### 2.4 Never serve a stored offer

A Duffel offer is a quote with a lifetime of roughly 20–30 minutes. Early versions cached search
results and replayed them, which handed travellers a price whose offer no longer existed: booking
got as far as order placement and then failed. So `flight_results_cache` is still *written* (the
price calendar reads it as price history) but **never answers a search**. Likewise `book` always
fetches the offer from Duffel again by id, whatever the browser sent.

### 2.5 Authorise first, order second, capture last

The original flow did the opposite: `book` placed a paid Duffel order *before the card was even
shown*, and the PaymentIntent captured automatically. A refusal afterwards meant cancelling a real
ticket, and a traveller could be charged for a ticket the airline then would not issue. The
hotel flow had already been rebuilt the safe way round (authorise → supplier → capture); flights
were rebuilt to match, deliberately mirroring the hotel files so the two read alike.

### 2.6 A timeout is not a "no"

`POST /air/orders` can time out **after** Duffel has issued the ticket. Aborting the request does
not cancel the order. So an unanswered order request is *never* treated as a failure: the hold is
kept, Duffel's order list is searched for the order, and only if nothing is found does a person
take over (ADR-0026, ADR-0013). A captured payment is never voided; an unanswered order is never
voided. This is the single most important rule in the lifecycle and has a test that fails if
broken.

### 2.7 One writer decides, everyone else is answered

The browser's `confirm` call and Stripe's webhook can both try to finish the same payment, as can
a double-click. A single atomic SQL statement (the *claim*) lets exactly one of them ask the
airline; the rest wait and are answered from what the winner recorded. This is why a traveller
whose tab closed after paying still gets their ticket, and why nothing orders twice.

### 2.8 Additive migration, safe to deploy before or after

The new column and table are additive, the repository returns `'unavailable'` rather than throwing
when they are missing, and the service falls back to the old `status` lock. So code and migration
can ship in either order, and money still moves in the safe order in both.

### 2.9 Test first, and mutate to prove the tests mean something

Each task in the money-safety slice started with a failing test. Where a rule was safety-critical
(*never void on no answer*, *never write the sale before capture*, *never capture above the
authorisation*) the implementation was deliberately broken to confirm the suite fails. Pinning
tests were also written **before** extraction refactors, against the code before it moved
(`internal.createBooking.duffel.test.ts`).

---

## 3. The order it was built in

Honest caveat first: the first stretch of history is a handful of large commits, several of them
bulk migrations from v1 ("v1 to v2 migration", "updates migration"), so individual search and
offer fixes are not separately dated. What follows is reconstructed from commit messages and from
the *why* comments in the code, which cite the v1 bugs they fix. From 2026-10-16 the history is
fine-grained and exact.

### Phase 0 — foundation (30 Jun – 10 Aug 2026)

| Date | Commit | What landed |
|---|---|---|
| 06-30 | `c87c7ed` | Core API architecture: routing, controllers, repositories, domain types. |
| 07-08 | `98a9c24` | Modular routing for airports, bookings, flights, vouchers, admin. |
| 07-10 | `5521da3` | **Duffel integration** with environment configuration and webhook support. |
| 07-14 | `3bbf3a9` | `ticketed_at` on `flight_bookings`; internal routes initialised. |
| 07-20 | `f1f393e` | **`FlightsService`** — the booking orchestration. |
| 07-21 | `e4aa41e` | Backend flight results updated. |
| 08-10 | `a0b20a3` | Account routes and the flight booking service logic. |

The app side of the same period: scaffolding (`279d176`, 06-30), the flight search UI and results
(`751b487`, 07-21), UI pieces carried over from v1 (`ae55683`), the v1 navigation header.

### Phase 1 — the v1 port and search hardening (Sep – early Oct)

`661a296` / `a9d118b` (09-17) "v1 to v2 migration", `324594e` / `567ab7a` (10-01), `932eb94` /
`d1e4422` (10-05) "v2 search changes". These bulk commits are the likely arrival point of the
Duffel client's accumulated behaviour — the search retry ladder and its budget, `placeDuffelOrder`
with its Price Action loop and same-itinerary refresh, the time-out reconciler, the
identity-document gate, the ticket-number reader, the per-passenger price fix — but the history
does not date them individually, so treat that as where to *look*, not a fact. Airport search
followed (`357082d`, 10-07).

### Phase 2 — the hotel flow as the template (14 – 15 Oct)

Before touching flights, the same problem was solved for hotels, in small commits:
`8327fd0` state machine → `782a200` tables + repository → `8f2cd80` lifecycle service →
`ef46102` confirm and cancel through it → `53fe3ad` completion from the payment event, status
read, sweeper → `7a718c1` docs. The flight work reuses its `LifecycleActor` type, its
`supplierAttempt` helpers and its shape file for file. If something in the flight code puzzles
you, `docs/booking-flow.md` usually explains the hotel twin at more length.

### Phase 3 — the flight money-safety slice (16 – 21 Oct)

Plan written 2026-10-16 (app repo), direction chosen by the user: **"money safety first"** and
**"reorder like hotels"**. Executed task by task:

| Task | What | Commit |
|---|---|---|
| 0 | Branch from the tip; baseline recorded: 89 files / 1195 tests, `tsc` clean, lint 0 errors / 25 warnings | — |
| 1 | Migration `20261016000001_flight_booking_lifecycle.sql` (additive; backfill that maps legacy `status` so nothing looks in-flight) | `5f02a95` |
| 2 | State machine (pure transition table; also pinned to the migration's `CHECK`) | `3eb5a50` |
| 3 | Lifecycle repository (atomic `transition`; `'lost'` vs `'unavailable'`; never throws) | `af07b5f` |
| 4 | Extractions with no behaviour change: `completeDuffelBooking`, `buildOrderPassengers`/`orderPhoneNumber` | `3189452` |
| 5 | `FlightBookingLifecycleService`: claim, order, outcome table, capture, void, sweep | `7aef9f8` |
| 6 | `FlightsService` rewired: `book` authorises and orders nothing; `confirm` calls the lifecycle | `4133550` |
| 7 | Stripe webhook completes a booking from `payment_intent.amount_capturable_updated` | `ff28401` |
| 8 | Sweeper + two older crons kept off the lifecycle's attempts | `6a2f84f` |
| 9 | `booking-status` reports an attempt still in flight | `5a1d9e1` |
| 10 | App: error paths, settling panel, payment-step copy (**app repo**) | `82eeac8` |
| 11 | Mobile: verified by reading, not changed | — |
| 12 | Docs, suite/`tsc`/lint at or better than baseline | `4fc7911`, `7c5a75f` (app) |
| — | Migration made to run under `dbmate` (`transaction:false`) | `7779f22` |

Two things worth knowing about how it went:

- **Two existing crons the plan did not cover** were found while writing the migration:
  `auto-recover` (would read an authorised-but-uncaptured card as unpaid and stamp the session
  `expired`) and `cleanup-orphaned-duffel-orders` (cancels the Duffel order of a pending, unpaid
  `flight_bookings` row). Both would have damaged the new flow. They were settled before `book`
  changed what it writes ([§9.4](#94-the-crons-and-how-they-were-kept-off-the-lifecycle)).
- **Task 4's extraction was pinned first.** `/internal/create-booking` had no tests, so its
  Duffel path was characterised and checked to fail under mutation *before* `handleDuffel` was
  cut apart.

### Phase 4 — the checkout in the app (19 – 21 Oct)

After the card-held behaviour: the passenger form asks for every traveller with labels and a
dialable mobile number (`0f7fde7`), the checkout in the brand's own design and palette
(`6078e51`, `e534695`, `c3eb25d`), one design for every picker (`c5306d3`), a themed date
picker bounded by passenger type (`89f881a`), country selection with an autocomplete
(`84f0ddd`, `d323e50`), and the flight confirmation screen split out of the hotel one
(`c01738d`).

### Phase 5 — after the slice (19 – 20 Oct)

`GET /flights/offers/:offerId` and Duffel bag-allowance normalisation (`bb1714a`, so the
checkout summary and results cards can show bags); `prisma/schema.prisma` synced to the lifecycle
columns (`56cc21c`); `trust proxy` for `express-rate-limit` (`b779df5`); router type annotations
(`b65775c`).

### Phase 6 — in progress, uncommitted

Infant linking, passenger-count validation at `book`. See [§13](#13-uncommitted-work-on-this-branch).

---

## 4. Search

### 4.1 API

`POST /flights/search` → `FlightsController.search` → `FlightsService.search` →
`searchFlightsWithStatus` (`src/lib/flights/search.ts`).

**Request** (Zod-validated): `origin`, `destination` (IATA), `departureDate`, optional
`returnDate`, `adults` (≥1), `children`, `infants`, `cabinClass`, `tripType`, optional `filters`.

**What happens**

1. A `flight_searches` row is written (best-effort; failure is swallowed).
2. `searchDuffel` runs under a ceiling (`withTimeout`). It builds one Duffel `offer_request` with
   `return_offers: true`: passengers are `adult` × adults, `child` × children,
   `infant_without_seat` × infants; slices are outbound plus, for a return date, the reverse;
   cabin is mapped to Duffel's four classes. A past departure, or a return before departure,
   returns `[]` without calling Duffel (it would 422).
3. Offers are parsed by `parseDuffelOffer` and turned into the card shape by
   `normalizedToFlightOffer`.
4. In the background (fire-and-forget): `flight_results_cache` rows are written in chunks of 50,
   and `increment_search_stats` is called (the RPC may not exist; failure is ignored).
5. `applyServerFilters` sorts (price by default; duration; departure) and filters (`maxStops`,
   `selectedAirlines`).

**Response:** `offers`, `totalResults`, `allCount`, `searchTimestamp`, `failedProviders`,
`providersFailed`.

### 4.2 Outage vs. empty route

`searchDuffel` **throws** (`DuffelSearchError`) when every attempt failed, rather than returning
`[]`. The orchestrator turns that into a named `failedProviders` entry, and `providersFailed` is
true only when there are no offers *and* a provider failed. Without the distinction, an outage
rendered as "No flights found" with nothing to retry. The web page shows the error state (with a
retry) for the first and the empty state for the second.

### 4.3 The deadlines, derived rather than guessed

`src/lib/flights/searchBudget.ts` exists because three timeouts used to be chosen independently
and two landed on 12 s: the orchestrator raced the whole of `searchDuffel` — retries included —
against the same 12 s one *attempt* is allowed, so the retry ladder could never deliver and a
slightly slow first attempt came back as zero offers with `success: true`.

```
PROVIDER_ATTEMPT_TIMEOUT_MS = 12 000          one attempt's network deadline
PROVIDER_RETRY_BACKOFF_MS   = [2 000]         its length IS the retry count (one retry)
PROVIDER_WORST_CASE_MS      = 2×12 000 + 2 000 = 26 000
PROVIDER_CEILING_MS         = 26 000 + 3 000   = 29 000   orchestrator circuit breaker
CLIENT_SEARCH_TIMEOUT_MS    = 29 000 + 5 000   = 34 000   browser abort must outlast the server
```

Retry policy inside `searchDuffel`: 5xx and timeouts retry once after 2 s; **429 never retries**
(it is an account-level limit; retrying only produces more). One retry rather than two because a
second would only start after 26 s have gone and nothing it returns arrives while anyone is
watching.

### 4.4 Normalisation worth knowing

`parseDuffelOffer` / `normalizedToFlightOffer` flatten slices into segments and fix several things
that were wrong in v1:

- **Per-person price.** Duffel sends no `pricePerAdult`; the old fallback was the *whole party's*
  total under a "/person" label, so a three-adult search showed every fare at 3×. It is now the
  total divided by passenger count (an average — Duffel publishes no per-passenger breakdown, so
  a party with children spreads their cheaper seats across everyone; for adults-only parties it is
  exact).
- **Base and tax.** Duffel spells them `base_amount` and `tax_amount`; the camelCase names read
  before never matched, so every fare reported its whole total as base with zero tax.
- **Baggage.** `duffelBaggage` takes the *least generous segment* of the first passenger (a
  checked bag allowed outbound but not back is not a checked bag) and returns `undefined` when
  Duffel says nothing, so the card shows no bag line rather than "No checked bag".
- **Slice durations** are Duffel's own, because segment times carry no UTC offset and the browser
  cannot subtract them across time zones.
- **Fare policy** (`conditions.refund_before_departure` / `change_before_departure`) →
  `isRefundable`, `isChangeable`, penalties.

### 4.5 The web page

`/flights/search` → `FlightSearchClient` (`flight-search-client.tsx`).

- **Reading the URL.** `resolveIATA` accepts three shapes: a bare code (`MNL`), a city name from a
  curated table, and the search bar's own display name `"Clark (CRK)"`. The parenthesised code
  wins when present so `"London (LHR)"` cannot resolve elsewhere. (The third shape was missing
  once and closed the only route into the feature; deep links kept working, which is why it
  survived.) A missing date is *not* refused — `resolveDepartureDate` supplies one.
- **Fetching.** `POST /flights/search` with an `AbortController`; a "taking a while" state at
  15 s and a hard abort at 45 s (the app's own constants, deliberately above the API's 29 s
  ceiling); a minimum 1.5 s on-screen so a very fast answer does not flash.
- **States:** `loading → loading_slow → success | empty | timeout | error`.
- **Filtering** is client-side (`features/flights/lib/filter-offers.ts`, v1's rules); the filter
  panel is populated from the *unfiltered* list so choosing an airline does not remove the other
  airlines from the panel.
- Changing route, dates, travellers or cabin on the top bar writes a new search URL and resets the
  filters, since an airline or price chosen for one route means nothing on another.

---

## 5. Choosing an offer, and the endpoints around it

### 5.1 Revalidate — the first price gate

When the traveller picks a fare, the page calls `POST /flights/revalidate` **before** navigating
(`handleSelect`). The API (`src/lib/flights/revalidate.ts`, ported from v1 item C3) asks Duffel's
Price Action, `POST /air/offers/:id/actions/price`, and returns `priceChanged`, `newPrice` and a
refreshed `farePolicy`.

Rules that matter:

- **Only an increase beyond tolerance prompts.** Comparing the absolute difference used to ask
  people to "approve" a fare that had got *cheaper*. A drop is adopted silently: the page replaces
  the offer's total with `newPrice`, so checkout shows what the supplier now quotes.
- **It soft-fails.** A 404, a non-2xx, a thrown error or a missing offer id all return
  `success: true, priceChanged: false`. A provider hiccup must not block a booking the order path
  can still complete; the real error will surface there in its own words.
- **One tolerance for every gate** (`getFlightPriceTolerance`: `0.50` on a live token, `10.00`
  on a `duffel_test_` token, overridable with `FLIGHT_PRICE_TOLERANCE`; compared against **base
  fares**, never a total that includes seats or bags). When two gates had
  different thresholds a fare between them sailed past the first and was rejected by the second,
  so travellers were asked about a change the app had just decided was immaterial.

On a confirmed pick the page stores `selectedFlight` and `flightSearchPassengers` in
`sessionStorage` and navigates to `/flights/book?<query>`, which immediately `router.replace`s to
`/checkout?<query>` (`flight-book-view.tsx` is just a redirect, kept so old links work).

**The query string is the source of truth for checkout** (`flightCheckoutQuery`): `offerId`,
`totalAmount`, `currency`, `origin`, `destination`, `departureDate`, `cabin`, `adults`,
`children`, `infants`, optional `bundleHotelId`. Checkout reads from the URL, *never* from
`sessionStorage` — with the offer id alone it drew an empty route and "USD 0". The travellers are
in it too, all of them: the offer holds one passenger per traveller searched for (adults, then
children, then infants), the order must name each, and a checkout that only knew the adults sent
the airline too few and was refused *after* the card.

### 5.2 The other flight endpoints

| Endpoint | Auth | Purpose | Notes |
|---|---|---|---|
| `GET /flights/offers/:offerId` | – | The offer being bought, in card shape, for the checkout summary and confirmation screen | Re-read from Duffel, `_rawOffer` stripped. `410 OFFER_EXPIRED` / `503 UPSTREAM_UNAVAILABLE`. Used by `useFlightOffer`. |
| `POST /flights/bags` | – | Bag options for the offer's passengers | Maps Duffel `available_services` of type `baggage` to `NormalizedBagOption`; de-duplicates by `serviceId:passengerIndex`. |
| `POST /flights/seat-map` | – | Seat map per segment | `normalizeSeatMapEntry` prefers economy → premium economy → first cabin; classifies window/aisle/middle, extra legroom, exit row. A 422 returns `{ seatMaps: [], unavailable: true }`. |
| `POST /flights/offer-refresh` | – | A fresh offer for the *same* journey when the chosen one expired before bags/seats | Runs a new `offer_request`, then keeps only offers `sameItineraryOffers` accepts. Never returns a different flight. Upstream trouble comes back as `{ success: false, reason }`, not a status code. |
| `POST /flights/fare-rules` | – | Mystifly fare rules | Mystifly-only. |
| `GET /flights/price-calendar` | – | Cheapest price per day for a month | Reads `get_cheapest_prices_per_day` (the cache), with a direct-query fallback. |
| `POST /flights/price-calendar-live` | – | Cheapest price for up to 7 specific dates, live | Searches each date in parallel; drops past dates. |
| `POST /flights/trip-details`, `ticket-display`, `booking-note(s)` | – | Mystifly stubs | `503 MYSTIFLY_NOT_LIVE`. |
| `POST /flights/book`, `/confirm`, `GET /booking-status`, `POST /cancel-quote`, `/cancel-booking` | ✔ | The booking | Below. |

**What the web checkout actually calls today:** `search`, `revalidate`, `offers/:id`, `book`,
`confirm`, and (from the trips page) `cancel-quote` / `cancel-booking`. The web app does **not**
currently call `bags`, `seat-map`, `offer-refresh`, `price-calendar*` or `booking-status` for
flights — the API supports them and the booking path prices seats and bags correctly, but there is
no seat or bag picker in the web checkout yet.

### 5.3 "Same journey or nothing"

`offerItineraryMatch.ts` is a small file with a large consequence. When an offer expires, any
recovery path rebuilds an `offer_request` that carries only origin, destination, **date** and
cabin — so *every* flight that airline operates that day comes back. The code used to filter by
validating carrier and sort by **price proximity**, which cannot tell a 06:00 from a 22:00 departure
at the same fare; a traveller could be ticketed onto a flight sixteen hours from the one they chose
— and `flight_segments` would still record the one they picked.

`isSameItinerary` now requires, segment by segment and in slice order: same marketing carrier, same
flight number, same origin and destination, same departure **instant** (compared as instants, not
strings), and the same slice and segment *shape* (so a one-way cannot match half a round trip).
`operating_carrier` is deliberately ignored because codeshares legitimately vary it. It is
strict on purpose and asymmetric in its failure mode: wrongly rejecting a real match costs the
traveller a "search again"; wrongly accepting a near-match tickets them onto the wrong aeroplane.
`sameItineraryOffers` returns matches cheapest first, and empty means *report unavailable*, never
substitute.

---

## 6. Pricing

All in `src/lib/pricing.ts`. The markup recovers **Platform Cost** — Stripe's fees plus Duffel's
own — and nothing else (ADR-0036). No margin is intended.

### 6.1 Why flat plus proportional

Duffel's invoice has a flat $3.00 per paid order plus 1% of fare (Managed Content); Stripe's real
rate on this account is **4.4% + $0.30** (2.9% base + 1.5% international card + 30¢, measured on
live charges — not the headline 2.9%). No single percentage is solvent across fare sizes: too thin
on cheap fares, too fat on expensive ones. So:

```
FLIGHT_MARKUP_SPEC = { rate: 0.072, flat: $4.40 (USD), cap: 0.12 }

markup  = min( base × 0.072 + flat_in_base_currency , base × 0.12 )
charged = base + markup
```

| Base fare | 7.2% + $4.40 | Cap (12%) | Markup | Charged |
|---|---|---|---|---|
| $50 | $8.00 | $6.00 | **$6.00** (capped) | $56.00 |
| $100 | $11.60 | $12.00 | $11.60 | $111.60 |
| $300 | $26.00 | $36.00 | $26.00 | $326.00 |
| $830 | $64.16 | $99.60 | $64.16 | $894.16 |

(The cap binds below ~$90, but only stops *covering cost* below ~$54. The rate is above break-even
on purpose: cancellations are socialised — Duffel bills cancelled orders and Stripe keeps its fee on
a refund, but the refund returns the markup. The model assumes a 20% cancellation rate, which the
source comments label an assumption awaiting data, not a measurement.)

### 6.2 The flat component is in USD

It recovers USD costs, so it must be **converted into the fare's currency** before use — adding
4.40 to a PHP fare would charge ₱4.40, about eight US cents. `openPayment` converts with the strict
converter; if that single conversion fails it falls back to a flat of 0 (under-recovering one
booking by ~$4.40 rather than refusing it).

### 6.3 Charging in the customer's currency

The fare is in the airline's currency (`rawOffer.total_currency`); the charge currency is
`displayCurrency` or, by default, the fare's currency. If they differ, the marked-up price is
converted with `makeStrictConverter` — **strict** meaning it throws rather than passing the number
through, because a silent passthrough charges 5,800 PHP as 5,800 USD. A failure there is
`503 FX_UNAVAILABLE` with "your card was not charged", and happens **before** any session or
PaymentIntent exists, so nothing is left behind. The Stripe amount uses `toStripeAmount`, which
knows sixteen zero-decimal currencies (an earlier local copy knew eight and charged a flat 0%
markup — flights were being sold at cost).

### 6.4 What the app shows (and a gap)

The API stores the pre-markup total in the fare's currency as `original_price` and the charged
total as `charged_price`. See [§14](#14-known-gaps): the web checkout's summary and Pay button show the
URL's `totalAmount`, which is the *supplier* fare as returned by search, not the marked-up charge.

---

## 7. Book: opening the hold

`POST /flights/book` (auth) → `FlightsService.book` → `openPayment`. Everything in `book` is
**free to refuse**: nothing is ordered, nothing authorised until the last step.

### 7.1 Checks, in order

| # | Check | Failure |
|---|---|---|
| 1 | Provider is `duffel` (inferred from `offerId`); Mystifly refused | `422 FARE_UNAVAILABLE`, `400 INVALID_PROVIDER` |
| 2 | An offer id is present; Duffel is configured | `400 MISSING_FLIGHT` / `MISSING_OFFER`, `503 PROVIDER_UNAVAILABLE` |
| 3 | **Offer re-fetched from Duffel by id** — `withServices: true` when seats/bags chosen | `410 OFFER_EXPIRED` (gone), `503 UPSTREAM_UNAVAILABLE` (unreachable) |
| 4 | Fare total > 0 | `400 INVALID_PRICE` |
| 5 | **Duplicate departure** guard (ADR-0011): same user, same origin, same departure day, an active booking | `409 DUPLICATE_BOOKING` with `canProceed: true`, unless `acknowledgeDuplicate` — *warned, not refused* |
| 6 | Optional Duffel balance guard (`DUFFEL_BALANCE_CHECK=on`; **off by default** — see below) | `503 INSUFFICIENT_BALANCE` |
| 7 | *(uncommitted)* One traveller per passenger the fare was priced for | `400 INVALID_PASSENGERS` |
| 8 | Contact phone converts to E.164 (`orderPhoneNumber`) | `400 INVALID_PHONE` |
| 9 | Every chosen seat/bag id is in the offer's `available_services` | `409 SERVICE_UNAVAILABLE` |
| 10 | **Fare has not risen** beyond tolerance since the traveller saw it (`confirmedPrice`, or the offer the browser sent) | `409 PRICE_CHANGED` with `oldPrice`, `newPrice`, `currency` |

Notes:

- **The browser's copy is never priced from.** The offer is the only authority on what an order
  needs: the passenger ids it must quote and the exact amount its payment must state. Duffel's own
  guidance is to fetch again at booking time.
- **Balance guard is off.** It called `/air/payments/balances`, which does not exist on a live
  token — every variant 404s — so on live it threw, was swallowed and cost a round trip on every
  booking, while sandbox skipped it. Duffel's order API is the real enforcement point. A
  `duffel-balance-check` cron separately alerts when the balance is low.
- **A fare that came down is not a price change** — the hold is priced from the fresh offer.
- **Check 10 only fires when the caller supplies a figure to compare** — see [§14](#14-known-gaps).

### 7.2 Creating the hold (`openPayment`), in this order

The order is chosen so a failure at each step leaves the least behind.

1. **Price it** (`orderTotal` + `applyMarkup` + FX; [§6](#6-pricing)). `orderTotal` sums the offer total plus
   the offer's own prices for each chosen service, as a fixed-2 string — Duffel rejects a payment
   that does not match the order exactly, and a service the offer does not list adds nothing (the
   order will fail on it, which beats charging a figure nobody quoted). The browser's `seatTotal` /
   `bagTotal` are stored but **never charged**.
   *An FX failure stops here: no session, no PaymentIntent.*
2. **Write the session** (`booking_sessions`) with `capture_method = 'manual'`, the passengers,
   contact, fare policy, chosen service ids, `status = 'initiated'` and a 30-minute `expires_at`.
   The flight payload is stored with `_offerId` and the raw offer stripped out. **`capture_method =
   'manual'` is what marks an attempt as the lifecycle's** — the sweeper and both guarded crons key
   on it.
3. **Create the PaymentIntent** with `capture_method: 'manual'` (authorise, do not take),
   `automatic_payment_methods` with `allow_redirects: 'never'`, and metadata `bookingSessionId`,
   `provider`, `userId`, `passengerEmail`, `originalPrice`, `markupRate`, `markupAmount`, and
   `type: 'flight' | 'flight_bundle'` (bundles add `bundleHotelId`). Idempotency key
   `flight-pi-<userId>-<sessionId>`.
4. **Attach it** (`updateBookingSessionPayment`). If this fails the PaymentIntent is cancelled and
   the call fails with `500 SESSION_UPDATE_FAILED` "your card was not charged".
5. **Write the audit trail** (`currency`, `original_price`, `charged_price`, `markup_pct`,
   `payment_currency`) — what the capture will later be computed against.
6. **Record the creation event** (`lifecycle.open`): one `flight_booking_events` row, once, however
   many times the form is submitted.

**Response:** `{ clientSecret, sessionId, paymentIntentId }`. No Duffel order exists yet.

A session whose PaymentIntent was never created (step 3 threw) stays `PAYMENT_PENDING` with no
PaymentIntent; the sweeper closes it after two hours with "no payment was ever opened".

### 7.3 Mobile

`POST /mobile/flights/book` and `/confirm` (`mobile.route.ts`) call the **same**
`FlightsService`. Authentication is the only difference: a shared `X-Mobile-Api-Key` (from admin
settings or `MOBILE_API_KEY`), the user from the JWT when present, otherwise the guest account
`MOBILE_GUEST_USER_ID`, and no CSRF. v1 kept a second copy of the whole flow for mobile and had to
fix every bug twice; sharing one service means every protection below applies there too.

---

## 8. Confirm: the lifecycle

`POST /flights/confirm` (auth) → `FlightsService.confirm` → `FlightBookingLifecycleService.complete`.
The reference document has the full outcome table; this section explains how the parts fit.

### 8.1 The state machine

`src/lib/flights/lifecycle/stateMachine.ts` — pure, no I/O.

```
 PAYMENT_PENDING ─► PAYMENT_AUTHORIZED ─► SUPPLIER_BOOKING ─► CONFIRMED
        │                   │                    │    │
        ▼                   ▼                    │    └─► NEEDS_REVIEW ─► CONFIRMED | FAILED
  FAILED / EXPIRED    FAILED / EXPIRED           └─► FAILED
```

- Seven states, mirrored by a `CHECK` constraint in the migration and a test that pins the two
  lists together.
- **`SUPPLIER_BOOKING` cannot reach `EXPIRED`.** Once the airline has been asked, abandonment is
  not an answer — Duffel may hold an order.
- `NEEDS_REVIEW` is the only state a person must look at, and the only way out is `CONFIRMED` or
  `FAILED`.
- No cancel or refund states: cancellation is not part of this lifecycle; a confirmed flight is
  terminal here.
- `holdsAuthorisation(status)` is true for `PAYMENT_AUTHORIZED`, `SUPPLIER_BOOKING`,
  `NEEDS_REVIEW` — the states in which a card is held and nothing has been captured or voided.

`booking_sessions.status` (the old free-form string) is **kept truthful** (`failed`, `expired`,
`completed`) for the code that still reads it, but nothing new may decide on it.

### 8.2 The repository: one atomic move

`FlightBookingLifecycleRepository.transition(sessionId, from, to, options)` is a single SQL
statement:

```sql
WITH prior AS (
    SELECT id, lifecycle_status AS from_status FROM booking_sessions
     WHERE id = $1::uuid AND lifecycle_status = ANY($froms) FOR UPDATE
), moved AS (
    UPDATE booking_sessions s SET lifecycle_status = $to, updated_at = now()
      FROM prior WHERE s.id = prior.id RETURNING s.id, prior.from_status
)
INSERT INTO flight_booking_events (session_id, from_status, to_status, actor, reason, payload)
SELECT id, from_status, $to, $actor, $reason, $payload::jsonb FROM moved RETURNING session_id
```

The status test, the write and the audit row are one statement, so of N callers racing for the
same attempt exactly one gets `'applied'`; the rest get `'lost'`. A unique index on
`booking_sessions.payment_intent_id` is the backstop. A programmer error (an illegal edge) is
refused by `assertTransition` *before* any SQL.

Three properties every method keeps:

1. **It never throws.** By the time most of these run, money has moved or is about to.
2. **`'unavailable'` is not `'lost'`.** Missing column/table (`42703` / `42P01`) returns
   `'unavailable'`, which the caller must not mistake for losing a race. One warning per process
   names the missing migration instead of one per request.
3. **Failure detail lives in the event payload.** `booking_sessions` has no column for *why* an
   attempt failed or *which Duffel order* it holds, and the migration adds none; `failureCode`,
   `failureMessage` and `supplierOrderId` travel in the event `payload` and a read pulls them with
   `LEFT JOIN LATERAL … ORDER BY created_at DESC LIMIT 1`. `flight_booking_events` is "how did this
   get here", and that is exactly what those fields are.

### 8.3 `confirm`, step by step

1. Retrieve the PaymentIntent. `metadata.bookingSessionId` must equal the session id, else
   `403 SESSION_MISMATCH`.
2. **DB-first check.** If a `flight_bookings` row already exists for the session: payment
   mismatch → 403; `failed` → 400; has a PNR → return it (`source: 'webhook'`).
3. A Mystifly PaymentIntent is refused.
4. A PaymentIntent that is **not** `capture_method: 'manual'` is a session booked *before* this
   release (order placed at `book`, card charged). `confirmPreOrdered` finishes it in process
   under its `status` lock so nobody paying across the deploy is stranded. Delete it once none can
   still be open.
5. Otherwise `lifecycle.complete({ sessionId, paymentIntentId, actor: 'browser', userId })`.
6. Map the outcome: `confirmed` → `200 { bookingId, pnr, status, source: 'lifecycle' }`;
   `pending` → `409 BOOKING_PROCESSING` (`pending`, `needsReview`, `sessionId`); `failed` → the
   status/code from the `CONFIRM_FAILURES` table.

`BOOKING_PROCESSING` is **deliberately not a 2xx.** The mobile route spreads `confirm`'s result into
`{ success: true, … }`; a 2xx would show a confirmation with no ticket in it. A non-2xx makes a
client that doesn't know the code show its message — "check your trips".

### 8.4 `complete`: what is checked before the claim

The session must exist, belong to the caller (the webhook has no user), and name this
PaymentIntent; the PaymentIntent must name this session. Then by Stripe status:

| Stripe says | Result |
|---|---|
| `requires_capture` | go on to the claim |
| `succeeded` | already taken — answer from the record, **never order again** |
| `canceled` | answer from the record, or `PAYMENT_NOT_AUTHORIZED` "this payment was released" |
| anything else | `402 PAYMENT_NOT_COMPLETED` |

### 8.5 The claim

Two transitions, in order:

1. `PAYMENT_PENDING → PAYMENT_AUTHORIZED` — the authorisation, recorded by whoever sees it first.
   Losing this is the same fact recorded twice, not a conflict (the browser can arrive before the
   webhook has).
2. `PAYMENT_AUTHORIZED → SUPPLIER_BOOKING` — **the claim.** `'applied'` → this caller asks the
   airline. `'lost'` → this caller `answer()`s from the winner's record.

If the lifecycle is `'unavailable'` (migration absent) the claim falls back to
`lockSessionForBooking` — the session's own `status` lock — so exactly one caller still orders.

A loser **waits** for the winner (polling every 500 ms for up to 20 s while the state is
`SUPPLIER_BOOKING`/`PAYMENT_AUTHORIZED`) and is answered with the real result, so a checkout not
written with "pending" in mind still gets the true answer.

### 8.6 Asking the airline

`order()` rebuilds everything from what the session **stored**, not from anything the browser
sends now:

1. Re-fetch the offer by `flight._offerId` (with services if any were chosen). Gone →
   `OFFER_EXPIRED`; unreadable → `UPSTREAM_UNAVAILABLE`. *Both release the hold.*
2. Re-derive the E.164 phone; invalid → `INVALID_PHONE`.
3. `total = orderTotal(offer, seats, bags)`; `bookedBase = session.original_price`.
4. **Write a `supplier_booking_attempts` row *before* the call** (`client_reference` = session
   id). A request that dies mid-flight has very likely reached the airline, and the sweeper must
   never treat this attempt as releasable.
5. `placeDuffelOrder` with passengers from `buildOrderPassengers`, tolerance, and the Duffel
   idempotency key `flight-order-<sessionId>` — **per attempt, not the browser's per-offer key**,
   which would answer a corrected retry with the first attempt's refusal.

### 8.7 Inside `placeDuffelOrder`

This function (in `duffel.ts`, ported from v1 and the most defensive code in the feature) returns
one of four kinds:

```
success        { order, finalTotal, finalCurrency, usedOffer }
price_changed  { oldPrice, newPrice, currency }
offer_replaced { newOfferId, newOffer }          ← a same-itinerary offer exists but ancillaries were chosen
error          { status, data, timedOut? }
```

- Order body: `type: 'instant'`, `selected_offers`, `passengers`, `payments: [{ type: 'balance',
  amount, currency }]` and `services` for chosen seats/bags.
- **Timeout is 130 s** (`ORDER_CREATE_TIMEOUT_MS`), Duffel's documented client-timeout floor for
  order creation, not a generous margin. Aborting does not cancel the order, so a shorter bound
  doesn't save the traveller from a slow airline — it hides a real paid PNR from this system. (It
  was 45 s.) An abort yields a synthetic `504` with `timedOut: true`.
- **`price_changed` (422) loop**, up to twice: call Price Action for the live price, recompute
  fare + services, compare with tolerance (and with `confirmedPrice`); beyond tolerance →
  `price_changed`, otherwise retry the order at the new total.
- **`offer_no_longer_available` (422)** → rebuild an `offer_request` for the same slices, keep
  only `sameItineraryOffers`, and try up to three (`refreshPoolSize`). With **ancillaries**
  chosen it returns `offer_replaced` (the seat/bag ids belong to the old offer and cannot be
  re-chosen after the card); without, it re-maps passenger ids onto the fresh offer and tries
  again.
- Nothing that is actually the same flight → `error 422`, "report unavailable, let the traveller
  choose". Substituting a different flight is not a recovery.

### 8.8 The outcome table, as code

| Duffel says | Money | State | Code path |
|---|---|---|---|
| `success` | **Capture** (see §8.9) → write the sale | `CONFIRMED` | `ordered()` |
| `price_changed` | **Void** | `FAILED` (`PRICE_CHANGED`) | `refused()` |
| offer gone at fetch · `offer_replaced` · 422 expired | **Void** | `FAILED` (`OFFER_EXPIRED`) | `refused()` |
| any other 4xx (invalid passenger, seat gone, phone) | **Void** | `FAILED` (`DUFFEL_ORDER_FAILED`, or `OFFER_EXPIRED`/`INVALID_PHONE` by message) | `refused()` via `refusal()` |
| offer unreadable (nothing ordered) | **Void** | `FAILED` (`UPSTREAM_UNAVAILABLE`) | `refused()` |
| timeout · 5xx · dropped connection | **Keep the hold.** Read back; found → carry on as ordered; not found → | `NEEDS_REVIEW` (`UNKNOWN_OUTCOME`) | `readBack()` |
| ordered, capture fails after retry | hold kept, **no sale written**, order id on the event | `NEEDS_REVIEW` (`CAPTURE_FAILED`) | `ordered()` |
| ordered + captured, sale cannot be written | nothing undone | `NEEDS_REVIEW` (`SALE_NOT_RECORDED`) | `ordered()` |
| refused, but the void fails | hold stuck | `NEEDS_REVIEW` (`VOID_FAILED`) | `refused()` |
| refused, but the payment was already captured | — | `NEEDS_REVIEW` (`CAPTURED_WITHOUT_ORDER`) | `refused()` |

Every refusal message ends with "Your card has not been charged." — said only when the void
succeeded or the PaymentIntent was already void. `NEEDS_REVIEW` messages never say it (a flight
can be under review *after* money was taken).

### 8.9 Read-back after silence

`findOrderFromTimedOutAttempt` (`duffelOrderReconcile.ts`) lists Duffel's recent orders (limit 50)
and looks for one that matches **every** criterion: created at or after the request was sent
(1 s slack), not cancelled, same total (numeric compare, so `929.0` = `929.00`), same currency,
first-slice origin, last-slice destination, and the lead passenger's family name. Duffel's
`Idempotency-Key` behaviour is undocumented and cannot be relied on to replay a response, so the
listing API is the recommended check. The matching is conservative in one direction only: a false
negative leaves an orphan for a human (bad, but the status quo); a false positive would attach a
traveller to **someone else's ticket**, so all clauses must agree. It never throws — it runs on an
error path and must not replace one failure with another.

A match records a note event and proceeds exactly as if the order had answered.

### 8.10 Capturing — never more than authorised

`ordered()` decides the amount, then `capture()`:

- **Fare came down** (same currency, `finalBase < bookedBase`) → capture
  `authorised × markup(final) / markup(booked)` using the same `applyMarkup`; the *ratio* carries
  the exchange rate the hold was taken at, so no FX call is needed for the amount.
- **Fare went up within tolerance** → capture the authorisation; the difference is absorbed.
- **Fare went up beyond tolerance** → Duffel never ordered; that is the void path.
- The capture amount is clamped: `Math.min(authorisedMinor, …)`. A mutation test confirms the suite
  fails if capture can exceed the authorisation.

`capture()` uses key `flight-capture-<sessionId>`, tries twice, and — crucially — on any failure
**asks Stripe what state the payment is really in** before giving up, because a capture that landed
but whose response was lost looks identical to one that failed. If Stripe says `succeeded` it is
believed. After a second failure → `NEEDS_REVIEW (CAPTURE_FAILED)`.

`voidAuthorisation()` reads first: `canceled` → `already_void`; **`succeeded` → `captured` and it
does nothing** ("a refund wearing a void's name, and not ours to do on a hunch"); otherwise cancel.

### 8.11 The sale

Only after a successful capture does `completeDuffelBooking` run
(`src/services/flightBookingCompletion.ts`):

1. Re-read the PaymentIntent for what was actually charged (`fromStripeAmount`, scaled by the
   currency's own exponent — dividing by 100 recorded a ₩1,200,000 booking as ₩12,000).
2. `status = ticketed` if the order has e-ticket documents, else `awaiting_ticket` — **never a
   pending status**.
3. `lockFx` records the USD amount and the rate for revenue reporting (ADR-0008). It never throws; a
   rates outage yields nulls and a later backfill.
4. `createDuffelFlightBooking` writes `flight_bookings` (pnr, status, prices, `supplier_cost` =
   pre-markup, order id, ticket numbers, fare policy, trip type, FX, brand).
5. Segments are written **from the order Duffel is actually holding** (`withBookedItinerary`), not
   from `booking_sessions.flight`, which is client-supplied and may not be the itinerary that got
   ticketed. The stored payload is only the fallback for an order with no readable slices.
6. Passengers (with ticket numbers), `markSessionCompleted`.
7. Send the confirmation email. A mail failure is logged and **never** turns a booking into a
   failure; a failed send leaves an `email_logs` row for the retry job.

**Why after capture and not before:** `flight_bookings` is what trips, invoices, admin and the
orphaned-order cron read, and that cron cancels the Duffel order of a row it thinks is unpaid. A
row written before capture could cost a traveller their ticket. An order whose payment couldn't be
captured is therefore recorded on the *attempt* (event payload), never as a sale.

---

## 9. After the sale

### 9.1 The Stripe webhook completes bookings too

`POST /webhooks/stripe` verifies the signature, then **claims the event** by inserting its id
into `stripe_processed_events`. A duplicate delivery of a *completed* event is skipped; an event
claimed but never completed is reprocessed (a delivery that died part-way must not lose its work).

On `payment_intent.amount_capturable_updated` with `metadata.type` of `flight` or `flight_bundle`,
it calls `completeFromPayment`, which runs the **same** `complete()` under the **same** claim with
`actor: 'webhook'`. It ignores a PaymentIntent that isn't `capture_method: 'manual'` (a pre-release
payment that was already ordered). Errors are logged, not rethrown: a retry of the event would only
repeat the same attempt. A bundle's hotel half is its own PaymentIntent and completes as
`hotel_bundle`.

Effect: close the tab the instant the card is accepted and the booking still completes.

### 9.2 `booking-status`

`GET /flights/booking-status?sessionId=` (owner only) returns the booking if there is one; before
there is, the attempt's lifecycle: `pending`, `processing`, `needs_review`, or `failed` with the
stored `code` and `error`. So a refresh mid-completion shows progress instead of "not found". (The
web flight checkout does not call it yet.)

### 9.3 Duffel's own webhook and the ticket

`POST /webhooks/flight-supplier` verifies Duffel's HMAC (`t=…,v1=…` over `"<t>.<body>"`,
constant-time compare) and acknowledges `200` immediately — Duffel retries aggressively on
non-200 — then processes:

- `order.updated` / `order.fulfilled` → re-fetch the order, read ticket numbers from
  `documents[].unique_identifier` (`ticketNumbersFrom`), set the booking `ticketed` (or
  `confirmed`) and, when ticketed, send the "your ticket is issued" email.
- `order_cancellation.confirmed` → mark cancelled and refund the PaymentIntent if not already.

`ticketNumbersFrom` exists because two places once read `document_number`, which Duffel never
sends: the "no tickets yet" check passed on a length of one and a booking was marked ticketed with
`[null]` recorded. A ticket number nobody can read is the one thing a ticketed booking must carry.

A third route to "ticketed" is the `poll-pending-tickets` cron (every 5 min). See
[§14](#14-known-gaps) — as written it selects `status = 'booked'`, which the lifecycle never writes.

The confirmation email (`sendFlightConfirmationEmail(bookingId)`) takes **only** a booking id and
reads everything from the row, since it is called from three places that used to drift (one sent
every confirmation as "0 USD"; another described the itinerary the traveller *selected*). Two
email types — "booked, ticket to follow" and "ticketed" — are distinct in `email_logs`, so a
booking can legitimately receive both and a repeat of either is suppressed.

### 9.4 The crons, and how they were kept off the lifecycle

`docker/cron/crontab` runs everything over the Docker network with a bearer `CRON_SECRET`.
Flight-relevant jobs:

| Schedule | Job | Purpose |
|---|---|---|
| `*/10` | `GET /cron/flight-booking-sweep` | The sweeper (below) |
| `*/10` | `POST /internal/auto-recover` | Retries paid-but-unbooked sessions — **now excludes the lifecycle's** |
| `*/10` | `GET /cron/cleanup-orphaned-duffel-orders` | Cancels the Duffel order of a stale unpaid pending row — **now excludes the lifecycle's** |
| `*/5` | `GET /cron/poll-pending-tickets` | Looks for tickets that were issued late |
| `*/30` | `GET /cron/refresh-popular-flights` | Warms popular searches |
| `0 */6` | `duffel-balance-check`, `sync-flight-deals` | Low-balance alert; deals |
| `0 6` | `check-price-alerts` | Price-alert emails |
| `0 6 4 * *` | `platform-cost-reconciliation` | Compares expected Duffel cost to the real invoice |

**The sweeper** (`FlightBookingLifecycleService.sweep`) **never orders and never calls Duffel.**

- Voids and expires (`ABANDONED`) attempts nobody finished — `PAYMENT_PENDING` for more than 2 h,
  `PAYMENT_AUTHORIZED` for more than 30 min — and **only** sessions with `provider = 'duffel'`,
  `capture_method = 'manual'` and **no `supplier_booking_attempts` row** against them. The last
  condition is what makes voiding safe: if the airline was ever asked, it is not the sweeper's.
- The `manual` condition matters because the column default is `PAYMENT_PENDING`: a session written
  by *old* code between the migration being applied and the new code deploying would read as
  in-flight while its payment captures automatically. That is a charge, not a hold.
- A `captured` or un-releasable PaymentIntent is reported as an **anomaly**, never touched.
- It raises **one** admin notification per attempt in `SUPPLIER_BOOKING` / `NEEDS_REVIEW` for more
  than 15 min, naming the Duffel order when there is one ("check the Duffel dashboard and the
  attempt's `flight_booking_events` before releasing or capturing anything").

**The two older crons** would each have damaged the new flow:

| Cron | What it would have done | Fix |
|---|---|---|
| `auto-recover` | Read an authorised (`requires_capture`) card as unpaid and stamped the session `expired`; pushed a `SALE_NOT_RECORDED` attempt through create-booking | `FlightsRepository.findSessionsToAutoRecover` excludes `provider = 'duffel' AND capture_method = 'manual'` |
| `cleanup-orphaned-duffel-orders` | Cancelled the Duffel order of a pending unpaid `flight_bookings` row | The lifecycle never writes one; `findOrphanedOrderCandidates` additionally excludes any row whose session is `manual` — a second guard, because the action at the end is cancelling somebody's ticket |

### 9.5 Cancellation (unchanged by this work)

`cancel-quote` and `cancel-booking` predate the slice and were left alone. `cancelQuote` asks Duffel
for an order cancellation quote and computes a refund ratio against the Stripe amount;
`cancelBooking` sets `cancel_requested` atomically, cancels with the supplier (Duffel two-step
quote → confirm, or Mystifly), then refunds the PaymentIntent (cancelling it if it is still
uncaptured), with explicit states for provider-missing and manual-cancellation cases. It is the
largest piece of flight code that has *not* been through the lifecycle treatment; a "cancel preview"
mirroring the hotel one is the planned slice 3.

---

## 10. The web checkout

One file, `src/app/[locale]/checkout/page.tsx` (~1650 lines), serves hotels and flights. Mode is
`offerId && !hotelId ? 'flight' : 'hotel'`. The hotel half has its own state machine and hook
(`useHotelCheckout`); the flight half is page state, with extracted pure helpers.

### 10.1 Steps

```
 form ──(Continue)──► POST /flights/book ──► payment (Stripe form) ──(Pay)──► POST /flights/confirm ──► confirmed
   ▲                                                                                    │
   └──── price_changed / offer_expired / refused (hold released) ◄──────────────────────┤
                                                              processing ───────────────► SettlingPanel
```

### 10.2 The passenger form

One form per traveller the fare was priced for — adults, then children, then infants — the order
the offer lists them in and the order the airline matches them by. Per passenger: first name, last
name, date of birth, gender, passport number, passport expiry, issuing country (2-letter). The lead
traveller also gives email and phone (with a dial-code picker; without one the API reads a national
number as Korean — the default country code is `82`).

`validatePassengers` requires every field above. The reasons are written into the code:

- **Gender** is required because the order builder defaults a missing one to female, and a ticket
  whose gender disagrees with the passport is refused at the gate.
- **Expiry and issuing country** travel with the passport number or the airline gets none of it:
  `duffelIdentityDocuments` returns nothing unless all three are present.

**Date bounds** (`flight-date-bounds.ts`) stop mistakes the airline would refuse *after* the card
is held: an adult is 12+, a child 2–11, an infant under 2 — **judged on the day they fly**, not
today — and a passport must be valid on the departure date (max 20 years out). The picker only
offers dates inside the band and opens on a likely one.

### 10.3 `handleFlightSubmit` → `book`

Sends `{ offerId, currency, contact, idempotencyKey: "flight-<offerId>-<email>", passengers[] }`
(passengers carry the lead's email/phone, because Duffel wants the booking contact on every one;
`nationality` is the uppercased country). On success it stores `sessionId` and `clientSecret` and
moves to `payment`. Not signed in → redirect to `/login?redirect=…`.

The idempotency key is per offer+email, not per attempt. This was checked: every `book` creates a
*new* session, the PaymentIntent key is per session and the Duffel order key is per session, so a
retry after a void is never answered by a stale session — no nonce needed.

### 10.4 The payment step

`StripePaymentForm` calls `stripe.confirmPayment({ redirect: 'if_required' })` and treats **both
`succeeded` and `requires_capture`** as success (the second is what manual capture produces).
Anything else shows "Payment is processing. Check your trips shortly." The copy above the form
(`checkout.flight.cardHeld`) says the card is authorised now and charged only once the airline
confirms.

### 10.5 `handleFlightPaid` → `confirm` → what the traveller sees

`readFlightConfirmError` (`flight-confirm-errors.ts`) turns a refusal into one of five kinds:

| Kind | Triggered by | The page |
|---|---|---|
| `processing` | `BOOKING_PROCESSING` | `SettlingPanel kind="flight"` — "being confirmed" with a link to trips; `needsReview` says a person is finishing it |
| `price_changed` | `PRICE_CHANGED` + prices | Both prices, "nothing was charged", back to the details form |
| `offer_expired` | `OFFER_EXPIRED` | "nothing was charged", back to the details |
| `refused` | `DUFFEL_ORDER_FAILED`, `INVALID_PHONE`, `UPSTREAM_UNAVAILABLE`, `BOOKING_EXPIRED` | The server's own words, back to the details |
| `error` | anything else | The message; payment may be exactly where it was — **stays on the payment step** |

The first four leave nothing to pay with — the PaymentIntent behind the card form is void or
settled — so the page returns to details and clears `clientSecret` / `sessionId`. The `error` kind
does not, because the payment may be unchanged.

The panels (`booking-state-panels.tsx`) are built around one question, "have I been charged?":
*price moved* — not yet; *gone* — no; *supplier down* — no; *settling* — no, and not twice; *needs
review* — held, not taken; *released* — no; and the last row, *unknown*, says **"we cannot tell
you — look at your trips"**. "You have not been charged" is only ever said when the server said
the hold was released.

### 10.6 Confirmation and after

`FlightConfirmedScreen` (split from the hotel receipt in `c01738d`) shows the PNR, route and
passengers, and enriches the itinerary with `useFlightOffer` (terminals, airport names, duration,
baggage, fare terms) — purely cosmetic: by then the booking has succeeded, so a slow or failed
fetch is never retried and never blocks. Trips are listed from `GET /bookings?type=flight`
(`FlightBookingCard`); cancelling uses `CancellationModal` → `cancel-quote` then `cancel-booking`.

**Privacy.** `clearBookingInProgress` wipes the booking store, wishlist and the `selectedFlight` /
`flightSearchPassengers` session keys on sign-out, because a half-finished booking is not worth
handing to the next person on a shared computer (v1's QA BG-1: a second account opened `/checkout`
onto the first account's name, email and phone).

### 10.7 i18n

New strings were added for four locales; the Korean, Japanese and Chinese ones are listed in
`NEEDS_NATIVE_REVIEW.md`. A `checkout-keys` test guards the keys.

---

## 11. Data model

### 11.1 Tables

| Table | Role | Written by |
|---|---|---|
| `flight_searches` | One row per search | `saveSearch` |
| `flight_results_cache` | Offers per search — price history for the calendar, **never** serves a search | `cacheResults` |
| `booking_sessions` | **The attempt.** Passengers, contact, fare policy, prices, PaymentIntent, chosen services, `capture_method`, `lifecycle_status`, `status` | `book`, lifecycle |
| `flight_booking_events` | **Append-only audit of every move** — actor, reason, payload | lifecycle repository |
| `supplier_booking_attempts` | A record of each Duffel call, written *before* it | `startSupplierAttempt` / `finishSupplierAttempt` |
| `flight_bookings` | **The sale.** Written once the airline has ordered and money is captured | `completeDuffelBooking` |
| `flight_segments`, `passengers` | Itinerary (from the Duffel order) and travellers (with tickets) | `completeDuffelBooking` |
| `stripe_processed_events` | Webhook de-duplication | Stripe webhook |
| `email_logs` | Dedup + retry for confirmations | email sender |

`booking_sessions` is the attempt and `flight_bookings` is the sale. They are deliberately
separate: an attempt can fail, expire, or sit under review, and none of that should look like a
booking to the code that reads trips, invoices and admin.

### 11.2 The migration

`db/migrations/20261016000001_flight_booking_lifecycle.sql`:

- `booking_sessions.lifecycle_status` — added nullable, **backfilled**, then `DEFAULT
  'PAYMENT_PENDING' NOT NULL`, plus a `CHECK` over the seven states.
- **Backfill rule:** `completed`/`booked` → `CONFIRMED`; `failed` → `FAILED`; everything else →
  `EXPIRED`. Without it, the default would make every historical row look in-flight and the
  sweeper would try to void them. Only rows still `NULL` are touched, so re-running a
  hand-applied file cannot reset live attempts.
- Unique index on `payment_intent_id` (where not null) — the claim's backstop. **Check first** that
  no PaymentIntent is shared by two sessions or the statement fails.
- Index `(lifecycle_status, created_at)` for the sweeper.
- `flight_booking_events` with an `actor` `CHECK` of `browser | webhook | sweeper | admin`.
- One transaction, so it applies whole or not at all. Locks `booking_sessions` (full-table
  `UPDATE`, two index builds) — apply at a quiet moment.
- Runs under `dbmate` thanks to `transaction:false` (`7779f22`); otherwise dbmate's wrapper and the
  file's own `COMMIT` fight ("unexpected transaction status idle" after the SQL has already
  committed).
- The `duffel_pre_order_*` columns are left alone; the new flow stops writing them.

Applied to the dev database (`dbmate status` shows it applied as of 2026-10-21).
`prisma/schema.prisma` was synced to the new columns in `56cc21c`, but the lifecycle code still
uses raw SQL, so nothing waits on a generated model.

### 11.3 Idempotency, in one place

| Key | Where | Why that scope |
|---|---|---|
| `flight-<offerId>-<email>` | stored on the session by the browser; **not** sent to Duffel | Per offer: it stops a double submit, but would replay a refusal if used as the order key |
| `flight-pi-<userId>-<sessionId>` | Stripe PaymentIntent create | Per session |
| `flight-order-<sessionId>` | Duffel order create | Per attempt |
| `flight-capture-<sessionId>` | Stripe capture | Per attempt; makes the retry safe |
| `refund-<bookingId>` | Stripe refund on cancel | Per booking |
| random UUID | Duffel sub-calls (Price Action, refresh `offer_request`) | They are reads/quotes |

---

## 12. What has and has not been verified

### 12.1 Run while writing this document (2026-10-26)

```
npx vitest run <22 flight-related test files>      → 22 files passed, 260 tests passed
```

Files: `flightLifecycle.{stateMachine,repository,service}`, `flights.{service,search,repository.cronGuards}`,
`duffel*`, `orderPassengers`, `orderTotal`, `offerItineraryMatch`, `webhooks.stripe.flightAuthorisation`,
`internal.createBooking.duffel`, `awaitBookingRow`. This was **not** the whole suite and `tsc` / lint
were **not** re-run now; the whole-suite numbers below are the plan's recorded figures.

### 12.2 Recorded in the plan (not re-run now)

| When | API | App |
|---|---|---|
| Baseline, 2026-10-16 | 89 files / 1195 tests, `tsc` 0, lint 0 err / 25 warn | — |
| Task 12, 2026-10-19 | 97 files / 1306 tests, `tsc` 0, lint 0 err / 20 warn | 72 files / 1253 tests, `tsc` 0 |
| After the dbmate fix, 2026-10-21 | 97 files / 1312 tests, `tsc` clean, lint 0 err / 20 warn | — |

Also run once, against a scratch **Postgres 17** with the migration applied and Stripe and Duffel
**faked**: the happy path with its event trail; three concurrent claims → one applied; browser +
webhook racing → one order and one sale; refusal → void; timeout → hold kept; capture failure → no
sale; the sweeper's selectivity; both cron guards. In every one of those paths: no captured money
without an order, no order without a sale row — except `SALE_NOT_RECORDED`, which is by design
captured-with-order-and-no-row and goes to `NEEDS_REVIEW`.

### 12.3 Test map

| Scenario | Test |
|---|---|
| State machine; list pinned to the migration's `CHECK` | `flightLifecycle.stateMachine.test.ts` |
| Claim, `lost` vs `unavailable`, events carry actor + reason | `flightLifecycle.repository.test.ts` |
| `book` checks before the card; manual capture; no order | `flights.service.test.ts` › `book()` |
| `confirm` outcomes on the wire; a pre-release session | `flights.service.test.ts` › `confirm()` |
| Every outcome-table row; price down → partial capture; up → absorbed / void; timeout found / not found; capture failure; double submit / browser+webhook race; migration absent; sweep | `flightLifecycle.service.test.ts` |
| Stripe event reaches completion (flight and bundle yes, hotel no, thrown error logged not rethrown) | `webhooks.stripe.flightAuthorisation.test.ts` |
| Crons kept off the lifecycle's rows | `flights.repository.cronGuards.test.ts` |
| The sale's shape (unchanged by the extraction) | `internal.createBooking.duffel.test.ts` |
| Passengers, totals, identity documents, same-itinerary match, order reconcile, tickets | `orderPassengers`, `orderTotal`, `duffelIdentityDocuments`, `offerItineraryMatch`, `duffelOrderReconcile`, `duffelTickets` |
| Search outcome / offer parsing / per-adult price / bags | `flights.search`, `duffelOffer.normalize`, `duffelPricePerAdult`, `duffel.getOffer` |
| App: flight checkout after the card, through a stubbed API and Stripe | `checkout-flight-page.test.tsx` |
| App: refusal mapping, date bounds, offer query, panels | `flight-confirm-errors`, `flight-date-bounds`, `flight-checkout-query`, `booking-state-panels` tests |

### 12.4 Not done

- **No run against the real Duffel sandbox, real Stripe, a real browser, or 3-D Secure.** Both
  suppliers are stubbed everywhere. This is the open item in Task 12 and it needs real credentials.
  The five scenarios to run: happy path; offer expired between `book` and `confirm`; browser closed
  after authorisation with the webhook completing; an abandoned checkout voided by the sweeper;
  `confirm` and the webhook racing → one order. Then verify with `flight_booking_events` that no path
  leaves money captured without an order or an order without a booking row.
- **Mobile was read, not run.** It uses PaymentSheet and, once `presentPaymentSheet()` returns
  without error, calls `/mobile/flights/confirm` without looking at the PaymentIntent status — so
  `requires_capture` is fine. It shows any error as a "Booking Failed" alert, so `BOOKING_PROCESSING`
  reads "Booking Failed: … check your trips shortly". Not mistaken for success, but the title is
  wrong. Branch `chore/bare-react-native`.

---

## 13. Uncommitted work on this branch

At the time of writing, the working tree has changes (+135 / −7) to
`src/lib/flights/duffel.ts`, `src/lib/flights/orderPassengers.ts`, `src/services/flights.service.ts`
and `src/__tests__/orderPassengers.test.ts`. Everything above that mentions them is marked
*(uncommitted)*. In short:

1. **Infants are linked to adults.** `buildOrderPassengers` now sets the adult's
   `infant_passenger_id` to the infant's passenger id (first infant ↔ first adult, second ↔
   second), because Duffel refuses an order with infants that does not. The role comes from the
   **offer's** passenger type first (it is what the fare was priced for) and the form's label only
   as a fallback; an infant with no adult left is left unlinked for Duffel to refuse in its own
   words. `placeDuffelOrder`'s same-itinerary refresh path re-maps `infant_passenger_id` onto the
   fresh offer's ids too.
2. **`book` checks the traveller count.** The route passes the request body through unchecked, so a
   wrong list used to open a hold on the card and only be refused at confirm. It now refuses
   `400 INVALID_PASSENGERS` ("This fare is for N travellers") when the count differs from what the
   offer was priced for, and tolerates a missing `contact`.

These belong with the web form's infant handling (already present: `INF` rows and the infant date
band) and should be committed with their tests.

---

## 14. Known gaps

Ordered roughly by how much they matter. The first three were found by reading the code while
writing this document; none has been exercised.

1. **What the web checkout shows is not what the card is authorised for.** The flight summary and
   the Pay button render `totalAmount` from the URL — the *supplier* fare returned by search
   (after revalidate), with no markup — while `book` prices `fare + 7.2% + $4.40` (capped at 12%)
   and authorises that. For a $300 USD fare the card is held for $326.00 and the page says $300. The
   reference document notes the pay button "shows the search price"; the size of the difference is
   the markup. The fix belongs in `book`'s response (return the charged total and currency) and the
   page (render it), the way the hotel checkout renders the server's `display` block.
2. **`book`'s own price check is dormant for the web.** Check 10 in [§7.1](#71-checks-in-order) compares the fresh fare
   with `confirmedPrice`, or with the offer the browser sent. The web checkout sends neither — only
   `offerId` — so there is nothing to compare, and the authorisation is opened at whatever Duffel
   now says. Revalidate on the results page is the only pre-card price gate the web has. Passing
   `confirmedPrice` (the price on screen, in the fare's currency) would arm it.
3. **`poll-pending-tickets` looks for `status = 'booked'`; the lifecycle writes `ticketed` or
   `awaiting_ticket`.** So the poller cannot pick up an `awaiting_ticket` booking; it depends on
   Duffel's `order.updated` webhook to reach `ticketed`. If that webhook is missed, the traveller
   stays on "ticket to follow" with nothing to catch it. (The cron's comment says it is "the only
   one that catches a webhook we never received".)
4. **Not run against real services.** See [§12.4](#124-not-done). Everything above is correct *as far as the
   stubs and a scratch Postgres can tell*.
5. **`NEEDS_REVIEW` is settled by hand.** There is no admin action; the reference document lists the
   SQL and the steps per `failureCode`. A person must record an `admin` event and move the state.
6. **The Stripe webhook waits for completion**, and a Duffel order can take up to 130 s — longer
   than Stripe waits. A retried event loses the claim and is answered from the record; it cannot
   order twice. Same for hotels.
7. **`offer_replaced` after the card is a refusal.** Duffel would substitute the same flight only
   if seats/bags are chosen again, which can't happen after the card. A rise within tolerance after
   the card is absorbed, not charged.
8. **The web currency is the fare's currency.** The app sends `currency`; `book` reads
   `displayCurrency`. Flights are therefore charged in the fare's currency. Predates this work.
9. **No seat or bag picker in the web checkout**, though `bags` / `seat-map` and the pricing of
   chosen services exist.
10. **`hotel-booking-sweep` is not scheduled** in the crontab (the flight one is). That is the
    hotel flow's open item.
11. **Mobile shows `BOOKING_PROCESSING` as "Booking Failed".** Small change in the mobile repo.
12. **Cancellation hasn't had the lifecycle treatment** (§9.5).
13. **Mystifly** is dead code kept for a later re-enable.
14. **Pre-release shims to delete later:** `confirmPreOrdered`, and the `duffel_pre_order_*`
    columns.

---

## 15. Appendices

### 15.1 File map

**API — `cheapestgo-api-v2-nearby`**

| Area | File |
|---|---|
| Routes | `src/routes/flights.route.ts`, `mobile.route.ts`, `webhooks.route.ts`, `cron.route.ts`, `internal.route.ts` |
| Controller | `src/controllers/flights.controller.ts` |
| Services | `src/services/flights.service.ts` (search, book, confirm, status, bags, seats, cancel, calendar), `flightBookingLifecycle.service.ts`, `flightBookingCompletion.ts` |
| Repositories | `src/repositories/flights.repository.ts`, `flightBookingLifecycle.repository.ts` |
| Duffel | `src/lib/flights/duffel.ts` (search, offer, order, cancel, normalisation) |
| Search | `search.ts`, `searchBudget.ts` |
| Offer & order helpers | `offerItineraryMatch.ts`, `orderPassengers.ts`, `orderTotal.ts`, `duffelIdentityDocuments.ts`, `duffelOrderReconcile.ts`, `duffelOrderSegments.ts`, `duffelTickets.ts`, `awaitBookingRow.ts`, `revalidate.ts` |
| State machine | `src/lib/flights/lifecycle/stateMachine.ts` |
| Money | `src/lib/pricing.ts`, `src/lib/payments/{convertStrict,fxLock,chargeBase,stripeFee}.ts` |
| Email | `src/lib/email/flightConfirmation.ts` |
| Migration | `db/migrations/20261016000001_flight_booking_lifecycle.sql` |
| Cron | `docker/cron/crontab` |
| Docs | `docs/flight-booking-flow.md`, `docs/booking-flow.md` (hotel twin), `CONTEXT.md` |

**Web app — `cheapestgo-app-v2-nearby`**

| Area | File |
|---|---|
| Search page | `src/app/[locale]/flights/search/{page,flight-search-client}.tsx` |
| Results & filters | `src/features/flights/components/{flight-results,flight-card,flight-filters}.tsx`, `lib/filter-offers.ts` |
| Redirects | `flights/book/page.tsx` → `/checkout`, `flights/[slug]/page.tsx` → search |
| Checkout | `src/app/[locale]/checkout/page.tsx` |
| Checkout helpers | `features/checkout/lib/{flight-confirm-errors,flight-date-bounds,country-options,palette}.ts`, `features/flights/lib/flight-checkout-query.ts` |
| Checkout UI | `features/checkout/components/{booking-state-panels,flight-confirmed-screen,date-field,select-field,autocomplete-select-field,picker-panel}.tsx`, `hooks/use-flight-offer.ts` |
| Trips | `src/app/[locale]/trips/components/{FlightBookingCard,CancellationModal}.tsx` |
| Cleanup | `src/shared/lib/bookingInProgress.ts` |
| Plan | `docs/superpowers/plans/2026-10-16-flight-booking-money-safety.md` |

### 15.2 Time budgets

| What | Value | Where |
|---|---|---|
| One Duffel search attempt | 12 s | `PROVIDER_ATTEMPT_TIMEOUT_MS` |
| Retry backoff | 2 s, once | `PROVIDER_RETRY_BACKOFF_MS` |
| Orchestrator ceiling on a provider | 29 s | `PROVIDER_CEILING_MS` |
| Web search: "slow" / hard abort | 15 s / 45 s | `flight-search-client.tsx` |
| Offer fetch / Price Action | 12 s / 10 s | `getDuffelOffer` / `placeDuffelOrder` |
| Order creation | 130 s | `ORDER_CREATE_TIMEOUT_MS` |
| Order-list read-back | 20 s | `findOrderFromTimedOutAttempt` |
| Loser waits for the winner | up to 20 s, poll 500 ms | `settleTimeoutMs` |
| Capture retry delay | 750 ms | `captureRetryMs` |
| Session expiry | 30 min | `openPayment` |
| Duffel offer lifetime | ≈ 20–30 min | Duffel |
| Sweeper: unpaid / authorised-but-unfinished | 2 h / 30 min | `PENDING_TTL_MS` / `AUTHORISED_TTL_MS` |
| Sweeper: raise attention after | 15 min | `ATTENTION_AFTER_MS` |

### 15.3 Environment

| Variable | Meaning |
|---|---|
| `DUFFEL_ACCESS_TOKEN` | Duffel API; a `duffel_test_` prefix selects sandbox behaviour (tolerance 10.00, sandbox cancel mocks) |
| `DUFFEL_WEBHOOK_SECRET` | HMAC secret for `/webhooks/flight-supplier` |
| `DUFFEL_BALANCE_CHECK` | `on` enables the pre-booking balance guard (off by default) |
| `DUFFEL_BALANCE_ALERT_THRESHOLD` | Low-balance alert level for the cron (default 500) |
| `FLIGHT_PRICE_TOLERANCE` | Overrides the tolerance (0.50 live / 10.00 sandbox) |
| `FLIGHT_MARKUP_PERCENTAGE`, `FLIGHT_MARKUP_FLAT_USD`, `MARKUP_CAP` | The markup (0.072 / 4.40 / 0.12); rates clamped to [0, 0.5], flat to [0, 50] USD |
| `STRIPE_RATE`, `STRIPE_FLAT_FEE` | Stripe's measured fee (0.044 / 0.30) — inputs to the markup model; change none in isolation |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature |
| `CRON_SECRET` | Bearer token the crontab sends |
| `MOBILE_API_KEY`, `MOBILE_GUEST_USER_ID` | Mobile auth and guest attribution |
| `BRAND_NAME` | Stamped on the sale as `source_brand` |

### 15.4 Extending it

- **Slice 2 — a `FlightProvider` seam and mock**, mirroring `src/lib/hotels/providers/`. Today
  `FlightBookingLifecycleService` imports `placeDuffelOrder` and `getDuffelOffer` directly; the seam
  would put them behind an interface so a mock can drive the scenarios (expired, price-up, timeout,
  capture failure) that currently need stubs.
- **Slice 3 — a flight cancel preview**, mirroring `src/lib/policies/cancelPreview.ts`: what
  cancelling returns *before* the guest commits.
- **Closing §14.1–14.3** is the highest-value work that needs no new infrastructure.
- **A real sandbox run** (§12.4) is what turns "tested against stubs" into "verified".

### 15.5 Reading order for a newcomer

1. [§1](#1-the-feature-in-one-page) and [§2](#2-design-decisions-that-shape-everything) of this document.
2. `docs/flight-booking-flow.md` §1–4 (the outcome table is the heart of it).
3. `src/lib/flights/lifecycle/stateMachine.ts` (87 lines), then `flightBookingLifecycle.service.ts`
   top to bottom — the header comment is the specification.
4. `src/services/flights.service.ts` `book` → `openPayment` → `confirm`.
5. `placeDuffelOrder` in `duffel.ts`, once you have read why it is defensive.
6. The app: `flight-confirm-errors.ts`, then `handleFlightSubmit` / `handleFlightPaid` in the
   checkout page.
7. `src/__tests__/flightLifecycle.service.test.ts` — one test per row of the outcome table, and the
   fastest way to see what each failure looks like.
