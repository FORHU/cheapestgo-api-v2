/**
 * Persistence for the flight booking lifecycle (db/migrations/20261016000001_flight_booking_lifecycle.sql).
 *
 * The attempt is the `booking_sessions` row; this reads and moves its `lifecycle_status` and
 * appends to `flight_booking_events`. Raw SQL, like the hotel lifecycle repository: the column
 * and table are authored as a migration and reach the Prisma schema by `db pull` after they are
 * applied by hand, so nothing here can wait on a generated model.
 *
 * `booking_sessions` has no columns for why an attempt failed or which airline order it holds,
 * and the migration adds none. Both travel in the payload of the event that recorded them, and
 * a read takes them from the latest such event — `flight_booking_events` is the record of "how
 * did this get here", and that is what they are.
 *
 * Two properties every method keeps, as in hotelBookingLifecycle.repository.ts:
 *
 * **It never throws.** By the time most of these run, money has moved or is about to. A failed
 * lifecycle write is logged and the caller carries on as it did before this column existed.
 *
 * **It distinguishes "unavailable" from "lost".** `transition` returns `lost` when another
 * caller moved the attempt first — the answer the claim exists to give — and `unavailable` when
 * the column or table could not be reached at all, which the caller must not mistake for having
 * lost a race.
 */

import { prisma } from '@/lib/prisma';
import {
    assertTransition,
    isFlightBookingStatus,
    type FlightBookingStatus,
    type LifecycleActor,
} from '@/lib/flights/lifecycle/stateMachine';

export type TransitionResult = 'applied' | 'lost' | 'unavailable';

export interface FlightLifecycleRecord {
    sessionId:       string;
    userId:          string;
    provider:        string;
    status:          FlightBookingStatus;
    paymentIntentId: string | null;
    captureMethod:   string | null;
    createdAt:       Date;
    updatedAt:       Date;
    /** From the latest event that recorded one. */
    failureCode:     string | null;
    failureMessage:  string | null;
    /** The Duffel order this attempt holds, from the latest event that recorded one. */
    supplierOrderId: string | null;
}

export interface TransitionOptions {
    actor:    LifecycleActor;
    reason?:  string;
    payload?: Record<string, unknown>;
    /** Merged into the event payload, where a read finds it again. */
    patch?:   { failureCode?: string | null; failureMessage?: string | null; supplierOrderId?: string | null };
}

export interface FlightLifecycleEvent {
    from:    string | null;
    to:      string;
    actor:   string;
    reason:  string | null;
    payload: Record<string, unknown> | null;
    at:      Date;
}

interface Row {
    id:                string;
    user_id:           string;
    provider:          string;
    lifecycle_status:  string;
    payment_intent_id: string | null;
    capture_method:    string | null;
    created_at:        Date;
    updated_at:        Date;
    failure_code:      string | null;
    failure_message:   string | null;
    supplier_order_id: string | null;
}

/** A session with the detail its events carry. `s` is booking_sessions. */
const SELECT = `
    SELECT s.id, s.user_id, s.provider, s.lifecycle_status, s.payment_intent_id, s.capture_method,
           s.created_at, s.updated_at, f.failure_code, f.failure_message, o.supplier_order_id
      FROM booking_sessions s
      LEFT JOIN LATERAL (
            SELECT e.payload ->> 'failureCode' AS failure_code, e.payload ->> 'failureMessage' AS failure_message
              FROM flight_booking_events e
             WHERE e.session_id = s.id AND e.payload ->> 'failureCode' IS NOT NULL
          ORDER BY e.created_at DESC, e.id DESC
             LIMIT 1
      ) f ON true
      LEFT JOIN LATERAL (
            SELECT e.payload ->> 'supplierOrderId' AS supplier_order_id
              FROM flight_booking_events e
             WHERE e.session_id = s.id AND e.payload ->> 'supplierOrderId' IS NOT NULL
          ORDER BY e.created_at DESC, e.id DESC
             LIMIT 1
      ) o ON true`;

function toRecord(r: Row): FlightLifecycleRecord | null {
    if (!isFlightBookingStatus(r.lifecycle_status)) {
        console.error(`[flight-lifecycle] session ${r.id} has an unknown lifecycle status "${r.lifecycle_status}"`);
        return null;
    }
    return {
        sessionId:       r.id,
        userId:          r.user_id,
        provider:        r.provider,
        status:          r.lifecycle_status,
        paymentIntentId: r.payment_intent_id,
        captureMethod:   r.capture_method,
        createdAt:       r.created_at,
        updatedAt:       r.updated_at,
        failureCode:     r.failure_code,
        failureMessage:  r.failure_message,
        supplierOrderId: r.supplier_order_id,
    };
}

