// src/__tests__/config.hotelProvider.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

const BASE = {
    DATABASE_URL:       'postgresql://u:p@localhost:5432/db',
    JWT_SECRET:         'x',
    JWT_REFRESH_SECRET: 'x',
    COOKIE_SECRET:      'x',
    STRIPE_SECRET_KEY:  'sk_test_x',
};

async function loadConfig(env: Record<string, string>) {
    vi.resetModules();
    for (const [k, v] of Object.entries({ ...BASE, ...env })) vi.stubEnv(k, v);
    return (await import('@/config')).config;
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('config — hotel provider', () => {
    it('defaults to travelgatex', async () => {
        const c = await loadConfig({ NODE_ENV: 'test' });
        expect(c.HOTEL_PROVIDER).toBe('travelgatex');
        expect(c.MOCK_HOTEL_SCENARIO).toBeUndefined();
    });

    it('accepts the mock with a scenario and currency', async () => {
        const c = await loadConfig({ NODE_ENV: 'development', HOTEL_PROVIDER: 'mock', MOCK_HOTEL_SCENARIO: 'price_up', MOCK_HOTEL_CURRENCY: 'PHP' });
        expect(c.HOTEL_PROVIDER).toBe('mock');
        expect(c.MOCK_HOTEL_SCENARIO).toBe('price_up');
        expect(c.MOCK_HOTEL_CURRENCY).toBe('PHP');
    });

    it('exits on an unknown provider or scenario', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const exit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
        await expect(loadConfig({ HOTEL_PROVIDER: 'liteapi' })).rejects.toThrow('exit');
        await expect(loadConfig({ HOTEL_PROVIDER: 'mock', MOCK_HOTEL_SCENARIO: 'on_fire' })).rejects.toThrow('exit');
        expect(exit).toHaveBeenCalledWith(1);
    });

    it('exits when the mock is configured in production', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
        await expect(loadConfig({ NODE_ENV: 'production', HOTEL_PROVIDER: 'mock' })).rejects.toThrow('exit');
    });

    it('lets production run the mock only when explicitly allowed', async () => {
        const c = await loadConfig({ NODE_ENV: 'production', HOTEL_PROVIDER: 'mock', ALLOW_MOCK_HOTEL_PROVIDER: 'true' });
        expect(c.HOTEL_PROVIDER).toBe('mock');
    });
});
