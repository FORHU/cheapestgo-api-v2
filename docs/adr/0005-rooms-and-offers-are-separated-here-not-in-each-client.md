# ADR 0005 — Rooms and Offers Are Separated Here, Not in Each Client

**Date:** 2026-11-12
**Status:** Accepted

## Context

A supplier prices a *rate*, not a room. TGX returns one line per board arrangement and
cancellation term, and hangs the bed, the room's features and the offer's terms in parentheses on
the room name rather than in fields — more than one of them at a time. Deciding which lines are
the same physical room, and which of its prices are the same promise, is therefore a judgement
about what the traveller is buying.

[ADR-0007 in the web repo](../../cheapestgo-app-v2/docs/adr/0007-a-room-card-is-one-room-and-its-offers-are-its-terms.md)
made that judgement, measured against 24 live Seoul properties: a card is a **Room**, the options
inside it are **Offers**, and the three kinds of parenthetical are told apart — bed configuration
and room features are identity, `bed type is subject to availability` is a term.

It was implemented in the browser. `room-selection.tsx` took the grouped rooms this API returns,
flattened them back to rate lines, applied the identity rules, regrouped, and dropped Offers that
promised the same thing at a higher price. This API meanwhile grouped on the raw supplier name,
which is the behaviour the ADR exists to correct — so the endpoint's own answer was known to be
wrong and the client was quietly fixing it.

Two things made that untenable:

- The rules are domain logic and this service owns domain logic
  ([ADR-0017](../../cheapest-go-app/docs/adr/0017-api-v2-owns-all-domain-logic.md)). A second
  client — the Flutter app, issue #40 — was about to implement them again in Dart. Two
  implementations of "which room is this" disagree eventually, and the failure sells someone a
  shared bathroom they did not choose.
- This repository already had both pieces and used neither. `roomNames.ts` held the name rules
  and `roomGrouping.ts` the grouping, each with tests, each unreferenced outside its test; the
  property service called a simpler grouper in `property.ts`.

## Decision

**The property endpoint returns Rooms with their Offers, already separated.** `groupRoomsByName`
is the one implementation: it keys a Room on `splitRoomName`'s heading, carries the bed and any
offer qualifiers on each Offer, and keeps one Offer per term signature —
`board × refundability × cancellation deadline × bed × qualifiers`, price excluded.

**A superseded Offer is dropped from the response and written to the log.** Where two Offers
promise the same thing, the dearer is strictly worse and no client should have to decide that for
itself. What the supplier quoted is still recoverable from `[rooms] superseded offers dropped`,
which names the room, both offer ids and both prices.

This supersedes the rule `roomGrouping.ts` carried before, which keyed Offers on price so that two
look-alikes at different prices both survived. The worry behind it was real — the dearer of two is
usually the one with the later cancellation deadline — and it is answered by putting the deadline
in the signature: that Offer is now kept because its terms differ, not because it costs more.

## Considered Options

Leaving the rules in each client was rejected: it is the status quo, and it was about to be
duplicated a second time with no mechanism to keep the copies honest.

Returning every Offer with its signature attached, for clients to filter, was rejected for the
same reason one level down. Two clients that must agree on what is buyable should not each be
handed a list and trusted to filter it identically.

Keeping `property.ts`'s grouper and teaching it the rules was rejected because it would leave two
groupers in this repository, which is how the wrong one came to be wired in the first place.

## Consequences

app-v2 needs no change: it receives correctly separated rooms and its own regrouping becomes a
no-op over them. That regrouping should be deleted in a later change — until it is, the rules
exist in two places still, with this one authoritative.

The Flutter app consumes `rooms[].rates[]` directly and implements none of this.

A client can no longer see every price a supplier quoted. That is deliberate, and the log is where
a support question about a price nobody was shown gets answered.

Widening `OFFER_QUALIFIERS` is now a change in one repository rather than two. The symptom that
calls for it is unchanged: a pair of cards a reader cannot tell apart.
