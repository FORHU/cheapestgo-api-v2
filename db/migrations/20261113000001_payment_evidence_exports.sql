-- migrate:up
-- Evidence packs exported from the payment back office, kept in the database.
--
-- A pack was going to a storage bucket and coming back as an expiring link. It is stored here
-- instead: one fewer system to provision and secure, and the pack sits in the same backups as the
-- payment records it describes. A PDF of a few hundred KB per export is well within what Postgres
-- holds comfortably in a bytea; revisit only if exports become bulk.
--
-- Insert-only. A pack is evidence of what was known when it was generated, so a later export is a
-- new row and never overwrites an earlier one. `generated_at` is the moment the facts were
-- gathered, which is what the document itself prints.
--
-- Additive only. Nothing existing is altered.

CREATE TABLE IF NOT EXISTS payment_evidence_exports (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_intent_id  text        NOT NULL,
    generated_at       timestamptz NOT NULL,
    content_type       text        NOT NULL DEFAULT 'application/pdf',
    size_bytes         integer     NOT NULL,
    pdf                bytea       NOT NULL,
    -- Who asked. Plain columns, no foreign key: the export must outlive the admin account.
    exported_by        uuid,
    exported_by_email  text,
    created_at         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payment_evidence_exports_size_chk CHECK (size_bytes = octet_length(pdf))
);

-- Looked up by payment, newest first.
CREATE INDEX IF NOT EXISTS payment_evidence_exports_pi_idx
    ON payment_evidence_exports (payment_intent_id, generated_at DESC);

-- migrate:down
DROP INDEX IF EXISTS payment_evidence_exports_pi_idx;
DROP TABLE IF EXISTS payment_evidence_exports;
