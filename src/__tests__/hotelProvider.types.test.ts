// src/__tests__/hotelProvider.types.test.ts
import { describe, it, expect } from 'vitest';
import { HotelProviderError, isHotelProviderError } from '@/lib/hotels/providers/types';
import type { HotelProviderErrorCode } from '@/lib/hotels/providers/types';

const CODES: HotelProviderErrorCode[] = [
    'INVALID_RATE', 'SOLD_OUT', 'PRICE_CHANGED', 'NOT_PAYABLE_ONLINE',
    'REJECTED', 'TIMEOUT', 'UNKNOWN_OUTCOME', 'UNAVAILABLE',
];

describe('HotelProviderError', () => {
    it('carries a code the caller branches on and a message a person can read', () => {
        const err = new HotelProviderError('SOLD_OUT', 'Room is gone', { provider: 'mock' });
        expect(err.code).toBe('SOLD_OUT');
        expect(err.message).toBe('Room is gone');
        expect(err.details.provider).toBe('mock');
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('HotelProviderError');
    });

    it.each(CODES)('flags only UNKNOWN_OUTCOME as a mutation that may have landed (%s)', (code) => {
        expect(new HotelProviderError(code, 'x').mutationMayHaveLanded).toBe(code === 'UNKNOWN_OUTCOME');
    });

    it('is recognised by isHotelProviderError, and a plain Error is not', () => {
        expect(isHotelProviderError(new HotelProviderError('REJECTED', 'no'))).toBe(true);
        expect(isHotelProviderError(new Error('no'))).toBe(false);
        expect(isHotelProviderError(undefined)).toBe(false);
    });
});
