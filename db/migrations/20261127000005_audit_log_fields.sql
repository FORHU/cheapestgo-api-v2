-- migrate:up
-- Widening `admin_audit_log` for #118 rather than building a second table: every call site
-- that already writes a row keeps writing one, unchanged, and the fields #118 actually asks
-- for — actor's role, a reason, who and where the request came from, and the before/after of
-- what changed — are additions, not a migration of existing data.
--
-- `details` stays. Ten-odd call sites already pass free-form context there and rewriting all
-- of them to populate `previous_value`/`new_value` is real work, not a schema change — it
-- happens call site by call site as each one is wired for #118's actual event coverage.
ALTER TABLE admin_audit_log
    ADD COLUMN actor_role      text,
    ADD COLUMN reason          text,
    ADD COLUMN ip              text,
    ADD COLUMN user_agent      text,
    ADD COLUMN correlation_id uuid,
    ADD COLUMN previous_value  jsonb,
    ADD COLUMN new_value       jsonb;

-- The read endpoint (#119's dependency) filters by date range and, soon, by correlation id to
-- group everything one request touched.
CREATE INDEX idx_admin_audit_log_created_at ON admin_audit_log (created_at DESC);
CREATE INDEX idx_admin_audit_log_correlation_id ON admin_audit_log (correlation_id) WHERE correlation_id IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS idx_admin_audit_log_correlation_id;
DROP INDEX IF EXISTS idx_admin_audit_log_created_at;
ALTER TABLE admin_audit_log
    DROP COLUMN actor_role,
    DROP COLUMN reason,
    DROP COLUMN ip,
    DROP COLUMN user_agent,
    DROP COLUMN correlation_id,
    DROP COLUMN previous_value,
    DROP COLUMN new_value;
