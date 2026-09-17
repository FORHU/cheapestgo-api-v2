/**
 * The cancellation terms, in a sentence a guest can act on.
 *
 * Built from the snapshot the booking is actually held to (ADR-0023) rather than re-derived
 * from the raw supplier policy, so the email cannot promise something a later cancellation
 * will refuse. A rate that is free until a date says the date: "free cancellation" with no
 * deadline is the sentence that produced the complaints.
 */

import type { PolicySnapshotInput } from '@/lib/policies/snapshotFromPolicy';

export function policyEmailText(terms: Pick<PolicySnapshotInput, 'policyType' | 'freeCancelDeadline'>): string {
    const deadline = terms.freeCancelDeadline
        ? terms.freeCancelDeadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;

    switch (terms.policyType) {
        case 'free_cancellation':
            return 'This rate can be cancelled free of charge. Cancel from your trips page at any time before check-in.';
        case 'tiered':
            return deadline
                ? `This rate is free to cancel until ${deadline}. After that a cancellation fee applies, and the amount depends on how close to check-in you cancel.`
                : 'This rate is refundable, but a cancellation fee applies depending on how close to check-in you cancel. Your trips page shows the current amount.';
        case 'non_refundable':
        default:
            return 'This is a non-refundable rate. It cannot be cancelled or changed for a refund, though you can still contact support if your plans change.';
    }
}
