# ADR 0004 — The Team Cancels Through the Customer's Own Path

**Date:** 2026-11-10
**Status:** Accepted

## Context

A traveller can cancel a hotel or a flight from Trips. Support cannot cancel either one. There is
no control for it anywhere in the admin, for any product except golf.

What exists instead is `POST /admin/stripe`, a refund route that nothing in app-v2 calls — the
admin Stripe page is a read-only mirror of the dashboard. The route has four defects, and they are
the reason this decision is worth recording rather than just fixing. It resolves the booking from
`bookings` alone, so a flight booking returns 404 and always has. It refunds the whole charge,
ignoring the policy snapshot the customer path honours. It passes no idempotency key, where the
hotel path scopes one to the amount. And it writes no refund record and leaves the booking status
untouched, so a refund issued through it is invisible to every screen we have.

Golf went the other way and grew its own admin cancellation, which refunds in full "whatever the
free-cancellation date". That is defensible for a tee time the course can resell. Applied to a
non-refundable hotel room it is a loss the supplier still bills us for, taken by a support agent
who had no way to know.

Underneath that, refunds are recorded in three different shapes: `refund_logs` for a customer's
hotel cancellation, a JSON blob on the booking row for a flight, and nothing at all for golf or
for the admin route. The back office in [ADR-0003](0003-the-payment-back-office-derives-its-view-and-asserts-nothing-about-delivery.md)
reads `refund_logs`, so three of the four ways money leaves are invisible to it.

## Decision

**There is one cancellation path per product, and the team travels it.**

The ownership check that makes `cancelBooking` a customer's operation becomes an actor check. A
customer may cancel their own booking; an admin may cancel anyone's, and which of them did it is
recorded. The policy engine, the supplier call, the refund and the lifecycle transition are the
same code in both cases, so there is one place where a cancellation can be wrong.

**The policy binds the team by default.** A support agent cancelling a non-refundable stay refunds
what the recorded terms allow, exactly as the customer would.

**Returning more than the policy allows is a separate, explicit act.** A refund override is ticked
deliberately, and is written to the refund record as an override carrying the admin's identity.
On a non-refundable stay the supplier still bills us, so the difference is a decision somebody
made; it should read like one.

**Stripe is the authority on whether money moved; our record says who asked and why.** The evidence
pack reads refunds from Stripe directly, which covers every refund ever issued including those made
by hand in the dashboard and the three paths that log nothing. `refund_logs` then grows the writers
it is missing — flights, golf, and the admin route — so intent and policy have a home too.

**`POST /admin/stripe` stays, with no UI.** It is kept for emergency use by hand. It is not wired to
a button, and it is not the path support uses.

## Alternatives considered

**Golf's shape: admin cancel always refunds in full.** One rule, easy to explain, already shipped
once. Rejected because a tee time and a non-refundable hotel room are not the same asset: the
course resells the slot, the hotel bills us anyway. It would make every goodwill refund a silent
loss with nothing recording that anyone chose it.

**Two separate admin controls — "Cancel booking" and "Refund".** More flexible for the odd cases: a
duplicate charge, or a supplier who cancelled on their own. Rejected because it is two money paths
to keep correct forever, and two ways to half-finish a cancellation — refunded but not cancelled,
cancelled but not refunded. The override tick covers the goodwill case inside one path.

**Deleting `POST /admin/stripe`.** Nothing calls it, so deleting breaks nothing, and a second way to
move money that bypasses the policy engine and the audit trail is exactly what ADR-0003 set out to
end. Kept anyway, deliberately, as a manual lever for the case where the booking record itself is
the thing that is broken and the normal path cannot run. The risk is named rather than removed: it
remains a way to refund a customer and leave no trace, and it is only acceptable while it has no
button and writes a refund record.

## Consequences

An admin cancellation is as good as a customer's, because it is the same code — and as bad, which
is the point: a bug in the policy engine now shows up in both, instead of hiding in whichever path
is used less.

Support can no longer refund a non-refundable booking by accident. They can still do it on purpose,
and the record will say so.

Golf keeps its own cancellation for now. Its full-refund rule is correct for tee times; what it
owes this decision is the refund record, not a rewrite.

The flight refund's idempotency key (`refund-${bookingId}`, with no amount in it) is a defect this
decision inherits rather than creates: a corrected amount silently replays the first refund. It is
fixed to match the hotel path's amount-scoped key.
