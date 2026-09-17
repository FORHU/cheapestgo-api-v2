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
    parseDuffelOffer, normalizedToFlightOffer, getDuffelAvailableServices,
    getDuffelSeatMaps, getDuffelBalances, getAvailableBalance,
    createDuffelCancellationQuote, confirmDuffelCancellation, getDuffelOrder,
    placeDuffelOrder, refreshDuffelOffer, ORDER_CREATE_TIMEOUT_MS,
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
import { applyMarkup, toStripeAmount, fromStripeAmount, FLIGHT_MARKUP_SPEC, getFlightPriceTolerance } from '@/lib/pricing';
import { findReusablePreOrder, samePassengerIdentity, sameOrderTotal, REUSE_WINDOW_MS, type CandidateSession } from '@/lib/flights/preorderReuse';
import { duffelIdentityDocuments } from '@/lib/flights/duffelIdentityDocuments';
import { findOrderFromTimedOutAttempt, toReconciledOrder } from '@/lib/flights/duffelOrderReconcile';
import { awaitBookingRow } from '@/lib/flights/awaitBookingRow';
import { makeStrictConverter } from '@/lib/payments/convertStrict';
import { ExchangeRatesService } from '@/services/exchange-rates.service';

// ─── Service ──────────────────────────────────────────────────────────────────

export class FlightsService {
    private repo = new FlightsRepository();

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

    // ── Book (create payment intent) ──────────────────────────────────────────

