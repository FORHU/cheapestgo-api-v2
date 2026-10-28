/**
 * Persistence for the hotel booking lifecycle (db/migrations/20261015000001_hotel_booking_lifecycle.sql).
 *
 * Raw SQL, like `supplierAttempt.ts`: the tables are authored as migrations and brought into
 * the Prisma schema by `db pull` after they are applied by hand, so nothing here can wait on a
 * generated model.
 *
 * Two properties every method keeps:
 *
 * **It never throws.** By the time most of these run, money has moved or is about to. A
 * lifecycle write that fails must not become a failed booking or a stranded payment — it is
 * logged loudly and the caller carries on as it did before this table existed. The price is a
 * gap in the record, which is the lesser harm and is exactly what the supplier-attempt log
 * covers independently.
 *
 * **It distinguishes "unavailable" from "lost".** `transition` returns `lost` when another
 * caller moved the booking first — the answer the claim exists to give — and `unavailable`
 * when the table could not be reached at all, in which case the caller must not mistake an
 * outage for having lost a race and must fall back to the previous behaviour.
 */

import { prisma } from '@/lib/prisma';
import {
    assertTransition,
    isHotelBookingStatus,
    type HotelBookingStatus,
    type LifecycleActor,
} from '@/lib/hotels/lifecycle/stateMachine';

export type TransitionResult = 'applied' | 'lost' | 'unavailable';

export interface LifecycleGuest {
    kind:      'holder' | 'adult' | 'child';
    firstName: string;
    lastName:  string;
    age?:      number | null;
    email?:    string | null;
}

export interface LifecycleRecord {
    id:                string;
    reference:         string;
    userId:            string;
    status:            HotelBookingStatus;
    provider:          string;
    prebookRef:        string;
    paymentIntentId:   string | null;
    hotelCode:         string | null;
    propertyName:      string | null;
    roomName:          string | null;
    checkIn:           string | null;
    checkOut:          string | null;
    currency:          string;
    amountMinor:       number;
    draft:             Record<string, unknown>;
    supplierReference: string | null;
    failureCode:       string | null;
    failureMessage:    string | null;
    createdAt:         Date;
    updatedAt:         Date;
}

export interface BeginInput {
    reference:       string;
    userId:          string;
    provider:        string;
    prebookRef:      string;
    paymentIntentId: string;
    currency:        string;
    amountMinor:     number;
    hotelCode?:      string | null;
    propertyName?:   string | null;
    roomName?:       string | null;
    checkIn?:        string | null;
    checkOut?:       string | null;
    draft?:          Record<string, unknown>;
}

export interface TransitionOptions {
    actor:    LifecycleActor;
    reason?:  string;
    payload?: Record<string, unknown>;
    patch?:   { supplierReference?: string | null; failureCode?: string | null; failureMessage?: string | null };
}

interface Row {
    id:                string;
    booking_reference: string;
    user_id:           string;
    status:            string;
    provider:          string;
    prebook_ref:       string;
    payment_intent_id: string | null;
    hotel_code:        string | null;
    property_name:     string | null;
    room_name:         string | null;
    check_in:          Date | string | null;
    check_out:         Date | string | null;
    currency:          string;
    amount_minor:      bigint | number | string;
    draft:             Record<string, unknown> | null;
    supplier_reference: string | null;
    failure_code:      string | null;
    failure_message:   string | null;
    created_at:        Date;
    updated_at:        Date;
}

const COLUMNS = `id, booking_reference, user_id, status, provider, prebook_ref, payment_intent_id,
    hotel_code, property_name, room_name, check_in, check_out, currency, amount_minor, draft,
    supplier_reference, failure_code, failure_message, created_at, updated_at`;

const dateOnly = (v: Date | string | null): string | null =>
    v == null ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

function toRecord(r: Row): LifecycleRecord | null {
    if (!isHotelBookingStatus(r.status)) {
        console.error(`[hotel-lifecycle] ${r.booking_reference} has an unknown status "${r.status}"`);
        return null;
    }
    return {
        id:                r.id,
        reference:         r.booking_reference,
        userId:            r.user_id,
        status:            r.status,
        provider:          r.provider,
        prebookRef:        r.prebook_ref,
        paymentIntentId:   r.payment_intent_id,
        hotelCode:         r.hotel_code,
        propertyName:      r.property_name,
        roomName:          r.room_name,
        checkIn:           dateOnly(r.check_in),
        checkOut:          dateOnly(r.check_out),
        currency:          r.currency,
        amountMinor:       Number(r.amount_minor),
        draft:             r.draft ?? {},
        supplierReference: r.supplier_reference,
        failureCode:       r.failure_code,
        failureMessage:    r.failure_message,
        createdAt:         r.created_at,
        updatedAt:         r.updated_at,
    };
}

