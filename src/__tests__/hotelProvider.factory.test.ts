// src/__tests__/hotelProvider.factory.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cfg = vi.hoisted(() => ({
    HOTEL_PROVIDER: undefined as string | undefined,
    ALLOW_MOCK_HOTEL_PROVIDER: undefined as string | undefined,
    MOCK_HOTEL_SCENARIO: undefined as string | undefined,
    MOCK_HOTEL_CURRENCY: undefined as string | undefined,
}));
vi.mock('@/config', () => ({ config: cfg }));
vi.mock('@/lib/hotels/search', () => ({ runTgxSearch: vi.fn() }));
vi.mock('@/lib/hotels/travelgatex', () => ({ quoteTgx: vi.fn(), bookTgx: vi.fn(), cancelTgx: vi.fn() }));

import {
    createHotelProvider, getHotelProvider, getHotelProviderById, resolveProviderId, setHotelProviderForTests,
} from '@/lib/hotels/providers/factory';
import { MockHotelProvider } from '@/lib/hotels/providers/mock/MockHotelProvider';
import { TravelgateXProvider } from '@/lib/hotels/providers/travelgatex.provider';

beforeEach(() => {
    cfg.HOTEL_PROVIDER = undefined;
    cfg.ALLOW_MOCK_HOTEL_PROVIDER = undefined;
    cfg.MOCK_HOTEL_SCENARIO = undefined;
    cfg.MOCK_HOTEL_CURRENCY = undefined;
    setHotelProviderForTests(null);
});

describe('resolveProviderId', () => {
    it('defaults to TravelgateX', () => {
        expect(resolveProviderId({})).toBe('travelgatex');
    });

    it('accepts the ids it knows', () => {
        expect(resolveProviderId({ provider: 'mock', nodeEnv: 'development' })).toBe('mock');
        expect(resolveProviderId({ provider: 'travelgatex' })).toBe('travelgatex');
    });

    it('refuses an id it does not know, and says what it does', () => {
        expect(() => resolveProviderId({ provider: 'liteapi' })).toThrow(/Unknown HOTEL_PROVIDER "liteapi".*travelgatex, mock/);
    });

    it('refuses the mock in production unless explicitly allowed', () => {
        expect(() => resolveProviderId({ provider: 'mock', nodeEnv: 'production' })).toThrow(/refused in production/);
        expect(resolveProviderId({ provider: 'mock', nodeEnv: 'production', allowMock: 'true' })).toBe('mock');
        expect(resolveProviderId({ provider: 'travelgatex', nodeEnv: 'production' })).toBe('travelgatex');
    });
});

describe('createHotelProvider / getHotelProvider', () => {
    it('builds each provider', () => {
        expect(createHotelProvider('travelgatex')).toBeInstanceOf(TravelgateXProvider);
        expect(createHotelProvider('mock')).toBeInstanceOf(MockHotelProvider);
    });

    it('selects by configuration and reuses the instance', () => {
        expect(getHotelProvider()).toBeInstanceOf(TravelgateXProvider);
        expect(getHotelProvider()).toBe(getHotelProvider());

        cfg.HOTEL_PROVIDER = 'mock';
        expect(getHotelProviderById('mock')).toBeInstanceOf(MockHotelProvider);
    });

    it('passes the mock its scenario and currency from configuration', async () => {
        cfg.MOCK_HOTEL_SCENARIO = 'sold_out';
        cfg.MOCK_HOTEL_CURRENCY = 'PHP';
        const mock = createHotelProvider('mock') as MockHotelProvider;
        const rates = await mock.getRates('MOCK-MNL-001', { checkIn: '2026-11-10', checkOut: '2026-11-12', adults: 2, children: 0 });
        expect(rates[0].currency).toBe('PHP');
        await expect(mock.prebook({ offerId: rates[0].offerId, adults: 2, children: 0, currency: 'PHP' }))
            .rejects.toMatchObject({ code: 'SOLD_OUT' });
    });

    it('lets a test substitute and then restore the provider', () => {
        const fake = new MockHotelProvider();
        setHotelProviderForTests(fake);
        expect(getHotelProvider()).toBe(fake);
        expect(getHotelProviderById('travelgatex')).toBe(fake);

        setHotelProviderForTests(null);
        expect(getHotelProvider()).toBeInstanceOf(TravelgateXProvider);
    });
});
