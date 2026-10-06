/**
 * Which searches are cut back to a bounding box, and which are left alone.
 *
 * Reported on live v1 on 2026-09-22: a Camden Town search drew the whole of Greater London.
 * The picker had sent the borough's own bounds; nothing downstream honoured them, so the search
 * fell back to a 50km circle around the borough's centre — which in London is the city.
 *
 * The opposite mistake costs just as much and is easier to make, because it looks like more
 * care rather than less: bounding *every* search that carries a box. A city's own box is
 * tighter than the spread of its hotels — Jeju's excludes Seogwipo, 27km away — which is
 * exactly why a city keeps the radius.
 */

import { describe, it, expect } from 'vitest';
import { subAreaBbox } from '@/lib/hotels/search';

const CAMDEN: [number, number, number, number] = [-0.1413, 51.5361, -0.1186, 51.5571];

describe('subAreaBbox', () => {
    it('bounds a borough by the extent the picker sent', () => {
        expect(subAreaBbox({ areaRung: 'district', bbox: CAMDEN })).toEqual(CAMDEN);
    });

    it('bounds every rung below a city, whatever the local word for it', () => {
        // A Paris arrondissement, a German Landkreis, a Tokyo ku — all arrive as one of these.
        for (const rung of ['district', 'neighborhood', 'locality', 'province', 'state', 'county']) {
            expect(subAreaBbox({ areaRung: rung, bbox: CAMDEN })).toEqual(CAMDEN);
        }
    });

    it('leaves a city on its radius', () => {
        // Jeju: the box is the island's administrative outline, the hotels are not.
        expect(subAreaBbox({ areaRung: 'city', bbox: [126.1, 33.2, 126.9, 33.6] })).toBeNull();
    });

    it('leaves a search that picked no extent alone', () => {
        expect(subAreaBbox({ bbox: CAMDEN })).toBeNull();
        expect(subAreaBbox({ areaRung: 'district' })).toBeNull();
        expect(subAreaBbox({})).toBeNull();
    });

    it('ignores a box that is not four numbers', () => {
        // The browser sends "minLng,minLat,maxLng,maxLat" as a string; a caller that forgot to
        // split it must fall back to the radius rather than bound by nonsense.
        expect(subAreaBbox({ areaRung: 'district', bbox: '-0.14,51.53,-0.11,51.55' as never })).toBeNull();
        expect(subAreaBbox({ areaRung: 'district', bbox: [1, 2] as never })).toBeNull();
    });
});
