import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The boot-time Stripe account guard (ADR-0002, amended).
 *
 * ADR-0002 stops a non-production process reaching the live hotel supplier. This is its mirror:
 * a Stripe key paired with the wrong database. On 2026-11-03 a laptop with `sk_test` and live
 * TravelgateX keys booked a real room in Kyoto; the shape this prevents is the other one, a live
 * key against a test database, which is what `v2.cheapestgo.com` has today.
 *
 * The asymmetry these tests pin down: **a mismatch stops the process, an outage does not.** Being
 * unable to ask Stripe is far more likely than a genuine mismatch, and taking the fleet down over
 * a supplier's bad minute would be the worse failure.
 */

const stripeMock = vi.hoisted(() => ({ retrieve: vi.fn() }));
vi.mock('@/lib/stripe', () => ({ stripe: { accounts: { retrieve: stripeMock.retrieve } } }));

import { assertStripeAccount, assertStripeAccountAtBoot } from '@/lib/stripeAccount';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const ORIGINAL = process.env.STRIPE_EXPECTED_ACCOUNT;

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STRIPE_EXPECTED_ACCOUNT;
});

afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.STRIPE_EXPECTED_ACCOUNT;
    else process.env.STRIPE_EXPECTED_ACCOUNT = ORIGINAL;
});

describe('asserting the account', () => {
    it('is satisfied when the key belongs to the expected account', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_C6cOjdwOIC';
        stripeMock.retrieve.mockResolvedValue({ id: 'acct_C6cOjdwOIC' });

        await expect(assertStripeAccount()).resolves.toEqual({ ok: true, account: 'acct_C6cOjdwOIC' });
    });

    it('reports the account it actually found, so the message says which way round it is', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_CJsDyAXJ3J';
        stripeMock.retrieve.mockResolvedValue({ id: 'acct_C6cOjdwOIC' });

        const result = await assertStripeAccount();

        expect(result.ok).toBe(false);
        expect(result).toMatchObject({ account: 'acct_C6cOjdwOIC' });
        if (!result.ok) {
            expect(result.reason).toContain('acct_C6cOjdwOIC');
            expect(result.reason).toContain('acct_CJsDyAXJ3J');
        }
    });

    /** Unset is unenforced, which is the right default for a laptop and for a CI box with no key. */
    it('passes when nothing is expected, whatever the key is', async () => {
        stripeMock.retrieve.mockResolvedValue({ id: 'acct_anything' });

        await expect(assertStripeAccount()).resolves.toMatchObject({ ok: true });
    });

    it('names no account when Stripe could not be reached', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_C6cOjdwOIC';
        stripeMock.retrieve.mockRejectedValue(new Error('ECONNRESET'));

        const result = await assertStripeAccount();

        expect(result.ok).toBe(false);
        expect(result).not.toHaveProperty('account');
    });
});

