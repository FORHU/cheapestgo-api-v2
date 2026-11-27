-- migrate:up transaction:false
-- The hotel-name index, again, because the first attempt is recorded as done and is not.
--
-- `20261126000001` sits in `schema_migrations` on dev while `hotel_content_name_trgm` does not
-- exist and `EXPLAIN` on the autocomplete query says `Seq Scan`. That version ran before it
-- carried a `-- migrate:up` marker: dbmate found no statements under the marker it needs,
-- changed nothing, and wrote the version down. A migration dbmate believes it has applied is
-- never offered again, so repairing the old file — which has since been repaired — cannot
-- produce the index on any database that already saw it. Only a new version can.
--
-- Left as a separate file rather than a renamed one for the same reason in reverse: renaming
-- would make the index appear on a fresh database and stay missing on every existing one,
-- which is the failure that is being fixed.
--
-- Why it matters: autocomplete offers properties by name, an `ILIKE '%text%'` over
-- hotel_content on every keystroke. A btree cannot answer a leading wildcard. Measured on dev
-- (3,702 rows) the scan costs 6ms and hides; the production catalogue is two orders of
-- magnitude larger and the same scan is the "Searching…" that does not end.
--
-- IF NOT EXISTS, so a database that did somehow get the index is untouched. CONCURRENTLY, so
-- the deploy does not hold a write lock across a large table while the old container serves
-- traffic — and `transaction:false`, because CONCURRENTLY is refused inside the transaction
-- dbmate would otherwise wrap this in.
--
-- If this fails it leaves an invalid index rather than rolling back. Drop it before retrying:
--   DROP INDEX IF EXISTS "hotel_content_name_trgm";

CREATE INDEX CONCURRENTLY IF NOT EXISTS "hotel_content_name_trgm"
    ON "hotel_content" USING GIN ("name" gin_trgm_ops);

-- migrate:down transaction:false
DROP INDEX CONCURRENTLY IF EXISTS "hotel_content_name_trgm";
