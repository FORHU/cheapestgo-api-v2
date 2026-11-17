/**
 * The one place mail leaves the API.
 *
 * Every send — booking mail through `send.ts`, the password reset, the cron reports, the retry
 * job, the confirmation a traveller asks to be re-sent, the admin blast — comes here, so which
 * service carries it is one setting rather than seven copies of a `fetch`.
 *
 * `EMAIL_TRANSPORT` picks it:
 *  - `smtp`   — Nodemailer over a pooled SMTP connection. What this is moving to.
 *  - `resend` — the Resend HTTP API. The default while the move is rolled out dev → prod, so a
 *               bad rollout is undone by flipping one variable back. Delete it, and the
 *               `RESEND_API_KEY` setting, once production has run on SMTP.
 *  - `log`    — written to the console, never sent.
 *
 * Neither function here throws: a caller learns what happened from the result, and mail is
 * never allowed to take a booking, a reset or a cron run down with it. Whether a failure is
 * logged, retried or answered with a 502 stays the caller's call.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '@/config';
import { fromNoReply } from '@/lib/brand';

export type MailTransport = 'smtp' | 'resend' | 'log';

export interface MailAttachment {
    filename: string;
    /** Base64, as the PDF renderer hands it over. */
    content:  string;
}

export interface MailMessage {
    to:           string;
    subject:      string;
    html:         string;
    /** Defaults to the brand's no-reply address — `fromNoReply()`. */
    from?:        string;
    attachments?: MailAttachment[];
}

export type MailResult =
    | { ok: true;  id?: string }
    | { ok: false; error: string };

/** Which transport this process sends with. `send.ts` layers its mock-provider default on top. */
export function mailTransport(): MailTransport {
    return config.EMAIL_TRANSPORT ?? 'resend';
}

/**
 * Can mail be sent at all? What every "is the key set" guard used to ask, asked of whichever
 * transport is in use. `log` always can — it has nowhere to fail to reach.
 */
export function mailConfigured(transport: MailTransport = mailTransport()): boolean {
    if (transport === 'log') return true;
    if (transport === 'smtp') return Boolean(config.SMTP_HOST);
    return Boolean(config.RESEND_API_KEY);
}

// ── SMTP ─────────────────────────────────────────────────────────────────────

let smtp: Transporter | null = null;

/**
 * One pooled transporter for the process, made on first use.
 *
 * Pooled because the cron reports, the retry job and the admin blast send in runs: a fresh TLS
 * handshake and AUTH per message is slow, and providers count connections as well as messages.
 * The rate limit is the pool's, across every caller, which is what a provider's limit is too.
 */
function smtpTransport(): Transporter {
    if (smtp) return smtp;
    const port = config.SMTP_PORT ?? 587;
    const rate = config.SMTP_RATE_PER_SECOND;
    smtp = nodemailer.createTransport({
        pool:           true,
        host:           config.SMTP_HOST,
        port,
        secure:         config.SMTP_SECURE ? config.SMTP_SECURE === 'true' : port === 465,
        auth:           config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS ?? '' } : undefined,
        maxConnections: config.SMTP_MAX_CONNECTIONS ?? 5,
        ...(rate ? { rateDelta: 1000, rateLimit: rate } : {}),
    });
    return smtp;
}

/** For tests: drop the cached transporter so the next send builds one from the current config. */
export function resetMailTransportForTests(): void {
    smtp?.close();
    smtp = null;
}

async function sendSmtp(m: MailMessage & { from: string }): Promise<MailResult> {
    try {
        const info = await smtpTransport().sendMail({
            from:        m.from,
            to:          m.to,
            subject:     m.subject,
            html:        m.html,
            attachments: m.attachments?.map(a => ({ filename: a.filename, content: a.content, encoding: 'base64' })),
        });
        // A server that takes the message for some recipients and refuses the rest still answers
        // without throwing. There is only ever one recipient here, so any refusal is the answer.
        if (info.rejected?.length) return { ok: false, error: `SMTP rejected ${String(info.rejected[0])}: ${info.response ?? ''}`.trim() };
        return { ok: true, id: info.messageId };
    } catch (err: any) {
        // `responseCode` is the server's — 550 no such mailbox, 421 try later, 535 bad login.
        const code = err?.responseCode ? `${err.responseCode} ` : '';
        return { ok: false, error: `${code}${String(err?.message ?? err)}`.slice(0, 300) };
    }
}

