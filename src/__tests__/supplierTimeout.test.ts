import { describe, it, expect } from 'vitest';
import { isSupplierTimeout } from '@/lib/hotels/search';

/**
 * TravelgateX reports a supplier that ran out of time and a supplier that answered with
 * nothing using the same error — ALL_PROCESSES_FAILED, described only as "See warnings for
 * more information". Telling them apart decides whether we spend 3 seconds and a second full
 * round of supplier requests re-asking a question that already has a final answer.
 */
describe('isSupplierTimeout', () => {
    it('recognises a supplier that never answered', () => {
        expect(isSupplierTimeout([
            { code: '', type: '104', description: 'Access `38327` returned:  Connection timeout with supplier' },
        ])).toBe(true);
    });

    it('does not mistake "no results found" for a timeout', () => {
        // The expensive one. OTV answered; there is simply nothing for these dates, and
        // asking again returns the same empty answer 3 seconds later.
        expect(isSupplierTimeout([
            { code: '', type: '204', description: 'Access `38327` returned:  No results found' },
        ])).toBe(false);
    });

    it('retries when any access timed out, even alongside one that answered', () => {
        expect(isSupplierTimeout([
            { code: '', type: '204', description: 'Access `38327` returned:  No results found' },
            { code: '', type: '104', description: 'Access `38327` returned:  Connection timeout with supplier' },
        ])).toBe(true);
    });

    it('reads the description when the numeric type is missing', () => {
        // TGX leaves `code` empty and has changed `type` before; the words are the stable part.
        expect(isSupplierTimeout([{ description: 'Connection timeout with supplier' }])).toBe(true);
    });

    it('treats no warnings as no evidence of a timeout', () => {
        expect(isSupplierTimeout([])).toBe(false);
    });
});
