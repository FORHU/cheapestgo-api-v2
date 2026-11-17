/**
 * Text the PDF's font can actually draw.
 *
 * Documents here are set in the standard Helvetica, which covers the Latin-1 / WinAnsi repertoire
 * and nothing else. A character outside it is not left out: the renderer substitutes some glyph it
 * does have. `→` (U+2192) came out as a curly apostrophe, so a status change printed with a stray
 * ’ in the middle of a document a card network reads. A visibly wrong character tells the reader
 * something is off; a plausible wrong one does not — so what cannot be drawn becomes `?`.
 *
 * This is deliberately not a font swap. Setting Korean, say, needs a CJK font file shipped and
 * registered, which is a decision about the product's languages rather than a fix.
 */

/** Characters worth spelling out, because the plain form reads naturally. */
const SPELLED: Record<string, string> = {
    '→': '->',
    '←': '<-',
    '↔': '<->',
};

/** What WinAnsi places in 0x80–0x9F, where Latin-1 has control codes. All of them draw. */
const WIN_ANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

function drawable(ch: string): boolean {
    const code = ch.codePointAt(0)!;
    if (ch === '\n' || ch === '\t') return true;
    if (code >= 0x20 && code <= 0x7e) return true;
    if (code >= 0xa0 && code <= 0xff) return true;
    return WIN_ANSI_EXTRAS.has(ch);
}

function safeString(text: string): string {
    let out = '';
    // `for…of` walks code points, so a character outside the basic plane is one mark, not two.
    for (const ch of text) {
        out += SPELLED[ch] ?? (drawable(ch) ? ch : '?');
    }
    return out;
}

/**
 * Make a value safe to set in a PDF. Strings are cleaned; arrays and plain objects are cleaned
 * through; dates, numbers, booleans and null pass untouched.
 */
export function pdfSafe<T>(value: T): T {
    if (typeof value === 'string') return safeString(value) as unknown as T;
    if (Array.isArray(value)) return value.map(pdfSafe) as unknown as T;
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, pdfSafe(v)]),
        ) as T;
    }
    return value;
}