describe('the boot check', () => {
    it('refuses to start when the key demonstrably belongs to the wrong account', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_CJsDyAXJ3J';
        stripeMock.retrieve.mockResolvedValue({ id: 'acct_C6cOjdwOIC' });

        await expect(assertStripeAccountAtBoot(log)).resolves.toBe(false);
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('REFUSING TO START'));
    });

    it('starts when the key is the right one', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_C6cOjdwOIC';
        stripeMock.retrieve.mockResolvedValue({ id: 'acct_C6cOjdwOIC' });

        await expect(assertStripeAccountAtBoot(log)).resolves.toBe(true);
        expect(log.error).not.toHaveBeenCalled();
    });

    /**
     * The whole reason this is not a hard dependency. A Stripe outage that could not take the API
     * down before must not be able to now.
     */
    it('starts anyway when Stripe cannot be reached, and says so', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_C6cOjdwOIC';
        stripeMock.retrieve.mockRejectedValue(new Error('503 Service Unavailable'));

        await expect(assertStripeAccountAtBoot(log)).resolves.toBe(true);
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('could not verify'));
        expect(log.error).not.toHaveBeenCalled();
    });

    /** Unset must not silently look like a passing check. */
    it('starts when nothing is expected, but warns that it is unenforced', async () => {
        stripeMock.retrieve.mockResolvedValue({ id: 'acct_C6cOjdwOIC' });

        await expect(assertStripeAccountAtBoot(log)).resolves.toBe(true);
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('not set'));
    });

    /**
     * Pinning the account would otherwise be a chicken-and-egg problem: you cannot set the value
     * without asking Stripe out of band first, which is a step people skip — leaving the
     * environment unpinned, which is the state this guard exists for.
     */
    it('names the account to pin, so the value does not have to be hunted for', async () => {
        stripeMock.retrieve.mockResolvedValue({ id: 'acct_CJsDyAXJ3J' });

        await assertStripeAccountAtBoot(log);

        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Set it to acct_CJsDyAXJ3J'));
    });

    /** An unreachable Stripe must not turn an unenforced boot into a confusing one. */
    it('still starts, and suggests nothing, when the account cannot be read', async () => {
        stripeMock.retrieve.mockRejectedValue(new Error('ECONNRESET'));

        await expect(assertStripeAccountAtBoot(log)).resolves.toBe(true);
        expect(log.warn).toHaveBeenCalledWith(expect.not.stringContaining('Set it to'));
        expect(log.error).not.toHaveBeenCalled();
    });

    it('treats whitespace as unset rather than as an account nothing can match', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = '   ';
        stripeMock.retrieve.mockResolvedValue({ id: 'acct_C6cOjdwOIC' });

        await expect(assertStripeAccountAtBoot(log)).resolves.toBe(true);
        expect(log.error).not.toHaveBeenCalled();
    });
});

/**
 * On 2026-11-19 the account id was pasted into STRIPE_SECRET_KEY on production. Stripe answered
 * "Invalid API Key provided", the guard logged `continuing anyway`, and v2 served traffic with
 * hotel booking enabled and no usable key until someone read the logs.
 *
 * The asymmetry above still holds — an outage must not take the fleet down — but a key Stripe
 * actively rejects is not an outage. It is a configuration error that will serve every request
 * wrongly until a human changes it, which is exactly what the mismatch branch already refuses for.
 */
describe('a key Stripe rejects', () => {
    const stripeError = (type: string) => Object.assign(new Error('Invalid API Key provided: acct_1TN***'), { type });

    it('refuses to start, rather than warning and serving', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_1TN519C6cOjdwOIC';
        stripeMock.retrieve.mockRejectedValue(stripeError('StripeAuthenticationError'));

        await expect(assertStripeAccountAtBoot(log)).resolves.toBe(false);
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('REFUSING TO START'));
    });

    it('refuses on a permission error too — a restricted key cannot read the account it is pinned to', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_1TN519C6cOjdwOIC';
        stripeMock.retrieve.mockRejectedValue(stripeError('StripePermissionError'));

        await expect(assertStripeAccountAtBoot(log)).resolves.toBe(false);
    });

    /** The whole point of the distinction: Stripe having a bad minute still lets the process up. */
    it('does not refuse when Stripe is merely unreachable', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_1TN519C6cOjdwOIC';
        stripeMock.retrieve.mockRejectedValue(stripeError('StripeConnectionError'));

        await expect(assertStripeAccountAtBoot(log)).resolves.toBe(true);
        expect(log.error).not.toHaveBeenCalled();
    });

    /** An error with no `type` at all — a plain throw — is treated as an outage, the forgiving side. */
    it('treats an unclassified failure as an outage', async () => {
        process.env.STRIPE_EXPECTED_ACCOUNT = 'acct_1TN519C6cOjdwOIC';
        stripeMock.retrieve.mockRejectedValue(new Error('ECONNRESET'));

        await expect(assertStripeAccountAtBoot(log)).resolves.toBe(true);
        expect(log.error).not.toHaveBeenCalled();
    });

    /** Unset stays unenforced: a dev box with no key must not be stopped from starting. */
    it('still starts with no expectation set, even when the key is rejected', async () => {
        stripeMock.retrieve.mockRejectedValue(stripeError('StripeAuthenticationError'));

        await expect(assertStripeAccountAtBoot(log)).resolves.toBe(true);
        expect(log.error).not.toHaveBeenCalled();
    });
});
