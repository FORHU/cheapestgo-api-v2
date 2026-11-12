import { describe, it, expect } from 'vitest';
import { groupRoomsByName, type FlatRoom } from '@/lib/hotels/roomGrouping';

/**
 * A room is what a traveller chooses; a rate is how they buy it.
 *
 * TGX returns one priced line per board arrangement and cancellation term, and the page
 * used to draw one card each. Parque Espana showed "1 Bedroom Executive Double room" three
 * times at three prices on 2026-10-01, which reads as a pricing fault rather than as the
 * choice of terms it is.
 */

const room = (over: Partial<FlatRoom> = {}): FlatRoom => ({
    id:            'offer-1',
    offerId:       'offer-1',
    name:          '1 Bedroom Executive Double room',
    price:         4961,
    currency:      'PHP',
    refundableTag: 'NRFN',
    boardType:     'RO',
    roomCode:      'rc-1',
    ...over,
});

describe('groupRoomsByName', () => {
    it('draws one card for a room sold at three prices, not three', () => {
        const grouped = groupRoomsByName([
            room({ offerId: 'a', price: 4961, boardType: 'RO' }),
            room({ offerId: 'b', price: 5485, boardType: 'BB' }),
            room({ offerId: 'c', price: 5633, boardType: 'HB' }),
        ]);

        expect(grouped).toHaveLength(1);
        expect(grouped[0].rates).toHaveLength(3);
    });

    it('headlines the cheapest rate, and selects it when nobody picks another', () => {
        const grouped = groupRoomsByName([
            room({ offerId: 'dear',   price: 5633 }),
            room({ offerId: 'cheap',  price: 4961, boardType: 'BB' }),
        ]);

        expect(grouped[0].price).toBe(4961);
        expect(grouped[0].offerId).toBe('cheap');
        expect(grouped[0].rates.map(r => r.price)).toEqual([4961, 5633]);
    });

    it('keeps rooms with different names apart', () => {
        const grouped = groupRoomsByName([
            room({ name: 'Business room', price: 5763 }),
            room({ name: '1 Bedroom Executive Double room', price: 4961 }),
        ]);

        expect(grouped.map(g => g.name)).toEqual(['1 Bedroom Executive Double room', 'Business room']);
    });

    it('drops a rate that is the same offer reached twice', () => {
        // Same price, same board, same refundability — nothing to choose between.
        const grouped = groupRoomsByName([
            room({ offerId: 'x', price: 4961, boardType: 'RO', refundableTag: 'NRFN' }),
            room({ offerId: 'y', price: 4961, boardType: 'RO', refundableTag: 'NRFN' }),
        ]);

        expect(grouped[0].rates).toHaveLength(1);
    });

    it('drops the dearer of two offers that promise the same thing', () => {
        // ROYAL HOTEL SEOUL Myeongdong sold its premier twin as `Room only, non-refundable`
        // at both ₩40,406 and ₩41,759. Two chips saying the same words at different prices
        // tell a reader there is a difference and refuse to say what it is. ADR-0007.
        //
        // This replaced a rule that kept both, on the grounds that the dearer is usually the
        // one with the later deadline. The deadline is part of the signature now, so that
        // offer survives on its own terms — see the test below — rather than by being dearer.
        const grouped = groupRoomsByName([
            room({ offerId: 'x', price: 4961, boardType: 'RO', refundableTag: 'NRFN' }),
            room({ offerId: 'y', price: 5200, boardType: 'RO', refundableTag: 'NRFN' }),
        ]);

        expect(grouped[0].rates.map(r => r.offerId)).toEqual(['x']);
    });

    it('keeps the offer with the later deadline, which is a real choice', () => {
        const grouped = groupRoomsByName([
            room({ offerId: 'early', price: 4000, refundableTag: 'RFN',
                cancelPolicy: { refundable: true, cancelPenalties: [{ deadline: '2026-11-18T10:00:00Z' }] } }),
            room({ offerId: 'late', price: 4400, refundableTag: 'RFN',
                cancelPolicy: { refundable: true, cancelPenalties: [{ deadline: '2026-11-25T10:00:00Z' }] } }),
        ]);

        expect(grouped[0].rates.map(r => r.offerId)).toEqual(['early', 'late']);
    });

    it('draws one card for a room whose name carries an offer qualifier', () => {
        // `(bed type is subject to availability)` describes the offer, not the room, so these
        // are one Room sold on two sets of terms — not the two look-alike cards reported on
        // 2026-11-04. ADR-0007.
        const grouped = groupRoomsByName([
            room({ offerId: 'plain', name: 'Deluxe Twin room (twin beds)', price: 5000 }),
            room({ offerId: 'unsure', price: 4800,
                name: 'Deluxe Twin room (twin beds) (bed type is subject to availability)' }),
        ]);

        expect(grouped).toHaveLength(1);
        expect(grouped[0].name).toBe('Deluxe Twin room');
        expect(grouped[0].rates.map(r => r.offerId)).toEqual(['unsure', 'plain']);
        expect(grouped[0].rates[0].offerTerms).toEqual(['bed not guaranteed']);
    });

    it('says which offer has the shared bathroom, rather than hiding it in a merge', () => {
        // One card, because the heading is the same — but a reader picking on price must not
        // get the shared bathroom by accident, so it rides on the offer.
        const grouped = groupRoomsByName([
            room({ offerId: 'private', name: 'Standard room', price: 3000 }),
            room({ offerId: 'shared', name: 'Standard room (shared bathroom)', price: 2500 }),
        ]);

        expect(grouped).toHaveLength(1);
        expect(grouped[0].rates.map(r => [r.offerId, r.bed]))
            .toEqual([['shared', 'shared bathroom'], ['private', null]]);
    });

    it('keeps the richest photo set, so a poor match does not blank a good one', () => {
        const grouped = groupRoomsByName([
            room({ offerId: 'a', price: 4961, roomPhotos: [] }),
            room({ offerId: 'b', price: 5485, boardType: 'BB', roomPhotos: ['/1.jpg', '/2.jpg'] }),
        ]);

        expect(grouped[0].roomPhotos).toEqual(['/1.jpg', '/2.jpg']);
        // …without the photos dragging the headline price up with them.
        expect(grouped[0].price).toBe(4961);
    });

    it('carries the cancellation deadline onto the rate it belongs to', () => {
        const grouped = groupRoomsByName([
            room({
                offerId: 'refundable',
                price: 5485,
                refundableTag: 'RFN',
                cancelPolicy: { refundable: true, cancelPenalties: [{ deadline: '2026-10-13T00:00:00Z' }] },
            }),
        ]);

        expect(grouped[0].rates[0]).toMatchObject({
            refundable: true,
            cancellationDeadline: '2026-10-13T00:00:00Z',
        });
    });

    it('gives a room sold one way a single rate rather than none', () => {
        const grouped = groupRoomsByName([room({ offerId: 'only' })]);

        expect(grouped[0].rates).toHaveLength(1);
        expect(grouped[0].rates[0].offerId).toBe('only');
    });

    it('returns nothing for nothing', () => {
        expect(groupRoomsByName([])).toEqual([]);
    });
});
