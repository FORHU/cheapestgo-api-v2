-- migrate:up
-- Two more golf extras (CONTEXT.md, "Golf Booking"): a golf lesson and a bucket of range balls. Which
-- extras a course offers is still its own rows in golf_course_extras; this only widens what they can be.
--
-- Additive only, and re-running it by hand is harmless.

ALTER TABLE golf_course_extras DROP CONSTRAINT IF EXISTS golf_course_extras_code_check;
ALTER TABLE golf_course_extras ADD CONSTRAINT golf_course_extras_code_check
    CHECK (code IN ('club_rental', 'caddie', 'cart', 'lessons', 'range_balls'));

ALTER TABLE golf_booking_extras DROP CONSTRAINT IF EXISTS golf_booking_extras_code_check;
ALTER TABLE golf_booking_extras ADD CONSTRAINT golf_booking_extras_code_check
    CHECK (code IN ('club_rental', 'caddie', 'cart', 'lessons', 'range_balls'));

-- migrate:down
DELETE FROM golf_course_extras WHERE code IN ('lessons', 'range_balls');

ALTER TABLE golf_course_extras DROP CONSTRAINT IF EXISTS golf_course_extras_code_check;
ALTER TABLE golf_course_extras ADD CONSTRAINT golf_course_extras_code_check
    CHECK (code IN ('club_rental', 'caddie', 'cart'));

-- NOT VALID: bookings already made with these keep their lines.
ALTER TABLE golf_booking_extras DROP CONSTRAINT IF EXISTS golf_booking_extras_code_check;
ALTER TABLE golf_booking_extras ADD CONSTRAINT golf_booking_extras_code_check
    CHECK (code IN ('club_rental', 'caddie', 'cart')) NOT VALID;