/** The event payload: what the caller sent, plus the patch fields that were given. */
function eventPayload(options: TransitionOptions): string | null {
    const patch = options.patch ?? {};
    const merged: Record<string, unknown> = { ...(options.payload ?? {}) };
    if (patch.failureCode)     merged.failureCode     = patch.failureCode;
    if (patch.failureMessage)  merged.failureMessage  = patch.failureMessage.slice(0, 500);
    if (patch.supplierOrderId) merged.supplierOrderId = patch.supplierOrderId;
    return Object.keys(merged).length > 0 ? JSON.stringify(merged) : null;
}

// One warning per process for a missing migration, not one per request.
let warnedUnavailable = false;

function unavailable(label: string, err: unknown): void {
    const message = (err as { message?: string } | null)?.message ?? String(err);
    const missing = /lifecycle_status|flight_booking_events|42703|42P01/i.test(message);
    if (missing) {
        if (warnedUnavailable) return;
        warnedUnavailable = true;
        console.warn(
            `[flight-lifecycle] ${label}: the lifecycle column or table is not available (${message.slice(0, 160)}). `
            + 'Continuing without a lifecycle record — apply db/migrations/20261016000001_flight_booking_lifecycle.sql.',
        );
        return;
    }
    console.error(`[flight-lifecycle] ${label} failed: ${message.slice(0, 300)}`);
}

export class FlightBookingLifecycleRepository {
    /** For tests: the once-per-process warning would otherwise be swallowed by an earlier test. */
    static resetWarnings(): void { warnedUnavailable = false; }

    /**
     * Records that an attempt began, and returns it.
     *
     * The session row is written by `FlightsRepository.createBookingSession` and the column
     * defaults to PAYMENT_PENDING, so all that is left is the creation event — once, however
     * many times the traveller submits again.
     */
    async begin(sessionId: string): Promise<FlightLifecycleRecord | null> {
        try {
            await prisma.$executeRaw`
                INSERT INTO flight_booking_events (session_id, from_status, to_status, actor, reason)
                SELECT id, NULL, lifecycle_status, 'browser', 'payment created'
                  FROM booking_sessions
                 WHERE id = ${sessionId}::uuid
                   AND NOT EXISTS (SELECT 1 FROM flight_booking_events WHERE session_id = ${sessionId}::uuid)`;
            return await this.read(`${SELECT} WHERE s.id = $1::uuid LIMIT 1`, sessionId);
        } catch (err) {
            unavailable('begin', err);
            return null;
        }
    }

    /**
     * Moves an attempt, atomically, only if it is still in one of `from`.
     *
     * This is the claim. The status test and the write are one statement, so of any number of
     * callers racing for the same attempt exactly one gets `applied` and the rest get `lost`.
     */
    async transition(
        sessionId: string,
        from: FlightBookingStatus | FlightBookingStatus[],
        to: FlightBookingStatus,
        options: TransitionOptions,
    ): Promise<TransitionResult> {
        const froms = Array.isArray(from) ? from : [from];
        // A programming error, not an outage: refuse before any SQL.
        for (const f of froms) assertTransition(f, to);

        try {
            const rows = await prisma.$queryRaw<{ session_id: string }[]>`
                WITH prior AS (
                    SELECT id, lifecycle_status AS from_status
                      FROM booking_sessions
                     WHERE id = ${sessionId}::uuid
                       AND lifecycle_status = ANY(${froms}::text[])
                       FOR UPDATE
                ), moved AS (
                    UPDATE booking_sessions s
                       SET lifecycle_status = ${to},
                           updated_at       = now()
                      FROM prior
                     WHERE s.id = prior.id
                 RETURNING s.id, prior.from_status
                )
                INSERT INTO flight_booking_events (session_id, from_status, to_status, actor, reason, payload)
                SELECT id, from_status, ${to}, ${options.actor}, ${options.reason ?? null},
                       ${eventPayload(options)}::jsonb
                  FROM moved
                RETURNING session_id`;
            return rows.length > 0 ? 'applied' : 'lost';
        } catch (err) {
            unavailable(`transition ${froms.join('|')}→${to}`, err);
            return 'unavailable';
        }
    }

    /** A note on an attempt that is not a state change (a retried capture, a read-back result). */
    async note(sessionId: string, actor: LifecycleActor, reason: string, payload?: Record<string, unknown>): Promise<void> {
        try {
            await prisma.$executeRaw`
                INSERT INTO flight_booking_events (session_id, from_status, to_status, actor, reason, payload)
                SELECT id, lifecycle_status, lifecycle_status, ${actor}, ${reason}, ${payload ? JSON.stringify(payload) : null}::jsonb
                  FROM booking_sessions WHERE id = ${sessionId}::uuid`;
        } catch (err) {
            unavailable('note', err);
        }
    }

