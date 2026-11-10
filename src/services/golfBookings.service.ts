/**
 * Golf bookings (CONTEXT.md, "Golf Booking"), written down once.
 *
 * Our tee times are not the course's own tee sheet, so a booking is final only after the team has
 * checked with the course. The card is authorised at checkout (manual capture) and charged when the
 * team confirms. A void is free and instant and a refund is neither, which is why it runs in this
 * order:
 *
 *   from       event                                   to         card                spots
 *   ─────────  ──────────────────────────────────────  ─────────  ──────────────────  ────────
 *   —          customer starts checkout                held       intent created      taken
 *   held       card authorised (webhook or their page) requested  authorised          kept
 *   held       HOLD_MINUTES pass unpaid                expired    intent cancelled    released
 *   requested  team confirms                           confirmed  captured            kept
 *   requested  team declines                           declined   released, no charge released
 *   requested  decide_by passes with no answer         declined   released, no charge released
 *   requested  customer cancels                        cancelled  released, no charge released
 *   confirmed  customer cancels, while free to         cancelled  refunded in full    released
 *   confirmed  team cancels (closure, weather)         cancelled  refunded in full    released
 *
 * Every move is conditional on the state it starts from (see the repository), so the webhook, the
 * customer's page, the admin screen and the sweep can race and exactly one of them acts.
 *
 * Priced by the course in its currency, charged in the customer's, through `quoteGolf` — the same
 * function the course page's prices come from (v1 ADR-0047, ADR-0051).
 */

import { AppError } from '@/middleware/error.middleware';
import { openRefund, closeRefund } from '@/lib/refundLog';
import { stripe } from '@/lib/stripe';
import { canonicalBrandName } from '@/lib/brand';
import { mintUniqueBookingReference } from '@/lib/payments/bookingReference';
import { makeStrictConverter } from '@/lib/payments/convertStrict';
import { roundToCurrency, toStripeAmount } from '@/lib/pricing';
import {
    customerExtras, priceExtras, sameExtras, sanitizeExtras,
    type BookedExtra, type CustomerExtra, type ExtraChoice, type ExtraOffer, type PricedExtra,
} from '@/lib/golf/extras';
import { inChargeCurrency, quoteGolf, type GolfQuote } from '@/lib/golf/quote';
import { REMIND_BEFORE_DEADLINE_HOURS, cancellationFor, decideBy, freeCancelUntil, holdExpiry, isListableStart, spacedForParty } from '@/lib/golf/rules';
import { sendGolfBookingEmail, type GolfEmailKind } from '@/lib/golf/emails';
import { golfTeamAlerts, type GolfTeamAlerts } from '@/lib/golf/teamAlerts';
import { addDays, localDate, localTime, zonedTimeToUtc } from '@/lib/golf/time';
import { ExchangeRatesService, type RatesResult } from '@/services/exchange-rates.service';
import {
    GolfBookingsRepository,
    type BookableTeeTime,
    type GolfBooking,
    type GolfBookingView,
} from '@/repositories/golfBookings.repository';

const CURRENCY = /^[A-Z]{3}$/;
const SWEEP_LIMIT = 100;
const ADMIN_PAGE_SIZE = 25;

/** The payment provider, as this service needs it. Stripe in production; a fake in tests. */
export interface GolfPayments {
    create(p: {
        amount: number; currency: string; description: string;
        metadata: Record<string, string>; idempotencyKey: string;
    }): Promise<{ id: string; clientSecret: string }>;
    retrieve(id: string): Promise<{ status: string; clientSecret: string | null }>;
    capture(id: string, idempotencyKey: string): Promise<void>;
    /** Release an authorisation. `released` also when it already was; `captured` when the money moved. */
    release(id: string): Promise<'released' | 'captured' | 'failed'>;
    /** Send captured money back, in the payment's smallest unit. Asking twice refunds once. */
    refund(id: string, amount: number, idempotencyKey: string): Promise<void>;
}

