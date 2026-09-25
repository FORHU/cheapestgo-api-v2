import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * The one place this app talks to S3.
 *
 * ── On credentials ───────────────────────────────────────────────────────────────────
 *
 * There are none here, deliberately. The client is constructed with a region and nothing else,
 * which leaves the SDK's default provider chain to find them: a task role on the box,
 * `~/.aws/credentials` or AWS_PROFILE on a developer's laptop. Both work through the same code
 * path, so there is no `NODE_ENV` branch deciding how to authenticate — the environment answers
 * that by what it makes available.
 *
 * Passing an access key here, or reading one from the environment into a `credentials` block,
 * would defeat that: the SDK stops consulting the chain the moment it is handed something. It
 * would also put a long-lived secret into the deploy's env file, GitHub Secrets and every
 * process listing on the box, to do a job that temporary, auto-rotating role credentials
 * already do.
 *
 * The role needs s3:PutObject, s3:GetObject and s3:DeleteObject on `<bucket>/support/*`, and
 * nothing else.
 */

let _client: S3Client | null = null;

function region(): string {
    const value = process.env.AWS_REGION;
    if (!value) throw new Error('AWS_REGION is not set. Required to store support attachments.');
    return value;
}

/** Lazy singleton. Building one per request would re-resolve credentials every time. */
function client(): S3Client {
    if (!_client) _client = new S3Client({ region: region() });
    return _client;
}

/**
 * The bucket support attachments live in.
 *
 * Read at call time rather than at module load: a missing bucket should fail the one request
 * that needed it, with a message naming the variable, not stop the whole app from starting
 * because a feature nobody has used yet is unconfigured.
 */
function bucket(): string {
    const value = process.env.SUPPORT_ATTACHMENTS_BUCKET;
    if (!value) throw new Error('SUPPORT_ATTACHMENTS_BUCKET is not set. Support attachments cannot be stored.');
    return value;
}

/** True when the feature is configured. The widget hides the paperclip when it is not. */
export function attachmentsConfigured(): boolean {
    return Boolean(process.env.SUPPORT_ATTACHMENTS_BUCKET && process.env.AWS_REGION);
}

export async function putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    await client().send(new PutObjectCommand({
        Bucket:      bucket(),
        Key:         input.key,
        Body:        input.body,
        ContentType: input.contentType,
    }));
}

export async function deleteObject(key: string): Promise<void> {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/**
 * Five minutes: long enough to follow a redirect and load an image, short enough that a URL
 * copied out of a network tab is worthless by the time it is pasted anywhere.
 */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * A short-lived URL for one object, minted per request.
 *
 * Never stored and never put in a transcript (ADR-0040). A stored presigned URL is the same
 * object with an expiry — it turns "readable by anyone holding the link, forever" into "a link
 * in the transcript that silently stops working", and a customer reopening a month-old
 * conversation would find their own evidence gone.
 *
 * `fileName` rides along as the download's filename, so a file saved from the browser is called
 * what the customer called it rather than a uuid.
 */
export async function signedUrlFor(key: string, fileName: string): Promise<string> {
    return getSignedUrl(client(), new GetObjectCommand({
        Bucket: bucket(),
        Key:    key,
        // RFC 5987, because a file name can be Korean and a bare `filename=` cannot carry it.
        ResponseContentDisposition:
            `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    }), { expiresIn: SIGNED_URL_TTL_SECONDS });
}
