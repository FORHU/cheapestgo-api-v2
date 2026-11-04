/**
 * Flights service — all business logic for the flight booking domain.
 *
 * Orchestrates providers (Duffel, Mystifly), Stripe, and DB (via FlightsRepository).
 * Controllers call this; no Express types here.
 */

import { config } from '@/config';
import { stripe } from '@/lib/stripe';
import { FlightsRepository } from '@/repositories/flights.repository';
import { AppError } from '@/middleware/error.middleware';
import { searchFlights, searchFlightsWithStatus, applyServerFilters, ServerFilters } from '@/lib/flights/search';
import {
    parseDuffelOffer, normalizedToFlightOffer, getDuffelAvailableServices, getDuffelOffer,
    getDuffelSeatMaps, getDuffelBalances, getAvailableBalance,
    createDuffelCancellationQuote, confirmDuffelCancellation, getDuffelOrder,
    refreshDuffelOffer,
} from '@/lib/flights/duffel';
import { sameItineraryOffers } from '@/lib/flights/offerItineraryMatch';
import { mystiflyRequest } from '@/lib/flights/mystifly';
import {
    FlightOffer, FlightSearchParams, FarePolicy, NormalizedBagOption, BagType,
    NormalizedSegmentSeatMap, SeatRow, NormalizedSeat, DuffelSeatMapEntry,
} from '@/types/flights';

// Markup and Stripe amounts come from @/lib/pricing, not from copies here. The two local
// helpers this file used to carry charged a flat 0% and knew eight zero-decimal currencies
// against that module's sixteen — so a flight was sold at cost, and a fare in a currency
// only the module knew about would have been charged a hundred times over.
import { fromStripeAmount, FLIGHT_MARKUP_SPEC, getFlightPriceTolerance } from '@/lib/pricing';
import { orderPhoneNumber } from '@/lib/flights/orderPassengers';
import { priceFlightCharge } from '@/lib/flights/flightCharge';
import { awaitBookingRow } from '@/lib/flights/awaitBookingRow';
import { FlightBookingLifecycleService, type PaidAttempt } from '@/services/flightBookingLifecycle.service';
import { completeDuffelBooking } from '@/services/flightBookingCompletion';

/**
 * How a booking lifecycle refusal reaches the client. A code missing here goes out as itself,
 * with 400. `PAYMENT_NOT_COMPLETED` is what clients have always been sent for an unpaid confirm.
 */
const CONFIRM_FAILURES: Record<string, { status: number; code?: string }> = {
    SESSION_MISMATCH:       { status: 403 },
    SESSION_NOT_FOUND:      { status: 404 },
    PAYMENT_NOT_AUTHORIZED: { status: 402, code: 'PAYMENT_NOT_COMPLETED' },
    PRICE_CHANGED:          { status: 409 },
    OFFER_EXPIRED:          { status: 410 },
    ABANDONED:              { status: 410, code: 'BOOKING_EXPIRED' },
    // Released by `book` when the traveller submitted again with other details.
    SUPERSEDED:             { status: 410, code: 'BOOKING_EXPIRED' },
    INVALID_PHONE:          { status: 400 },
    DUFFEL_ORDER_FAILED:    { status: 400 },
    UPSTREAM_UNAVAILABLE:   { status: 503 },
};

/**
 * `book`'s answer for an offer whose card is already held: the same `BOOKING_PROCESSING` that
 * `confirm` gives, so the client sends the traveller to their trips rather than to pay again.
 */
const processing = (attempt: PaidAttempt) => new AppError(409, attempt.message, 'BOOKING_PROCESSING', {
    pending: true, needsReview: attempt.needsReview, sessionId: attempt.sessionId,
});

// ─── Service ──────────────────────────────────────────────────────────────────

export class FlightsService {
    private repo = new FlightsRepository();
    private lifecycle = new FlightBookingLifecycleService(undefined, this.repo);

    // ── Search ────────────────────────────────────────────────────────────────

    async search(params: FlightSearchParams, filters?: ServerFilters): Promise<{
        offers: FlightOffer[];
        totalResults: number;
        allCount: number;
        searchTimestamp: string;
        failedProviders: string[];
        providersFailed: boolean;
    }> {
        const { offers: allOffers, failedProviders } = await searchFlightsWithStatus(params);
        const offers = applyServerFilters(allOffers, filters);
        return {
            offers,
            totalResults: offers.length,
            allCount: allOffers.length,
            searchTimestamp: new Date().toISOString(),
            failedProviders,
            // No offers *and* a provider that could not answer is an outage, not an empty
            // route. Told apart here so the results page can offer a retry rather than
            // saying there are no flights.
            providersFailed: allOffers.length === 0 && failedProviders.length > 0,
        };
    }

    // ── One offer ─────────────────────────────────────────────────────────────

    /**
     * The offer being bought, as Duffel holds it now, in the shape the results cards draw —
     * for the checkout's summary of the flight: its segments, terminals, aircraft, bags and
     * fare terms. Read again rather than carried in the URL or the browser's storage, which
     * a refresh, a shared link or a new tab do not have.
     *
     * Without the raw Duffel payload: that is the server's, and the browser has no use for it.
     */
    async getOffer(
        offerId: string,
        tripType: 'one-way' | 'round-trip' | 'multi-city' = 'one-way',
        /** The currency the traveller is looking at; the airline's own when left out. */
        displayCurrency?: string,
    ): Promise<FlightOffer> {
        let raw: any;
        try {
            raw = await getDuffelOffer(offerId);
        } catch (err: any) {
            console.warn(`[offer] ${offerId} could not be read: ${err?.message}`);
            throw new AppError(503, 'We could not reach the airline to check this fare. Please try again shortly.', 'UPSTREAM_UNAVAILABLE');
        }
        if (!raw) throw new AppError(410, 'This fare is no longer available. Please search again for current prices.', 'OFFER_EXPIRED');

        const { _rawOffer, ...offer } = normalizedToFlightOffer(parseDuffelOffer(raw), tripType);
        void _rawOffer;

        // What the card would be held for, from the function `book` holds it with. Never at the
        // cost of the offer itself: this read also draws the receipt, and a quote that cannot be
        // made (rates down for a non-USD fare) leaves the page showing the fare alone.
        try {
            const charge = await priceFlightCharge(raw, { displayCurrency });
            return {
                ...offer,
                quote: {
                    currency: charge.chargeCurrency.toUpperCase(),
                    fare: charge.fare,
                    serviceFee: charge.serviceFee,
                    total: charge.total,
                },
            };
        } catch (err: any) {
            console.warn(`[offer] ${offerId} could not be quoted: ${err?.message}`);
            return offer;
        }
    }

    // ── Book (open the payment for an attempt) ────────────────────────────────

