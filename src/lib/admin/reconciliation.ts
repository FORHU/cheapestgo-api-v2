/**
 * Detects divergence between what Stripe says we sold and what the database records.
 *
 * The supplier owns reservation state and a booking row is a cache of it, so the two can
 * disagree in both directions. This module covers one of them — an **Unrecorded
 * Reservation**: a sale the customer paid for, with no booking row to match it. The customer
 * holds a room (or a seat, or a tee time) the platform cannot see, show them, or cancel.
 *
 * ADR-0026 scoped this to hotels. It now also reads flight and golf charges, because the same
 * failure — money captured, the row that should record it never written — is possible there and
 * was invisible. Only hotels have a rebuild action (`services/bookingRebuild.service.ts`); a
 * flight or golf item is listed with where to look, and repaired by a person.
 *
 * Detection reads Stripe rather than the supplier because no booking-read exists in the TGX
 * integration, and because what defines this condition is that we took the money.
 *
 * Divergence is **derived on every call, never stored**. A stored discrepancy is a third
 * record that can disagree with the two it summarises, which is the failure being fixed.
 * Derived state is always current and self-resolving: when the booking is written, the item
 * leaves the list with no lifecycle and no stale rows (ADR-0026).
 */

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { assertStripeAccount } from '@/lib/stripeAccount';
import { HotelBookingLifecycleRepository } from '@/repositories/hotelBookingLifecycle.repository';

export type UnrecordedProduct = 'hotel' | 'flight' | 'golf';

/**
 * The `metadata.type` each product's checkout writes, and so the only charges this scan reads.
 * Sibling FORHU products settle into the same Stripe account, so an unscoped scan would report
 * every one of their charges as ours.
 */
const PRODUCT_OF_TYPE: Readonly<Record<string, UnrecordedProduct>> = {
    hotel:         'hotel',
    hotel_bundle:  'hotel',
    flight:        'flight',
    flight_bundle: 'flight',
    golf:          'golf',
};

export const UNRECORDED_NOTIFICATION_TITLE = 'Unrecorded Reservation — paid, no booking row';

/** What the v2 attempt row knows about a hotel item, where one exists. */
export interface UnrecordedAttempt {
    status:            string;
    supplierReference: string | null;
    checkIn:           string | null;
    checkOut:          string | null;
    propertyName:      string | null;
}

export interface UnrecordedReservation {
    product:          UnrecordedProduct;
    /** The minted reference, or a placeholder naming the PaymentIntent when there is none. */
    bookingReference: string;
    /** False when the charge carried no reference (flights never do; old hotel charges did not). */
    hasReference:     boolean;
    paymentIntentId:  string;
    /** Minor units, as Stripe reports them. */
    amount:      number;
    currency:    string;
    created:     string;
    holderEmail: string | null;
    brand:       string | null;
    /** Stripe's own description, which carries the property and room, or the route. */
    description: string | null;
    /** True when the charge was later refunded — still unrecorded, but no longer owed. */
    refunded:    boolean;
    /** Ids that say where to look next: the flight checkout session, the golf booking. */
    lookup:      { bookingSessionId?: string; golfBookingId?: string };
    /** Hotels only: the lifecycle attempt, which holds most of what a rebuild needs. */
    attempt:     UnrecordedAttempt | null;
}

export interface ReconciliationResult {
    ok: boolean;
    /** Set when the run was refused rather than executed. */
    refusedReason?: string;
    scanned:    number;
    unrecorded: UnrecordedReservation[];
    windowDays: number;
    /** A product whose table could not be read, so its charges were not judged at all. */
    warnings:   string[];
}

/**
 * Refuses to run when the Stripe key and the database belong to different worlds.
 *
 * Comparing Stripe against the booking tables is only meaningful when both are the same
 * environment; scanning a live database with a test key reports every test PaymentIntent as
 * unrecorded while hiding the real one. The check lives in `lib/stripeAccount`, because the
 * same mismatch is also refused at boot (ADR-0002, amended).
 */
export { assertStripeAccount };

/** The product a charge was taken for, or null when it is not one of ours. */
export function productOf(pi: Pick<Stripe.PaymentIntent, 'metadata'>): UnrecordedProduct | null {
    return PRODUCT_OF_TYPE[pi.metadata?.type ?? ''] ?? null;
}

function isRefunded(pi: Stripe.PaymentIntent): boolean {
    const charge = pi.latest_charge;
    return !!charge && typeof charge !== 'string' && (charge.amount_refunded ?? 0) > 0;
}

