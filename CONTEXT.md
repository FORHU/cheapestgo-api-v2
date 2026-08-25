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

## Layer Debt

The contract is currently honoured by four capabilities — auth, bookings, flights, hotels — and broken elsewhere: 23 route files exist against 4 controllers, 4 services and 4 repositories, and roughly 143 raw database call sites sit directly in route files. The worst are `admin.route.ts` (37), `cron.route.ts` (30) and `internal.route.ts` (22, including a ~400-line create-booking handler).

This is paid down **as a slice touches it**, not as a separate cleanup: whichever slice ports a capability also lifts that capability's route out of the route file. See [port-status.md](../cheapest-go-app/docs/port-status.md).
_Avoid_: treating layer debt as a refactor to schedule later — the Feature Port is about to add a great deal of logic, and inline is where it will land by default.

## Internal Route

An endpoint under `/internal/*`, authenticated by a shared secret rather than a user session, called by crons and by the app's own server-side work. It is a transport, not a place for logic: the logic behind it belongs in a service that a cron can call directly.
_Avoid_: reaching internal routes over HTTP from within this process — see [ADR-0012](../cheapest-go-app/docs/adr/0012-internal-routes-are-called-in-process.md).
