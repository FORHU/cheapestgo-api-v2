// src/lib/hotels/providers/mock/scenarios.ts
/**
 * The failures the mock supplier can be told to produce.
 *
 * Each one exists because a real supplier does it and the booking flow has to survive it:
 *
 *  - `price_up` / `price_down`   the rate re-prices between listing and prebook
 *  - `sold_out`                  listed, then gone when the traveller commits
 *  - `prebook_timeout`           the supplier does not answer a quote
 *  - `book_rejected`             refused after the traveller has paid — nothing is booked
 *  - `book_timeout`              no answer, but the reservation **was** made: the case where
 *                                voiding the payment would leave a guest holding a room
 *  - `cancel_rejected`           the supplier will not cancel
 *  - `cancel_timeout`            no answer, but the cancellation **was** applied
 */
export const MOCK_SCENARIOS = [
    'ok',
    'price_up',
    'price_down',
    'sold_out',
    'prebook_timeout',
    'book_rejected',
    'book_timeout',
    'cancel_rejected',
    'cancel_timeout',
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export function isMockScenario(value: unknown): value is MockScenario {
    return typeof value === 'string' && (MOCK_SCENARIOS as readonly string[]).includes(value);
}
