/**
 * Policy normalization + cancellation fee calculation.
 * Ported from monolith's policy-normalizer.ts and cancellation/calculateFee.ts.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookingPolicyType = 'free_cancellation' | 'non_refundable' | 'partial_refund' | 'tiered';

export interface PolicyTier {
    id: string;
    cancelDeadline: string;
    penaltyAmount: number;
    penaltyType: 'fixed' | 'percent' | 'nights';
    currency: string;
    tierOrder: number;
}

export interface BookingPolicySnapshot {
    id: string;
    bookingId: string;
    policyType: BookingPolicyType;
    summary: string | null;
    refundableTag: string | null;
    hotelRemarks: string[];
    noShowPenalty: number;
    earlyDepartureFee: number;
    freeCancelDeadline: string | null;
    tiers: PolicyTier[];
    // The row also has `raw_liteapi_response`, a second audit blob left behind by the
    // retired LiteAPI supplier. We write `raw_provider_response` and read neither — a
    // cancellation is computed from the tiers, never from the blob. See CONTEXT.md.
    capturedAt: string;
}

export interface CancellationFeeResult {
    fee: number;
    refund: number;
    currency: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type RawPolicy = Record<string, any> | null | undefined;

interface ParsedCancelInfo {
    cancelTime: string;
    amount: number;
    currency: string;
    type: string;
}

function safeParseCancelInfos(raw: RawPolicy): ParsedCancelInfo[] {
    if (!raw) return [];
    const infos = raw.cancelPolicyInfos ?? raw.cancel_policy_infos ?? raw.cancellation_policy_infos ?? raw.policies;
    if (!Array.isArray(infos)) return [];
    return infos
        .filter((info: any) => info && typeof info === 'object')
        .map((info: any) => ({
            cancelTime: String(info.cancelTime ?? info.cancel_time ?? info.deadline ?? ''),
            amount:     safeNumber(info.amount ?? info.penalty ?? info.fee ?? 0),
            currency:   String(info.currency ?? ''),
            type:       String(info.type ?? info.penaltyType ?? info.penalty_type ?? 'fixed'),
        }))
        .filter(info => info.cancelTime.length > 0);
}

function safeRefundableTag(raw: RawPolicy): string | null {
    if (!raw) return null;
    const tag = raw.refundableTag ?? raw.refundable_tag ?? raw.refundableStatus ?? raw.cancellationPolicy;
    if (typeof tag === 'string' && tag.length > 0) return tag;
    return null;
}

function safeHotelRemarks(raw: RawPolicy): string[] {
    if (!raw) return [];
    const remarks = raw.hotelRemarks ?? raw.hotel_remarks ?? raw.remarks ?? raw.hotelNotes;
    if (Array.isArray(remarks)) return remarks.filter((r: any) => typeof r === 'string');
    if (typeof remarks === 'string') return [remarks];
    return [];
}

function safeNumber(val: unknown): number {
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (typeof val === 'string') {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) return parsed;
    }
    return 0;
}

function detectNoShowPenalty(raw: RawPolicy): number {
    if (!raw) return 0;
    if (raw.noShowPenalty !== undefined)    return safeNumber(raw.noShowPenalty);
    if (raw.no_show_penalty !== undefined)  return safeNumber(raw.no_show_penalty);
    if (raw.noShowFee !== undefined)        return safeNumber(raw.noShowFee);
    const infos = safeParseCancelInfos(raw);
    const tier  = infos.find(i => i.type.toUpperCase().includes('NO_SHOW') || i.type.toUpperCase().includes('NOSHOW'));
    if (tier) return tier.amount;
    const remarks = safeHotelRemarks(raw);
    for (const remark of remarks) {
        const match = remark.match(/no[- ]?show.*?(\d+[\d,.]*)/i);
        if (match) return safeNumber(match[1].replace(',', ''));
    }
    return 0;
}

function detectEarlyDepartureFee(raw: RawPolicy): number {
    if (!raw) return 0;
    if (raw.earlyDepartureFee !== undefined) return safeNumber(raw.earlyDepartureFee);
    if (raw.early_departure_fee !== undefined) return safeNumber(raw.early_departure_fee);
    if (raw.earlyCheckoutFee !== undefined) return safeNumber(raw.earlyCheckoutFee);
    const infos = safeParseCancelInfos(raw);
    const tier  = infos.find(i =>
        i.type.toUpperCase().includes('EARLY_DEPARTURE') ||
        i.type.toUpperCase().includes('EARLY_CHECKOUT')
    );
    if (tier) return tier.amount;
    const remarks = safeHotelRemarks(raw);
    for (const remark of remarks) {
        const match = remark.match(/early\s+(?:departure|checkout).*?(\d+[\d,.]*)/i);
        if (match) return safeNumber(match[1].replace(',', ''));
    }
    return 0;
}

function normalizePenaltyType(type: string): PolicyTier['penaltyType'] {
    const t = type.toLowerCase();
    if (t === 'percent' || t === 'percentage') return 'percent';
    if (t === 'nights'  || t === 'night' || t === 'per_night') return 'nights';
    return 'fixed';
}

// ─── Public: classifyPolicyType ───────────────────────────────────────────────

export function classifyPolicyType(raw: RawPolicy): BookingPolicyType {
    if (!raw) return 'non_refundable';
    const tag = safeRefundableTag(raw)?.toUpperCase() ?? '';

    if (tag === 'NRFN' || tag.includes('NON-REFUNDABLE') || tag.includes('NON_REFUNDABLE') || tag.includes('NONREFUNDABLE')) {
        return 'non_refundable';
    }

    const infos = safeParseCancelInfos(raw);
    const cancellationTiers = infos.filter(i =>
        !i.type.toUpperCase().includes('NO_SHOW') &&
        !i.type.toUpperCase().includes('NOSHOW') &&
        !i.type.toUpperCase().includes('EARLY_DEPARTURE') &&
        !i.type.toUpperCase().includes('EARLY_CHECKOUT')
    );

    if (cancellationTiers.length === 0) {
        return tag.includes('REFUNDABLE') ? 'free_cancellation' : 'non_refundable';
    }
    if (cancellationTiers.every(t => t.amount === 0)) return 'free_cancellation';
    if (cancellationTiers.length >= 2) {
        const amounts = new Set(cancellationTiers.map(t => t.amount));
        if (amounts.size > 1) return 'tiered';
    }
    if (
        cancellationTiers.length === 1 &&
        cancellationTiers[0].type.toLowerCase() === 'percent' &&
        cancellationTiers[0].amount >= 100
    ) {
        return 'non_refundable';
    }
    if (cancellationTiers.length === 1 && cancellationTiers[0].amount > 0) return 'partial_refund';
    if (cancellationTiers.length >= 2) return 'tiered';
    return 'partial_refund';
}

// ─── Public: extractTiers ─────────────────────────────────────────────────────

export function extractTiers(raw: RawPolicy, fallbackCurrency = 'PHP'): Omit<PolicyTier, 'id'>[] {
    const infos = safeParseCancelInfos(raw);
    const cancellationTiers = infos.filter(i =>
        !i.type.toUpperCase().includes('NO_SHOW') &&
        !i.type.toUpperCase().includes('NOSHOW') &&
        !i.type.toUpperCase().includes('EARLY_DEPARTURE') &&
        !i.type.toUpperCase().includes('EARLY_CHECKOUT')
    );
    if (!cancellationTiers.length) return [];
    return cancellationTiers
        .sort((a, b) => new Date(a.cancelTime).getTime() - new Date(b.cancelTime).getTime())
        .map((info, index) => ({
            cancelDeadline: info.cancelTime,
            penaltyAmount:  info.amount,
            penaltyType:    normalizePenaltyType(info.type),
            currency:       info.currency || fallbackCurrency,
            tierOrder:      index,
        }));
}

// ─── Public: findFreeCancelDeadline ──────────────────────────────────────────

export function findFreeCancelDeadline(tiers: Omit<PolicyTier, 'id'>[]): string | null {
    const freeTiers = tiers.filter(t => t.penaltyAmount === 0);
    if (!freeTiers.length) return null;
    return freeTiers[freeTiers.length - 1].cancelDeadline;
}

// ─── Public: buildPolicySummary ───────────────────────────────────────────────

export function buildPolicySummary(
    policyType: BookingPolicyType,
    tiers: Omit<PolicyTier, 'id'>[],
    freeCancelDeadline: string | null,
    noShowPenalty: number,
    earlyDepartureFee: number,
    currency: string,
): string {
    const parts: string[] = [];
    switch (policyType) {
        case 'free_cancellation':
            if (freeCancelDeadline) {
                const d   = new Date(freeCancelDeadline);
                const fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                parts.push(`Free cancellation before ${fmt}`);
            } else {
                parts.push('Free cancellation');
            }
            break;
        case 'non_refundable':
            parts.push('Non-refundable');
            break;
        case 'partial_refund': {
            const tier = tiers.find(t => t.penaltyAmount > 0);
            if (tier) {
                const unit = tier.penaltyType === 'percent' ? '%' : tier.penaltyType === 'nights' ? ' night(s)' : ` ${tier.currency}`;
                parts.push(`Cancellation fee: ${tier.penaltyAmount}${unit}`);
            } else {
                parts.push('Partial refund available');
            }
            break;
        }
        case 'tiered':
            parts.push(`Tiered cancellation — ${tiers.length} deadline${tiers.length > 1 ? 's' : ''}`);
            break;
    }
    if (noShowPenalty > 0)   parts.push(`No-show penalty: ${noShowPenalty} ${currency}`);
    if (earlyDepartureFee > 0) parts.push(`Early departure fee: ${earlyDepartureFee} ${currency}`);
    return parts.join('. ');
}

// ─── Public: calculateCancellationFee ────────────────────────────────────────

export interface CancellationPolicy {
    refundableTag?: string;
    cancelPolicyInfos?: Array<{
        cancelTime: string;
        amount: number;
        currency: string;
        type: string;
    }>;
}

export function calculateCancellationFee(
    cancellationPolicies: CancellationPolicy | undefined | null,
    totalPrice: number,
    currency: string,
): CancellationFeeResult | null {
    const policies = cancellationPolicies?.cancelPolicyInfos;
    if (!policies || policies.length === 0) return null;

    const now = new Date();
    const rfn = cancellationPolicies?.refundableTag === 'RFN';

    const sortedPolicies = [...policies].sort(
        (a, b) => new Date(a.cancelTime).getTime() - new Date(b.cancelTime).getTime()
    );

    let applicableFee = totalPrice;
    for (const policy of sortedPolicies) {
        if (now < new Date(policy.cancelTime)) {
            applicableFee = policy.type === 'PERCENT'
                ? (totalPrice * policy.amount) / 100
                : policy.amount;
            break;
        }
    }

    const hasExplicitFreeEntry = sortedPolicies.some(p => p.amount === 0);
    if (rfn && !hasExplicitFreeEntry && applicableFee > 0) {
        const firstDeadline = new Date(sortedPolicies[0].cancelTime);
        if (now < firstDeadline) applicableFee = 0;
    }

    return { fee: applicableFee, refund: totalPrice - applicableFee, currency };
}

export function isCurrentlyFreeCancellation(
    cancellationPolicies: CancellationPolicy | undefined | null,
    totalPrice: number,
    currency: string,
): boolean {
    const result = calculateCancellationFee(cancellationPolicies, totalPrice, currency);
    if (result) return result.fee === 0;
    return cancellationPolicies?.refundableTag === 'RFN';
}

// ─── TGX-specific cancel policy normalizer ───────────────────────────────────
// Mirrors normalizeTgxCancelPolicy in the monolith prebook route.

export function normalizeTgxCancelPolicy(tgxPolicy: any): object {
    if (!tgxPolicy) return {};
    const penalties: any[]           = tgxPolicy.cancelPenalties || [];
    const refundable: boolean        = tgxPolicy.refundable ?? false;
    const cancelPolicyInfos: object[] = [];

    if (refundable && penalties.length > 0) {
        cancelPolicyInfos.push({
            cancelTime: penalties[0].deadline,
            amount:     0,
            currency:   penalties[0].currency || 'USD',
            type:       'AMOUNT',
        });
    }
    for (const p of penalties) {
        cancelPolicyInfos.push({
            cancelTime: p.deadline,
            amount:     p.value ?? 0,
            currency:   p.currency || 'USD',
            type:       p.penaltyType || 'AMOUNT',
        });
    }
    return { refundableTag: refundable ? 'RFN' : 'NRFN', cancelPolicyInfos };
}
