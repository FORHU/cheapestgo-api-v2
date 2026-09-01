import { describe, it, expect } from 'vitest';
import { classifyRoomAmenity } from '@/lib/hotels/roomAmenities';

describe('classifyRoomAmenity', () => {
  it('maps a known bathroom slug', () => {
    expect(classifyRoomAmenity('private-bathroom')).toEqual({
      label: 'Private bathroom', section: 'bathroom', icon: 'bath',
    });
  });
  it('maps a known kitchen slug', () => {
    expect(classifyRoomAmenity('microwave').section).toBe('kitchen');
  });
  it('maps wi-fi to internet-comms', () => {
    expect(classifyRoomAmenity('wi-fi').section).toBe('internet-comms');
  });
  it('routes a *-view slug to room-layout via regex fallback', () => {
    expect(classifyRoomAmenity('lake-view')).toEqual({
      label: 'Lake view', section: 'room-layout', icon: 'view',
    });
  });
  it('defaults an unknown slug to room-amenities with a prettified label', () => {
    expect(classifyRoomAmenity('rain-dance-floor')).toEqual({
      label: 'Rain dance floor', section: 'room-amenities', icon: 'check',
    });
  });
  it('MAP wins over RULES (toilet-paper keeps its toiletries icon, not bath)', () => {
    expect(classifyRoomAmenity('toilet-paper')).toEqual({
      label: 'Toilet paper', section: 'bathroom', icon: 'toiletries',
    });
  });
  it('normalises case and surrounding whitespace before lookup', () => {
    expect(classifyRoomAmenity('  Wi-Fi  ').section).toBe('internet-comms');
  });
  it('a RULES hit for a non-layout section (walk-in-shower -> bathroom)', () => {
    expect(classifyRoomAmenity('walk-in-shower')).toEqual({
      label: 'Walk in shower', section: 'bathroom', icon: 'bath',
    });
  });

  it('maps the hyphenated mini-bar slug to food & drink', () => {
    expect(classifyRoomAmenity('mini-bar')).toEqual({
      label: 'Minibar', section: 'food-drink', icon: 'fridge',
    });
  });
});
