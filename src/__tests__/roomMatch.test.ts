import { describe, it, expect } from 'vitest';
import { matchEtgRoomGroup } from '@/lib/hotels/roomMatch';
import type { RoomGroupEntry } from '@/lib/hotels/etgContent.types';

const g = (o: Partial<RoomGroupEntry>): RoomGroupEntry =>
  ({ name: 'Room', images: [], roomAmenities: [], ...o });

describe('matchEtgRoomGroup', () => {
  it('returns null when there are no groups', () => {
    expect(matchEtgRoomGroup('Standard Double Room', [])).toBeNull();
  });

  it('returns null for a blank / whitespace description', () => {
    const groups = [g({ name: 'Deluxe Room', images: ['a'] })];
    expect(matchEtgRoomGroup('', groups)).toBeNull();
    expect(matchEtgRoomGroup('   ', groups)).toBeNull();
  });

  it('bedding-type pass distinguishes twin from double', () => {
    const groups = [
      g({ name: 'Standard Twin Room',   beddingType: 'twin beds',  images: ['a'] }),
      g({ name: 'Standard Double Room', beddingType: 'double bed', images: ['b'] }),
    ];
    expect(matchEtgRoomGroup('Standard Double Room', groups)?.name).toBe('Standard Double Room');
  });

  it('exact name match beats prefix match', () => {
    const groups = [
      g({ name: 'Deluxe Room',            images: ['a'] }),
      g({ name: 'Deluxe Room with View',  images: ['b'] }),
    ];
    expect(matchEtgRoomGroup('Deluxe Room', groups)?.name).toBe('Deluxe Room');
  });

  it('within a prefix-match tier, the group with the most photos wins', () => {
    const groups = [
      g({ name: 'Deluxe Room',     images: ['a'] }),
      g({ name: 'Deluxe Room Sea', images: ['a', 'b', 'c'] }),
    ];
    expect(matchEtgRoomGroup('Deluxe Room Sea View Balcony', groups)?.name).toBe('Deluxe Room Sea');
  });

  it('dedupes by normalised name, first occurrence wins', () => {
    const groups = [
      g({ name: 'Ocean Suite', images: ['hotel-1', 'hotel-2'] }),
      g({ name: 'ocean  suite', images: ['stock-1', 'stock-2', 'stock-3', 'stock-4'] }),
    ];
    expect(matchEtgRoomGroup('Ocean Suite', groups)?.images).toEqual(['hotel-1', 'hotel-2']);
  });

  it('strips a mid-string parenthetical the full-description pass cannot use', () => {
    const groups = [g({ name: 'Superior Room Balcony', images: ['a'] })];
    expect(matchEtgRoomGroup('Superior Room (Twin) Balcony', groups)?.name).toBe('Superior Room Balcony');
  });

  it('returns null rather than matching on a tier word alone', () => {
    const groups = [
      g({ name: 'Standard Queen Room', images: ['a'] }),
      g({ name: 'Standard King Room',  images: ['b'] }),
    ];
    expect(matchEtgRoomGroup('Standard Family Suite', groups)).toBeNull();
  });
});
