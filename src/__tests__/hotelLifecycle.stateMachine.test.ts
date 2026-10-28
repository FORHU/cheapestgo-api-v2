import { describe, it, expect } from 'vitest';
import {
    HOTEL_BOOKING_STATUSES,
    InvalidTransitionError,
    allowedTransitions,
    assertTransition,
    canTransition,
    holdsAuthorisation,
    isHotelBookingStatus,
    isTerminal,
    projectLegacyStatus,
    type HotelBookingStatus,
} from '@/lib/hotels/lifecycle/stateMachine';

describe('hotel booking state machine', () => {
    it('walks the happy path in order', () => {
        const path: HotelBookingStatus[] = [
            'DRAFT', 'PREBOOKED', 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', 'CONFIRMED',
        ];
        for (let i = 0; i < path.length - 1; i++) {
            expect(canTransition(path[i], path[i + 1])).toBe(true);
        }
    });

    it('cannot skip a step or go backwards', () => {
        expect(canTransition('PREBOOKED', 'PAYMENT_AUTHORIZED')).toBe(false);
        expect(canTransition('PAYMENT_PENDING', 'SUPPLIER_BOOKING')).toBe(false);
        expect(canTransition('CONFIRMED', 'PAYMENT_AUTHORIZED')).toBe(false);
        expect(canTransition('SUPPLIER_BOOKING', 'PAYMENT_AUTHORIZED')).toBe(false);
    });

    it('lets an attempt fail or expire only before the supplier is asked', () => {
        expect(canTransition('PAYMENT_PENDING', 'EXPIRED')).toBe(true);
        expect(canTransition('PAYMENT_AUTHORIZED', 'EXPIRED')).toBe(true);
        expect(canTransition('SUPPLIER_BOOKING', 'EXPIRED')).toBe(false);
        expect(canTransition('CONFIRMED', 'FAILED')).toBe(false);
    });

    it('sends an unanswered supplier call to review, never straight to failure by itself', () => {
        expect(canTransition('SUPPLIER_BOOKING', 'NEEDS_REVIEW')).toBe(true);
        // A person (or a read-back) resolves it either way.
        expect(canTransition('NEEDS_REVIEW', 'CONFIRMED')).toBe(true);
        expect(canTransition('NEEDS_REVIEW', 'FAILED')).toBe(true);
    });

    it('models cancellation and its refund, including a retried refund', () => {
        expect(canTransition('CONFIRMED', 'CANCEL_REQUESTED')).toBe(true);
        expect(canTransition('CANCEL_REQUESTED', 'CONFIRMED')).toBe(true);   // supplier refused
        expect(canTransition('CANCEL_REQUESTED', 'CANCELLED')).toBe(true);
        expect(canTransition('CANCELLED', 'REFUND_PENDING')).toBe(true);
        expect(canTransition('REFUND_PENDING', 'REFUNDED')).toBe(true);
        expect(canTransition('REFUND_PENDING', 'REFUND_FAILED')).toBe(true);
        expect(canTransition('REFUND_FAILED', 'REFUND_PENDING')).toBe(true);
    });

    it('has terminal states that go nowhere', () => {
        for (const s of ['FAILED', 'EXPIRED', 'REFUNDED'] as const) {
            expect(isTerminal(s)).toBe(true);
            expect(allowedTransitions(s)).toEqual([]);
        }
        expect(isTerminal('CONFIRMED')).toBe(false);
    });

    it('only transitions to states that exist, and every state has an entry', () => {
        for (const from of HOTEL_BOOKING_STATUSES) {
            for (const to of allowedTransitions(from)) {
                expect(isHotelBookingStatus(to)).toBe(true);
            }
        }
    });

    it('asserts: silent when legal, a typed error when not', () => {
        expect(() => assertTransition('PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING')).not.toThrow();
        try {
            assertTransition('CONFIRMED', 'PREBOOKED');
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(InvalidTransitionError);
            expect((err as InvalidTransitionError).from).toBe('CONFIRMED');
            expect((err as InvalidTransitionError).to).toBe('PREBOOKED');
        }
    });

    it('knows which states hold a payment authorisation', () => {
        expect(holdsAuthorisation('PAYMENT_AUTHORIZED')).toBe(true);
        expect(holdsAuthorisation('SUPPLIER_BOOKING')).toBe(true);
        expect(holdsAuthorisation('NEEDS_REVIEW')).toBe(true);
        expect(holdsAuthorisation('PAYMENT_PENDING')).toBe(false);
        expect(holdsAuthorisation('CONFIRMED')).toBe(false);
    });

    it('recognises its own statuses and nothing else', () => {
        expect(isHotelBookingStatus('CONFIRMED')).toBe(true);
        expect(isHotelBookingStatus('confirmed')).toBe(false);
        expect(isHotelBookingStatus(undefined)).toBe(false);
    });
});

describe('legacy status projection', () => {
    it.each([
        ['CONFIRMED',        'confirmed'],
        ['CANCEL_REQUESTED', 'confirmed'],
        ['CANCELLED',        'cancelled'],
        ['REFUND_PENDING',   'cancelled'],
        ['REFUNDED',         'cancelled_refunded'],
        ['REFUND_FAILED',    'cancelled_refund_failed'],
    ] as const)('%s reads %s', (status, legacy) => {
        expect(projectLegacyStatus(status)).toBe(legacy);
    });

    it.each(['DRAFT', 'PREBOOKED', 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING', 'FAILED', 'EXPIRED', 'NEEDS_REVIEW'] as const)(
        '%s is not a trip, so it has no bookings status',
        (status) => {
            expect(projectLegacyStatus(status)).toBeNull();
        },
    );
});
