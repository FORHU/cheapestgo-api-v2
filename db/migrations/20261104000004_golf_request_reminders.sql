-- migrate:up
-- When the team was last reminded about a golf request (CONTEXT.md, "Golf Booking"). A request nearing
-- its deadline is raised once, and this is what makes it once: the sweep claims a request by setting
-- it, so overlapping runs cannot both send the reminder.
--
-- Additive only, and re-running it by hand is harmless.

ALTER TABLE golf_bookings ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_golf_bookings_remind
    ON golf_bookings (decide_by) WHERE status = 'requested' AND reminded_at IS NULL;

-- migrate:down
DROP INDEX IF EXISTS idx_golf_bookings_remind;
ALTER TABLE golf_bookings DROP COLUMN IF EXISTS reminded_at;
