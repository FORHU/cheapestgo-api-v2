# ADR 0003 — The Payment Back Office Derives Its View, and Asserts Nothing About Delivery

**Date:** 2026-11-09
**Status:** Accepted

## Context

Support cannot currently answer "what happened to this customer's money" from one place. The facts
exist, but scattered: `bookings`, `hotel_bookings`, `flight_bookings`, `hotel_booking_payments`,
`booking_financial_events` (which keys to flights only), `refund_logs`, `supplier_booking_attempts`,
`email_logs`, `booking_policy_snapshots`, `stripe_processed_events` — and Stripe. Answering one
question today means opening several of those by hand, which is how PHP 21,709.36 of refunds sat
untraced and how three booking-record gaps were found in a single afternoon.

An audit on 2026-11-09 found that roughly two-thirds of what a payment back office needs is already
built and merely has no interface over it:

- **Webhook idempotency is solved.** `stripe_processed_events` claims each event as a row and
  distinguishes a completed duplicate from a delivery that died part-way. What it does not keep is
  anything to diagnose with: five columns, no payload, no error, no booking link.
- **Admin refunds exist**, full-amount, audited against the admin who asked
  (`adminStripe.service.refundBooking`). Partial refunds are modelled in `refund_logs`
  (`requested_amount` against `approved_amount`) but not exposed.
- **Server-side PDF and secure storage exist** — `@react-pdf/renderer`, `InvoicePdfDocument`,
  `attachmentStorage.putObject` and `signedUrlFor` with an expiry.
- **Multi-currency is handled.** `unified_bookings` records `fx_rate`, `fx_source`,
  `fx_captured_at` and a USD amount beside the charged one.

Genuinely absent: disputes, evidence records, and any notion of a **Payment** as a thing in its own
right. There is no `payments` table; payment facts hang off whichever booking table owns the
product.

## Decision

**1. The back office reads. It does not add a payments table.**

The view is derived by joining what already exists, keyed on the Stripe PaymentIntent — the five
tables that carry `payment_intent_id` are `booking_sessions`, `bookings`, `flight_bookings`,
`hotel_bookings` and `hotel_booking_payments`. A payments table would mean dual-writing from live
checkout in every product path and backfilling a history whose older rows cannot reconstruct it.
This extends rather than invents: [ADR-0026](../../../cheapest-go-app/docs/adr/0026-the-supplier-owns-reservation-state-and-divergence-is-derived.md)
already settled that a divergence between two records we hold is computed on read, because storing
it creates a third record that can disagree with both.

Only three things are added, and none of them touch an existing write path: a dispute table, an
evidence table, and more columns on `stripe_processed_events`.

**2. The grain is the payment, not the booking.**

A booking-shaped view cannot represent a payment that never became a booking, and that is the case
worth finding. ADR-0026 names it an Unrecorded Reservation and locates it only in Stripe, matched on
`metadata.bookingReference` **and** `bookings.payment_intent_id` — one key alone produced seven
false positives against one real finding.

**3. Every fact in an evidence pack carries its provenance, and the pack asserts no delivery.**

Four kinds, defined in CONTEXT.md: re-verified, provider-recorded, internally-recorded, unavailable.
A flight is re-verified live through Duffel's order endpoint. A hotel cannot be: TravelgateX exposes
`searchHotels`, `getHotelDetails`, `getRates`, `prebook`, `book` and `cancelBooking`, and no
booking-read. So a hotel fact is provider-recorded at best, and the document says so.

Nothing in a pack states that a stay happened or a passenger flew. ADR-0026 records that a
reservation cancelled in the supplier's own dashboard leaves no trace here and is **not detected**,
so a stored `confirmed` is evidence of what we were told and not of what occurred.

## Alternatives considered

**A real `payments` table.** Cleanest to index for a filtered, sorted, paginated table, and the
obvious reading of the brief. Rejected because it requires editing the live write path in both
products and both webhook handlers to dual-write, for a view that can be derived — and because the
backfill cannot reconstruct what older rows never recorded. Revisit only if the join cannot hold up
under real volume, and then as a projection maintained by the existing event writers rather than as
a new source of truth.

**Re-read every supplier at export, and refuse to produce a pack otherwise.** The strongest possible
evidence, every claim current at the moment of export. Impossible today for hotels, which are the
bulk of the volume, and the result would be no hotel evidence at all rather than honest hotel
evidence.

**Cite the stored booking status as confirmation.** What the data already says, and what a reader
expects. Rejected: it states as settled fact something ADR-0026 documents as a cache that can be
silently wrong, and the reader is a card network.

## Consequences

- **Unmatched payments require Stripe, not just the database**, and the scan must be scoped by
  `metadata.type`. FORHU settles several products into this Stripe account under one pooled payout,
  so an unscoped scan reports other products' charges as ours. For the same reason a **per-product
  payout or settlement figure cannot be derived at all** — any financial report must stop at
  captured amounts and say why.
- **The reconciler must assert its Stripe account before running** (`STRIPE_EXPECTED_ACCOUNT`),
  for ADR-0026's reason: a live database paired with a test key marks every real payment as
  orphaned.
- **`booking_financial_events` keys to `flight_bookings` only.** The timeline for hotels is built
  from `hotel_booking_events` and `supplier_booking_attempts` instead, so the two products' event
  histories are assembled differently and will not be equally complete until that is reconciled.
- **The staff host is a prerequisite, not a nicety.** `staff.cheapestgo.com` currently returns none
  of the headers [ADR-0006](../../../cheapestgo-app-v2/docs/adr/0006-the-staff-host-is-a-security-boundary.md)
  requires — no HSTS, CSP, frame-options, nosniff or referrer policy — while `cheapestgo.com/admin`
  returns all of them. This feature puts passenger names, card metadata and evidence documents on
  that host.
- **Hotel evidence will read as weaker than flight evidence**, because it is. The remedy is a
  TravelgateX booking-read, which does not exist; until it does, the asymmetry is stated on the
  document rather than papered over.

## Amendment, 2026-11-10 — one row is one payment

The first build listed a row per internal record and marked any PaymentIntent that appeared more
than once as a duplicate, on the reasoning that a payment recorded twice is a double-write
announcing itself.

That reasoning was wrong, and testing found it within a day. A hotel booking is held in two tables
**by design**: `hotel_bookings` is the attempt and `bookings` is the sale it became
(db/migrations/20261015000001_hotel_booking_lifecycle.sql — "the workflow of a hotel booking
attempt, beside the sale it may become"). So every healthy stay appeared twice, each row carrying
a warning. A warning that fires on every correct row is one nobody reads, which is the failure
this ADR was written to prevent rather than to cause — and it would have buried the genuine case
among rows that are merely normal.

It also contradicted this decision's own grain. **Payment** in CONTEXT.md is one Stripe
PaymentIntent, and the back office counts in payments; a row per record counts in records, which
is the booking-shaped view the glossary warns against.

**One row is one PaymentIntent.** Grouped in the database, not after fetching, so a page of 25 is
25 payments and the total counts payments. The records behind each one travel with it and are
listed on the row, so nothing is hidden: a reader still sees that a stay is held in two places,
and sees it as detail rather than as an alarm.

**A warning now means a disagreement the ordinary pair cannot produce** — two different booking
references against one payment, or two records from the same table. Those remain findings, and
they are now visible because they are no longer surrounded by false ones.

Unchanged: the view is still derived, there is still no `payments` table, and nothing here asserts
that a service was delivered.
