/**
 * The golf catalogue's data (CONTEXT.md, "Golf Course"): the `golf_courses` table, and the mapping
 * from its rows to the `GolfCourse` the rest of the API speaks of.
 *
 * Which courses a customer may see is not decided here. `findBySlug` returns drafts too;
 * GolfService is where "published only" lives, once.
 *
 * Every read counts the course's tee-time schedules in the same statement
 * (`schedule_count`), because "bookable" — a time zone and at least one schedule — is part of what a
 * course is, for the storefront and the admin alike.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { GolfAmenity, GolfCourseInput, GolfCourseStatus } from '@/lib/golf/courseInput';
import { byExtraOrder, type ExtraOffer, type GolfExtraCode } from '@/lib/golf/extras';

export interface GolfCourse {
    id:           string;
    slug:         string;
    name:         string;
    country:      string;
    city:         string;
    address:      string | null;
    description:  string;
    holes:        number;
    par:          number | null;
    /** A guide "from" price per player in `currency`. Never a quote. */
    greenFeeFrom: number | null;
    currency:     string;
    /** In display order; the first is the cover. */
    imageUrls:    string[];
    amenities:    GolfAmenity[];
    status:       GolfCourseStatus;
    createdAt:    string;
    updatedAt:    string;
    /** IANA name; tee times are set on this clock. */
    timezone:     string | null;
    bookingWindowDays: number;
    freeCancelHours: number;
    scheduleCount: number;
    /** A time zone and at least one schedule: the course can have tee times. */
    bookable:     boolean;
}

/** A course as it is written: the admin's input with its slug decided. */
export type GolfCourseRecord = Omit<GolfCourseInput, 'slug'> & { slug: string };

/** The slug belongs to another course. */
export class SlugTakenError extends Error {
    constructor(readonly slug: string) {
        super(`Another golf course already uses the slug "${slug}".`);
        this.name = 'SlugTakenError';
    }
}

/** Customers have booked this course, and those bookings still point at it. */
export class CourseHasBookingsError extends Error {
    constructor() {
        super('This course has bookings, so it cannot be deleted. Unpublish it instead.');
        this.name = 'CourseHasBookingsError';
    }
}

interface GolfCourseRow {
    id:             string;
    slug:           string;
    name:           string;
    country:        string;
    city:           string;
    address:        string | null;
    description:    string;
    holes:          number;
    par:            number | null;
    green_fee_from: Prisma.Decimal | string | number | null;
    currency:       string;
    image_urls:     string[] | null;
    amenities:      string[] | null;
    status:         string;
    created_at:     Date;
    updated_at:     Date;
    timezone:       string | null;
    booking_window_days: number;
    free_cancel_hours: number;
    schedule_count: number | null;
}

function toCourse(r: GolfCourseRow): GolfCourse {
    const scheduleCount = Number(r.schedule_count ?? 0);
    return {
        id:           r.id,
        slug:         r.slug,
        name:         r.name,
        country:      r.country,
        city:         r.city,
        address:      r.address,
        description:  r.description,
        holes:        Number(r.holes),
        par:          r.par == null ? null : Number(r.par),
        greenFeeFrom: r.green_fee_from == null ? null : Number(r.green_fee_from),
        // char(3): Postgres pads to the width, so trim rather than trust it.
        currency:     r.currency.trim(),
        imageUrls:    r.image_urls ?? [],
        amenities:    (r.amenities ?? []) as GolfAmenity[],
        status:       r.status as GolfCourseStatus,
        createdAt:    new Date(r.created_at).toISOString(),
        updatedAt:    new Date(r.updated_at).toISOString(),
        timezone:     r.timezone,
        bookingWindowDays: Number(r.booking_window_days),
        freeCancelHours: Number(r.free_cancel_hours),
        scheduleCount,
        bookable:     Boolean(r.timezone) && scheduleCount > 0,
    };
}

/** Postgres's unique_violation, as Prisma reports it from a raw query (P2010 carrying 23505). */
function isUniqueViolation(err: unknown): boolean {
    const e = err as { code?: unknown; meta?: { code?: unknown }; message?: unknown } | null;
    return e?.code === 'P2002' || e?.meta?.code === '23505' || /\b23505\b/.test(String(e?.message ?? ''));
}

