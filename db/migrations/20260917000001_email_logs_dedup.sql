-- One confirmation per booking, enforced by the database.
--
-- Every send path already reads email_logs first and skips a type it has already recorded for
-- a booking, and v1's code has a comment claiming a unique index backs that read up. No such
-- index exists — not on v1's database and not on v2's. The read is therefore the only guard,
-- and it races: the checkout call, the Stripe webhook and the recovery cron can all confirm
-- the same booking, and two of them can pass the read before either writes.
--
-- Partial, on purpose. A 'failed' row is not a delivery, and a booking may legitimately
-- collect several of those before one succeeds — only 'sent' and 'queued' mean the customer
-- has been told, or is about to be.
--
-- A booking can still receive different types: 'awaiting_ticket' when the PNR exists and
-- 'ticketed' when the documents are issued are two different messages, and both are owed.
--
-- **Enforced from 2026-09-17 onward, not retroactively.** Live already holds one pair the
-- index would reject: FORHU-1786604066125-XNI3K, two confirmations sent 50ms apart on
-- 2026-08-13 — the race above, caught in production, from the client-side send v1 removed in
-- 8cb2f27b. Both emails really went out, so both rows are true. Deleting one would erase the
-- record of a message a person received, and marking one 'failed' would be false and would
-- hand it to the retry job to send a third time. History stays as it happened; the guard
-- applies to everything written after it exists.
--
-- Applied by hand (see the migrations note in the project memory). Pipe in only the up
-- section — the down section below drops the index, so running the whole file undoes itself.

-- migrate:up
CREATE UNIQUE INDEX IF NOT EXISTS email_logs_booking_type_unsent_uniq
    ON public.email_logs (booking_id, email_type)
    WHERE booking_id IS NOT NULL
      AND status IN ('sent', 'queued')
      AND created_at >= '2026-09-17 00:00:00+00';

-- migrate:down
DROP INDEX IF EXISTS public.email_logs_booking_type_unsent_uniq;
