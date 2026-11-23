// src/__tests__/email.transport.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cfg = vi.hoisted(() => ({
    RESEND_API_KEY: 're_test' as string | undefined,
    EMAIL_TRANSPORT: undefined as string | undefined,
    HOTEL_PROVIDER: undefined as string | undefined,
    SMTP_HOST: 'smtp.example.com' as string | undefined,
}));
vi.mock('@/config', () => ({ config: cfg }));
vi.mock('@/lib/brand', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/brand')>()),
    fromNoReply: () => 'CheapestGo <no-reply@cheapestgo.com>',
}));
vi.mock('@/lib/prisma', () => ({
    prisma: { email_logs: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) } },
}));
// The real mailer, with `sendMail` behind a spy: the Resend cases call through to it (and so to
// `fetch`), the SMTP cases stub what the transport answered. The transport itself is
// email.mailer.test's subject.
const mailer = vi.hoisted(() => ({ sendMail: vi.fn(), actualSendMail: null as null | ((...a: any[]) => any) }));
vi.mock('@/lib/email/mailer', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/email/mailer')>();
    mailer.actualSendMail = actual.sendMail;
    return { ...actual, sendMail: mailer.sendMail };
});

import { sendTransactionalEmail } from '@/lib/email/send';
import { prisma } from '@/lib/prisma';

const MAIL = { bookingId: 'CG-1', to: 'juan@example.com', subject: 'Booking Confirmed', html: '<p>hi</p>', emailType: 'confirmation' as const };

beforeEach(() => {
    cfg.RESEND_API_KEY = 're_test';
    cfg.EMAIL_TRANSPORT = undefined;
    cfg.HOTEL_PROVIDER = undefined;
    cfg.SMTP_HOST = 'smtp.example.com';
    vi.restoreAllMocks();
    vi.mocked(prisma.email_logs.create).mockClear();
    mailer.sendMail.mockReset().mockImplementation((...a: any[]) => mailer.actualSendMail!(...a));
});

describe('sendTransactionalEmail — transport', () => {
    it('sends through Resend by default', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);
        expect(await sendTransactionalEmail(MAIL)).toEqual({ success: true });
        expect(fetchSpy).toHaveBeenCalledWith('https://api.resend.com/emails', expect.anything());
    });

    it('logs instead of sending when the hotel provider is the mock', async () => {
        cfg.HOTEL_PROVIDER = 'mock';
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

        expect(await sendTransactionalEmail(MAIL)).toEqual({ success: true });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalledWith(expect.stringContaining('juan@example.com'));
    });

    it('sends booking mail over SMTP when that is the transport, and logs it as sent', async () => {
        cfg.EMAIL_TRANSPORT = 'smtp';
        mailer.sendMail.mockResolvedValue({ ok: true, id: '<m1>' });
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        expect(await sendTransactionalEmail(MAIL)).toEqual({ success: true });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(mailer.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'juan@example.com', subject: 'Booking Confirmed' }));
        expect(prisma.email_logs.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'sent' }) });
    });

    it('queues booking mail when SMTP is chosen but not configured, so the retry job can send it', async () => {
        cfg.EMAIL_TRANSPORT = 'smtp';
        cfg.SMTP_HOST = undefined;

        expect(await sendTransactionalEmail(MAIL)).toEqual({ success: false, error: 'Email service is not configured' });

        expect(mailer.sendMail).not.toHaveBeenCalled();
        expect(prisma.email_logs.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ status: 'queued', metadata: expect.objectContaining({ htmlBody: '<p>hi</p>' }) }),
        });
    });

    it('keeps the HTML of a failed SMTP send for the retry job', async () => {
        cfg.EMAIL_TRANSPORT = 'smtp';
        mailer.sendMail.mockResolvedValue({ ok: false, error: '421 try again later' });
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(await sendTransactionalEmail(MAIL)).toEqual({ success: false, error: '421 try again later' });

        expect(prisma.email_logs.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ status: 'failed', error_message: '421 try again later', metadata: expect.objectContaining({ htmlBody: '<p>hi</p>' }) }),
        });
    });

    it('honours an explicit transport over the provider default', async () => {
        cfg.HOTEL_PROVIDER = 'mock';
        cfg.EMAIL_TRANSPORT = 'resend';
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);
        await sendTransactionalEmail(MAIL);
        expect(fetchSpy).toHaveBeenCalled();

        cfg.HOTEL_PROVIDER = undefined;
        cfg.EMAIL_TRANSPORT = 'log';
        fetchSpy.mockClear();
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
        await sendTransactionalEmail(MAIL);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
