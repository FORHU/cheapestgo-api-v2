import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config', () => ({ config: { RESEND_API_KEY: 'test-key', SITE_URL: 'https://cheapestgo.com' } }));

const { prismaMock } = vi.hoisted(() => ({ prismaMock: {
    email_logs:      { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    flight_bookings: { findUnique: vi.fn() },
    booking_sessions:{ findUnique: vi.fn() },
} }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { sendTransactionalEmail } from '@/lib/email/send';
import { buildHotelConfirmationHtml, buildFlightConfirmationHtml } from '@/lib/email/templates';
import { policyEmailText } from '@/lib/email/policyText';
import { sendFlightConfirmationEmail } from '@/lib/email/flightConfirmation';

/**
 * The confirmation a customer is owed after paying. What is checked here is the part that
 * goes wrong quietly: an email sent twice, an email never sent and never recorded, a total of
 * zero, and customer text landing unescaped in HTML someone else's mail client will render.
 */

const HOTEL = {
    bookingRef:   'FORHU-123-ABC',
    bookingDbId:  '11111111-2222-3333-4444-555555555555',
    guestName:    'Ana Cruz',
    propertyName: 'Hotel Naru',
    roomName:     'Deluxe Twin',
    checkIn:      '2026-10-01',
    checkOut:     '2026-10-04',
    nights:       3,
    adults:       2,
    children:     0,
    totalPrice:   12500,
    currency:     'PHP',
    policyText:   'This is a non-refundable rate.',
};

const FLIGHT = {
    bookingId:     'bk-1',
    pnr:           'JZRWME',
    passengerName: 'Ana Cruz',
    provider:      'duffel',
    segments: [{ airline: 'Philippine Airlines', flightNumber: 'PR 424', origin: 'MNL', destination: 'ICN', departure: '2026-11-02T08:15:00Z' }],
    totalPrice:    41230.5,
    currency:      'PHP',
};

beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.email_logs.findFirst.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 're_1' }) }));
});

describe('sendTransactionalEmail', () => {
    const base = { bookingId: 'bk-1', to: 'ana@example.test', subject: 'Hi', html: '<p>hi</p>', emailType: 'confirmation' as const };

    it('sends once and records it as sent', async () => {
        const res = await sendTransactionalEmail(base);

        expect(res.success).toBe(true);
        expect(fetch).toHaveBeenCalledOnce();
        expect(prismaMock.email_logs.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'sent', email_type: 'confirmation' }) }),
        );
    });

    it('does not send a second confirmation for the same booking', async () => {
        // The checkout call, the Stripe webhook and the recovery cron can each reach this.
        prismaMock.email_logs.findFirst.mockResolvedValue({ id: 'log-1' });

        const res = await sendTransactionalEmail(base);

        expect(res).toEqual({ success: true, duplicate: true });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('lets a booking receive both the booked and the ticketed email', async () => {
        // Different types, so the ticket that arrives later is still announced.
        prismaMock.email_logs.findFirst.mockImplementation(({ where }: any) =>
            Promise.resolve(where.email_type === 'awaiting_ticket' ? { id: 'log-1' } : null));

        const first  = await sendTransactionalEmail({ ...base, emailType: 'awaiting_ticket' });
        const second = await sendTransactionalEmail({ ...base, emailType: 'ticketed' });

        expect(first.duplicate).toBe(true);
        expect(second.success).toBe(true);
        expect(second.duplicate).toBeUndefined();
    });

    it('keeps the rendered HTML when a send fails, so the retry job can re-send it', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'bad domain' }));

        const res = await sendTransactionalEmail(base);

        expect(res.success).toBe(false);
        const logged = prismaMock.email_logs.create.mock.calls[0][0].data;
        expect(logged.status).toBe('failed');
        expect(logged.metadata.htmlBody).toBe('<p>hi</p>');
    });

    it('queues rather than drops the mail when Resend is not configured', async () => {
        const { config } = await import('@/config');
        (config as any).RESEND_API_KEY = '';
        try {
            await sendTransactionalEmail(base);
            const logged = prismaMock.email_logs.create.mock.calls[0][0].data;
            expect(logged.status).toBe('queued');
            expect(logged.metadata.htmlBody).toBe('<p>hi</p>');
        } finally {
            (config as any).RESEND_API_KEY = 'test-key';
        }
    });

    it('never throws at a caller that has already taken the money', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
        await expect(sendTransactionalEmail(base)).resolves.toMatchObject({ success: false });
    });
});

describe('buildHotelConfirmationHtml', () => {
    it('states the reference, the stay and what was charged', () => {
        const html = buildHotelConfirmationHtml(HOTEL);

        expect(html).toContain('FORHU-123-ABC');
        expect(html).toContain('Hotel Naru');
        expect(html).toContain('Deluxe Twin');
        expect(html).toContain('3 nights');
        expect(html).toContain('₱12,500.00');
        expect(html).toContain('This is a non-refundable rate.');
    });

    it('links self-service at the booking UUID, not the supplier reference', () => {
        // The trips page and the receipt both answer to the UUID (ADR-0027).
        const html = buildHotelConfirmationHtml(HOTEL);

        expect(html).toContain(`https://cheapestgo.com/trips/${HOTEL.bookingDbId}`);
        expect(html).toContain(`/trips/invoice/${HOTEL.bookingDbId}?type=hotel`);
        expect(html).not.toContain('/trips/FORHU-123-ABC');
    });

    it('offers no manage links when the row id is unknown', () => {
        const html = buildHotelConfirmationHtml({ ...HOTEL, bookingDbId: null });

        expect(html).toContain('please contact support');
        expect(html).not.toContain('Manage my booking');
    });

    it('escapes what the guest typed', () => {
        const html = buildHotelConfirmationHtml({
            ...HOTEL,
            guestName:       'Ana <script>alert(1)</script>',
            specialRequests: '<a href="http://evil.test">Claim your refund</a>',
        });

        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<a href="http://evil.test"');
        expect(html).toContain('&lt;script&gt;');
    });

    it('shows a credit as its own line, above the amount actually paid', () => {
        const html = buildHotelConfirmationHtml({ ...HOTEL, discountAmount: 500 });

        expect(html).toContain('₱13,000.00'); // room total before the credit
        expect(html).toContain('₱500.00');
        expect(html).toContain('₱12,500.00'); // what the card was charged
    });
});

