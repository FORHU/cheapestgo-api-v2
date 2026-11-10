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

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { unionSelect } from '@/repositories/payments.repository';

const sql = () => unionSelect().sql.replace(/\s+/g, ' ');

describe('the payments union', () => {
    it('falls back to booking_id for the bookings arm, which has no reference of its own', () => {
        expect(sql()).toContain('COALESCE(NULLIF(TRIM(b.booking_reference), \'\'), b.booking_id)');
    });

    /** An empty string is as unhelpful as a null, and reads as a reference that exists. */
    it('treats a blank reference as absent rather than printing it', () => {
        expect(sql()).toMatch(/NULLIF\(TRIM\(b\.booking_reference\), ''\)/);
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

    /** Minor units in one table, decimals everywhere else; summing them raw is off by 100. */
    it('converts hotel_bookings minor units to the decimal the other arms use', () => {
        expect(sql()).toContain('(hb.amount_minor::numeric / 100)');
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
