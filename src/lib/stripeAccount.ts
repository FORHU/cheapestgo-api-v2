// src/lib/stripeAccount.ts
/**
 * Which Stripe account this process is talking to, and whether that is the one it should be.
 *
 * ADR-0002 stops a non-production process reaching the live hotel supplier. This is its mirror:
 * a Stripe key paired with the wrong database. Both halves of that pairing look healthy on their
 * own, which is why neither can catch it alone — a test card authorises and captures exactly as a
 * real one does, and a live key against a test database produces plausible rows all day.
 *
 * Lifted out of `lib/admin/reconciliation`, which had it first and still uses it. It is now also
 * checked once at boot, so the mismatch is found when the process starts rather than when the
 * nightly reconciler happens to run.
 */

import { stripe } from '@/lib/stripe';

export type StripeAccountCheck =
    | { ok: true;  account: string }
    | { ok: false; reason: string; account?: string };

/**
 * Compares the key's own account against `STRIPE_EXPECTED_ACCOUNT`.
 *
 * Unset means unenforced, which is the right default for local development and for a CI box that
 * has no key at all. A network failure is **not** a mismatch: the caller decides whether being
 * unable to ask is grounds for refusing, and at boot it is not.
 */
export async function assertStripeAccount(): Promise<StripeAccountCheck> {
    const expected = process.env.STRIPE_EXPECTED_ACCOUNT?.trim();
    let account: string;
    try {
        // `GET /v1/account` — the account this key belongs to. The SDK's typings only describe
        // retrieving a *connected* account by id, so the no-id form needs the cast.
        account = (await stripe.accounts.retrieve(undefined as unknown as string)).id;
    } catch (err: any) {
        return { ok: false, reason: `Could not resolve Stripe account: ${err?.message ?? 'unknown error'}` };
    }
    if (expected && account !== expected) {
        return {
            ok: false,
            account,
            reason: `Stripe account mismatch — key belongs to ${account}, expected ${expected}. `
                  + 'Refusing: the Stripe key and the database are different environments.',
        };
    }
    return { ok: true, account };
}

/**
 * The boot-time check. Returns true when the process may continue.
 *
 * **Fails closed on a mismatch, open on everything else.** A key that demonstrably belongs to the
 * wrong account is a configuration error that will take real money or hide it, and the process
 * must not serve traffic. Being *unable to ask* is a different thing: Stripe having a bad minute,
 * or no key configured at all, must not be able to take the fleet down, because that failure mode
 * is worse than the one being prevented and far more likely.
 *
 * Only meaningful when `STRIPE_EXPECTED_ACCOUNT` is set. Unset is unenforced, and says so once.
 */
export async function assertStripeAccountAtBoot(log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
}): Promise<boolean> {
    const expected = process.env.STRIPE_EXPECTED_ACCOUNT?.trim();
    const result = await assertStripeAccount();

    if (!expected) {
        // Unenforced, but the account is still named. Otherwise pinning it is a chicken-and-egg
        // problem: you cannot set the value without first asking Stripe out of band, which is a
        // step people skip — and an unpinned environment is the one this guard exists for.
        log.warn(
            '[stripe] STRIPE_EXPECTED_ACCOUNT is not set — the key is not checked against this environment.'
            + (result.ok ? ` Set it to ${result.account} to pin this one.` : ''),
        );
        return true;
    }

    if (result.ok) {
        log.info(`[stripe] key belongs to ${result.account}, as expected`);
        return true;
    }
    // A mismatch names an account; an outage does not. That is how the two are told apart.
    if (result.account) {
        log.error(`[stripe] REFUSING TO START — ${result.reason}`);
        return false;
    }
    log.warn(`[stripe] could not verify the account, continuing anyway — ${result.reason}`);
    return true;
}
