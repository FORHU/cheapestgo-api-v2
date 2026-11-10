import { describe, it, expect } from 'vitest';
import { farThresholdKm, anchorRung, distanceToShow, attachDistance } from '@/lib/hotels/searchDistance';

/**
 * ADR-0051. A Tokyo search returns 297 hotels and every one of them is Tokyo — Hachioji and
 * Machida are 32–33 km out and still Tokyo Metropolis. What was missing was never a filter; it
 * was that the card never said how far away anything was.
 */
describe('how far is far', () => {
    it('scales with what the traveller picked', () => {
        expect(farThresholdKm('poi')).toBe(1);
        expect(farThresholdKm('district')).toBe(5);
        expect(farThresholdKm('city')).toBe(15);
    });

    it('says nothing for a rung with no anchor worth measuring from', () => {
        // The middle of Hokkaido is not a place anyone is measuring from.
        for (const rung of ['province', 'state', 'county', 'region', 'country']) {
            expect(farThresholdKm(rung), rung).toBeNull();
        }
        expect(farThresholdKm(undefined)).toBeNull();
        expect(farThresholdKm('something-new-from-the-picker')).toBeNull();
    });

    it('reads the rung whatever case the picker sent', () => {
        expect(farThresholdKm('City')).toBe(15);
        expect(farThresholdKm('DISTRICT')).toBe(5);
    });
});

describe('which rung a distance is judged against', () => {
    /**
     * `rung` is downgraded to 'city' for a sub-area search, because OTV serves only the City
     * rung (ADR-0006). Judging a Shibuya search at the city threshold would silence it — 2.4 km
     * is nothing against 15 — so the rung the traveller actually picked has to win.
     */
    it('prefers the picked rung over the downgraded one', () => {
        expect(anchorRung({ rung: 'city', areaRung: 'district' })).toBe('district');
    });

    it('falls back to the rung when nothing was downgraded', () => {
        expect(anchorRung({ rung: 'city' })).toBe('city');
        expect(anchorRung({})).toBeNull();
    });
});

describe('the distance a card shows', () => {
    it('stays quiet for a hotel that is central for its rung', () => {
        expect(distanceToShow(11, 'city')).toBeNull();        // Edogawa, on a Tokyo search
        expect(distanceToShow(2.4, 'district')).toBeNull();   // two stops from Shibuya
        expect(distanceToShow(0.35, 'poi')).toBeNull();       // across the road from the station
    });

    it('speaks up for one that is not', () => {
        expect(distanceToShow(33.4, 'city')).toBe(33);        // Hachioji
        expect(distanceToShow(7, 'district')).toBe(7);
        expect(distanceToShow(2.14, 'poi')).toBe(2.1);
    });

    it('is quiet exactly at the threshold, not past it', () => {
        expect(distanceToShow(15, 'city')).toBeNull();
        expect(distanceToShow(15.6, 'city')).toBe(16);
    });

    /** "2.4 km from Shibuya" is useful; "2 km" loses the thing that made it worth saying. */
    it('keeps a decimal below 10km and drops it above', () => {
        expect(distanceToShow(6.44, 'district')).toBe(6.4);
        expect(distanceToShow(32.7, 'city')).toBe(33);
    });

    it('says nothing when there is no anchor, no rung, or no number', () => {
        expect(distanceToShow(412, 'country')).toBeNull();
        expect(distanceToShow(33, undefined)).toBeNull();
        expect(distanceToShow(null, 'city')).toBeNull();
        expect(distanceToShow(undefined, 'city')).toBeNull();
        expect(distanceToShow(NaN, 'city')).toBeNull();
    });
});

/**
 * The supplier answers with hotels the instant catalog never held, and they reach the map as
 * cards like any other. They are measured in the same place so a card's distance cannot depend
 * on which phase of the search produced it.
 */
describe('measuring hotels the catalog never held', () => {
    const TOKYO = { lat: 35.688985, lng: 139.692912, rung: 'city' };
    const hotels = [
        { id: 'far',     lat: 35.6560, lng: 139.3390 },  // Hachioji, 32km
        { id: 'central', lat: 35.6896, lng: 139.6917 },  // Shinjuku, 0.1km
    ];

    it('marks the far one and leaves the central one alone', () => {
        const [far, central] = attachDistance(hotels, TOKYO) as any[];
        expect(far.distanceKm).toBe(32);
        expect(central.distanceKm).toBeNull();
    });

    it('changes nothing when there is no anchor to measure from', () => {
        expect(attachDistance(hotels, { rung: 'city' })).toBe(hotels);
        expect(attachDistance(hotels, { ...TOKYO, rung: 'country' })).toBe(hotels);
    });

    it('leaves a hotel with no usable coordinates untouched rather than placing it at sea', () => {
        const [bad] = attachDistance([{ id: 'x', lat: 0, lng: 0 }], TOKYO) as any[];
        expect(bad).not.toHaveProperty('distanceKm');
    });

    it('does not mutate what it was given', () => {
        const input = [{ id: 'far', lat: 35.6560, lng: 139.3390 }];
        attachDistance(input, TOKYO);
        expect(input[0]).not.toHaveProperty('distanceKm');
    });
});
