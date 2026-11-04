import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { GolfTeeTimesService } from '@/services/golfTeeTimes.service';
import type { GolfCourse } from '@/repositories/golf.repository';
import type { GenerationSource, NewTeeTime, OpenTeeTime, ScheduleDeleteFacts, TeeTimeSchedule } from '@/repositories/golfTeeTimes.repository';
import type { ScheduleInput } from '@/lib/golf/scheduleInput';
import type { RatesResult } from '@/services/exchange-rates.service';
import { AppError } from '@/middleware/error.middleware';

/**
 * Tee times: made from a course's schedules on its own clock, listed only past the lead time and
 * inside the course's window, and priced all-in per player in the visitor's currency.
 */

const COURSE = '0b6c7a2e-1111-4a5b-9c3d-000000000001';
const SCHED = '0b6c7a2e-2222-4a5b-9c3d-000000000002';
const NOW = new Date('2026-11-04T03:00:00Z'); // 11:00 on 4 Nov in Manila

const course = (over: Partial<GolfCourse> = {}): GolfCourse => ({
    id: COURSE, slug: 'wack-wack', name: 'Wack Wack', country: 'Philippines', city: 'Mandaluyong', address: null,
    description: '', holes: 18, par: 72, greenFeeFrom: 85, currency: 'USD', imageUrls: [], amenities: [],
    status: 'published', createdAt: '', updatedAt: '', timezone: 'Asia/Manila', bookingWindowDays: 60,
    scheduleCount: 1, bookable: true, ...over,
});

const schedule = (over: Partial<TeeTimeSchedule> = {}): TeeTimeSchedule => ({
    id: 's1', courseId: COURSE, name: 'Sunday mornings', daysOfWeek: [0], firstTee: '07:00', lastTee: '07:20',
    intervalMinutes: 10, spots: 4, pricePerPlayer: 85, createdAt: '', ...over,
});

const RATES: RatesResult = { rates: { USD: 1, KRW: 0.00075 }, source: 'live', provider: 'test', fetchedAt: NOW.getTime(), missing: [] };

function fakes() {
    const teeTimes = {
        listSchedules:     vi.fn(async (_c: string) => [] as TeeTimeSchedule[]),
        createSchedule:    vi.fn(async (_c: string, s: ScheduleInput) => schedule({ name: s.name })),
        deleteSchedule:    vi.fn(async (_c: string, _s: string, _allow: (f: ScheduleDeleteFacts) => boolean) => 'deleted' as 'deleted' | 'missing' | 'refused'),
        generationSources: vi.fn(async (_c?: string) => [] as GenerationSource[]),
        insertTeeTimes:    vi.fn(async (rows: NewTeeTime[]) => rows.length),
        listOpenTeeTimes:  vi.fn(async (_c: string, _f: Date, _t: Date) => [] as OpenTeeTime[]),
    };
    const courses = {
        findById:   vi.fn(async (_id: string) => course() as GolfCourse | null),
        findBySlug: vi.fn(async (_slug: string) => course() as GolfCourse | null),
    };
    return { teeTimes, courses };
}

let f: ReturnType<typeof fakes>;
let rates: ReturnType<typeof vi.fn<() => Promise<RatesResult | null>>>;
let svc: GolfTeeTimesService;

beforeEach(() => {
    f = fakes();
    rates = vi.fn<() => Promise<RatesResult | null>>(async () => RATES);
    svc = new GolfTeeTimesService(f.teeTimes, f.courses, rates);
});

const input: ScheduleInput = { name: 'Sunday mornings', daysOfWeek: [0], firstTee: '07:00', lastTee: '07:20', intervalMinutes: 10, spots: 4, pricePerPlayer: 85 };

describe('adding a schedule', () => {
    it("needs the course's time zone first", async () => {
        f.courses.findById.mockResolvedValueOnce(course({ timezone: null }));
        const err = await svc.addSchedule(COURSE, input).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AppError);
        expect(err).toMatchObject({ statusCode: 409, code: 'NO_TIMEZONE' });
        expect(f.teeTimes.createSchedule).not.toHaveBeenCalled();
    });

    it("makes that course's tee times straight away and says how many", async () => {
        f.teeTimes.generationSources.mockResolvedValueOnce([{ ...schedule(), timezone: 'Asia/Manila', currency: 'USD', windowDays: 14 }]);
        const out = await svc.addSchedule(COURSE, input, NOW);
        expect(out?.schedule.name).toBe('Sunday mornings');
        expect(f.teeTimes.generationSources).toHaveBeenCalledWith(COURSE);
        // Two Sundays in a 14-day window from 4 Nov (8th and 15th), three tee times each.
        expect(out?.created).toBe(6);
    });

    it('answers null for a course that is not there', async () => {
        f.courses.findById.mockResolvedValueOnce(null);
        expect(await svc.addSchedule(COURSE, input)).toBeNull();
    });
});

