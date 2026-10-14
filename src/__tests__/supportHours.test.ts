import { describe, it, expect } from 'vitest';
import {
    DEFAULT_SUPPORT_HOURS,
    isWithinSupportHours,
    parseClock,
    nextOpening,
    parseSupportHours,
    type SupportHours,
} from '@/lib/support/hours';

/**
 * These cover the decision the widget shows a customer: whether to offer a person at all.
 *
 * Getting it wrong is not cosmetic in either direction. Too generous and someone is told
 * an agent is coming at 3am; too strict and the desk looks shut during working hours.
 * The awkward cases are all timezone and midnight ones, so that is what is here.
 */

/** A UTC instant, written the way the assertions read most clearly. */
const utc = (iso: string) => new Date(iso);

const manila: SupportHours = {
    timezone: 'Asia/Manila',
    days: {
        mon: { open: '09:00', close: '18:00' },
        tue: { open: '09:00', close: '18:00' },
        sat: null,
    },
};

describe('parseClock', () => {
    it('reads a wall clock as minutes since midnight', () => {
        expect(parseClock('00:00')).toBe(0);
        expect(parseClock('09:30')).toBe(570);
        expect(parseClock('23:59')).toBe(1439);
    });

    it('accepts 24:00 as end of day, so a round-the-clock desk has no midnight gap', () => {
        expect(parseClock('24:00')).toBe(1440);
        expect(parseClock('24:01')).toBeNull();
    });

    it('rejects what is not a 24-hour clock time', () => {
        expect(parseClock('25:00')).toBeNull();
        expect(parseClock('09:60')).toBeNull();
        expect(parseClock('9:00')).toBeNull();
        expect(parseClock('')).toBeNull();
        expect(parseClock('open')).toBeNull();
    });
});

describe('isWithinSupportHours', () => {
    it('is open during the window, in the schedule timezone and not UTC', () => {
        // 02:00Z on Monday is 10:00 Monday in Manila (UTC+8) — inside 09:00–18:00.
        expect(isWithinSupportHours(manila, utc('2026-09-07T02:00:00Z'))).toBe(true);
    });

    it('is shut before it opens, even where UTC says otherwise', () => {
        // 23:00Z Sunday is 07:00 Manila on Monday: the right day, an hour too early.
        expect(isWithinSupportHours(manila, utc('2026-09-06T23:00:00Z'))).toBe(false);
    });

    it('is shut once it closes', () => {
        // 10:00Z Monday is 18:00 Manila exactly — close is exclusive.
        expect(isWithinSupportHours(manila, utc('2026-09-07T10:00:00Z'))).toBe(false);
        expect(isWithinSupportHours(manila, utc('2026-09-07T09:59:00Z'))).toBe(true);
    });

    it('is shut on a day with no window and on a day that is absent entirely', () => {
        // Saturday is explicitly null; Sunday is not in the map at all.
        expect(isWithinSupportHours(manila, utc('2026-09-12T02:00:00Z'))).toBe(false);
        expect(isWithinSupportHours(manila, utc('2026-09-13T02:00:00Z'))).toBe(false);
    });

    it('honours a window that runs past midnight, on both sides of it', () => {
        const nightDesk: SupportHours = {
            timezone: 'Asia/Manila',
            days: { mon: { open: '22:00', close: '02:00' } },
        };
        // 14:30Z Monday = 22:30 Monday Manila — after opening.
        expect(isWithinSupportHours(nightDesk, utc('2026-09-07T14:30:00Z'))).toBe(true);
        // 17:00Z Monday = 01:00 Tuesday Manila — still Monday's shift.
        expect(isWithinSupportHours(nightDesk, utc('2026-09-07T17:00:00Z'))).toBe(true);
        // 18:30Z Monday = 02:30 Tuesday Manila — the shift ended.
        expect(isWithinSupportHours(nightDesk, utc('2026-09-07T18:30:00Z'))).toBe(false);
        // 13:00Z Monday = 21:00 Monday Manila — not yet.
        expect(isWithinSupportHours(nightDesk, utc('2026-09-07T13:00:00Z'))).toBe(false);
    });

    it('treats a zero-length window as closed rather than as always open', () => {
        const closed: SupportHours = {
            timezone: 'Asia/Manila',
            days: { mon: { open: '09:00', close: '09:00' } },
        };
        expect(isWithinSupportHours(closed, utc('2026-09-07T01:00:00Z'))).toBe(false);
        expect(isWithinSupportHours(closed, utc('2026-09-07T04:00:00Z'))).toBe(false);
    });

    it('is open at every hour when a day runs 00:00 to 24:00', () => {
        const allDay: SupportHours = {
            timezone: 'Asia/Manila',
            days: { mon: { open: '00:00', close: '24:00' } },
        };
        // 16:00Z Sunday = 00:00 Monday Manila, the instant the day starts.
        expect(isWithinSupportHours(allDay, utc('2026-09-06T16:00:00Z'))).toBe(true);
        // 15:59Z Monday = 23:59 Monday Manila, the last minute of it.
        expect(isWithinSupportHours(allDay, utc('2026-09-07T15:59:00Z'))).toBe(true);
    });

    it('reports closed rather than throwing when the timezone is not a real zone', () => {
        const broken: SupportHours = {
            timezone: 'Mars/Olympus',
            days: { mon: { open: '00:00', close: '24:00' } },
        };
        expect(isWithinSupportHours(broken, utc('2026-09-07T02:00:00Z'))).toBe(false);
    });

    it('observes a DST change in a zone that has one', () => {
        const london: SupportHours = {
            timezone: 'Europe/London',
            days: {
                mon: { open: '09:00', close: '17:00' },
                wed: { open: '09:00', close: '17:00' },
            },
        };
        // 08:30Z on a Wednesday in July is 09:30 BST — open.
        expect(isWithinSupportHours(london, utc('2026-07-01T08:30:00Z'))).toBe(true);
        // The same 08:30Z on a Wednesday in January is 08:30 GMT — not yet.
        expect(isWithinSupportHours(london, utc('2026-01-07T08:30:00Z'))).toBe(false);
    });
});

