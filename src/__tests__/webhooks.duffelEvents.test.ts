import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Every event name Duffel will accept on a webhook subscription, copied from the 422 it answers
 * with when sent one it does not know (Duffel-Version v2, read 2026-11-04). This is the supplier's
 * own list, not ours — if Duffel adds an event, this needs widening before the route can use it.
 */
const DUFFEL_EVENTS = new Set([
    'air.airline_credit.created', 'air.airline_credit.spent', 'air.airline_credit.invalidated',
    'air.payment.failed', 'air.payment.succeeded', 'air.payment.cancelled', 'air.payment.pending',
    'cars.booking.created', 'cars.booking.cancelled', 'cars.booking_creation_failed',
    'trains.booking.tickets_available', 'trains.booking.created', 'trains.booking.cancelled',
    'order.airline_initiated_change_detected', 'order.created', 'order.creation_failed',
    'air.order.changed', 'order_cancellation.created', 'order_cancellation.confirmed',
    'stays.booking_creation_failed', 'stays.booking.created', 'stays.booking.cancelled',
    'assistant.conversation.updated', 'payment_link.payment_captured', 'testing', 'payment.created',
]);

/**
 * A handler keyed on an event the supplier cannot send is dead code that reads as working.
 *
 * `order.updated` and `order.fulfilled` sat in this switch from the day it was written. Duffel
 * sends neither, so the ticketing branch never ran once: flights stayed `confirmed`, ticket
 * numbers were never stored, and the e-ticket email the traveller had been promised never went
 * out. Nothing failed, no error was logged, and the only reason it surfaced was Duffel rejecting
 * a webhook subscription that named those events.
 *
 * Read out of the route source rather than from an exported list, so the thing under test is the
 * switch itself and the two cannot drift apart.
 */
describe('the Duffel webhook', () => {
    it('switches only on events Duffel will send', () => {
        const src = readFileSync('src/routes/webhooks.route.ts', 'utf8');

        // The Duffel handler alone — Stripe's cases are its own vocabulary and would fail here.
        const start = src.indexOf('── Duffel Webhook');
        const end   = src.indexOf('── Mystifly Callback');
        expect(start, 'Duffel section marker moved').toBeGreaterThan(-1);
        expect(end,   'Mystifly section marker moved').toBeGreaterThan(start);

        const handled = [...src.slice(start, end).matchAll(/case '([^']+)':/g)].map(m => m[1]);

        expect(handled.length, 'no cases found — did the switch move?').toBeGreaterThan(0);
        expect(handled.filter(e => !DUFFEL_EVENTS.has(e))).toEqual([]);
    });

    it('still handles the two events the flight flow depends on', () => {
        const src = readFileSync('src/routes/webhooks.route.ts', 'utf8');
        const duffel = src.slice(src.indexOf('── Duffel Webhook'), src.indexOf('── Mystifly Callback'));

        // Ticketing reads the order back and derives status from its documents, so it needs an
        // event that fires once those exist; cancellation refunds against the confirmed one.
        expect(duffel).toContain(`case 'air.order.changed':`);
        expect(duffel).toContain(`case 'order_cancellation.confirmed':`);
    });
});