describe('buildFlightConfirmationHtml', () => {
    it('says the ticket is issued when it is', () => {
        const html = buildFlightConfirmationHtml({ ...FLIGHT, ticketNumbers: ['0791234567890'] });

        expect(html).toContain('Your flight is confirmed');
        expect(html).toContain('0791234567890');
        expect(html).toContain('JZRWME');
        expect(html).toContain('MNL → ICN');
    });

    it('says the ticket is still coming when it is not', () => {
        const html = buildFlightConfirmationHtml({ ...FLIGHT, awaitingTicket: true });

        expect(html).toContain('ticket on the way');
        expect(html).not.toContain('Your ticket has been issued');
    });

    it('prints the departure in the airport local time, wherever the process runs', () => {
        // Segments are stored as the airline's naive local time tagged +00, so the email has
        // to read them back in UTC. Formatted in the process timezone this is 8 hours out.
        const html = buildFlightConfirmationHtml(FLIGHT);

        expect(html).toContain('2 Nov 2026, 08:15');
    });

    it('prints no departure time for a segment that has none', () => {
        // Rather than today's date, which is what a `new Date()` fallback produced.
        const html = buildFlightConfirmationHtml({
            ...FLIGHT,
            segments: [{ ...FLIGHT.segments[0], departure: null }],
        });

        expect(html).toContain('MNL → ICN');
        expect(html).not.toContain(new Date().getFullYear() + ',');
    });
});

describe('policyEmailText', () => {
    it('names the date a refundable rate stops being free', () => {
        const text = policyEmailText({ policyType: 'tiered', freeCancelDeadline: new Date('2026-09-28T00:00:00Z') });
        expect(text).toContain('28 Sept 2026');
    });

    it('does not promise free cancellation for a tiered rate with no readable deadline', () => {
        const text = policyEmailText({ policyType: 'tiered', freeCancelDeadline: null });
        expect(text).not.toMatch(/free to cancel/i);
    });

    it('is unambiguous about a non-refundable rate', () => {
        const text = policyEmailText({ policyType: 'non_refundable', freeCancelDeadline: null });
        expect(text).toContain('non-refundable');
    });
});

describe('sendFlightConfirmationEmail', () => {
    const booking = {
        id: 'bk-1', pnr: 'JZRWME', status: 'ticketed', provider: 'duffel', session_id: 'sess-1',
        charged_price: 41230.5, confirmed_price: 41230.5, total_price: 41230.5,
        confirmed_currency: 'PHP', currency: 'PHP', ticket_numbers: ['0791234567890'],
        flight_segments: [{ airline: 'PAL', flight_number: 'PR 424', origin: 'MNL', destination: 'ICN', departure: new Date('2026-11-02T08:15:00Z') }],
        passengers: [{ first_name: 'Ana', last_name: 'Cruz' }],
    };

    it('bills the amount actually charged, not zero', async () => {
        // v1's mobile path sent every confirmation as `0 USD`.
        prismaMock.flight_bookings.findUnique.mockResolvedValue(booking);
        prismaMock.booking_sessions.findUnique.mockResolvedValue({ contact: { email: 'ana@example.test' } });

        await sendFlightConfirmationEmail('bk-1');

        const sent = JSON.parse((fetch as any).mock.calls[0][1].body);
        expect(sent.html).toContain('₱41,230.50');
        expect(sent.html).not.toContain('$0.00');
        expect(sent.to).toEqual(['ana@example.test']);
    });

    it('sends nothing when the booking has no contact address', async () => {
        prismaMock.flight_bookings.findUnique.mockResolvedValue(booking);
        prismaMock.booking_sessions.findUnique.mockResolvedValue({ contact: {} });

        const res = await sendFlightConfirmationEmail('bk-1');

        expect(res.success).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('sends nothing for a booking with no PNR', async () => {
        prismaMock.flight_bookings.findUnique.mockResolvedValue({ ...booking, pnr: null });

        const res = await sendFlightConfirmationEmail('bk-1');

        expect(res.success).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('describes a booking awaiting its ticket as such', async () => {
        prismaMock.flight_bookings.findUnique.mockResolvedValue({ ...booking, status: 'awaiting_ticket', ticket_numbers: [] });
        prismaMock.booking_sessions.findUnique.mockResolvedValue({ contact: { email: 'ana@example.test' } });

        await sendFlightConfirmationEmail('bk-1');

        const sent = JSON.parse((fetch as any).mock.calls[0][1].body);
        expect(sent.subject).toContain('Flight booked');
        expect(sent.html).toContain('ticket on the way');
        expect(prismaMock.email_logs.create.mock.calls[0][0].data.email_type).toBe('awaiting_ticket');
    });
});
