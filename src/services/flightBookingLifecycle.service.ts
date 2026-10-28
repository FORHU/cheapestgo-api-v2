/**
 * What happens to a flight booking attempt between "the card was authorised" and "the traveller
 * has a ticket", written down once.
 *
 * Money is authorised first (manual capture), the airline is asked for an order, and only then
 * is the money captured. A void is free and instant; a refund is neither. Flights used to run
 * the other way round — order at `book`, charge at the card — which charged travellers for
 * tickets that then had to be cancelled. This service owns the decisions in between:
 *
 *   what Duffel said                                  money                       state
 *   ───────────────────────────────────────────────   ─────────────────────────   ─────────────
 *   ordered                                           capture (never more than    CONFIRMED
 *                                                     authorised; less if the
 *                                                     fare came down)
 *   price up beyond tolerance / offer gone / refused  void the authorisation      FAILED
 *   timed out / 5xx / connection dropped              KEEP the hold; read back    CONFIRMED, or
 *                                                                                 NEEDS_REVIEW
 *
 * The last row is the one that matters. An order request that did not answer has very likely
 * reached the airline, and Duffel may have issued the ticket; voiding on it is how a traveller
 * ends up flying on money we gave back. It is never done automatically (ADR-0026, ADR-0013).
 *
 * The sale — `flight_bookings` and everything trips, invoices and admin read — is written only
 * after the capture. An order whose payment could not be taken is recorded on the attempt
 * (`flight_booking_events`), because the orphaned-order cron cancels the order of an unpaid
 * `flight_bookings` row.
 *
 * Mirrors hotelBookingLifecycle.service.ts. The browser's confirm and the Stripe webhook both
 * come here, and the claim decides which of them asks the airline.
 */

import { config } from '@/config';
import { stripe } from '@/lib/stripe';
import { getDuffelOffer, placeDuffelOrder, ORDER_CREATE_TIMEOUT_MS, type PlaceDuffelOrderResult } from '@/lib/flights/duffel';
import { findOrderFromTimedOutAttempt, toReconciledOrder } from '@/lib/flights/duffelOrderReconcile';
import { buildOrderPassengers, orderPhoneNumber } from '@/lib/flights/orderPassengers';
import { orderTotal } from '@/lib/flights/orderTotal';
import { startSupplierAttempt, finishSupplierAttempt } from '@/lib/hotels/supplierAttempt';
import { makeStrictConverter } from '@/lib/payments/convertStrict';
import { applyMarkup, FLIGHT_MARKUP_SPEC, getFlightPriceTolerance } from '@/lib/pricing';
import type { FlightBookingStatus, LifecycleActor } from '@/lib/flights/lifecycle/stateMachine';
import { FlightBookingLifecycleRepository, type FlightLifecycleRecord } from '@/repositories/flightBookingLifecycle.repository';
import { FlightsRepository } from '@/repositories/flights.repository';
import { ExchangeRatesService } from '@/services/exchange-rates.service';
import { completeDuffelBooking, type CompletionSession, type DuffelOrderRef } from '@/services/flightBookingCompletion';

/** An attempt nobody finished: unpaid after two hours, or authorised and left for thirty minutes. */
export const PENDING_TTL_MS    = 2 * 60 * 60 * 1000;
export const AUTHORISED_TTL_MS = 30 * 60 * 1000;
/** An airline order that has not resolved in this long is one a person has to look at. */
export const ATTENTION_AFTER_MS = 15 * 60 * 1000;

const NOT_CHARGED = 'Your card has not been charged.';
const OFFER_GONE  = `This fare is no longer available. ${NOT_CHARGED} Please search again for current prices.`;
const STILL_CONFIRMING = 'Your booking is still being confirmed with the airline. You have not been charged twice — please check your trips shortly.';
const UNDER_REVIEW = 'Your booking is being confirmed by our team. Please do not pay again — check your trips shortly, and we will email you once it is settled.';
const NOT_COMPLETED = `This booking could not be completed. ${NOT_CHARGED}`;

export type CompletionOutcome =
    | { kind: 'confirmed'; bookingId: string; pnr: string; status: string }
    | { kind: 'failed'; code: string; message: string; details?: Record<string, unknown> }
    | { kind: 'pending'; needsReview: boolean; message: string };

