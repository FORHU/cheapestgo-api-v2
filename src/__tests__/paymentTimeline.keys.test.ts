import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { keysFrom } from '@/repositories/paymentTimeline.repository';
import type { PaymentRow } from '@/repositories/payments.repository';

/**
 * Which key each log is looked up by. The two products do not agree, and a lookup under the wrong
 * one finds nothing — which in an evidence pack reads as "no email was sent".
 *
 * A hotel is logged under the reference this system minted for it (CG-…). A flight is logged under
 * the flight booking's own uuid: 17 of 17 flight emails and 8 of 8 flight refunds in the local
 * data. The PNR is the airline's record locator, which neither log ever stores.
 */

const row = (over: Partial<PaymentRow>): PaymentRow => ({
    paymentIntentId: 'pi_1', source: 'hotel_bookings', internalId: 'id-1', product: 'hotel',
    bookingReference: null, bookingStatus: null, supplierReference: null, provider: null,
    customerEmail: null, customerName: null, userId: null, amount: null, currency: null,
    createdAt: new Date('2026-11-01T00:00:00Z'), ...over,
});

describe('which key the booking_id logs are searched by', () => {
    it('uses the minted reference for a hotel', () => {
        const keys = keysFrom([row({ source: 'hotel_bookings', internalId: 'hb-1', bookingReference: 'CG-ABC123' })]);
        expect(keys.bookingIds).toEqual(['CG-ABC123']);
        expect(keys.bookingReferences).toEqual(['CG-ABC123']);
    });

    it('uses the booking uuid for a flight, not its PNR', () => {
        const keys = keysFrom([row({
            source: 'flight_bookings', product: 'flight',
            internalId: '22ae9091-fb68-4b52-b098-052339a2271a', bookingReference: 'QGUHT4',
        })]);
        expect(keys.bookingIds).toEqual(['22ae9091-fb68-4b52-b098-052339a2271a']);
        expect(keys.bookingIds).not.toContain('QGUHT4');
    });

    /** client_reference is ours. An airline's locator there would be a category error, and a wrong match. */
    it('keeps an airline PNR out of the keys that expect our own reference', () => {
        const keys = keysFrom([row({
            source: 'flight_bookings', product: 'flight', internalId: 'fb-1', bookingReference: 'QGUHT4',
        })]);
        expect(keys.bookingReferences).toEqual([]);
    });

    it('still carries a hotel pair\'s one shared reference once', () => {
        const keys = keysFrom([
            row({ source: 'bookings', internalId: 'b-1', bookingReference: 'CG-XPWT0X' }),
            row({ source: 'hotel_bookings', internalId: 'hb-1', bookingReference: 'CG-XPWT0X' }),
        ]);
        expect(keys.bookingIds).toEqual(['CG-XPWT0X']);
    });

    it('has nothing to search by for a session that never became a booking', () => {
        const keys = keysFrom([row({ source: 'booking_sessions', product: 'unknown', internalId: 's-1' })]);
        expect(keys.bookingIds).toEqual([]);
        expect(keys.sessionIds).toEqual(['s-1']);
    });
});