export const stripePayments: GolfPayments = {
    async create({ amount, currency, description, metadata, idempotencyKey }) {
        const intent = await stripe.paymentIntents.create({
            amount,
            currency: currency.toLowerCase(),
            capture_method: 'manual',
            description,
            metadata,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        }, { idempotencyKey });
        return { id: intent.id, clientSecret: intent.client_secret! };
    },
    async retrieve(id) {
        const intent = await stripe.paymentIntents.retrieve(id);
        return { status: intent.status, clientSecret: intent.client_secret };
    },
    async capture(id, idempotencyKey) {
        try {
            await stripe.paymentIntents.capture(id, undefined, { idempotencyKey });
        } catch (err) {
            // A capture that already went through (a retry after a lost response) is not a failure.
            const intent = await stripe.paymentIntents.retrieve(id).catch(() => null);
            if (intent?.status !== 'succeeded') throw err;
        }
    },
    async release(id) {
        try {
            await stripe.paymentIntents.cancel(id);
            return 'released';
        } catch (err) {
            const intent = await stripe.paymentIntents.retrieve(id).catch(() => null);
            if (intent?.status === 'canceled') return 'released';
            if (intent?.status === 'succeeded') return 'captured';
            console.error(`[golf] could not release payment ${id}:`, (err as Error)?.message);
            return 'failed';
        }
    },
    async refund(id, amount, idempotencyKey) {
        try {
            await stripe.refunds.create({ payment_intent: id, amount }, { idempotencyKey });
        } catch (err) {
            // Refunded already (a retry past the idempotency key's lifetime): the customer has their
            // money, which is what was asked for.
            if ((err as { code?: string })?.code !== 'charge_already_refunded') throw err;
        }
    },
};

export interface TeeTimeQuote {
    teeTimeId: string;
    course:    { slug: string; name: string; city: string; country: string; imageUrl: string | null };
    startsAt:  string;
    /** "2026-11-15" and "07:30" on the course's clock. */
    date:      string;
    localTime: string;
    timezone:  string;
    players:   number;
    spotsLeft: number;
    currency:  string;
    greenFee:  number;
    /** What was asked for and can be had, priced in `currency`. */
    extras:    CustomerExtra[];
    extrasTotal: number;
    /** Everything the course offers, at its price per item in `currency`. */
    extraOffers: ExtraOffer[];
    serviceFee: number;
    total:     number;
    /** Until when this tee time could be cancelled for free, if booked now. */
    freeCancelUntil: string;
}

export interface StartedBooking {
    reference:     string;
    /** Null when the card was already authorised: there is nothing left to pay, only the booking to show. */
    clientSecret:  string | null;
    status:        GolfBooking['status'];
    holdExpiresAt: string;
    currency:      string;
    greenFee:      number;
    extras:        CustomerExtra[];
    extrasTotal:   number;
    serviceFee:    number;
    total:         number;
}

/** A party's price, with its extras as they would go on the booking. */
interface PricedParty extends GolfQuote {
    extras:      BookedExtra[];
    extraOffers: ExtraOffer[];
}

export interface SweepReport {
    expired:  number;
    /** Paid at the last moment: promoted rather than expired. */
    promoted: number;
    declined: number;
    /** Requests nearing their deadline, raised with the team again. */
    reminded: number;
    /** Payments that could not be released; those bookings stay as they are until the next run. */
    failed:   number;
}

const unavailable = () => new AppError(409, 'That tee time is no longer available.', 'TEE_TIME_UNAVAILABLE');

