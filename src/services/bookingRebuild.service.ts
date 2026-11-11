/**
 * Rebuilds the booking row behind an Unrecorded Reservation — ADR-0026's reconstruct action.
 *
 * Derived divergence has no dismiss flag: nothing clears an item except the booking existing.
 * So something has to write that booking, and ADR-0026 is explicit that it cannot be a job:
 * a reconciler that writes on payment evidence eventually acts on a stale read. It is an admin
 * form, pre-filled from what we hold, that a person checks against the supplier and submits.
 *
 * v2 can pre-fill far more than the ADR expected. The ADR found the stay dates and supplier
 * reference only in the supplier's order; the v2 lifecycle attempt (`hotel_bookings`) records
 * the dates, room, guest counts, cancellation terms and — once the supplier confirmed — its
 * reference. Every field says where it came from, so the admin knows what to verify.
 *
 * What the form can never change: the amount, currency, customer and reference. Those are what
 * the charge says, re-read from Stripe at the moment of writing, so a rebuilt booking cannot
 * record different money from the money that moved.
 *
 * Hotels only. Flight and golf items are listed by the reconciler and repaired by hand.
 */

import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/middleware/error.middleware';
import { assertStripeAccount, productOf } from '@/lib/admin/reconciliation';
import { fromStripeAmount } from '@/lib/pricing';
import { lockFx } from '@/lib/payments/fxLock';
import { canonicalBrandName } from '@/lib/brand';
import { snapshotFromPolicy } from '@/lib/policies/snapshotFromPolicy';
import { HotelsRepository } from '@/repositories/hotels.repository';
import {
    HotelBookingLifecycleRepository,
    type LifecycleRecord,
} from '@/repositories/hotelBookingLifecycle.repository';

export type Provenance = 'stripe' | 'attempt' | 'missing';

/** Statuses a rebuilt row may take: the live sale, or the end state it already reached. */
export const REBUILD_STATUSES = ['confirmed', 'refunded', 'cancelled'] as const;
export type RebuildStatus = typeof REBUILD_STATUSES[number];

export interface RebuildFields {
    propertyName:      string;
    roomName:          string;
    checkIn:           string;
    checkOut:          string;
    adults:            number;
    children:          number;
    holderFirstName:   string;
    holderLastName:    string;
    holderEmail:       string;
    supplierReference: string;
}

export interface RebuildDraft {
    paymentIntentId:  string;
    bookingReference: string;
    userId:           string;
    /** Major units, as a string: money that has been through a float is not evidence. */
    amount:           string;
    currency:         string;
    paidAt:           string;
    amountRefunded:   string;
    suggestedStatus:  RebuildStatus;
    brand:            string | null;
    provider:         string;
    /** What the form starts from. Empty strings and zeros are the gaps a person must fill. */
    fields:           RebuildFields;
    provenance:       Record<keyof RebuildFields, Provenance>;
    /** The v2 attempt, where there is one. */
    attempt:          { status: string; reference: string } | null;
    /** Whether the guest's cancellation terms were recorded. Without them, a cancellation refuses. */
    hasCancellationTerms: boolean;
}

export interface RebuildInput extends RebuildFields {
    status: RebuildStatus;
    /** Why, in the admin's words. Required: this is a hand-written booking and the log says so. */
    reason: string;
}

export interface RebuildActor { id?: string; email?: string }

const HOTEL_PI_EXPAND = ['latest_charge'];

/** Everything a rebuild may rely on, re-checked on every read and again at the write. */
async function loadEvidence(paymentIntentId: string, lifecycle: HotelBookingLifecycleRepository): Promise<{
    pi: Stripe.PaymentIntent; reference: string; userId: string; attempt: LifecycleRecord | null;
}> {
    const guard = await assertStripeAccount();
    if (!guard.ok) throw new AppError(409, guard.reason, 'STRIPE_ACCOUNT_MISMATCH');

    let pi: Stripe.PaymentIntent;
    try {
        pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: HOTEL_PI_EXPAND });
    } catch (err: any) {
        if (err?.statusCode === 404 || err?.code === 'resource_missing') {
            throw new AppError(404, 'Stripe has no such payment.', 'NOT_FOUND');
        }
        throw new AppError(502, `Stripe could not be reached: ${err?.message ?? 'unknown error'}`, 'STRIPE_UNAVAILABLE');
    }

    if (productOf(pi) !== 'hotel') {
        throw new AppError(409, 'Only hotel payments can be rebuilt here. Flight and golf payments are repaired by hand.', 'NOT_HOTEL');
    }
    // A held or failed payment is the sweeps' business: nobody has paid for a stay yet.
    if (pi.status !== 'succeeded') {
        throw new AppError(409, `This payment is ${pi.status}, not captured — there is no paid stay to record.`, 'NOT_PAID');
    }
    const reference = pi.metadata?.bookingReference;
    const userId    = pi.metadata?.userId;
    if (!reference || !userId) {
        throw new AppError(409, 'This payment carries no booking reference or customer, so a booking cannot be attributed to it. Repair it by hand.', 'NOT_ATTRIBUTABLE');
    }

    const existing = await prisma.bookings.findFirst({
        where:  { OR: [{ booking_id: reference }, { payment_intent_id: pi.id }] },
        select: { booking_id: true },
    });
    if (existing) {
        throw new AppError(409, `Booking ${existing.booking_id} already records this payment.`, 'ALREADY_RECORDED');
    }

    const attempt = await lifecycle.findByReference(reference) ?? await lifecycle.findByPaymentIntent(pi.id);
    return { pi, reference, userId, attempt };
}