    async book(args: {
        provider: string;
        flight: FlightOffer & { _rawOffer?: any;[k: string]: any };
        passengers: any[];
        contact: { email: string; phone: string; countryCode?: string };
        idempotencyKey: string;
        farePolicy: FarePolicy;
        seatServiceIds?: string[];
        seatTotal?: number;
        bagServiceIds?: string[];
        bagTotal?: number;
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
    }> {
        const {
            provider, flight, passengers, contact, idempotencyKey, farePolicy,
            seatServiceIds, seatTotal, bagServiceIds, bagTotal, confirmedPrice,
            bundleHotelId, displayCurrency, acknowledgeDuplicate, userId,
        } = args;

        // ── Validate provider ──────────────────────────────────────────────────
        if (provider === 'mystifly_v2' || provider === 'mystifly') {
            throw new AppError(422, 'This fare is no longer available. Please search again for current prices.', 'FARE_UNAVAILABLE');
        }
        if (provider !== 'duffel') {
            throw new AppError(400, 'Invalid provider', 'INVALID_PROVIDER');
        }
        if (!flight || typeof flight !== 'object') {
            throw new AppError(400, 'flight object is required', 'MISSING_FLIGHT');
        }

        // ── Price resolution ───────────────────────────────────────────────────
        const flightTotal = typeof flight.price === 'number'
            ? (flight.price as number)
            : flight.price?.total ?? 0;
        const flightCurrency = (
            (typeof flight.price === 'object' ? flight.price?.currency : undefined)
            || (flight as any).currency || 'USD'
        ).toLowerCase();

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

        // ── Duffel pre-order ───────────────────────────────────────────────────
        let duffelPreOrder: {
            orderId: string; pnr: string; tickets: string[]; isTicketed: boolean;
            orderTotal: string; orderCurrency: string;
        } | null = null;

        {
            const rawOffer = (flight as any)._rawOffer;
            if (!rawOffer?.id) throw new AppError(400, 'Duffel offer data missing — cannot book.', 'MISSING_OFFER');

            const duffelToken = config.DUFFEL_ACCESS_TOKEN;
            if (!duffelToken) throw new AppError(503, 'Duffel not configured.', 'PROVIDER_UNAVAILABLE');

            // One tolerance for every gate that can raise a price_changed prompt — the
            // revalidation gate and this one. When the two disagreed, a fare drifting between
            // them was waved through one and stopped by the other.
            const priceTolerance = getFlightPriceTolerance();
            // The same pool in both modes. Sandbox used to get 3 alternates and live 2, so live
            // was less resilient to an expired offer than the environment rehearsing it.
            const refreshPoolSize = 3;

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

            // Build E.164 phone
            const phoneInput = String(contact.phone ?? '').trim();
            let e164Phone: string;
            if (phoneInput.startsWith('+')) {
                e164Phone = phoneInput.replace(/[\s\-()]/g, '');
            } else {
                const rawCountryCode = String(contact.countryCode ?? '82').replace(/\D/g, '') || '82';
                const cleaned = phoneInput.replace(/\D/g, '').replace(/^0+/, '');
                e164Phone = `+${rawCountryCode}${cleaned}`;
            }
            if (!/^\+\d{7,15}$/.test(e164Phone)) {
                throw new AppError(400, `Invalid phone number. Please enter a valid phone number with country code.`, 'INVALID_PHONE');
            }

            const duffelPaxTemplates: any[] = rawOffer.passengers ?? [];

            const duffelTitle = (pax: any): string => {
                const g = (pax.gender ?? '').toUpperCase();
                const t = (pax.type ?? '').toUpperCase();
                if (t === 'CHD' || t === 'INF') return g === 'M' ? 'mr' : 'miss';
                return g === 'M' ? 'mr' : 'ms';
            };

            const orderPassengers = passengers.map((pax: any, idx: number) => ({
                id: duffelPaxTemplates[idx]?.id,
                title: duffelTitle(pax),
                given_name: pax.firstName,
                family_name: pax.lastName,
                born_on: pax.dateOfBirth ?? pax.birthDate,
                email: contact.email,
                phone_number: e164Phone,
                gender: (pax.gender ?? '').toUpperCase() === 'M' ? 'm' : 'f',
                // Passport details for the airline's APIS feed. The form requires them and
                // then none of it was sent, so the traveller had to supply it again at
                // check-in. Only where the offer asks — some sources reject an order that
                // volunteers them.
                ...duffelIdentityDocuments(rawOffer, {
                    passport:       pax.passport ?? pax.passportNumber,
                    passportExpiry: pax.passportExpiry,
                    nationality:    pax.nationality,
                }),
            }));

            const offerTotal = parseFloat(rawOffer.total_amount ?? '0');
            const availableSvcs: any[] = rawOffer.available_services ?? [];
            let computedSeatExtra = 0;
            let computedBagExtra = 0;
            for (const id of (seatServiceIds ?? [])) {
                const svc = availableSvcs.find((s: any) => s.id === id);
                if (svc) computedSeatExtra += parseFloat(svc.total_amount ?? '0');
            }
            for (const id of (bagServiceIds ?? [])) {
                const svc = availableSvcs.find((s: any) => s.id === id);
                if (svc) computedBagExtra += parseFloat(svc.total_amount ?? '0');
            }
            const orderTotal = (offerTotal + computedSeatExtra + computedBagExtra).toFixed(2);

            // ── Did a previous attempt already buy this? ─────────────────────────────
            //
            // The payment step's "Back to details" returns to the form, and re-submitting
            // lands here with the same offer. Placing an order buys a real, paid ticket every
            // time, so without this the traveller pays twice for one trip — which is how v1
            // issued two EVA tickets 61 seconds apart after a currency change.
            const reuse = await this.findLivePreOrder({ userId, offerId: rawOffer.id, passengers, expectedTotal: orderTotal });

            if (reuse && 'supersededOrderId' in reuse) {
                // A live order that no longer describes this submission — a corrected name, or
                // different bags. It can never be paid now, so release the seat and the balance
                // before buying the replacement rather than leaving it for the orphan sweep.
                const released = await this.cancelDuffelOrderQuietly(reuse.supersededOrderId, 'superseded by corrected booking details');
                if (reuse.paymentIntentId) await stripe.paymentIntents.cancel(reuse.paymentIntentId).catch(() => {});
                if (released) await this.repo.expireSessionsForPreOrder(reuse.supersededOrderId).catch(() => {});
            }

            if (reuse && !('supersededOrderId' in reuse)) {
                console.warn(`[book] Reusing pre-order ${reuse.orderId} (${reuse.pnr}) — this offer is already bought, not buying again`);
                // The earlier attempt's PaymentIntent can never be paid; this attempt issues its own.
                if (reuse.paymentIntentId) await stripe.paymentIntents.cancel(reuse.paymentIntentId).catch(() => {});
                duffelPreOrder = {
                    orderId:       reuse.orderId,
                    pnr:           reuse.pnr,
                    tickets:       reuse.tickets,
                    isTicketed:    reuse.isTicketed,
                    orderTotal:    reuse.orderTotal,
                    orderCurrency: reuse.orderCurrency,
                };
            }

            // Stamped before the request so a reconciliation can rule out older orders for
            // the same route and price — a genuine repeat customer.
            const attemptStartedAt = new Date().toISOString();
            const result = duffelPreOrder ? null : await placeDuffelOrder({
                rawOffer,
                passengers: orderPassengers,
                total: orderTotal,
                currency: rawOffer.total_currency,
                seatServiceIds,
                bagServiceIds,
                confirmedPrice,
                priceTolerance,
                idempotencyKey: idempotencyKey ?? crypto.randomUUID(),
                refreshPoolSize,
                orderTimeoutMs: ORDER_CREATE_TIMEOUT_MS,
            });

            if (result?.kind === 'price_changed') {
                throw new AppError(
                    409,
                    `Flight price changed from ${flightTotal} to ${result.newPrice}. Please restart booking.`,
                    'PRICE_CHANGED',
                    { oldPrice: result.oldPrice, newPrice: result.newPrice, currency: result.currency },
                );
            }
            if (result?.kind === 'offer_replaced') {
                throw new AppError(409, 'offer_replaced', 'OFFER_REPLACED', { newOffer: result.newOffer });
            }
            if (result?.kind === 'error' && result.timedOut) {
                // The request was abandoned; Duffel may have completed the booking anyway.
                // Look for it before reporting a failure — otherwise the traveller is told
                // the booking failed while a real, paid, ticketed PNR sits against the
                // balance with nothing linking the two.
                const recovered = await findOrderFromTimedOutAttempt(duffelToken, {
                    sinceIso:    attemptStartedAt,
                    origin:      rawOffer.slices?.[0]?.segments?.[0]?.origin?.iata_code ?? '',
                    destination: (() => {
                        const last = rawOffer.slices?.[rawOffer.slices.length - 1];
                        return last?.segments?.[last.segments.length - 1]?.destination?.iata_code ?? '';
                    })(),
                    totalAmount: orderTotal,
                    currency:    rawOffer.total_currency,
                    familyName:  passengers[0]?.lastName,
                });

                if (recovered) {
                    const reconciled = toReconciledOrder(recovered);
                    console.warn(`[book] Recovered order ${reconciled.orderId} (${reconciled.pnr}) from a timed-out attempt`);
                    duffelPreOrder = reconciled;
                }
            }

            if (!duffelPreOrder && result?.kind === 'error') {
                const errCode = result.data?.errors?.[0]?.code ?? '';
                const rawMsg = result.data?.errors?.[0]?.message ?? '';
                const isPhoneErr = /phone_number/i.test(rawMsg);
                const isExpiredErr = result.status === 422 || /expired|no longer available|select another offer/i.test(rawMsg);
                const isSeatErr = /seat|service.*unavailable|no longer.*available.*service/i.test(rawMsg) && !isExpiredErr;
                const isSupplierOutage = result.status >= 500;

                const errMsg = isPhoneErr ? 'Invalid phone number format. Please check your phone number and country code.'
                    : isExpiredErr ? 'This flight is no longer available. Please search again for current prices.'
                        : isSeatErr ? 'One or more selected seats are no longer available. Please choose different seats or continue without seat selection.'
                            : isSupplierOutage ? "The airline's booking system is currently experiencing technical difficulties. Please try again in a few minutes or choose a different flight."
                                : rawMsg || 'Flight booking failed. Please try again.';

                const httpStatus = isExpiredErr ? 409 : isSupplierOutage ? 502 : 400;
                throw new AppError(httpStatus, errMsg, 'DUFFEL_ORDER_FAILED');
            }

            // Every other kind has thrown above, unless a timed-out attempt was recovered
            // just now — in which case duffelPreOrder is already set and this is skipped.
            if (result?.kind === 'success') {
                const order = result.order;
                const tickets = (order.documents ?? [])
                    .filter((d: any) => d.type === 'electronic_ticket')
                    .map((d: any) => d.unique_identifier as string);

                duffelPreOrder = {
                    orderId: order.id,
                    pnr: order.booking_reference ?? order.id,
                    tickets,
                    isTicketed: tickets.length > 0,
                    orderTotal: result.finalTotal,
                    orderCurrency: result.finalCurrency,
                };
                console.log(`[book] Duffel pre-order: orderId=${duffelPreOrder.orderId} pnr=${duffelPreOrder.pnr} tickets=${tickets.length}`);
            }
        }

        // ── From here on an airline order exists, and nothing may leave it behind ─────
        //
        // Every step below can throw — the session insert, the rates fetch, Stripe. Only one
        // of those failures used to undo the order; any other went to the generic handler
        // and left a confirmed, paid ticket against the balance that nothing had recorded
        // (ADR-0009, ADR-0013). So everything that follows runs inside one guard that
        // cancels the order on the way out.
        try {
            return await this.completeBooking({
                ...args, flightTotal, flightCurrency, duffelPreOrder,
            });
        } catch (err) {
            if (duffelPreOrder?.orderId) {
                await this.cancelDuffelOrderQuietly(duffelPreOrder.orderId, `booking failed after the order was placed: ${(err as Error)?.message ?? err}`);
            }
            throw err;
        }
    }

    /**
     * Everything after the airline order: the session, the charge, the bookkeeping. Split out
     * of `book` so a single guard around it can cancel the order whatever throws.
     */
    private async completeBooking(args: Parameters<FlightsService['book']>[0] & {
        flightTotal: number;
        flightCurrency: string;
        duffelPreOrder: {
            orderId: string; pnr: string; tickets: string[]; isTicketed: boolean;
            orderTotal: string; orderCurrency: string;
        } | null;
    }) {
        const {
            provider, flight, passengers, contact, idempotencyKey, farePolicy,
            seatServiceIds, seatTotal, bagServiceIds, bagTotal,
            bundleHotelId, displayCurrency, userId, flightTotal, flightCurrency, duffelPreOrder,
        } = args;

        // ── Create booking session ─────────────────────────────────────────────
        const serverFarePolicy = farePolicy;
        const sanitizedFlight: any = { ...flight, _offerId: (flight as any)._rawOffer?.id ?? (flight as any).rawOffer?.id };
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
            farePolicy: serverFarePolicy,
            policySource: (serverFarePolicy as any)?.policySource ?? null,
            policyVersion: (serverFarePolicy as any)?.policyVersion ?? null,
            isRefundable: (serverFarePolicy as any)?.isRefundable ?? null,
            isChangeable: (serverFarePolicy as any)?.isChangeable ?? null,
            refundPenaltyAmount: (serverFarePolicy as any)?.refundPenaltyAmount ?? null,
            refundPenaltyCurrency: (serverFarePolicy as any)?.refundPenaltyCurrency ?? null,
            seatServiceIds,
            seatTotal,
            bagServiceIds,
            bagTotal,
            expiresAt,
        });