export class GolfBookingsService {
    constructor(
        private readonly repo: Pick<GolfBookingsRepository,
            'findTeeTime' | 'listDayTeeTimes' | 'listCourseExtras' | 'findByReference' | 'findByPaymentIntent' | 'findLiveHold' | 'listForUser' | 'referenceExists' | 'hold'
            | 'attachPaymentIntent' | 'markRequested' | 'markConfirmed' | 'close' | 'dueForSweep' | 'claimReminders' | 'listForAdmin'
        > = new GolfBookingsRepository(),
        private readonly payments: GolfPayments = stripePayments,
        private readonly rates: () => Promise<RatesResult | null> = () => new ExchangeRatesService().getLiveRates(),
        private readonly alerts: GolfTeamAlerts = golfTeamAlerts,
        private readonly email: (kind: GolfEmailKind, b: GolfBooking) => Promise<void> = sendGolfBookingEmail,
    ) {}

    /**
     * What a tee time would cost this party, for the checkout page. Throws when it can no longer be
     * booked; null for a tee time that was never there. A signed-in customer's own live hold counts as
     * available to them, so stepping back from payment does not lock them out of their own spots.
     * Extras that cannot be had are left out rather than refused, so an old link still opens; `start`
     * is stricter, because that is the moment they are charged.
     */
    async quote(
        teeTimeId: string,
        { players, currency, userId, extras = [] }: { players: number; currency?: string; userId?: string; extras?: ExtraChoice[] },
        now = new Date(),
    ): Promise<TeeTimeQuote | null> {
        const teeTime = await this.repo.findTeeTime(teeTimeId);
        if (!teeTime) return null;
        const tz = this.assertBookable(teeTime, now);
        await this.assertOfferedToParty(teeTime, players, tz);

        const own = userId ? await this.repo.findLiveHold(userId, teeTimeId) : null;
        const spotsLeft = teeTime.spotsLeft + (own?.players ?? 0);
        if (spotsLeft < players) throw notEnoughSpots(spotsLeft);

        const offers = await this.repo.listCourseExtras(teeTime.courseId);
        const priced = priceExtras(sanitizeExtras(extras, offers, players), offers, players);
        const q = await this.price(teeTime, players, currency, priced.ok ? priced.lines : [], offers);
        return {
            teeTimeId,
            course:    {
                slug: teeTime.course.slug, name: teeTime.course.name, city: teeTime.course.city,
                country: teeTime.course.country, imageUrl: teeTime.course.imageUrl,
            },
            startsAt:  teeTime.startsAt.toISOString(),
            date:      localDate(teeTime.startsAt, tz),
            localTime: localTime(teeTime.startsAt, tz),
            timezone:  tz,
            players,
            spotsLeft,
            currency:  q.currency,
            greenFee:  q.greenFee,
            extras:    customerExtras(q.extras),
            extrasTotal: q.extrasTotal,
            extraOffers: q.extraOffers,
            serviceFee: q.serviceFee,
            total:     q.total,
            freeCancelUntil: freeCancelUntil(teeTime.startsAt, teeTime.course.freeCancelHours).toISOString(),
        };
    }

