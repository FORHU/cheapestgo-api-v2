# CheapestGo API v2 — Domain Glossary

The backend for v2. Express, mounted at `/api/v2`, on EC2, reading the same PostgreSQL database as v1 until cutover ([ADR-0014](../cheapest-go-app/docs/adr/0014-v2-reads-v1s-schema-until-cutover.md)). It owns **all** domain logic for v2 — app-v2 is a frontend and holds none ([ADR-0017](../cheapest-go-app/docs/adr/0017-api-v2-owns-all-domain-logic.md)).

## The Layer Contract

Work arrives as `Route → Controller → Service → Repository`, and each layer may only call the one below it. A capability ported from v1 is not done until it lands in these layers; landing inline in a route file does not count.

**Route** — an HTTP endpoint in `src/routes/*.route.ts`. Declares method, path, middleware and validation, then delegates. It knows about HTTP and nothing else.
_Avoid_: business rules, SQL, or supplier calls in a route file — a route that queries the database directly is the defect this contract exists to prevent.

**Controller** — a handler in `src/controllers/`. Translates an HTTP request into a service call and the result back into a response, including status codes.
_Avoid_: putting decisions in a controller — if it branches on anything but request shape, that branch belongs in a service.

**Service** — the business logic in `src/services/`. Enforces the rules: what a booking may do, when a quote expires, which provider handles a cancellation. It is the only layer that should be interesting to read.
_Avoid_: HTTP objects (`req`, `res`) in a service — a service must be callable from a cron or a script with no request in sight.

**Repository** — data access in `src/repositories/`. Owns queries and the mapping between rows and domain types.
_Avoid_: business rules in a repository, and raw queries anywhere else.

**Provider Client** — a supplier integration in `src/lib/` (`flights/duffel`, `flights/mystifly`, `hotels/travelgatex`, `google`, `payments`, `stripe`). Speaks the supplier's protocol and returns domain types. Holds the credentials.
_Avoid_: calling a supplier from anywhere but a service, and letting a supplier's response shape escape into the rest of the codebase.

**Definitive Refusal** — a supplier answer that settles the matter, as against one that only describes this moment. The distinction is the whole point of `HotelProviderErrorCode`: `SOLD_OUT` reaches the traveller as "this is gone, trying again cannot help", while `UNAVAILABLE` reaches them as "nothing is wrong with you, try again in a moment". The storefront routes them to different screens, only one of which offers a retry.
_Avoid_: reporting an empty availability answer as definitive. A sold-out room and a supplier that has stopped serving availability are indistinguishable from the call site, and the supplier does the latter intermittently across every hotel and every date — so the definitive reading strands a traveller on a checkout they had already filled in, where the undefinitive one usually succeeds seconds later.
_Avoid_: assuming one answer settles it either way. Prebook re-asks before concluding anything, because the supplier's silence is typically shorter than the retry.

## Layer Debt

The contract is currently honoured by four capabilities — auth, bookings, flights, hotels — and broken elsewhere: 23 route files exist against 4 controllers, 4 services and 4 repositories, and roughly 143 raw database call sites sit directly in route files. The worst are `admin.route.ts` (37), `cron.route.ts` (30) and `internal.route.ts` (22, including a ~400-line create-booking handler).

This is paid down **as a slice touches it**, not as a separate cleanup: whichever slice ports a capability also lifts that capability's route out of the route file. See [port-status.md](../cheapest-go-app/docs/port-status.md).
_Avoid_: treating layer debt as a refactor to schedule later — the Feature Port is about to add a great deal of logic, and inline is where it will land by default.

## Internal Route

An endpoint under `/internal/*`, authenticated by a shared secret rather than a user session, called by crons and by the app's own server-side work. It is a transport, not a place for logic: the logic behind it belongs in a service that a cron can call directly.
_Avoid_: reaching internal routes over HTTP from within this process — see [ADR-0012](../cheapest-go-app/docs/adr/0012-internal-routes-are-called-in-process.md).

## Golf Course

A course CheapestGo can arrange play at, curated by the team in the admin. There is no supplier behind it: a course exists because someone typed it in, and a customer sees it only once it is published — a draft is as absent from the storefront as a slug that never existed. Its **green fee from** is a guide per player in the course's own currency, restated in the viewer's Display Currency by `GolfService`. A course with tee times is booked from its page (see Golf Booking); one without has the support chat as its one action. A party is offered tee times a round apart, and a round takes longer the bigger the party: from 2.5 hours for one player to 4 for four, half that on a nine-hole course. So the times listed change with the players selected, and a time listed for one party size may not be bookable by another.
_Avoid_: calling the green fee a price or a quote — nothing is charged from it, and checkout will quote its own.

## Golf Booking

