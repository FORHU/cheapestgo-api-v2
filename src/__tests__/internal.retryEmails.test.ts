/**
 * POST /internal/retry-emails: the second chance for a booking email that did not go out.
 *
 * It re-sends the HTML kept on the email_logs row through whichever transport is configured,
 * and the row says how that went — `sent` with the HTML dropped, or still failed with why.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
    email_logs: { findMany: vi.fn(), update: vi.fn() },
}));
const mailer = vi.hoisted(() => ({
    sendMail:       vi.fn(),
    mailConfigured: vi.fn(),
    mailTransport:  vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/flights/duffel', () => ({ getDuffelOrder: vi.fn() }));
vi.mock('@/lib/flights/mystifly', () => ({ mystiflyRequest: vi.fn() }));
vi.mock('@/lib/flights/search', () => ({ searchFlights: vi.fn(), saveSearch: vi.fn() }));
vi.mock('@/lib/email/flightConfirmation', () => ({ sendFlightConfirmationEmail: vi.fn() }));
vi.mock('@/lib/payments/fxLock', () => ({ lockFx: vi.fn() }));
vi.mock('@/lib/email/mailer', () => mailer);

import internalRouter from '@/routes/internal.route';

function handler() {
    const layer = (internalRouter as any).stack.find((l: any) => l.route?.path === '/retry-emails' && l.route.methods.post);
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle as (req: any, res: any) => Promise<unknown>;
}

function fakeRes() {
    const res: any = { statusCode: 200, body: undefined };
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = (body: unknown) => { res.body = body; return res; };
    return res;
}

async function retry() {
    const res = fakeRes();
    await handler()({ body: {}, headers: {} }, res);
    return res;
}

const FAILED_ROW = {
    id: 'log-1', recipient: 'juan@example.com', subject: 'Booking confirmed',
    metadata: { htmlBody: '<p>your booking</p>', source: 'checkout' },
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mailer.mailConfigured.mockReturnValue(true);
    mailer.mailTransport.mockReturnValue('smtp');
    db.email_logs.findMany.mockResolvedValue([FAILED_ROW]);
    db.email_logs.update.mockResolvedValue({});
});

describe('retry-emails', () => {
    it('re-sends the kept HTML through the mailer and marks the row sent', async () => {
        mailer.sendMail.mockResolvedValue({ ok: true, id: '<m1>' });

        const res = await retry();

        expect(res.body).toMatchObject({ success: true, retried: 1, failed: 0 });
        expect(mailer.sendMail).toHaveBeenCalledWith(expect.objectContaining({
            to: 'juan@example.com', subject: 'Booking confirmed', html: '<p>your booking</p>',
        }));
        const data = db.email_logs.update.mock.calls[0][0].data;
        expect(data.status).toBe('sent');
        expect(data.metadata).not.toHaveProperty('htmlBody');
        expect(data.metadata).toMatchObject({ source: 'checkout' });
    });

    it('keeps the row for next time, with the reason, when the send fails again', async () => {
        mailer.sendMail.mockResolvedValue({ ok: false, error: '421 try again later' });

        const res = await retry();

        expect(res.body).toMatchObject({ retried: 0, failed: 1 });
        expect(db.email_logs.update).toHaveBeenCalledWith({
            where: { id: 'log-1' }, data: { error_message: 'Retry failed: 421 try again later' },
        });
    });

    it('answers 503 and touches nothing when mail is not configured', async () => {
        mailer.mailConfigured.mockReturnValue(false);

        const res = await retry();

        expect(res.statusCode).toBe(503);
        expect(res.body).toEqual({ error: 'Email (smtp) is not configured' });
        expect(db.email_logs.findMany).not.toHaveBeenCalled();
    });
});
