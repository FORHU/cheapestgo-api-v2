/**
 * Golf bookings (CONTEXT.md, "Golf Booking") and the tee-time spots they take. Data only: which move
 * is allowed when is GolfBookingsService's call. What this file guarantees is that spots and statuses
 * move together, in one transaction, and only from the state the caller expects:
 *
 *   - Spots are taken with one conditional UPDATE (`spots_left >= n`), so two customers can never
 *     both get the last spot, with no lock and no count read first.
 *   - A booking leaves `held` or `requested` for a closed state, giving its spots back, only if it
 *     is still in the state named — so a webhook, the booking page and the sweep can all race to
 *     move the same booking and exactly one of them does.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type GolfBookingStatus = 'held' | 'requested' | 'confirmed' | 'expired' | 'declined';
export type GolfCloseReason = 'hold_expired' | 'declined_by_team' | 'not_confirmed_in_time';
/** The admin screen's three lists. */
export type GolfBookingView = 'waiting' | 'upcoming' | 'closed';

export interface GolfBooking {
    id:              string;
    reference:       string;
    userId:          string;
    courseId:        string;
    teeTimeId:       string;
    players:         number;
    leadName:        string;
    contactEmail:    string;
    /** What the course asks per player, in its own currency. */
    courseCurrency:  string;
    pricePerPlayer:  number;
    /** What the customer pays in: `greenFee + serviceFee = total`, all in this currency. */
    currency:        string;
    fxRate:          number;
    greenFee:        number;
    serviceFee:      number;
    total:           number;
    paymentIntentId: string | null;
    status:          GolfBookingStatus;
    holdExpiresAt:   string;
    requestedAt:     string | null;
    decideBy:        string | null;
    confirmedAt:     string | null;
    closedAt:        string | null;
    closeReason:     GolfCloseReason | null;
    createdAt:       string;
    startsAt:        string;
    course: {
        slug:     string;
        name:     string;
        city:     string;
        country:  string;
        timezone: string | null;
        imageUrl: string | null;
    };
}

/** A tee time with what deciding whether it can be booked needs from its course. */
export interface BookableTeeTime {
    id:             string;
    courseId:       string;
    startsAt:       Date;
    spotsLeft:      number;
    pricePerPlayer: number;
    currency:       string;
    status:         'open' | 'closed';
    course: {
        slug:              string;
        name:              string;
        status:            'draft' | 'published';
        timezone:          string | null;
        bookingWindowDays: number;
    };
}

export interface NewHold {
    reference:      string;
    userId:         string;
    courseId:       string;
    teeTimeId:      string;
    players:        number;
    leadName:       string;
    contactEmail:   string;
    courseCurrency: string;
    pricePerPlayer: number;
    currency:       string;
    fxRate:         number;
    greenFee:       number;
    serviceFee:     number;
    total:          number;
    holdExpiresAt:  Date;
}

export type HoldOutcome =
    | { result: 'held'; booking: GolfBooking; released: Array<{ id: string; paymentIntentId: string | null }> }
    | { result: 'no_spots'; spotsLeft: number; released: Array<{ id: string; paymentIntentId: string | null }> };