// ── Resend (until production has run on SMTP) ────────────────────────────────

const RESEND_URL = 'https://api.resend.com';

async function sendResend(m: MailMessage & { from: string }): Promise<MailResult> {
    try {
        const res = await fetch(`${RESEND_URL}/emails`, {
            method:  'POST',
            headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                from:    m.from,
                to:      [m.to],
                subject: m.subject,
                html:    m.html,
                ...(m.attachments?.length ? { attachments: m.attachments } : {}),
            }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { ok: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
        }
        // The id is a nicety. Accepted is accepted, whatever the body turns out to be.
        const body = await Promise.resolve().then(() => res.json()).catch(() => null) as { id?: string } | null;
        return { ok: true, id: body?.id };
    } catch (err: any) {
        return { ok: false, error: String(err?.message ?? err).slice(0, 300) };
    }
}

// ── Sending ──────────────────────────────────────────────────────────────────

/** Sends one message. Resolves, never rejects. */
export async function sendMail(message: MailMessage): Promise<MailResult> {
    const transport = mailTransport();
    const m = { ...message, from: message.from ?? fromNoReply() };

    if (transport === 'log') {
        console.info(`[mail] transport=log — not sending to ${m.to}: ${m.subject}`);
        return { ok: true };
    }
    if (!mailConfigured(transport)) {
        return { ok: false, error: transport === 'smtp' ? 'SMTP_HOST is not set' : 'RESEND_API_KEY is not set' };
    }
    return transport === 'smtp' ? sendSmtp(m) : sendResend(m);
}

export interface BulkResult {
    sent:   number;
    failed: { to: string; error: string }[];
}

/**
 * The same message to many people, each as their own email (never one To: line with everyone
 * on it).
 *
 * SMTP has no batch call, so it is one send per recipient, `concurrency` at a time. The pool's
 * connection cap and `SMTP_RATE_PER_SECOND` throttle underneath that, so a provider's limit is
 * respected however many are in flight. Resend keeps its batch endpoint while it is still the
 * rollback: one request per recipient would run straight into its per-second rate limit.
 */
export async function sendBulk(
    recipients: string[],
    message: Omit<MailMessage, 'to'>,
    { concurrency = config.SMTP_MAX_CONNECTIONS ?? 5 }: { concurrency?: number } = {},
): Promise<BulkResult> {
    const transport = mailTransport();
    const result: BulkResult = { sent: 0, failed: [] };

    if (transport === 'resend' && mailConfigured(transport)) {
        const from = message.from ?? fromNoReply();
        const BATCH = 50; // Resend's batch limit
        for (let i = 0; i < recipients.length; i += BATCH) {
            const batch = recipients.slice(i, i + BATCH);
            try {
                const res = await fetch(`${RESEND_URL}/emails/batch`, {
                    method:  'POST',
                    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                    body:    JSON.stringify(batch.map(to => ({ from, to: [to], subject: message.subject, html: message.html }))),
                });
                if (res.ok) { result.sent += batch.length; continue; }
                const text = await res.text().catch(() => '');
                for (const to of batch) result.failed.push({ to, error: `Resend ${res.status}: ${text.slice(0, 200)}` });
            } catch (err: any) {
                for (const to of batch) result.failed.push({ to, error: String(err?.message ?? err).slice(0, 200) });
            }
        }
        return result;
    }

    let next = 0;
    const worker = async () => {
        while (next < recipients.length) {
            const to = recipients[next++];
            const r = await sendMail({ ...message, to });
            if (r.ok) result.sent++;
            else result.failed.push({ to, error: r.error });
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, recipients.length)) }, worker));
    return result;
}