        const sessionId = sessionRow.id;

        // ── Create Stripe PaymentIntent ────────────────────────────────────────
        const stripeBase = duffelPreOrder
            ? parseFloat(duffelPreOrder.orderTotal)
            : flightTotal + Math.max(0, seatTotal ?? 0) + Math.max(0, bagTotal ?? 0);
        // The currency the order actually settled in, which is not always the one the
        // offer was shopped in.
        const baseCurrency = (duffelPreOrder?.orderCurrency || flightCurrency).toLowerCase();
        const chargeInCurrency = (displayCurrency || flightCurrency).toLowerCase();

        const convert = makeStrictConverter(
            baseCurrency === chargeInCurrency && baseCurrency === 'usd'
                ? null                                   // nothing to convert; skip the fetch
                : await new ExchangeRatesService().getLiveRates(),
        );

        // The flat component is in USD because the costs it recovers are: Duffel's $3.00
        // order fee and Stripe's $0.30. `stripeBase` is in the supplier's currency, so it
        // has to be converted first — adding 4.40 to a PHP fare would charge ₱4.40, about
        // eight US cents.
        //
        // Guarded rather than thrown: by this point a live ticket may already exist, and
        // stranding one costs far more than under-recovering a single booking's flat fee.
        // Falling back to zero loses ~$4.40; an uncaught throw here loses the ticket.
        let flatInBaseCurrency = FLIGHT_MARKUP_SPEC.flat;
        try {
            flatInBaseCurrency = convert(FLIGHT_MARKUP_SPEC.flat, 'usd', baseCurrency);
        } catch (fxErr: any) {
            flatInBaseCurrency = 0;
            console.error(
                `[book] Could not convert the flat markup component USD→${baseCurrency} `
                + `(${fxErr?.message}) — charging the proportional part only.`,
            );
        }