type Row = {
    id: string; reference: string; user_id: string; course_id: string; tee_time_id: string;
    players: number; lead_name: string; contact_email: string;
    course_currency: string; price_per_player: Prisma.Decimal | string | number;
    currency: string; fx_rate: Prisma.Decimal | string | number;
    green_fee: Prisma.Decimal | string | number; service_fee: Prisma.Decimal | string | number;
    total: Prisma.Decimal | string | number;
    payment_intent_id: string | null; status: GolfBookingStatus;
    hold_expires_at: Date; requested_at: Date | null; decide_by: Date | null; confirmed_at: Date | null;
    closed_at: Date | null; close_reason: GolfCloseReason | null; created_at: Date;
    starts_at: Date;
    course_slug: string; course_name: string; course_city: string; course_country: string;
    course_timezone: string | null; course_image: string | null;
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

function toBooking(r: Row): GolfBooking {
    return {
        id:              r.id,
        reference:       r.reference,
        userId:          r.user_id,
        courseId:        r.course_id,
        teeTimeId:       r.tee_time_id,
        players:         Number(r.players),
        leadName:        r.lead_name,
        contactEmail:    r.contact_email,
        courseCurrency:  r.course_currency.trim(),
        pricePerPlayer:  Number(r.price_per_player),
        currency:        r.currency.trim(),
        fxRate:          Number(r.fx_rate),
        greenFee:        Number(r.green_fee),
        serviceFee:      Number(r.service_fee),
        total:           Number(r.total),
        paymentIntentId: r.payment_intent_id,
        status:          r.status,
        holdExpiresAt:   iso(r.hold_expires_at)!,
        requestedAt:     iso(r.requested_at),
        decideBy:        iso(r.decide_by),
        confirmedAt:     iso(r.confirmed_at),
        closedAt:        iso(r.closed_at),
        closeReason:     r.close_reason,
        createdAt:       iso(r.created_at)!,
        startsAt:        iso(r.starts_at)!,
        course: {
            slug:     r.course_slug,
            name:     r.course_name,
            city:     r.course_city,
            country:  r.course_country,
            timezone: r.course_timezone,
            imageUrl: r.course_image,
        },
    };
}

/** Every booking query reads the same columns, with its tee time's start and its course's face. */
const SELECT_BOOKING = `
    SELECT b.*, t.starts_at,
           c.slug AS course_slug, c.name AS course_name, c.city AS course_city, c.country AS course_country,
           c.timezone AS course_timezone, c.image_urls[1] AS course_image
    FROM golf_bookings b
    JOIN golf_tee_times t ON t.id = b.tee_time_id
    JOIN golf_courses   c ON c.id = b.course_id`;

type Tx = Prisma.TransactionClient;

export class GolfBookingsRepository {
    async findTeeTime(teeTimeId: string): Promise<BookableTeeTime | null> {
        const rows = await prisma.$queryRaw<Array<{
            id: string; course_id: string; starts_at: Date; spots_left: number;
            price_per_player: Prisma.Decimal | string | number; currency: string; status: 'open' | 'closed';
            slug: string; name: string; course_status: 'draft' | 'published'; timezone: string | null; booking_window_days: number;
        }>>`
            SELECT t.id, t.course_id, t.starts_at, t.spots_left, t.price_per_player, t.currency, t.status,
                   c.slug, c.name, c.status AS course_status, c.timezone, c.booking_window_days
            FROM golf_tee_times t JOIN golf_courses c ON c.id = t.course_id
            WHERE t.id = ${teeTimeId}::uuid`;
        const r = rows[0];
        if (!r) return null;
        return {
            id:             r.id,
            courseId:       r.course_id,
            startsAt:       new Date(r.starts_at),
            spotsLeft:      Number(r.spots_left),
            pricePerPlayer: Number(r.price_per_player),
            currency:       r.currency.trim(),
            status:         r.status,
            course: {
                slug:              r.slug,
                name:              r.name,
                status:            r.course_status,
                timezone:          r.timezone,
                bookingWindowDays: Number(r.booking_window_days),
            },
        };
    }

    async findByReference(reference: string): Promise<GolfBooking | null> {
        const rows = await prisma.$queryRawUnsafe<Row[]>(`${SELECT_BOOKING} WHERE b.reference = $1`, reference);
        return rows[0] ? toBooking(rows[0]) : null;
    }

    async findByPaymentIntent(paymentIntentId: string): Promise<GolfBooking | null> {
        const rows = await prisma.$queryRawUnsafe<Row[]>(`${SELECT_BOOKING} WHERE b.payment_intent_id = $1`, paymentIntentId);
        return rows[0] ? toBooking(rows[0]) : null;
    }

    /** The customer's live hold on this tee time, if any (there is at most one). */
    async findLiveHold(userId: string, teeTimeId: string): Promise<GolfBooking | null> {
        const rows = await prisma.$queryRawUnsafe<Row[]>(
            `${SELECT_BOOKING} WHERE b.user_id = $1::uuid AND b.tee_time_id = $2::uuid AND b.status = 'held'`,
            userId, teeTimeId,
        );
        return rows[0] ? toBooking(rows[0]) : null;
    }

    async referenceExists(reference: string): Promise<boolean> {
        const rows = await prisma.$queryRaw<Array<{ one: number }>>`
            SELECT 1 AS one FROM golf_bookings WHERE reference = ${reference} LIMIT 1`;
        return rows.length > 0;
    }

    /**
     * Take `players` spots and open a held booking for them, in one transaction. The customer's other
     * live holds are released first — a customer pays for one tee time at a time — and reported, so the
     * caller can cancel their payments. When there are not enough spots nothing is taken.
     */
    async hold(h: NewHold): Promise<HoldOutcome> {
        return prisma.$transaction(async (tx) => {
            const released = await this.releaseHoldsOf(tx, h.userId);

            const taken = await tx.$queryRaw<Array<{ spots_left: number }>>`
                UPDATE golf_tee_times SET spots_left = spots_left - ${h.players}
                WHERE id = ${h.teeTimeId}::uuid AND status = 'open' AND spots_left >= ${h.players}
                RETURNING spots_left`;
            if (taken.length === 0) {
                const [left] = await tx.$queryRaw<Array<{ spots_left: number }>>`
                    SELECT spots_left FROM golf_tee_times WHERE id = ${h.teeTimeId}::uuid`;
                return { result: 'no_spots', spotsLeft: Number(left?.spots_left ?? 0), released };
            }

            const [inserted] = await tx.$queryRaw<Array<{ id: string }>>`
                INSERT INTO golf_bookings (
                    reference, user_id, course_id, tee_time_id, players, lead_name, contact_email,
                    course_currency, price_per_player, currency, fx_rate, green_fee, service_fee, total,
                    status, hold_expires_at)
                VALUES (
                    ${h.reference}, ${h.userId}::uuid, ${h.courseId}::uuid, ${h.teeTimeId}::uuid, ${h.players},
                    ${h.leadName}, ${h.contactEmail}, ${h.courseCurrency}, ${h.pricePerPlayer}, ${h.currency},
                    ${h.fxRate}, ${h.greenFee}, ${h.serviceFee}, ${h.total}, 'held', ${h.holdExpiresAt})
                RETURNING id`;
            const rows = await tx.$queryRawUnsafe<Row[]>(`${SELECT_BOOKING} WHERE b.id = $1::uuid`, inserted.id);
            return { result: 'held', booking: toBooking(rows[0]), released };
        });
    }

    async attachPaymentIntent(id: string, paymentIntentId: string): Promise<void> {
        await prisma.$executeRaw`
            UPDATE golf_bookings SET payment_intent_id = ${paymentIntentId}, updated_at = now()
            WHERE id = ${id}::uuid`;
    }

    /** `held` → `requested`, once the card is authorised. Null when it was not `held`. */
    async markRequested(id: string, requestedAt: Date, decideBy: Date): Promise<GolfBooking | null> {
        const moved = await prisma.$executeRaw`
            UPDATE golf_bookings
            SET status = 'requested', requested_at = ${requestedAt}, decide_by = ${decideBy}, updated_at = now()
            WHERE id = ${id}::uuid AND status = 'held'`;
        return moved > 0 ? this.findById(id) : null;
    }

    /** `requested` → `confirmed`, once the payment is captured. Null when it was not `requested`. */
    async markConfirmed(id: string, at: Date): Promise<GolfBooking | null> {
        const moved = await prisma.$executeRaw`
            UPDATE golf_bookings SET status = 'confirmed', confirmed_at = ${at}, updated_at = now()
            WHERE id = ${id}::uuid AND status = 'requested'`;
        return moved > 0 ? this.findById(id) : null;
    }

    /**
     * Close a booking that is still `from`, and give its spots back to the tee time. Null when it had
     * already moved on — someone else closed or confirmed it first.
     */
    async close(id: string, from: 'held' | 'requested', to: 'expired' | 'declined', reason: GolfCloseReason, at: Date): Promise<GolfBooking | null> {
        const closed = await prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<Array<{ tee_time_id: string; players: number }>>`
                UPDATE golf_bookings
                SET status = ${to}, close_reason = ${reason}, closed_at = ${at}, updated_at = now()
                WHERE id = ${id}::uuid AND status = ${from}
                RETURNING tee_time_id, players`;
            if (rows.length === 0) return false;
            await this.giveBack(tx, rows[0].tee_time_id, Number(rows[0].players));
            return true;
        });
        return closed ? this.findById(id) : null;
    }

    async findById(id: string): Promise<GolfBooking | null> {
        const rows = await prisma.$queryRawUnsafe<Row[]>(`${SELECT_BOOKING} WHERE b.id = $1::uuid`, id);
        return rows[0] ? toBooking(rows[0]) : null;
    }

    /** Holds past their expiry and requests past their deadline, oldest first. */
    async dueForSweep(now: Date, limit: number): Promise<{ holds: GolfBooking[]; overdue: GolfBooking[] }> {
        const [holds, overdue] = await Promise.all([
            prisma.$queryRawUnsafe<Row[]>(
                `${SELECT_BOOKING} WHERE b.status = 'held' AND b.hold_expires_at <= $1 ORDER BY b.hold_expires_at LIMIT $2`,
                now, limit,
            ),
            prisma.$queryRawUnsafe<Row[]>(
                `${SELECT_BOOKING} WHERE b.status = 'requested' AND b.decide_by <= $1 ORDER BY b.decide_by LIMIT $2`,
                now, limit,
            ),
        ]);
        return { holds: holds.map(toBooking), overdue: overdue.map(toBooking) };
    }

    /**
     * One of the admin screen's lists. Waiting: requests to answer, the nearest deadline first.
     * Upcoming: confirmed tee times still to be played, soonest first. Closed: everything that ended,
     * and confirmed rounds already played, latest first.
     */
    async listForAdmin(view: GolfBookingView, now: Date, page: number, pageSize: number): Promise<{ bookings: GolfBooking[]; total: number }> {
        const where = {
            waiting:  `b.status = 'requested'`,
            upcoming: `b.status = 'confirmed' AND t.starts_at >= $1`,
            closed:   `(b.status IN ('expired', 'declined') OR (b.status = 'confirmed' AND t.starts_at < $1))`,
        }[view];
        const order = {
            waiting:  'b.decide_by ASC',
            upcoming: 't.starts_at ASC',
            closed:   'COALESCE(b.closed_at, t.starts_at) DESC',
        }[view];
        const [rows, counted] = await Promise.all([
            prisma.$queryRawUnsafe<Row[]>(
                `${SELECT_BOOKING} WHERE ${where} AND $1::timestamptz IS NOT NULL ORDER BY ${order} LIMIT $2 OFFSET $3`,
                now, pageSize, (page - 1) * pageSize,
            ),
            prisma.$queryRawUnsafe<Array<{ n: number }>>(
                `SELECT count(*)::int AS n FROM golf_bookings b JOIN golf_tee_times t ON t.id = b.tee_time_id
                 WHERE ${where} AND $1::timestamptz IS NOT NULL`,
                now,
            ),
        ]);
        return { bookings: rows.map(toBooking), total: Number(counted[0]?.n ?? 0) };
    }

    /** Release every live hold of this customer, spots and all; reports them for their payments. */
    private async releaseHoldsOf(tx: Tx, userId: string): Promise<Array<{ id: string; paymentIntentId: string | null }>> {
        const rows = await tx.$queryRaw<Array<{ id: string; tee_time_id: string; players: number; payment_intent_id: string | null }>>`
            UPDATE golf_bookings
            SET status = 'expired', close_reason = 'hold_expired', closed_at = now(), updated_at = now()
            WHERE user_id = ${userId}::uuid AND status = 'held'
            RETURNING id, tee_time_id, players, payment_intent_id`;
        for (const r of rows) await this.giveBack(tx, r.tee_time_id, Number(r.players));
        return rows.map((r) => ({ id: r.id, paymentIntentId: r.payment_intent_id }));
    }

    private async giveBack(tx: Tx, teeTimeId: string, players: number): Promise<void> {
        // LEAST: a tee time is never given more spots than it has, whatever happened to it meanwhile.
        await tx.$executeRaw`
            UPDATE golf_tee_times SET spots_left = LEAST(spots, spots_left + ${players})
            WHERE id = ${teeTimeId}::uuid`;
    }
}
