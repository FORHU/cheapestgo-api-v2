import { FlightsRepository } from '@/repositories/flights.repository';
import { getDuffelOrder } from '@/lib/flights/duffel';
import { isOrderTicketed, ticketNumbersFrom } from '@/lib/flights/duffelTickets';
import { sendFlightConfirmationEmail } from '@/lib/email/flightConfirmation';

const repo = new FlightsRepository();

/**
 * Re-reads every Duffel booking still waiting for its ticket and records the ones the
 * airline has issued since. This is the third route a ticket can arrive by, after the
 * booking call and the webhook, and the only one that catches a webhook we never received.
 */
export async function pollPendingTickets(): Promise<{ ticketed: number; unchanged: number; errors: string[] }> {
    const pending = await repo.findBookingsAwaitingTicket();

    let ticketed = 0;
    let unchanged = 0;
    const errors: string[] = [];

    for (const fb of pending) {
        try {
            const order = await getDuffelOrder(fb.provider_order_id);
            if (!isOrderTicketed(order)) {
                unchanged++;
                continue;
            }

            // The numbers, not just the status: an e-ticket number is what an airline desk asks for.
            if (!(await repo.markTicketedIfAwaiting(fb.id, ticketNumbersFrom(order)))) {
                unchanged++;
                continue;
            }
            ticketed++;
            console.log(`[cron/poll-pending-tickets] Ticketed flight booking ${fb.id}`);

            // The traveller was told the ticket was on its way. Suppressed by email_logs when
            // the webhook or the booking call already sent it.
            await sendFlightConfirmationEmail(fb.id)
                .catch((e: any) => console.error(`[cron/poll-pending-tickets] Ticket email failed for ${fb.id}:`, e?.message));
        } catch (err: any) {
            errors.push(`fb ${fb.id}: ${err.message}`);
        }
    }

    return { ticketed, unchanged, errors };
}
