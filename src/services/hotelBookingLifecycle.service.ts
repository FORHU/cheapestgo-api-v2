/**
 * What happens to a hotel booking attempt between "the card was authorised" and "the guest has
 * a confirmed room", written down once.
 *
 * Money is authorised first (manual capture), the supplier is asked, and only then is it
 * captured. A void is free and instant; a refund is neither, which is why the order is what it
 * is. This service owns the decisions in between:
 *
 *   outcome of the supplier call                     money                     state
 *   ──────────────────────────────────────────────  ────────────────────────  ───────────────
 *   booked                                           capture                   CONFIRMED
 *   sold out / refused / price moved / not payable   void the authorisation    FAILED
 *   timed out / outcome unknown                      KEEP the hold             read back, or
 *                                                                              NEEDS_REVIEW
 *
 * The last row is the one that matters. A timed-out booking has very likely reached the
 * supplier; voiding the payment on it is how a guest ends up holding a room we refunded them
 * for, and it is never done automatically (ADR-0026, ADR-0013).
 *
 * Everything here is best-effort *around* the booking, never in front of it: if the lifecycle
 * tables are unavailable the caller proceeds exactly as it did before they existed. The one
 * thing that is not optional is the void on a definitive failure, because that is about the
 * customer's money rather than our bookkeeping.
 */

import { stripe } from '@/lib/stripe';
import {
    isHotelProviderError,
    type HotelProvider,
    type HotelProviderErrorCode,
    type ProviderBooking,
} from '@/lib/hotels/providers/types';
import {
    HotelBookingLifecycleRepository,
    type BeginInput,
    type LifecycleGuest,
    type LifecycleRecord,
} from '@/repositories/hotelBookingLifecycle.repository';
import {
    projectLegacyStatus,
    type HotelBookingStatus,
    type LifecycleActor,
} from '@/lib/hotels/lifecycle/stateMachine';

/** Failures where the supplier said no and nothing was booked: the money can go back. */
const DEFINITIVE: ReadonlySet<HotelProviderErrorCode> = new Set<HotelProviderErrorCode>([
    'SOLD_OUT', 'PRICE_CHANGED', 'REJECTED', 'NOT_PAYABLE_ONLINE', 'INVALID_RATE',
]);

/** An attempt nobody finished: unpaid after two hours, or authorised and left for thirty minutes. */
export const PENDING_TTL_MS    = 2 * 60 * 60 * 1000;
export const AUTHORISED_TTL_MS = 30 * 60 * 1000;
/** A supplier call that has not resolved in this long is one a person has to look at. */
export const ATTENTION_AFTER_MS = 15 * 60 * 1000;

export interface ConfirmFailure {
    success:            false;
    providerConfirmed?: boolean;
    /** The supplier may hold a reservation and the payment is being kept; nothing was voided. */
    needsReview?:       boolean;
    /** Another caller is completing this booking right now. */
    pending?:           boolean;
    reference?:         string;
    error:              string;
    /** Absent on a failure; declared so a caller can read `.data` across the whole union. */
    data?:              undefined;
}

export interface ConfirmedAlready {
    success: true;
    data: { bookingId: string; status: string; policyType: string; policySummary: string };
}

export type ClaimOutcome =
    | { result: 'claimed' }
    | { result: 'unavailable' }
    | { result: 'lost'; record: LifecycleRecord | null };

export type CaptureOutcome =
    | { ok: true; intent: any }
    | { ok: false; error: string };

export type VoidOutcome = 'voided' | 'already_void' | 'captured' | 'failed';

export interface SweepReport {
    scanned:    number;
    expired:    string[];
    anomalies:  Array<{ reference: string; reason: string }>;
    attention:  Array<{ reference: string; status: HotelBookingStatus; ageMinutes: number; failureCode: string | null }>;
}

export interface LifecycleOptions {
    /** How long a caller that lost the claim waits for the winner to finish. */
    settleTimeoutMs?: number;
    settlePollMs?:    number;
    captureRetryMs?:  number;
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

export class HotelBookingLifecycleService {
    private readonly settleTimeoutMs: number;
    private readonly settlePollMs:    number;
    private readonly captureRetryMs:  number;