    async findBySession(sessionId: string): Promise<FlightLifecycleRecord | null> {
        try {
            return await this.read(`${SELECT} WHERE s.id = $1::uuid LIMIT 1`, sessionId);
        } catch (err) {
            unavailable('findBySession', err);
            return null;
        }
    }

    async findByPaymentIntent(paymentIntentId: string): Promise<FlightLifecycleRecord | null> {
        try {
            return await this.read(`${SELECT} WHERE s.payment_intent_id = $1 LIMIT 1`, paymentIntentId);
        } catch (err) {
            unavailable('findByPaymentIntent', err);
            return null;
        }
    }

    /**
     * Attempts that have sat in `statuses` longer than `olderThan`, for which the airline was
     * never asked anything — which is what makes voiding them safe. An attempt with a supplier
     * call recorded against it is excluded however old it is: it needs a person, not a sweep.
     *
     * Only sessions the new flow wrote: a Duffel session with a manual-capture PaymentIntent.
     * Old code never writes `capture_method = 'manual'`, and a session it wrote after the
     * migration was applied reads PAYMENT_PENDING by default while its payment captures
     * automatically. That is a charge, not a hold, and it is not the sweeper's to release.
     */
    async findAbandoned(statuses: FlightBookingStatus[], olderThan: Date, limit = 100): Promise<FlightLifecycleRecord[]> {
        try {
            const rows = await prisma.$queryRawUnsafe<Row[]>(
                `${SELECT}
                  WHERE s.lifecycle_status = ANY($1::text[])
                    AND s.updated_at < $2
                    AND s.provider = 'duffel'
                    AND s.capture_method = 'manual'
                    AND NOT EXISTS (
                        SELECT 1 FROM supplier_booking_attempts a
                         WHERE a.client_reference = s.id::text
                    )
               ORDER BY s.updated_at
                  LIMIT $3`,
                statuses, olderThan, limit,
            );
            return rows.map(toRecord).filter((r): r is FlightLifecycleRecord => r !== null);
        } catch (err) {
            unavailable('findAbandoned', err);
            return [];
        }
    }

    /** Attempts stuck where a person has to look: the airline may hold an order. */
    async findNeedingAttention(olderThan: Date, limit = 100): Promise<FlightLifecycleRecord[]> {
        try {
            const rows = await prisma.$queryRawUnsafe<Row[]>(
                `${SELECT}
                  WHERE s.lifecycle_status IN ('SUPPLIER_BOOKING', 'NEEDS_REVIEW')
                    AND s.updated_at < $1
               ORDER BY s.updated_at
                  LIMIT $2`,
                olderThan, limit,
            );
            return rows.map(toRecord).filter((r): r is FlightLifecycleRecord => r !== null);
        } catch (err) {
            unavailable('findNeedingAttention', err);
            return [];
        }
    }

    /**
     * The traveller's attempts at this offer that are not finished, newest first — what `book`
     * looks at before it opens another, so going back and paying again cannot buy a second
     * ticket. Only sessions the new flow wrote, as for the sweeper.
     */
    async findOpenForOffer(userId: string, offerId: string): Promise<FlightLifecycleRecord[]> {
        try {
            const rows = await prisma.$queryRawUnsafe<Row[]>(
                `${SELECT}
                  WHERE s.user_id = $1::uuid
                    AND s.flight ->> '_offerId' = $2
                    AND s.lifecycle_status IN ('PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', 'NEEDS_REVIEW')
                    AND s.provider = 'duffel'
                    AND s.capture_method = 'manual'
               ORDER BY s.created_at DESC
                  LIMIT 20`,
                userId, offerId,
            );
            return rows.map(toRecord).filter((r): r is FlightLifecycleRecord => r !== null);
        } catch (err) {
            unavailable('findOpenForOffer', err);
            return [];
        }
    }

    async events(sessionId: string): Promise<FlightLifecycleEvent[]> {
        try {
            const rows = await prisma.$queryRaw<Array<{
                from_status: string | null; to_status: string; actor: string; reason: string | null;
                payload: Record<string, unknown> | null; created_at: Date;
            }>>`
                SELECT from_status, to_status, actor, reason, payload, created_at
                  FROM flight_booking_events
                 WHERE session_id = ${sessionId}::uuid
              ORDER BY created_at, id`;
            return rows.map((r) => ({
                from: r.from_status, to: r.to_status, actor: r.actor, reason: r.reason, payload: r.payload, at: r.created_at,
            }));
        } catch (err) {
            unavailable('events', err);
            return [];
        }
    }

    private async read(statement: string, value: string): Promise<FlightLifecycleRecord | null> {
        const rows = await prisma.$queryRawUnsafe<Row[]>(statement, value);
        return rows[0] ? toRecord(rows[0]) : null;
    }
}