        const pricing = applyMarkup(stripeBase, FLIGHT_MARKUP_SPEC, flatInBaseCurrency);

        // Charge in the customer's own currency, so a refund matches what they paid with no
        // FX drift. Strictly converted: a silent passthrough charges the fare's numeric
        // value in the wrong currency — 5,800 PHP billed as 5,800 USD.
        let chargePrice: number;
        try {
            chargePrice = chargeInCurrency !== baseCurrency
                ? Math.round(convert(pricing.chargedPrice, baseCurrency, chargeInCurrency) * 100) / 100
                : pricing.chargedPrice;
        } catch (fxErr: any) {
            console.error(`[book] FX conversion failed after the order was placed (${baseCurrency}→${chargeInCurrency}):`, fxErr?.message);
            // The order exists and cannot be paid for; the guard in `book` cancels it on the
            // way out.
            throw new AppError(
                503,
                'Currency conversion is temporarily unavailable. Your card was not charged. Please try again shortly.',
                'FX_UNAVAILABLE',
            );
        }

        const stripeAmount = toStripeAmount(chargePrice, chargeInCurrency);

        console.log(
            `[book] Pricing: original=${pricing.originalPrice} ${baseCurrency}, charged=${pricing.chargedPrice}, `
            + `markup=${(pricing.markupRate * 100).toFixed(1)}% effective `
            + `(${(FLIGHT_MARKUP_SPEC.rate * 100).toFixed(1)}% + ${pricing.markupFlat} ${baseCurrency}`
            + `${pricing.capped ? `, CAPPED at ${(FLIGHT_MARKUP_SPEC.cap * 100).toFixed(0)}%` : ''}) `
            + `→ ${chargePrice} ${chargeInCurrency}`,
        );

