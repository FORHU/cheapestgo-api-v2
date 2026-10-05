/**
 * One **Room** per card, with its **Rates** inside it.
 *
 * TGX prices a *rate*, not a room: the same "1 Bedroom Executive Double room" comes back
 * once per board arrangement and cancellation term. Sent on flat, the page draws one card
 * per line, so Parque Espana listed that room three times at ₩119,064, ₩131,640 and
 * ₩135,192 and read as a pricing fault rather than as a choice of terms. Roynet would have
 * drawn seventy.
 *
 * Grouped here rather than in the client because which rate wins, and which rates are the
 * same offer twice, are pricing rules — [ADR-0017](../../../../cheapest-go-app/docs/adr/0017-api-v2-owns-all-domain-logic.md).
 * v1 does this in `groupRoomsByName`, on the browser's side of the wire; the rules below
 * are v1's, the layer is v2's.
 */

/** One priced, policy-bearing way to buy a room. Mirrors app-v2's `RateRow`. */
export interface Rate {
    offerId: string;
    price: number;
    currency: string;
    boardCode?: string;
    boardName?: string;
    refundable: boolean;
    refundableTag: string;
    cancellationDeadline?: string;
}

/** A bookable line as it leaves the TGX mapping, before rooms and rates are separated. */
export interface FlatRoom {
    id: string;
    offerId: string;
    name: string;
    variantLabel?: string;
    price: number;
    currency: string;
    refundableTag: string;
    cancelPolicy?: { refundable?: boolean; cancelPenalties?: Array<{ deadline?: string }> };
    boardType?: string;
    roomCode?: string;
    roomPhotos?: string[];
    amenities?: string[];
    roomSize?: string;
}

export interface GroupedRoom extends FlatRoom {
    /** Sorted cheapest first, deduplicated. Always at least one. */
    rates: Rate[];
}

const rateOf = (room: FlatRoom): Rate => ({
    offerId:       room.offerId,
    price:         room.price,
    currency:      room.currency,
    boardCode:     room.boardType,
    refundable:    room.cancelPolicy?.refundable ?? room.refundableTag === 'RFN',
    refundableTag: room.refundableTag,
    ...(room.cancelPolicy?.cancelPenalties?.[0]?.deadline
        ? { cancellationDeadline: room.cancelPolicy.cancelPenalties[0].deadline }
        : {}),
});

/**
 * Two rates a traveller cannot choose between are one rate.
 *
 * Same board and same refundability at the same price is the same offer reached twice
 * through different supplier codes, and listing it twice makes a room look like it has
 * options it does not. Price is part of the key on purpose: at *different* prices those
 * two are a real choice, and keeping only the cheaper would hide a rate somebody wants —
 * the dearer one is usually the one with the later deadline.
 */
const rateKey = (rate: Rate) => `${rate.price}|${rate.boardCode ?? ''}|${rate.refundable}`;

/**
 * Group by the displayed name, which is the only thing a traveller distinguishes rooms by.
 *
 * Order is the cheapest room first, and within a room the cheapest rate first, because the
 * headline price of a card is the lowest of its rates.
 */
export function groupRoomsByName(rooms: FlatRoom[]): GroupedRoom[] {
    const groups = new Map<string, GroupedRoom>();

    for (const room of rooms) {
        const existing = groups.get(room.name);
        if (!existing) {
            groups.set(room.name, { ...room, rates: [rateOf(room)] });
            continue;
        }

        existing.rates.push(rateOf(room));

        // The richest photo set wins. ETG matches one TGX name better than another, and a
        // room that matched nothing should not blank a sibling that did.
        if ((room.roomPhotos?.length ?? 0) > (existing.roomPhotos?.length ?? 0)) {
            existing.roomPhotos = room.roomPhotos;
        }
        if ((room.amenities?.length ?? 0) > (existing.amenities?.length ?? 0)) {
            existing.amenities = room.amenities;
        }
        if (!existing.roomSize && room.roomSize) existing.roomSize = room.roomSize;
    }

    for (const group of groups.values()) {
        group.rates.sort((a, b) => a.price - b.price);

        const seen = new Set<string>();
        group.rates = group.rates.filter(rate => {
            const key = rateKey(rate);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // The card's headline, and the offer a click selects when nobody picks a rate.
        const cheapest = group.rates[0];
        group.price   = cheapest.price;
        group.offerId = cheapest.offerId;
        group.id      = cheapest.offerId;
    }

    return [...groups.values()].sort((a, b) => a.price - b.price);
}
