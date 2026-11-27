-- migrate:up transaction:false
-- City coverage, asked without reading the whole catalogue.
--
-- `DestinationsRepository.findCityCoverage` asks which of a handful of city names we stock:
--
--   SELECT DISTINCT LOWER(city), LOWER(country) FROM hotel_content WHERE LOWER(city) = ANY($1)
--
-- `LOWER(city)` is an expression, and no index on `city` can answer one — not the btree, and
-- not `hotel_content_city_trgm`, which indexes the column's own value. So this was a Seq Scan
-- that computed LOWER() over every row, and it runs on every autocomplete request that returns
-- any place at all. Measured against production on 2026-11-27: an uncached suggestion took
-- 16-18 seconds, and a query matching no place — the one path that skips this check — took
-- 0.3. The 300-second response cache is what kept it off the screen afterwards and why this
-- reads as "slow the first time" rather than as broken.
--
-- Both columns, in the order the query asks for them: the filter is on the first and the
-- second is the rest of what it selects, so the whole answer can come from the index.
--
-- CONCURRENTLY, so the catalogue syncs are not locked out while this builds, which forces
-- `transaction:false` — dbmate wraps a migration in a transaction and CONCURRENTLY is refused
-- inside one. A failure leaves an invalid index rather than rolling back; drop it and retry:
--   DROP INDEX IF EXISTS "hotel_content_city_lower_idx";

CREATE INDEX CONCURRENTLY IF NOT EXISTS "hotel_content_city_lower_idx"
    ON "hotel_content" (LOWER("city"), LOWER("country"));

-- migrate:down transaction:false
DROP INDEX CONCURRENTLY IF EXISTS "hotel_content_city_lower_idx";
