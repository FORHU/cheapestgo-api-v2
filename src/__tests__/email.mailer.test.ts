// src/__tests__/email.mailer.test.ts
//
// The mailer: which transport carries a message, and what a caller is told when it does not
// arrive. Nodemailer is mocked at the module — nothing here opens a socket.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cfg = vi.hoisted(() => ({
    EMAIL_TRANSPORT:      'smtp' as string | undefined,
    RESEND_API_KEY:       undefined as string | undefined,
    SMTP_HOST:            'smtp.example.com' as string | undefined,
    SMTP_PORT:            587,
    SMTP_SECURE:          undefined as string | undefined,
    SMTP_USER:            'mailer' as string | undefined,
    SMTP_PASS:            'secret' as string | undefined,
    SMTP_MAX_CONNECTIONS: 5,
    SMTP_RATE_PER_SECOND: undefined as number | undefined,
}));
vi.mock('@/config', () => ({ config: cfg }));
vi.mock('@/lib/brand', () => ({ fromNoReply: () => 'CheapestGo <no-reply@mail.cheapestgo.com>' }));

const smtp = vi.hoisted(() => ({
    sendMail:        vi.fn(),
    close:           vi.fn(),
    createTransport: vi.fn(),
}));
vi.mock('nodemailer', () => ({ default: { createTransport: smtp.createTransport } }));

import { mailConfigured, resetMailTransportForTests, sendBulk, sendMail } from '@/lib/email/mailer';

const MESSAGE = { to: 'juan@example.com', subject: 'Reset your password', html: '<p>hi</p>' };

beforeEach(() => {
    Object.assign(cfg, {
        EMAIL_TRANSPORT: 'smtp', RESEND_API_KEY: undefined, SMTP_HOST: 'smtp.example.com', SMTP_PORT: 587,
        SMTP_SECURE: undefined, SMTP_USER: 'mailer', SMTP_PASS: 'secret', SMTP_MAX_CONNECTIONS: 5, SMTP_RATE_PER_SECOND: undefined,
    });
    vi.restoreAllMocks();
    smtp.sendMail.mockReset().mockResolvedValue({ messageId: '<m1@example.com>', rejected: [] });
    smtp.createTransport.mockReset().mockReturnValue({ sendMail: smtp.sendMail, close: smtp.close });
    resetMailTransportForTests();
});

describe('sendMail over SMTP', () => {
    it('sends through one pooled transporter, from the brand by default', async () => {
        expect(await sendMail(MESSAGE)).toEqual({ ok: true, id: '<m1@example.com>' });
        await sendMail(MESSAGE);

        expect(smtp.createTransport).toHaveBeenCalledTimes(1);
        expect(smtp.createTransport).toHaveBeenCalledWith(expect.objectContaining({
            pool: true, host: 'smtp.example.com', port: 587, secure: false,
            auth: { user: 'mailer', pass: 'secret' }, maxConnections: 5,
        }));
        expect(smtp.sendMail).toHaveBeenCalledWith(expect.objectContaining({
            from: 'CheapestGo <no-reply@mail.cheapestgo.com>', to: 'juan@example.com', subject: 'Reset your password',
        }));
    });

    it('speaks TLS from the start on 465, and takes the rate limit when one is set', async () => {
        cfg.SMTP_PORT = 465;
        cfg.SMTP_RATE_PER_SECOND = 10;
        await sendMail(MESSAGE);
        expect(smtp.createTransport).toHaveBeenCalledWith(expect.objectContaining({
            port: 465, secure: true, rateDelta: 1000, rateLimit: 10,
        }));
    });

    it('hands a base64 attachment over as base64', async () => {
        await sendMail({ ...MESSAGE, attachments: [{ filename: 'booking.pdf', content: 'JVBERi0=' }] });
        expect(smtp.sendMail).toHaveBeenCalledWith(expect.objectContaining({
            attachments: [{ filename: 'booking.pdf', content: 'JVBERi0=', encoding: 'base64' }],
        }));
    });

    it('reports a refused recipient as a failure, not a send', async () => {
        smtp.sendMail.mockResolvedValue({ messageId: '<m2>', rejected: ['juan@example.com'], response: '550 no such user' });
        const result = await sendMail(MESSAGE);
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toContain('550');
    });

    it('resolves with the server\'s code when the send throws', async () => {
        smtp.sendMail.mockRejectedValue(Object.assign(new Error('Invalid login'), { responseCode: 535 }));
        expect(await sendMail(MESSAGE)).toEqual({ ok: false, error: '535 Invalid login' });
    });

    it('is not configured without SMTP_HOST, and says so rather than trying', async () => {
        cfg.SMTP_HOST = undefined;
        expect(mailConfigured()).toBe(false);
        expect(await sendMail(MESSAGE)).toEqual({ ok: false, error: 'SMTP_HOST is not set' });
        expect(smtp.createTransport).not.toHaveBeenCalled();
    });
});

describe('sendMail — the other transports', () => {
    it('defaults to Resend while EMAIL_TRANSPORT is unset — the rollback', async () => {
        cfg.EMAIL_TRANSPORT = undefined;
        cfg.RESEND_API_KEY = 're_test';
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ id: 'r1' }), { status: 200 }),
        );
        expect(await sendMail(MESSAGE)).toEqual({ ok: true, id: 'r1' });
        expect(fetchSpy).toHaveBeenCalledWith('https://api.resend.com/emails', expect.anything());
        expect(smtp.sendMail).not.toHaveBeenCalled();
    });

    it('logs and sends nothing on `log`', async () => {
        cfg.EMAIL_TRANSPORT = 'log';
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        expect(await sendMail(MESSAGE)).toEqual({ ok: true });
        expect(info).toHaveBeenCalledWith(expect.stringContaining('juan@example.com'));
        expect(smtp.createTransport).not.toHaveBeenCalled();
    });
});

describe('sendBulk', () => {
    it('sends each recipient their own email over SMTP, a few at a time, and lists who it missed', async () => {
        let inFlight = 0;
        let most = 0;
        smtp.sendMail.mockImplementation(async ({ to }: { to: string }) => {
            inFlight++; most = Math.max(most, inFlight);
            await new Promise(r => setTimeout(r, 2));
            inFlight--;
            return to === 'c@example.com' ? Promise.reject(new Error('mailbox full')) : { messageId: to, rejected: [] };
        });
        const recipients = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(x => `${x}@example.com`);

        const result = await sendBulk(recipients, { subject: 'News', html: '<p>news</p>' }, { concurrency: 3 });

        expect(result.sent).toBe(6);
        expect(result.failed).toEqual([{ to: 'c@example.com', error: 'mailbox full' }]);
        expect(smtp.sendMail).toHaveBeenCalledTimes(7);
        expect(smtp.sendMail.mock.calls.every(([m]) => typeof m.to === 'string')).toBe(true);
        expect(most).toBeLessThanOrEqual(3);
    });

    it('still uses Resend\'s batch endpoint on Resend, fifty to a request', async () => {
        cfg.EMAIL_TRANSPORT = 'resend';
        cfg.RESEND_API_KEY = 're_test';
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('[]', { status: 200 }));
        const recipients = Array.from({ length: 120 }, (_, i) => `u${i}@example.com`);

        const result = await sendBulk(recipients, { subject: 'News', html: '<p>news</p>' });

        expect(result).toEqual({ sent: 120, failed: [] });
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        expect(fetchSpy.mock.calls[0][0]).toBe('https://api.resend.com/emails/batch');
    });
});