    /**
     * Opens a booking attempt: reads the offer again, checks everything that can be checked
     * before the card, prices it, and authorises — but does not take — the money.
     *
     * No airline order is placed here. It used to be, before the card was even shown, which
     * meant a traveller could be charged for a ticket the airline then refused, and every
     * failure after the order had to cancel a real one. The order is now placed once the card
     * is authorised, by FlightBookingLifecycleService, and a refusal there costs nothing but
     * a void.
     */
    async book(args: {
        provider?: string;
        flight?: FlightOffer & { _rawOffer?: any;[k: string]: any };
        /** Enough on its own — the offer is re-fetched and everything else derived from it. */
        offerId?: string;
        tripType?: 'one-way' | 'round-trip' | 'multi-city';
        passengers: any[];
        contact: { email: string; phone: string; countryCode?: string };
        idempotencyKey: string;
        farePolicy?: FarePolicy;
        seatServiceIds?: string[];
        /** The browser's own figure. Stored, never charged: seats are priced from the offer. */
        seatTotal?: number;
        bagServiceIds?: string[];
        /** As `seatTotal`. */
        bagTotal?: number;
        /** The fare the traveller agreed to, in the offer's currency, after a price change. */
        confirmedPrice?: number;
        bundleHotelId?: string;
        displayCurrency?: string;
        /** The traveller saw the duplicate-departure warning and chose to book anyway (ADR-0011). */
        acknowledgeDuplicate?: boolean;
        userId: string;
    }): Promise<{
        clientSecret: string;
        sessionId: string;
        paymentIntentId: string;
        /** What the card is held for. */
        amount: number;
        currency: string;
        /** What Duffel bills for the order, and what we add to it: `fare + serviceFee = amount`. */
        fare: number;
        serviceFee: number;
    }> {
        const { contact, seatServiceIds, bagServiceIds, confirmedPrice, acknowledgeDuplicate, userId } = args;

        // ── Validate provider ──────────────────────────────────────────────────
        const provider = args.provider ?? (args.offerId ? 'duffel' : undefined);
        if (provider === 'mystifly_v2' || provider === 'mystifly') {
            throw new AppError(422, 'This fare is no longer available. Please search again for current prices.', 'FARE_UNAVAILABLE');
        }
        if (provider !== 'duffel') {
            throw new AppError(400, 'Invalid provider', 'INVALID_PROVIDER');
        }

        const clientOffer = args.flight?._rawOffer ?? (args.flight as any)?.rawOffer;
        const offerId: string | undefined = args.offerId ?? clientOffer?.id;
        if (!args.flight && !offerId) {
            throw new AppError(400, 'flight object is required', 'MISSING_FLIGHT');
        }
        if (!offerId) throw new AppError(400, 'Duffel offer data missing — cannot book.', 'MISSING_OFFER');

        const duffelToken = config.DUFFEL_ACCESS_TOKEN;
        if (!duffelToken) throw new AppError(503, 'Duffel not configured.', 'PROVIDER_UNAVAILABLE');

        // ── Already paid for? ──────────────────────────────────────────────────
        //
        // Before the offer is fetched again: once the airline has ordered it the offer may be
        // gone, and "this fare is no longer available" would send the traveller to pay again.
        const paid = await this.lifecycle.paidAttempt(userId, offerId);
        if (paid) throw processing(paid);

        /**
         * The offer, as Duffel holds it now.
         *
         * Always fetched again, even when the browser sent one. The offer is the only authority
         * on what an order needs — the passenger ids it must quote, and the amount its payment
         * must state, to the cent — and it is what the hold is priced from. A copy the browser
         * has held since the search results is the one thing that cannot be trusted for either:
         * Duffel expires offers in about thirty minutes and says to fetch again at booking time.
         */
        const chosenServices = [...(seatServiceIds ?? []), ...(bagServiceIds ?? [])];
        let rawOffer: any;
        try {
            rawOffer = await getDuffelOffer(offerId, { withServices: chosenServices.length > 0 });
        } catch (err: any) {
            console.warn(`[book] offer ${offerId} could not be read: ${err?.message}`);
            throw new AppError(503, 'We could not reach the airline to check this fare. Please try again shortly.', 'UPSTREAM_UNAVAILABLE');
        }
        if (!rawOffer) {
            throw new AppError(410, 'This fare is no longer available. Please search again for current prices.', 'OFFER_EXPIRED');
        }

        const flight = args.flight && typeof args.flight === 'object'
            ? args.flight
            : normalizedToFlightOffer(parseDuffelOffer(rawOffer), args.tripType ?? 'one-way');
        const farePolicy = (args.farePolicy ?? (flight as any).farePolicy) as FarePolicy;

        // ── The price as shown ─────────────────────────────────────────────────
        const flightTotal = typeof flight.price === 'number'
            ? (flight.price as number)
            : flight.price?.total ?? 0;
        if (flightTotal <= 0) {
            throw new AppError(400, 'Invalid flight price — must be greater than $0', 'INVALID_PRICE');
        }

        // ── Duplicate booking guard ────────────────────────────────────────────
        {
            const rawFlight = flight as any;
            const firstSeg = rawFlight.slices?.[0]?.segments?.[0] ?? rawFlight.segments?.[0];
            const extractIata = (loc: any): string => {
                if (!loc) return '';
                if (typeof loc === 'string') return loc;
                return loc.iata_code ?? loc.iataCode ?? loc.code ?? '';
            };
            const origin = extractIata(firstSeg?.origin);
            const departureDate = (firstSeg?.departing_at ?? firstSeg?.departureTime ?? firstSeg?.departure?.time ?? (typeof firstSeg?.departure === 'string' ? firstSeg.departure : '') ?? '').slice(0, 10);

            if (origin && departureDate) {
                const activeBookings = await this.repo.getActiveBookingsForUser(userId);
                if (activeBookings.length) {
                    const activeIds = activeBookings.map(b => b.id);
                    const conflict = await this.repo.findSegmentConflict(
                        activeIds, origin,
                        new Date(`${departureDate}T00:00:00`),
                        new Date(`${departureDate}T23:59:59`),
                    );
                    // Warned, not refused (ADR-0011). Legitimate same-day departures exist —
                    // a family on two bookings, an outbound and a separate onward flight — so
                    // the traveller is told and may proceed by re-submitting with
                    // acknowledgeDuplicate. This used to refuse outright, with no way through.
                    if (conflict && !acknowledgeDuplicate) {
                        throw new AppError(
                            409,
                            `You already have an active flight booking departing ${origin} on ${departureDate}.`,
                            'DUPLICATE_BOOKING',
                            { existingBookingId: conflict.booking_id, route: origin, departureDate, canProceed: true },
                        );
                    }
                }
            }
        }

        // The pre-booking balance guard is off unless asked for. It calls
        // /air/payments/balances, which does not exist: every variant 404s against a live
        // token, so on live it never once ran to completion — it threw, was swallowed, and
        // cost a wasted round trip on every booking — while sandbox skipped it. Duffel's
        // order API is the real enforcement point.
        if (process.env.DUFFEL_BALANCE_CHECK === 'on') {
            try {
                const balances = await getDuffelBalances(duffelToken);
                const offerCurrency = rawOffer.total_currency ?? 'USD';
                const offerTotalNum = parseFloat(rawOffer.total_amount ?? '0');
                const available = getAvailableBalance(balances, offerCurrency);
                if (available < offerTotalNum) {
                    console.error(`[book] Duffel balance insufficient: ${available} ${offerCurrency} < ${offerTotalNum}`);
                    throw new AppError(503, 'Flight booking is temporarily unavailable. Please try again shortly.', 'INSUFFICIENT_BALANCE');
                }
            } catch (balErr: any) {
                if (balErr instanceof AppError) throw balErr;
                console.warn('[book] Duffel balance check failed (non-fatal):', balErr.message);
            }
        }

        // ── What the order will need, checked while it costs nothing to say no ─
        //
        // One traveller for every passenger the fare was priced for: Duffel refuses an order
        // with a different number, and the route passes the request body through unchecked, so
        // without this a wrong list opened a hold on the card and was only refused at confirm.
        const travellers = args.passengers;
        const pricedFor = Array.isArray(rawOffer.passengers) ? rawOffer.passengers.length : null;
        if (!Array.isArray(travellers) || travellers.length === 0 || (pricedFor !== null && travellers.length !== pricedFor)) {
            throw new AppError(
                400,
                pricedFor !== null
                    ? `This fare is for ${pricedFor} traveller${pricedFor === 1 ? '' : 's'}. Please enter details for each of them.`
                    : 'Please enter the details of every traveller.',
                'INVALID_PASSENGERS',
            );
        }
        if (!contact || !orderPhoneNumber(contact)) {
            throw new AppError(400, `Invalid phone number. Please enter a valid phone number with country code.`, 'INVALID_PHONE');
        }
        const onSale = new Set<string>((rawOffer.available_services ?? []).map((s: any) => s.id));
        if (chosenServices.some((id) => !onSale.has(id))) {
            throw new AppError(
                409,
                'One or more selected seats or bags are no longer available. Please choose again, or continue without them.',
                'SERVICE_UNAVAILABLE',
            );
        }

        // ── Has the fare moved since the traveller saw it? ─────────────────────
        //
        // The order is placed after the card now, so a fare that has already risen is caught
        // here, where saying so costs nothing. One tolerance for every gate that can raise a
        // price prompt. A fare that came down is not a change: the hold is priced from it.
        const priceTolerance = getFlightPriceTolerance();
        const freshFare = parseFloat(rawOffer.total_amount ?? '0');
        const seenFare = confirmedPrice ?? (clientOffer?.total_amount != null ? parseFloat(clientOffer.total_amount) : undefined);
        if (seenFare !== undefined && Number.isFinite(seenFare) && freshFare > seenFare + priceTolerance) {
            throw new AppError(
                409,
                `Flight price changed from ${seenFare} to ${freshFare}. Please restart booking.`,
                'PRICE_CHANGED',
                { oldPrice: seenFare, newPrice: freshFare, currency: rawOffer.total_currency },
            );
        }

        return this.openPayment({ ...args, provider, flight, farePolicy, rawOffer });
    }