// One warning per process for a missing table, not one per request.
let warnedUnavailable = false;

function unavailable(label: string, err: unknown): void {
    const message = (err as { message?: string } | null)?.message ?? String(err);
    const missingTable = /hotel_booking\w*|relation .* does not exist|42P01/i.test(message);
    if (missingTable) {
        if (warnedUnavailable) return;
        warnedUnavailable = true;
        console.warn(
            `[hotel-lifecycle] ${label}: lifecycle tables are not available (${message.slice(0, 160)}). `
            + 'Continuing without a lifecycle record — apply db/migrations/20261015000001_hotel_booking_lifecycle.sql.',
        );
        return;
    }
    console.error(`[hotel-lifecycle] ${label} failed: ${message.slice(0, 300)}`);
}

export class HotelBookingLifecycleRepository {
    /** For tests: the once-per-process warning would otherwise be swallowed by an earlier test. */
    static resetWarnings(): void { warnedUnavailable = false; }

    /**
     * Opens an attempt at PAYMENT_PENDING, or returns the one this reference already has.
     *
     * Replays are normal — a traveller who steps back from payment and proceeds again repeats
     * the request under the same idempotency key, and so under the same reference. A replay
     * must find the attempt, not regress it, so only descriptive fields are refreshed.
     */
    async begin(input: BeginInput): Promise<LifecycleRecord | null> {
        try {
            // An earlier, unpaid attempt on this same quote is superseded rather than left to
            // collide with the live-attempt index when the prebook was refreshed.
            await prisma.$executeRaw`
                WITH superseded AS (
                    UPDATE hotel_bookings
                       SET status = 'EXPIRED', failure_code = 'SUPERSEDED', updated_at = now()
                     WHERE user_id = ${input.userId}::uuid
                       AND prebook_ref = ${input.prebookRef}
                       AND booking_reference <> ${input.reference}
                       AND status = 'PAYMENT_PENDING'
                 RETURNING id
                )
                INSERT INTO hotel_booking_events (booking_id, from_status, to_status, actor, reason)
                SELECT id, 'PAYMENT_PENDING', 'EXPIRED', 'browser', 'superseded by a newer attempt on the same quote'
                  FROM superseded`;

            const draft = JSON.stringify(input.draft ?? {});
            const rows = await prisma.$queryRawUnsafe<Row[]>(
                `INSERT INTO hotel_bookings (
                     booking_reference, user_id, status, provider, prebook_ref, payment_intent_id,
                     currency, amount_minor, hotel_code, property_name, room_name, check_in, check_out, draft
                 ) VALUES ($1, $2::uuid, 'PAYMENT_PENDING', $3, $4, $5, $6, $7::bigint, $8, $9, $10, $11::date, $12::date, $13::jsonb)
                 ON CONFLICT (booking_reference) DO UPDATE SET
                     payment_intent_id = COALESCE(hotel_bookings.payment_intent_id, EXCLUDED.payment_intent_id),
                     draft = CASE WHEN EXCLUDED.draft = '{}'::jsonb THEN hotel_bookings.draft ELSE EXCLUDED.draft END,
                     updated_at = now()
                 RETURNING ${COLUMNS}`,
                input.reference, input.userId, input.provider, input.prebookRef, input.paymentIntentId,
                input.currency.toUpperCase(), String(input.amountMinor),
                input.hotelCode ?? null, input.propertyName ?? null, input.roomName ?? null,
                input.checkIn ?? null, input.checkOut ?? null, draft,
            );
            const record = rows[0] ? toRecord(rows[0]) : null;
            if (!record) return null;

            // Only the very first sight of an attempt gets a creation event.
            if (record.status === 'PAYMENT_PENDING') {
                await prisma.$executeRaw`
                    INSERT INTO hotel_booking_events (booking_id, from_status, to_status, actor, reason)
                    SELECT ${record.id}::uuid, NULL, 'PAYMENT_PENDING', 'browser', 'payment created'
                     WHERE NOT EXISTS (SELECT 1 FROM hotel_booking_events WHERE booking_id = ${record.id}::uuid)`;
            }

            await prisma.$executeRaw`
                INSERT INTO hotel_booking_payments (booking_id, payment_intent_id, amount_minor, currency)
                VALUES (${record.id}::uuid, ${input.paymentIntentId}, ${String(input.amountMinor)}::bigint, ${input.currency.toUpperCase()})
                ON CONFLICT (payment_intent_id) DO NOTHING`;

            return record;
        } catch (err) {
            unavailable('begin', err);
            return null;
        }
    }