export type VoidOutcome = 'voided' | 'already_void' | 'captured' | 'failed';

export interface SweepReport {
    scanned:   number;
    /** Session ids. */
    expired:   string[];
    anomalies: Array<{ sessionId: string; reason: string }>;
    attention: Array<{
        sessionId:       string;
        status:          FlightBookingStatus;
        ageMinutes:      number;
        failureCode:     string | null;
        supplierOrderId: string | null;
    }>;
}

export interface LifecycleOptions {
    /** How long a caller that lost the claim waits for the winner to finish. */
    settleTimeoutMs?: number;
    settlePollMs?:    number;
    captureRetryMs?:  number;
}

/** What one completion is working on, once the session and payment have been checked. */
interface Attempt {
    sessionId:       string;
    paymentIntentId: string;
    actor:           LifecycleActor;
    session:         CompletionSession & Record<string, any>;
    /** In Stripe's minor units. */
    authorisedMinor: number;
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

const pending = (needsReview: boolean): CompletionOutcome =>
    ({ kind: 'pending', needsReview, message: needsReview ? UNDER_REVIEW : STILL_CONFIRMING });

/**
 * What to capture for an order the airline priced at `finalBase`, against a hold computed from
 * `bookedBase` — both in the fare's own currency.
 *
 * A fare that came down is charged less, by the same markup `book` applied, and at the exchange
 * rate the hold was taken at: the ratio of the two marked-up prices scales the amount that was
 * authorised. A fare that went up is not this function's to charge — the hold can be captured
 * for less, never for more.
 */
export function captureAmountMinor(authorisedMinor: number, bookedBase: number, finalBase: number, flatInBase: number): number {
    if (!(bookedBase > 0) || !(finalBase > 0) || finalBase >= bookedBase) return authorisedMinor;
    const before = applyMarkup(bookedBase, FLIGHT_MARKUP_SPEC, flatInBase).chargedPrice;
    const after  = applyMarkup(finalBase, FLIGHT_MARKUP_SPEC, flatInBase).chargedPrice;
    if (!(before > 0)) return authorisedMinor;
    return Math.min(authorisedMinor, Math.round((authorisedMinor * after) / before));
}

/** The order Duffel answered with, in the shape the sale is written from. */
function orderRef(order: any): DuffelOrderRef {
    const tickets: string[] = (order?.documents ?? [])
        .filter((d: any) => d.type === 'electronic_ticket')
        .map((d: any) => d.unique_identifier as string);
    return { orderId: order.id, pnr: order.booking_reference ?? order.id, tickets, isTicketed: tickets.length > 0 };
}

/** The traveller-facing reason for a refusal Duffel gave in words. Same wording `book` used. */
function refusal(result: { status: number; data: any }): { code: string; message: string } {
    const rawMsg: string = result.data?.errors?.[0]?.message ?? '';
    const isPhoneErr   = /phone_number/i.test(rawMsg);
    const isExpiredErr = result.status === 422 || /expired|no longer available|select another offer/i.test(rawMsg);
    const isSeatErr    = /seat|service.*unavailable|no longer.*available.*service/i.test(rawMsg) && !isExpiredErr;

    if (isExpiredErr && !isPhoneErr) return { code: 'OFFER_EXPIRED', message: OFFER_GONE };
    const message = isPhoneErr ? 'Invalid phone number format. Please check your phone number and country code.'
        : isSeatErr ? 'One or more selected seats are no longer available. Please choose different seats or continue without seat selection.'
            : rawMsg || 'Flight booking failed. Please try again.';
    return { code: 'DUFFEL_ORDER_FAILED', message: `${message} ${NOT_CHARGED}` };
}

export class FlightBookingLifecycleService {
    private readonly settleTimeoutMs: number;
    private readonly settlePollMs:    number;
    private readonly captureRetryMs:  number;

    constructor(
        readonly repo: FlightBookingLifecycleRepository = new FlightBookingLifecycleRepository(),
        private readonly sessions: FlightsRepository = new FlightsRepository(),
        options: LifecycleOptions = {},
    ) {
        this.settleTimeoutMs = options.settleTimeoutMs ?? 20_000;
        this.settlePollMs    = options.settlePollMs ?? 500;
        this.captureRetryMs  = options.captureRetryMs ?? 750;
    }

