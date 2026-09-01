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

  it('renders an available (not_included) extra bed with its price, and a free cot', () => {
    const mp: MetapolicyStruct = {
      cot: [{ inclusion: 'not_included', price: '0', currency: 'THB', price_unit: 'per_room_per_night' }],
      extra_bed: [{ inclusion: 'not_included', price: '600', currency: 'THB', price_unit: 'per_guest_per_night' }],
    };
    const beds = buildPolicySections(mp).find((s) => s.id === 'beds-extra')!;
    expect(beds.items.map((i) => i.label)).toEqual([
      'Cot available',
      'Extra bed: THB 600 per guest per night',
    ]);
  });

  it('emits no beds-extra section when cot/extra bed are not_available', () => {
    const mp: MetapolicyStruct = {
      cot: [{ inclusion: 'not_available' }],
      extra_bed: [{ inclusion: 'unavailable' }],
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

  it('flattens HTML in the ETG free-text fields', () => {
    const out = buildAdditionalInfo(
      '<p><b>Check-in and Check-out Times</b></p> <ul>   <li>Check-in:  After 14:00</li>   <li>Check-out:  Before 12:00</li> </ul>',
      null, null,
    );
    expect(out).not.toMatch(/<[a-z]/i);
    expect(out).toContain('Check-in and Check-out Times');
    expect(out).toContain('• Check-in: After 14:00');
  });
});
