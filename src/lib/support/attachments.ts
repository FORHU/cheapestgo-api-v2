/**
 * What may be attached to a Support Chat message, and what it is called.
 *
 * The rules only — no database and no bucket, so the parts worth testing can be tested
 * without either. Storing one is `SupportRepository.storeAttachment`; the bytes are in
 * `lib/support/attachmentStorage`.
 *
 * ADR-0040 is the reason the shape of this is unusual: the bucket is private, nothing is
 * served from it, and an attachment is named by a database id whose authorisation is
 * re-checked on every fetch. Nothing here ever produces a URL.
 */

export type AttachmentUploader = 'guest' | 'agent';

/** Ten megabytes: a phone photograph of a document, comfortably, and not a video. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Most files on one message. Five covers "here is the whole email thread" without letting a
 * single send turn into an unbounded number of objects, rows and download routes.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/**
 * What may be uploaded, by what the bytes actually are.
 *
 * Deliberately short. Everything a support conversation genuinely needs is a picture or a PDF,
 * and every addition to this list is a new file type an Agent is being asked to open on a work
 * machine. Office documents and archives are absent for that reason, not by oversight.
 */
export const ALLOWED_CONTENT_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'application/pdf',
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/**
 * What these bytes are, read from the bytes.
 *
 * The browser sends a Content-Type with every part of a multipart body and it is worth
 * nothing: it is derived from the file extension on most platforms and is settable outright by
 * anything that is not a browser. Trusting it means an executable stored and later served as
 * `image/png`, which is the whole of how an upload endpoint becomes a way to host someone
 * else's payload.
 *
 * So the declared type is discarded and the file is identified by its signature. Returns null
 * for anything not on the allowlist, which the caller turns into a refusal.
 */
export function sniffContentType(bytes: Buffer): AllowedContentType | null {
    if (bytes.length < 12) return null;

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

    if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return 'image/png';
    }

    const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('latin1');

    if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';

    // RIFF containers hold more than images; the WEBP fourcc at byte 8 is what narrows it.
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';

    if (ascii(0, 5) === '%PDF-') return 'application/pdf';

    // HEIC is an ISO base media file; the brand after `ftyp` says which flavour. iPhones
    // produce these by default, so a customer photographing a document sends one without
    // having chosen to.
    if (ascii(4, 8) === 'ftyp') {
        const brand = ascii(8, 12);
        if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) {
            return 'image/heic';
        }
    }

    return null;
}

/**
 * A file name safe to store and to echo back.
 *
 * Only ever used for display and for the download's Content-Disposition — never to build a
 * storage key — but a name that arrived from a browser can still carry a path separator, a
 * NUL, or 400 characters of padding, and none of those improve any screen they reach.
 */
export function sanitiseFileName(raw: string): string {
    const base = raw.split(/[\\/]/).pop() ?? '';
    // Control characters filtered by code point rather than by a regex literal: the class
    // would have to contain the very bytes it is removing.
    const cleaned = Array.from(base)
        .filter(ch => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
        .join('')
        .trim();
    return (cleaned || 'attachment').slice(0, 200);
}

/**
 * The S3 key for an attachment.
 *
 * Built from two uuids and nothing else. The customer's file name is not in it, so there is no
 * encoding, traversal or collision question to get right, and a key cannot be guessed from
 * anything the customer knows. The `support/` prefix is what the instance role's policy is
 * scoped to.
 */
export function attachmentStorageKey(conversationId: string, attachmentId: string): string {
    return `support/${conversationId}/${attachmentId}`;
}

/**
 * How long the bytes are kept.
 *
 * A passport page sent to settle one booking is not something to hold indefinitely. The row
 * stays — the transcript still shows that a file was sent, and says it has expired — and only
 * the object goes.
 */
export const ATTACHMENT_RETENTION_DAYS = 90;

/** What a reader of the transcript gets. Deliberately without the storage key (ADR-0040). */
export interface SupportAttachmentView {
    id:             string;
    messageId:      string | null;
    fileName:       string;
    contentType:    string;
    sizeBytes:      number;
    uploadedByType: AttachmentUploader;
    /**
     * Whether, not when. A transcript needs to know the file is gone; the date it went is a
     * question for the row. Omitting this would make every expired attachment read as still
     * present, and the reader would find out only by clicking it.
     */
    bytesDeleted:   boolean;
}
