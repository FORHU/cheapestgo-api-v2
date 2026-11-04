/**
 * The golf catalogue's rules (CONTEXT.md, "Golf Course").
 *
 * Decided here and nowhere else: a customer sees published courses only; a "from" green fee is
 * restated in the viewer's Display Currency, as a guide (a conversion that cannot be made leaves the
 * course's own figure in its own currency rather than showing none); and published means bookable —
 * a course is published only with a time zone and a schedule, and while it has schedules its clock
 * and its currency stay put, because its tee times were generated on that clock and its schedule
 * prices are in that currency.
 */

import { AppError } from '@/middleware/error.middleware';
import { makeStrictConverter } from '@/lib/payments/convertStrict';
import { slugify, type GolfCourseInput, type GolfCourseStatus } from '@/lib/golf/courseInput';
import { ExchangeRatesService, type RatesResult } from '@/services/exchange-rates.service';
import { readPage, type AdminListQuery } from '@/services/adminContent.service';
import { GolfRepository, type GolfCourse, type GolfCourseRecord } from '@/repositories/golf.repository';

export type GolfStore = Pick<GolfRepository,
    'listPublished' | 'listPublishedCountries' | 'findBySlug' | 'findById' | 'listForAdmin'
    | 'create' | 'update' | 'setStatus' | 'delete'>;

const UUID     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;

/** Generation lives with the tee times; loaded on first use so the two services do not import each other. */
const generateTeeTimes = async (courseId: string) => {
    const { GolfTeeTimesService } = await import('@/services/golfTeeTimes.service');
    return new GolfTeeTimesService().generate({ courseId });
};

/** A refusal about one field, shaped like a ZodError's answer so the form shows it beside the field. */
const fieldConflict = (code: string, field: string, message: string) =>
    new AppError(409, message, code, { details: { [field]: [message] } });

export class GolfService {
    constructor(
        private readonly repo: GolfStore = new GolfRepository(),
        private readonly rates: () => Promise<RatesResult | null> = () => new ExchangeRatesService().getLiveRates(),
        private readonly generate: (courseId: string) => Promise<number> = generateTeeTimes,
    ) {}

    /** The storefront's list, and every country it can be narrowed to. */
    async listPublished(opts: { country?: string; currency?: string } = {}) {
        const [courses, countries] = await Promise.all([
            this.repo.listPublished(opts.country),
            this.repo.listPublishedCountries(),
        ]);
        return { courses: await this.inCurrency(courses, opts.currency), countries };
    }

    /** A course page, or null: a draft is as absent to a customer as a slug that never existed. */
    async getPublished(slug: string, currency?: string): Promise<GolfCourse | null> {
        const course = await this.repo.findBySlug(slug);
        if (!course || course.status !== 'published') return null;
        const [shown] = await this.inCurrency([course], currency);
        return shown;
    }

    async listForAdmin(query: AdminListQuery) {
        const { page, pageSize, query: q } = readPage(query);
        const { courses, total } = await this.repo.listForAdmin({ query: q, page, pageSize });
        return { data: courses, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
    }

    async create(input: GolfCourseInput): Promise<GolfCourse> {
        return this.repo.create(withSlug(input));
    }

    // A malformed id names no course, so it is answered as an unknown one rather than handed to
    // Postgres to fail as an invalid uuid.
    async update(id: string, input: GolfCourseInput): Promise<GolfCourse | null> {
        if (!UUID.test(id)) return null;
        const before = await this.repo.findById(id);
        if (!before) return null;

        if (before.scheduleCount > 0 && input.timezone !== before.timezone) {
            throw fieldConflict('TIMEZONE_LOCKED', 'timezone',
                'The time zone cannot change while this course has tee-time schedules: its tee times were made on that clock.');
        }
        if (before.scheduleCount > 0 && input.currency !== before.currency) {
            throw fieldConflict('CURRENCY_LOCKED', 'currency',
                'The currency cannot change while this course has tee-time schedules: their prices are in it.');
        }

        const after = await this.repo.update(id, withSlug(input));
        if (after?.bookable && (after.timezone !== before.timezone || after.bookingWindowDays !== before.bookingWindowDays)) {
            // The course is saved either way; the daily run catches up if this one fails.
            await this.generate(id).catch((err: unknown) =>
                console.error('[golf] could not generate tee times after a course change:', (err as Error)?.message));
        }
        return after;
    }

    async setStatus(id: string, status: GolfCourseStatus): Promise<GolfCourse | null> {
        if (!UUID.test(id)) return null;
        const changed = await this.repo.setStatus(id, status);
        if (changed) return changed;
        // Nothing changed: either there is no such course, or it is not bookable yet.
        if (!(await this.repo.findById(id))) return null;
        throw new AppError(409, 'Add a time zone and at least one tee-time schedule before publishing this course.', 'COURSE_NOT_BOOKABLE');
    }

    async delete(id: string): Promise<boolean> {
        return UUID.test(id) ? this.repo.delete(id) : false;
    }

    private async inCurrency(courses: GolfCourse[], currency?: string): Promise<GolfCourse[]> {
        const to = currency?.trim().toUpperCase();
        if (!to || !CURRENCY.test(to)) return courses;
        if (!courses.some((c) => c.greenFeeFrom != null && c.currency !== to)) return courses;

        const convert = makeStrictConverter(await this.rates().catch(() => null));
        return courses.map((c) => {
            if (c.greenFeeFrom == null || c.currency === to) return c;
            try {
                return { ...c, greenFeeFrom: Math.round(convert(c.greenFeeFrom, c.currency, to) * 100) / 100, currency: to };
            } catch {
                return c;
            }
        });
    }
}

/** The slug as given, or one made from the name and city. */
function withSlug(input: GolfCourseInput): GolfCourseRecord {
    const slug = input.slug ?? slugify(input.name, input.city);
    if (!slug) {
        // Shaped like a ZodError's answer, so the form shows it beside the slug field.
        throw new AppError(422, 'Invalid request data', 'VALIDATION_ERROR', {
            details: { slug: ['Add a slug: the name and city have no letters a URL can use.'] },
        });
    }
    return { ...input, slug };
}
