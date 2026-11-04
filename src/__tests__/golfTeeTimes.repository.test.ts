import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => {
    const db = {
        $queryRaw:    vi.fn(),
        $executeRaw:  vi.fn(),
        // An interactive transaction runs its callback against the same client in these tests.
        $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
    };
    return db;
});
vi.mock('@/lib/prisma', () => ({ prisma: db }));

import { GolfTeeTimesRepository } from '@/repositories/golfTeeTimes.repository';

const sql    = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');
const values = (call: unknown[]) => call.slice(1);

const COURSE = '0b6c7a2e-1111-4a5b-9c3d-000000000001';
const SCHEDULE = '0b6c7a2e-2222-4a5b-9c3d-000000000002';

const SCHEDULE_ROW = {
    id: SCHEDULE, course_id: COURSE, name: 'Weekday mornings', days_of_week: [1, 2, 3, 4, 5],
    first_tee: '06:30', last_tee: '11:00', interval_minutes: 8, spots: 4, price_per_player: '85.00',
    created_at: new Date('2026-11-04T00:00:00Z'),
};

let repo: GolfTeeTimesRepository;

beforeEach(() => {
    vi.clearAllMocks();
    db.$queryRaw.mockResolvedValue([]);
    db.$executeRaw.mockResolvedValue(0);
    repo = new GolfTeeTimesRepository();
});

describe('schedules', () => {
    it('reads times as HH:MM and prices as numbers', async () => {
        db.$queryRaw.mockResolvedValueOnce([SCHEDULE_ROW]);
        expect(await repo.listSchedules(COURSE)).toEqual([{
            id: SCHEDULE, courseId: COURSE, name: 'Weekday mornings', daysOfWeek: [1, 2, 3, 4, 5],
            firstTee: '06:30', lastTee: '11:00', intervalMinutes: 8, spots: 4, pricePerPlayer: 85,
            createdAt: '2026-11-04T00:00:00.000Z',
        }]);
        expect(sql(db.$queryRaw.mock.calls[0])).toContain("to_char(first_tee, 'HH24:MI')");
    });
});

describe('deleteSchedule', () => {
    const allowAll = () => true;

    it("answers 'missing' for a course or schedule that is not there", async () => {
        db.$queryRaw.mockResolvedValueOnce([]); // no course
        expect(await repo.deleteSchedule(COURSE, SCHEDULE, allowAll)).toBe('missing');
    });

    it("asks the caller's rule, with the course's status and schedule count, before deleting", async () => {
        db.$queryRaw
            .mockResolvedValueOnce([{ status: 'published' }])
            .mockResolvedValueOnce([{ schedule_count: 1, found: true }]);
        const rule = vi.fn(() => false);
        expect(await repo.deleteSchedule(COURSE, SCHEDULE, rule)).toBe('refused');
        expect(rule).toHaveBeenCalledWith({ status: 'published', scheduleCount: 1 });
        expect(db.$executeRaw).not.toHaveBeenCalled();
    });

    it('locks the course row, then removes the future tee times and the schedule', async () => {
        db.$queryRaw
            .mockResolvedValueOnce([{ status: 'draft' }])
            .mockResolvedValueOnce([{ schedule_count: 1, found: true }]);
        expect(await repo.deleteSchedule(COURSE, SCHEDULE, allowAll)).toBe('deleted');
        expect(sql(db.$queryRaw.mock.calls[0])).toContain('FOR UPDATE');
        expect(sql(db.$executeRaw.mock.calls[0])).toContain('DELETE FROM golf_tee_times');
        expect(sql(db.$executeRaw.mock.calls[0])).toContain('starts_at > now()');
        expect(sql(db.$executeRaw.mock.calls[1])).toContain('DELETE FROM golf_tee_time_schedules');
    });
});

describe('insertTeeTimes', () => {
    it('inserts in chunks, skips tee times that exist, and counts what it made', async () => {
        db.$executeRaw.mockResolvedValueOnce(500).mockResolvedValueOnce(2);
        const rows = Array.from({ length: 502 }, (_, i) => ({
            courseId: COURSE, scheduleId: SCHEDULE, startsAt: new Date(Date.UTC(2026, 10, 5, 0, i)),
            spots: 4, pricePerPlayer: 85, currency: 'USD',
        }));
        expect(await repo.insertTeeTimes(rows)).toBe(502);
        expect(db.$executeRaw).toHaveBeenCalledTimes(2);
        expect(sql(db.$executeRaw.mock.calls[0])).toContain('ON CONFLICT (course_id, starts_at) DO NOTHING');
    });

    it('does nothing for nothing', async () => {
        expect(await repo.insertTeeTimes([])).toBe(0);
        expect(db.$executeRaw).not.toHaveBeenCalled();
    });
});

describe('listOpenTeeTimes', () => {
    it('lists open tee times with spots left, between two instants', async () => {
        const from = new Date('2026-11-14T16:00:00Z');
        const to = new Date('2026-11-15T16:00:00Z');
        db.$queryRaw.mockResolvedValueOnce([{
            id: 't1', starts_at: new Date('2026-11-14T23:30:00Z'), spots: 4, spots_left: 3, price_per_player: '85.00', currency: 'USD',
        }]);
        expect(await repo.listOpenTeeTimes(COURSE, from, to)).toEqual([{
            id: 't1', startsAt: new Date('2026-11-14T23:30:00Z'), spots: 4, spotsLeft: 3, pricePerPlayer: 85, currency: 'USD',
        }]);
        const call = db.$queryRaw.mock.calls[0];
        expect(sql(call)).toContain("status = 'open'");
        expect(sql(call)).toContain('spots_left > 0');
        expect(values(call)).toEqual([COURSE, from, to]);
    });
});

describe('firstOpenTeeTime', () => {
    it('finds the earliest open tee time with a spot left, or nothing', async () => {
        const from = new Date('2026-11-05T03:00:00Z');
        const to = new Date('2027-01-04T03:00:00Z');
        db.$queryRaw.mockResolvedValueOnce([{ starts_at: new Date('2026-11-05T22:00:00Z') }]).mockResolvedValueOnce([]);
        expect(await repo.firstOpenTeeTime(COURSE, from, to)).toEqual(new Date('2026-11-05T22:00:00Z'));
        expect(await repo.firstOpenTeeTime(COURSE, from, to)).toBeNull();
        const text = sql(db.$queryRaw.mock.calls[0]);
        expect(text).toContain("status = 'open'");
        expect(text).toContain('LIMIT 1');
    });
});
