/**
 * Telling the team a golf request needs answering. An unanswered request is declined at its deadline,
 * so a request nobody hears about is a booking lost. These pin down who is told, what they are told,
 * and that telling them can never get in the way of the booking.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GolfBooking } from '@/repositories/golfBookings.repository';

const send = vi.hoisted(() => vi.fn(async () => ({ success: true })));
const notify = vi.hoisted(() => vi.fn(async () => undefined));
const findMany = vi.hoisted(() => vi.fn(async () => [{ email: 'ada@cheapestgo.test' }, { email: 'ben@cheapestgo.test' }]));

vi.mock('@/config', () => ({ config: { SITE_URL: 'https://cheapestgo.test/' } }));
vi.mock('@/lib/email/send', () => ({ sendTransactionalEmail: send }));
vi.mock('@/lib/admin/notify', () => ({ createNotification: notify }));
vi.mock('@/lib/prisma', () => ({ prisma: { users: { findMany } } }));

import { golfTeamAlerts } from '@/lib/golf/teamAlerts';
import { buildGolfBookingEmail } from '@/lib/golf/emails';

const booking = (over: Partial<GolfBooking> = {}): GolfBooking => ({
    id: 'b-1', reference: 'CG-ABC123', userId: 'u-1', courseId: 'c-1', teeTimeId: 't-1', players: 2,
    leadName: 'Pat Golfer', contactEmail: 'pat@example.com', courseCurrency: 'JPY', pricePerPlayer: 12000,
    currency: 'KRW', fxRate: 8.5, greenFee: 204000, extrasTotal: 0, extras: [], serviceFee: 500, total: 204500, paymentIntentId: 'pi_1',
    status: 'requested', holdExpiresAt: '2026-11-05T00:15:00Z', requestedAt: '2026-11-05T00:00:00Z',
    decideBy: '2026-11-07T00:00:00Z', confirmedAt: null, closedAt: null, closeReason: null,
    createdAt: '2026-11-05T00:00:00Z', startsAt: '2026-11-20T00:00:00Z',
    course: { slug: 'fuji', name: 'Fuji Lakeside', city: 'Gotemba', country: 'Japan', timezone: 'Asia/Tokyo', imageUrl: null },
    ...over,
} as GolfBooking);

type Sent = { to: string; subject: string; html: string; emailType: string };
const sentTo = () => (send.mock.calls as unknown as Array<[Sent]>).map(([m]) => m.to);
const firstMail = () => (send.mock.calls as unknown as Array<[Sent]>)[0][0];

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GOLF_TEAM_EMAIL;
});
afterEach(() => { delete process.env.GOLF_TEAM_EMAIL; });

describe("the customer's email", () => {
    it('shows each extra at what they pay for it, never what the course asks', () => {
        const { html } = buildGolfBookingEmail('requested', booking({
            extras: [{ code: 'cart', quantity: 2, unitPrice: 1500, total: 25500 }], extrasTotal: 25500,
        }));
        expect(html).toContain('Golf cart × 2');
        expect(html).toContain('₩25,500');
        expect(html).not.toContain('¥1,500');
    });

    it('has no extras lines when there are none', () => {
        expect(buildGolfBookingEmail('requested', booking()).html).not.toContain(' × ');
    });
});

describe('who is told', () => {
    it('tells every admin account when no team address is set', async () => {
        await golfTeamAlerts.newRequest(booking());
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { role: 'admin' } }));
        expect(sentTo()).toEqual(['ada@cheapestgo.test', 'ben@cheapestgo.test']);
    });

    it('tells the team address alone when one is set', async () => {
        process.env.GOLF_TEAM_EMAIL = 'golf@cheapestgo.test';
        await golfTeamAlerts.newRequest(booking());
        expect(sentTo()).toEqual(['golf@cheapestgo.test']);
        expect(findMany).not.toHaveBeenCalled();
    });

    it('does not tie the mail to the booking, so a second admin is not suppressed as a duplicate', async () => {
        await golfTeamAlerts.newRequest(booking());
        for (const [mail] of send.mock.calls as unknown as Array<[{ bookingId?: string | null }]>) {
            expect(mail.bookingId ?? null).toBeNull();
        }
    });
});

describe('what they are told', () => {
    it('names the booking, the party, the money, and the deadline on the course clock', async () => {
        await golfTeamAlerts.newRequest(booking());
        const { subject, html } = firstMail();
        expect(subject).toContain('CG-ABC123');
        expect(subject).toContain('Fuji Lakeside');
        expect(html).toContain('Pat Golfer');
        expect(html).toContain('pat@example.com');
        // 00:00 UTC is 9:00 AM in Tokyo.
        expect(html).toContain('Fri, 20 Nov 2026, 9:00 AM');
        expect(html).toContain('Sat, 7 Nov 2026, 9:00 AM');
        expect(html).toContain('₩204,500');
        // What to quote to the course: its own price, in its own currency.
        expect(html).toContain('¥24,000');
    });

    it('says what to arrange with the course, at what the course asks, and counts it in the course price', async () => {
        await golfTeamAlerts.newRequest(booking({
            extras: [{ code: 'caddie', quantity: 2, unitPrice: 4000, total: 68000 }, { code: 'cart', quantity: 1, unitPrice: 1500, total: 12750 }],
        }));
        const { html } = firstMail();
        expect(html).toContain('Caddie × 2');
        expect(html).toContain('¥8,000');
        expect(html).toContain('Golf cart × 1');
        expect(html).toContain('¥1,500');
        expect(html).toContain('¥33,500');
    });

    it('links straight to the screen that answers it', async () => {
        await golfTeamAlerts.newRequest(booking());
        expect(firstMail().html).toContain('href="https://cheapestgo.test/admin/golf/bookings"');
    });

    it("escapes what a customer typed", async () => {
        await golfTeamAlerts.newRequest(booking({ leadName: '<img src=x onerror=alert(1)>' }));
        expect(firstMail().html).not.toContain('<img src=x');
        expect(firstMail().html).toContain('&lt;img src=x');
    });

    it('says a reminder is running out of time', async () => {
        await golfTeamAlerts.reminder(booking());
        expect(firstMail().subject).toMatch(/^Reminder/);
        expect(firstMail().html).toContain('Sat, 7 Nov 2026, 9:00 AM');
    });

    it('says a lapse lost the booking, and that the card was not charged', async () => {
        await golfTeamAlerts.lapsed(booking({ status: 'declined', closeReason: 'not_confirmed_in_time' }));
        expect(firstMail().subject).toMatch(/^Missed/);
        expect(firstMail().html).toMatch(/not charged/i);
    });

    it('records each in the admin notifications too', async () => {
        await golfTeamAlerts.newRequest(booking());
        await golfTeamAlerts.reminder(booking());
        await golfTeamAlerts.lapsed(booking({ status: 'declined' }));
        expect(notify).toHaveBeenCalledTimes(3);
        expect(notify.mock.calls.every((c) => String((c as unknown[])[1]).includes('CG-ABC123'))).toBe(true);
    });
});

describe('never getting in the way', () => {
    it('still tells the other admins when one send fails', async () => {
        send.mockRejectedValueOnce(new Error('resend down'));
        await expect(golfTeamAlerts.newRequest(booking())).resolves.toBeUndefined();
        expect(sentTo()).toHaveLength(2);
    });

    it('still records the notification when the admins cannot be read', async () => {
        findMany.mockRejectedValueOnce(new Error('db down'));
        await expect(golfTeamAlerts.newRequest(booking())).resolves.toBeUndefined();
        expect(notify).toHaveBeenCalledOnce();
        expect(send).not.toHaveBeenCalled();
    });
});
