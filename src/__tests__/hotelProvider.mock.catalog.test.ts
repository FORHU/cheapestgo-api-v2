// src/__tests__/hotelProvider.mock.catalog.test.ts
import { describe, it, expect } from 'vitest';
import { MOCK_HOTELS, MOCK_RATE_PLANS, MOCK_ROOM_TYPES, mockImages } from '@/lib/hotels/providers/mock/catalog';
import { MOCK_SCENARIOS, isMockScenario } from '@/lib/hotels/providers/mock/scenarios';
import { addDays, nightDates, partyFactor, roundMoney, stayTotal } from '@/lib/hotels/providers/mock/pricing';

describe('mock catalog', () => {
    it('has unique ids', () => {
        const ids = MOCK_HOTELS.map((h) => h.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('places every property inside the Philippines and gives it something to be searched by', () => {
        for (const h of MOCK_HOTELS) {
            expect(h.lat).toBeGreaterThan(4);
            expect(h.lat).toBeLessThan(22);
            expect(h.lng).toBeGreaterThan(116);
            expect(h.lng).toBeLessThan(128);
            expect(h.terms.length).toBeGreaterThan(0);
            expect(h.terms.every((t) => t === t.toLowerCase())).toBe(true);
            expect(h.baseNightly).toBeGreaterThan(0);
        }
    });

    it('carries one QA hotel per failure scenario', () => {
        const qa = MOCK_HOTELS.filter((h) => h.scenario);
        expect(qa.map((h) => h.scenario).sort()).toEqual(
            ['book_rejected', 'book_timeout', 'cancel_rejected', 'prebook_timeout', 'price_down', 'price_up', 'sold_out'],
        );
        expect(qa.every((h) => h.name.startsWith('QA '))).toBe(true);
    });

    it('offers three room types and three rate plans', () => {
        expect(MOCK_ROOM_TYPES).toHaveLength(3);
        expect(MOCK_RATE_PLANS.map((p) => p.boardCode)).toEqual(['RO', 'BB', 'HB']);
    });

    it('gives each hotel four deterministic images', () => {
        expect(mockImages('MOCK-MNL-001')).toHaveLength(4);
        expect(mockImages('MOCK-MNL-001')).toEqual(mockImages('MOCK-MNL-001'));
    });
});

describe('mock scenarios', () => {
    it('recognises its own names and nothing else', () => {
        for (const s of MOCK_SCENARIOS) expect(isMockScenario(s)).toBe(true);
        expect(isMockScenario('on_fire')).toBe(false);
        expect(isMockScenario(undefined)).toBe(false);
    });
});

describe('mock pricing', () => {
    const hotel = MOCK_HOTELS.find((h) => h.id === 'MOCK-MNL-001')!;
    const room  = MOCK_ROOM_TYPES[0];
    const plan  = MOCK_RATE_PLANS[1]; // BB, multiplier 1.0
    const base  = { hotel, room, plan, adults: 2, children: 0, currency: 'USD' };

    it('lists the date of each night', () => {
        expect(nightDates('2026-11-10', '2026-11-13')).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
        expect(nightDates('2026-11-10', '2026-11-10')).toEqual(['2026-11-10']);
    });

    it('adds days without a timezone moving the date', () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('prices a Tuesday-to-Thursday stay at base × nights', () => {
        expect(stayTotal({ ...base, checkIn: '2026-11-10', checkOut: '2026-11-12' })).toBe(240);
    });

    it('charges 15% more for Friday and Saturday nights', () => {
        expect(stayTotal({ ...base, checkIn: '2026-11-13', checkOut: '2026-11-15' })).toBe(276);
    });

    it('is a pure function', () => {
        const a = stayTotal({ ...base, checkIn: '2026-11-10', checkOut: '2026-11-12' });
        const b = stayTotal({ ...base, checkIn: '2026-11-10', checkOut: '2026-11-12' });
        expect(a).toBe(b);
    });

    it('charges more for a bigger party', () => {
        expect(partyFactor(2, 0)).toBe(1);
        expect(partyFactor(3, 0)).toBeCloseTo(1.2);
        expect(partyFactor(2, 2)).toBeCloseTo(1.2);
    });

    it('rounds KRW to whole won and other currencies to two decimals', () => {
        expect(roundMoney(1234.5678, 'KRW')).toBe(1235);
        expect(roundMoney(1234.5678, 'USD')).toBe(1234.57);
        const krw = stayTotal({ ...base, currency: 'KRW', checkIn: '2026-11-10', checkOut: '2026-11-12' });
        expect(Number.isInteger(krw)).toBe(true);
        expect(krw).toBe(240 * 1380);
    });
});
