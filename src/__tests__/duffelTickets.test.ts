import { describe, it, expect } from 'vitest';
import { ticketNumbersFrom, buildSeatMap, isOrderTicketed } from '@/lib/flights/duffelTickets';

/**
 * What a ticketed booking records. The e-ticket number is what an airline asks for at the
 * desk, so a booking marked ticketed with nothing readable against it is the worst outcome
 * here — worse than one still marked awaiting_ticket.
 */

const order = (patch: Record<string, any> = {}) => ({
    documents: [
        { type: 'electronic_ticket', unique_identifier: '0797586589419' },
        { type: 'electronic_ticket', unique_identifier: '0797586589420' },
    ],
    passengers: [{ id: 'pas_1' }, { id: 'pas_2' }],
    ...patch,
});

describe('ticketNumbersFrom', () => {
    it('reads the number off unique_identifier', () => {
        // `document_number` is what two call sites read, and Duffel does not send it: the map
        // yielded [undefined, undefined], which is length 2, so "no tickets yet" never fired
        // and the booking was marked ticketed with nulls recorded against it.
        expect(ticketNumbersFrom(order())).toEqual(['0797586589419', '0797586589420']);
    });

    it('counts nothing when the documents carry no readable number', () => {
        const unreadable = order({ documents: [{ type: 'electronic_ticket', document_number: undefined }] });
        expect(ticketNumbersFrom(unreadable)).toEqual([]);
    });

    it('ignores documents that are not e-tickets', () => {
        const mixed = order({ documents: [
            { type: 'receipt', unique_identifier: 'RCPT-1' },
            { type: 'electronic_ticket', unique_identifier: 'T-1' },
        ] });
        expect(ticketNumbersFrom(mixed)).toEqual(['T-1']);
    });

    it('answers an order with no documents at all', () => {
        expect(ticketNumbersFrom({})).toEqual([]);
        expect(ticketNumbersFrom(null)).toEqual([]);
    });
});

/**
 * The ticket poll's question: has the airline issued the ticket? The same answer the booking
 * path gives (an e-ticket number on the order), so a booking cannot read as waiting to one
 * route and ticketed to another.
 */
describe('isOrderTicketed', () => {
    it('is ticketed once an e-ticket number is on the order', () => {
        expect(isOrderTicketed(order())).toBe(true);
    });

    it('is not ticketed while the order carries no e-ticket', () => {
        expect(isOrderTicketed(order({ documents: [] }))).toBe(false);
    });

    it('does not count a document that is not an e-ticket', () => {
        // An EMD for a paid bag can be issued on its own; it is not a ticket to fly on.
        const emdOnly = order({ documents: [{ type: 'electronic_miscellaneous_document_associated', unique_identifier: 'EMD-1' }] });
        expect(isOrderTicketed(emdOnly)).toBe(false);
    });

    it('ignores metadata, which is ours and says nothing about ticketing', () => {
        // The poll used to read `metadata.payment_status === "fully_paid"`. Duffel's metadata
        // is the key-value bag a client sets, and this codebase never sets that key.
        expect(isOrderTicketed(order({ documents: [], metadata: { payment_status: 'fully_paid' } }))).toBe(false);
    });

    it('is not ticketed once the order is cancelled, even with its tickets still listed', () => {
        // Telling a traveller their ticket is ready for a flight that was cancelled is worse
        // than saying nothing; the cancellation sync settles those.
        expect(isOrderTicketed(order({ cancelled_at: '2026-11-09T10:00:00Z' }))).toBe(false);
    });
});

describe('buildSeatMap', () => {
    it('joins the seats a passenger was given across legs', () => {
        const withSeats = order({
            slices: [
                { segments: [{ passengers: [{ passenger_id: 'pas_1', seat: { designator: '14A' } }] }] },
                { segments: [{ passengers: [{ passenger_id: 'pas_1', seat: { designator: '22C' } }] }] },
            ],
        });
        expect(buildSeatMap(withSeats).get('pas_1')).toBe('14A / 22C');
    });

    it('is empty when the airline assigned nothing, which is the usual case', () => {
        expect(buildSeatMap(order()).size).toBe(0);
    });

    it('skips a seat with no passenger to attach it to', () => {
        const orphan = order({ slices: [{ segments: [{ passengers: [{ seat: { designator: '1A' } }] }] }] });
        expect(buildSeatMap(orphan).size).toBe(0);
    });
});
