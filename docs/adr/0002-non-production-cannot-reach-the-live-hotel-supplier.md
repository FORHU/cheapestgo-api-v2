# ADR 0002 — Non-Production Cannot Reach the Live Hotel Supplier

**Date:** 2026-11-03
**Status:** Accepted

## Context

On 2026-11-03 a developer running the checkout on their own machine created a real reservation at a
real hotel: OTV `31489968`, Shiki Shiki Higashiyama, Kyoto, 28–30 October 2026, 8,557 PHP, payment due
9 November, no free cancellation. Nothing in production recorded it — no row in `bookings`, nothing in
`supplier_booking_attempts` — because the sale was written to that laptop's own Postgres.

The cause is an asymmetry between two suppliers that the booking path cannot see:

- **TravelgateX has no sandbox**, and this codebase has no dry-run flag. The supplier is live wherever
  its credentials are present. The local `.env` held them.
- **Stripe does have a sandbox**, and the same `.env` held `sk_test`. A test card authorises *and
  captures* exactly as a real one does.

So the booking path saw an authorised payment and called a live supplier, which is precisely what it is
built to do. An audit of that path found no defect: the PaymentIntent is created with
`capture_method: 'manual'` and no `confirm`, `payment_method` or `customer`; `provider.book` is reachable
from one place only, behind `pi.status !== 'requires_capture'`; the webhook fires on
`amount_capturable_updated`, which Stripe emits only after a real authorisation; and there is no
`SKIP_PAYMENT`, `DRY_RUN` or `NODE_ENV` bypass in either repository. Every guard held. They guard money,
and the thing at risk was a hotel reservation.

OTV have separately asked us not to make test bookings, so the cost here is contractual as well as
financial.

## Decision

**A process that is not production refuses to start with `HOTEL_PROVIDER=travelgatex`**, unless
`ALLOW_LIVE_HOTEL_PROVIDER=true` is set deliberately. This is the mirror of the rule already in
`config.ts`, which refuses `HOTEL_PROVIDER=mock` in production: production must not fake the supplier,
and development must not use the real one.

The check lives at config load rather than at book time, because a process that cannot reach the
supplier cannot book through any route — not a stray script, a replayed webhook, or a confirm re-sent
by hand.

`NODE_ENV=test` is exempt. vitest sets it, the suite stubs the provider, and exiting the process
mid-run is a worse outcome than the risk it would remove: a CI box has no credentials to protect.

`TRAVELGATEX_*` was removed from both local `.env` files the same day, so the override has nothing to
act on by default.

## Alternatives considered

**Capture the payment before booking, instead of booking on an authorisation.** This was the first
instinct — money in hand before incurring supplier liability — and it does not work. Stripe test mode
simulates capture as readily as authorisation, so the Kyoto room would have been booked regardless. It
also inverts the failure mode: today a supplier failure after authorisation releases a hold and the
traveller is never charged, while capture-first leaves us holding their money and owing a refund. For
hotels, where `SOLD_OUT` at book time is routine, that trade is clearly worse.

**Refuse to book when `pi.livemode` is false.** Cheap, and it sits in the booking path where the damage
happens. Rejected because it guards the wrong thing: it describes the money, while the exposure is which
supplier account we are talking to. It would also have to be reasoned about again the next time a
supplier is added.

**Configuration discipline alone** — strip the credentials, tell everyone to run `HOTEL_PROVIDER=mock`.
Done as well, but not relied upon. This incident is what a convention failing looks like.

## Consequences

Running the real hotel supplier locally now takes a deliberate `ALLOW_LIVE_HOTEL_PROVIDER=true` and
credentials that are no longer in the repo. Anyone developing hotel flows uses `MockHotelProvider`,
which means the mock has to stay good enough to develop against — it carries scenarios
(`MOCK_HOTEL_SCENARIO`) for this reason, and gaps in it are now blocking rather than inconvenient.

`NODE_ENV` cannot distinguish the dev host from production in this estate: `deploy-dev.yml` writes
`NODE_ENV=production` into the dev container too. The guard's real scope is therefore developer
machines, which is where the incident happened. The dev host is covered by a different mechanism — the
deploy workflow deliberately never publishes `TRAVELGATEX_*`, `ETG_*`, `ONDA_*` or `OTV_*` to it — and
that omission is now load-bearing rather than merely prudent. Removing it would reopen this hole.

A supplier added later with no sandbox inherits none of this automatically. The rule is about
TravelgateX by name; the next one needs its own line.
