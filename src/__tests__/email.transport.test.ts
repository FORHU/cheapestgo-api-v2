// src/__tests__/email.transport.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cfg = vi.hoisted(() => ({
    RESEND_API_KEY: 're_test' as string | undefined,
    EMAIL_TRANSPORT: undefined as string | undefined,
    HOTEL_PROVIDER: undefined as string | undefined,
}));
vi.mock('@/config', () => ({ config: cfg }));
vi.mock('@/lib/brand', () => ({ fromNoReply: () => 'CheapestGo <no-reply@cheapestgo.com>' }));
vi.mock('@/lib/prisma', () => ({
    prisma: { email_logs: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) } },
}));

import { sendTransactionalEmail } from '@/lib/email/send';

const MAIL = { bookingId: 'CG-1', to: 'juan@example.com', subject: 'Booking Confirmed', html: '<p>hi</p>', emailType: 'confirmation' as const };

beforeEach(() => {
    cfg.RESEND_API_KEY = 're_test';
    cfg.EMAIL_TRANSPORT = undefined;
    cfg.HOTEL_PROVIDER = undefined;
    vi.restoreAllMocks();
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
