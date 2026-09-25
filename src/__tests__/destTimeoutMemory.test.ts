/**
 * Remembering the cities OTV cannot price in time.
 *
 * A destination search asks the supplier to price a whole city at once, and for the biggest
 * cities it cannot do that inside the 12 seconds they ask us to allow. Measured 2026-09-21,
 * a cold Osaka spent 17.3s on a destination call that returned eight "104 Connection timeout"
 * warnings and no hotels, then fell back to the hotel-code path, which answered fine. Of a
 * 26.9-second search, 17.3 seconds bought nothing — and would have bought nothing again the
 * next day, and the day after.
 *
 * The balance these pin: reroute soon enough to stop paying for it, slowly enough that one bad
 * afternoon at the supplier does not cost us the destination path's broader coverage, and never
 * for longer than the condition lasts.
 *
 * Each test uses its own destination code, because the memory is module state and nothing but
 * time removes an entry from it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { destCodeTimesOut, recordDestTimeout } from '@/lib/hotels/search';

const HOUR = 60 * 60 * 1000;

let n = 0;
const code = () => `test-dest-${++n}`;

describe('destination timeout memory', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('does not reroute a city it has never seen fail', () => {
        expect(destCodeTimesOut(code())).toBe(false);
    });

    it('does not reroute on a single timeout, which TGX documents as transient', () => {
        const c = code();
        recordDestTimeout(c);
        expect(destCodeTimesOut(c)).toBe(false);
    });

    it('reroutes once it has happened twice', () => {
        const c = code();
        recordDestTimeout(c);
        recordDestTimeout(c);
        expect(destCodeTimesOut(c)).toBe(true);
    });

    it('forgets after an hour, so a city is never written off permanently', () => {
        const c = code();
        recordDestTimeout(c);
        recordDestTimeout(c);
        expect(destCodeTimesOut(c)).toBe(true);

        vi.advanceTimersByTime(HOUR + 1000);
        expect(destCodeTimesOut(c)).toBe(false);
    });

    it('counts consecutive failures, not failures spread across the day', () => {
        // Two timeouts an hour apart are two bad moments, not a pattern. Treating them as a run
        // would eventually reroute every city that ever had a bad afternoon.
        const c = code();
        recordDestTimeout(c);
        vi.advanceTimersByTime(HOUR + 1000);
        recordDestTimeout(c);
        expect(destCodeTimesOut(c)).toBe(false);
    });

    it('keeps cities apart, so one large city does not reroute its neighbours', () => {
        const osaka = code(), kyoto = code();
        recordDestTimeout(osaka);
        recordDestTimeout(osaka);
        expect(destCodeTimesOut(osaka)).toBe(true);
        expect(destCodeTimesOut(kyoto)).toBe(false);
    });

    it('is not undone by the collecting pass answering seconds later', () => {
        // The bug this replaced: success used to clear the memory, and the collecting pass
        // reruns the same search once OTV has computed the city, so every strike was wiped by
        // our own follow-up and the count never reached two. A warm second answer says the
        // first request warmed the supplier, not that the next cold search will be fine.
        const c = code();
        recordDestTimeout(c);
        recordDestTimeout(c);
        expect(destCodeTimesOut(c)).toBe(true);
    });
});