function isForeignKeyViolation(err: unknown): boolean {
    const e = err as { code?: unknown; meta?: { code?: unknown }; message?: unknown } | null;
    return e?.code === 'P2003' || e?.meta?.code === '23503' || /\b23503\b/.test(String(e?.message ?? ''));
}

/** `%` and `_` typed into the search box are text to find, not wildcards. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Each query below spells out `schedule_count` rather than sharing a fragment, so a test reading the
// statement sees the SQL that runs.

export class GolfRepository {
    /** Published courses by name, in one country or all of them. */
    async listPublished(country?: string): Promise<GolfCourse[]> {
        const only = country ?? null;
        const rows = await prisma.$queryRaw<GolfCourseRow[]>`
            SELECT c.*, (SELECT count(*)::int FROM golf_tee_time_schedules s WHERE s.course_id = c.id) AS schedule_count
            FROM golf_courses c
            WHERE c.status = 'published' AND (${only}::text IS NULL OR c.country = ${only})
            ORDER BY c.name`;
        return rows.map(toCourse);
    }

    /** Every country with at least one published course: what the storefront can filter by. */
    async listPublishedCountries(): Promise<string[]> {
        const rows = await prisma.$queryRaw<Array<{ country: string }>>`
            SELECT DISTINCT country FROM golf_courses WHERE status = 'published' ORDER BY country`;
        return rows.map((r) => r.country);
    }

    /** Any course with this slug, draft or not. */
    async findBySlug(slug: string): Promise<GolfCourse | null> {
        const rows = await prisma.$queryRaw<GolfCourseRow[]>`
            SELECT c.*, (SELECT count(*)::int FROM golf_tee_time_schedules s WHERE s.course_id = c.id) AS schedule_count
            FROM golf_courses c WHERE c.slug = ${slug} LIMIT 1`;
        return rows[0] ? toCourse(rows[0]) : null;
    }

    /** Any course with this id, draft or not. */
    async findById(id: string): Promise<GolfCourse | null> {
        const rows = await prisma.$queryRaw<GolfCourseRow[]>`
            SELECT c.*, (SELECT count(*)::int FROM golf_tee_time_schedules s WHERE s.course_id = c.id) AS schedule_count
            FROM golf_courses c WHERE c.id = ${id}::uuid LIMIT 1`;
        return rows[0] ? toCourse(rows[0]) : null;
    }

    /** Every course, most recently changed first, matching `query` on name, city or country. */
    async listForAdmin(opts: { query?: string; page: number; pageSize: number }): Promise<{ courses: GolfCourse[]; total: number }> {
        const like   = opts.query ? likePattern(opts.query) : null;
        const offset = (opts.page - 1) * opts.pageSize;
        const [rows, counted] = await Promise.all([
            prisma.$queryRaw<GolfCourseRow[]>`
                SELECT c.*, (SELECT count(*)::int FROM golf_tee_time_schedules s WHERE s.course_id = c.id) AS schedule_count
                FROM golf_courses c
                WHERE ${like}::text IS NULL OR c.name ILIKE ${like} OR c.city ILIKE ${like} OR c.country ILIKE ${like}
                ORDER BY c.updated_at DESC, c.name
                LIMIT ${opts.pageSize} OFFSET ${offset}`,
            prisma.$queryRaw<Array<{ total: number }>>`
                SELECT COUNT(*)::int AS total FROM golf_courses c
                WHERE ${like}::text IS NULL OR c.name ILIKE ${like} OR c.city ILIKE ${like} OR c.country ILIKE ${like}`,
        ]);
        return { courses: rows.map(toCourse), total: Number(counted[0]?.total ?? 0) };
    }

    /** A new course. Always a draft: publishing is its own step. */
    async create(c: GolfCourseRecord): Promise<GolfCourse> {
        try {
            const rows = await prisma.$queryRaw<GolfCourseRow[]>`
                INSERT INTO golf_courses
                    (slug, name, country, city, address, description, holes, par, green_fee_from,
                     currency, image_urls, amenities, timezone, booking_window_days, free_cancel_hours)
                VALUES
                    (${c.slug}, ${c.name}, ${c.country}, ${c.city}, ${c.address}, ${c.description},
                     ${c.holes}::int, ${c.par}::int, ${c.greenFeeFrom}::numeric, ${c.currency},
                     ${c.imageUrls}::text[], ${c.amenities}::text[], ${c.timezone}, ${c.bookingWindowDays}::int, ${c.freeCancelHours}::int)
                RETURNING *, 0 AS schedule_count`;
            return toCourse(rows[0]);
        } catch (err) {
            if (isUniqueViolation(err)) throw new SlugTakenError(c.slug);
            throw err;
        }
    }

    /** Everything an admin can edit, at once. Null when there is no such course. */
    async update(id: string, c: GolfCourseRecord): Promise<GolfCourse | null> {
        try {
            const rows = await prisma.$queryRaw<GolfCourseRow[]>`
                UPDATE golf_courses SET
                    slug = ${c.slug}, name = ${c.name}, country = ${c.country}, city = ${c.city},
                    address = ${c.address}, description = ${c.description}, holes = ${c.holes}::int,
                    par = ${c.par}::int, green_fee_from = ${c.greenFeeFrom}::numeric, currency = ${c.currency},
                    image_urls = ${c.imageUrls}::text[], amenities = ${c.amenities}::text[],
                    timezone = ${c.timezone}, booking_window_days = ${c.bookingWindowDays}::int,
                    free_cancel_hours = ${c.freeCancelHours}::int,
                    updated_at = now()
                WHERE id = ${id}::uuid
                RETURNING *, (SELECT count(*)::int FROM golf_tee_time_schedules s WHERE s.course_id = golf_courses.id) AS schedule_count`;
            return rows[0] ? toCourse(rows[0]) : null;
        } catch (err) {
            if (isUniqueViolation(err)) throw new SlugTakenError(c.slug);
            throw err;
        }
    }

    /**
     * Publish or unpublish. Publishing applies only to a bookable course, decided in this one
     * statement so a schedule deleted at the same moment cannot slip through. Null when nothing
     * changed: no such course, or a course that is not bookable.
     */
    async setStatus(id: string, status: GolfCourseStatus): Promise<GolfCourse | null> {
        const rows = await prisma.$queryRaw<GolfCourseRow[]>`
            UPDATE golf_courses c SET status = ${status}, updated_at = now()
            WHERE c.id = ${id}::uuid
              AND (${status} <> 'published' OR (c.timezone IS NOT NULL
                   AND EXISTS (SELECT 1 FROM golf_tee_time_schedules s WHERE s.course_id = c.id)))
            RETURNING c.*, (SELECT count(*)::int FROM golf_tee_time_schedules s WHERE s.course_id = c.id) AS schedule_count`;
        return rows[0] ? toCourse(rows[0]) : null;
    }

    /** Whether there was a course to delete. Its schedules and tee times go with it. */
    async delete(id: string): Promise<boolean> {
        try {
            const removed = await prisma.$executeRaw`DELETE FROM golf_courses WHERE id = ${id}::uuid`;
            return removed > 0;
        } catch (err) {
            if (isForeignKeyViolation(err)) throw new CourseHasBookingsError();
            throw err;
        }
    }

    /** What a course offers customers to add to a tee time, at its price per item. */
    async listExtras(courseId: string): Promise<ExtraOffer[]> {
        const rows = await prisma.$queryRaw<Array<{ code: GolfExtraCode; price: Prisma.Decimal | string | number }>>`
            SELECT code, price FROM golf_course_extras WHERE course_id = ${courseId}::uuid`;
        return rows.map((r) => ({ code: r.code, price: Number(r.price) })).sort(byExtraOrder);
    }

    /** Replace what a course offers. A booking keeps the prices it was made at (`golf_booking_extras`). */
    async setExtras(courseId: string, offers: ExtraOffer[]): Promise<ExtraOffer[]> {
        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`DELETE FROM golf_course_extras WHERE course_id = ${courseId}::uuid`;
            for (const o of offers) {
                await tx.$executeRaw`
                    INSERT INTO golf_course_extras (course_id, code, price)
                    VALUES (${courseId}::uuid, ${o.code}, ${o.price})`;
            }
        });
        return this.listExtras(courseId);
    }
}
