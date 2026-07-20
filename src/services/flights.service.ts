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
import { searchFlights, applyServerFilters, ServerFilters } from '@/lib/flights/search';
import {
    parseDuffelOffer, normalizedToFlightOffer, getDuffelAvailableServices,
    getDuffelSeatMaps, getDuffelBalances, getAvailableBalance,
    createDuffelCancellationQuote, confirmDuffelCancellation, getDuffelOrder,
    placeDuffelOrder, refreshDuffelOffer,
} from '@/lib/flights/duffel';
import { mystiflyRequest } from '@/lib/flights/mystifly';
import {
    FlightOffer, FlightSearchParams, FarePolicy, NormalizedBagOption, BagType,
    NormalizedSegmentSeatMap, SeatRow, NormalizedSeat, DuffelSeatMapEntry,
} from '@/types/flights';

// ─── Markup / pricing helpers (inline — no external dep) ─────────────────────

const FLIGHT_MARKUP = 0; // disabled — restore to 0.025 when client is ready to charge

function applyMarkup(basePrice: number, markupRate: number) {
    const markupAmount = Math.round(basePrice * markupRate * 100) / 100;
    const chargedPrice = Math.round((basePrice + markupAmount) * 100) / 100;
    return { originalPrice: basePrice, markupRate, markupAmount, chargedPrice };
}

