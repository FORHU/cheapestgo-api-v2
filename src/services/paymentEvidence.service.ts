import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { findPaymentSources, type PaymentRow } from '@/repositories/payments.repository';
import { keysFrom, timelineFor, type TimelineEvent } from '@/repositories/paymentTimeline.repository';
import { logger } from '@/lib/logger';

/**
 * What can be shown about one payment, and — for every single item — how we come to know it.
 *
 * The provenance is not decoration. This pack is read by a card network, and the platform is in a
 * weaker position than it looks: a hotel reservation can be cancelled in the supplier's own
 * dashboard and leave no trace here, so our row reading `confirmed` is evidence of what we were
 * told and never of what happened. ADR-0003 and `Evidence Provenance` in CONTEXT.md.
 *
 * Nothing here asserts that a stay occurred or a passenger flew.
 */

export type Provenance =
    /** Asked of the provider during this export, and it answered. */
    | 'verified'
    /** What the provider told us at the time, with the time it told us. */
    | 'provider_recorded'
    /** Our own row. True that we recorded it; not evidence of the world. */
    | 'internal'
    /** Looked for, not found. Said out loud rather than omitted. */
    | 'unavailable';

export interface EvidenceItem {
    key: string;
    label: string;
    provenance: Provenance;
    value: string | null;
    /** When the fact was learned — not when this pack was made. */
    observedAt: Date | null;
    /** Why it is unavailable, where that is itself informative. */
    note?: string;
}

export interface EvidencePack {
    paymentIntentId: string;
    generatedAt: Date;
    sources: PaymentRow[];
    items: EvidenceItem[];
    timeline: TimelineEvent[];
    /** Capabilities we do not have, stated so their absence is not read as a negative finding. */
    limitations: string[];
}

const missing = (key: string, label: string, note: string): EvidenceItem =>
    ({ key, label, provenance: 'unavailable', value: null, observedAt: null, note });

/**
 * Stripe, read live. The money is the one thing a provider will answer for on demand, so it is
 * the only part of the pack that can honestly be called verified.
 */
async function stripeEvidence(paymentIntentId: string): Promise<EvidenceItem[]> {
    try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
        const charge: any = (pi as any).latest_charge ?? null;
        const at = new Date();

        const items: EvidenceItem[] = [
            { key: 'pi_status', label: 'Payment status at Stripe', provenance: 'verified', value: pi.status, observedAt: at },
            {
                key: 'pi_amount', label: 'Amount', provenance: 'verified',
                // Minor units, formatted without arithmetic in a float.
                value: `${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}`, observedAt: at,
            },
            {
                key: 'pi_captured', label: 'Amount captured', provenance: 'verified',
                value: `${(pi.amount_received / 100).toFixed(2)} ${pi.currency.toUpperCase()}`, observedAt: at,
            },
            { key: 'pi_created', label: 'Payment created', provenance: 'verified', value: new Date(pi.created * 1000).toISOString(), observedAt: at },
        ];

        if (charge) {
            items.push({ key: 'charge_id', label: 'Charge', provenance: 'verified', value: charge.id, observedAt: at });
            if (charge.payment_method_details?.card) {
                const card = charge.payment_method_details.card;
                items.push({
                    key: 'card', label: 'Card', provenance: 'verified',
                    // Brand and last four only. Never the number, never the CVV.
                    value: `${card.brand} ···· ${card.last4}`, observedAt: at,
                });
                if (card.three_d_secure) {
                    items.push({
                        key: '3ds', label: '3D Secure', provenance: 'verified',
                        value: `${card.three_d_secure.result ?? 'unknown'}${card.three_d_secure.version ? ` (v${card.three_d_secure.version})` : ''}`,
                        observedAt: at,
                    });
                }
            }
            items.push({
                key: 'receipt', label: 'Stripe receipt', provenance: charge.receipt_url ? 'verified' : 'unavailable',
                value: charge.receipt_url ?? null, observedAt: charge.receipt_url ? at : null,
                ...(charge.receipt_url ? {} : { note: 'Stripe issued no receipt URL for this charge.' }),
            });
        } else {
            items.push(missing('charge_id', 'Charge', 'No charge on this PaymentIntent — the card was never captured.'));
        }

        items.push(...await refundEvidence(paymentIntentId, at));
        return items;
    } catch (err: any) {
        // A Stripe outage must degrade the pack, not empty it. The absence is itself recorded,
        // so nobody reads a thin pack as "there was no payment".
        logger.warn('[evidence] Stripe lookup failed', { paymentIntentId, err: err?.message });
        return [missing('stripe', 'Stripe record', `Stripe could not be reached during this export: ${err?.message ?? 'unknown error'}`)];
    }
}

/**
 * Every refund Stripe holds against this payment, asked of Stripe rather than read from our own
 * tables.
 *
 * This is how "where is the money" gets an answer today. Our `refund_logs` records who asked and
 * under what policy — the things Stripe cannot know — but it was written by only one of the four
 * paths that move money, and by none of the refunds issued by hand in the Stripe dashboard, which
 * is how most of them have been issued so far (ADR-0004). Stripe knows about all of them.
 *
 * **Issued is not settled.** A refund reads `pending` until the card network completes it, which
 * takes days, and that is the state the customer is actually asking about. Printed as Stripe
 * words it, never flattened to "refunded".
 */