    /**
     * Take the spots and open the payment. Asking again for the same tee time, party and extras returns
     * the same hold and the same payment, so stepping back and forward never takes more spots; anything
     * else changes what the card is asked for, so it is a new hold. If the payment cannot be opened the
     * spots go straight back.
     *
     * @param shownTotal  What the customer was shown. They are never asked for more than that: a rate
     *                    that moved in between comes back as PRICE_CHANGED with the new figures.
     */
    async start(
        user: { id: string; email: string },
        input: { teeTimeId: string; players: number; leadName: string; currency?: string; shownTotal?: number; extras?: ExtraChoice[] },
        now = new Date(),
    ): Promise<StartedBooking> {
        const teeTime = await this.repo.findTeeTime(input.teeTimeId);
        if (!teeTime) throw unavailable();
        await this.assertOfferedToParty(teeTime, input.players, this.assertBookable(teeTime, now));
        const choices = input.extras ?? [];

        const existing = await this.repo.findLiveHold(user.id, input.teeTimeId);
        if (existing?.paymentIntentId && existing.players === input.players && sameExtras(existing.extras, choices)
            && new Date(existing.holdExpiresAt) > now) {
            const intent = await this.payments.retrieve(existing.paymentIntentId);
            if (intent.status === 'requires_capture') {
                const moved = await this.moveToRequested(existing.id, now, teeTime.startsAt);
                return started(moved ?? existing, null);
            }
            if (intent.status !== 'canceled' && intent.clientSecret) return started(existing, intent.clientSecret);
        }

        const priced = priceExtras(choices, await this.repo.listCourseExtras(teeTime.courseId), input.players);
        if (!priced.ok) {
            throw new AppError(409, 'The extras on offer have changed. Please review them and try again.', 'EXTRAS_UNAVAILABLE', {
                extra: priced.code, reason: priced.reason,
            });
        }

        const q = await this.price(teeTime, input.players, input.currency, priced.lines);
        if (input.shownTotal !== undefined && q.total > input.shownTotal) {
            throw new AppError(409, 'The price of this tee time has changed.', 'PRICE_CHANGED', {
                currency: q.currency, greenFee: q.greenFee, extras: customerExtras(q.extras), extrasTotal: q.extrasTotal,
                serviceFee: q.serviceFee, total: q.total,
            });
        }

        const reference = await mintUniqueBookingReference(
            canonicalBrandName(process.env.BRAND_NAME ?? process.env.NEXT_PUBLIC_BRAND_NAME),
            (ref) => this.repo.referenceExists(ref),
        );
        const outcome = await this.repo.hold({
            reference,
            userId:         user.id,
            courseId:       teeTime.courseId,
            teeTimeId:      teeTime.id,
            players:        input.players,
            leadName:       input.leadName,
            contactEmail:   user.email,
            courseCurrency: teeTime.currency,
            pricePerPlayer: teeTime.pricePerPlayer,
            currency:       q.currency,
            fxRate:         q.rate,
            greenFee:       q.greenFee,
            extrasTotal:    q.extrasTotal,
            extras:         q.extras,
            serviceFee:     q.serviceFee,
            total:          q.total,
            holdExpiresAt:  holdExpiry(now),
            freeCancelUntil: freeCancelUntil(teeTime.startsAt, teeTime.course.freeCancelHours),
        }).catch((err: unknown) => {
            // Two requests at once for one customer: the unique index lets one through.
            if (/golf_bookings_one_live_hold/.test(String((err as Error)?.message))) {
                throw new AppError(409, 'This booking is already being started.', 'HOLD_IN_PROGRESS');
            }
            throw err;
        });

        // Holds it replaced lost their spots in that transaction; their payments go now. Not fatal: an
        // authorisation that later lands on a closed booking is released by `onAuthorised`.
        for (const r of outcome.released) {
            if (r.paymentIntentId) await this.payments.release(r.paymentIntentId);
        }
        if (outcome.result === 'no_spots') throw notEnoughSpots(outcome.spotsLeft);

        const booking = outcome.booking;
        try {
            const intent = await this.payments.create({
                amount:         toStripeAmount(q.total, q.currency),
                currency:       q.currency,
                description:    `${reference.slice(0, 2)}: Golf — ${teeTime.course.name}`,
                idempotencyKey: `golf-pi-${booking.id}`,
                metadata: {
                    // `type` is what the webhook routes on; the reference is what makes the charge
                    // attributable inside Stripe's pooled payouts.
                    type:             'golf',
                    bookingReference: reference,
                    golfBookingId:    booking.id,
                    userId:           user.id,
                    courseSlug:       teeTime.course.slug,
                    teeTimeId:        teeTime.id,
                    greenFee:         String(q.greenFee),
                    extrasTotal:      String(q.extrasTotal),
                    serviceFee:       String(q.serviceFee),
                    markupRate:       String(q.markupRate),
                },
            });
            await this.repo.attachPaymentIntent(booking.id, intent.id);
            return started({ ...booking, paymentIntentId: intent.id }, intent.clientSecret);
        } catch (err) {
            console.error(`[golf] could not start payment for ${reference}:`, (err as Error)?.message);
            await this.repo.close(booking.id, 'held', 'expired', 'hold_expired', new Date());
            throw new AppError(502, "We couldn't start the payment. Please try again.", 'PAYMENT_UNAVAILABLE');
        }
    }