        const piIdempotencyKey = `flight-pi-${userId}-${sessionId}`;
        const paymentIntent = await stripe.paymentIntents.create({
            amount: stripeAmount,
            currency: chargeInCurrency,
            capture_method: 'automatic',
            metadata: {
                bookingSessionId: sessionId,
                provider,
                userId,
                passengerEmail: contact.email,
                originalPrice: String(pricing.originalPrice),
                markupRate: String(pricing.markupRate),
                markupAmount: String(pricing.markupAmount),
                ...(duffelPreOrder ? {
                    duffelOrderId: duffelPreOrder.orderId,
                    duffelPnr: duffelPreOrder.pnr,
                    duffelTickets: duffelPreOrder.tickets.join(','),
                    duffelIsTicketed: String(duffelPreOrder.isTicketed),
                } : {}),
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

            // The Duffel order is cancelled by the guard in `book` when this throws; the
            // PaymentIntent is ours to cancel here, since only this step knows it exists.

            try {
                await stripe.paymentIntents.cancel(paymentIntent.id);
            } catch (cancelErr: any) {
                console.error('[book] Could not cancel PI after session update failure:', cancelErr.message);
            }
            throw new AppError(500, 'A session error occurred. Your card was not charged. Please try again.', 'SESSION_UPDATE_FAILED');
        }

        // Audit fields (non-critical)
        await this.repo.updateBookingSessionAudit(sessionId, {
            currency: flightCurrency,
            originalPrice: pricing.originalPrice,
            chargedPrice: chargePrice,
            markupPct: pricing.markupRate,
            paymentCurrency: chargeInCurrency.toUpperCase(),
        });

        // Store Duffel pre-order in session
        if (duffelPreOrder) {
            try {
                await this.repo.updateBookingSessionDuffelPreOrder(sessionId, {
                    orderId: duffelPreOrder.orderId,
                    pnr: duffelPreOrder.pnr,
                    tickets: duffelPreOrder.tickets,
                    isTicketed: duffelPreOrder.isTicketed,
                });
            } catch (err: any) {
                console.error('[book] Failed to store Duffel pre-order in session:', err.message);
            }
        }

        return {
            clientSecret: paymentIntent.client_secret!,
            sessionId,
            paymentIntentId: paymentIntent.id,
        };
    }

    /**
     * A live order this user already bought for this offer, if one can safely be reused.
     *
     * Four gates, and they all have to agree: the offer id within the reuse window
     * (`findReusablePreOrder`), the order still existing at Duffel — trusting the supplier
     * rather than our own row — the passengers being the people being booked now, and the
     * total matching this attempt's bags and seats. A match on the offer alone is not
     * enough: "Back to details" exists so a traveller can fix a misspelled name, and reusing
     * the order would ticket the uncorrected one.
     *
     * `supersededOrderId` names a live order that failed gate 3 or 4, so the caller can
     * release it before buying the replacement.
     */
    private async findLivePreOrder(args: { userId: string; offerId: string; passengers: any[]; expectedTotal: string }): Promise<
        | { orderId: string; pnr: string; tickets: string[]; isTicketed: boolean; orderTotal: string; orderCurrency: string; paymentIntentId: string | null }
        | { supersededOrderId: string; paymentIntentId: string | null }
        | null
    > {
        if (!args.userId || !args.offerId) return null;
        try {
            const sessions = await this.repo.findRecentPreOrderSessions(args.userId, new Date(Date.now() - REUSE_WINDOW_MS));
            const candidate = findReusablePreOrder(sessions as unknown as CandidateSession[], { offerId: args.offerId, excludeSessionId: '' });
            if (!candidate?.duffel_pre_order_id) return null;

            const order = await getDuffelOrder(candidate.duffel_pre_order_id).catch(() => null);
            if (!order?.id || order.cancelled_at) return null;

            const submitted = args.passengers.map((p: any) => ({
                firstName: p.firstName, lastName: p.lastName, birthDate: p.dateOfBirth ?? p.birthDate,
            }));
            if (!samePassengerIdentity(order.passengers, submitted) || !sameOrderTotal(order.total_amount, args.expectedTotal)) {
                return { supersededOrderId: order.id, paymentIntentId: candidate.payment_intent_id ?? null };
            }

            const tickets: string[] = (order.documents ?? [])
                .filter((d: any) => d.type === 'electronic_ticket')
                .map((d: any) => d.unique_identifier as string);
            return {
                orderId:         order.id,
                pnr:             order.booking_reference ?? order.id,
                tickets,
                isTicketed:      tickets.length > 0,
                orderTotal:      order.total_amount ?? '',
                orderCurrency:   order.total_currency ?? '',
                paymentIntentId: candidate.payment_intent_id ?? null,
            };
        } catch (err: any) {
            // A failed check books fresh — the cost of being wrong that way is the ticket we
            // already had, never a traveller attached to someone else's order.
            console.warn('[book] pre-order reuse check failed:', err?.message ?? err);
            return null;
        }
    }

    /** Cancel a Duffel order without letting a failure to cancel hide the error that caused it. */
    private async cancelDuffelOrderQuietly(orderId: string, reason: string): Promise<boolean> {
        try {
            const quote = await createDuffelCancellationQuote(orderId);
            if (quote?.id) await confirmDuffelCancellation(quote.id);
            console.warn(`[book] Cancelled Duffel order ${orderId}: ${reason}`);
            return true;
        } catch (cancelErr: any) {
            console.error(`[book] ORPHANED DUFFEL ORDER ${orderId} — cancel failed (${cancelErr?.message}); reason: ${reason}`);
            return false;
        }
    }

    // ── Confirm ───────────────────────────────────────

    async confirm(paymentIntentId: string, sessionId: string, userId: string, internalBaseUrl: string): Promise<{
        bookingId?: string;
        pnr?: string;
        status?: string;
        source: string;
    }> {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const provider = paymentIntent.metadata?.provider ?? '';
        const isMystifly = provider === 'mystifly_v2' || provider === 'mystifly';

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

        // Strict per-provider PI status check
        if (isMystifly) {
            if (paymentIntent.status !== 'succeeded') {
                throw new AppError(402, `Payment not authorized for Mystifly (status: ${paymentIntent.status})`, 'PAYMENT_NOT_AUTHORIZED');
            }
        } else {
            if (paymentIntent.status !== 'succeeded') {
                throw new AppError(402, `Payment not completed for Duffel (status: ${paymentIntent.status})`, 'PAYMENT_NOT_COMPLETED');
            }
        }

        // Fallback: call internal create-booking
        console.log('[confirm] Calling create-booking as fallback. Session:', sessionId);
        const internalHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.FUNCTIONS_SECRET ?? ''}`,
        };

        const ctrl = new AbortController();
        const tmo = setTimeout(() => ctrl.abort(), 55_000);
        let bookingRes: Response;
        try {
            bookingRes = await fetch(`${internalBaseUrl}/api/internal/create-booking`, {
                method: 'POST',
                headers: internalHeaders,
                body: JSON.stringify({ sessionId }),
                signal: ctrl.signal,
            });
        } catch (fetchErr: any) {
            clearTimeout(tmo);
            const isTimeout = fetchErr?.name === 'AbortError';
            throw new AppError(502, isTimeout ? 'Booking timed out. Please check your trips page.' : `Booking service unreachable: ${fetchErr.message}`, 'BOOKING_SERVICE_UNAVAILABLE');
        }
        clearTimeout(tmo);

        let bookingData: any;
        try {
            bookingData = await bookingRes.json();
        } catch {
            throw new AppError(502, `Booking service error (HTTP ${bookingRes.status})`, 'BOOKING_SERVICE_ERROR');
        }

        if (bookingData.success) {
            return {
                bookingId: bookingData.bookingId,
                pnr: bookingData.pnr,
                status: bookingData.status,
                source: 'confirm-fallback',
            };
        }

        // The webhook may still be writing. Wait it out before telling a traveller their
        // booking failed — the sentence below says their card was not charged, and by this
        // point it may well have been.
        const lateBooking = await awaitBookingRow(
            (id) => this.repo.getFlightBookingBySession(id) as any,
            sessionId,
        );
        if (lateBooking?.pnr) {
            return { bookingId: lateBooking.id, pnr: lateBooking.pnr, status: lateBooking.status ?? undefined, source: 'late-webhook' };
        }

        throw new AppError(400, bookingData.error || 'Booking failed — your card has not been charged.', 'BOOKING_FAILED');
    }

    // ── Booking status ────────────────────────────────────────────────────────

    async getBookingStatus(sessionId: string, userId: string) {
        const booking = await this.repo.getFlightBookingBySessionForUser(sessionId, userId);
        if (!booking) return { found: false };

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
        let cachedPi: any = null;

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
                cachedPi = pi;
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