    // ── Opening an attempt ──────────────────────────────────────────────────

    /** Records that `book` opened an attempt. Null when the lifecycle is not there yet. */
    open(sessionId: string): Promise<FlightLifecycleRecord | null> {
        return this.repo.begin(sessionId);
    }

    /** Where an attempt is. Null when there is none, or the lifecycle is not there yet. */
    find(sessionId: string): Promise<FlightLifecycleRecord | null> {
        return this.repo.findBySession(sessionId);
    }

    // ── Completion ──────────────────────────────────────────────────────────

    /**
     * Turns an authorised payment into a ticketed booking, or releases it — for exactly one
     * caller per payment. Everyone else is answered from what that caller recorded.
     *
     * @param userId The traveller asking, when one is; the webhook has none.
     */
    async complete(input: {
        sessionId:       string;
        paymentIntentId: string;
        actor:           LifecycleActor;
        userId?:         string;
    }): Promise<CompletionOutcome> {
        const { sessionId, paymentIntentId, actor } = input;
        const mismatch: CompletionOutcome = { kind: 'failed', code: 'SESSION_MISMATCH', message: 'Session/payment mismatch' };

        const session = await this.sessions.getBookingSession(sessionId);
        if (!session) return { kind: 'failed', code: 'SESSION_NOT_FOUND', message: 'Booking session not found.' };
        if (input.userId && session.user_id !== input.userId) return mismatch;
        if (session.payment_intent_id !== paymentIntentId) return mismatch;

        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (intent.metadata?.bookingSessionId !== sessionId) return mismatch;

        if (intent.status === 'succeeded') return this.answer(sessionId);
        if (intent.status === 'canceled') {
            const answer = await this.answer(sessionId);
            return answer.kind === 'failed'
                ? answer
                : { kind: 'failed', code: 'PAYMENT_NOT_AUTHORIZED', message: `This payment was released. ${NOT_CHARGED} Please book again.` };
        }
        if (intent.status !== 'requires_capture') {
            return { kind: 'failed', code: 'PAYMENT_NOT_AUTHORIZED', message: `Payment not authorised (status: ${intent.status})` };
        }

        const claim = await this.claim(sessionId, actor);
        if (claim === 'lost') return this.answer(sessionId);

        return this.order({
            sessionId, paymentIntentId, actor,
            session: session as unknown as Attempt['session'],
            authorisedMinor: intent.amount_capturable || intent.amount,
        });
    }

    /**
     * The Stripe webhook's way in: the authorisation landed, so the attempt can be completed
     * without the browser — whose tab may have closed the moment the card was accepted. The
     * same routine, under the same claim, as the browser's confirm: whichever arrives first
     * asks the airline, and the other is answered with its result.
     *
     * A payment from before this release captures automatically and had its order placed at
     * `book`; it is not this routine's to complete.
     */
    async completeFromPayment(intent: {
        id:              string;
        capture_method?: string | null;
        metadata?:       Record<string, string> | null;
    }): Promise<{ handled: false } | { handled: true; outcome: CompletionOutcome['kind'] }> {
        const sessionId = intent.metadata?.bookingSessionId;
        if (!sessionId || intent.capture_method !== 'manual') return { handled: false };
        const outcome = await this.complete({ sessionId, paymentIntentId: intent.id, actor: 'webhook' });
        return { handled: true, outcome: outcome.kind };
    }

