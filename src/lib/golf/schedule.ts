import { addDays, dayOfWeek, zonedTimeToUtc } from '@/lib/golf/time';

/** The parts of a tee-time schedule that decide when its tee times are. */
export interface ScheduleShape {
    /** 0 = Sunday … 6 = Saturday, on the course's clock. */
    daysOfWeek: number[];
    /** "HH:MM" (or Postgres's "HH:MM:SS"), course-local. */
    firstTee: string;
    lastTee: string;
    intervalMinutes: number;
}

const minutesOf = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

const hhmm = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Every tee time a schedule produces on `days` course-local dates starting at `fromDate`, as
 * instants: the first tee, then every `intervalMinutes` up to and including the last tee.
 */
export function expandSchedule(schedule: ScheduleShape, tz: string, fromDate: string, days: number): Date[] {
    const first = minutesOf(schedule.firstTee);
    const last = minutesOf(schedule.lastTee);
    const out: Date[] = [];
    for (let i = 0; i < days; i++) {
        const date = addDays(fromDate, i);
        if (!schedule.daysOfWeek.includes(dayOfWeek(date))) continue;
        for (let t = first; t <= last; t += schedule.intervalMinutes) {
            out.push(zonedTimeToUtc(date, hhmm(t), tz));
        }
    }
    return out;
}