    /** The customer's own booking, brought up to date with Stripe if it is still waiting on the card. */
    async getForUser(reference: string, userId: string): Promise<GolfBooking | null> {
        const booking = await this.repo.findByReference(reference);
        if (!booking || booking.userId !== userId) return null;
        return this.syncHeld(booking);
    }

    /**
     * A customer's bookings, for My Bookings. A hold is checked with Stripe first, so a booking paid for
     * a moment ago is listed as the request it is; one still unpaid is not a booking yet, and is left out.
     */
    async listForUser(userId: string): Promise<GolfBooking[]> {
        const bookings = await this.repo.listForUser(userId);
        const current = await Promise.all(bookings.map((b) => this.syncHeld(b)));
        return current.filter((b) => b.status !== 'held' && b.status !== 'expired');
    }

    /**
     * The card was authorised (Stripe's webhook). If the booking has already closed — its hold ran out,
     * or it was replaced — the authorisation has nothing to pay for and is released at once.
     */
    async onAuthorised(paymentIntentId: string, now = new Date()): Promise<GolfBooking | null> {
        const booking = await this.repo.findByPaymentIntent(paymentIntentId);
        if (!booking) return null;
        if (booking.status === 'expired' || booking.status === 'declined' || booking.status === 'cancelled') {
            await this.payments.release(paymentIntentId);
            return booking;
        }
        return this.syncHeld(booking, now);
    }

    /** The team has checked with the course: charge the card. A failed capture changes nothing. */
    async confirm(reference: string, now = new Date()): Promise<GolfBooking | null> {
        const booking = await this.repo.findByReference(reference);
        if (!booking) return null;
        if (booking.status === 'confirmed') return booking;
        if (booking.status !== 'requested' || !booking.paymentIntentId) throw notWaiting(booking);
        if (booking.decideBy && new Date(booking.decideBy) < now) {
            throw new AppError(409, 'The time to answer this request has passed.', 'PAST_DEADLINE');
        }
        try {
            await this.payments.capture(booking.paymentIntentId, `golf-capture-${booking.id}`);
        } catch (err) {
            throw new AppError(502, (err as Error)?.message || 'The payment could not be captured.', 'CAPTURE_FAILED');
        }
        const confirmed = await this.repo.markConfirmed(booking.id, now);
        if (confirmed) await this.tell(() => this.email('confirmed', confirmed));
        return confirmed ?? booking;
    }

    /** The course cannot take them: release the card, give the spots back. Nothing was charged. */
    async decline(reference: string, now = new Date()): Promise<GolfBooking | null> {
        const booking = await this.repo.findByReference(reference);
        if (!booking) return null;
        if (booking.status === 'declined') return booking;
        if (booking.status !== 'requested' || !booking.paymentIntentId) throw notWaiting(booking);

        const released = await this.payments.release(booking.paymentIntentId);
        if (released === 'captured') {
            throw new AppError(409, 'This payment has already been captured.', 'ALREADY_CAPTURED');
        }
        if (released === 'failed') {
            throw new AppError(502, 'The payment could not be released. Please try again.', 'RELEASE_FAILED');
        }
        const declined = await this.repo.close(booking.id, 'requested', 'declined', 'declined_by_team', now);
        if (declined) await this.tell(() => this.email('declined', declined));
        return declined ?? booking;
    }

