import { describe, expect, it } from 'vitest';
import { attachmentStorageKey, sanitiseFileName, sniffContentType } from '@/lib/support/attachments';

/**
 * The pure half of attachments: what a file is, and what it may be called.
 *
 * These are the two decisions a caller cannot be trusted with — the browser's declared
 * Content-Type is not evidence, and a file name arrives as an arbitrary string — so they
 * are tested here without a bucket or a database in the way.
 */

/** A buffer with `head` at the front, padded so it clears the 12-byte minimum. */
function withSignature(head: number[] | string): Buffer {
    const bytes = typeof head === 'string' ? Buffer.from(head, 'latin1') : Buffer.from(head);
    return Buffer.concat([bytes, Buffer.alloc(32)]);
}

describe('sniffContentType', () => {
    it('reads a JPEG from its signature', () => {
        expect(sniffContentType(withSignature([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    });

    it('reads a PNG from its signature', () => {
        expect(sniffContentType(withSignature([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
            .toBe('image/png');
    });

    it('reads both GIF versions', () => {
        expect(sniffContentType(withSignature('GIF87a'))).toBe('image/gif');
        expect(sniffContentType(withSignature('GIF89a'))).toBe('image/gif');
    });

    it('reads a PDF', () => {
        expect(sniffContentType(withSignature('%PDF-1.7'))).toBe('application/pdf');
    });

    it('accepts a WEBP but not another RIFF container', () => {
        expect(sniffContentType(withSignature('RIFF____WEBP'))).toBe('image/webp');
        // A WAV is RIFF too. Matching on RIFF alone would let audio through as an image.
        expect(sniffContentType(withSignature('RIFF____WAVE'))).toBeNull();
    });

    it('accepts the HEIC brands an iPhone actually produces', () => {
        expect(sniffContentType(withSignature('____ftypheic'))).toBe('image/heic');
        expect(sniffContentType(withSignature('____ftypmif1'))).toBe('image/heic');
    });

    it('refuses an ISO container that is not a still image', () => {
        // An MP4 is the same box structure with a different brand.
        expect(sniffContentType(withSignature('____ftypisom'))).toBeNull();
    });

    it('refuses an executable however it is labelled', () => {
        expect(sniffContentType(withSignature('MZ'))).toBeNull();
        expect(sniffContentType(withSignature([0x7f, 0x45, 0x4c, 0x46]))).toBeNull();
    });

    it('refuses a script, which is the case a declared Content-Type would have waved through', () => {
        expect(sniffContentType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    });

    it('refuses anything too short to have a signature', () => {
        expect(sniffContentType(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
        expect(sniffContentType(Buffer.alloc(0))).toBeNull();
    });
});

describe('sanitiseFileName', () => {
    it('keeps an ordinary name as it is', () => {
        expect(sanitiseFileName('booking-confirmation.pdf')).toBe('booking-confirmation.pdf');
    });

    it('keeps only the last segment of a path', () => {
        expect(sanitiseFileName('../../etc/passwd')).toBe('passwd');
        expect(sanitiseFileName('C:\\Users\\me\\passport.jpg')).toBe('passport.jpg');
    });

    it('strips control characters', () => {
        expect(sanitiseFileName('receipt\u0000\u001b.pdf')).toBe('receipt.pdf');
    });

    it('falls back rather than returning an empty name', () => {
        expect(sanitiseFileName('')).toBe('attachment');
        expect(sanitiseFileName('   ')).toBe('attachment');
        expect(sanitiseFileName('folder/')).toBe('attachment');
    });

    it('caps the length', () => {
        expect(sanitiseFileName('a'.repeat(500))).toHaveLength(200);
    });
});

describe('attachmentStorageKey', () => {
    it('is built from ids alone, so nothing the customer typed reaches the key', () => {
        const key = attachmentStorageKey(
            '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222',
        );
        expect(key).toBe(
            'support/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222',
        );
    });

    it('stays under the prefix the instance role is scoped to', () => {
        expect(attachmentStorageKey('a', 'b').startsWith('support/')).toBe(true);
    });
});
