-- migrate:up transaction:false
-- The other half of a hotel-name suggestion: picking the best four.
--
-- `fetchHotelSuggestions` asks for the four best-reviewed properties whose name contains what
-- was typed. `hotel_content_name_trgm` finds the matches quickly; nothing helps with what comes
-- after. The plan is:
--
--   Limit -> Sort (review_count DESC) -> Bitmap Heap Scan (name ~~* '%hilton%')
--
-- so every matching row is fetched from the heap and sorted, to return four. For a narrow name
-- that is a handful of rows. For "hilton", "ibis" or "jakarta" it is thousands, and it is the
-- whole of the remaining tail: measured on production after the LOWER(city) fix, place-heavy
-- queries land at 0.23-0.46s while name-heavy ones take 0.97-3.16s, on the same code path.
--
-- This gives the planner the other strategy — walk review_count downwards and stop once four
-- rows match the name. That is the cheap way round when the name matches many rows, and the
-- wrong way round when it matches few, which is exactly the choice a planner is for: with only
-- the trigram index it had no alternative to offer. Both now exist and the row estimate picks.
--
-- Partial on the same two conditions the query always carries, so the index holds only rows
-- that can actually be offered and Postgres can prove the predicate is implied.
--
-- CONCURRENTLY, hence transaction:false. On failure it leaves an invalid index; drop and retry:
--   DROP INDEX IF EXISTS "hotel_content_review_count_idx";

CREATE INDEX CONCURRENTLY IF NOT EXISTS "hotel_content_review_count_idx"
    ON "hotel_content" ("review_count" DESC NULLS LAST)
    WHERE "images" <> '{}' AND "delisted_at" IS NULL;

-- migrate:down transaction:false
DROP INDEX CONCURRENTLY IF EXISTS "hotel_content_review_count_idx";