/** Returns the Stripe amount (smallest currency unit: cents for USD). */
function toStripeAmount(price: number, currency: string): number {
    // Zero-decimal currencies
    const zeroDecimal = ['jpy', 'krw', 'clp', 'pyg', 'ugx', 'vnd', 'xaf', 'xof'];
    if (zeroDecimal.includes(currency.toLowerCase())) return Math.round(price);
    return Math.round(price * 100);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FlightsService {
    private repo = new FlightsRepository();

    // ── Search ────────────────────────────────────────────────────────────────

    async search(params: FlightSearchParams, filters?: ServerFilters): Promise<{
        offers: FlightOffer[];
        totalResults: number;
        allCount: number;
        searchTimestamp: string;
    }> {
        const allOffers = await searchFlights(params);
        const offers = applyServerFilters(allOffers, filters);
        return {
            offers,
            totalResults: offers.length,
            allCount: allOffers.length,
            searchTimestamp: new Date().toISOString(),
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
        userId: string;
    }): Promise<{
        clientSecret: string;
        sessionId: string;
        paymentIntentId: string;
    }> {
        const {
            provider, flight, passengers, contact, idempotencyKey, farePolicy,
            seatServiceIds, seatTotal, bagServiceIds, bagTotal, confirmedPrice,
            bundleHotelId, displayCurrency, userId,
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
            const departureDate = (firstSeg?.departing_at ?? firstSeg?.departureTime ?? firstSeg?.departure ?? '').slice(0, 10);

            if (origin && departureDate) {
                const activeBookings = await this.repo.getActiveBookingsForUser(userId);
                if (activeBookings.length) {
                    const activeIds = activeBookings.map(b => b.id);
                    const conflict = await this.repo.findSegmentConflict(
                        activeIds, origin,
                        new Date(`${departureDate}T00:00:00`),
                        new Date(`${departureDate}T23:59:59`),
                    );
                    if (conflict) {
                        throw Object.assign(
                            new AppError(409, `You already have an active flight booking departing ${origin} on ${departureDate}.`, 'DUPLICATE_BOOKING'),
                            { existingBookingId: conflict.booking_id, route: origin, departureDate },
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

            const isSandbox = duffelToken.startsWith('duffel_test_');
            const priceTolerance = isSandbox ? 10.0 : 0.5;
            const refreshPoolSize = isSandbox ? 3 : 2;

            // Pre-booking balance guard (live only)
            if (!isSandbox) {
                try {
                    const balances = await getDuffelBalances(duffelToken);
                    const offerCurrency = (flight as any).currency ?? 'USD';
                    const offerTotalNum = parseFloat((flight as any).price ?? '0');
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
            const rawCountryCode = String(contact.countryCode ?? '82').replace(/\D/g, '') || '82';
            const rawPhone = String(contact.phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
            const e164Phone = `+${rawCountryCode}${rawPhone}`;
            const totalDigits = rawCountryCode.length + rawPhone.length;
            if (rawPhone.length < 4 || totalDigits < 7 || !/^\+\d{7,15}$/.test(e164Phone)) {
                throw new AppError(400, `Invalid phone number. Please enter a valid phone number with country code.`, 'INVALID_PHONE');
            }

            const duffelPaxTemplates: any[] = rawOffer.passengers ?? [];

            function duffelTitle(pax: any): string {
                const g = (pax.gender ?? '').toUpperCase();
                const t = (pax.type ?? '').toUpperCase();
                if (t === 'CHD' || t === 'INF') return g === 'M' ? 'mr' : 'miss';
                return g === 'M' ? 'mr' : 'ms';
            }

            const orderPassengers = passengers.map((pax: any, idx: number) => ({
                id: duffelPaxTemplates[idx]?.id,
                title: duffelTitle(pax),
                given_name: pax.firstName,
                family_name: pax.lastName,
                born_on: pax.birthDate,
                email: contact.email,
                phone_number: e164Phone,
                gender: (pax.gender ?? '').toUpperCase() === 'M' ? 'm' : 'f',
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

            const result = await placeDuffelOrder({
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
                orderTimeoutMs: 45_000,
            });

            if (result.kind === 'price_changed') {
                throw Object.assign(
                    new AppError(409, `Flight price changed from ${flightTotal} to ${result.newPrice}. Please restart booking.`, 'PRICE_CHANGED'),
                    { oldPrice: result.oldPrice, newPrice: result.newPrice, currency: result.currency },
                );
            }
            if (result.kind === 'offer_replaced') {
                throw Object.assign(
                    new AppError(409, 'offer_replaced', 'OFFER_REPLACED'),
                    { newOffer: result.newOffer },
                );
            }
            if (result.kind === 'error') {
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

        // ── Create booking session ─────────────────────────────────────────────
        const serverFarePolicy = farePolicy;
        const sanitizedFlight = { ...flight };
        delete (sanitizedFlight as any).rawOffer;
        delete (sanitizedFlight as any)._rawOffer;

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
        const pricing = applyMarkup(stripeBase, FLIGHT_MARKUP);

        const chargeInCurrency = (displayCurrency || flightCurrency).toLowerCase();
        const chargePrice = chargeInCurrency !== flightCurrency
            ? pricing.chargedPrice // no conversion in api-v2 yet — use as-is
            : pricing.chargedPrice;
        const stripeAmount = toStripeAmount(chargePrice, chargeInCurrency);

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
        }, { idempotencyKey: piIdempotencyKey });

        // ── Update session with PI ─────────────────────────────────────────────
        try {
            await this.repo.updateBookingSessionPayment(sessionId, paymentIntent.id);
        } catch (sessionUpdateError: any) {
            console.error('[book] CRITICAL — failed to save payment_intent_id:', sessionUpdateError.message);

            // Cancel Duffel order before Stripe PI to avoid orphaned seats
            if (duffelPreOrder?.orderId) {
                try {
                    const quote = await createDuffelCancellationQuote(duffelPreOrder.orderId);
                    if (quote?.id) await confirmDuffelCancellation(quote.id);
                    console.log(`[book] Duffel order ${duffelPreOrder.orderId} cancelled after session failure`);
                } catch (cancelErr: any) {
                    console.error(`[book] ORPHANED DUFFEL ORDER: ${duffelPreOrder.orderId} — cancel failed: ${cancelErr.message}`);
                }
            }

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

        // Late webhook check
        const lateBooking = await this.repo.getFlightBookingBySession(sessionId);
        if (lateBooking?.pnr) {
            return { bookingId: lateBooking.id, pnr: lateBooking.pnr, status: lateBooking.status, source: 'late-webhook' };
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

    async offerRefresh(rawOffer: any): Promise<{ newOfferId: string; newOffer: any }> {
        if (!config.DUFFEL_ACCESS_TOKEN) {
            throw new AppError(503, 'Duffel not configured', 'PROVIDER_UNAVAILABLE');
        }

        const offers = await refreshDuffelOffer(rawOffer);
        if (offers.length === 0) {
            throw new AppError(404, 'No offers returned for this itinerary', 'NO_OFFERS');
        }

        const targetAirlineCode: string | null =
            rawOffer.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code ?? null;
        const targetFlightNumber: string | null = targetAirlineCode
            ? `${targetAirlineCode}${rawOffer.slices?.[0]?.segments?.[0]?.marketing_carrier_flight_number ?? ''}`
            : null;

        let matched = targetFlightNumber
            ? offers.find(o =>
                o.slices?.[0]?.segments?.[0] &&
                `${o.slices[0].segments[0].marketing_carrier?.iata_code}${o.slices[0].segments[0].marketing_carrier_flight_number}` === targetFlightNumber,
            )
            : null;

        if (!matched && targetAirlineCode) {
            matched = offers.find(o => o.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code === targetAirlineCode);
        }

        if (!matched) {
            matched = offers.reduce((best: any, o: any) =>
                parseFloat(o.total_amount) < parseFloat(best.total_amount) ? o : best,
            );
        }

        const cabinClass: string = rawOffer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class ?? 'economy';
        const tripType = matched.slices.length > 1 ? 'round-trip' : 'one-way';
        const normalized = parseDuffelOffer(matched, cabinClass);
        const flightOffer = normalizedToFlightOffer(normalized, tripType);

        console.log(`[offerRefresh] ${rawOffer.id} → ${matched.id}`);
        return { newOfferId: matched.id, newOffer: flightOffer };
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
                refundAmount = Math.round((pi.amount / 100) * refundRatio * 100) / 100;
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
                    actualStripeRefundAmount = piAmount / 100;
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
                        actualStripeRefundAmount = refundAmountCents / 100;
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
