import { describe, it, expect } from 'vitest';
import { scheduleInputSchema } from '@/lib/golf/scheduleInput';
import { golfCourseInputSchema } from '@/lib/golf/courseInput';

/** A tee-time schedule as an admin enters it, and the course fields tee times depend on. */

const weekdays = { name: 'Weekday mornings', daysOfWeek: [1, 2, 3, 4, 5], firstTee: '06:30', lastTee: '11:00', intervalMinutes: 8, pricePerPlayer: 85 };

describe('scheduleInputSchema', () => {
    it('accepts a schedule and defaults to four spots', () => {
        expect(scheduleInputSchema.parse(weekdays)).toEqual({ ...weekdays, spots: 4 });
    });

    it('sorts the days and lists each once', () => {
        expect(scheduleInputSchema.parse({ ...weekdays, daysOfWeek: [5, 1, 5, 3] }).daysOfWeek).toEqual([1, 3, 5]);
    });

    it('refuses what the database would refuse, field by field', () => {
        const r = scheduleInputSchema.safeParse({
            name: '', daysOfWeek: [], firstTee: '25:00', lastTee: '6:5', intervalMinutes: 3, spots: 5, pricePerPlayer: -1,
        });
        expect(r.success).toBe(false);
        expect(Object.keys(r.error!.flatten().fieldErrors).sort())
            .toEqual(['daysOfWeek', 'firstTee', 'intervalMinutes', 'lastTee', 'name', 'pricePerPlayer', 'spots']);
    });

    it('refuses a last tee before the first, against the last tee', () => {
        const r = scheduleInputSchema.safeParse({ ...weekdays, firstTee: '11:00', lastTee: '06:30' });
        expect(r.success).toBe(false);
        expect(Object.keys(r.error!.flatten().fieldErrors)).toEqual(['lastTee']);
    });

    it('refuses a day that is not one', () => {
        expect(scheduleInputSchema.safeParse({ ...weekdays, daysOfWeek: [7] }).success).toBe(false);
    });
});

describe('the course fields tee times depend on', () => {
    const course = { name: 'Wack Wack', country: 'Philippines', city: 'Mandaluyong', holes: 18 };

    it('has no time zone and a sixty-day window until told otherwise', () => {
        expect(golfCourseInputSchema.parse(course)).toMatchObject({ timezone: null, bookingWindowDays: 60 });
    });

    it('takes a real time zone, and an empty one as none', () => {
        expect(golfCourseInputSchema.parse({ ...course, timezone: 'Asia/Manila' }).timezone).toBe('Asia/Manila');
        expect(golfCourseInputSchema.parse({ ...course, timezone: '' }).timezone).toBeNull();
        expect(golfCourseInputSchema.safeParse({ ...course, timezone: 'Mars/Olympus' }).success).toBe(false);
    });

    it('keeps the window between a day and ninety', () => {
        expect(golfCourseInputSchema.parse({ ...course, bookingWindowDays: '14' }).bookingWindowDays).toBe(14);
        expect(golfCourseInputSchema.safeParse({ ...course, bookingWindowDays: 0 }).success).toBe(false);
        expect(golfCourseInputSchema.safeParse({ ...course, bookingWindowDays: 91 }).success).toBe(false);
    });

    it('keeps free cancellation between none at all and thirty days', () => {
        expect(golfCourseInputSchema.parse(course).freeCancelHours).toBe(48);
        expect(golfCourseInputSchema.parse({ ...course, freeCancelHours: '0' }).freeCancelHours).toBe(0);
        expect(golfCourseInputSchema.parse({ ...course, freeCancelHours: 720 }).freeCancelHours).toBe(720);
        expect(golfCourseInputSchema.safeParse({ ...course, freeCancelHours: -1 }).success).toBe(false);
        expect(golfCourseInputSchema.safeParse({ ...course, freeCancelHours: 721 }).success).toBe(false);
    });
});