/**
 * Which hotel charges have a booking row. Matched on two keys, not one: `bookingReference` is
 * minted before the charge, so it survives a failed booking, but charges taken before that
 * minting existed carry none — matching on reference alone produced seven false positives
 * against one real finding on the first run. `payment_intent_id` covers exactly that gap.
 */
async function recordedHotels(intents: Stripe.PaymentIntent[]): Promise<Set<string>> {
    const references = intents.map((pi) => pi.metadata?.bookingReference).filter((r): r is string => !!r);
    const rows = await prisma.bookings.findMany({
        where:  { OR: [{ booking_id: { in: references } }, { payment_intent_id: { in: intents.map((pi) => pi.id) } }] },
        select: { booking_id: true, payment_intent_id: true },
    });
    const known        = new Set(rows.map((r) => r.booking_id).filter((b): b is string => !!b));
    const knownIntents = new Set(rows.map((r) => r.payment_intent_id).filter((p): p is string => !!p));
    return new Set(intents
        .filter((pi) => knownIntents.has(pi.id) || (!!pi.metadata?.bookingReference && known.has(pi.metadata.bookingReference)))
        .map((pi) => pi.id));
}

/** Which flight charges have a sale row. The PI is the only key: a flight charge carries no reference. */
async function recordedFlights(intents: Stripe.PaymentIntent[]): Promise<Set<string>> {
    const rows = await prisma.flight_bookings.findMany({
        where:  { payment_intent_id: { in: intents.map((pi) => pi.id) } },
        select: { payment_intent_id: true },
    });
    return new Set(rows.map((r) => r.payment_intent_id).filter((p): p is string => !!p));
}

/**
 * Which golf charges have a booking row. Raw SQL: the golf tables are migrations that are not
 * in the Prisma schema. Matched on the PI or on the booking id the charge was created for.
 */
async function recordedGolf(intents: Stripe.PaymentIntent[]): Promise<Set<string>> {
    const ids        = intents.map((pi) => pi.id);
    const bookingIds = intents.map((pi) => pi.metadata?.golfBookingId).filter((b): b is string => !!b);
    const rows = await prisma.$queryRaw<Array<{ payment_intent_id: string | null; id: string }>>`
        SELECT payment_intent_id, id::text AS id
          FROM golf_bookings
         WHERE payment_intent_id = ANY(${ids}::text[]) OR id::text = ANY(${bookingIds}::text[])`;
    const knownIntents = new Set(rows.map((r) => r.payment_intent_id).filter((p): p is string => !!p));
    const knownIds     = new Set(rows.map((r) => r.id));
    return new Set(intents
        .filter((pi) => knownIntents.has(pi.id) || (!!pi.metadata?.golfBookingId && knownIds.has(pi.metadata.golfBookingId)))
        .map((pi) => pi.id));
}

const RECORDED: Record<UnrecordedProduct, (intents: Stripe.PaymentIntent[]) => Promise<Set<string>>> = {
    hotel:  recordedHotels,
    flight: recordedFlights,
    golf:   recordedGolf,
};

/**
 * Every hotel, flight and golf PaymentIntent that succeeded in the window but has no row.
 *
 * Not narrowed by brand on purpose. The storefronts write to the same tables, so filtering to one
 * would make the other's orphans permanently invisible.
 */
