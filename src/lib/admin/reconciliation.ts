/**
 * Detects divergence between what Stripe says we sold and what the database records.
 *
 * The supplier owns reservation state and a booking row is a cache of it, so the two can
 * disagree in both directions. This module covers one of them — an **Unrecorded
 * Reservation**: a stay the supplier confirmed and the customer paid for, with no booking
 * row to match it. The customer holds a room the platform cannot see, show them, or cancel.
 *
 * Detection reads Stripe rather than the supplier because no booking-read exists in the TGX
 * integration, and because what defines this condition is that we took the money.
 * `metadata.bookingReference` is minted at PaymentIntent creation, before any booking work
 * can fail, precisely so such a charge stays attributable.
 *
 * Divergence is **derived on every call, never stored**. A stored discrepancy is a third
 * record that can disagree with the two it summarises, which is the failure being fixed.
 * Derived state is always current and self-resolving: when the booking is written, the item
 * leaves the list with no lifecycle and no stale rows (ADR-0026).
 */

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

/** Charges this platform creates. Sibling FORHU products settle into the same account. */
const HOTEL_PI_TYPES = new Set(['hotel', 'hotel_bundle']);

export const UNRECORDED_NOTIFICATION_TITLE = 'Unrecorded Reservation — paid, no booking row';

export interface UnrecordedReservation {
    bookingReference: string;
    paymentIntentId:  string;
    /** Minor units, as Stripe reports them. */
    amount:      number;
    currency:    string;
    created:     string;
    holderEmail: string | null;
    brand:       string | null;
    /** Stripe's own description, which carries the property and room. */
    description: string | null;
    /** True when the charge was later refunded — still unrecorded, but no longer owed. */
    refunded:    boolean;
}

export interface ReconciliationResult {
    ok: boolean;
    /** Set when the run was refused rather than executed. */
    refusedReason?: string;
    scanned:    number;
    unrecorded: UnrecordedReservation[];
    windowDays: number;
}

/**
 * Refuses to run when the Stripe key and the database belong to different worlds.
 *
 * Comparing Stripe against `bookings` is only meaningful when both are the same
 * environment, and the compose file deliberately overrides DATABASE_URL to live RDS without
 * overriding the Stripe keys — so the container on 4001 pairs live RDS with the test key.
 * Scanning there would report every test PaymentIntent as unrecorded while hiding the real
 * one. Failing loudly beats emitting plausible garbage, and discipline has already been
 * tried and lost here (a test booking against live RDS once issued a real airline ticket).
 *
 * Set STRIPE_EXPECTED_ACCOUNT to the account id the deployment should be talking to.
 * Unset means unenforced, which is the right default for local development.
 */
export async function assertStripeAccount(): Promise<{ ok: true; account: string } | { ok: false; reason: string }> {
    const expected = process.env.STRIPE_EXPECTED_ACCOUNT?.trim();
    let account: string;
    try {
        // `GET /v1/account` — the account this key belongs to. The SDK's typings only
        // describe retrieving a *connected* account by id, so the no-id form needs the cast.
        account = (await stripe.accounts.retrieve(undefined as unknown as string)).id;
    } catch (err: any) {
        return { ok: false, reason: `Could not resolve Stripe account: ${err?.message ?? 'unknown error'}` };
    }
    if (expected && account !== expected) {
        return {
            ok: false,
            reason: `Stripe account mismatch — key belongs to ${account}, expected ${expected}. `
                  + 'Refusing to reconcile: the Stripe key and the database are different environments.',
        };
    }
    return { ok: true, account };
}

/**
 * Every hotel PaymentIntent that succeeded in the window but has no booking row.
 *
 * Not narrowed by brand on purpose. CheapestGo and AirangGo write to the same table, so
 * filtering to one storefront would make the other's orphans permanently invisible — and
 * AirangGo has no separate admin to catch them.
 */
export async function findUnrecordedReservations(windowDays = 30): Promise<ReconciliationResult> {
    const guard = await assertStripeAccount();
    if (!guard.ok) {
        return { ok: false, refusedReason: guard.reason, scanned: 0, unrecorded: [], windowDays };
    }

    const since = Math.floor(Date.now() / 1000) - windowDays * 86_400;

    const intents: Stripe.PaymentIntent[] = [];
    for await (const pi of stripe.paymentIntents.list({ created: { gte: since }, limit: 100 })) {
        if (pi.status !== 'succeeded') continue;
        if (!HOTEL_PI_TYPES.has(pi.metadata?.type ?? '')) continue;
        intents.push(pi);
    }

    // Matched on two keys, not one. `bookingReference` is the primary — it is minted before
    // the charge, so it survives a failed booking. But charges taken before that minting
    // existed carry no reference at all, and matching on reference alone would report every
    // one of them as unrecorded: seven false positives against one real finding when this
    // was first run, which is the alert fatigue the whole design exists to avoid.
    // `payment_intent_id` is written onto the booking row and covers exactly that gap.
    const references = intents.map((pi) => pi.metadata?.bookingReference).filter((r): r is string => !!r);
    const intentIds  = intents.map((pi) => pi.id);

    const rows = await prisma.bookings.findMany({
        where:  { OR: [{ booking_id: { in: references } }, { payment_intent_id: { in: intentIds } }] },
        select: { booking_id: true, payment_intent_id: true },
    });
    const known        = new Set(rows.map((r) => r.booking_id).filter((b): b is string => !!b));
    const knownIntents = new Set(rows.map((r) => r.payment_intent_id).filter((p): p is string => !!p));

    const unrecorded: UnrecordedReservation[] = [];
    for (const pi of intents) {
        const ref = pi.metadata?.bookingReference ?? null;
        if (ref && known.has(ref)) continue;
        if (knownIntents.has(pi.id)) continue;
        unrecorded.push({
            bookingReference: ref ?? `(no reference — ${pi.id})`,
            paymentIntentId:  pi.id,
            amount:      pi.amount,
            currency:    pi.currency,
            created:     new Date(pi.created * 1000).toISOString(),
            holderEmail: pi.metadata?.holderEmail || null,
            brand:       pi.metadata?.brand || null,
            description: pi.description ?? null,
            refunded: (pi.latest_charge && typeof pi.latest_charge !== 'string')
                ? (pi.latest_charge.amount_refunded ?? 0) > 0
                : false,
        });
    }

    return { ok: true, scanned: intents.length, unrecorded, windowDays };
}

/**
 * Which of these have never been announced.
 *
 * Dedupe reads the notifications table rather than keeping its own ledger, so nothing new
 * has to be persisted. Keyed on the reference alone and not on brand, so both storefront
 * deployments may run the job and the second is a no-op rather than a duplicate alert.
 *
 * This exists because the notification-only design has already failed once: a genuine
 * `CRITICAL: DB Save Failed` on 2026-08-04 went unread for a month, buried under 60
 * identical `Auto-Recovery Complete` rows the flight reconciler emitted over two days.
 */
export async function filterAlreadyNotified(items: UnrecordedReservation[]): Promise<UnrecordedReservation[]> {
    if (!items.length) return [];

    const announced = await prisma.notifications.findMany({
        where:  { title: UNRECORDED_NOTIFICATION_TITLE },
        select: { description: true },
    });
    const seen = new Set(
        announced.flatMap((n) => items
            .map((i) => i.bookingReference)
            .filter((ref) => n.description?.includes(ref))),
    );
    return items.filter((i) => !seen.has(i.bookingReference));
}
