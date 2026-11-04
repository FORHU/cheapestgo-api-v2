/**
 * Tee times (CONTEXT.md, "Golf Course"): made from a course's schedules on its own clock, listed only
 * past the lead time the team needs and inside the course's booking window, and priced all-in per
 * player in the currency the visitor chose (v1 ADR-0047, ADR-0051).
 *
 * Nothing is held or sold here; piece 2b's bookings take spots from these tee times.
 */

import { AppError } from '@/middleware/error.middleware';
import { makeStrictConverter } from '@/lib/payments/convertStrict';
import { roundToCurrency } from '@/lib/pricing';
import { expandSchedule } from '@/lib/golf/schedule';
import { addDays, localDate, localTime, zonedTimeToUtc } from '@/lib/golf/time';
import { MIN_LEAD_HOURS, listingRange } from '@/lib/golf/rules';
import { quoteGolf } from '@/lib/golf/quote';
import type { ScheduleInput } from '@/lib/golf/scheduleInput';
import { ExchangeRatesService, type RatesResult } from '@/services/exchange-rates.service';
import { GolfRepository } from '@/repositories/golf.repository';
import {
    GolfTeeTimesRepository,
    type NewTeeTime,
    type ScheduleDeleteFacts,
    type TeeTimeSchedule,
} from '@/repositories/golfTeeTimes.repository';

type TeeTimeStore = Pick<GolfTeeTimesRepository,
    'listSchedules' | 'createSchedule' | 'deleteSchedule' | 'generationSources' | 'insertTeeTimes' | 'listOpenTeeTimes'>;
type CourseLookup = Pick<GolfRepository, 'findById' | 'findBySlug'>;

const UUID     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const HOUR     = 3_600_000;

/** One tee time as the course page shows it. Unpriced only when its price cannot be converted. */
export interface TeeTimeOffer {
    id:             string;
    startsAt:       string;
    /** "07:30" on the course's clock. */
    localTime:      string;
    spotsLeft:      number;
    allInPerPlayer: number | null;
    currency:       string | null;
}

export interface Availability {
    timezone:  string;
    /** The course-local date answered, which may be the nearest end of the range to the one asked. */
    date:      string;
    firstDate: string;
    lastDate:  string;
    players:   number;
    teeTimes:  TeeTimeOffer[];
}

/** R3: a published course keeps at least one schedule, so it stays bookable. */
const keepsLastPublishedSchedule = ({ status, scheduleCount }: ScheduleDeleteFacts) =>
    !(status === 'published' && scheduleCount <= 1);

export class GolfTeeTimesService {
    constructor(
        private readonly repo: TeeTimeStore = new GolfTeeTimesRepository(),
        private readonly courses: CourseLookup = new GolfRepository(),
        private readonly rates: () => Promise<RatesResult | null> = () => new ExchangeRatesService().getLiveRates(),
    ) {}

    /** A course's schedules, or null for a course that is not there. */
    async listSchedules(courseId: string): Promise<TeeTimeSchedule[] | null> {
        if (!UUID.test(courseId) || !(await this.courses.findById(courseId))) return null;
        return this.repo.listSchedules(courseId);
    }

    /** Add a schedule and make its tee times at once. Null for a course that is not there. */
    async addSchedule(courseId: string, input: ScheduleInput, now = new Date()): Promise<{ schedule: TeeTimeSchedule; created: number } | null> {
        if (!UUID.test(courseId)) return null;
        const course = await this.courses.findById(courseId);
        if (!course) return null;
        if (!course.timezone) {
            const message = "Set the course's time zone before adding tee-time schedules: tee times are made on its clock.";
            throw new AppError(409, message, 'NO_TIMEZONE', { details: { timezone: [message] } });
        }
        const schedule = await this.repo.createSchedule(courseId, input);
        const created = await this.generate({ courseId, now });
        return { schedule, created };
    }

    /** Delete a schedule and its future tee times. False for one that is not there. */
    async removeSchedule(courseId: string, scheduleId: string): Promise<boolean> {
        if (!UUID.test(courseId) || !UUID.test(scheduleId)) return false;
        const outcome = await this.repo.deleteSchedule(courseId, scheduleId, keepsLastPublishedSchedule);
        if (outcome === 'refused') {
            throw new AppError(409,
                'This is the last tee-time schedule of a published course. Unpublish the course before deleting it.',
                'LAST_SCHEDULE');
        }
        return outcome === 'deleted';
    }