    /**
     * The charge for an attempt, the session that records it, and the authorisation — in that
     * order, so an exchange-rate failure leaves nothing behind.
     */
    private async openPayment(args: Parameters<FlightsService['book']>[0] & {
        provider:   string;
        flight:     FlightOffer & { _rawOffer?: any;[k: string]: any };
        farePolicy: FarePolicy;
        rawOffer:   any;
    }) {
        const {
            provider, flight, passengers, contact, idempotencyKey, farePolicy, rawOffer,
            seatServiceIds, seatTotal, bagServiceIds, bagTotal, bundleHotelId, displayCurrency, userId,
        } = args;

        // ── The charge ─────────────────────────────────────────────────────────
        //
        // The same function the checkout's quote is made with, so what the traveller was
        // shown is what the card is held for. An exchange-rate failure throws here, before a
        // session exists, so it leaves nothing behind.
        const charge = await priceFlightCharge(rawOffer, { seatServiceIds, bagServiceIds, displayCurrency });
        const { baseCurrency, chargeCurrency: chargeInCurrency, pricing, total: chargePrice, stripeAmount } = charge;

        console.log(
            `[book] Pricing: original=${pricing.originalPrice} ${baseCurrency}, charged=${pricing.chargedPrice}, `
            + `markup=${(pricing.markupRate * 100).toFixed(1)}% effective `
            + `(${(FLIGHT_MARKUP_SPEC.rate * 100).toFixed(1)}% + ${pricing.markupFlat} ${baseCurrency}`
            + `${pricing.capped ? `, CAPPED at ${(FLIGHT_MARKUP_SPEC.cap * 100).toFixed(0)}%` : ''}) `
            + `→ ${chargePrice} ${chargeInCurrency}`,
        );

        // What the card is held for, in the currency it is held in. The page shows these and
        // nothing it worked out itself.
        const held = {
            amount:     charge.total,
            currency:   chargeInCurrency.toUpperCase(),
            fare:       charge.fare,
            serviceFee: charge.serviceFee,
        };

        // ── The same again? ────────────────────────────────────────────────────
        //
        // An unpaid attempt at this offer asking for exactly this is handed back, so a double
        // submit or a step back pays one hold; any other is released before this one opens.
        const earlier = await this.lifecycle.resumeUnpaid(userId, rawOffer.id, {
            passengers, contact, bundleHotelId,
            seatServiceIds: seatServiceIds ?? [],
            bagServiceIds:  bagServiceIds ?? [],
            amountMinor:    stripeAmount,
            currency:       chargeInCurrency,
        });
        if (earlier?.kind === 'paid') throw processing(earlier);
        if (earlier?.kind === 'reuse') {
            return { clientSecret: earlier.clientSecret, sessionId: earlier.sessionId, paymentIntentId: earlier.paymentIntentId, ...held };
        }

        // ── Create booking session ─────────────────────────────────────────────
        const sanitizedFlight: any = { ...flight, _offerId: rawOffer.id };
        delete sanitizedFlight.rawOffer;
        delete sanitizedFlight._rawOffer;

        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        const sessionRow = await this.repo.createBookingSession({
            userId,
            provider,
            flight: sanitizedFlight,
            passengers,
            contact,
            idempotencyKey,
            farePolicy,
            policySource: (farePolicy as any)?.policySource ?? null,
            policyVersion: (farePolicy as any)?.policyVersion ?? null,
            isRefundable: (farePolicy as any)?.isRefundable ?? null,
            isChangeable: (farePolicy as any)?.isChangeable ?? null,
            refundPenaltyAmount: (farePolicy as any)?.refundPenaltyAmount ?? null,
            refundPenaltyCurrency: (farePolicy as any)?.refundPenaltyCurrency ?? null,
            seatServiceIds,
            seatTotal,
            bagServiceIds,
            bagTotal,
            // What marks the attempt as the lifecycle's: the sweeper and auto-recover key on it.
            captureMethod: 'manual',
            expiresAt,
        });

        const sessionId = sessionRow.id;

        // ── Authorise, do not take ─────────────────────────────────────────────
        //
        // Manual capture: the card is held now and charged only once the airline has
        // confirmed the order. A hold the airline then refuses is voided, which is free.
        const piIdempotencyKey = `flight-pi-${userId}-${sessionId}`;
        const paymentIntent = await stripe.paymentIntents.create({
            amount: stripeAmount,
            currency: chargeInCurrency,
            capture_method: 'manual',
            metadata: {
                bookingSessionId: sessionId,
                provider,
                userId,
                passengerEmail: contact.email,
                originalPrice: String(pricing.originalPrice),
                markupRate: String(pricing.markupRate),
                markupAmount: String(pricing.markupAmount),
                ...(bundleHotelId ? { bundleHotelId, type: 'flight_bundle' } : { type: 'flight' }),
            },
            description: `CG: ${(flight.segments as any)?.[0]?.origin ?? ''} → ${(flight.segments as any)?.[(flight.segments?.length ?? 1) - 1]?.destination ?? ''}`,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        }, { idempotencyKey: piIdempotencyKey });

        // ── Update session with PI ─────────────────────────────────────────────
        try {
            await this.repo.updateBookingSessionPayment(sessionId, paymentIntent.id);
        } catch (sessionUpdateError: any) {
            console.error('[book] CRITICAL — failed to save payment_intent_id:', sessionUpdateError.message);
            try {
                await stripe.paymentIntents.cancel(paymentIntent.id);
            } catch (cancelErr: any) {
                console.error('[book] Could not cancel PI after session update failure:', cancelErr.message);
            }
            throw new AppError(500, 'A session error occurred. Your card was not charged. Please try again.', 'SESSION_UPDATE_FAILED');
        }

        // What the hold was computed from: the lifecycle captures against it.
        await this.repo.updateBookingSessionAudit(sessionId, {
            currency: baseCurrency,
            originalPrice: pricing.originalPrice,
            chargedPrice: chargePrice,
            markupPct: pricing.markupRate,
            paymentCurrency: chargeInCurrency.toUpperCase(),
        });

        await this.lifecycle.open(sessionId);

        return { clientSecret: paymentIntent.client_secret!, sessionId, paymentIntentId: paymentIntent.id, ...held };
    }

