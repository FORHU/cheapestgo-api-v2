-- migrate:up
-- Tee times for Golf Courses (CONTEXT.md, "Golf Course", "Tee Time").
--
-- A course sets its time zone, how far ahead it sells (its booking window) and weekly tee-time
-- schedules. Tee times are generated from the schedules as rows, one per start time, on the course's
-- own clock and stored as instants. Nothing is booked here: piece 2b adds bookings, and moves
-- `spots_left` with one conditional UPDATE so two customers can never take the same last spot
-- (app-v2 docs/superpowers/specs/2026-11-04-golf-tee-times-design.md).
--
-- Restated for v2 from v1's rules (cheapest-go-app, feat/golf-courses), not copied: v1's migration
-- numbers already collide with v2's, and dbmate keys on version alone.
--
-- A schedule's price has no currency of its own: it is in its course's currency, which is why the
-- API refuses to change a course's currency (or time zone) while it has schedules.
--
-- Additive only, and re-running it by hand is harmless.

ALTER TABLE golf_courses
    ADD COLUMN IF NOT EXISTS timezone            text,
    ADD COLUMN IF NOT EXISTS booking_window_days integer NOT NULL DEFAULT 60;

DO $$ BEGIN
    ALTER TABLE golf_courses
        ADD CONSTRAINT golf_courses_booking_window_check CHECK (booking_window_days BETWEEN 1 AND 90);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS golf_tee_time_schedules (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        uuid        NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
    name             text        NOT NULL,
    -- 0 = Sunday … 6 = Saturday, on the course's clock.
    days_of_week     smallint[]  NOT NULL,
    first_tee        time        NOT NULL,
    last_tee         time        NOT NULL,
    interval_minutes integer     NOT NULL,
    spots            integer     NOT NULL DEFAULT 4,
    price_per_player numeric(10,2) NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT golf_schedules_days_check
        CHECK (cardinality(days_of_week) > 0 AND days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
    CONSTRAINT golf_schedules_tee_range_check CHECK (last_tee >= first_tee),
    CONSTRAINT golf_schedules_interval_check  CHECK (interval_minutes BETWEEN 5 AND 60),
    CONSTRAINT golf_schedules_spots_check     CHECK (spots BETWEEN 1 AND 4),
    CONSTRAINT golf_schedules_price_check     CHECK (price_per_player >= 0)
);

CREATE INDEX IF NOT EXISTS idx_golf_schedules_course ON golf_tee_time_schedules (course_id);

CREATE TABLE IF NOT EXISTS golf_tee_times (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        uuid        NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
    schedule_id      uuid        REFERENCES golf_tee_time_schedules(id) ON DELETE SET NULL,
    starts_at        timestamptz NOT NULL,
    spots            integer     NOT NULL,
    spots_left       integer     NOT NULL,
    -- Copied from the schedule when the tee time is generated, with the course's currency then.
    price_per_player numeric(10,2) NOT NULL,
    currency         char(3)     NOT NULL,
    status           text        NOT NULL DEFAULT 'open',
    created_at       timestamptz NOT NULL DEFAULT now(),
    -- Also the index the day listing reads.
    CONSTRAINT golf_tee_times_course_start_key UNIQUE (course_id, starts_at),
    CONSTRAINT golf_tee_times_spots_check      CHECK (spots BETWEEN 1 AND 4),
    CONSTRAINT golf_tee_times_spots_left_check CHECK (spots_left BETWEEN 0 AND spots),
    CONSTRAINT golf_tee_times_price_check      CHECK (price_per_player >= 0),
    CONSTRAINT golf_tee_times_status_check     CHECK (status IN ('open', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_golf_tee_times_schedule ON golf_tee_times (schedule_id);

-- migrate:down
DROP TABLE IF EXISTS golf_tee_times;
DROP TABLE IF EXISTS golf_tee_time_schedules;
ALTER TABLE golf_courses DROP CONSTRAINT IF EXISTS golf_courses_booking_window_check;
ALTER TABLE golf_courses DROP COLUMN IF EXISTS booking_window_days;
ALTER TABLE golf_courses DROP COLUMN IF EXISTS timezone;
