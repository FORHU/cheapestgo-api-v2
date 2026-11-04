/**
 * The golf catalogue's rules (CONTEXT.md, "Golf Course").
 *
 * Two are decided here and nowhere else: a customer sees published courses only, and a "from" green
 * fee is restated in the viewer's Display Currency, as a guide. A conversion that cannot be made
 * leaves the course's own figure in its own currency rather than showing none.
 */

import { AppError } from '@/middleware/error.middleware';
import { makeStrictConverter } from '@/lib/payments/convertStrict';
import { slugify, type GolfCourseInput, type GolfCourseStatus } from '@/lib/golf/courseInput';
import { ExchangeRatesService, type RatesResult } from '@/services/exchange-rates.service';
import { readPage, type AdminListQuery } from '@/services/adminContent.service';
import { GolfRepository, type GolfCourse, type GolfCourseRecord } from '@/repositories/golf.repository';

export type GolfStore = Pick<GolfRepository,
    'listPublished' | 'listPublishedCountries' | 'findBySlug' | 'listForAdmin' | 'create' | 'update' | 'setStatus' | 'delete'>;

const UUID     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;

export class GolfService {
    constructor(
        private readonly repo: GolfStore = new GolfRepository(),
        private readonly rates: () => Promise<RatesResult | null> = () => new ExchangeRatesService().getLiveRates(),
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
        return UUID.test(id) ? this.repo.update(id, withSlug(input)) : null;
    }

    async setStatus(id: string, status: GolfCourseStatus): Promise<GolfCourse | null> {
        return UUID.test(id) ? this.repo.setStatus(id, status) : null;
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
