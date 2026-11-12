import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MockHotelProvider } from '@/lib/hotels/providers/mock/MockHotelProvider';

/**
 * The mock supplier remembers its reservations across a restart.
 *
 * It held them in a Map, so every restart made every existing reservation uncancellable:
 * `cancelBooking` answered "Booking not found", which the error map turns into REJECTED and the
 * traveller reads as "the hotel did not accept the cancellation, so your booking has not changed
 * and you have not been refunded". In development the process restarts on every file save, so a
 * mock booking stayed cancellable only while nobody was working — which is exactly when someone
 * is trying to test cancelling.
 *
 * A real supplier does not forget a booking because we deployed. The mock stands in for one, so
 * neither does it.
 */

const STORE = path.join(os.tmpdir(), 'cheapestgo-mock-reservations.json');

/** The suite runs with NODE_ENV=test, where persistence is off by default. */
const persisting = () => new MockHotelProvider({ persist: true, currency: 'USD' });

const book = async (provider: MockHotelProvider, clientRef: string) => {
    const rates = await provider.getRates('MOCK-MNL-001', {
        checkIn: '2027-03-01', checkOut: '2027-03-02', adults: 2, children: 0,
    } as never);
    const quote = await provider.prebook({
        offerId: rates[0].offerId,
        roomName: rates[0].roomName,
        adults: 2, children: 0, currency: 'USD',
    } as never);
    return provider.book({
        prebookRef: quote.prebookRef,
        clientRef,
        guests: [{ kind: 'holder', firstName: 'Dev', lastName: 'Tester', age: 30, type: 'adult' }],
    } as never);
};

beforeEach(() => { try { fs.unlinkSync(STORE); } catch { /* not there */ } });
afterEach(() => { try { fs.unlinkSync(STORE); } catch { /* not there */ } });

describe('a reservation outliving the process that made it', () => {
    it('can be cancelled by a provider that did not take the booking', async () => {
        const booked = await book(persisting(), 'CG-RESTART1');

        // A new instance is a restarted process: nothing in memory, everything on disk.
        const afterRestart = persisting();
        const cancelled = await afterRestart.cancelBooking({
            clientRef: 'CG-RESTART1', supplierRef: booked.supplierRef,
        } as never);

        expect(cancelled.status).toBe('CANCELLED');
    });

    it('can be read back by client reference alone', async () => {
        await book(persisting(), 'CG-RESTART2');

        const found = await persisting().getBooking?.({ clientRef: 'CG-RESTART2' } as never);

        expect(found?.status).toBe('OK');
    });

    /** Cancelling twice is still refused — the state travels with the reservation, not just its id. */
    it('still refuses a second cancellation after a restart', async () => {
        const booked = await book(persisting(), 'CG-RESTART3');
        await persisting().cancelBooking({ clientRef: 'CG-RESTART3', supplierRef: booked.supplierRef } as never);

        await expect(
            persisting().cancelBooking({ clientRef: 'CG-RESTART3', supplierRef: booked.supplierRef } as never),
        ).rejects.toMatchObject({ code: 'REJECTED' });
    });

    /** Two processes must not mint the same supplier reference for different stays. */
    it('does not reissue a supplier reference it has already given out', async () => {
        const first  = await book(persisting(), 'CG-SEQ1');
        const second = await book(persisting(), 'CG-SEQ2');

        expect(second.supplierRef).not.toBe(first.supplierRef);
    });
});

/**
 * The reference pair, held to each other.
 *
 * Numbering restarts from one whenever the store is empty, so a supplier reference from a run
 * whose reservations were never written down names a later, unrelated reservation. Matching on it
 * alone would cancel a live stay while reporting success for a dead one.
 */
describe('a supplier reference left over from an earlier run', () => {
    it('does not cancel the reservation that reused its number', async () => {
        const live = await book(persisting(), 'CG-LIVE');

        await expect(
            persisting().cancelBooking({ clientRef: 'CG-DEAD-FROM-LAST-RUN', supplierRef: live.supplierRef } as never),
        ).rejects.toMatchObject({ code: 'REJECTED' });

        const still = await persisting().getBooking?.({ clientRef: 'CG-LIVE' } as never);
        expect(still?.status).toBe('OK');
    });

    it('is still honoured when the two references agree', async () => {
        const live = await book(persisting(), 'CG-AGREE');

        const cancelled = await persisting().cancelBooking({
            clientRef: 'CG-AGREE', supplierRef: live.supplierRef,
        } as never);

        expect(cancelled.status).toBe('CANCELLED');
    });
});

describe('when the store cannot be used', () => {
    /** A suite that shared reservations between files would be worse than one that forgets. */
    it('keeps reservations in memory when persistence is off', async () => {
        const provider = new MockHotelProvider({ persist: false, currency: 'USD' });
        await book(provider, 'CG-MEMORY1');

        expect(fs.existsSync(STORE)).toBe(false);
    });

    /**
     * The server passes no `persist` option at all, so the default is the only setting that
     * matters in development — and it is the one the suite would otherwise never exercise.
     */
    it('persists by default outside the test environment', async () => {
        const env = process.env.NODE_ENV;
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockstore-'));
        const previous = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
        process.env.NODE_ENV = 'development';
        process.env.TMPDIR = process.env.TEMP = process.env.TMP = dir;
        try {
            await book(new MockHotelProvider({ currency: 'USD' }), 'CG-DEFAULT');

            expect(fs.existsSync(path.join(dir, 'cheapestgo-mock-reservations.json'))).toBe(true);
        } finally {
            process.env.NODE_ENV = env;
            for (const [k, v] of Object.entries(previous)) {
                if (v === undefined) delete process.env[k]; else process.env[k] = v;
            }
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    /** An unreadable file is a mock with no history, never a mock that refuses to work. */
    it('starts empty rather than throwing when the file is corrupt', async () => {
        fs.writeFileSync(STORE, 'not json at all');

        const provider = persisting();
        const booked = await book(provider, 'CG-CORRUPT');

        expect(booked.status).toBe('OK');
    });
});
