-- migrate:up
-- The golf emails' types in `email_logs` (CONTEXT.md, "Golf Booking"). Not every database carries this
-- CHECK, so it is widened only where it exists. NOT VALID because it is about the rows written from now
-- on: older rows are history, and a type this list has forgotten must not stop the deploy.
--
-- Re-running it by hand is harmless.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_logs_email_type_check') THEN
        ALTER TABLE email_logs DROP CONSTRAINT email_logs_email_type_check;
        ALTER TABLE email_logs ADD CONSTRAINT email_logs_email_type_check CHECK (email_type = ANY (ARRAY[
            'confirmation', 'ticketed', 'refund', 'cancellation', 'awaiting_ticket', 'price_alert',
            'support_escalation', 'golf_requested', 'golf_confirmed', 'golf_declined', 'golf_cancelled',
            'golf_team_alert'])) NOT VALID;
    END IF;
END $$;

-- migrate:down
-- Nothing to undo: a wider list harms nothing, and narrowing it would refuse rows already written.
SELECT 1;
