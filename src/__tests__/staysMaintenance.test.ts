import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The stub is a plain function rather than `vi.fn()` with `mockResolvedValue`/
 * `mockRejectedValue`: those build their promise when the mock is *configured*, so a value
 * that throws on access, or a rejection, escapes at the setup line instead of inside the
 * call being tested — which is the opposite of what the failure case here needs to prove.
 */
let outcome: { ok: true; row: unknown } | { ok: false } = { ok: true, row: null };
const calls: unknown[] = [];

vi.mock('@/lib/prisma', () => ({
    prisma: {
        admin_settings: {
            async findUnique(args: unknown) {
                calls.push(args);
                if (!outcome.ok) throw new Error('connection terminated');
                return outcome.row;
            },
        },
    },
}));

import { staysUnderMaintenance } from '@/lib/maintenance';

const stored = (row: unknown) => { outcome = { ok: true, row }; };

/**
 * The switch that takes hotel search and booking off sale.
 *
 * Two failure directions, and they are not symmetric. Failing *open* — selling stays the
 * supplier cannot deliver — is the one that reaches customers; failing *closed* over a
 * database blip costs sales for no reason. Both are pinned below.
 *
 * The string case is not hypothetical. v1 stored this same flag as the JSON string "true",
 * where `=== true` is false while `if (value)` is true, so the admin toggle appeared to work
 * and the site kept searching. Pinned here so v2 cannot inherit it.
 */
describe('staysUnderMaintenance', () => {
    beforeEach(() => { outcome = { ok: true, row: null }; calls.length = 0; });

    it('is on for a real boolean true', async () => {
        stored({ value: true });
        expect(await staysUnderMaintenance()).toBe(true);
    });

    it('is on for the string "true", which is how v1 stored it', async () => {
        stored({ value: 'true' });
        expect(await staysUnderMaintenance()).toBe(true);
    });

    it.each([
        ['boolean false', false],
        ['string "false"', 'false'],
        ['empty string', ''],
        ['a number', 1],
        ['an object', { on: true }],
    ])('is off for %s', async (_label, value) => {
        stored({ value });
        expect(await staysUnderMaintenance()).toBe(false);
    });

    it('is off when the key has never been set', async () => {
        stored(null);
        expect(await staysUnderMaintenance()).toBe(false);
    });

    it('is off when the database cannot be read, rather than dark', async () => {
        // A settings outage is not a supplier outage. Taking stays down because one row
        // could not be fetched turns a database blip into lost sales.
        outcome = { ok: false };
        expect(await staysUnderMaintenance()).toBe(false);
    });

    it('reads one row by key, not the whole settings table', async () => {
        // This sits on the search path; `getSettings()` reads every row.
        stored({ value: false });
        await staysUnderMaintenance();
        expect(calls).toEqual([expect.objectContaining({ where: { key: 'stays_maintenance' } })]);
    });
});
