import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { GolfService, type GolfStore } from '@/services/golf.service';
import type { GolfCourse, GolfCourseRecord } from '@/repositories/golf.repository';
import type { RatesResult } from '@/services/exchange-rates.service';
import { AppError } from '@/middleware/error.middleware';
import { golfCourseInputSchema, type GolfCourseStatus } from '@/lib/golf/courseInput';

/**
 * The catalogue's two rules: a customer sees published courses only, and a "from" fee is restated
 * in the viewer's currency as a guide, so a conversion that cannot be made leaves the course's own
 * figure rather than none.
 */

const ID = '0b6c7a2e-1111-4a5b-9c3d-000000000001';

const course = (over: Partial<GolfCourse> = {}): GolfCourse => ({
    id: ID, slug: 'wack-wack', name: 'Wack Wack', country: 'Philippines', city: 'Mandaluyong', address: null,
    description: '', holes: 18, par: 72, greenFeeFrom: 100, currency: 'USD', imageUrls: [], amenities: [],
    status: 'published', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    timezone: 'Asia/Manila', bookingWindowDays: 60, scheduleCount: 1, bookable: true, ...over,
});

const RATES: RatesResult = {
    rates: { USD: 1, KRW: 0.00075, PHP: 0.0175 }, source: 'live', provider: 'test', fetchedAt: Date.now(), missing: [],
};

function fakeRepo() {
    return {
        listPublished:          vi.fn(async (_country?: string) => [] as GolfCourse[]),
        listPublishedCountries: vi.fn(async () => [] as string[]),
        findBySlug:             vi.fn(async (_slug: string) => null as GolfCourse | null),
        listForAdmin:           vi.fn(async (_o: { query?: string; page: number; pageSize: number }) => ({ courses: [] as GolfCourse[], total: 0 })),
        create:                 vi.fn(async (r: GolfCourseRecord) => course({ slug: r.slug })),
        update:                 vi.fn(async (_id: string, _r: GolfCourseRecord) => null as GolfCourse | null),
        setStatus:              vi.fn(async (_id: string, _s: GolfCourseStatus) => null as GolfCourse | null),
        delete:                 vi.fn(async (_id: string) => false),
        findById:               vi.fn(async (_id: string) => null as GolfCourse | null),
    } satisfies GolfStore;
}

let repo: ReturnType<typeof fakeRepo>;
let rates: ReturnType<typeof vi.fn<() => Promise<RatesResult | null>>>;
let generate: ReturnType<typeof vi.fn<(courseId: string) => Promise<number>>>;
let svc: GolfService;

beforeEach(() => {
    repo     = fakeRepo();
    rates    = vi.fn<() => Promise<RatesResult | null>>(async () => RATES);
    generate = vi.fn<(courseId: string) => Promise<number>>(async () => 0);
    svc      = new GolfService(repo, rates, generate);
});

describe('published means bookable', () => {
    it('publishes a bookable course', async () => {
        repo.setStatus.mockResolvedValueOnce(course());
        expect((await svc.setStatus(ID, 'published'))?.status).toBe('published');
    });

    it('refuses to publish a course without a time zone and a schedule', async () => {
        repo.setStatus.mockResolvedValueOnce(null);
        repo.findById.mockResolvedValueOnce(course({ status: 'draft', timezone: null, scheduleCount: 0, bookable: false }));
        const err = await svc.setStatus(ID, 'published').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AppError);
        expect(err).toMatchObject({ statusCode: 409, code: 'COURSE_NOT_BOOKABLE' });
    });

    it('answers null when there is no such course', async () => {
        repo.setStatus.mockResolvedValueOnce(null);
        repo.findById.mockResolvedValueOnce(null);
        expect(await svc.setStatus(ID, 'published')).toBeNull();
    });
});

describe('a course with schedules keeps its clock and its currency', () => {
    const input = golfCourseInputSchema.parse({
        name: 'Wack Wack', country: 'Philippines', city: 'Mandaluyong', holes: 18, timezone: 'Asia/Manila', currency: 'USD',
    });

    it('refuses a new time zone, against the time zone field', async () => {
        repo.findById.mockResolvedValueOnce(course({ scheduleCount: 2 }));
        const err = await svc.update(ID, { ...input, timezone: 'Asia/Seoul' }).catch((e: unknown) => e);
        expect(err).toMatchObject({ statusCode: 409, code: 'TIMEZONE_LOCKED', details: { details: { timezone: [expect.any(String)] } } });
        expect(repo.update).not.toHaveBeenCalled();
    });

    it('refuses a new currency, against the currency field', async () => {
        repo.findById.mockResolvedValueOnce(course({ scheduleCount: 2 }));
        const err = await svc.update(ID, { ...input, currency: 'KRW' }).catch((e: unknown) => e);
        expect(err).toMatchObject({ statusCode: 409, code: 'CURRENCY_LOCKED', details: { details: { currency: [expect.any(String)] } } });
    });

    it('lets a course without schedules change both', async () => {
        repo.findById.mockResolvedValueOnce(course({ scheduleCount: 0, bookable: false }));
        repo.update.mockResolvedValueOnce(course({ timezone: 'Asia/Seoul', currency: 'KRW', scheduleCount: 0, bookable: false }));
        expect(await svc.update(ID, { ...input, timezone: 'Asia/Seoul', currency: 'KRW' })).toMatchObject({ currency: 'KRW' });
    });
});