    /**
     * Wins the right to ask the airline. The authorisation is recorded first — the browser can
     * arrive before the webhook has — and losing that step is the same fact recorded twice, not
     * a conflict. While the lifecycle column is not there, the session's own `status` lock does
     * the job it did before the lifecycle existed.
     */
    private async claim(sessionId: string, actor: LifecycleActor): Promise<'claimed' | 'lost'> {
        const authorised = await this.repo.transition(sessionId, 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', {
            actor, reason: 'authorisation verified with Stripe',
        });
        if (authorised !== 'unavailable') {
            const claimed = await this.repo.transition(sessionId, 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', {
                actor, reason: 'claimed for the airline order',
            });
            if (claimed === 'applied') return 'claimed';
            if (claimed === 'lost') return 'lost';
        }
        return (await this.sessions.lockSessionForBooking(sessionId)) ? 'claimed' : 'lost';
    }

    // ── Asking the airline ──────────────────────────────────────────────────

    private async order(a: Attempt): Promise<CompletionOutcome> {
        const { session } = a;
        const offerId: string | undefined = session.flight?._offerId;
        const seatServiceIds: string[] = session.seat_service_ids ?? [];
        const bagServiceIds: string[]  = session.bag_service_ids ?? [];

        let rawOffer: any;
        try {
            rawOffer = offerId
                ? await getDuffelOffer(offerId, { withServices: seatServiceIds.length + bagServiceIds.length > 0 })
                : null;
        } catch (err: any) {
            console.warn(`[flight-lifecycle] offer ${offerId} could not be read: ${err?.message}`);
            return this.refused(a, 'UPSTREAM_UNAVAILABLE', `We could not reach the airline to confirm your fare. ${NOT_CHARGED} Please try again.`);
        }
        if (!rawOffer) return this.refused(a, 'OFFER_EXPIRED', OFFER_GONE);

        const contact: any = session.contact ?? {};
        const phone = orderPhoneNumber(contact);
        if (!phone) {
            return this.refused(a, 'INVALID_PHONE', `Invalid phone number. Please enter a valid phone number with country code. ${NOT_CHARGED}`);
        }

        const total = orderTotal(rawOffer, seatServiceIds, bagServiceIds);
        const bookedBase = Number(session.original_price ?? total);

        // Before the call, not after: a request that dies mid-flight has very likely reached
        // the airline, and the sweeper must never treat this attempt as one it can release.
        const attemptId = await startSupplierAttempt({ provider: 'duffel', operation: 'book', clientReference: a.sessionId });
        const startedAt = new Date().toISOString();

        let result: PlaceDuffelOrderResult | null = null;
        try {
            result = await placeDuffelOrder({
                rawOffer,
                passengers: buildOrderPassengers(rawOffer, session.passengers ?? [], { email: contact.email, phone }),
                total,
                currency: rawOffer.total_currency,
                seatServiceIds,
                bagServiceIds,
                confirmedPrice: bookedBase,
                priceTolerance: getFlightPriceTolerance(),
                // This attempt's, not the browser's: the browser's key is per offer, so a retry
                // with a corrected name would be answered with the first attempt's refusal.
                idempotencyKey: `flight-order-${a.sessionId}`,
                refreshPoolSize: 3,
                orderTimeoutMs: ORDER_CREATE_TIMEOUT_MS,
            });
        } catch (err: any) {
            console.error(`[flight-lifecycle] order request for ${a.sessionId} failed in flight: ${err?.message}`);
        }

        if (result?.kind === 'success') {
            const order = orderRef(result.order);
            await finishSupplierAttempt(attemptId, {
                status: 'confirmed', supplierReference: order.orderId,
                priceGross: Number(result.finalTotal), currency: result.finalCurrency,
            });
            return this.ordered(a, order, Number(result.finalTotal), result.finalCurrency, bookedBase);
        }
        if (result?.kind === 'price_changed') {
            await finishSupplierAttempt(attemptId, { status: 'failed', error: `price changed ${result.oldPrice} → ${result.newPrice}` });
            return this.refused(
                a, 'PRICE_CHANGED',
                `The fare changed from ${result.oldPrice} to ${result.newPrice} ${result.currency} before the airline confirmed it. ${NOT_CHARGED} Please review the new price and book again.`,
                { oldPrice: result.oldPrice, newPrice: result.newPrice, currency: result.currency },
            );
        }
        if (result?.kind === 'offer_replaced') {
            await finishSupplierAttempt(attemptId, { status: 'failed', error: 'offer replaced; seats or bags would have to be chosen again' });
            return this.refused(a, 'OFFER_EXPIRED', OFFER_GONE);
        }
        if (result?.kind === 'error' && !result.timedOut && result.status < 500) {
            const { code, message } = refusal(result);
            await finishSupplierAttempt(attemptId, { status: 'failed', error: result.data?.errors?.[0]?.message ?? `HTTP ${result.status}` });
            return this.refused(a, code, message);
        }

        // ── No answer: it may have landed. Keep the hold; look for it ─────────────────────
        const found = await this.readBack(rawOffer, total, startedAt, session.passengers?.[0]?.lastName);
        if (found) {
            const reconciled = toReconciledOrder(found);
            await this.repo.note(a.sessionId, a.actor, 'read back after an unanswered order: the order exists', { orderId: reconciled.orderId });
            await finishSupplierAttempt(attemptId, { status: 'confirmed', supplierReference: reconciled.orderId });
            return this.ordered(
                a,
                { orderId: reconciled.orderId, pnr: reconciled.pnr || reconciled.orderId, tickets: reconciled.tickets, isTicketed: reconciled.isTicketed },
                Number(reconciled.orderTotal), reconciled.orderCurrency, bookedBase,
            );
        }

        // The supplier attempt stays open: "we asked and do not know" is the honest record.
        await this.repo.transition(a.sessionId, 'SUPPLIER_BOOKING', 'NEEDS_REVIEW', {
            actor: a.actor, reason: 'airline did not answer and no order was found; payment kept',
            patch: {
                failureCode: 'UNKNOWN_OUTCOME',
                failureMessage: result?.kind === 'error' ? `HTTP ${result.status}${result.timedOut ? ' (timed out)' : ''}` : 'request failed in flight',
            },
        });
        return pending(true);
    }

    private async readBack(rawOffer: any, total: string, sinceIso: string, familyName?: string): Promise<any | null> {
        const token = config.DUFFEL_ACCESS_TOKEN;
        if (!token) return null;
        const lastSlice = rawOffer.slices?.[rawOffer.slices.length - 1];
        try {
            return await findOrderFromTimedOutAttempt(token, {
                sinceIso,
                origin:      rawOffer.slices?.[0]?.segments?.[0]?.origin?.iata_code ?? '',
                destination: lastSlice?.segments?.[lastSlice.segments.length - 1]?.destination?.iata_code ?? '',
                totalAmount: total,
                currency:    rawOffer.total_currency,
                familyName,
            });
        } catch (err: any) {
            console.warn('[flight-lifecycle] read-back after an unanswered order failed:', err?.message);
            return null;
        }
    }

    // ── The outcomes of an attempt we claimed ───────────────────────────────

    /** The airline holds an order: take the money, then record the sale. */
    private async ordered(a: Attempt, order: DuffelOrderRef, finalBase: number, finalCurrency: string, bookedBase: number): Promise<CompletionOutcome> {
        const base = String(a.session.currency ?? '').toLowerCase();
        let amount: number | null = null;
        if (finalCurrency.toLowerCase() === base && finalBase < bookedBase) {
            const captureMinor = captureAmountMinor(a.authorisedMinor, bookedBase, finalBase, await this.flatInBase(base));
            if (captureMinor < a.authorisedMinor) amount = captureMinor;
        } else if (finalBase > bookedBase) {
            console.warn(`[flight-lifecycle] ${a.sessionId}: airline charged ${finalBase} against ${bookedBase} booked — capturing the authorisation, not more`);
        }

        const captured = await this.capture(a.paymentIntentId, a.sessionId, amount);
        if (!captured.ok) {
            await this.repo.transition(a.sessionId, 'SUPPLIER_BOOKING', 'NEEDS_REVIEW', {
                actor: a.actor, reason: 'airline ordered but the payment could not be captured',
                payload: { pnr: order.pnr },
                patch: { failureCode: 'CAPTURE_FAILED', failureMessage: captured.error, supplierOrderId: order.orderId },
            });
            return pending(true);
        }

        try {
            const sale = await completeDuffelBooking({ session: a.session, paymentIntentId: a.paymentIntentId, order });
            await this.repo.transition(a.sessionId, 'SUPPLIER_BOOKING', 'CONFIRMED', {
                actor: a.actor, reason: 'airline ordered and payment captured',
                patch: { supplierOrderId: order.orderId },
            });
            return { kind: 'confirmed', bookingId: sale.bookingId, pnr: sale.pnr, status: sale.status };
        } catch (err: any) {
            console.error(`[flight-lifecycle] ${a.sessionId}: order ${order.orderId} paid for but the booking could not be recorded: ${err?.message}`);
            await this.repo.transition(a.sessionId, 'SUPPLIER_BOOKING', 'NEEDS_REVIEW', {
                actor: a.actor, reason: 'airline ordered and payment captured, but the booking could not be recorded',
                payload: { pnr: order.pnr },
                patch: { failureCode: 'SALE_NOT_RECORDED', failureMessage: err?.message ?? String(err), supplierOrderId: order.orderId },
            });
            return pending(true);
        }
    }

    /** Nothing was ordered, so the authorisation is released. */
    private async refused(a: Attempt, code: string, message: string, details?: Record<string, unknown>): Promise<CompletionOutcome> {
        const voided = await this.voidAuthorisation(a.paymentIntentId);
        if (voided === 'voided' || voided === 'already_void') {
            await this.repo.transition(a.sessionId, 'SUPPLIER_BOOKING', 'FAILED', {
                actor: a.actor, reason: `not ordered: ${code}`, patch: { failureCode: code, failureMessage: message },
            });
        } else {
            // Nothing was ordered but the money did not come back: a person releases it.
            await this.repo.transition(a.sessionId, 'SUPPLIER_BOOKING', 'NEEDS_REVIEW', {
                actor: a.actor,
                reason: voided === 'captured' ? 'not ordered, and the payment had already been captured' : 'not ordered, and the authorisation could not be voided',
                payload: { refusal: code },
                patch: { failureCode: voided === 'captured' ? 'CAPTURED_WITHOUT_ORDER' : 'VOID_FAILED', failureMessage: message },
            });
        }
        await this.sessions.setSessionStatus(a.sessionId, 'failed')
            .catch((err: any) => console.error(`[flight-lifecycle] could not mark ${a.sessionId} failed: ${err?.message}`));
        return { kind: 'failed', code, message, ...(details ? { details } : {}) };
    }

    // ── Answering a caller that did not ask the airline ─────────────────────

    /**
     * Not an error: the attempt is being, or has been, completed by someone else — a double
     * submit, or the webhook. When the winner is still mid-flight this waits for it, so a
     * checkout not written with "pending" in mind still gets the real answer.
     */
    private async answer(sessionId: string): Promise<CompletionOutcome> {
        let current = await this.repo.findBySession(sessionId);
        if (!current) return this.answerUntracked(sessionId);

        const deadline = Date.now() + this.settleTimeoutMs;
        while ((current.status === 'SUPPLIER_BOOKING' || current.status === 'PAYMENT_AUTHORIZED') && Date.now() < deadline) {
            await sleep(this.settlePollMs);
            current = (await this.repo.findBySession(sessionId)) ?? current;
        }

        switch (current.status) {
            case 'CONFIRMED': {
                const booking = await this.sessions.getFlightBookingBySession(sessionId);
                return booking?.pnr
                    ? { kind: 'confirmed', bookingId: booking.id, pnr: booking.pnr, status: booking.status ?? 'confirmed' }
                    : pending(false);
            }
            case 'FAILED':
            case 'EXPIRED':
                return { kind: 'failed', code: current.failureCode ?? 'BOOKING_FAILED', message: current.failureMessage ?? NOT_COMPLETED };
            case 'NEEDS_REVIEW':
                return pending(true);
            default:
                return pending(false);
        }
    }

    /** Without a lifecycle record, the sale is the only evidence there is. */
    private async answerUntracked(sessionId: string): Promise<CompletionOutcome> {
        const deadline = Date.now() + this.settleTimeoutMs;
        for (;;) {
            const booking = await this.sessions.getFlightBookingBySession(sessionId);
            if (booking?.pnr) return { kind: 'confirmed', bookingId: booking.id, pnr: booking.pnr, status: booking.status ?? 'confirmed' };
            if (Date.now() >= deadline) return pending(false);
            await sleep(this.settlePollMs);
        }
    }

    // ── Money ───────────────────────────────────────────────────────────────

    /**
     * Captures once per attempt: `amountMinor` when the fare came down, otherwise the whole
     * authorisation. On a failure it asks Stripe what state the payment is really in before
     * giving up, because a capture that landed but whose response was lost looks exactly like
     * one that failed.
     */
    async capture(paymentIntentId: string, sessionId: string, amountMinor: number | null): Promise<{ ok: true } | { ok: false; error: string }> {
        const key = `flight-capture-${sessionId}`;
        const params = amountMinor != null ? { amount_to_capture: amountMinor } : {};
        let lastError = 'Payment capture failed';

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                await stripe.paymentIntents.capture(paymentIntentId, params, { idempotencyKey: key });
                return { ok: true };
            } catch (err: any) {
                lastError = err?.message || lastError;
                try {
                    const current = await stripe.paymentIntents.retrieve(paymentIntentId);
                    if (current?.status === 'succeeded') return { ok: true };
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
            console.error(`[flight-lifecycle] could not void ${paymentIntentId}:`, err?.message);
            return 'failed';
        }
    }

    // ── The sweeper ─────────────────────────────────────────────────────────

    /**
     * Cleans up attempts nobody finished and reports the ones that need a person.
     *
     * It releases money and closes records. It never orders and never calls Duffel: the query
     * it walks excludes any attempt with a supplier call recorded against it, so the only
     * holds it can release are ones for which the airline was never asked anything. An attempt
     * the airline was asked about is only ever reported — it may have a ticket behind it.
     */
    async sweep(now: Date = new Date(), limit = 100): Promise<SweepReport> {
        const report: SweepReport = { scanned: 0, expired: [], anomalies: [], attention: [] };

        const pending    = await this.repo.findAbandoned(['PAYMENT_PENDING'], new Date(now.getTime() - PENDING_TTL_MS), limit);
        const authorised = await this.repo.findAbandoned(['PAYMENT_AUTHORIZED'], new Date(now.getTime() - AUTHORISED_TTL_MS), limit);

        for (const record of [...pending, ...authorised]) {
            report.scanned++;

            // No PaymentIntent: `book` wrote the session and then could not open the payment.
            // There is nothing to release, only a record to close.
            if (record.paymentIntentId) {
                const voided = await this.voidAuthorisation(record.paymentIntentId);
                if (voided === 'captured') {
                    // Paid, never ordered, and the airline was never asked. Not ours to unwind.
                    report.anomalies.push({ sessionId: record.sessionId, reason: 'payment was captured but the airline was never asked' });
                    continue;
                }
                if (voided === 'failed') {
                    report.anomalies.push({ sessionId: record.sessionId, reason: 'could not release the authorisation' });
                    continue;
                }
            }

            const moved = await this.repo.transition(record.sessionId, ['PAYMENT_PENDING', 'PAYMENT_AUTHORIZED'], 'EXPIRED', {
                actor: 'sweeper',
                reason: !record.paymentIntentId ? 'no payment was ever opened'
                    : record.status === 'PAYMENT_AUTHORIZED' ? 'authorised and never completed' : 'payment never started',
                patch: { failureCode: 'ABANDONED' },
            });
            if (moved === 'applied') {
                await this.sessions.setSessionStatus(record.sessionId, 'expired')
                    .catch((err: any) => console.error(`[flight-lifecycle] could not mark ${record.sessionId} expired: ${err?.message}`));
                report.expired.push(record.sessionId);
            }
        }

        const stuck = await this.repo.findNeedingAttention(new Date(now.getTime() - ATTENTION_AFTER_MS), limit);
        for (const record of stuck) {
            report.attention.push({
                sessionId:       record.sessionId,
                status:          record.status,
                ageMinutes:      Math.round((now.getTime() - record.updatedAt.getTime()) / 60_000),
                failureCode:     record.failureCode,
                supplierOrderId: record.supplierOrderId,
            });
        }
        return report;
    }

    /** The flat part of the markup in the fare's currency, as `book` computes it. */
    private async flatInBase(base: string): Promise<number> {
        if (base === 'usd') return FLIGHT_MARKUP_SPEC.flat;
        try {
            const convert = makeStrictConverter(await new ExchangeRatesService().getLiveRates());
            return convert(FLIGHT_MARKUP_SPEC.flat, 'usd', base);
        } catch {
            return 0;
        }
    }
}