    /**
     * Moves a booking, atomically, only if it is still in one of `from`.
     *
     * This is the claim. The status test and the write are one statement, so of any number of
     * callers racing for the same booking exactly one gets `applied` and the rest get `lost`.
     */
    async transition(
        reference: string,
        from: HotelBookingStatus | HotelBookingStatus[],
        to: HotelBookingStatus,
        options: TransitionOptions,
    ): Promise<TransitionResult> {
        const froms = Array.isArray(from) ? from : [from];
        // A programming error, not an outage: refuse before any SQL.
        for (const f of froms) assertTransition(f, to);

        try {
            const patch = options.patch ?? {};
            const rows = await prisma.$queryRaw<{ booking_id: string }[]>`
                WITH prior AS (
                    SELECT id, status AS from_status
                      FROM hotel_bookings
                     WHERE booking_reference = ${reference}
                       AND status = ANY(${froms}::text[])
                       FOR UPDATE
                ), moved AS (
                    UPDATE hotel_bookings h
                       SET status             = ${to},
                           supplier_reference = COALESCE(${patch.supplierReference ?? null}, h.supplier_reference),
                           failure_code       = COALESCE(${patch.failureCode ?? null}, h.failure_code),
                           failure_message    = COALESCE(${patch.failureMessage?.slice(0, 500) ?? null}, h.failure_message),
                           updated_at         = now()
                      FROM prior
                     WHERE h.id = prior.id
                 RETURNING h.id, prior.from_status
                )
                INSERT INTO hotel_booking_events (booking_id, from_status, to_status, actor, reason, payload)
                SELECT id, from_status, ${to}, ${options.actor}, ${options.reason ?? null},
                       ${options.payload ? JSON.stringify(options.payload) : null}::jsonb
                  FROM moved
                RETURNING booking_id`;
            return rows.length > 0 ? 'applied' : 'lost';
        } catch (err) {
            unavailable(`transition ${froms.join('|')}→${to}`, err);
            return 'unavailable';
        }
    }

    /** A note on an attempt that is not a state change (a retried capture, a read-back result). */
    async note(reference: string, actor: LifecycleActor, reason: string, payload?: Record<string, unknown>): Promise<void> {
        try {
            await prisma.$executeRaw`
                INSERT INTO hotel_booking_events (booking_id, from_status, to_status, actor, reason, payload)
                SELECT id, status, status, ${actor}, ${reason}, ${payload ? JSON.stringify(payload) : null}::jsonb
                  FROM hotel_bookings WHERE booking_reference = ${reference}`;
        } catch (err) {
            unavailable('note', err);
        }
    }

    async findByReference(reference: string): Promise<LifecycleRecord | null> {
        try {
            const rows = await prisma.$queryRawUnsafe<Row[]>(
                `SELECT ${COLUMNS} FROM hotel_bookings WHERE booking_reference = $1 LIMIT 1`, reference,
            );
            return rows[0] ? toRecord(rows[0]) : null;
        } catch (err) {
            unavailable('findByReference', err);
            return null;
        }
    }

    async findByPaymentIntent(paymentIntentId: string): Promise<LifecycleRecord | null> {
        try {
            const rows = await prisma.$queryRawUnsafe<Row[]>(
                `SELECT ${COLUMNS} FROM hotel_bookings WHERE payment_intent_id = $1 LIMIT 1`, paymentIntentId,
            );
            return rows[0] ? toRecord(rows[0]) : null;
        } catch (err) {
            unavailable('findByPaymentIntent', err);
            return null;
        }
    }

    /** What the traveller's confirmation was for, so a webhook can complete it unattended. */
    async saveConfirmInputs(
        reference: string,
        input: { draft: Record<string, unknown>; guests: LifecycleGuest[] },
    ): Promise<boolean> {
        try {
            const found = await prisma.$queryRaw<{ id: string }[]>`
                UPDATE hotel_bookings
                   SET draft = draft || ${JSON.stringify(input.draft)}::jsonb, updated_at = now()
                 WHERE booking_reference = ${reference}
             RETURNING id`;
            const id = found[0]?.id;
            if (!id) return false;

            await prisma.$executeRaw`DELETE FROM hotel_booking_guests WHERE booking_id = ${id}::uuid`;
            for (const [position, g] of input.guests.entries()) {
                await prisma.$executeRaw`
                    INSERT INTO hotel_booking_guests (booking_id, position, kind, first_name, last_name, age, email)
                    VALUES (${id}::uuid, ${position}, ${g.kind}, ${g.firstName}, ${g.lastName}, ${g.age ?? null}, ${g.email ?? null})`;
            }
            return true;
        } catch (err) {
            unavailable('saveConfirmInputs', err);
            return false;
        }
    }

