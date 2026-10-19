/**
 * The sale a Duffel booking attempt becomes, once the airline holds an order and the traveller
 * has paid for it: the `flight_bookings` row, its segments and passengers, the session marked
 * completed, and the confirmation email.
 *
 * Written only after the money has been taken. A `flight_bookings` row is what trips, invoices,
 * admin and the orphaned-order cron read, and that cron cancels the Duffel order of a row it
 * thinks is unpaid — so a row written before capture could lose a traveller their ticket. An
 * order whose payment could not be captured is recorded on the attempt (flight_booking_events),
 * never here.
 *
 * Extracted from `handleDuffel` in internal.route.ts, which still calls it for sessions booked
 * the old way, with their order already placed at `book`.
 */

import { getDuffelOrder } from '@/lib/flights/duffel';
import { withBookedItinerary } from '@/lib/flights/duffelOrderSegments';
import { sendFlightConfirmationEmail } from '@/lib/email/flightConfirmation';
import { lockFx } from '@/lib/payments/fxLock';
import { fromStripeAmount } from '@/lib/pricing';
import { stripe } from '@/lib/stripe';
import { FlightsRepository } from '@/repositories/flights.repository';

/** The order the airline is holding for this attempt. */
export interface DuffelOrderRef {
    orderId:    string;
    pnr:        string;
    tickets:    string[];
    isTicketed: boolean;
}

/** The parts of a `booking_sessions` row a sale is written from. */
export interface CompletionSession {
    id:             string;
    user_id:        string;
    flight:         any;
    passengers:     any;
    fare_policy:    any;
    currency:       string | null;
    original_price: unknown;
    charged_price:  unknown;
}

export interface CompletedFlightBooking {
    bookingId:         string;
    pnr:               string;
    status:            'ticketed' | 'awaiting_ticket';
    confirmedPrice:    number;
    confirmedCurrency: string;
}

const repo = new FlightsRepository();

export async function completeDuffelBooking(input: {
    session:         CompletionSession;
    paymentIntentId: string;
    order:           DuffelOrderRef;
}): Promise<CompletedFlightBooking> {
    const { session, paymentIntentId, order } = input;
    const sessionId = session.id;
    const flight: any = session.flight ?? {};
    const passengers: any[] = session.passengers ?? [];

    // The price is what the payment was taken for, read back from Stripe.
    let confirmedPrice = Number(session.charged_price ?? session.original_price ?? 0);
    let confirmedCurrency = (session.currency ?? 'usd').toUpperCase();
    if (paymentIntentId) {
        try {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
            // The currency decides the scale: KRW has no minor unit, so dividing would
            // record a ₩1,200,000 booking as ₩12,000.
            confirmedPrice = fromStripeAmount(pi.amount, pi.currency ?? 'usd');
            confirmedCurrency = (pi.currency ?? 'usd').toUpperCase();
        } catch { /* non-critical */ }
    }

    const tripType: string = flight.tripType ?? flight.trip_type ?? 'one-way';
    const status = order.isTicketed ? 'ticketed' : 'awaiting_ticket';

    // The rate this booking was taken at, for USD reporting (ADR-0008). lockFx never
    // throws; if it yields nulls the row is simply counted as unconverted until a
    // backfill resolves it.
    const fx = await lockFx(confirmedPrice, confirmedCurrency);

    const booking = await repo.createDuffelFlightBooking({
        userId:          session.user_id,
        sessionId,
        pnr:             order.pnr,
        status,
        price:           confirmedPrice,
        currency:        confirmedCurrency,
        paymentIntentId: paymentIntentId || null,
        supplierCost:    Number(session.original_price ?? confirmedPrice),
        orderId:         order.orderId,
        ticketNumbers:   order.tickets.length > 0 ? order.tickets : [],
        farePolicy:      session.fare_policy ?? null,
        tripType,
        fx,
        sourceBrand:     process.env.BRAND_NAME ?? 'CheapestGo',
    });
    const bookingId = booking.id;

    // Segments from the order Duffel is actually holding.
    //
    // This used to write `booking_sessions.flight`: the itinerary the traveller *selected*,
    // which is client-supplied and not necessarily the one that got ticketed — the
    // expired-offer path books from a freshly fetched offer. Any drift showed up as a
    // confirmation email and a trips page describing a flight the PNR is not for. The stored
    // payload is the fallback for an order with no readable slices.
    const bookedOrder = await getDuffelOrder(order.orderId).catch((err: any) => {
        console.warn(`[flight-booking] Could not read order ${order.orderId} for its itinerary: ${err?.message}`);
        return null;
    });
    await repo.insertFlightSegments(bookingId, bookedOrder ? withBookedItinerary(flight, bookedOrder) : flight);
    await repo.insertPassengers(bookingId, passengers, order.tickets);
    await repo.markSessionCompleted(sessionId);

    // The booking exists and the money has moved, so a mail outage must never turn a
    // successful booking into a failed response — a failed send leaves a row in email_logs
    // for the retry job instead.
    await sendFlightConfirmationEmail(bookingId)
        .catch((err) => console.error('[flight-booking] Confirmation email failed:', err?.message));

    console.log(`[flight-booking] Duffel done. bookingId=${bookingId} pnr=${order.pnr} status=${status}`);

    return { bookingId, pnr: order.pnr, status, confirmedPrice, confirmedCurrency };
}
