import { describe, it, expect } from 'vitest';
import { parseRoomGroups, parseAmenityGroups, parseMetapolicy } from '@/lib/hotels/etgContent';

describe('parseRoomGroups', () => {
  it('returns [] for empty / null input', () => {
    expect(parseRoomGroups([])).toEqual([]);
    expect(parseRoomGroups(null)).toEqual([]);
  });

  it('resolves {size} in image URLs and caps at 10', () => {
    const out = parseRoomGroups([{
      name: 'Standard Room',
      images: Array.from({ length: 14 }, (_, i) => `https://cdn/x/{size}/${i}.jpg`),
      room_amenities: ['wi-fi'],
    }]);
    expect(out[0].images).toHaveLength(10);
    expect(out[0].images[0]).toBe('https://cdn/x/1024x768/0.jpg');
  });

  it('extracts beddingType and bathroomType from name_struct, renames room_amenities', () => {
    const out = parseRoomGroups([{
      name: 'Deluxe Twin Room',
      images: [],
      room_amenities: ['wi-fi', 3, null, 'tv'],
      room_group_id: 42,
      name_struct: { main_name: 'Deluxe Twin Room', bedding_type: 'twin beds', bathroom: 'private' },
    }]);
    expect(out[0].beddingType).toBe('twin beds');
    expect(out[0].bathroomType).toBe('private');
    expect(out[0].roomAmenities).toEqual(['wi-fi', 'tv']);
    expect(out[0].roomGroupId).toBe(42);
    expect(out[0]).not.toHaveProperty('floor');
  });

  it('drops entries with no name', () => {
    expect(parseRoomGroups([{ name: '', images: [], room_amenities: [] }])).toEqual([]);
  });
});

describe('parseAmenityGroups', () => {
  it('keeps group_name, amenities, non_free_amenities; filters blanks and drops empty groups', () => {
    const out = parseAmenityGroups([
      { group_name: 'Internet', amenities: ['Free WiFi', ''], non_free_amenities: [] },
      { group_name: '', amenities: ['x'] },
    ]);
    expect(out).toEqual([{ groupName: 'Internet', amenities: ['Free WiFi'], nonFree: [] }]);
  });
});

describe('parseMetapolicy', () => {
  it('returns null for null / non-object', () => {
    expect(parseMetapolicy(null)).toBeNull();
    expect(parseMetapolicy('nope')).toBeNull();
  });
  it('returns null when every known key is missing or an empty array', () => {
    expect(parseMetapolicy({ cot: [], junk: 1 })).toBeNull();
  });
  it('passes through known non-empty arrays', () => {
    const mp = parseMetapolicy({ cot: [{ inclusion: 'paid', price: 20, currency: 'EUR' }], junk: 1 });
    expect(mp?.cot?.[0]).toMatchObject({ inclusion: 'paid', price: 20, currency: 'EUR' });
  });
});
