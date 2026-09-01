import { describe, it, expect } from 'vitest';
import { buildRoomContent } from '@/lib/hotels/roomContent';
import type { EtgContent } from '@/lib/hotels/etgContent.types';

const etg = (o: Partial<EtgContent>): EtgContent => ({
  roomGroups: [], amenityGroups: [], metapolicy: null,
  metapolicyExtraInfo: null, importantInformation: null, ...o,
});

describe('buildRoomContent', () => {
  it('returns empty sections + [] gallery when no room-group matches', () => {
    const c = buildRoomContent('Mystery Room', etg({}));
    expect(c.sections).toEqual([]);
    expect(c.gallery).toEqual([]);
  });

  it('groups a matched room-group’s slugs into ordered, non-empty sections', () => {
    const c = buildRoomContent('Standard Double Room', etg({
      roomGroups: [{
        name: 'Standard Double Room',
        images: ['img1', 'img2'],
        roomAmenities: ['private-bathroom', 'shower', 'tv', 'cable-tv', 'wi-fi', 'wardrobe', 'air-conditioning'],
        beddingType: 'double bed',
      }],
    }));
    expect(c.gallery).toEqual(['img1', 'img2']);
    expect(c.matchedRoomName).toBe('Standard Double Room');
    const ids = c.sections.map((s) => s.id);
    expect(ids).toEqual(['room-layout', 'bathroom', 'internet-comms', 'room-amenities', 'media-tech']);
    const bathroom = c.sections.find((s) => s.id === 'bathroom')!;
    expect(bathroom.items.map((i) => i.label)).toEqual(['Private bathroom', 'Shower']);
    expect(bathroom.scope).toBe('room');
  });

  it('deduplicates repeated labels within a section', () => {
    const c = buildRoomContent('Room A', etg({
      roomGroups: [{ name: 'Room A', images: [], roomAmenities: ['tv', 'television'] }],
    }));
    const media = c.sections.find((s) => s.id === 'media-tech')!;
    expect(media.items).toHaveLength(1);
  });

  it('builds key facts from bathroom type and a paid-internet policy', () => {
    const c = buildRoomContent('Deluxe Room', etg({
      roomGroups: [{
        name: 'Deluxe Room', images: [], roomAmenities: ['air-conditioning', 'non-smoking'],
        beddingType: 'double bed', bathroomType: 'private',
      }],
      metapolicy: { internet: [{ inclusion: 'paid', price: 8, currency: 'USD' }] },
    }));
    const labels = c.keyFacts.map((f) => f.label);
    expect(labels).toContain('Non-smoking');
    expect(labels).toContain('Air conditioning');
    expect(labels).toContain('Private bathroom');
    expect(labels).toContain('Paid Wi-Fi (USD 8)');
  });

  it('does not emit an internet key fact when internet is included (the section shows it)', () => {
    const c = buildRoomContent('Room I', etg({
      roomGroups: [{ name: 'Room I', images: [], roomAmenities: ['wi-fi'] }],
      metapolicy: { internet: [{ inclusion: 'included', price: 0 }] },
    }));
    expect(c.keyFacts.map((f) => f.label)).not.toContain('Free Wi-Fi');
  });

  it('passes a TGX noise bed string through as the bed line', () => {
    const c = buildRoomContent('Twin Room (bed type is subject to availability)', etg({
      roomGroups: [{ name: 'Twin Room', images: [], roomAmenities: [] }],
    }));
    expect(c.bedLine).toBe('Bed type is subject to availability');
  });

  it('reads a bed-count phrase from the name when ETG has no bedding type', () => {
    const c = buildRoomContent('Family Room with 2 Queen Beds', etg({
      roomGroups: [{ name: 'Family Room with 2 Queen Beds', images: [], roomAmenities: [] }],
    }));
    expect(c.bedLine).toBe('2 Queen Beds');
  });

  it('says nothing about cribs when metapolicy is absent', () => {
    const c = buildRoomContent('Room X', etg({
      roomGroups: [{ name: 'Room X', images: [], roomAmenities: [] }],
    }));
    expect(c.bedsExtraSummary).toBeUndefined();
  });

  it('reports cribs unavailable only when the policy explicitly says so', () => {
    const c = buildRoomContent('Room Y', etg({
      roomGroups: [{ name: 'Room Y', images: [], roomAmenities: [] }],
      metapolicy: { cot: [{ inclusion: 'not_available' }], extra_bed: [{ inclusion: 'not_available' }] },
    }));
    expect(c.bedsExtraSummary).toBe('Extra beds and cribs are unavailable for this room type');
  });

  it('stays silent about the summary when a cot is actually available', () => {
    const c = buildRoomContent('Room Z', etg({
      roomGroups: [{ name: 'Room Z', images: [], roomAmenities: [] }],
      metapolicy: { cot: [{ inclusion: 'paid', price: 15, currency: 'EUR' }] },
    }));
    expect(c.bedsExtraSummary).toBeUndefined();
  });

  it('never puts a property-scoped section in the room sections', () => {
    const c = buildRoomContent('Standard Double Room', etg({
      roomGroups: [{ name: 'Standard Double Room', images: [], roomAmenities: ['tv', 'wardrobe'] }],
      metapolicy: { children: [{ age_start: 0, age_end: 5, inclusion: 'included' }] },
    }));
    expect(c.sections.every((s) => s.scope === 'room')).toBe(true);
    expect(c.sections.map((s) => s.id)).not.toContain('child-policy');
  });
});
