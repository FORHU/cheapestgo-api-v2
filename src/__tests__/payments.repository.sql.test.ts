import { describe, it, expect, vi } from 'vitest';

/**
 * The shape of the payments union, checked as SQL.
 *
 * The service above it is tested against a mocked repository, so nothing in this suite could see
 * which column each arm actually reads — and the arms are not alike. `hotel_bookings` and
 * `flight_bookings` keep the reference in `booking_reference`; `bookings` keeps it in
 * `booking_id`, and its own `booking_reference` column is nullable and never written by the v2
 * path. Reading only the latter printed "no booking" beside every stay that had one, which is the
 * precise row this page exists to surface, disguised as the failure it is meant to report.
 *
 * These assertions are deliberately about the query text. A fuller test needs a database; this is
 * what can be held without one, and it is the part that was wrong.
 */

const db = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: db.queryRaw } }));

import { unionSelect, listPayments } from '@/repositories/payments.repository';
import { ZERO_DECIMAL_CURRENCIES } from '@/lib/pricing';

const sql = () => unionSelect().sql.replace(/\s+/g, ' ');

describe('the payments union', () => {
    it('falls back to booking_id for the bookings arm, which has no reference of its own', () => {
        expect(sql()).toContain('COALESCE(NULLIF(TRIM(b.booking_reference), \'\'), b.booking_id)');
    });

    /** An empty string is as unhelpful as a null, and reads as a reference that exists. */
    it('treats a blank reference as absent rather than printing it', () => {
        expect(sql()).toMatch(/NULLIF\(TRIM\(b\.booking_reference\), ''\)/);
    });

    /**
     * A flight is identified by its PNR everywhere else in the system (admin search, the
     * confirmation email subject, the booking list), and nothing ever writes its
     * booking_reference column — 0 of 38 local rows. Reading only that printed "no booking" beside
     * every flight, and made the search box's promise to match a PNR false.
     */
    it('falls back to the PNR for the flight arm, which has no reference of its own', () => {
        expect(sql()).toContain(
            "COALESCE(NULLIF(TRIM(fb.booking_reference), ''), NULLIF(TRIM(fb.pnr), ''))",
        );
    });

    it('reads every source that can hold a payment', () => {
        const q = sql();
        for (const table of ['FROM bookings b', 'FROM hotel_bookings hb', 'FROM flight_bookings', 'FROM booking_sessions bs']) {
            expect(q).toContain(table);
        }
    });

    /** A row with no payment on it is not a payment, and would widen every count on the page. */
    it('takes only rows that carry a payment intent', () => {
        expect(sql().match(/payment_intent_id IS NOT NULL/g)?.length).toBeGreaterThanOrEqual(4);
    });

    /**
     * A checkout becomes a booking, and the session row survives. Without these guards the same
     * card would be counted twice — and the one case worth finding, a payment with no booking at
     * all, would be buried among rows that simply have one recorded elsewhere.
     */
    it('excludes a checkout session once a booking exists for its payment', () => {
        const q = sql();
        for (const guard of [
            'SELECT 1 FROM flight_bookings f WHERE f.payment_intent_id = bs.payment_intent_id',
            'SELECT 1 FROM bookings b2 WHERE b2.payment_intent_id = bs.payment_intent_id',
            'SELECT 1 FROM hotel_bookings h2 WHERE h2.payment_intent_id = bs.payment_intent_id',
        ]) {
            expect(q).toContain(guard);
        }
    });

    /**
     * Minor units in one table, decimals everywhere else. Dividing by 100 is right for two-decimal
     * currencies only: `hotel_bookings.amount_minor` is the Stripe amount (`toStripeAmount`), which
     * for JPY and KRW is already whole units, so a blanket `/ 100` showed ¥72,576 as 725.76.
     */
    it('converts hotel_bookings minor units to the decimal the other arms use', () => {
        expect(sql()).toMatch(
            /CASE WHEN LOWER\(hb\.currency\) IN \([^)]*\) THEN hb\.amount_minor::numeric ELSE hb\.amount_minor::numeric \/ 100 END/,
        );
    });

    it('takes its zero-decimal list from pricing, so there is one list to keep right', () => {
        expect(unionSelect().values).toEqual([...ZERO_DECIMAL_CURRENCIES]);
    });

    /**
     * The sources disagree on case: checkout sessions keep Stripe's lower-case `usd`, every booking
     * table keeps `USD`. Left as stored, the currency filter matched one set and silently skipped
     * the other — `?currency=USD` returned no checkout sessions at all.
     */
    it('reads currency in one case from every arm', () => {
        const q = sql();
        for (const column of ['b.currency', 'hb.currency', 'fb.currency', 'bs.currency']) {
            expect(q).toContain(`UPPER(${column})`);
        }
    });

    /** Whatever case the caller typed, it must meet the normalised column. */
    it.each(['usd', 'USD', 'Usd'])('filters currency %s against the normalised column', async (typed) => {
        db.queryRaw.mockReset();
        db.queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }]);

        await listPayments({ currency: typed }, { limit: 5, offset: 0 });

        const page = db.queryRaw.mock.calls[0][0];
        expect(page.values).toContain('USD');
        expect(page.values).not.toContain(typed === 'USD' ? 'usd' : typed);
    });

    /** Each arm names itself, which is how the page marks a payment recorded in two places. */
    it('labels every arm with its source table', () => {
        const q = sql();
        for (const label of ["'bookings'", "'hotel_bookings'", "'flight_bookings'", "'booking_sessions'"]) {
            expect(q).toContain(label);
        }
    });

    /** UNION would collapse a genuine double-write, which is the thing worth seeing. */
    it('keeps duplicates rather than collapsing them', () => {
        expect(sql()).toContain('UNION ALL');
        expect(sql()).not.toMatch(/UNION(?! ALL)/);
    });
});
