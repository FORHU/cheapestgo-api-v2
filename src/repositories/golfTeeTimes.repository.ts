/**
 * Tee-time schedules and the tee times generated from them (CONTEXT.md, "Golf Course"). Data only:
 * when a schedule may be deleted is GolfTeeTimesService's rule, passed in and applied here inside the
 * transaction that makes it safe.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { ScheduleInput } from '@/lib/golf/scheduleInput';
import type { GolfCourseStatus } from '@/lib/golf/courseInput';

export interface TeeTimeSchedule {
    id:              string;
    courseId:        string;
    name:            string;
    /** 0 = Sunday … 6 = Saturday, on the course's clock. */
    daysOfWeek:      number[];
    /** "HH:MM", course-local. */
    firstTee:        string;
    lastTee:         string;
    intervalMinutes: number;
    spots:           number;
    /** In the course's currency. */
    pricePerPlayer:  number;
    createdAt:       string;
}

/** A schedule with what generation needs from its course. */
export interface GenerationSource extends TeeTimeSchedule {
    timezone:   string;
    currency:   string;
    windowDays: number;
}

export interface NewTeeTime {
    courseId:       string;
    scheduleId:     string;
    startsAt:       Date;
    spots:          number;
    pricePerPlayer: number;
    currency:       string;
}

export interface OpenTeeTime {
    id:             string;
    startsAt:       Date;
    spots:          number;
    spotsLeft:      number;
    pricePerPlayer: number;
    currency:       string;
}

/** What a delete rule is told about the course, read under the course's row lock. */
export interface ScheduleDeleteFacts {
    status:        GolfCourseStatus;
    scheduleCount: number;
}

interface ScheduleRow {
    id:               string;
    course_id:        string;
    name:             string;
    days_of_week:     number[];
    first_tee:        string;
    last_tee:         string;
    interval_minutes: number;
    spots:            number;
    price_per_player: Prisma.Decimal | string | number;
    created_at:       Date;
}

const toSchedule = (r: ScheduleRow): TeeTimeSchedule => ({
    id:              r.id,
    courseId:        r.course_id,
    name:            r.name,
    daysOfWeek:      r.days_of_week.map(Number),
    firstTee:        r.first_tee,
    lastTee:         r.last_tee,
    intervalMinutes: Number(r.interval_minutes),
    spots:           Number(r.spots),
    pricePerPlayer:  Number(r.price_per_player),
    createdAt:       new Date(r.created_at).toISOString(),
});

const CHUNK = 500;

export class GolfTeeTimesRepository {
    /** A course's schedules, earliest first tee first. Times as "HH:MM", never as a Date. */
    async listSchedules(courseId: string): Promise<TeeTimeSchedule[]> {
        const rows = await prisma.$queryRaw<ScheduleRow[]>`
            SELECT id, course_id, name, days_of_week,
                   to_char(first_tee, 'HH24:MI') AS first_tee, to_char(last_tee, 'HH24:MI') AS last_tee,
                   interval_minutes, spots, price_per_player, created_at
            FROM golf_tee_time_schedules WHERE course_id = ${courseId}::uuid
            ORDER BY first_tee, name`;
        return rows.map(toSchedule);
    }

    async createSchedule(courseId: string, s: ScheduleInput): Promise<TeeTimeSchedule> {
        const rows = await prisma.$queryRaw<ScheduleRow[]>`
            INSERT INTO golf_tee_time_schedules
                (course_id, name, days_of_week, first_tee, last_tee, interval_minutes, spots, price_per_player)
            VALUES
                (${courseId}::uuid, ${s.name}, ${s.daysOfWeek}::smallint[], ${s.firstTee}::time, ${s.lastTee}::time,
                 ${s.intervalMinutes}::int, ${s.spots}::int, ${s.pricePerPlayer}::numeric)
            RETURNING id, course_id, name, days_of_week,
                      to_char(first_tee, 'HH24:MI') AS first_tee, to_char(last_tee, 'HH24:MI') AS last_tee,
                      interval_minutes, spots, price_per_player, created_at`;
        return toSchedule(rows[0]);
    }