    /**
     * The customer cancels their own booking. A request releases the card; a confirmed booking is
     * refunded in full while free cancellation lasts. The money moves first and the booking closes only
     * once it has, so a failure leaves everything as it was, ready to try again. Null for a booking that
     * is not theirs.
     */
    async cancelByCustomer(reference: string, userId: string, now = new Date()): Promise<GolfBooking | null> {
        const booking = await this.repo.findByReference(reference);
        if (!booking || booking.userId !== userId) return null;
        if (booking.status === 'cancelled') return booking;

        const decision = cancellationFor(
            { status: booking.status, total: booking.total, freeCancelUntil: new Date(booking.freeCancelUntil) },
            now,
        );
        if (!decision.allowed) {
            throw decision.reason === 'free_cancellation_ended'
                ? new AppError(409, 'Free cancellation has ended for this tee time. Please contact support.', 'FREE_CANCELLATION_ENDED')
                : notCancellable(booking);
        }

        if (decision.charged) {
            await this.refund(booking);
            return this.closedAndTold(booking, await this.repo.close(booking.id, 'confirmed', 'cancelled', 'cancelled_by_customer', now, decision.refund));
        }

        const released = await this.payments.release(booking.paymentIntentId!);
        if (released === 'captured') {
            // The team confirmed while this was on its way: it is a charged booking now, not a request.
            throw new AppError(409, 'This booking has just been confirmed. Please check it and try again.', 'BOOKING_CHANGED');
        }
        if (released === 'failed') {
            throw new AppError(502, 'The payment could not be released. Please try again.', 'RELEASE_FAILED');
        }
        return this.closedAndTold(booking, await this.repo.close(booking.id, 'requested', 'cancelled', 'cancelled_by_customer', now));
    }

    /**
     * The team cancels a confirmed booking (the course closed, rain stopped play): a full refund, whatever
     * the free-cancellation time says, because it is not the customer's doing. A request is answered by
     * declining it instead.
     */
    async cancelByTeam(reference: string, now = new Date(), admin?: { email: string }): Promise<GolfBooking | null> {
        const booking = await this.repo.findByReference(reference);
        if (!booking) return null;
        if (booking.status === 'cancelled') return booking;
        if (booking.status !== 'confirmed') throw notCancellable(booking);

        await this.refund(booking, admin?.email ?? null);
        return this.closedAndTold(booking, await this.repo.close(booking.id, 'confirmed', 'cancelled', 'cancelled_by_team', now, booking.total));
    }