/** "CG: Hotel Naru — Deluxe Twin" → property and room, when the attempt has neither. */
function fromDescription(description: string | null | undefined): { property: string; room: string } {
    const body = (description ?? '').replace(/^[A-Z]{2}:\s*/, '');
    const [property = '', room = ''] = body.split(/\s+[—–]\s+/);
    return { property: property.trim(), room: room.trim() };
}

function amountRefunded(pi: Stripe.PaymentIntent): number {
    const charge = pi.latest_charge;
    return charge && typeof charge !== 'string' ? (charge.amount_refunded ?? 0) : 0;
}

const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

export class BookingRebuildService {
    constructor(
        private readonly lifecycle = new HotelBookingLifecycleRepository(),
        private readonly hotels = new HotelsRepository(),
    ) {}

    /** The pre-filled form for one unrecorded hotel payment. */
    async draft(paymentIntentId: string): Promise<RebuildDraft> {
        const { pi, reference, userId, attempt } = await loadEvidence(paymentIntentId, this.lifecycle);
        const guests = attempt ? await this.lifecycle.loadGuests(reference) : [];
        const holder = guests.find((g) => g.kind === 'holder');
        const parsed = fromDescription(pi.description);
        const draft  = (attempt?.draft ?? {}) as Record<string, unknown>;

        const provenance = {} as Record<keyof RebuildFields, Provenance>;
        const pick = <K extends keyof RebuildFields>(key: K, fromAttempt: RebuildFields[K] | null | undefined, fromStripe?: RebuildFields[K] | null, empty?: RebuildFields[K]): RebuildFields[K] => {
            const isSet = (v: unknown) => v !== null && v !== undefined && v !== '';
            if (isSet(fromAttempt)) { provenance[key] = 'attempt'; return fromAttempt as RebuildFields[K]; }
            if (isSet(fromStripe))  { provenance[key] = 'stripe';  return fromStripe as RebuildFields[K]; }
            provenance[key] = 'missing';
            return empty as RebuildFields[K];
        };

        const fields: RebuildFields = {
            propertyName:      pick('propertyName', attempt?.propertyName, parsed.property, ''),
            roomName:          pick('roomName', attempt?.roomName, parsed.room, ''),
            checkIn:           pick('checkIn', attempt?.checkIn, null, ''),
            checkOut:          pick('checkOut', attempt?.checkOut, null, ''),
            adults:            pick('adults', num(draft.adults), null, 0),
            children:          pick('children', num(draft.children), null, 0),
            holderFirstName:   pick('holderFirstName', holder?.firstName, null, ''),
            holderLastName:    pick('holderLastName', holder?.lastName, null, ''),
            holderEmail:       pick('holderEmail', holder?.email, pi.metadata?.holderEmail, ''),
            supplierReference: pick('supplierReference', attempt?.supplierReference, null, ''),
        };
        // Zero children is an answer, not a gap, once the attempt has recorded the party.
        if (provenance.children === 'missing' && provenance.adults === 'attempt') provenance.children = 'attempt';

        const refunded = amountRefunded(pi);
        return {
            paymentIntentId:  pi.id,
            bookingReference: reference,
            userId,
            amount:           String(fromStripeAmount(pi.amount, pi.currency)),
            currency:         pi.currency.toUpperCase(),
            paidAt:           new Date(pi.created * 1000).toISOString(),
            amountRefunded:   String(fromStripeAmount(refunded, pi.currency)),
            suggestedStatus:  refunded >= pi.amount ? 'refunded' : 'confirmed',
            brand:            pi.metadata?.brand ? canonicalBrandName(pi.metadata.brand) : null,
            provider:         attempt?.provider ?? 'travelgatex',
            fields,
            provenance,
            attempt:          attempt ? { status: attempt.status, reference: attempt.reference } : null,
            hasCancellationTerms: !!draft.cancellationPolicies && typeof draft.cancellationPolicies === 'object',
        };
    }

