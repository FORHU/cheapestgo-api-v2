import { describe, it, expect } from 'vitest';
import {
    FLIGHT_BOOKING_STATUSES,
    InvalidTransitionError,
    allowedTransitions,
    assertTransition,
    canTransition,
    holdsAuthorisation,
    isFlightBookingStatus,
    isTerminal,
    type FlightBookingStatus,
} from '@/lib/flights/lifecycle/stateMachine';

describe('flight booking state machine', () => {
    it('walks the happy path in order', () => {
        const path: FlightBookingStatus[] = [
            'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', 'CONFIRMED',
        ];
        for (let i = 0; i < path.length - 1; i++) {
            expect(canTransition(path[i], path[i + 1])).toBe(true);
        }
    });

    it('cannot skip a step or go backwards', () => {
        // The airline is never asked before a card is authorised.
        expect(canTransition('PAYMENT_PENDING', 'SUPPLIER_BOOKING')).toBe(false);
        expect(canTransition('PAYMENT_PENDING', 'CONFIRMED')).toBe(false);
        expect(canTransition('PAYMENT_AUTHORIZED', 'CONFIRMED')).toBe(false);
        expect(canTransition('CONFIRMED', 'PAYMENT_AUTHORIZED')).toBe(false);
        expect(canTransition('SUPPLIER_BOOKING', 'PAYMENT_AUTHORIZED')).toBe(false);
    });

    it('lets an attempt expire only before the airline is asked', () => {
        expect(canTransition('PAYMENT_PENDING', 'EXPIRED')).toBe(true);
        expect(canTransition('PAYMENT_AUTHORIZED', 'EXPIRED')).toBe(true);
        // Once asked, the airline may hold an order: abandonment is not an answer.
        expect(canTransition('SUPPLIER_BOOKING', 'EXPIRED')).toBe(false);
        expect(canTransition('NEEDS_REVIEW', 'EXPIRED')).toBe(false);
    });

    it('fails an attempt on a definitive refusal, and never a confirmed one', () => {
        expect(canTransition('PAYMENT_PENDING', 'FAILED')).toBe(true);
        expect(canTransition('PAYMENT_AUTHORIZED', 'FAILED')).toBe(true);
        expect(canTransition('SUPPLIER_BOOKING', 'FAILED')).toBe(true);
        expect(canTransition('CONFIRMED', 'FAILED')).toBe(false);
    });

    it('sends an unanswered airline call to review, never straight to failure by itself', () => {
        expect(canTransition('SUPPLIER_BOOKING', 'NEEDS_REVIEW')).toBe(true);
        // A person (or a read-back of the order) resolves it either way, and only those ways.
        expect(allowedTransitions('NEEDS_REVIEW')).toEqual(['CONFIRMED', 'FAILED']);
    });

    it('has terminal states that go nowhere', () => {
        // This slice has no cancel or refund: a confirmed flight stays confirmed here.
        for (const s of ['CONFIRMED', 'FAILED', 'EXPIRED'] as const) {
            expect(isTerminal(s)).toBe(true);
            expect(allowedTransitions(s)).toEqual([]);
        }
        expect(isTerminal('PAYMENT_PENDING')).toBe(false);
        expect(isTerminal('NEEDS_REVIEW')).toBe(false);
    });

    it('allows every legal edge and rejects every other one', () => {
        const legal = new Set([
            'PAYMENT_PENDING>PAYMENT_AUTHORIZED', 'PAYMENT_PENDING>FAILED', 'PAYMENT_PENDING>EXPIRED',
            'PAYMENT_AUTHORIZED>SUPPLIER_BOOKING', 'PAYMENT_AUTHORIZED>FAILED', 'PAYMENT_AUTHORIZED>EXPIRED',
            'SUPPLIER_BOOKING>CONFIRMED', 'SUPPLIER_BOOKING>FAILED', 'SUPPLIER_BOOKING>NEEDS_REVIEW',
            'NEEDS_REVIEW>CONFIRMED', 'NEEDS_REVIEW>FAILED',
        ]);
        for (const from of FLIGHT_BOOKING_STATUSES) {
            for (const to of FLIGHT_BOOKING_STATUSES) {
                expect(canTransition(from, to), `${from} → ${to}`).toBe(legal.has(`${from}>${to}`));
            }
        }
    });

    it('does not move a state to itself', () => {
        for (const s of FLIGHT_BOOKING_STATUSES) {
            expect(canTransition(s, s), s).toBe(false);
        }
    });

    it('only transitions to states that exist, and every state has an entry', () => {
        for (const from of FLIGHT_BOOKING_STATUSES) {
            expect(Array.isArray(allowedTransitions(from))).toBe(true);
            for (const to of allowedTransitions(from)) {
                expect(isFlightBookingStatus(to)).toBe(true);
            }
        }
    });

    it('asserts: silent when legal, a typed error when not', () => {
        expect(() => assertTransition('PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING')).not.toThrow();
        try {
            assertTransition('CONFIRMED', 'PAYMENT_PENDING');
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(InvalidTransitionError);
            expect((err as InvalidTransitionError).from).toBe('CONFIRMED');
            expect((err as InvalidTransitionError).to).toBe('PAYMENT_PENDING');
            expect((err as Error).message).toContain('flight');
        }
    });

    it('knows which states hold a payment authorisation', () => {
        expect(holdsAuthorisation('PAYMENT_AUTHORIZED')).toBe(true);
        expect(holdsAuthorisation('SUPPLIER_BOOKING')).toBe(true);
        expect(holdsAuthorisation('NEEDS_REVIEW')).toBe(true);
        expect(holdsAuthorisation('PAYMENT_PENDING')).toBe(false);
        expect(holdsAuthorisation('CONFIRMED')).toBe(false);
        expect(holdsAuthorisation('FAILED')).toBe(false);
        expect(holdsAuthorisation('EXPIRED')).toBe(false);
    });

    it('recognises its own statuses and nothing else', () => {
        expect(isFlightBookingStatus('CONFIRMED')).toBe(true);
        expect(isFlightBookingStatus('confirmed')).toBe(false);
        // Hotel-only states are not flight states.
        expect(isFlightBookingStatus('CANCEL_REQUESTED')).toBe(false);
        expect(isFlightBookingStatus(undefined)).toBe(false);
    });

    it('lists exactly the states the migration allows', () => {
        // db/migrations/20261016000001_flight_booking_lifecycle.sql CHECK constraint.
        expect([...FLIGHT_BOOKING_STATUSES].sort()).toEqual([
            'CONFIRMED', 'EXPIRED', 'FAILED', 'NEEDS_REVIEW',
            'PAYMENT_AUTHORIZED', 'PAYMENT_PENDING', 'SUPPLIER_BOOKING',
        ]);
    });
});