    constructor(
        readonly repo: HotelBookingLifecycleRepository = new HotelBookingLifecycleRepository(),
        options: LifecycleOptions = {},
    ) {
        this.settleTimeoutMs = options.settleTimeoutMs ?? 20_000;
        this.settlePollMs    = options.settlePollMs ?? 500;
        this.captureRetryMs  = options.captureRetryMs ?? 750;
    }

    // ── Opening and describing an attempt ───────────────────────────────────

    open(input: BeginInput): Promise<LifecycleRecord | null> {
        return this.repo.begin(input);
    }

    saveInputs(reference: string, draft: Record<string, unknown>, guests: LifecycleGuest[]): Promise<boolean> {
        return this.repo.saveConfirmInputs(reference, { draft, guests });
    }

    // ── The claim ───────────────────────────────────────────────────────────

    /**
     * Wins the right to ask the supplier, for exactly one caller.
     *
     * The browser can arrive before the webhook has recorded the authorisation. The caller has
     * already read the PaymentIntent and seen `requires_capture`, so that is recorded here
     * first; losing that step to the webhook is the same fact recorded twice, not a conflict.
     */
    async claim(reference: string, paymentIntentId: string, actor: LifecycleActor): Promise<ClaimOutcome> {
        const authorised = await this.repo.transition(reference, 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', {
            actor, reason: 'authorisation verified with Stripe',
        });
        if (authorised === 'unavailable') return { result: 'unavailable' };
        if (authorised === 'applied') await this.repo.markPayment(paymentIntentId, 'authorized');

