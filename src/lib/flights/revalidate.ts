/**
 * Is this flight offer still buyable, and at the price the traveller was shown?
 *
 * Ported from v1 (C3). api-v2 had no check at all before payment: a fare that moved was
 * discovered at order placement, after the card details were in, where the only answer left
 * is an error. Asking Duffel's Price Action first turns that into a question the traveller
 * can answer before they pay.
 *
 * Mystifly is not handled here — it is disabled at launch, and its `AirRevalidate` fare
 * source codes belong with whatever re-enables it.
 */

import { config } from '@/config';
import { getFlightPriceTolerance } from '@/lib/pricing';

export interface RevalidateResult {
    success: boolean;
    seatsAvailable?: boolean;
    priceChanged?: boolean;
    /** Always reported when known — a drop has to reach the caller so it can charge the lower fare. */
    newPrice?: number;
    farePolicy?: unknown;
    error?: string;
    /** The input itself was wrong, so the caller can answer 400 rather than 200. */
    badRequest?: boolean;
}

/**
 * Should the traveller be interrupted to confirm this price?
 *
 * Only an INCREASE beyond the tolerance warrants a prompt. Comparing the absolute difference
 * stops a booking to ask someone to approve a fare that has got *cheaper* — a confirmation
 * with no decision in it, and roughly half of all observed drift. A drop is adopted instead:
 * callers take `newPrice` as the price to charge, so the traveller pays the lower fare.
 */
function needsPriceConfirmation(oldPrice: number, newPrice: number): boolean {
    if (oldPrice <= 0 || newPrice <= 0) return false;
    // The same tolerance the order-time gate uses. If the two disagree, a fare between the
    // thresholds passes here and is rejected there — which is what made prices look like they
    // changed constantly.
    return newPrice - oldPrice > getFlightPriceTolerance();
}

export async function revalidateFlight(input: { provider?: string; flightPayload?: any }): Promise<RevalidateResult> {
    const { provider, flightPayload } = input;
    if (!provider || !flightPayload) {
        return { success: false, error: 'provider and flightPayload are required', badRequest: true };
    }
    if (provider !== 'duffel') {
        return { success: false, error: `Unknown provider: ${provider}`, badRequest: true };
    }

    const token = config.DUFFEL_ACCESS_TOKEN;
    if (!token) return { success: false, seatsAvailable: false, error: 'Duffel not configured' };

    const offerId: string = flightPayload._rawOffer?.id ?? flightPayload.offer_id ?? flightPayload.offerId ?? '';
    if (!offerId) {
        // Soft-pass: the offer is re-fetched at booking time anyway, and refusing here would
        // block a booking over a missing field the traveller cannot do anything about.
        console.warn('[revalidate] No offer id in the payload — skipping');
        return { success: true, seatsAvailable: true, priceChanged: false };
    }

    let priceData: any;
    try {
        const res = await fetch(`https://api.duffel.com/air/offers/${offerId}/actions/price`, {
            method: 'POST',
            headers: {
                Authorization:     `Bearer ${token}`,
                'Duffel-Version':  'v2',
                'Content-Type':    'application/json',
                'Idempotency-Key': crypto.randomUUID(),
            },
            signal: AbortSignal.timeout(12_000),
        });

        if (!res.ok) {
            // 404 is the offer having expired, which the booking path recovers from by
            // re-quoting; anything else is Duffel's problem, not the traveller's. Both
            // soft-pass so the booking can surface the real error in its own words.
            console.warn(`[revalidate] Duffel price action ${res.status} for ${offerId}`);
            return { success: true, seatsAvailable: true, priceChanged: false };
        }
        priceData = await res.json();
    } catch (err: any) {
        console.error('[revalidate] Duffel price action threw:', err?.message);
        return { success: true, seatsAvailable: true, priceChanged: false };
    }

    const priced = priceData?.data;
    if (!priced) return { success: true, seatsAvailable: true, priceChanged: false };

    const oldPrice = parseFloat(String(flightPayload.oldPrice ?? flightPayload.price?.total ?? flightPayload.price ?? '0')) || 0;
    const newPrice = parseFloat(priced.total_amount ?? '0');

    const refundCond = priced.conditions?.refund_before_departure;
    const changeCond = priced.conditions?.change_before_departure;

    console.log(`[revalidate] ${offerId}: old=${oldPrice} new=${newPrice}`);

    return {
        success:        true,
        seatsAvailable: true,
        priceChanged:   needsPriceConfirmation(oldPrice, newPrice),
        ...(newPrice > 0 ? { newPrice } : {}),
        farePolicy: {
            isRefundable:          refundCond?.allowed === true,
            isChangeable:          changeCond?.allowed === true,
            refundPenaltyAmount:   refundCond?.penalty_amount != null ? parseFloat(refundCond.penalty_amount) : null,
            refundPenaltyCurrency: refundCond?.penalty_currency ?? null,
            changePenaltyAmount:   changeCond?.penalty_amount != null ? parseFloat(changeCond.penalty_amount) : null,
            changePenaltyCurrency: changeCond?.penalty_currency ?? null,
            policyVersion:         'revalidated' as const,
            policySource:          'duffel' as const,
        },
    };
}