async function refundEvidence(paymentIntentId: string, at: Date): Promise<EvidenceItem[]> {
    const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });

    if (refunds.data.length === 0) {
        return [{
            key: 'refunds', label: 'Refunds', provenance: 'verified',
            value: 'None', observedAt: at,
            note: 'Stripe holds no refund against this payment.',
        }];
    }

    // Newest last, so the list reads in the order the money moved.
    const ordered = [...refunds.data].sort((a, b) => a.created - b.created);
    const items: EvidenceItem[] = ordered.map((r, i) => ({
        key:   `refund_${r.id}`,
        label: ordered.length > 1 ? `Refund ${i + 1} of ${ordered.length}` : 'Refund',
        provenance: 'verified' as const,
        value: `${(r.amount / 100).toFixed(2)} ${r.currency.toUpperCase()} — ${r.status ?? 'unknown'} (${r.id})`,
        observedAt: new Date(r.created * 1000),
        note: r.status === 'pending'
            ? 'Issued, not yet settled. The card network can take several days, and the customer will not see it until it does.'
            : r.status === 'failed'
                ? `Stripe could not complete this refund${r.failure_reason ? `: ${r.failure_reason}` : ''}. The customer has NOT been paid.`
                : undefined,
    }));

    // The total that actually came back, which is the question behind the question. Summed in
    // minor units: a float sum of currency is how a reconciliation ends up a cent out.
    const settled = ordered.filter(r => r.status === 'succeeded');
    const total = settled.reduce((sum, r) => sum + r.amount, 0);
    items.push({
        key: 'refund_total', label: 'Total refunded', provenance: 'verified',
        value: `${(total / 100).toFixed(2)} ${(ordered[0]?.currency ?? 'usd').toUpperCase()}`,
        observedAt: at,
        note: settled.length === ordered.length
            ? undefined
            : `Counts the ${settled.length} refund(s) Stripe reports as succeeded, of ${ordered.length} issued.`,
    });
    return items;
}

/** What the suppliers told us, and — for flights only — what they still say. */
async function supplierEvidence(sources: PaymentRow[]): Promise<EvidenceItem[]> {
    const items: EvidenceItem[] = [];

    for (const s of sources) {
        if (s.supplierReference) {
            items.push({
                key: `supplier_ref_${s.source}`,
                label: `Supplier reference (${s.provider ?? s.source})`,
                provenance: 'provider_recorded',
                value: s.supplierReference,
                observedAt: s.createdAt,
                ...(s.product === 'hotel'
                    ? { note: 'Recorded when the booking was made. Not re-checked: the hotel supplier offers no booking-read.' }
                    : {}),
            });
        }
        if (s.bookingStatus) {
            items.push({
                key: `status_${s.source}`,
                label: `Our record (${s.source})`,
                provenance: 'internal',
                value: s.bookingStatus,
                observedAt: s.createdAt,
                note: 'Our own status. Evidence of what we recorded, not of what the supplier did.',
            });
        }
    }

    const hasHotel = sources.some(s => s.product === 'hotel');
    if (hasHotel && !sources.some(s => s.supplierReference)) {
        items.push(missing(
            'supplier_ref_hotel', 'Supplier reference',
            'No supplier reference was recorded against this stay.',
        ));
    }
    return items;
}

/** Documents and messages, as the mail log recorded them. */
async function communicationEvidence(bookingReferences: string[]): Promise<EvidenceItem[]> {
    if (!bookingReferences.length) return [];
    const mail = await prisma.email_logs.findMany({
        where: { booking_id: { in: bookingReferences } },
        orderBy: { created_at: 'asc' },
    });
    if (!mail.length) {
        return [missing('email', 'Confirmation email', 'No email was logged against this booking reference.')];
    }
    return mail.map((m) => ({
        key: `email_${m.id}`,
        label: `${m.email_type} → ${m.recipient}`,
        // A mail provider's delivery report is its claim, not ours.
        provenance: 'provider_recorded' as const,
        value: m.status,
        observedAt: m.sent_at ?? m.created_at,
        ...(m.error_message ? { note: m.error_message } : {}),
    }));
}

export class PaymentEvidenceService {
    /** Gather everything knowable about a payment, each item labelled with how it is known. */
    async gather(paymentIntentId: string): Promise<EvidencePack> {
        const sources = await findPaymentSources(paymentIntentId);
        const keys = keysFrom(sources);

        const [stripeItems, supplierItems, emailItems, timeline] = await Promise.all([
            stripeEvidence(paymentIntentId),
            supplierEvidence(sources),
            communicationEvidence(keys.bookingReferences),
            timelineFor(keys),
        ]);

        const limitations: string[] = [];
        if (sources.some(s => s.product === 'hotel')) {
            limitations.push(
                'Hotel reservations cannot be re-checked with the supplier: TravelgateX exposes search, '
                + 'quote, book and cancel, and no booking-read. Hotel facts here are what the supplier '
                + 'said when the booking was made.',
            );
        }
        if (!sources.length) {
            limitations.push(
                'No internal record references this payment. If Stripe shows it as succeeded, this is '
                + 'a payment taken for a booking that was never written down.',
            );
        }

        return {
            paymentIntentId,
            generatedAt: new Date(),
            sources,
            items: [...stripeItems, ...supplierItems, ...emailItems],
            timeline,
            limitations,
        };
    }
}

export const paymentEvidenceService = new PaymentEvidenceService();
