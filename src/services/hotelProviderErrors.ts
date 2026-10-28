// src/services/hotelProviderErrors.ts
import { AppError } from '@/middleware/error.middleware';
import { HotelProviderError } from '@/lib/hotels/providers/types';

/**
 * A supplier failure, as the response the UI maps to a message.
 *
 * Codes that existed before the provider seam keep their status and code (`INVALID_OFFER`,
 * `UNAVAILABLE`, `NON_MERCHANT`); the new ones follow the convention `nearby` already uses for
 * an upstream that did not answer. Anything that is not a provider error is returned unchanged.
 */
export function toAppError(err: unknown): unknown {
    if (!(err instanceof HotelProviderError)) return err;

    switch (err.code) {
        case 'INVALID_RATE':
            return new AppError(400, err.message, 'INVALID_OFFER');
        case 'SOLD_OUT':
            return new AppError(409, err.message, 'UNAVAILABLE');
        case 'NOT_PAYABLE_ONLINE':
            return new AppError(409, err.message, 'NON_MERCHANT');
        case 'PRICE_CHANGED':
            return new AppError(409, err.message, 'PRICE_CHANGED', {
                serverPrice: err.details.currentTotal,
                currency:    err.details.currency,
            });
        case 'TIMEOUT':
        case 'UNAVAILABLE':
            return new AppError(503, err.message, 'UPSTREAM_UNAVAILABLE');
        case 'REJECTED':
        case 'UNKNOWN_OUTCOME':
            return new AppError(502, err.message, 'UPSTREAM_ERROR');
    }
}
