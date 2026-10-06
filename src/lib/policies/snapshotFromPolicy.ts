/**
 * The cancellation terms a booking is held to, derived from the policy stored with it.
 *
 * One derivation, used in two places: `confirmBooking`, when the terms are first recorded,
 * and the backfill for bookings taken before snapshots existed. If those two worked the terms
 * out separately, a backfilled booking could be held to different terms than the same booking
 * confirmed today — and a cancellation refunds what the terms allow (ADR-0023), so the
 * difference would be money.
 *
 * Kept free of Prisma so the rule can be tested on its own.
 */

export interface StoredCancelPolicy {
    refundableTag?: string;
    cancelPolicyInfos?: Array<{ cancelTime?: string; amount?: number | string; currency?: string; type?: string }>;
}

export interface PolicySnapshotInput {
    policyType:         'free_cancellation' | 'non_refundable' | 'tiered';
    summary:            string;
    refundableTag:      'RFN' | 'NRFN';
    freeCancelDeadline: Date | null;
    tiers: Array<{
        cancelDeadline: Date;
        penaltyAmount:  number;
        penaltyType:    'percent' | 'fixed';
        currency:       string;
    }>;
}

/**
 * @param policy          The stored policy — `bookings.cancellation_policy`, or the one prebook
 *                        returned. `RFN`/`REFUNDABLE` mark a refundable rate.
 * @param defaultCurrency Used for a penalty step that did not say its own currency.
 */
export function snapshotFromPolicy(
    policy: StoredCancelPolicy | null | undefined,
    defaultCurrency: string,
): PolicySnapshotInput {
    const tag = String(policy?.refundableTag ?? '').toUpperCase();
    const isRefundable = tag === 'RFN' || tag === 'REFUNDABLE';

    // The supplier's penalty steps, earliest deadline first. A refundable rate is rarely
    // refundable outright — it is usually free until some date and then charged, and those
    // steps are what a cancellation is judged against. A step with no readable deadline
    // cannot be judged against anything, so it is dropped rather than guessed at.
    const tiers = (policy?.cancelPolicyInfos ?? [])
        .map((p) => ({
            cancelDeadline: p.cancelTime ? new Date(p.cancelTime) : null,
            penaltyAmount:  Number(p.amount) || 0,
            penaltyType:    (String(p.type || 'fixed').toUpperCase() === 'PERCENT' ? 'percent' : 'fixed') as 'percent' | 'fixed',
            currency:       p.currency || defaultCurrency,
        }))
        .filter((t): t is PolicySnapshotInput['tiers'][number] =>
            t.cancelDeadline instanceof Date && !isNaN(t.cancelDeadline.getTime()))
        .sort((a, b) => a.cancelDeadline.getTime() - b.cancelDeadline.getTime());

    // A refundable rate with penalty steps is 'tiered', not 'free_cancellation'. Collapsing
    // it to the latter is what let a cancellation past the free window be refunded in full:
    // the terms said "free", and nothing recorded the steps.
    const policyType: PolicySnapshotInput['policyType'] =
        !isRefundable  ? 'non_refundable'
        : tiers.length ? 'tiered'
        : 'free_cancellation';

    return {
        policyType,
        summary:            isRefundable ? 'Refundable rate' : 'Non-refundable rate',
        refundableTag:      isRefundable ? 'RFN' : 'NRFN',
        // The moment the rate stops being free: the earliest penalty deadline.
        freeCancelDeadline: isRefundable && tiers.length ? tiers[0].cancelDeadline : null,
        tiers,
    };
}
