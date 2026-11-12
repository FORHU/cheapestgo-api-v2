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
 *
 * Which Room a line belongs to is [splitRoomName]'s answer, and which Offers are the same
 * promise is [termSignature]'s — both ADR-0007. Until 2026-11-12 those rules lived in
 * app-v2's `room-selection.tsx` and ran in the browser, while this module sat unwired and
 * the service grouped on the raw supplier name. Two clients then had to agree about what a
 * room is by each implementing it, and the second client — mobile — was about to make that
 * two copies of a rule whose failure sells someone a room they did not choose.
 */

import { logger } from '@/lib/logger';
import { splitRoomName } from './roomNames';

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
    /** The bed this Offer is sold with, lifted off the supplier's room name. ADR-0007. */
    bed?: string | null;
    /** Offer qualifiers lifted off that name, as chips. Usually empty. ADR-0007. */
    offerTerms?: string[];
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

const rateOf = (room: FlatRoom): Rate => {
    const parts = splitRoomName(room.name);
    return {
        offerId:       room.offerId,
        price:         room.price,
        currency:      room.currency,
        boardCode:     room.boardType,
        refundable:    room.cancelPolicy?.refundable ?? room.refundableTag === 'RFN',
        refundableTag: room.refundableTag,
        // Per Offer, not per Room: the same room is sold with twin beds and with a double,
        // and a rate row has to be able to say which.
        bed:           parts.bed,
        offerTerms:    parts.offerTerms,
        ...(room.cancelPolicy?.cancelPenalties?.[0]?.deadline
            ? { cancellationDeadline: room.cancelPolicy.cancelPenalties[0].deadline }
            : {}),
    };
};

/**
 * What makes one Offer different from another within a Room: the terms, never the price.
 *
 * Two Offers with the same signature are the same promise, and only the cheaper is worth
 * showing — `ROYAL HOTEL SEOUL Myeongdong`'s premier twin sells `Room only, non-refundable`
 * at both ₩40,406 and ₩41,759, and the dearer is strictly worse. Two chips reading
 * `Room only` at different prices tell the traveller there is a difference and refuse to
 * say what it is. ADR-0007.
 *
 * This supersedes keying on price, which this module did until 2026-11-12. The worry then
 * was that the dearer of two look-alikes is usually the one with the later deadline, and
 * dropping it would hide a rate somebody wants. The deadline is in the signature now, so a
 * later deadline is a different Offer and survives on its own merits rather than by being
 * dearer.
 */
const termSignature = (rate: Rate) => [
    rate.boardCode ?? '',
    rate.refundable ? 'RFN' : 'NRFN',
    rate.cancellationDeadline ?? '',
    rate.bed ?? '',
    [...(rate.offerTerms ?? [])].sort().join('+'),
].join('|');

/**
 * Group by the displayed name, which is the only thing a traveller distinguishes rooms by.
 *
 * Order is the cheapest room first, and within a room the cheapest rate first, because the
 * headline price of a card is the lowest of its rates.
 */
export function groupRoomsByName(rooms: FlatRoom[]): GroupedRoom[] {
    const groups = new Map<string, GroupedRoom>();

    for (const room of rooms) {
        // The Room's identity, not the supplier's string: `Deluxe Twin room (twin beds)` and
        // `Deluxe Twin room (twin beds) (bed type is subject to availability)` are one Room
        // sold on two sets of terms, and grouping on the raw name drew them as two cards a
        // reader could not tell apart. ADR-0007.
        const key = splitRoomName(room.name).name;
        const existing = groups.get(key);
        if (!existing) {
            groups.set(key, { ...room, name: key, rates: [rateOf(room)] });
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

        // Cheapest first, so the Offer kept for a signature is the cheapest that carries it.
        const seen = new Map<string, Rate>();
        const superseded: Array<{ offerId: string; price: number; keptOfferId: string; keptPrice: number }> = [];
        group.rates = group.rates.filter(rate => {
            const key = termSignature(rate);
            const kept = seen.get(key);
            if (kept) {
                superseded.push({
                    offerId: rate.offerId, price: rate.price,
                    keptOfferId: kept.offerId, keptPrice: kept.price,
                });
                return false;
            }
            seen.set(key, rate);
            return true;
        });

        // Logged rather than returned: the response carries what is buyable, and a support
        // question about a price nobody was shown has somewhere to be answered from.
        if (superseded.length) {
            logger.info('[rooms] superseded offers dropped', {
                room: group.name,
                dropped: superseded,
            });
        }

        // The card's headline, and the offer a click selects when nobody picks a rate.
        const cheapest = group.rates[0];
        group.price   = cheapest.price;
        group.offerId = cheapest.offerId;
        group.id      = cheapest.offerId;
    }

    return [...groups.values()].sort((a, b) => a.price - b.price);
}
