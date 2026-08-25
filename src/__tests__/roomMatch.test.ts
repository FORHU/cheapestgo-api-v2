import { describe, it, expect } from 'vitest';
import {
    matchEtgRoomGroup,
    orderRoomPhotosByDistinctiveness,
    type EtgGroup,
} from '@/lib/hotels/roomMatch';

/**
 * C1c. TGX names a room one way and ETG files its photos under another, so the
 * only link is the text. These cover the order the cascade has to keep: a
 * confident match must always beat a plausible one, and no match at all beats a
 * wrong one on a page someone books from.
 */

const g = (name: string, images: string[] = [], extra: Partial<EtgGroup> = {}): EtgGroup =>
    ({ name, images, ...extra });

describe('matchEtgRoomGroup', () => {
    it('takes an exact name match', () => {
        const groups = [g('Deluxe Double room', ['a']), g('Standard Twin room', ['b'])];
        expect(matchEtgRoomGroup('Deluxe Double room', groups).matchedName).toBe('Deluxe Double room');
    });

    it('matches through a parenthesised qualifier ETG appends', () => {
        // The real shape: TGX says "Deluxe Double room with river view", ETG files
        // it as "... (full double bed)".
        const groups = [g('Deluxe Double room with river view (full double bed)', ['a'])];
        const out = matchEtgRoomGroup('Deluxe Double room with river view', groups);
        expect(out.matchedName).toBe('Deluxe Double room with river view (full double bed)');
    });

    it('keeps two differently-graded rooms apart — the Hotel Naru case', () => {
        // These are the two rooms from the report. They must never collide: it is
        // what made the page look broken.
        const groups = [
            g('Deluxe Double room with river view (full double bed)',  ['dlx1', 'dlx2']),
            g('Premier Double room with river view (full double bed)', ['prm1', 'prm2']),
        ];
        const deluxe  = matchEtgRoomGroup('Deluxe Double room with river view', groups);
        const premier = matchEtgRoomGroup('Premier Double room with river view', groups);

        expect(deluxe.matchedName).toContain('Deluxe');
        expect(premier.matchedName).toContain('Premier');
        expect(deluxe.matchedName).not.toBe(premier.matchedName);
    });

    it('uses ETG bedding type to separate rooms whose names score alike', () => {
        const groups = [
            g('Standard room A', ['a'], { beddingType: 'twin beds' }),
            g('Standard room B', ['b'], { beddingType: 'double bed' }),
        ];
        expect(matchEtgRoomGroup('Standard Twin room', groups).matchedName).toBe('Standard room A');
    });

    it('prefers a duplicate group name\'s first entry, which is hotel-specific', () => {
        // Later repeats are generic catalog entries carrying stock photos.
        const groups = [g('Double room', ['specific']), g('Double room', ['stock1', 'stock2'])];
        expect(matchEtgRoomGroup('Double room', groups).images).toEqual(['specific']);
    });

    it('prefers a group that has photos over one that has none', () => {
        const groups = [g('Suite', []), g('Suite with view', ['a'])];
        expect(matchEtgRoomGroup('Suite with view', groups).images).toEqual(['a']);
    });

    it('returns nothing rather than guessing on a tier word alone', () => {
        // A wrong photo is worse than no photo: an unmatched room falls back to
        // the hotel gallery, which is honest.
        const groups = [g('Deluxe Double room', ['a']), g('Deluxe Twin room', ['b'])];
        const out = matchEtgRoomGroup('Executive Studio', groups);
        expect(out.matchedName).toBe('');
        expect(out.images).toEqual([]);
    });

    it('handles an empty group list', () => {
        expect(matchEtgRoomGroup('Anything', [])).toEqual({ images: [], amenities: [], matchedName: '' });
    });

    it('carries amenities across with the photos', () => {
        const groups = [g('Deluxe room', ['a'], { amenities: ['Air Conditioning'] })];
        expect(matchEtgRoomGroup('Deluxe room', groups).amenities).toEqual(['Air Conditioning']);
    });
});

describe('orderRoomPhotosByDistinctiveness', () => {
    it('leads each room with what is unique to it', () => {
        // Hotel Naru again: correctly matched, still 70% shared, so the visible
        // thumbnails collided.
        const rooms = [
            { name: 'Deluxe',  roomPhotos: ['s1', 'dlx', 's2'] },
            { name: 'Premier', roomPhotos: ['s1', 'prm', 's2'] },
        ];
        const [d, p] = orderRoomPhotosByDistinctiveness(rooms);
        expect(d.roomPhotos).toEqual(['dlx', 's1', 's2']);
        expect(p.roomPhotos).toEqual(['prm', 's1', 's2']);
        expect(d.roomPhotos![0]).not.toBe(p.roomPhotos![0]);
    });

    it('keeps the shared photos rather than discarding them', () => {
        const rooms = [
            { roomPhotos: ['a', 'shared'] },
            { roomPhotos: ['b', 'shared'] },
        ];
        const out = orderRoomPhotosByDistinctiveness(rooms);
        expect(out[0].roomPhotos).toHaveLength(2);
        expect(out[0].roomPhotos).toContain('shared');
    });

    it('leaves supplier order alone when a room has no unique photos', () => {
        const rooms = [{ roomPhotos: ['x', 'y', 'own'] }, { roomPhotos: ['x', 'y'] }];
        expect(orderRoomPhotosByDistinctiveness(rooms)[1].roomPhotos).toEqual(['x', 'y']);
    });

    it('leaves supplier order alone when every photo is already unique', () => {
        const rooms = [{ roomPhotos: ['a1', 'a2'] }, { roomPhotos: ['b1', 'b2'] }];
        const out = orderRoomPhotosByDistinctiveness(rooms);
        expect(out[0].roomPhotos).toEqual(['a1', 'a2']);
        expect(out[1].roomPhotos).toEqual(['b1', 'b2']);
    });

    it('counts a photo repeated inside one room as still unique to it', () => {
        const rooms = [{ roomPhotos: ['dup', 'dup', 'own'] }, { roomPhotos: ['other'] }];
        expect(orderRoomPhotosByDistinctiveness(rooms)[0].roomPhotos).toEqual(['dup', 'dup', 'own']);
    });

    it('passes through rooms with no photos, and single-room pages', () => {
        expect(orderRoomPhotosByDistinctiveness([{ roomPhotos: [] }, { roomPhotos: ['a'] }])[0].roomPhotos).toEqual([]);
        const one = [{ roomPhotos: ['a', 'b'] }];
        expect(orderRoomPhotosByDistinctiveness(one)).toBe(one);
    });
});
