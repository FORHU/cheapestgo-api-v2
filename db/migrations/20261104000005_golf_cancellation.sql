-- migrate:up
-- Cancelling golf bookings (CONTEXT.md, "Golf Booking").
--
-- A course sets how long before a tee time a customer may still cancel for free. The deadline is
-- written on the booking when it is made, so changing the course's rule later does not change what a
-- customer was promised. A request was never charged, so cancelling one releases the card; a confirmed
-- booking is refunded in full, fee included, and `refund_amount` records what went back, in the
-- booking's charge currency.
--
-- Restated for v2 from v1's rules (cheapest-go-app, feat/golf-courses), not copied: dbmate keys on
-- version alone and the two repos' numbers already collide.
--
-- Additive only, and re-running it by hand is harmless.

ALTER TABLE golf_courses ADD COLUMN IF NOT EXISTS free_cancel_hours integer NOT NULL DEFAULT 48;

ALTER TABLE golf_courses DROP CONSTRAINT IF EXISTS golf_courses_free_cancel_hours_check;
ALTER TABLE golf_courses
    ADD CONSTRAINT golf_courses_free_cancel_hours_check CHECK (free_cancel_hours BETWEEN 0 AND 720);

ALTER TABLE golf_bookings ADD COLUMN IF NOT EXISTS free_cancel_until timestamptz;
ALTER TABLE golf_bookings ADD COLUMN IF NOT EXISTS refund_amount numeric(14,2) NOT NULL DEFAULT 0;

-- Bookings from before this had no promise written down; they get the default every course has now.
UPDATE golf_bookings b SET free_cancel_until = t.starts_at - interval '48 hours'
FROM golf_tee_times t WHERE t.id = b.tee_time_id AND b.free_cancel_until IS NULL;

ALTER TABLE golf_bookings ALTER COLUMN free_cancel_until SET NOT NULL;

ALTER TABLE golf_bookings DROP CONSTRAINT IF EXISTS golf_bookings_refund_check;
ALTER TABLE golf_bookings ADD CONSTRAINT golf_bookings_refund_check CHECK (refund_amount >= 0 AND refund_amount <= total);

ALTER TABLE golf_bookings DROP CONSTRAINT IF EXISTS golf_bookings_status_check;
ALTER TABLE golf_bookings ADD CONSTRAINT golf_bookings_status_check
    CHECK (status IN ('held', 'requested', 'confirmed', 'expired', 'declined', 'cancelled'));

ALTER TABLE golf_bookings DROP CONSTRAINT IF EXISTS golf_bookings_close_reason_check;
ALTER TABLE golf_bookings ADD CONSTRAINT golf_bookings_close_reason_check
    CHECK (close_reason IS NULL OR close_reason IN (
        'hold_expired', 'declined_by_team', 'not_confirmed_in_time', 'cancelled_by_customer', 'cancelled_by_team'));

-- migrate:down
ALTER TABLE golf_bookings DROP CONSTRAINT IF EXISTS golf_bookings_close_reason_check;
ALTER TABLE golf_bookings DROP CONSTRAINT IF EXISTS golf_bookings_status_check;
ALTER TABLE golf_bookings DROP CONSTRAINT IF EXISTS golf_bookings_refund_check;
ALTER TABLE golf_bookings DROP COLUMN IF EXISTS refund_amount;
ALTER TABLE golf_bookings DROP COLUMN IF EXISTS free_cancel_until;
ALTER TABLE golf_courses DROP CONSTRAINT IF EXISTS golf_courses_free_cancel_hours_check;
ALTER TABLE golf_courses DROP COLUMN IF EXISTS free_cancel_hours;