describe('deleting a schedule', () => {
    const ruleUsed = async () => {
        await svc.removeSchedule(COURSE, SCHED);
        return f.teeTimes.deleteSchedule.mock.calls[0][2];
    };

    it("keeps a published course's last schedule", async () => {
        const allow = await ruleUsed();
        expect(allow({ status: 'published', scheduleCount: 1 })).toBe(false);
        expect(allow({ status: 'published', scheduleCount: 2 })).toBe(true);
        expect(allow({ status: 'draft', scheduleCount: 1 })).toBe(true);
    });

    it('says so when the rule refuses', async () => {
        f.teeTimes.deleteSchedule.mockResolvedValueOnce('refused');
        const err = await svc.removeSchedule(COURSE, SCHED).catch((e: unknown) => e);
        expect(err).toMatchObject({ statusCode: 409, code: 'LAST_SCHEDULE' });
    });

    it('answers false for a schedule that is not there', async () => {
        f.teeTimes.deleteSchedule.mockResolvedValueOnce('missing');
        expect(await svc.removeSchedule(COURSE, SCHED)).toBe(false);
    });
});

describe('generation', () => {
    it("makes each schedule's tee times on its course's clock, from now to the end of the window", async () => {
        f.teeTimes.generationSources.mockResolvedValueOnce([{ ...schedule(), timezone: 'Asia/Manila', currency: 'USD', windowDays: 7 }]);
        await svc.generate({ now: NOW });
        const rows = f.teeTimes.insertTeeTimes.mock.calls[0][0];
        expect(rows.map((r) => r.startsAt.toISOString())).toEqual([
            '2026-11-07T23:00:00.000Z', '2026-11-07T23:10:00.000Z', '2026-11-07T23:20:00.000Z', // Sun 8 Nov, Manila
        ]);
        expect(rows[0]).toMatchObject({ courseId: COURSE, scheduleId: 's1', spots: 4, pricePerPlayer: 85, currency: 'USD' });
    });

    it('carries on past a course that fails', async () => {
        const other = '0b6c7a2e-3333-4a5b-9c3d-000000000003';
        f.teeTimes.generationSources.mockResolvedValueOnce([
            { ...schedule(), timezone: 'Asia/Manila', currency: 'USD', windowDays: 7 },
            { ...schedule({ id: 's2', courseId: other }), timezone: 'Asia/Manila', currency: 'USD', windowDays: 7 },
        ]);
        f.teeTimes.insertTeeTimes.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(3);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(await svc.generate({ now: NOW })).toBe(3);
    });
});

describe('availability', () => {
    const teeTime = (over: Partial<OpenTeeTime> = {}): OpenTeeTime => ({
        id: 't1', startsAt: new Date('2026-11-14T23:30:00Z'), spots: 4, spotsLeft: 3, pricePerPlayer: 85, currency: 'USD', ...over,
    });

    it('is not offered for a course that is not published and bookable', async () => {
        f.courses.findBySlug.mockResolvedValueOnce(course({ status: 'draft' }));
        expect(await svc.availability('wack-wack', { players: 2 }, NOW)).toBeNull();
        f.courses.findBySlug.mockResolvedValueOnce(course({ bookable: false }));
        expect(await svc.availability('wack-wack', { players: 2 }, NOW)).toBeNull();
    });

    it('lists the asked day on the course clock, never inside the lead time', async () => {
        const out = await svc.availability('wack-wack', { date: '2026-11-05', players: 2 }, NOW);
        expect(out).toMatchObject({ timezone: 'Asia/Manila', date: '2026-11-05', firstDate: '2026-11-05', lastDate: '2027-01-02', players: 2 });
        const [, from, to] = f.teeTimes.listOpenTeeTimes.mock.calls[0];
        expect(from.toISOString()).toBe('2026-11-05T03:00:00.000Z'); // now + 24h, later than midnight Manila
        expect(to.toISOString()).toBe('2026-11-05T16:00:00.000Z');   // midnight Manila, 6 Nov
    });

    it('answers a date outside the range for the nearest end, and no date for the first', async () => {
        expect((await svc.availability('wack-wack', { date: '2030-01-01', players: 2 }, NOW))?.date).toBe('2027-01-02');
        expect((await svc.availability('wack-wack', { players: 2 }, NOW))?.date).toBe('2026-11-05');
    });

    it("prices each tee time all-in per player in the visitor's currency", async () => {
        f.teeTimes.listOpenTeeTimes.mockResolvedValueOnce([teeTime()]);
        const out = await svc.availability('wack-wack', { date: '2026-11-15', players: 2, currency: 'KRW' }, NOW);
        const [t] = out!.teeTimes;
        expect(t).toMatchObject({ id: 't1', localTime: '07:30', spotsLeft: 3, currency: 'KRW' });
        expect(Number.isInteger(t.allInPerPlayer)).toBe(true);
        expect(t.allInPerPlayer!).toBeGreaterThan(113333); // more than the green fee alone, 85 USD in won
    });

    it('leaves a tee time unpriced only when its price cannot be converted', async () => {
        f.teeTimes.listOpenTeeTimes.mockResolvedValueOnce([teeTime()]);
        const out = await svc.availability('wack-wack', { date: '2026-11-15', players: 2, currency: 'THB' }, NOW);
        expect(out!.teeTimes[0]).toMatchObject({ allInPerPlayer: null, currency: null });
    });

    it("prices in the course's currency when the visitor has not said", async () => {
        f.teeTimes.listOpenTeeTimes.mockResolvedValueOnce([teeTime()]);
        const out = await svc.availability('wack-wack', { date: '2026-11-15', players: 2 }, NOW);
        expect(out!.teeTimes[0].currency).toBe('USD');
    });
});