A customer's request to play a tee time, paid for but not final until the team has checked with the course — our tee times are not the course's own tee sheet. Checkout **holds** the spots for 15 minutes and authorises the card (manual capture), which makes it a **request**; the team then **confirms** it (the card is charged) or **declines** it (the card is released, never charged), by the earlier of 48 hours after the request and 2 hours before the tee time. A hold that runs out **expires** and a request nobody answers is declined, by `GolfBookingsService.sweep`; both give their spots back. A customer can **cancel**: a request releases the card, and a confirmed booking is refunded in full, fee included, until the course's free-cancellation deadline (written on the booking when it is made), after which it is a matter for support. The team can cancel a confirmed booking at any time, with a full refund. The customer is emailed at each step and sees the booking in My Bookings; the team is emailed about each new request, again as its deadline nears, and when one lapses. Priced by the course in its currency and charged in the customer's through `quoteGolf`, the same function the course page's prices come from.

A booking can carry **extras** — club rental, a caddie, a cart, a golf lesson or a bucket of range balls — up to one of each per player, at a price per item the course sets; a course offers only what it has a price for. Their prices lock at the hold, so changing them means a new hold, and the service fee is charged on green fee plus extras. The team arranges them with the course when it confirms; there is no stock to run out of.
_Avoid_: calling a requested booking confirmed — the customer has not been charged and the course has not agreed.

## Payment
One attempt to take money — a Stripe PaymentIntent — and the grain the back office counts in. Not
the same thing as a **Booking**: one booking may carry several payments where the first was
abandoned or declined, and a payment may carry no booking at all. That last case is the one worth
having the word for, because a payment with no booking is a guest who has paid for a stay nobody
can see ([ADR-0026](../cheapest-go-app/docs/adr/0026-the-supplier-owns-reservation-state-and-divergence-is-derived.md)
calls it an *Unrecorded Reservation*), and it only exists as a row in Stripe.
_Avoid_: counting payments per booking. A booking-shaped view cannot represent a payment that
never became one, which is the failure the back office exists to find.
_Avoid_: reading a payment's status as the booking's. The money and the reservation move
independently: captured with no ticket issued is normal for a few minutes and a defect after an
hour, and a view that collapses them cannot tell those apart.
_Avoid_: totalling payments from this Stripe account without scoping them. FORHU settles several
products into it under one pooled payout, so an unscoped total is other products' money as well
as ours — and for the same reason a **per-product payout** cannot be derived at all.

## Cancellation
Ending a reservation that was made. Not the same act as a **Refund**: a cancellation decides
whether money comes back and how much, but the two part company often enough to need separate
words — a supplier can refuse a cancellation after the card has already been refunded, and a
non-refundable stay can be cancelled with nothing returned at all. How much comes back is read
from the policy snapshot taken when the booking was made, never from what the supplier would
quote today ([ADR-0023](../cheapest-go-app/docs/adr/0023-a-cancellation-refunds-what-the-recorded-terms-allow.md)).
A customer cancels their own booking and the team cancels on a customer's behalf; both travel the
same path, so one policy decides both and one record describes both. A cancellation the supplier
never answers is not a failed cancellation — the reservation may well be gone.
_Avoid_: treating "cancelled" as one state. Cancelled-and-refunded, cancelled-with-a-penalty and
cancelled-but-the-refund-failed are three different answers to "where is my money", and a view
that prints one word cannot tell a customer which of them they got.
_Avoid_: calling a cancellation by the team an override. The policy binds the team too; an
override is the separate, deliberate act of returning more than the policy allows.

## Refund
Money going back to the card. Stripe is the only authority on whether it happened; our own refund
record holds what Stripe cannot know — who asked for it, under which policy, and what was refused.
A refund **issued** is not a refund **settled**: Stripe reports it pending until the card network
completes it, which takes days, and the customer is asking about the second one. A **Refund
Override** is a refund larger than the policy allows, granted by the team and recorded as an
override against the admin who granted it, because on a non-refundable stay the supplier still
bills us and that difference is a decision somebody made, not an accident.
_Avoid_: inferring a refund from a booking's status. Most of the paths that move money write no
refund record at all, so a booking reading `cancelled` may have refunded in full, in part, or not
at all.
_Avoid_: using "refunded" for a released authorisation. A hold that is voided was never captured:
no money left the customer, and nothing appears on their statement for them to look for.

## Evidence Provenance
How a fact in an evidence pack came to be known, which the pack states beside every fact rather
than presenting them all as equally true. Four kinds: **re-verified** (asked of the provider at
the moment of export), **provider-recorded** (what the provider told us at the time, with that
time), **internally-recorded** (our own row), and **unavailable** (looked for, not found).
_Avoid_: asserting that a service was delivered. The pack is read by a card network and the
platform is not in a position to know: a hotel reservation can be cancelled in the supplier's own
dashboard and leave no trace here, so our record saying `confirmed` is evidence of what we were
told, never of what happened.
_Avoid_: labelling a hotel fact *re-verified*. TravelgateX exposes no booking-read — search,
quote, book and cancel only — so a hotel booking cannot be re-read at export. Flights can, through
Duffel's order endpoint, and the asymmetry belongs on the document.
