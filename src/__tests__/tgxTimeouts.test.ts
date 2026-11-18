import { describe, it, expect } from 'vitest';
import {
    TGX_QUOTE_TIMEOUT_MS,
    TGX_BOOK_TIMEOUT_MS,
    TGX_QUOTE_ABORT_MS,
    TGX_BOOK_ABORT_MS,
    getTgxSettings,
} from '@/lib/hotels/travelgatex';

/**
 * The budgets OTV states, and the aborts that have to outlast them. See ADR-0006.
 *
 * Three operations, three numbers: search 12s, prebook 55s, book 180s. Only search ever passed
 * one. Quote and book took `getTgxSettings`'s default of 18s inside `tgxGraphQL`'s default 30s
 * abort, so a book the supplier was entitled to spend three minutes on was abandoned at thirty
 * seconds — and abandoning a book does not stop it. The reservation gets made and nothing here
 * is listening.
 *
 * These are plain assertions on constants rather than a network test, deliberately: the bug was
 * a number nobody passed, and a number is what this watches.
 */
describe('the budgets we send OTV', () => {
    it('matches what the supplier allows', () => {
        expect(TGX_QUOTE_TIMEOUT_MS).toBe(55_000);
        expect(TGX_BOOK_TIMEOUT_MS).toBe(180_000);
    });

    it('never cuts the wire before the supplier budget is spent', () => {
        // The abort also covers the response coming back. Cutting at the same instant turns a
        // supplier answer into a network error — which reads as a failed booking.
        expect(TGX_QUOTE_ABORT_MS).toBeGreaterThan(TGX_QUOTE_TIMEOUT_MS);
        expect(TGX_BOOK_ABORT_MS).toBeGreaterThan(TGX_BOOK_TIMEOUT_MS);
    });

    it('gives a book longer than a quote, and a quote longer than a search', () => {
        // The ordering is the contract in miniature: a shop window, a held rate, a reservation.
        const search = Number(process.env.TGX_SEARCH_TIMEOUT_MS ?? 12_000);
        expect(TGX_QUOTE_TIMEOUT_MS).toBeGreaterThan(search);
        expect(TGX_BOOK_TIMEOUT_MS).toBeGreaterThan(TGX_QUOTE_TIMEOUT_MS);
    });

    it('puts the budget where the supplier reads it', () => {
        // `settings.timeout` is the field OTV honours. A budget kept anywhere else is a
        // number we tell ourselves.
        const settings: any = getTgxSettings(undefined, TGX_BOOK_TIMEOUT_MS);
        expect(settings.timeout).toBe(180_000);
    });
});