    async listForAdmin(view: GolfBookingView, page: number, now = new Date()) {
        const { bookings, total } = await this.repo.listForAdmin(view, now, page, ADMIN_PAGE_SIZE);
        return { data: bookings, total, page, pageSize: ADMIN_PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
    }

    /**
     * Holds that ran out and requests nobody answered. A hold is checked with Stripe first: a card
     * authorised in the last moment is a request, not an expiry. A payment that cannot be released
     * keeps its booking as it is, spots included, so the next run tries again rather than freeing
     * spots against a card that may still be held.
     */
    async sweep(now = new Date()): Promise<SweepReport> {
        const report: SweepReport = { expired: 0, promoted: 0, declined: 0, reminded: 0, failed: 0 };
        const { holds, overdue } = await this.repo.dueForSweep(now, SWEEP_LIMIT);

        for (const hold of holds) {
            try {
                if (hold.paymentIntentId) {
                    const intent = await this.payments.retrieve(hold.paymentIntentId);
                    if (intent.status === 'requires_capture') {
                        const moved = await this.moveToRequested(hold.id, now, new Date(hold.startsAt));
                        if (moved) report.promoted++;
                        continue;
                    }
                    if (await this.payments.release(hold.paymentIntentId) !== 'released') {
                        report.failed++;
                        continue;
                    }
                }
                if (await this.repo.close(hold.id, 'held', 'expired', 'hold_expired', now)) report.expired++;
            } catch (err) {
                console.error(`[golf] sweep could not expire ${hold.reference}:`, (err as Error)?.message);
                report.failed++;
            }
        }

        for (const request of overdue) {
            try {
                if (request.paymentIntentId && await this.payments.release(request.paymentIntentId) !== 'released') {
                    report.failed++;
                    continue;
                }
                const closed = await this.repo.close(request.id, 'requested', 'declined', 'not_confirmed_in_time', now);
                if (closed) {
                    report.declined++;
                    await this.tell(() => this.alerts.lapsed(closed));
                    await this.tell(() => this.email('declined', closed));
                }
            } catch (err) {
                console.error(`[golf] sweep could not decline ${request.reference}:`, (err as Error)?.message);
                report.failed++;
            }
        }

        const remindBefore = new Date(now.getTime() + REMIND_BEFORE_DEADLINE_HOURS * 3_600_000);
        for (const request of await this.repo.claimReminders(now, remindBefore, SWEEP_LIMIT)) {
            report.reminded++;
            await this.tell(() => this.alerts.reminder(request));
        }
        return report;
    }

    /**
     * The whole charge back to the card, in the currency it was taken in, so there is no drift.
     *
     * Full every time is correct for a tee time: the course resells the slot, so there is no
     * supplier cost left stranded. That is the reasoning ADR-0004 declined to carry over to
     * hotels, where the supplier bills us for a room nobody slept in.
     *
     * @param requestedBy the admin's email when the team cancelled it, null when the customer did.
     */
    private async refund(booking: GolfBooking, requestedBy: string | null = null): Promise<void> {
        // Opened before the money moves, as the hotel and flight paths do. Golf recorded nothing
        // at all until ADR-0004, so a refunded tee time was invisible to the back office.
        const refundLogId = await openRefund({
            bookingId:       booking.reference,
            userId:          booking.userId,
            product:         'golf',
            refundType:      'full_refund',
            requestedAmount: booking.total,
            penaltyAmount:   0,
            currency:        booking.currency,
            reason:          requestedBy ? 'cancelled by the team' : 'cancelled by the customer',
            requestedBy,
        });

        try {
            await this.payments.refund(
                booking.paymentIntentId!,
                toStripeAmount(booking.total, booking.currency),
                `golf-refund-${booking.id}`,
            );
        } catch (err) {
            const message = (err as Error)?.message ?? 'unknown error';
            console.error(`[golf] could not refund ${booking.reference}:`, message);
            if (refundLogId) await closeRefund(refundLogId, { issued: false, reason: message });
            throw new AppError(502, 'The refund could not be made. Please try again.', 'REFUND_FAILED');
        }

        if (refundLogId) {
            await closeRefund(refundLogId, {
                issued:         true,
                approvedAmount: booking.total,
                externalRef:    booking.paymentIntentId!,
            });
        }
    }

    /**
     * `held` → `requested`, and the team told. The repository moves it only from `held`, so however
     * many callers race here (webhook, the customer's page, the sweep) one moves it and one tells them.
     */
    private async moveToRequested(id: string, now: Date, startsAt: Date): Promise<GolfBooking | null> {
        const moved = await this.repo.markRequested(id, now, decideBy(now, startsAt));
        if (moved) {
            await this.tell(() => this.alerts.newRequest(moved));
            await this.tell(() => this.email('requested', moved));
        }
        return moved;
    }

    /** The cancelled booking, its customer told; the booking as it was if someone else closed it first. */
    private async closedAndTold(before: GolfBooking, closed: GolfBooking | null): Promise<GolfBooking> {
        if (closed) await this.tell(() => this.email('cancelled', closed));
        return closed ?? before;
    }

    /** A message is about a booking that has already moved: failing to send one must not undo that. */
    private async tell(send: () => Promise<void>): Promise<void> {
        await send().catch((err: unknown) => console.error('[golf] could not send a message:', (err as Error)?.message));
    }

    /** A held booking, moved on if Stripe says the card is authorised or the payment is gone. */
    private async syncHeld(booking: GolfBooking, now = new Date()): Promise<GolfBooking> {
        if (booking.status !== 'held' || !booking.paymentIntentId) return booking;
        const intent = await this.payments.retrieve(booking.paymentIntentId).catch(() => null);
        if (intent?.status === 'requires_capture') {
            return (await this.moveToRequested(booking.id, now, new Date(booking.startsAt))) ?? booking;
        }
        if (intent?.status === 'canceled') {
            return (await this.repo.close(booking.id, 'held', 'expired', 'hold_expired', now)) ?? booking;
        }
        return booking;
    }

    /** Published, open, far enough ahead and inside the window. Returns the course's time zone. */
    private assertBookable(teeTime: BookableTeeTime, now: Date): string {
        const { status, timezone, bookingWindowDays } = teeTime.course;
        if (status !== 'published' || !timezone || teeTime.status !== 'open'
            || !isListableStart(teeTime.startsAt, now, bookingWindowDays)) {
            throw unavailable();
        }
        return timezone;
    }

    /**
     * One of the tee times this party is shown. The list is spaced by party size, so a link made for a
     * smaller party, or a changed one, can name a time this party was never offered.
     */
    private async assertOfferedToParty(teeTime: BookableTeeTime, players: number, tz: string): Promise<void> {
        const date = localDate(teeTime.startsAt, tz);
        const day = await this.repo.listDayTeeTimes(
            teeTime.courseId, zonedTimeToUtc(date, '00:00', tz), zonedTimeToUtc(addDays(date, 1), '00:00', tz),
        );
        if (!spacedForParty(day, players, teeTime.course.holes).some((t) => t.id === teeTime.id)) throw unavailable();
    }

    private async price(
        teeTime: BookableTeeTime,
        players: number,
        currency: string | undefined,
        lines: PricedExtra[],
        offers: ExtraOffer[] = [],
    ): Promise<PricedParty> {
        const asked = currency?.trim().toUpperCase();
        const charge = asked && CURRENCY.test(asked) ? asked : teeTime.currency;
        // The fee's flat part is in USD, so any other currency needs rates even with no conversion.
        const needsRates = charge !== 'USD' || teeTime.currency !== charge;
        const convert = makeStrictConverter(needsRates ? await this.rates().catch(() => null) : null);
        try {
            const q = quoteGolf({
                greenFeeTotal:  roundToCurrency(teeTime.pricePerPlayer * players, teeTime.currency),
                extraTotals:    lines.map((l) => l.courseTotal),
                currency:       teeTime.currency,
                chargeCurrency: charge,
                convert,
            });
            return {
                ...q,
                extras:      lines.map((l, i) => ({ code: l.code, quantity: l.quantity, unitPrice: l.unitPrice, total: q.extraTotals[i] })),
                extraOffers: offers.map((o) => ({ code: o.code, price: inChargeCurrency(o.price, teeTime.currency, charge, convert) })),
            };
        } catch {
            // A price that cannot be converted is never guessed.
            throw new AppError(503, 'This tee time cannot be priced right now. Please try again shortly.', 'PRICE_UNAVAILABLE');
        }
    }
}

function started(b: GolfBooking, clientSecret: string | null): StartedBooking {
    return {
        reference:     b.reference,
        clientSecret,
        status:        b.status,
        holdExpiresAt: b.holdExpiresAt,
        currency:      b.currency,
        greenFee:      b.greenFee,
        extras:        customerExtras(b.extras),
        extrasTotal:   b.extrasTotal,
        serviceFee:    b.serviceFee,
        total:         b.total,
    };
}

const notEnoughSpots = (spotsLeft: number) =>
    new AppError(409, `Only ${spotsLeft} ${spotsLeft === 1 ? 'spot is' : 'spots are'} left on this tee time.`, 'NOT_ENOUGH_SPOTS', { spotsLeft });

const notCancellable = (b: GolfBooking) =>
    new AppError(409, `This booking is ${b.status}, so there is nothing to cancel.`, 'NOT_CANCELLABLE');

const notWaiting = (b: GolfBooking) =>
    new AppError(409, `This booking is ${b.status}, so it can no longer be answered.`, 'NOT_WAITING');
