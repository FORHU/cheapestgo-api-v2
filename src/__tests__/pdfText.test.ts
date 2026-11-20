import { describe, it, expect } from 'vitest';
import { pdfSafe } from '@/lib/pdfText';

/**
 * The PDF is set in the standard Helvetica, which draws only the Latin-1 / WinAnsi repertoire.
 * Anything else is not omitted: the renderer picks some other glyph. U+2192 (→) came out as a
 * curly apostrophe, so "Stay PAYMENT_PENDING → PAYMENT_AUTHORIZED" printed with a ’ in the middle
 * of a document a card network reads. A visibly wrong character is honest; a plausible wrong one
 * is not.
 */

describe('pdfSafe', () => {
    it('spells an arrow out rather than letting the font substitute a different glyph', () => {
        expect(pdfSafe('Stay PAYMENT_PENDING → PAYMENT_AUTHORIZED')).toBe('Stay PAYMENT_PENDING -> PAYMENT_AUTHORIZED');
        expect(pdfSafe('a ← b')).toBe('a <- b');
    });

    it('leaves what the font can draw exactly as it was', () => {
        const ok = 'visa ···· 4242 — “quoted” • café 8557.36 PHP €5 …';
        expect(pdfSafe(ok)).toBe(ok);
    });

    it('marks what the font cannot draw with a question mark, one per character', () => {
        expect(pdfSafe('김민수')).toBe('???');
        expect(pdfSafe('ok ✓')).toBe('ok ?');
    });

    it('does not split a character outside the basic plane into two marks', () => {
        expect(pdfSafe('a😀b')).toBe('a?b');
    });

    it('keeps line breaks and tabs', () => {
        expect(pdfSafe('one\ntwo\tthree')).toBe('one\ntwo\tthree');
    });

    it('is applied through nested data, leaving dates and non-strings alone', () => {
        const at = new Date('2026-11-13T02:00:00Z');
        const out = pdfSafe({ a: 'x → y', n: 5, ok: true, nothing: null, at, list: ['김', { deep: '→' }] });
        expect(out).toEqual({ a: 'x -> y', n: 5, ok: true, nothing: null, at, list: ['?', { deep: '->' }] });
        expect(out.at).toBe(at);
    });
});
