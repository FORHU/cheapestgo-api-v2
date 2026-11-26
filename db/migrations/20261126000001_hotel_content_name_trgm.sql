-- migrate:up transaction:false
-- Hotel names, searchable by substring.
--
-- Autocomplete now offers properties by name, which is an `ILIKE '%text%'` against every row
-- of hotel_content on each keystroke. A btree index cannot answer a leading wildcard, so
-- without this it is a sequential scan of the whole catalogue several times a second while
-- someone types. pg_trgm can, and is already enabled — `etg_hotel_index_name_trgm` is the
-- same index on the ETG side.
--
-- `transaction:false` is required, not a preference: dbmate wraps each migration in a
-- transaction by default and CREATE INDEX CONCURRENTLY is refused inside one. CONCURRENTLY is
-- what makes this safe to deploy — hotel_content is large enough that a plain CREATE INDEX
-- holds a write lock long enough to stall the catalogue syncs, and the deploy runs this with
-- the previous container still serving traffic.
--
-- The cost of CONCURRENTLY is that a failure leaves an invalid index behind rather than
-- rolling back. If this migration ever fails, drop it before retrying:
--   DROP INDEX IF EXISTS "hotel_content_name_trgm";

CREATE INDEX CONCURRENTLY IF NOT EXISTS "hotel_content_name_trgm"
    ON "hotel_content" USING GIN ("name" gin_trgm_ops);

-- migrate:down transaction:false
DROP INDEX CONCURRENTLY IF EXISTS "hotel_content_name_trgm";
