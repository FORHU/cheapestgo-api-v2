import { prisma } from '@/lib/prisma';
import type { PaymentRow } from '@/repositories/payments.repository';

/**
 * What happened to one payment, in order, from the records that already keep it.
 *
 * Nothing new is written to build this. The events exist — `hotel_booking_events` and
 * `flight_booking_events` hold the lifecycle, `supplier_booking_attempts` holds what the supplier
 * was asked and answered, `email_logs` holds what the customer was sent, `refund_logs` holds the
 * money going back. They are simply never read together, which is why answering "what happened
 * to this booking" means opening five tables by hand today.
 *
 * Each event says where it came from, because §7 of the brief and ADR-0003 both turn on the
 * distinction: an event we recorded about ourselves is weaker evidence than one a provider told
 * us, and the reader is entitled to know which they are looking at.
 */

/** Where an event came from, which decides how much it is worth as evidence. */
export type EventSource =
    /** Our own lifecycle record: a status we moved something to. */
    | 'internal'
    /** What a supplier told us, at the time it told us. */
    | 'supplier'
    /** What our mail provider reported about a message. */
    | 'email'
    /** Money going back, as we recorded the request and the answer. */
    | 'refund';

export interface TimelineEvent {
    at: Date;
    source: EventSource;
    /** A short machine-ish key: `status_changed`, `supplier_book`, `email_sent`. */
    kind: string;
    /** One line a human reads. */
    label: string;
    /** The reference this event is about, where it has one. */
    reference: string | null;
    /** Whatever the source recorded beside it. Never invented, often empty. */
    detail: Record<string, unknown> | null;
}

/** The identifiers a payment is known by, gathered from its rows before the timeline is built. */
export interface TimelineKeys {
    hotelBookingIds: string[];
    sessionIds: string[];
    bookingReferences: string[];
}

/** Pull the keys each event table needs out of the payment's own rows. */
export function keysFrom(sources: PaymentRow[]): TimelineKeys {
    const hotelBookingIds: string[] = [];
    const sessionIds: string[] = [];
    const bookingReferences = new Set<string>();

    for (const s of sources) {
        if (s.source === 'hotel_bookings') hotelBookingIds.push(s.internalId);
        // Flight lifecycle events hang off the checkout session, not off the booking: the
        // interesting half of a flight's life happens before a `flight_bookings` row exists.
        if (s.source === 'booking_sessions') sessionIds.push(s.internalId);
        if (s.bookingReference) bookingReferences.add(s.bookingReference);
    }
    return { hotelBookingIds, sessionIds, bookingReferences: [...bookingReferences] };
}

export async function timelineFor(keys: TimelineKeys): Promise<TimelineEvent[]> {
    const { hotelBookingIds, sessionIds, bookingReferences } = keys;
    const events: TimelineEvent[] = [];

    // Queried in parallel and merged here rather than unioned in SQL: the shapes have nothing in
    // common beyond a timestamp, and a union would need every column cast to text to agree.
    const [hotelEvents, flightEvents, supplierAttempts, emails, refunds] = await Promise.all([
        hotelBookingIds.length
            ? prisma.hotel_booking_events.findMany({
                where: { booking_id: { in: hotelBookingIds } },
                orderBy: { created_at: 'asc' },
            })
            : [],
        sessionIds.length
            ? prisma.flight_booking_events.findMany({
                where: { session_id: { in: sessionIds } },
                orderBy: { created_at: 'asc' },
            })
            : [],
        bookingReferences.length
            ? prisma.supplier_booking_attempts.findMany({
                where: { client_reference: { in: bookingReferences } },
                orderBy: { created_at: 'asc' },
            })
            : [],
        bookingReferences.length
            ? prisma.email_logs.findMany({
                where: { booking_id: { in: bookingReferences } },
                orderBy: { created_at: 'asc' },
            })
            : [],
        bookingReferences.length
            ? prisma.refund_logs.findMany({
                where: { booking_id: { in: bookingReferences } },
                orderBy: { requested_at: 'asc' },
            })
            : [],
    ]);

    for (const e of hotelEvents) {
        events.push({
            at: e.created_at,
            source: 'internal',
            kind: 'status_changed',
            label: e.from_status ? `Stay ${e.from_status} → ${e.to_status}` : `Stay ${e.to_status}`,
            reference: null,
            detail: { actor: e.actor, reason: e.reason ?? undefined },
        });
    }

    for (const e of flightEvents) {
        events.push({
            at: e.created_at,
            source: 'internal',
            kind: 'status_changed',
            label: e.from_status ? `Flight ${e.from_status} → ${e.to_status}` : `Flight ${e.to_status}`,
            reference: null,
            detail: { actor: e.actor, reason: e.reason ?? undefined },
        });
    }

    for (const a of supplierAttempts) {
        // `completed_at` null means the call was started and never came back — the state that
        // leaves a reservation possibly made and certainly unrecorded. Worth saying out loud.
        const unfinished = a.completed_at === null;
        events.push({
            at: a.created_at,
            source: 'supplier',
            kind: `supplier_${a.operation}`,
            label: unfinished
                ? `${a.provider} ${a.operation} — started, no answer recorded`
                : `${a.provider} ${a.operation} — ${a.status}`,
            reference: a.supplier_reference ?? a.client_reference ?? null,
            detail: { error: a.error ?? undefined, hotel: a.hotel_name ?? undefined, completedAt: a.completed_at ?? undefined },
        });
    }

    for (const m of emails) {
        events.push({
            at: m.sent_at ?? m.created_at,
            source: 'email',
            kind: `email_${m.status}`,
            label: `${m.email_type} to ${m.recipient} — ${m.status}`,
            reference: null,
            detail: { subject: m.subject, error: m.error_message ?? undefined },
        });
    }

    for (const r of refunds) {
        events.push({
            at: r.requested_at,
            source: 'refund',
            kind: `refund_${r.status}`,
            label: `Refund ${r.refund_type} ${r.requested_amount.toString()} ${r.currency ?? ''} — ${r.status}`.trim(),
            reference: r.external_ref ?? null,
            detail: {
                approvedAmount: r.approved_amount?.toString(),
                processedAt: r.processed_at ?? undefined,
                reason: r.status_reason ?? undefined,
            },
        });
    }

    // Oldest first. Ties keep their insertion order, which groups a status change with the
    // supplier call that caused it rather than interleaving them arbitrarily.
    return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}