describe('tee times follow the course', () => {
    const input = golfCourseInputSchema.parse({
        name: 'Wack Wack', country: 'Philippines', city: 'Mandaluyong', holes: 18, timezone: 'Asia/Manila', currency: 'USD',
    });

    it('are generated again when the window changes', async () => {
        repo.findById.mockResolvedValueOnce(course({ bookingWindowDays: 60 }));
        repo.update.mockResolvedValueOnce(course({ bookingWindowDays: 90 }));
        await svc.update(ID, { ...input, bookingWindowDays: 90 });
        expect(generate).toHaveBeenCalledWith(ID);
    });

    it('are left alone when nothing they depend on changed', async () => {
        repo.findById.mockResolvedValueOnce(course());
        repo.update.mockResolvedValueOnce(course({ name: 'Wack Wack East' }));
        await svc.update(ID, { ...input, name: 'Wack Wack East' });
        expect(generate).not.toHaveBeenCalled();
    });

    it('do not fail the save when generating them does', async () => {
        generate.mockRejectedValueOnce(new Error('db down'));
        repo.findById.mockResolvedValueOnce(course({ bookingWindowDays: 60 }));
        repo.update.mockResolvedValueOnce(course({ bookingWindowDays: 30 }));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(await svc.update(ID, { ...input, bookingWindowDays: 30 })).toMatchObject({ bookingWindowDays: 30 });
    });
});

describe('what a customer sees', () => {
    it('hides a draft as if it did not exist', async () => {
        repo.findBySlug.mockResolvedValueOnce(course({ status: 'draft' }));
        expect(await svc.getPublished('wack-wack')).toBeNull();
    });

    it('shows a published course', async () => {
        repo.findBySlug.mockResolvedValueOnce(course());
        expect((await svc.getPublished('wack-wack'))?.slug).toBe('wack-wack');
    });

    it('lists with the countries to filter by, and passes the country down', async () => {
        repo.listPublished.mockResolvedValueOnce([course()]);
        repo.listPublishedCountries.mockResolvedValueOnce(['Japan', 'Philippines']);
        const out = await svc.listPublished({ country: 'Philippines' });
        expect(repo.listPublished).toHaveBeenCalledWith('Philippines');
        expect(out.countries).toEqual(['Japan', 'Philippines']);
        expect(out.courses).toHaveLength(1);
    });
});

describe("the 'from' fee in the viewer's currency", () => {
    it('is restated from the course currency, to the cent', async () => {
        repo.findBySlug.mockResolvedValueOnce(course({ greenFeeFrom: 85, currency: 'USD' }));
        expect(await svc.getPublished('wack-wack', 'krw')).toMatchObject({ currency: 'KRW', greenFeeFrom: 113333.33 });
    });

    it("stays the course's own figure when there are no rates", async () => {
        rates.mockResolvedValueOnce(null);
        repo.findBySlug.mockResolvedValueOnce(course({ greenFeeFrom: 85, currency: 'USD' }));
        expect(await svc.getPublished('wack-wack', 'KRW')).toMatchObject({ currency: 'USD', greenFeeFrom: 85 });
    });

    it('stays put when the rate lookup itself fails', async () => {
        rates.mockRejectedValueOnce(new Error('timeout'));
        repo.findBySlug.mockResolvedValueOnce(course({ greenFeeFrom: 85, currency: 'USD' }));
        expect(await svc.getPublished('wack-wack', 'KRW')).toMatchObject({ currency: 'USD', greenFeeFrom: 85 });
    });

    it('asks for no rates it does not need', async () => {
        repo.listPublished.mockResolvedValueOnce([course({ currency: 'KRW', greenFeeFrom: 90000 }), course({ greenFeeFrom: null })]);
        const out = await svc.listPublished({ currency: 'KRW' });
        expect(rates).not.toHaveBeenCalled();
        expect(out.courses.map((c) => c.currency)).toEqual(['KRW', 'USD']);
    });

    it('ignores a currency that is not one', async () => {
        repo.findBySlug.mockResolvedValueOnce(course());
        expect(await svc.getPublished('wack-wack', 'pesos')).toMatchObject({ currency: 'USD' });
        expect(rates).not.toHaveBeenCalled();
    });
});

describe('writes', () => {
    const input = golfCourseInputSchema.parse({ name: 'Wack Wack', country: 'Philippines', city: 'Mandaluyong', holes: 18 });

    it('makes the slug from name and city when none is given', async () => {
        await svc.create(input);
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'wack-wack-mandaluyong' }));
    });

    it('keeps a slug that is given', async () => {
        await svc.create({ ...input, slug: 'wack-east' });
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'wack-east' }));
    });

    it('asks for a slug when the name and city have nothing a URL can use', async () => {
        const err = await svc.create({ ...input, name: '제주', city: '서귀포' }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AppError);
        expect(err).toMatchObject({ statusCode: 422, details: { details: { slug: [expect.any(String)] } } });
        expect(repo.create).not.toHaveBeenCalled();
    });

    it('treats a malformed id as unknown, without asking the database', async () => {
        expect(await svc.update('not-a-uuid', input)).toBeNull();
        expect(await svc.setStatus('not-a-uuid', 'published')).toBeNull();
        expect(await svc.delete('not-a-uuid')).toBe(false);
        expect(repo.update).not.toHaveBeenCalled();
        expect(repo.setStatus).not.toHaveBeenCalled();
        expect(repo.delete).not.toHaveBeenCalled();
    });
});

describe('the admin list', () => {
    it('pages twenty at a time and says how many pages there are', async () => {
        repo.listForAdmin.mockResolvedValueOnce({ courses: [course()], total: 41 });
        const out = await svc.listForAdmin({ page: '3', q: ' wack ' });
        expect(repo.listForAdmin).toHaveBeenCalledWith({ query: 'wack', page: 3, pageSize: 20 });
        expect(out).toMatchObject({ total: 41, page: 3, pageSize: 20, totalPages: 3 });
    });
});
