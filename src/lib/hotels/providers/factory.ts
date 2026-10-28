// src/lib/hotels/providers/factory.ts
/**
 * Which hotel supplier this process talks to.
 *
 * One environment value selects it (`HOTEL_PROVIDER`), and this is the only place that maps the
 * value to a class. Adding a supplier is a class implementing `HotelProvider`, a `case` here, and
 * an entry in the config enum — nothing in the booking flow changes.
 */

import { config } from '@/config';
import { MockHotelProvider } from './mock/MockHotelProvider';
import { TravelgateXProvider } from './travelgatex.provider';
import type { HotelProvider, ProviderId } from './types';

const IDS: readonly ProviderId[] = ['travelgatex', 'mock'];

function isProviderId(value: string): value is ProviderId {
    return (IDS as readonly string[]).includes(value);
}

/**
 * Validates the configured value. Kept pure so the production guard is testable: a mock
 * supplier in production would charge real cards for reservations that do not exist.
 */
export function resolveProviderId(input: { provider?: string; nodeEnv?: string; allowMock?: string }): ProviderId {
    const id = input.provider ?? 'travelgatex';
    if (!isProviderId(id)) {
        throw new Error(`Unknown HOTEL_PROVIDER "${id}". Expected one of: ${IDS.join(', ')}`);
    }
    if (id === 'mock' && input.nodeEnv === 'production' && input.allowMock !== 'true') {
        throw new Error(
            'HOTEL_PROVIDER=mock is refused in production: it would charge real cards for reservations '
            + 'that do not exist. Set ALLOW_MOCK_HOTEL_PROVIDER=true to override.',
        );
    }
    return id;
}

export function createHotelProvider(id: ProviderId): HotelProvider {
    switch (id) {
        case 'mock':
            return new MockHotelProvider({
                scenario: config.MOCK_HOTEL_SCENARIO,
                currency: config.MOCK_HOTEL_CURRENCY,
            });
        case 'travelgatex':
            return new TravelgateXProvider();
    }
}

const instances = new Map<ProviderId, HotelProvider>();
let override: HotelProvider | null = null;

/**
 * A specific provider, for acting on a booking made through it. A booking remembers its supplier,
 * so a cancellation goes back the way the booking came rather than to whatever is configured now.
 */
export function getHotelProviderById(id: ProviderId): HotelProvider {
    if (override) return override;
    resolveProviderId({ provider: id, nodeEnv: process.env.NODE_ENV, allowMock: config.ALLOW_MOCK_HOTEL_PROVIDER });
    let instance = instances.get(id);
    if (!instance) {
        instance = createHotelProvider(id);
        instances.set(id, instance);
    }
    return instance;
}

/** The provider this environment is configured for. */
export function getHotelProvider(): HotelProvider {
    if (override) return override;
    const id = resolveProviderId({
        provider:  config.HOTEL_PROVIDER,
        nodeEnv:   process.env.NODE_ENV,
        allowMock: config.ALLOW_MOCK_HOTEL_PROVIDER,
    });
    return getHotelProviderById(id);
}

export function isKnownProviderId(value: unknown): value is ProviderId {
    return typeof value === 'string' && isProviderId(value);
}

/** Pass `null` to restore normal selection. Tests only. */
export function setHotelProviderForTests(provider: HotelProvider | null): void {
    override = provider;
    instances.clear();
}
