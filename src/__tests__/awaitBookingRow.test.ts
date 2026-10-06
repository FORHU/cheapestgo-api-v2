import { describe, it, expect, vi } from 'vitest';
import { awaitBookingRow, type AwaitedBooking } from '@/lib/flights/awaitBookingRow';

/**
 * The race this closes: the webhook and the confirm fallback both finish a booking, and the
 * loser used to be told the card was not charged while the winner was issuing the ticket.
 */

const noSleep = vi.fn(async () => {});
const row: AwaitedBooking = { id: 'bk-1', pnr: 'PNR1', status: 'ticketed' };

/** A reader that answers with each step in turn; `throws` stands for a transient failure. */
function reader(sequence: Array<{ row?: AwaitedBooking | null; throws?: boolean }>) {
    let call = 0;
    const read = async () => {
        const step = sequence[Math.min(call, sequence.length - 1)];
        call++;
        if (step.throws) throw new Error('connection reset');
        return step.row ?? null;
    };
    return Object.assign(read, { calls: () => call });
}

describe('awaitBookingRow', () => {
    it('returns immediately when the row is already there', async () => {
        const read = reader([{ row }]);
        await expect(awaitBookingRow(read, 'sess-1', { sleep: noSleep })).resolves.toEqual(row);
        expect(read.calls()).toBe(1);
        expect(noSleep).not.toHaveBeenCalled();
    });

    it('waits out the other path and returns what it wrote', async () => {
        const read = reader([{ row: null }, { row: null }, { row }]);
        await expect(awaitBookingRow(read, 'sess-1', { sleep: noSleep })).resolves.toEqual(row);
        expect(read.calls()).toBe(3);
    });

    it('returns a row that records a deliberate failure, rather than waiting it out', async () => {
        // A row without a PNR is the other path saying the booking failed. That is an answer.
        const failed: AwaitedBooking = { id: 'bk-2', pnr: null, status: 'failed' };
        const read = reader([{ row: failed }]);
        await expect(awaitBookingRow(read, 'sess-1', { sleep: noSleep })).resolves.toEqual(failed);
    });

    it('keeps trying through a transient database error', async () => {
        const read = reader([{ throws: true }, { row }]);
        await expect(awaitBookingRow(read, 'sess-1', { sleep: noSleep })).resolves.toEqual(row);
    });

    it('gives up after the allotted attempts, and only then is the failure real', async () => {
        const read = reader([{ row: null }]);
        await expect(awaitBookingRow(read, 'sess-1', { attempts: 3, sleep: noSleep })).resolves.toBeNull();
        expect(read.calls()).toBe(3);
    });

    it('does not sleep after the last attempt', async () => {
        const sleep = vi.fn(async () => {});
        await awaitBookingRow(reader([{ row: null }]), 'sess-1', { attempts: 2, sleep });
        expect(sleep).toHaveBeenCalledTimes(1);
    });
});