export async function findUnrecordedReservations(windowDays = 30): Promise<ReconciliationResult> {
    const guard = await assertStripeAccount();
    if (!guard.ok) {
        return { ok: false, refusedReason: guard.reason, scanned: 0, unrecorded: [], windowDays, warnings: [] };
    }

    const since = Math.floor(Date.now() / 1000) - windowDays * 86_400;

    const byProduct: Record<UnrecordedProduct, Stripe.PaymentIntent[]> = { hotel: [], flight: [], golf: [] };
    // `latest_charge` is a bare id unless expanded, and the refund flag reads its amount.
    for await (const pi of stripe.paymentIntents.list({ created: { gte: since }, limit: 100, expand: ['data.latest_charge'] })) {
        if (pi.status !== 'succeeded') continue;
        const product = productOf(pi);
        if (product) byProduct[product].push(pi);
    }

    const unrecorded: UnrecordedReservation[] = [];
    const warnings: string[] = [];
    const lifecycle = new HotelBookingLifecycleRepository();

    for (const product of ['hotel', 'flight', 'golf'] as const) {
        const intents = byProduct[product];
        if (!intents.length) continue;

        let recorded: Set<string>;
        try {
            recorded = await RECORDED[product](intents);
        } catch (err: any) {
            // Not "none recorded": a table we cannot read would otherwise report every charge
            // of that product as unrecorded, which is the false alarm this design exists to avoid.
            warnings.push(`${product}: could not read booking rows (${String(err?.message ?? err).slice(0, 160)})`);
            continue;
        }

        for (const pi of intents) {
            if (recorded.has(pi.id)) continue;
            const ref = pi.metadata?.bookingReference || null;

            let attempt: UnrecordedAttempt | null = null;
            if (product === 'hotel') {
                const found = (ref ? await lifecycle.findByReference(ref) : null) ?? await lifecycle.findByPaymentIntent(pi.id);
                if (found) {
                    attempt = {
                        status:            found.status,
                        supplierReference: found.supplierReference,
                        checkIn:           found.checkIn,
                        checkOut:          found.checkOut,
                        propertyName:      found.propertyName,
                    };
                }
            }

            unrecorded.push({
                product,
                bookingReference: ref ?? `(no reference — ${pi.id})`,
                hasReference:     !!ref,
                paymentIntentId:  pi.id,
                amount:      pi.amount,
                currency:    pi.currency,
                created:     new Date(pi.created * 1000).toISOString(),
                holderEmail: pi.metadata?.holderEmail || pi.metadata?.passengerEmail || null,
                brand:       pi.metadata?.brand || null,
                description: pi.description ?? null,
                refunded:    isRefunded(pi),
                lookup: {
                    ...(pi.metadata?.bookingSessionId ? { bookingSessionId: pi.metadata.bookingSessionId } : {}),
                    ...(pi.metadata?.golfBookingId ? { golfBookingId: pi.metadata.golfBookingId } : {}),
                },
                attempt,
            });
        }
    }

    unrecorded.sort((a, b) => b.created.localeCompare(a.created));
    const scanned = byProduct.hotel.length + byProduct.flight.length + byProduct.golf.length;
    return { ok: true, scanned, unrecorded, windowDays, warnings };
}

/**
 * Which of these have never been announced.
 *
 * Dedupe reads the notifications table rather than keeping its own ledger, so nothing new has to
 * be persisted. An item counts as announced when an earlier notification names its PaymentIntent,
 * or its reference when it has one — every notification this job writes carries the PaymentIntent,
 * and older ones always carried the reference. Not keyed on brand, so both storefront deployments
 * may run the job and the second is a no-op rather than a duplicate alert.
 *
 * This exists because the notification-only design has already failed once: a genuine
 * `CRITICAL: DB Save Failed` on 2026-08-04 went unread for a month, buried under 60 identical
 * `Auto-Recovery Complete` rows the flight reconciler emitted over two days.
 */
export async function filterAlreadyNotified(items: UnrecordedReservation[]): Promise<UnrecordedReservation[]> {
    if (!items.length) return [];

    const announced = await prisma.notifications.findMany({
        where:  { title: UNRECORDED_NOTIFICATION_TITLE },
        select: { description: true },
    });
    const texts = announced.map((n) => n.description ?? '');
    const seen = (i: UnrecordedReservation) => texts.some((t) =>
        t.includes(i.paymentIntentId) || (i.hasReference !== false && t.includes(i.bookingReference)));
    return items.filter((i) => !seen(i));
}

export interface MissingBrandRow {
    bookingReference: string;
    paymentIntentId:  string | null;
    status:           string | null;
    createdAt:        string | null;
}

/**
 * Hotel bookings with no `source_brand`.
 *
 * ADR-0026: the write that sets the brand sits behind a non-fatal catch — correctly, since the
 * stay is already confirmed — and it once failed on every booking for a month without a trace. A
 * failed write is an event; the gap it leaves is a condition, and only the condition is worth
 * deriving. Listed, never filled: the authority is the charge's own `brand`, and guessing one
 * would be an assumption written down as a fact.
 */
export async function findBookingsMissingBrand(limit = 50): Promise<{ total: number; items: MissingBrandRow[] }> {
    const [rows, total] = await Promise.all([
        prisma.bookings.findMany({
            where:   { source_brand: null },
            orderBy: { created_at: 'desc' },
            take:    limit,
            select:  { booking_id: true, payment_intent_id: true, status: true, created_at: true },
        }),
        prisma.bookings.count({ where: { source_brand: null } }),
    ]);
    return {
        total,
        items: rows.map((r) => ({
            bookingReference: r.booking_id,
            paymentIntentId:  r.payment_intent_id,
            status:           r.status,
            createdAt:        r.created_at?.toISOString() ?? null,
        })),
    };
}
