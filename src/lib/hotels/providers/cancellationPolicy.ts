// src/lib/hotels/providers/cancellationPolicy.ts
import type { CancellationTerms } from './types';

/** The shape stored with a booking and read by the policy snapshot and the cancellation engine. */
export interface LegacyCancellationPolicies {
    refundableTag?:     'RFN' | 'NRFN';
    cancelPolicyInfos?: Array<{ cancelTime: string; amount: number; currency: string; type: string }>;
}

/**
 * The policy a prebook response carries to the checkout, and which `confirm` echoes back.
 *
 * A refundable rate with penalty steps gets a leading zero-amount entry at the first deadline —
 * "free until here" — which is what the checkout and the snapshot builder both read the free
 * window from. Lifted unchanged from the service so the wire does not move.
 */
export function toPrebookPolicyWire(terms: CancellationTerms | null | undefined): LegacyCancellationPolicies {
    if (!terms) return {};

    const infos: NonNullable<LegacyCancellationPolicies['cancelPolicyInfos']> = [];
    if (terms.refundable && terms.penalties.length > 0) {
        const first = terms.penalties[0];
        infos.push({ cancelTime: first.deadline, amount: 0, currency: first.currency || 'USD', type: 'AMOUNT' });
    }
    for (const p of terms.penalties) {
        infos.push({ cancelTime: p.deadline, amount: p.value ?? 0, currency: p.currency || 'USD', type: p.type || 'AMOUNT' });
    }
    return { refundableTag: terms.refundable ? 'RFN' : 'NRFN', cancelPolicyInfos: infos };
}

/**
 * The policy recorded when the supplier's own booking response is all there is — a booking taken
 * without a prebook policy. No leading marker, and a missing currency falls back to the one the
 * booking was stored in rather than USD.
 */
export function toStoredPolicyWire(
    terms: CancellationTerms | null | undefined,
    fallbackCurrency: string,
): LegacyCancellationPolicies | null {
    if (!terms) return null;

    return {
        refundableTag: terms.refundable ? 'RFN' : 'NRFN',
        cancelPolicyInfos: terms.penalties.map((p) => ({
            cancelTime: p.deadline,
            amount:     p.value ?? 0,
            currency:   p.currency || fallbackCurrency,
            type:       p.type || 'AMOUNT',
        })),
    };
}
