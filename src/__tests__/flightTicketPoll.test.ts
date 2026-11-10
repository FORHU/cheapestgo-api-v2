/**
 * The ticket poll: the route that catches a ticket issued after the booking call returned,
 * when the webhook that should have said so never arrived.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
    findBookingsAwaitingTicket: vi.fn(),
    markTicketedIfAwaiting:     vi.fn(),
}));
const getDuffelOrder = vi.hoisted(() => vi.fn());
const sendFlightConfirmationEmail = vi.hoisted(() => vi.fn());

vi.mock('@/repositories/flights.repository', () => ({ FlightsRepository: vi.fn(function () { return repo; }) }));
vi.mock('@/lib/flights/duffel', () => ({ getDuffelOrder }));
vi.mock('@/lib/email/flightConfirmation', () => ({ sendFlightConfirmationEmail }));

import { pollPendingTickets } from '@/services/flightTicketPoll';

const waiting = { id: 'fb-1', provider_order_id: 'ord_1', user_id: 'u-1' };
const issued  = { id: 'ord_1', documents: [{ type: 'electronic_ticket', unique_identifier: '0797586589419' }] };

beforeEach(() => {
    vi.clearAllMocks();
    repo.findBookingsAwaitingTicket.mockResolvedValue([waiting]);
    repo.markTicketedIfAwaiting.mockResolvedValue(true);
    sendFlightConfirmationEmail.mockResolvedValue(undefined);
});

describe('pollPendingTickets', () => {
    it('marks a waiting booking ticketed with its numbers and sends the ticket email', async () => {
        getDuffelOrder.mockResolvedValue(issued);

        const result = await pollPendingTickets();

        expect(getDuffelOrder).toHaveBeenCalledWith('ord_1');
        expect(repo.markTicketedIfAwaiting).toHaveBeenCalledWith('fb-1', ['0797586589419']);
        expect(sendFlightConfirmationEmail).toHaveBeenCalledWith('fb-1');
        expect(result).toEqual({ ticketed: 1, unchanged: 0, errors: [] });
    });

    it('leaves a booking alone while Duffel has not issued the ticket', async () => {
        getDuffelOrder.mockResolvedValue({ id: 'ord_1', documents: [] });

        const result = await pollPendingTickets();

        expect(repo.markTicketedIfAwaiting).not.toHaveBeenCalled();
        expect(sendFlightConfirmationEmail).not.toHaveBeenCalled();
        expect(result).toEqual({ ticketed: 0, unchanged: 1, errors: [] });
    });

    it('never tells a traveller their ticket is ready for an order Duffel cancelled', async () => {
        getDuffelOrder.mockResolvedValue({ ...issued, cancelled_at: '2026-11-09T10:00:00Z' });

        const result = await pollPendingTickets();

        expect(repo.markTicketedIfAwaiting).not.toHaveBeenCalled();
        expect(sendFlightConfirmationEmail).not.toHaveBeenCalled();
        expect(result.unchanged).toBe(1);
    });

    it('sends nothing when the booking stopped waiting while Duffel was being read', async () => {
        // Cancelled by the customer, or ticketed by the webhook or an overlapping run.
        getDuffelOrder.mockResolvedValue(issued);
        repo.markTicketedIfAwaiting.mockResolvedValue(false);

        const result = await pollPendingTickets();

        expect(sendFlightConfirmationEmail).not.toHaveBeenCalled();
        expect(result).toEqual({ ticketed: 0, unchanged: 1, errors: [] });
    });

    it('reports an order it could not read and carries on with the rest', async () => {
        repo.findBookingsAwaitingTicket.mockResolvedValue([waiting, { ...waiting, id: 'fb-2', provider_order_id: 'ord_2' }]);
        getDuffelOrder
            .mockRejectedValueOnce(new Error('Duffel order fetch failed 404'))
            .mockResolvedValueOnce({ ...issued, id: 'ord_2' });

        const result = await pollPendingTickets();

        expect(result.errors).toEqual(['fb fb-1: Duffel order fetch failed 404']);
        expect(result.ticketed).toBe(1);
        expect(repo.markTicketedIfAwaiting).toHaveBeenCalledWith('fb-2', ['0797586589419']);
    });

    it('still counts the booking ticketed when the email fails', async () => {
        // The ticket is real either way; a failed send leaves an email_logs row for the retry job.
        getDuffelOrder.mockResolvedValue(issued);
        sendFlightConfirmationEmail.mockRejectedValue(new Error('resend down'));

        const result = await pollPendingTickets();

        expect(result).toEqual({ ticketed: 1, unchanged: 0, errors: [] });
    });
});
