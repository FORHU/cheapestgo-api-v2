-- migrate:up
-- Make a failed webhook delivery diagnosable.
--
-- `stripe_processed_events` already does the hard part: it claims each event as a row, so two
-- deliveries racing cannot both win, and it distinguishes a completed duplicate from a delivery
-- that died part-way. What it keeps is five columns — event id, type, and two timestamps — so the
-- admin page can say *that* an event never completed and nothing whatever about why.
--
-- These columns are what turns that row into an investigation. All nullable, all defaulted: the
-- webhook path writes them where it can and is never blocked by one of them being absent, because
-- losing an event costs more than losing its diagnosis.
--
-- Additive only. Nothing existing is altered, and re-running this by hand is harmless.

ALTER TABLE stripe_processed_events
    -- Which payment and booking the event was about, so the page can be reached from a customer's
    -- reference rather than only from a Stripe event id nobody has to hand.
    ADD COLUMN IF NOT EXISTS payment_intent_id  text,
    ADD COLUMN IF NOT EXISTS booking_reference  text,
    -- Why it failed. The message only: a Stripe payload can carry customer data, and this table is
    -- read by technical admins who have no business seeing it.
    ADD COLUMN IF NOT EXISTS error_message      text,
    -- How many times Stripe has delivered this event id. Stripe retries the same id, so a count
    -- above one with no `completed_at` is the signature of an event failing repeatedly.
    ADD COLUMN IF NOT EXISTS delivery_count     integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS last_received_at   timestamptz;

-- The page is filtered by what support has: a reference, or "show me what is stuck".
CREATE INDEX IF NOT EXISTS stripe_processed_events_pi_idx
    ON stripe_processed_events (payment_intent_id);
CREATE INDEX IF NOT EXISTS stripe_processed_events_ref_idx
    ON stripe_processed_events (booking_reference);
-- Partial, because the rows worth looking at are the unfinished ones and they are the minority.
CREATE INDEX IF NOT EXISTS stripe_processed_events_unfinished_idx
    ON stripe_processed_events (processed_at DESC)
    WHERE completed_at IS NULL;

-- migrate:down
DROP INDEX IF EXISTS stripe_processed_events_unfinished_idx;
DROP INDEX IF EXISTS stripe_processed_events_ref_idx;
DROP INDEX IF EXISTS stripe_processed_events_pi_idx;

ALTER TABLE stripe_processed_events
    DROP COLUMN IF EXISTS last_received_at,
    DROP COLUMN IF EXISTS delivery_count,
    DROP COLUMN IF EXISTS error_message,
    DROP COLUMN IF EXISTS booking_reference,
    DROP COLUMN IF EXISTS payment_intent_id;