    // ── Confirm ───────────────────────────────────────

    /**
     * Turns an authorised payment into a booking. The card is authorised; the airline has not
     * been asked yet. FlightBookingLifecycleService asks it, under a claim the Stripe webhook
     * also takes, so whichever of the two arrives first places the order and the other is
     * answered with its result.
     *
     * Answers with a booking, or throws: a refusal (`PRICE_CHANGED`, `OFFER_EXPIRED`,
     * `DUFFEL_ORDER_FAILED`, … — the hold released), or `BOOKING_PROCESSING` when the airline
     * has not settled it yet. The last is not a failure and is deliberately not a 2xx, so a
     * client that does not know it shows its message — "check your trips" — rather than a
     * confirmation with no ticket in it.
     */
    async confirm(paymentIntentId: string, sessionId: string, userId: string): Promise<{
        bookingId?: string;
        pnr?: string;
        status?: string;
        source: string;
    }> {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const provider = paymentIntent.metadata?.provider ?? '';

        if (paymentIntent.metadata?.bookingSessionId !== sessionId) {
            throw new AppError(403, 'Session/payment mismatch', 'SESSION_MISMATCH');
        }

        // DB-first check
        const existingBooking = await this.repo.getFlightBookingBySession(sessionId);
        if (existingBooking) {
            if (existingBooking.payment_intent_id && existingBooking.payment_intent_id !== paymentIntentId) {
                throw new AppError(403, 'Payment mismatch', 'PAYMENT_MISMATCH');
            }
            if (existingBooking.status === 'failed') {
                throw new AppError(400, 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.', 'BOOKING_FAILED');
            }
            if (existingBooking.pnr) {
                return { bookingId: existingBooking.id, pnr: existingBooking.pnr, status: existingBooking.status, source: 'webhook' };
            }
        }

        // `book` has refused Mystifly fares for as long as v2 has existed.
        if (provider === 'mystifly_v2' || provider === 'mystifly') {
            throw new AppError(422, 'This fare is no longer available. Please search again for current prices.', 'FARE_UNAVAILABLE');
        }

        // Booked before this release: the order was placed at `book` and the card charged.
        if (paymentIntent.capture_method !== 'manual') {
            return this.confirmPreOrdered(paymentIntent, sessionId);
        }

        const outcome = await this.lifecycle.complete({ sessionId, paymentIntentId, actor: 'browser', userId });
        if (outcome.kind === 'confirmed') {
            return { bookingId: outcome.bookingId, pnr: outcome.pnr, status: outcome.status, source: 'lifecycle' };
        }
        if (outcome.kind === 'pending') {
            throw new AppError(409, outcome.message, 'BOOKING_PROCESSING', {
                pending: true, needsReview: outcome.needsReview, sessionId,
            });
        }
        const wire = CONFIRM_FAILURES[outcome.code] ?? { status: 400 };
        throw new AppError(wire.status, outcome.message, wire.code ?? outcome.code, outcome.details);
    }

    /**
     * A session whose order was placed at `book` and whose card was charged, as every flight
     * was before the booking lifecycle. Finished in process, under the session's own lock, the
     * way /internal/create-booking finishes it — so a traveller paying across the release is
     * not stranded. Delete once no such session can still be open.
     */
    private async confirmPreOrdered(paymentIntent: { id: string; status: string }, sessionId: string) {
        if (paymentIntent.status !== 'succeeded') {
            throw new AppError(402, `Payment not completed for Duffel (status: ${paymentIntent.status})`, 'PAYMENT_NOT_COMPLETED');
        }

        if (await this.repo.lockSessionForBooking(sessionId)) {
            const session = await this.repo.getBookingSession(sessionId);
            if (!session?.duffel_pre_order_id) {
                await this.repo.setSessionStatus(sessionId, 'failed');
                throw new AppError(400, 'Duffel pre-order missing from session', 'BOOKING_FAILED');
            }
            try {
                const done = await completeDuffelBooking({
                    session,
                    paymentIntentId: paymentIntent.id,
                    order: {
                        orderId:    session.duffel_pre_order_id,
                        pnr:        session.duffel_pre_order_pnr ?? '',
                        tickets:    session.duffel_pre_order_tickets ?? [],
                        isTicketed: session.duffel_pre_order_ticketed === true,
                    },
                });
                return { bookingId: done.bookingId, pnr: done.pnr, status: done.status, source: 'confirm-fallback' };
            } catch (err) {
                await this.repo.setSessionStatus(sessionId, 'failed').catch(() => undefined);
                throw err;
            }
        }

        // Someone else holds the session — the auto-recover cron, part-way through writing it.
        const lateBooking = await awaitBookingRow(
            (id) => this.repo.getFlightBookingBySession(id) as any,
            sessionId,
        );
        if (lateBooking?.pnr) {
            return { bookingId: lateBooking.id, pnr: lateBooking.pnr, status: lateBooking.status ?? undefined, source: 'late-webhook' };
        }
        // The card was charged and the order exists; the booking row is what is late. This
        // used to say "your card has not been charged", which by this point it had been.
        throw new AppError(409, 'Your booking is still being confirmed. Please check your trips shortly — do not pay again.', 'BOOKING_PROCESSING', {
            pending: true, needsReview: false, sessionId,
        });
    }

    // ── Booking status ────────────────────────────────────────────────────────

    /**
     * Where a booking is. Once the sale is written that is the booking; before then it is the
     * attempt, so a refresh while the airline is being asked says so instead of "not found".
     * `lifecycle` is `pending` (not paid), `processing`, `needs_review` or `failed`.
     */
    async getBookingStatus(sessionId: string, userId: string) {
        const booking = await this.repo.getFlightBookingBySessionForUser(sessionId, userId);
        if (!booking) {
            const attempt = await this.lifecycle.find(sessionId);
            if (!attempt || attempt.userId !== userId) return { found: false };
            switch (attempt.status) {
                case 'PAYMENT_PENDING':
                    return { found: false, lifecycle: 'pending' };
                case 'NEEDS_REVIEW':
                    return { found: false, lifecycle: 'needs_review' };
                case 'FAILED':
                case 'EXPIRED':
                    return {
                        found: false, failed: true, lifecycle: 'failed',
                        code: attempt.failureCode ?? 'BOOKING_FAILED',
                        error: attempt.failureMessage ?? 'This booking could not be completed. Your card has not been charged.',
                    };
                default:
                    // PAYMENT_AUTHORIZED, SUPPLIER_BOOKING, and CONFIRMED in the moment before
                    // the sale is read back.
                    return { found: false, lifecycle: 'processing' };
            }
        }

        if (booking.status === 'failed') {
            return {
                found: true,
                failed: true,
                error: 'Booking failed — the flight offer was no longer available. Your payment has been automatically refunded.',
            };
        }

        return { found: true, bookingId: booking.id, pnr: booking.pnr, status: booking.status };
    }

    // ── Bags ──────────────────────────────────────────────────────────────────

    async getBags(offerId: string, duffelPassengerIds: string[]): Promise<{ bagOptions: NormalizedBagOption[] }> {
        if (!config.DUFFEL_ACCESS_TOKEN) {
            throw new AppError(503, 'Duffel not configured', 'PROVIDER_UNAVAILABLE');
        }

        let services: any[];
        try {
            services = await getDuffelAvailableServices(offerId);
        } catch (err: any) {
            if (err.status === 404) {
                throw new AppError(200, 'This offer has expired. Please go back and search again for updated prices.', 'OFFER_EXPIRED');
            }
            throw new AppError(err.status ?? 500, err.message, 'DUFFEL_ERROR');
        }

        const paxIds: string[] = duffelPassengerIds ?? [];
        const paxIdToIndex = new Map<string, number>(paxIds.map((id, i) => [id, i]));
        const bagOptions: NormalizedBagOption[] = [];

        for (const svc of services) {
            if (svc.type !== 'baggage') continue;
            const bagType: BagType = svc.metadata?.type === 'carry_on' ? 'carry_on' : 'checked';
            const price = parseFloat(svc.total_amount ?? '0');
            const currency: string = svc.total_currency ?? 'USD';
            const weightKg = svc.metadata?.maximum_weight_kg != null ? parseFloat(svc.metadata.maximum_weight_kg) : null;
            const maxQuantity: number = svc.maximum_quantity ?? 1;
            const segmentIds: string[] = svc.segment_ids ?? [];
            const svcPaxIds: string[] = svc.passenger_ids ?? [];

            if (svcPaxIds.length === 0) {
                paxIds.forEach((_, idx) => {
                    bagOptions.push({ serviceId: svc.id, bagType, price, currency, weightKg, maxQuantity, passengerIndex: idx, appliesToAllSegments: segmentIds.length === 0 });
                });
            } else {
                for (const paxId of svcPaxIds) {
                    const idx = paxIdToIndex.get(paxId);
                    if (idx == null) continue;
                    bagOptions.push({ serviceId: svc.id, bagType, price, currency, weightKg, maxQuantity, passengerIndex: idx, appliesToAllSegments: segmentIds.length === 0 });
                }
            }
        }

        const seen = new Set<string>();
        const unique = bagOptions.filter(o => {
            const key = `${o.serviceId}:${o.passengerIndex}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return { bagOptions: unique };
    }

    // ── Seat map ──────────────────────────────────────────────────────────────

    async getSeatMap(offerId: string, segments?: { origin: string; destination: string }[]): Promise<{
        seatMaps: NormalizedSegmentSeatMap[];
        unavailable?: boolean;
    }> {
        if (!config.DUFFEL_ACCESS_TOKEN) {
            throw new AppError(503, 'Duffel not configured', 'PROVIDER_UNAVAILABLE');
        }

        let raw: DuffelSeatMapEntry[];
        try {
            raw = await getDuffelSeatMaps(offerId);
        } catch (err: any) {
            if (err.status === 422) return { seatMaps: [], unavailable: true };
            if (err.status === 404) {
                throw new AppError(404, 'This offer has expired. Please go back and search again for updated prices.', 'OFFER_EXPIRED');
            }
            throw new AppError(err.status ?? 500, err.message, 'DUFFEL_ERROR');
        }

        const normalized = raw.map((entry, idx) => normalizeSeatMapEntry(entry, idx, segments));
        return { seatMaps: normalized };
    }

    // ── Fare rules ────────────────────────────────────────────────────────────

    async getFareRules(fareSourceCode: string): Promise<any> {
        try {
            const data = await mystiflyRequest('/api/v2/AirFareRules/AirFareRules', { FareSourceCode: fareSourceCode });
            return data;
        } catch (err: any) {
            throw new AppError(502, err.message, 'MYSTIFLY_ERROR');
        }
    }

    // ── Offer refresh ─────────────────────────────────────────────────────────

    /**
     * A fresh offer for the same journey, when the one the traveller chose has expired before
     * they reached bags or seats.
     *
     * Best-effort: the checkout falls back to "this offer expired, search again" whenever
     * `success` is false. So an upstream failure comes back as `{ success: false, reason }`
     * rather than an error status — forwarding Duffel's own 429 would tell the browser that
     * *it* is being rate limited by us, which is not what happened.
     */
    async offerRefresh(rawOffer: any): Promise<
        | { success: true; newOfferId: string; newOffer: any }
        | { success: false; reason: 'no_offers' | 'no_same_itinerary' | 'upstream_error'; error: string }
    > {
        if (!config.DUFFEL_ACCESS_TOKEN) {
            throw new AppError(503, 'Duffel not configured', 'PROVIDER_UNAVAILABLE');
        }

        let offers: any[];
        try {
            offers = await refreshDuffelOffer(rawOffer);
        } catch (err: any) {
            return { success: false, reason: 'upstream_error', error: err?.message ?? 'Duffel offer_request failed' };
        }
        if (offers.length === 0) {
            return { success: false, reason: 'no_offers', error: 'No offers returned for this itinerary' };
        }

        // The same journey or nothing. This used to take the first segment's flight number, then
        // any offer on the same airline, then simply the cheapest offer on the route — so a
        // traveller who stopped to choose a seat could come back to a different flight.
        const [matched] = sameItineraryOffers(rawOffer, offers);
        if (!matched) {
            return {
                success: false,
                reason:  'no_same_itinerary',
                error:   'This flight is no longer available at this fare. Please search again.',
            };
        }

        const cabinClass: string = rawOffer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class ?? 'economy';
        const tripType = matched.slices.length > 1 ? 'round-trip' : 'one-way';
        const normalized = parseDuffelOffer(matched, cabinClass);
        const flightOffer = normalizedToFlightOffer(normalized, tripType);

        console.log(`[offerRefresh] ${rawOffer.id} → ${matched.id} (same itinerary)`);
        return { success: true, newOfferId: matched.id, newOffer: flightOffer };
    }

    // ── Cancel quote ──────────────────────────────────────────────────────────

    async cancelQuote(bookingId: string, userId: string): Promise<{
        success: boolean;
        refundAmount?: number;
        refundCurrency?: string;
        penaltyAmount?: number;
        cancellationId?: string | null;
        noQuote?: boolean;
        sandboxMock?: boolean;
        requiresManualCancellation?: boolean;
        error?: string;
    }> {
        const booking = await this.repo.getFlightBookingById(bookingId);
        if (!booking) throw new AppError(404, 'Booking not found', 'NOT_FOUND');
        if (booking.user_id !== userId) throw new AppError(403, 'Unauthorized', 'FORBIDDEN');
        if (booking.provider !== 'duffel') return { success: false, noQuote: true };

        const duffelToken = config.DUFFEL_ACCESS_TOKEN;
        if (!duffelToken) throw new AppError(503, 'Duffel not configured', 'PROVIDER_UNAVAILABLE');

        let orderId: string | undefined = booking.provider_order_id ?? booking.duffel_order_id ?? undefined;
        if (!orderId && booking.session_id) {
            const session = await this.repo.getBookingSessionForCancelQuote(booking.session_id);
            orderId = session?.duffel_pre_order_id ?? undefined;
        }

        if (!orderId) {
            const isSandbox = duffelToken.startsWith('duffel_test_');
            if (isSandbox) return { success: true, refundAmount: 0, refundCurrency: 'USD', penaltyAmount: 0, cancellationId: null, sandboxMock: true };
            throw new AppError(422, 'Duffel order ID not found', 'ORDER_NOT_FOUND');
        }

        let order: any;
        try {
            order = await getDuffelOrder(orderId);
        } catch (err: any) {
            if (err.status === 404) throw new AppError(404, 'Booking not found with airline. It may have already been cancelled.', 'ORDER_NOT_FOUND');
            throw new AppError(422, err.message, 'DUFFEL_ERROR');
        }

        const availableActions: string[] = order.available_actions ?? [];
        if (!availableActions.includes('cancel')) {
            return { success: false, requiresManualCancellation: true, error: 'This booking cannot be cancelled online. Please contact support.' };
        }

        const quote = await createDuffelCancellationQuote(orderId);
        const duffelRefundUsd = Number(quote.refund_amount) || 0;
        const duffelSupplierPrice = Number(booking.total_price ?? 0);
        const cancellationId: string = quote.id;

        const refundRatio = duffelSupplierPrice > 0 ? Math.min(1, duffelRefundUsd / duffelSupplierPrice) : 1;

        let refundAmount: number;
        let refundCurrency: string = (booking.payment_currency ?? 'USD') as string;
        try {
            if (booking.payment_intent_id) {
                const pi = await stripe.paymentIntents.retrieve(booking.payment_intent_id);
                // The quote a customer sees before they cancel. Read at the currency's own
                // scale — `/ 100` quoted a ₩12,000 refund on a ₩1,200,000 booking in v1.
                refundAmount = Math.round(fromStripeAmount(pi.amount, pi.currency) * refundRatio * 100) / 100;
                refundCurrency = pi.currency.toUpperCase();
            } else {
                refundAmount = Math.round(Number(booking.charged_price ?? booking.total_price ?? 0) * refundRatio * 100) / 100;
            }
        } catch {
            refundAmount = Math.round(Number(booking.charged_price ?? booking.total_price ?? 0) * refundRatio * 100) / 100;
        }

        return { success: true, refundAmount, refundCurrency, penaltyAmount: 0, cancellationId };
    }

    // ── Cancel booking ────────────────────────────────────────────────────────

    async cancelBooking(bookingId: string, userId: string, preQuotedCancellationId?: string): Promise<{
        status: string;
        refundAmount?: number;
        refundCurrency?: string;
        penaltyAmount?: number;
        currency?: string;
        stripeError?: string;
        providerMissing?: boolean;
        requiresManualCancellation?: boolean;
    }> {
        const booking = await this.repo.getFlightBookingById(bookingId);
        if (!booking) throw new AppError(404, 'Booking not found', 'NOT_FOUND');

        // Recover PI from session if missing
        let effectivePaymentIntentId: string | null = booking.payment_intent_id ?? null;
        if (!effectivePaymentIntentId && booking.session_id) {
            const session = await this.repo.getBookingSessionForCancelQuote(booking.session_id);
            if (session?.payment_intent_id) {
                effectivePaymentIntentId = session.payment_intent_id;
                await this.repo.updateFlightBookingPaymentIntentId(bookingId, effectivePaymentIntentId);
            }
        }

        if (booking.user_id !== userId) throw new AppError(403, 'Unauthorized', 'FORBIDDEN');

        const terminalStatuses = ['cancelled', 'refund_pending', 'refunded'];
        if (terminalStatuses.includes(booking.status)) {
            return { status: booking.status };
        }

        const eligibleStatuses = ['confirmed', 'ticketed', 'booked', 'pnr_created', 'awaiting_ticket', 'cancel_failed', 'cancel_requested', 'refund_failed'];
        if (!eligibleStatuses.includes(booking.status)) {
            throw new AppError(422, `Cannot cancel booking in status: ${booking.status}`, 'INVALID_STATUS');
        }

        const logEntry = {
            at: new Date().toISOString(),
            oldStatus: booking.status,
            newStatus: 'cancel_requested',
            note: 'User initiated cancellation',
        };

        const currentLog: any[] = Array.isArray(booking.cancellation_log) ? booking.cancellation_log : [];

        // Set cancel_requested atomically
        const updated = await this.repo.setFlightBookingCancelRequested(bookingId, eligibleStatuses, logEntry, currentLog);
        if (!updated) {
            const refetched = await this.repo.getFlightBookingById(bookingId);
            throw new AppError(409, `Cannot cancel: booking status is '${refetched?.status ?? 'unknown'}'`, 'STATUS_CONFLICT');
        }

        // Supplier cancellation
        const isMystifly = booking.provider === 'mystifly_v2';
        let supplierSuccess = false;
        let refundAmount = 0;
        let penaltyAmount = Number(booking.refund_penalty_amount ?? 0);
        let refundCurrency = (booking.refund_currency ?? booking.supplier_currency ?? 'USD') as string;
        let supplierError: string | undefined;
        let supplierCancellationId: string | undefined;
        let refundTo: string | undefined;
        let requiresManualCancellation = false;

        if (booking.status === 'refund_failed') {
            supplierSuccess = true;
            refundAmount = Number(booking.refund_amount ?? 0);
        } else {
            try {
                if (isMystifly) {
                    const result = await this._cancelMystifly(booking);
                    supplierSuccess = result.success;
                    refundAmount = Math.min(result.refundAmount ?? 0, Number(booking.total_price));
                    penaltyAmount = result.penaltyAmount ?? 0;
                    refundCurrency = result.currency ?? 'USD';
                    supplierError = result.error;
                    supplierCancellationId = result.cancellationId;
                } else {
                    const result = await this._cancelDuffel(booking, preQuotedCancellationId);
                    supplierSuccess = result.success;
                    refundAmount = Math.min(result.refundAmount ?? 0, Number(booking.total_price));
                    penaltyAmount = result.penaltyAmount ?? Math.max(0, Number(booking.total_price) - (result.refundAmount ?? 0));
                    refundCurrency = result.currency ?? 'USD';
                    supplierError = result.error;
                    supplierCancellationId = result.cancellationId;
                    requiresManualCancellation = result.requiresManualCancellation === true
                        || /tkt-in-process|ticketed status|cancellation denied/i.test(supplierError ?? '');
                    refundTo = result.refundTo;
                }
            } catch (supplierErr: any) {
                supplierError = supplierErr.message;
            }
        }

        if (!supplierSuccess) {
            const isProviderMissing = /not found|does not exist|could not find/i.test(supplierError ?? '');

            const failLog = {
                at: new Date().toISOString(),
                oldStatus: 'cancel_requested',
                newStatus: isProviderMissing ? 'cancelled_provider_missing' : 'cancel_failed',
                supplierError, isProviderMissing, requiresManualCancellation,
            };

            if (isProviderMissing && effectivePaymentIntentId) {
                try {
                    const pi = await stripe.paymentIntents.retrieve(effectivePaymentIntentId);
                    if (pi.amount > 0) {
                        await stripe.refunds.create({
                            payment_intent: effectivePaymentIntentId,
                            reason: 'requested_by_customer',
                            metadata: { bookingId, note: 'provider_missing_full_refund' },
                        }, { idempotencyKey: `refund-${bookingId}` });
                    }
                    await this.repo.updateFlightBookingCancellation(bookingId, {
                        status: 'refunded',
                        refundAmount: Number(booking.total_price),
                        cancellationLog: [...currentLog, logEntry, failLog],
                    });
                    return { status: 'refunded', providerMissing: true, refundAmount: Number(booking.total_price) };
                } catch (stripeErr: any) {
                    console.error('[cancelBooking] Stripe refund failed for provider-missing booking:', stripeErr.message);
                }
            }

            await this.repo.updateFlightBookingCancellation(bookingId, {
                status: isProviderMissing ? 'cancelled_provider_missing' : 'cancel_failed',
                cancellationLog: [...currentLog, logEntry, failLog],
            });

            return {
                status: isProviderMissing ? 'cancelled_provider_missing' : 'cancel_failed',
                providerMissing: isProviderMissing,
                requiresManualCancellation,
            };
        }

        const cancelLog = {
            at: new Date().toISOString(),
            oldStatus: 'cancel_requested', newStatus: 'cancelled',
            refundAmount, penaltyAmount, currency: refundCurrency,
            ...(refundTo && { refundTo }),
        };
        const refundPendingLog = {
            at: new Date().toISOString(),
            oldStatus: 'cancelled', newStatus: 'refund_pending',
            note: 'Triggering Stripe refund',
        };

        await this.repo.updateFlightBookingCancellation(bookingId, {
            status: 'refund_pending',
            cancellationCompletedAt: new Date(),
            refundAmount,
            refundPenaltyAmount: penaltyAmount,
            refundCurrency,
            supplierCancellationId: supplierCancellationId ?? null,
            paymentCurrency: (booking.payment_currency ?? 'USD') as string,
            supplierCurrency: refundCurrency,
            cancellationLog: [...currentLog, logEntry, cancelLog, refundPendingLog],
        });

        // Stripe refund
        let refunded = false;
        let stripeError: string | undefined;
        let actualStripeRefundAmount = 0;
        let actualStripeCurrency = refundCurrency.toUpperCase();

        if (!effectivePaymentIntentId && booking.session_id) {
            try {
                const search = await stripe.paymentIntents.search({
                    query: `metadata['bookingSessionId']:'${booking.session_id}'`,
                    limit: 1,
                });
                if (search.data.length > 0) {
                    effectivePaymentIntentId = search.data[0].id;
                    await this.repo.updateFlightBookingPaymentIntentId(bookingId, effectivePaymentIntentId as string);
                }
            } catch (searchErr: any) {
                console.error('[cancelBooking] Stripe search failed:', searchErr.message);
            }
        }

        if (effectivePaymentIntentId && refundAmount > 0) {
            try {
                const pi = await stripe.paymentIntents.retrieve(effectivePaymentIntentId);
                const piAmount = pi.amount;
                const piCurrency = pi.currency.toLowerCase();

                if (pi.status === 'requires_capture') {
                    await stripe.paymentIntents.cancel(effectivePaymentIntentId, { cancellation_reason: 'requested_by_customer' });
                    refunded = true;
                    actualStripeRefundAmount = fromStripeAmount(piAmount, piCurrency);
                    actualStripeCurrency = piCurrency.toUpperCase();
                    await this.repo.updateFlightBookingRefundedStatus(bookingId, {
                        refundAmount: actualStripeRefundAmount,
                        refundCurrency: actualStripeCurrency,
                        cancellationLog: [...currentLog, logEntry, cancelLog, refundPendingLog, { at: new Date().toISOString(), oldStatus: 'refund_pending', newStatus: 'refunded', note: 'PI cancelled (uncaptured)' }],
                    });
                } else {
                    const supplierCurrency = refundCurrency.toLowerCase();
                    let refundAmountCents: number;

                    if (supplierCurrency === piCurrency) {
                        refundAmountCents = penaltyAmount > 0
                            ? Math.round(piAmount * (refundAmount / (refundAmount + penaltyAmount)))
                            : piAmount;
                    } else {
                        refundAmountCents = penaltyAmount > 0
                            ? Math.round(piAmount * (refundAmount / (refundAmount + penaltyAmount)))
                            : piAmount;
                    }
                    refundAmountCents = Math.min(refundAmountCents, piAmount);

                    const stripeRefund = await stripe.refunds.create({
                        payment_intent: effectivePaymentIntentId,
                        amount: refundAmountCents,
                        reason: 'requested_by_customer',
                        metadata: { bookingId, provider: booking.provider, penaltyAmount: String(penaltyAmount) },
                    }, { idempotencyKey: `refund-${bookingId}` });

                    if (stripeRefund.status === 'failed') throw new Error(`Stripe refund created but failed: ${stripeRefund.id}`);

                    if (stripeRefund.status === 'succeeded' || stripeRefund.status === 'pending') {
                        refunded = true;
                        actualStripeRefundAmount = fromStripeAmount(refundAmountCents, piCurrency);
                        actualStripeCurrency = piCurrency.toUpperCase();
                        const refundedLog = {
                            at: new Date().toISOString(),
                            oldStatus: 'refund_pending', newStatus: 'refunded',
                            stripeRefundId: stripeRefund.id, stripeRefundAmount: actualStripeRefundAmount,
                            stripeRefundCurrency: actualStripeCurrency, supplierRefundAmount: refundAmount,
                        };
                        await this.repo.updateFlightBookingRefundedStatus(bookingId, {
                            refundAmount: actualStripeRefundAmount,
                            refundCurrency: actualStripeCurrency,
                            cancellationLog: [...currentLog, logEntry, cancelLog, refundPendingLog, refundedLog],
                        });
                    }
                }
            } catch (stripeErr: any) {
                stripeError = stripeErr.message;
                console.error('[cancelBooking] Stripe refund failed:', stripeError);
                await this.repo.updateFlightBookingCancellation(bookingId, {
                    status: 'refund_failed',
                    cancellationLog: [...currentLog, logEntry, cancelLog, refundPendingLog, { at: new Date().toISOString(), oldStatus: 'refund_pending', newStatus: 'refund_failed', stripeError }],
                });
            }
        } else {
            await this.repo.updateFlightBookingCancellation(bookingId, {
                status: 'cancelled',
                cancellationLog: [...currentLog, logEntry, cancelLog],
            });
        }

        return {
            status: stripeError ? 'refund_failed' : (refunded ? 'refunded' : 'refund_pending'),
            refundAmount: refunded ? actualStripeRefundAmount : refundAmount,
            refundCurrency: refunded ? actualStripeCurrency : refundCurrency,
            penaltyAmount,
            currency: refundCurrency,
            stripeError,
        };
    }

    // ── Price calendar ────────────────────────────────────────────────────────

    async getPriceCalendar(params: {
        origin: string;
        destination: string;
        year: number;
        month: number;
        adults: number;
        cabin: string;
        returnDate?: string | null;
        provider?: string | null;
    }): Promise<Record<string, { price: number; currency: string }>> {
        const startDate = `${params.year}-${String(params.month).padStart(2, '0')}-01`;
        const lastDay = new Date(params.year, params.month, 0).getDate();
        const endDate = `${params.year}-${String(params.month).padStart(2, '0')}-${lastDay}`;

        const rows = await this.repo.getPriceCalendarRaw({
            origin: params.origin,
            destination: params.destination,
            startDate,
            endDate,
            adults: params.adults,
            cabin: params.cabin,
            returnDate: params.returnDate,
            provider: params.provider,
        });

        if (rows !== null) {
            const result: Record<string, { price: number; currency: string }> = {};
            for (const row of rows) {
                result[row.departure_date] = { price: parseFloat(row.min_price), currency: row.currency };
            }
            return result;
        }

        // Fallback: direct query
        const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const fallback = await this.repo.getPriceCalendarFallback({
            origin: params.origin,
            destination: params.destination,
            startDate,
            endDate,
            adults: params.adults,
            cabin: params.cabin,
            returnDate: params.returnDate,
            provider: params.provider,
            cutoffDate,
        });

        const result: Record<string, { price: number; currency: string }> = {};
        for (const row of fallback) {
            const date = (row.flight_searches as any).departure_date?.toISOString?.()?.slice(0, 10)
                ?? (row.flight_searches as any).departure_date;
            if (!date) continue;
            const price = parseFloat(row.price.toString());
            if (!result[date] || price < result[date].price) {
                result[date] = { price, currency: row.currency };
            }
        }
        return result;
    }

    // ── Price calendar live ───────────────────────────────────────────────────

    async getPriceCalendarLive(params: {
        origin:      string;
        destination: string;
        adults:      number;
        cabin:       string;
        dates:       string[];
        returnDate?: string | null;
        provider?:   string | null;
    }): Promise<{ success: boolean; data: Record<string, { price: number; currency: string }> }> {
        const today      = new Date().toISOString().slice(0, 10);
        const validDates = params.dates.filter(d => d >= today);

        if (!validDates.length) return { success: true, data: {} };

        const results = await Promise.allSettled(
            validDates.map(async (date) => {
                const allOffers = await searchFlights({
                    origin:        params.origin,
                    destination:   params.destination,
                    departureDate: date,
                    returnDate:    params.returnDate ?? undefined,
                    adults:        params.adults,
                    children:      0,
                    infants:       0,
                    cabinClass:    (params.cabin as any) || 'economy',
                });
                const offers = params.provider
                    ? allOffers.filter((o: any) => o.provider === params.provider)
                    : allOffers;
                if (!offers?.length) return { date, price: null as number | null, currency: 'USD' };
                const cheapest = offers.reduce((min: any, o: any) =>
                    (o.price?.total ?? Infinity) < (min?.price?.total ?? Infinity) ? o : min
                );
                return { date, price: cheapest?.price?.total ?? null, currency: cheapest?.price?.currency ?? 'USD' };
            })
        );

        const data: Record<string, { price: number; currency: string }> = {};
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value.price !== null) {
                data[r.value.date] = { price: r.value.price, currency: r.value.currency };
            }
        }
        return { success: true, data };
    }

    // ─── Private supplier helpers ─────────────────────────────────────────────

    private async _cancelMystifly(booking: any): Promise<{
        success: boolean; refundAmount?: number; penaltyAmount?: number;
        currency?: string; cancellationId?: string; error?: string;
    }> {
        const uniqueId = booking.pnr;
        if (!uniqueId) return { success: false, error: 'No PNR found for Mystifly cancellation' };

        try {
            const data = await mystiflyRequest('/api/v2/Cancel/AirCancel', { UniqueID: uniqueId });
            if (!data.Success) {
                if (data.alreadyCancelled) {
                    return { success: true, refundAmount: 0, penaltyAmount: 0, currency: 'USD' };
                }
                return { success: false, error: data.error ?? data.Message ?? 'Mystifly cancellation failed' };
            }
            return {
                success: true,
                refundAmount: data.refundAmount ?? 0,
                penaltyAmount: data.penaltyAmount ?? 0,
                currency: data.currency ?? 'USD',
                cancellationId: data.cancellationId,
            };
        } catch (e: any) {
            return { success: false, error: `Mystifly cancel failed: ${e.message}` };
        }
    }

    private async _cancelDuffel(booking: any, preQuotedCancellationId?: string): Promise<{
        success: boolean; refundAmount?: number; penaltyAmount?: number;
        currency?: string; cancellationId?: string; refundTo?: string;
        error?: string; providerMissing?: boolean; requiresManualCancellation?: boolean;
    }> {
        const duffelToken = config.DUFFEL_ACCESS_TOKEN;
        if (!duffelToken) return { success: false, error: 'DUFFEL_ACCESS_TOKEN not configured' };

        let orderId: string | undefined = booking.provider_order_id ?? booking.duffel_order_id ?? undefined;
        if (!orderId && booking.session_id) {
            const session = await this.repo.getBookingSessionForCancelQuote(booking.session_id);
            orderId = session?.duffel_pre_order_id ?? undefined;
        }

        if (!orderId) {
            const isSandbox = duffelToken.startsWith('duffel_test_');
            if (isSandbox) return { success: true, refundAmount: 0, penaltyAmount: 0, currency: 'USD' };
            return { success: false, error: 'Duffel order ID not found. Cannot cancel.' };
        }

        try {
            let order: any;
            try {
                order = await getDuffelOrder(orderId);
            } catch (err: any) {
                if (err.status === 404) {
                    return { success: true, refundAmount: 0, penaltyAmount: Number(booking.total_price ?? 0), currency: booking.currency ?? 'USD', providerMissing: true, error: 'Supplier order not found' };
                }
                return { success: false, error: err.message };
            }

            const availableActions: string[] = order.available_actions ?? [];
            if (!availableActions.includes('cancel')) {
                return { success: false, requiresManualCancellation: true, error: 'Booking cannot be cancelled via API. Contact support for manual cancellation.' };
            }

            let cancellationId: string;
            if (preQuotedCancellationId) {
                cancellationId = preQuotedCancellationId;
            } else {
                const quote = await createDuffelCancellationQuote(orderId);
                cancellationId = quote.id;
            }

            const confirmed = await confirmDuffelCancellation(cancellationId);
            const refundAmount = Number(confirmed.refund_amount) || 0;
            const refundCurrency: string = confirmed.refund_currency ?? 'USD';
            const refundTo: string | undefined = confirmed.refund_to;

            return {
                success: true,
                refundAmount,
                penaltyAmount: Math.max(0, Number(booking.total_price ?? 0) - refundAmount),
                currency: refundCurrency,
                cancellationId,
                refundTo,
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }
}

// ─── Seat map normalization ───────────────────────────────────────────────────

function normalizeSeatMapEntry(
    entry: DuffelSeatMapEntry,
    idx: number,
    segments?: { origin: string; destination: string }[],
): NormalizedSegmentSeatMap {
    const cabin = entry.cabins.find(c => c.cabin_class === 'economy')
        ?? entry.cabins.find(c => c.cabin_class === 'economy_premium')
        ?? entry.cabins[0];

    const rows: SeatRow[] = [];

    for (const row of (cabin?.rows ?? [])) {
        const rowSeats: NormalizedSeat[][] = [];
        let rowNumber = 0;

        for (const section of row.sections) {
            const sectionSeats: NormalizedSeat[] = [];

            for (const el of section.elements) {
                if (el.type === 'seat' && el.designator) {
                    const match = el.designator.match(/^(\d+)([A-Z]+)$/);
                    if (match) rowNumber = parseInt(match[1], 10);

                    const service = el.available_services[0] ?? null;
                    const isSelectable = el.available_services.length > 0;
                    const disclosures = (el.disclosures ?? []).map((d: string) => d.toUpperCase());

                    const seatType = disclosures.includes('WINDOW') ? 'window'
                        : disclosures.includes('AISLE') ? 'aisle'
                            : disclosures.includes('MIDDLE') ? 'middle'
                                : 'unknown';

                    sectionSeats.push({
                        designator: el.designator,
                        elementType: 'seat',
                        type: seatType,
                        status: isSelectable ? 'available' : 'occupied',
                        price: service ? parseFloat(service.total_amount) : null,
                        currency: service?.total_currency ?? 'USD',
                        serviceId: service?.id ?? null,
                        extraLegroom: disclosures.includes('EXTRA_LEGROOM') || disclosures.includes('LEGROOM'),
                        isExit: disclosures.includes('EXIT_ROW'),
                    });
                } else {
                    sectionSeats.push({
                        designator: el.type ?? 'empty',
                        elementType: 'empty',
                        type: 'unknown',
                        status: 'restricted',
                        price: null,
                        currency: 'USD',
                        serviceId: null,
                        extraLegroom: false,
                        isExit: false,
                    });
                }
            }

            if (sectionSeats.length > 0) rowSeats.push(sectionSeats);
        }

        if (rowNumber > 0 && rowSeats.length > 0) rows.push({ rowNumber, sections: rowSeats });
    }

    const columnHeaders: string[][] = [];
    if (rows.length > 0) {
        const referenceRow = rows.reduce((best, r) => {
            const bestCount = best.sections.flat().filter(s => s.elementType === 'seat').length;
            const count = r.sections.flat().filter(s => s.elementType === 'seat').length;
            return count > bestCount ? r : best;
        }, rows[0]);

        for (const section of referenceRow.sections) {
            const labels = section
                .filter(s => s.elementType === 'seat')
                .map(s => s.designator.replace(/^\d+/, ''));
            if (labels.length > 0) columnHeaders.push(labels);
        }
    }

    return {
        segmentIndex: idx,
        segmentId: entry.id,
        origin: segments?.[idx]?.origin ?? '',
        destination: segments?.[idx]?.destination ?? '',
        cabinClass: cabin?.cabin_class ?? 'economy',
        rows,
        columnHeaders,
    };
}