    /**
     * Make the tee times every schedule produces from now to the end of its course's window, for one
     * course or all of them. Existing tee times are left as they are. A course that fails is logged
     * and skipped, so one bad course cannot stop the rest. Returns how many were made.
     */
    async generate({ courseId, now = new Date() }: { courseId?: string; now?: Date } = {}): Promise<number> {
        const byCourse = new Map<string, NewTeeTime[]>();
        for (const s of await this.repo.generationSources(courseId)) {
            const rows = byCourse.get(s.courseId) ?? [];
            for (const startsAt of expandSchedule(s, s.timezone, localDate(now, s.timezone), s.windowDays)) {
                if (startsAt.getTime() <= now.getTime()) continue;
                rows.push({ courseId: s.courseId, scheduleId: s.id, startsAt, spots: s.spots, pricePerPlayer: s.pricePerPlayer, currency: s.currency });
            }
            byCourse.set(s.courseId, rows);
        }

        let created = 0;
        for (const [id, rows] of byCourse) {
            // Overlapping schedules name the same start more than once; the first one listed keeps it.
            const unique = [...new Map(rows.map((r) => [r.startsAt.getTime(), r])).values()];
            try {
                created += await this.repo.insertTeeTimes(unique);
            } catch (err) {
                console.error(`[golf] tee-time generation failed for course ${id}:`, (err as Error)?.message);
            }
        }
        return created;
    }

    /**
     * The open tee times on one course-local date. Null for a course that is not published and
     * bookable. A missing date means the first date there can be tee times; a date outside the range
     * is answered for the nearer end of it.
     */
    async availability(
        slug: string,
        { date, players, currency }: { date?: string; players: number; currency?: string },
        now = new Date(),
    ): Promise<Availability | null> {
        const course = await this.courses.findBySlug(slug);
        if (!course || course.status !== 'published' || !course.bookable || !course.timezone) return null;

        const tz = course.timezone;
        const { firstDate, lastDate } = listingRange(now, tz, course.bookingWindowDays);
        const day = !date || date < firstDate ? firstDate : date > lastDate ? lastDate : date;

        const from = new Date(Math.max(zonedTimeToUtc(day, '00:00', tz).getTime(), now.getTime() + MIN_LEAD_HOURS * HOUR));
        const to   = new Date(Math.min(
            zonedTimeToUtc(addDays(day, 1), '00:00', tz).getTime(),
            now.getTime() + (course.bookingWindowDays + 1) * 24 * HOUR,
        ));
        const open = to > from ? await this.repo.listOpenTeeTimes(course.id, from, to) : [];

        const asked  = currency?.trim().toUpperCase();
        const charge = asked && CURRENCY.test(asked) ? asked : course.currency;
        // Rates are fetched once, and only when a price has to cross currencies: the fee's flat part is
        // in USD, so any other visitor currency needs them too.
        const needsRates = open.length > 0 && (charge !== 'USD' || open.some((t) => t.currency !== charge));
        const convert = makeStrictConverter(needsRates ? await this.rates().catch(() => null) : null);

        const teeTimes = open.map((t): TeeTimeOffer => {
            let allInPerPlayer: number | null = null;
            let shownIn: string | null = null;
            try {
                const quote = quoteGolf({
                    greenFeeTotal:  roundToCurrency(t.pricePerPlayer * players, t.currency),
                    currency:       t.currency,
                    chargeCurrency: charge,
                    convert,
                });
                allInPerPlayer = roundToCurrency(quote.total / players, quote.currency);
                shownIn = quote.currency;
            } catch {
                // No usable rate: shown without a price, never with a guessed one.
            }
            return {
                id:        t.id,
                startsAt:  t.startsAt.toISOString(),
                localTime: localTime(t.startsAt, tz),
                spotsLeft: t.spotsLeft,
                allInPerPlayer,
                currency:  shownIn,
            };
        });

        return { timezone: tz, date: day, firstDate, lastDate, players, teeTimes };
    }
}
