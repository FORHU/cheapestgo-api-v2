-- migrate:up
-- Tee times can be spaced a round apart (CONTEXT.md, "Golf Course"): a schedule's interval may now run
-- to five hours, where it stopped at 60 minutes.
--
-- Re-running it by hand is harmless.

ALTER TABLE golf_tee_time_schedules DROP CONSTRAINT IF EXISTS golf_schedules_interval_check;
ALTER TABLE golf_tee_time_schedules
    ADD CONSTRAINT golf_schedules_interval_check CHECK (interval_minutes BETWEEN 5 AND 300);

-- migrate:down
-- Fails while any schedule is spaced over an hour: those have to be changed first.
ALTER TABLE golf_tee_time_schedules DROP CONSTRAINT IF EXISTS golf_schedules_interval_check;
ALTER TABLE golf_tee_time_schedules
    ADD CONSTRAINT golf_schedules_interval_check CHECK (interval_minutes BETWEEN 5 AND 60);
