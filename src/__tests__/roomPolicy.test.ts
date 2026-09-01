import { describe, it, expect } from 'vitest';
import { buildPolicySections, buildAdditionalInfo } from '@/lib/hotels/roomContent';
import type { MetapolicyStruct } from '@/lib/hotels/etgContent.types';

describe('buildPolicySections', () => {
  it('is empty when metapolicy is null', () => {
    expect(buildPolicySections(null)).toEqual([]);
  });

  it('builds a child-policy section from children entries', () => {
    const mp: MetapolicyStruct = {
      children: [
        { age_start: 0, age_end: 5, inclusion: 'included', price: 0 },
        { age_start: 6, age_end: 12, inclusion: 'paid', price: 20, currency: 'EUR', price_unit: 'per_night' },
      ],
    };
    const [sec] = buildPolicySections(mp);
    expect(sec.id).toBe('child-policy');
    expect(sec.scope).toBe('property');
    expect(sec.items.map((i) => i.label)).toEqual([
      'Children 0–5 stay free',
      'Children 6–12: EUR 20 per night',
    ]);
  });

  it('builds a beds-extra section only from an available cot / extra bed', () => {
    const mp: MetapolicyStruct = {
      cot: [{ inclusion: 'paid', price: 15, currency: 'EUR', price_unit: 'per_night' }],
      extra_bed: [{ inclusion: 'not_available' }],
    };
    const beds = buildPolicySections(mp).find((s) => s.id === 'beds-extra')!;
    expect(beds.scope).toBe('property');
    expect(beds.items).toEqual([{ label: 'Cot: EUR 15 per night', icon: 'bed' }]);
  });

  it('emits no beds-extra section when cot and extra bed are both unavailable', () => {
    const mp: MetapolicyStruct = {
      cot: [{ inclusion: 'not_available' }],
      extra_bed: [{ inclusion: 'not_available' }],
    };
    expect(buildPolicySections(mp).some((s) => s.id === 'beds-extra')).toBe(false);
  });

  it('a child entry with no price info reads as "welcome", not "stay free"', () => {
    const mp: MetapolicyStruct = { children: [{ age_start: 0, age_end: 2 }] };
    expect(buildPolicySections(mp)[0].items[0].label).toBe('Children 0–2 welcome');
  });
});

describe('buildAdditionalInfo', () => {
  it('concatenates important info, extra info and phrased metapolicy', () => {
    const out = buildAdditionalInfo(
      'Front desk open 24 hours.',
      { pets: [{ inclusion: 'not_allowed' }], deposit: [{ inclusion: 'paid', price: 100, currency: 'USD' }] },
      'Photo ID required at check-in.',
    );
    expect(out).toContain('Front desk open 24 hours.');
    expect(out).toContain('Photo ID required at check-in.');
    expect(out).toContain('Pets are not allowed.');
    expect(out).toContain('A deposit of USD 100 may be required.');
  });

  it('returns an empty string when there is nothing to say', () => {
    expect(buildAdditionalInfo(null, null, null)).toBe('');
  });

  it('phrases paid parking and paid pets', () => {
    const out = buildAdditionalInfo(null, {
      parking: [{ inclusion: 'paid', price: 15, currency: 'EUR', price_unit: 'per_day' }],
      pets:    [{ inclusion: 'paid', price: 10, currency: 'EUR' }],
    }, null);
    expect(out).toContain('Parking is available for EUR 15 per day.');
    expect(out).toContain('Pets are allowed for EUR 10.');
  });

  it('phrases free parking', () => {
    const out = buildAdditionalInfo(null, { parking: [{ inclusion: 'included' }] }, null);
    expect(out).toBe('Free parking is available.');
  });
});