describe('nextOpening', () => {
    it('names later today when the desk has not opened yet', () => {
        // 23:00Z Sunday is 07:00 Monday in Manila — two hours before opening.
        expect(nextOpening(manila, utc('2026-09-06T23:00:00Z'))).toEqual({
            day: 'mon', open: '09:00', timezone: 'Asia/Manila', today: true,
        });
    });

    it('names the next day once today has closed', () => {
        // 11:00Z Monday is 19:00 Manila — an hour after closing.
        expect(nextOpening(manila, utc('2026-09-07T11:00:00Z'))).toEqual({
            day: 'tue', open: '09:00', timezone: 'Asia/Manila', today: false,
        });
    });

    it('does not name today while the desk is already open', () => {
        // Mid-window: the next opening is tomorrow's, not the one already in progress.
        const opening = nextOpening(manila, utc('2026-09-07T02:00:00Z'));
        expect(opening).toEqual({ day: 'tue', open: '09:00', timezone: 'Asia/Manila', today: false });
    });

    it('skips closed days to reach the next one that opens', () => {
        // 02:00Z Saturday is 10:00 Saturday Manila; sat is null and sun is absent,
        // so the answer is Monday — this is the 3am-Saturday case the widget must explain.
        expect(nextOpening(manila, utc('2026-09-12T02:00:00Z'))).toEqual({
            day: 'mon', open: '09:00', timezone: 'Asia/Manila', today: false,
        });
    });

    it('returns null when the schedule never opens', () => {
        const never: SupportHours = { timezone: 'Asia/Manila', days: { mon: null } };
        expect(nextOpening(never, utc('2026-09-07T02:00:00Z'))).toBeNull();
        // A zero-length window is closed, so it is not an opening either.
        const zero: SupportHours = {
            timezone: 'Asia/Manila',
            days: { mon: { open: '09:00', close: '09:00' } },
        };
        expect(nextOpening(zero, utc('2026-09-07T02:00:00Z'))).toBeNull();
    });

    it('returns null rather than throwing on an unusable timezone', () => {
        const broken: SupportHours = {
            timezone: 'Mars/Olympus',
            days: { mon: { open: '09:00', close: '18:00' } },
        };
        expect(nextOpening(broken, utc('2026-09-07T02:00:00Z'))).toBeNull();
    });

    it('agrees with isWithinSupportHours: an opening exists whenever the desk is shut', () => {
        // The pair has to be consistent, or the widget says "closed" with nothing to
        // promise, or "opens Monday" while a customer is being answered.
        const times = [
            '2026-09-06T23:00:00Z', '2026-09-07T02:00:00Z', '2026-09-07T11:00:00Z',
            '2026-09-12T02:00:00Z', '2026-09-13T05:00:00Z',
        ];
        for (const iso of times) {
            const at = utc(iso);
            if (!isWithinSupportHours(manila, at)) {
                expect(nextOpening(manila, at), `closed at ${iso}, so something must reopen`).not.toBeNull();
            }
        }
    });
});

describe('parseSupportHours', () => {
    it('reads a well-formed schedule through unchanged', () => {
        const parsed = parseSupportHours({
            timezone: 'Asia/Manila',
            days: { mon: { open: '08:00', close: '20:00' } },
        });
        expect(parsed.timezone).toBe('Asia/Manila');
        expect(parsed.days.mon).toEqual({ open: '08:00', close: '20:00' });
    });

    it('falls back to the default rather than throwing on operator typos', () => {
        // A settings field is free text; none of these should take the widget down.
        expect(parseSupportHours(null)).toEqual(DEFAULT_SUPPORT_HOURS);
        expect(parseSupportHours('09:00-18:00')).toEqual(DEFAULT_SUPPORT_HOURS);
        expect(parseSupportHours({ days: {} })).toEqual(DEFAULT_SUPPORT_HOURS);
        expect(parseSupportHours({ timezone: 'Asia/Manila' })).toEqual(DEFAULT_SUPPORT_HOURS);
    });

    it('rejects a timezone that does not exist, which would otherwise close the desk forever', () => {
        const parsed = parseSupportHours({
            timezone: 'Asia/Manilla',
            days: { mon: { open: '09:00', close: '18:00' } },
        });
        expect(parsed).toEqual(DEFAULT_SUPPORT_HOURS);
    });

    it('drops only the malformed day, keeping the rest of the week', () => {
        const parsed = parseSupportHours({
            timezone: 'Asia/Manila',
            days: {
                mon: { open: '09:00', close: '18:00' },
                tue: { open: '9am', close: '6pm' },
                wed: 'closed',
            },
        });
        expect(parsed.days.mon).toEqual({ open: '09:00', close: '18:00' });
        expect(parsed.days.tue).toBeNull();
        expect(parsed.days.wed).toBeNull();
    });
});