    /**
     * Writes the booking. Every precondition is re-read here rather than trusted from the draft:
     * between opening the form and submitting it, the webhook may have written the row, or the
     * charge may have been refunded.
     */
    async rebuild(paymentIntentId: string, input: RebuildInput, actor: RebuildActor): Promise<{ bookingId: string; id: string }> {
        const { pi, reference, userId, attempt } = await loadEvidence(paymentIntentId, this.lifecycle);

        if (!(input.checkOut > input.checkIn)) {
            throw new AppError(400, 'Check-out must be after check-in.', 'VALIDATION_ERROR');
        }

        const currency = pi.currency.toUpperCase();
        const total    = fromStripeAmount(pi.amount, pi.currency);
        const draft    = (attempt?.draft ?? {}) as Record<string, unknown>;

        // The terms the guest agreed to, where the attempt kept them. Without them the booking is
        // recorded non-refundable and a cancellation refuses — the safe direction (ADR-0023).
        const policy = draft.cancellationPolicies && typeof draft.cancellationPolicies === 'object'
            ? draft.cancellationPolicies as Parameters<typeof snapshotFromPolicy>[0]
            : null;
        const terms = policy ? snapshotFromPolicy(policy, currency) : null;

        const rebuiltAt = new Date().toISOString();
        let row: { id: string };
        try {
            row = await prisma.bookings.create({
                data: {
                    booking_id:        reference,
                    booking_reference: reference,
                    user_id:           userId,
                    property_name:     input.propertyName,
                    property_image:    typeof draft.propertyImage === 'string' ? draft.propertyImage : null,
                    room_name:         input.roomName,
                    check_in:          new Date(input.checkIn),
                    check_out:         new Date(input.checkOut),
                    guests_adults:     input.adults,
                    guests_children:   input.children,
                    total_price:       total,
                    charged_price:     total,
                    currency,
                    holder_first_name: input.holderFirstName,
                    holder_last_name:  input.holderLastName,
                    holder_email:      input.holderEmail,
                    status:            input.status,
                    special_requests:  typeof draft.specialRequests === 'string' ? draft.specialRequests : null,
                    policy_type:       terms?.policyType ?? 'non_refundable',
                    cancellation_policy: policy ?? undefined,
                    provider:          attempt?.provider ?? 'travelgatex',
                    hotel_id:          attempt?.hotelCode ?? null,
                    provider_metadata: {
                        supplierRef: input.supplierReference || null,
                        hotelCode:   attempt?.hotelCode ?? null,
                        ...(typeof draft.board === 'string' ? { board: draft.board } : {}),
                        ...(typeof draft.holderPhone === 'string' ? { holderPhone: draft.holderPhone } : {}),
                        // A hand-written booking says so on the row itself, not only in the audit log.
                        rebuilt: { from: 'reconciliation', at: rebuiltAt, by: actor.email ?? actor.id ?? null, reason: input.reason },
                    },
                    payment_intent_id: pi.id,
                    // When the guest paid, not when the row was repaired: the booking list orders by it.
                    created_at:        new Date(pi.created * 1000),
                    source_brand:      pi.metadata?.brand ? canonicalBrandName(pi.metadata.brand) : null,
                } as any,
                select: { id: true },
            });
        } catch (err: any) {
            // Two admins, or the webhook, got there first. The row exists, which is the goal.
            if (err?.code === 'P2002') {
                throw new AppError(409, 'A booking for this payment was written a moment ago.', 'ALREADY_RECORDED');
            }
            throw err;
        }

        // Each of these is evidence beside the booking, never a reason to lose it.
        try {
            const fx = await lockFx(total, currency);
            await prisma.bookings.update({ where: { booking_id: reference }, data: { ...fx } as any });
        } catch (err) {
            console.error('[rebuild] FX lock failed — booking recorded unconverted:', err);
        }
        if (terms && policy) {
            await this.hotels.savePolicySnapshot({ bookingId: reference, ...terms, rawResponse: policy })
                .catch((err) => console.error('[rebuild] policy snapshot failed:', err));
        }
        if (attempt) {
            await this.lifecycle.note(reference, 'admin', 'booking row rebuilt from reconciliation', {
                bookingId: row.id, by: actor.email ?? actor.id ?? null, reason: input.reason,
            });
        }

        return { bookingId: reference, id: row.id };
    }
}

export const bookingRebuildService = new BookingRebuildService();
