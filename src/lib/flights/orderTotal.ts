/**
 * What a Duffel order for this offer costs, with the seats and bags chosen: the amount its
 * balance payment has to state, as a fixed-2 string. Duffel refuses a payment that does not
 * match the order exactly.
 *
 * Every price comes from the offer. A service the offer does not list adds nothing — the order
 * will fail on it, which is better than charging a figure nobody quoted.
 */
export function orderTotal(rawOffer: any, seatServiceIds: string[] = [], bagServiceIds: string[] = []): string {
    const offerTotal = parseFloat(rawOffer?.total_amount ?? '0');
    const availableSvcs: any[] = rawOffer?.available_services ?? [];
    let extras = 0;
    for (const id of [...seatServiceIds, ...bagServiceIds]) {
        const svc = availableSvcs.find((s: any) => s.id === id);
        if (svc) extras += parseFloat(svc.total_amount ?? '0');
    }
    return (offerTotal + extras).toFixed(2);
}
