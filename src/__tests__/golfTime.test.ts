import { describe, it, expect } from 'vitest';
import { addDays, dayOfWeek, isIsoDate, isValidTimeZone, localDate, localTime, zonedTimeToUtc } from '@/lib/golf/time';
import { expandSchedule } from '@/lib/golf/schedule';
import { isListableStart, listingRange, MIN_LEAD_HOURS } from '@/lib/golf/rules';

/**
 * A tee time is set on the course's own clock ("07:30 in Manila") and stored as an instant, so
 * every conversion goes through the course's time zone, daylight saving included.
 */

describe('course-local time', () => {
    it('turns a course-local date and time into the instant it names', () => {
        expect(zonedTimeToUtc('2026-11-15', '07:30', 'Asia/Manila').toISOString()).toBe('2026-11-14T23:30:00.000Z');
    });

    it('reads an instant back on the course clock', () => {
        const instant = new Date('2026-11-14T23:30:00Z');
        expect(localDate(instant, 'Asia/Manila')).toBe('2026-11-15');
        expect(localTime(instant, 'Asia/Manila')).toBe('07:30');
    });

    it('puts a time the spring-forward jump skips just after the jump', () => {
        // 02:30 does not exist in New York on 8 March 2026; 03:30 EDT does.
        expect(zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe('2026-03-08T07:30:00.000Z');
    });

    it('takes the first of a time the fall-back repeats', () => {
        // 01:30 happens twice in New York on 1 November 2026; the first is EDT.
        expect(zonedTimeToUtc('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z');
    });

    it('does calendar arithmetic without a zone', () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(dayOfWeek('2026-11-15')).toBe(0);
    });

    it('knows a real date and a real zone', () => {
        expect(isIsoDate('2026-02-28')).toBe(true);
        expect(isIsoDate('2026-02-30')).toBe(false);
        expect(isIsoDate('15/11/2026')).toBe(false);
        expect(isValidTimeZone('Asia/Manila')).toBe(true);
        expect(isValidTimeZone('Mars/Olympus')).toBe(false);
        expect(isValidTimeZone('')).toBe(false);
    });
});

describe('expandSchedule', () => {
    const sundayMornings = { daysOfWeek: [0], firstTee: '07:00', lastTee: '07:20', intervalMinutes: 10 };

    it('makes every tee time from first to last, on the days it runs', () => {
        // 14 Nov 2026 is a Saturday (skipped), 15 Nov a Sunday.
        expect(expandSchedule(sundayMornings, 'Asia/Manila', '2026-11-14', 2).map((d) => d.toISOString())).toEqual([
            '2026-11-14T23:00:00.000Z', '2026-11-14T23:10:00.000Z', '2026-11-14T23:20:00.000Z',
        ]);
    });

    it("reads Postgres's HH:MM:SS as well as HH:MM", () => {
        const fromDb = { ...sundayMornings, firstTee: '07:00:00', lastTee: '07:20:00' };
        expect(expandSchedule(fromDb, 'Asia/Manila', '2026-11-15', 1)).toHaveLength(3);
    });

    it('stops at the last tee even when the interval does not land on it', () => {
        const uneven = { ...sundayMornings, lastTee: '07:25', intervalMinutes: 10 };
        expect(expandSchedule(uneven, 'Asia/Manila', '2026-11-15', 1)).toHaveLength(3);
    });
});

describe('what is listed', () => {
    const now = new Date('2026-11-04T03:00:00Z'); // 11:00 on 4 Nov in Manila

    it('lists nothing sooner than the lead time the team needs', () => {
        expect(MIN_LEAD_HOURS).toBe(24);
        expect(isListableStart(new Date(now.getTime() + 23 * 3_600_000), now, 60)).toBe(false);
        expect(isListableStart(new Date(now.getTime() + 25 * 3_600_000), now, 60)).toBe(true);
    });

    it("lists nothing past the course's window", () => {
        expect(isListableStart(new Date(now.getTime() + 10 * 86_400_000), now, 7)).toBe(false);
        expect(isListableStart(new Date(now.getTime() + 6 * 86_400_000), now, 7)).toBe(true);
    });

    it('offers the dates from the first one past the lead to the last one generated', () => {
        expect(listingRange(now, 'Asia/Manila', 60)).toEqual({ firstDate: '2026-11-05', lastDate: '2027-01-02' });
    });
});