    async loadGuests(reference: string): Promise<LifecycleGuest[]> {
        try {
            const rows = await prisma.$queryRaw<Array<{
                kind: LifecycleGuest['kind']; first_name: string; last_name: string; age: number | null; email: string | null;
            }>>`
                SELECT g.kind, g.first_name, g.last_name, g.age, g.email
                  FROM hotel_booking_guests g
                  JOIN hotel_bookings h ON h.id = g.booking_id
                 WHERE h.booking_reference = ${reference}
              ORDER BY g.position`;
            return rows.map((r) => ({
                kind: r.kind, firstName: r.first_name, lastName: r.last_name, age: r.age, email: r.email,
            }));
        } catch (err) {
            unavailable('loadGuests', err);
            return [];
        }
    }

    async markPayment(
        paymentIntentId: string,
        status: 'authorized' | 'captured' | 'voided' | 'failed',
    ): Promise<void> {
        try {
            await prisma.$executeRaw`
                UPDATE hotel_booking_payments
                   SET status      = ${status},
                       captured_at = CASE WHEN ${status} = 'captured' THEN now() ELSE captured_at END,
                       voided_at   = CASE WHEN ${status} = 'voided'   THEN now() ELSE voided_at   END,
                       updated_at  = now()
                 WHERE payment_intent_id = ${paymentIntentId}`;
        } catch (err) {
            unavailable('markPayment', err);
        }
    }

    /**
     * Attempts that have sat in `statuses` longer than `olderThan` and for which the supplier
     * was never asked anything, which is what makes voiding them safe. An attempt with a
     * supplier call recorded against its reference is excluded however old it is: it needs a
     * person, not a sweep (ADR-0026).
     */
    async findAbandoned(statuses: HotelBookingStatus[], olderThan: Date, limit = 100): Promise<LifecycleRecord[]> {
        try {
            const rows = await prisma.$queryRawUnsafe<Row[]>(
                `SELECT ${COLUMNS} FROM hotel_bookings h
                  WHERE h.status = ANY($1::text[])
                    AND h.updated_at < $2
                    AND NOT EXISTS (
                        SELECT 1 FROM supplier_booking_attempts a
                         WHERE a.client_reference = h.booking_reference
                    )
               ORDER BY h.updated_at
                  LIMIT $3`,
                statuses, olderThan, limit,
            );
            return rows.map(toRecord).filter((r): r is LifecycleRecord => r !== null);
        } catch (err) {
            unavailable('findAbandoned', err);
            return [];
        }
    }

    /** Attempts stuck where a person has to look: the supplier may hold a reservation. */
    async findNeedingAttention(olderThan: Date, limit = 100): Promise<LifecycleRecord[]> {
        try {
            const rows = await prisma.$queryRawUnsafe<Row[]>(
                `SELECT ${COLUMNS} FROM hotel_bookings
                  WHERE status IN ('SUPPLIER_BOOKING', 'NEEDS_REVIEW')
                    AND updated_at < $1
               ORDER BY updated_at
                  LIMIT $2`,
                olderThan, limit,
            );
            return rows.map(toRecord).filter((r): r is LifecycleRecord => r !== null);
        } catch (err) {
            unavailable('findNeedingAttention', err);
            return [];
        }
    }

    async events(reference: string): Promise<Array<{
        from: string | null; to: string; actor: string; reason: string | null; at: Date;
    }>> {
        try {
            const rows = await prisma.$queryRaw<Array<{
                from_status: string | null; to_status: string; actor: string; reason: string | null; created_at: Date;
            }>>`
                SELECT e.from_status, e.to_status, e.actor, e.reason, e.created_at
                  FROM hotel_booking_events e
                  JOIN hotel_bookings h ON h.id = e.booking_id
                 WHERE h.booking_reference = ${reference}
              ORDER BY e.created_at, e.id`;
            return rows.map((r) => ({ from: r.from_status, to: r.to_status, actor: r.actor, reason: r.reason, at: r.created_at }));
        } catch (err) {
            unavailable('events', err);
            return [];
        }
    }
}