        const claimed = await this.repo.transition(reference, 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', {
            actor, reason: 'claimed for supplier booking',
        });
        if (claimed === 'applied') return { result: 'claimed' };
        if (claimed === 'unavailable') return { result: 'unavailable' };
        return { result: 'lost', record: await this.repo.findByReference(reference) };
    }

    /**
     * The answer for a caller that lost the claim.
     *
     * Not an error: the booking is being, or has been, completed by someone else — the browser's
     * double submit, or the webhook. When the winner is still mid-flight this waits for it, so a
     * checkout that was not written with a "pending" state in mind still gets the real answer.
     */
    async answerLostClaim(record: LifecycleRecord | null): Promise<ConfirmedAlready | ConfirmFailure | null> {
        if (!record) return null; // could not even read it: behave as before the lifecycle existed

        let current: LifecycleRecord | null = record;
        if (current.status === 'SUPPLIER_BOOKING' || current.status === 'PAYMENT_AUTHORIZED') {
            current = await this.settle(record.reference);
        }
        if (!current) return null;

        switch (current.status) {
            case 'CONFIRMED':
            case 'CANCEL_REQUESTED':
            case 'CANCELLED':
            case 'REFUND_PENDING':
            case 'REFUNDED':
            case 'REFUND_FAILED':
                return {
                    success: true,
                    data: { bookingId: current.reference, status: projectLegacyStatus(current.status) ?? 'confirmed', policyType: 'standard', policySummary: '' },
                };
            case 'FAILED':
            case 'EXPIRED':
                return {
                    success: false, providerConfirmed: false, reference: current.reference,
                    error: current.failureMessage ?? 'This booking could not be completed.',
                };
            default:
                return {
                    success: false, pending: true, needsReview: current.status === 'NEEDS_REVIEW',
                    reference: current.reference,
                    error: 'Your booking is still being confirmed. You have not been charged twice — please check your trips shortly.',
                };
        }
    }

    private async settle(reference: string): Promise<LifecycleRecord | null> {
        const deadline = Date.now() + this.settleTimeoutMs;
        let latest = await this.repo.findByReference(reference);
        while (latest && (latest.status === 'SUPPLIER_BOOKING' || latest.status === 'PAYMENT_AUTHORIZED') && Date.now() < deadline) {
            await sleep(this.settlePollMs);
            latest = await this.repo.findByReference(reference);
        }
        return latest;
    }

    // ── What the supplier said ──────────────────────────────────────────────

    /**
     * Decides what a failed `book` means for the money.
     *
     * `recovered` is the one case that continues the booking: the supplier timed out, but it can
     * be asked and it says the reservation exists.
     */
    async onBookFailure(ctx: {
        err:             unknown;
        provider:        HotelProvider;
        paymentIntentId: string;
        /** Our lifecycle key; absent for a payment taken before references existed. */
        reference?:      string;
        /** The reference the supplier filed the reservation under. */
        clientReference: string;
        claimed:         boolean;
        actor:           LifecycleActor;
    }): Promise<{ kind: 'recovered'; booking: ProviderBooking } | { kind: 'failed'; response: ConfirmFailure }> {
        const err = ctx.err as { code?: string; message?: string } | null | undefined;
        const message = err?.message || 'Booking failed';
        const code = isHotelProviderError(ctx.err) ? ctx.err.code : undefined;

        // ── Definitive: nothing was booked, so the authorisation is released ─────────────
        if (code && DEFINITIVE.has(code)) {
            const voided = await this.voidAuthorisation(ctx.paymentIntentId);
            if (ctx.reference && ctx.claimed) {
                if (voided === 'voided' || voided === 'already_void') {
                    await this.repo.transition(ctx.reference, 'SUPPLIER_BOOKING', 'FAILED', {
                        actor: ctx.actor, reason: `supplier ${code}`, patch: { failureCode: code, failureMessage: message },
                    });
                    await this.repo.markPayment(ctx.paymentIntentId, 'voided');
                } else {
                    // The supplier said no but the hold could not be released: the customer's
                    // money is stuck, which is for a person to fix rather than a failure to file.
                    await this.repo.transition(ctx.reference, 'SUPPLIER_BOOKING', 'NEEDS_REVIEW', {
                        actor: ctx.actor, reason: 'supplier refused and the authorisation could not be voided',
                        patch: { failureCode: 'VOID_FAILED', failureMessage: message },
                    });
                }
            }
            return { kind: 'failed', response: { success: false, providerConfirmed: false, reference: ctx.reference, error: message } };
        }

        // ── Ambiguous: it may have landed. Keep the hold; look if we can ──────────────────
        if (ctx.provider.capabilities.bookingRead && ctx.provider.getBooking) {
            try {
                const found = await ctx.provider.getBooking({ clientRef: ctx.clientReference });
                if (found && found.status !== 'CANCELLED') {
                    if (ctx.reference) {
                        await this.repo.note(ctx.reference, ctx.actor, 'read back after an unanswered booking: the reservation exists', {
                            supplierRef: found.supplierRef ?? null,
                        });
                    }
                    return { kind: 'recovered', booking: found };
                }
            } catch (readErr: any) {
                console.warn('[hotel-lifecycle] read-back after an unanswered booking failed:', readErr?.message);
            }
        }

        if (ctx.reference && ctx.claimed) {
            await this.repo.transition(ctx.reference, 'SUPPLIER_BOOKING', 'NEEDS_REVIEW', {
                actor: ctx.actor, reason: 'supplier outcome unknown; payment kept',
                patch: { failureCode: code ?? 'UNKNOWN_OUTCOME', failureMessage: message },
            });
        }
        return {
            kind: 'failed',
            response: { success: false, providerConfirmed: false, needsReview: true, reference: ctx.reference, error: message },
        };
    }

    // ── Money ───────────────────────────────────────────────────────────────

    /**
     * Captures once per booking.
     *
     * The idempotency key makes a replay return the original capture rather than an error. On a
     * failure it asks Stripe what state the payment is really in before giving up, because a
     * capture that landed but whose response was lost looks exactly like one that failed.
     */
    async capture(paymentIntentId: string, idempotencySuffix: string, expand: string[]): Promise<CaptureOutcome> {
        const key = `hotel-capture-${idempotencySuffix}`;
        let lastError = 'Payment capture failed';

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const intent = await stripe.paymentIntents.capture(paymentIntentId, { expand }, { idempotencyKey: key });
                return { ok: true, intent };
            } catch (err: any) {
                lastError = err?.message || lastError;
                try {
                    const current = await stripe.paymentIntents.retrieve(paymentIntentId, { expand });
                    if (current?.status === 'succeeded') return { ok: true, intent: current };
                } catch { /* fall through to the retry */ }
                if (attempt === 0) await sleep(this.captureRetryMs);
            }
        }
        return { ok: false, error: lastError };
    }

    /**
     * Releases an authorisation. Never voids a payment that has been captured: that would be a
     * refund wearing a void's name, and it is not ours to do on a hunch.
     */
    async voidAuthorisation(paymentIntentId: string): Promise<VoidOutcome> {
        try {
            const current = await stripe.paymentIntents.retrieve(paymentIntentId);
            if (current.status === 'canceled') return 'already_void';
            if (current.status === 'succeeded') return 'captured';
            await stripe.paymentIntents.cancel(paymentIntentId);
            return 'voided';
        } catch (err: any) {
            console.error(`[hotel-lifecycle] could not void ${paymentIntentId}:`, err?.message);
            return 'failed';
        }
    }

    // ── The other outcomes of a booking we claimed ──────────────────────────

    async confirmed(reference: string, paymentIntentId: string, supplierReference: string | undefined, actor: LifecycleActor): Promise<void> {
        await this.repo.transition(reference, 'SUPPLIER_BOOKING', 'CONFIRMED', {
            actor, reason: 'supplier booked and payment captured',
            patch: { supplierReference: supplierReference ?? null },
        });
        await this.repo.markPayment(paymentIntentId, 'captured');
    }

    /** The supplier holds a reservation and we could not take the money for it. */
    flagCaptureFailure(reference: string, message: string, actor: LifecycleActor) {
        return this.repo.transition(reference, 'SUPPLIER_BOOKING', 'NEEDS_REVIEW', {
            actor, reason: 'supplier booked but the payment could not be captured',
            patch: { failureCode: 'CAPTURE_FAILED', failureMessage: message },
        });
    }

    /** The supplier booked at a price beyond what the guest agreed to. A person decides. */
    flagPriceMoved(reference: string, quoted: number, booked: number, actor: LifecycleActor) {
        return this.repo.transition(reference, 'SUPPLIER_BOOKING', 'NEEDS_REVIEW', {
            actor, reason: 'supplier booked at a higher price than quoted',
            patch: { failureCode: 'PRICE_CHANGED_AFTER_BOOKING', failureMessage: `quoted ${quoted}, booked ${booked}` },
        });
    }

    // ── Cancellation, recorded alongside the existing flow ──────────────────

    /** Best-effort: the cancellation flow predates the lifecycle and must not wait on it. */
    async recordCancelStart(reference: string, actor: LifecycleActor): Promise<void> {
        const moved = await this.repo.transition(reference, 'CONFIRMED', 'CANCEL_REQUESTED', { actor, reason: 'cancellation requested' });
        if (moved === 'lost') {
            // A refund retry: the previous attempt left the booking at REFUND_FAILED.
            await this.repo.transition(reference, 'REFUND_FAILED', 'REFUND_PENDING', { actor, reason: 'refund retried' });
        }
    }

    /** The supplier refused: the booking is exactly what it was, and so is the guest's money. */
    cancelRefused(reference: string, message: string, actor: LifecycleActor) {
        return this.repo.transition(reference, 'CANCEL_REQUESTED', 'CONFIRMED', {
            actor, reason: `supplier refused the cancellation: ${message.slice(0, 200)}`,
        });
    }

    /** The supplier did not say, and could not be asked: a person finds out before money moves. */
    cancelUnconfirmed(reference: string, message: string, actor: LifecycleActor) {
        return this.repo.transition(reference, 'CANCEL_REQUESTED', 'NEEDS_REVIEW', {
            actor, reason: 'supplier outcome unknown for the cancellation; nothing refunded',
            patch: { failureCode: 'CANCEL_UNCONFIRMED', failureMessage: message },
        });
    }

    async recordCancelEnd(reference: string, legacyStatus: string, actor: LifecycleActor): Promise<void> {
        const from: HotelBookingStatus[] = ['CANCEL_REQUESTED'];
        switch (legacyStatus) {
            case 'cancelled_refunded':
                await this.repo.transition(reference, from, 'REFUND_PENDING', { actor, reason: 'refund issued' });
                await this.repo.transition(reference, 'REFUND_PENDING', 'REFUNDED', { actor, reason: 'refund completed' });
                return;
            case 'cancelled_refund_failed':
                await this.repo.transition(reference, from, 'REFUND_PENDING', { actor, reason: 'refund attempted' });
                await this.repo.transition(reference, 'REFUND_PENDING', 'REFUND_FAILED', { actor, reason: 'refund failed' });
                return;
            default:
                await this.repo.transition(reference, from, 'CANCELLED', { actor, reason: 'cancelled, nothing to refund' });
        }
    }

    // ── Webhook completion ──────────────────────────────────────────────────

    /** The authorisation landed. Returns the attempt, or null when this payment is not one of ours. */
    async recordAuthorised(paymentIntentId: string): Promise<LifecycleRecord | null> {
        const record = await this.repo.findByPaymentIntent(paymentIntentId);
        if (!record) return null;
        const moved = await this.repo.transition(record.reference, 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', {
            actor: 'webhook', reason: 'Stripe reported the authorisation',
        });
        if (moved === 'applied') await this.repo.markPayment(paymentIntentId, 'authorized');
        return (await this.repo.findByReference(record.reference)) ?? record;
    }

    /**
     * The parameters `confirmBooking` needs, rebuilt from what the traveller supplied when they
     * paid. Null when they did not supply them yet — the webhook then only records the
     * authorisation and the browser's confirm call completes the booking, as it always did.
     */
    async confirmParamsFor(record: LifecycleRecord): Promise<Record<string, unknown> | null> {
        const guests = await this.repo.loadGuests(record.reference);
        const holder = guests.find((g) => g.kind === 'holder');
        if (!holder || !holder.email) return null;
        if (!record.checkIn || !record.checkOut) return null;

        const others = guests.filter((g) => g.kind !== 'holder');
        return {
            ...record.draft,
            paymentIntentId: record.paymentIntentId,
            userId:          record.userId,
            prebookId:       record.prebookRef,
            holder:          { firstName: holder.firstName, lastName: holder.lastName, email: holder.email },
            guests:          others.map((g) => ({ firstName: g.firstName, lastName: g.lastName, ...(g.age != null ? { age: g.age } : {}) })),
            propertyName:    record.propertyName ?? undefined,
            roomName:        record.roomName ?? undefined,
            checkIn:         record.checkIn,
            checkOut:        record.checkOut,
            currency:        record.currency,
        };
    }

    // ── The sweeper ─────────────────────────────────────────────────────────

    /**
     * Cleans up attempts nobody finished and reports the ones that need a person.
     *
     * It releases money and closes records. It never books and never calls the supplier: the
     * query it walks excludes any attempt with a supplier call recorded against it, so the only
     * things it can touch are payments for which the supplier was never asked anything.
     */
    async sweep(now: Date = new Date(), limit = 100): Promise<SweepReport> {
        const report: SweepReport = { scanned: 0, expired: [], anomalies: [], attention: [] };

        const pending    = await this.repo.findAbandoned(['PAYMENT_PENDING'], new Date(now.getTime() - PENDING_TTL_MS), limit);
        const authorised = await this.repo.findAbandoned(['PAYMENT_AUTHORIZED'], new Date(now.getTime() - AUTHORISED_TTL_MS), limit);

        for (const record of [...pending, ...authorised]) {
            report.scanned++;
            if (!record.paymentIntentId) {
                report.anomalies.push({ reference: record.reference, reason: 'no payment intent recorded' });
                continue;
            }

            const voided = await this.voidAuthorisation(record.paymentIntentId);
            if (voided === 'captured') {
                // Paid, never booked, and the supplier was never asked. Not ours to unwind.
                report.anomalies.push({ reference: record.reference, reason: 'payment was captured but the supplier was never asked' });
                continue;
            }
            if (voided === 'failed') {
                report.anomalies.push({ reference: record.reference, reason: 'could not release the authorisation' });
                continue;
            }

            const moved = await this.repo.transition(record.reference, ['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED'], 'EXPIRED', {
                actor: 'sweeper',
                reason: record.status === 'PAYMENT_AUTHORIZED' ? 'authorised and never completed' : 'payment never started',
                patch: { failureCode: 'ABANDONED' },
            });
            if (moved === 'applied') {
                await this.repo.markPayment(record.paymentIntentId, 'voided');
                report.expired.push(record.reference);
            }
        }

        const stuck = await this.repo.findNeedingAttention(new Date(now.getTime() - ATTENTION_AFTER_MS), limit);
        for (const record of stuck) {
            report.attention.push({
                reference:   record.reference,
                status:      record.status,
                ageMinutes:  Math.round((now.getTime() - record.updatedAt.getTime()) / 60_000),
                failureCode: record.failureCode,
            });
        }
        return report;
    }
}