    /**
     * Delete a schedule and its future tee times, if `allow` agrees. The course row is locked first,
     * so two deletes cannot both read "two schedules left" and leave a published course with none.
     */
    async deleteSchedule(
        courseId: string,
        scheduleId: string,
        allow: (facts: ScheduleDeleteFacts) => boolean,
    ): Promise<'deleted' | 'missing' | 'refused'> {
        return prisma.$transaction(async (tx) => {
            const [course] = await tx.$queryRaw<Array<{ status: GolfCourseStatus }>>`
                SELECT status FROM golf_courses WHERE id = ${courseId}::uuid FOR UPDATE`;
            if (!course) return 'missing';

            const [counted] = await tx.$queryRaw<Array<{ schedule_count: number; found: boolean | null }>>`
                SELECT count(*)::int AS schedule_count, bool_or(id = ${scheduleId}::uuid) AS found
                FROM golf_tee_time_schedules WHERE course_id = ${courseId}::uuid`;
            if (!counted?.found) return 'missing';
            if (!allow({ status: course.status, scheduleCount: Number(counted.schedule_count) })) return 'refused';

            await tx.$executeRaw`DELETE FROM golf_tee_times WHERE schedule_id = ${scheduleId}::uuid AND starts_at > now()`;
            await tx.$executeRaw`DELETE FROM golf_tee_time_schedules WHERE id = ${scheduleId}::uuid`;
            return 'deleted';
        });
    }

    /** Every schedule of courses that have a time zone, or of one course. */
    async generationSources(courseId?: string): Promise<GenerationSource[]> {
        const only = courseId ?? null;
        const rows = await prisma.$queryRaw<Array<ScheduleRow & { timezone: string; currency: string; booking_window_days: number }>>`
            SELECT s.id, s.course_id, s.name, s.days_of_week,
                   to_char(s.first_tee, 'HH24:MI') AS first_tee, to_char(s.last_tee, 'HH24:MI') AS last_tee,
                   s.interval_minutes, s.spots, s.price_per_player, s.created_at,
                   c.timezone, c.currency, c.booking_window_days
            FROM golf_tee_time_schedules s
            JOIN golf_courses c ON c.id = s.course_id
            WHERE c.timezone IS NOT NULL AND (${only}::uuid IS NULL OR s.course_id = ${only}::uuid)`;
        return rows.map((r) => ({
            ...toSchedule(r),
            timezone:   r.timezone,
            currency:   r.currency.trim(),
            windowDays: Number(r.booking_window_days),
        }));
    }

    /** New tee times, in chunks; ones that already exist are left as they are. Returns how many were made. */
    async insertTeeTimes(rows: NewTeeTime[]): Promise<number> {
        let created = 0;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const chunk = rows.slice(i, i + CHUNK);
            created += await prisma.$executeRaw`
                INSERT INTO golf_tee_times (course_id, schedule_id, starts_at, spots, spots_left, price_per_player, currency)
                SELECT * FROM unnest(
                    ${chunk.map((r) => r.courseId)}::uuid[],
                    ${chunk.map((r) => r.scheduleId)}::uuid[],
                    ${chunk.map((r) => r.startsAt.toISOString())}::timestamptz[],
                    ${chunk.map((r) => r.spots)}::int[],
                    ${chunk.map((r) => r.spots)}::int[],
                    ${chunk.map((r) => r.pricePerPlayer)}::numeric[],
                    ${chunk.map((r) => r.currency)}::char(3)[])
                ON CONFLICT (course_id, starts_at) DO NOTHING`;
        }
        return created;
    }

    /** Open tee times with a spot left, from `from` (inclusive) to `to` (exclusive), earliest first. */
    async listOpenTeeTimes(courseId: string, from: Date, to: Date): Promise<OpenTeeTime[]> {
        const rows = await prisma.$queryRaw<Array<{
            id: string; starts_at: Date; spots: number; spots_left: number;
            price_per_player: Prisma.Decimal | string | number; currency: string;
        }>>`
            SELECT id, starts_at, spots, spots_left, price_per_player, currency
            FROM golf_tee_times
            WHERE course_id = ${courseId}::uuid AND status = 'open' AND spots_left > 0
              AND starts_at >= ${from} AND starts_at < ${to}
            ORDER BY starts_at`;
        return rows.map((r) => ({
            id:             r.id,
            startsAt:       new Date(r.starts_at),
            spots:          Number(r.spots),
            spotsLeft:      Number(r.spots_left),
            pricePerPlayer: Number(r.price_per_player),
            currency:       r.currency.trim(),
        }));
    }
}
