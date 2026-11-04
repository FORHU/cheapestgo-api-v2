import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real client reads the app's config on import; these tests hand the service fake payments.
vi.mock('@/lib/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/golf/teamAlerts', () => ({ golfTeamAlerts: {} }));
vi.mock('@/lib/golf/emails', () => ({ sendGolfBookingEmail: vi.fn(async () => undefined) }));

import { GolfBookingsService, type GolfPayments } from '@/services/golfBookings.service';
import type { BookableTeeTime, GolfBooking, HoldOutcome, NewHold } from '@/repositories/golfBookings.repository';
import { HOLD_MINUTES, cancellationFor, decideBy, freeCancelUntil, holdExpiry } from '@/lib/golf/rules';
import { toStripeAmount } from '@/lib/pricing';
import { quoteGolf } from '@/lib/golf/quote';
import { makeStrictConverter } from '@/lib/payments/convertStrict';
import type { ExtraOffer } from '@/lib/golf/extras';

const NOW = new Date('2026-11-05T00:00:00Z');
const STARTS = new Date('2026-11-10T00:00:00Z');
const USER = { id: 'user-1', email: 'golfer@example.com' };
const TEE = '11111111-1111-4111-8111-111111111111';

const teeTime = (over: Partial<BookableTeeTime> = {}): BookableTeeTime => ({
    id: TEE, courseId: 'course-1', startsAt: STARTS, spotsLeft: 4, pricePerPlayer: 100, currency: 'USD', status: 'open',
    course: {
        slug: 'fuji', name: 'Fuji Lakeside', city: 'Gotemba', country: 'Japan', imageUrl: null, holes: 18,
        status: 'published', timezone: 'Asia/Tokyo', bookingWindowDays: 60, freeCancelHours: 48,
    },
    ...over,
});

const booking = (over: Partial<GolfBooking> = {}): GolfBooking => ({
    id: 'b-1', reference: 'CG-ABC123', userId: USER.id, courseId: 'course-1', teeTimeId: TEE, players: 2,
    leadName: 'Pat Golfer', contactEmail: USER.email, courseCurrency: 'USD', pricePerPlayer: 100, currency: 'USD', fxRate: 1,
    greenFee: 200, extrasTotal: 0, extras: [], serviceFee: 10, total: 210, paymentIntentId: 'pi_1', status: 'held',
    holdExpiresAt: holdExpiry(NOW).toISOString(), requestedAt: null, decideBy: null, confirmedAt: null, closedAt: null,
    closeReason: null, createdAt: NOW.toISOString(), startsAt: STARTS.toISOString(),
    freeCancelUntil: new Date(STARTS.getTime() - 48 * 3_600_000).toISOString(), refundAmount: 0,
    course: { slug: 'fuji', name: 'Fuji Lakeside', city: 'Gotemba', country: 'Japan', timezone: 'Asia/Tokyo', imageUrl: null },
    ...over,
});

function fakes() {
    const repo = {
        findTeeTime:         vi.fn(async (): Promise<BookableTeeTime | null> => teeTime()),
        listDayTeeTimes:     vi.fn(async () => [{ id: TEE, startsAt: STARTS }]),
        listCourseExtras:    vi.fn(async (): Promise<ExtraOffer[]> => []),
        findByReference:     vi.fn(async (): Promise<GolfBooking | null> => booking()),
        findByPaymentIntent: vi.fn(async (): Promise<GolfBooking | null> => booking()),
        findLiveHold:        vi.fn(async (): Promise<GolfBooking | null> => null),
        referenceExists:     vi.fn(async () => false),
        hold:                vi.fn(async (h: NewHold): Promise<HoldOutcome> => ({
            result: 'held', released: [],
            booking: booking({
                reference: h.reference, players: h.players, paymentIntentId: null,
                currency: h.currency, greenFee: h.greenFee, extrasTotal: h.extrasTotal, extras: h.extras,
                serviceFee: h.serviceFee, total: h.total,
            }),
        })),
        attachPaymentIntent: vi.fn(async () => undefined),
        markRequested:       vi.fn(async (_id: string, at: Date, by: Date): Promise<GolfBooking | null> =>
            booking({ status: 'requested', requestedAt: at.toISOString(), decideBy: by.toISOString() })),
        markConfirmed:       vi.fn(async (): Promise<GolfBooking | null> => booking({ status: 'confirmed' })),
        close:               vi.fn(async (_id: string, _from: string, to: GolfBooking['status'], _reason?: string, _at?: Date, refund?: number): Promise<GolfBooking | null> =>
            booking({ status: to, refundAmount: refund ?? 0 })),
        dueForSweep:         vi.fn(async (): Promise<{ holds: GolfBooking[]; overdue: GolfBooking[] }> => ({ holds: [], overdue: [] })),
        claimReminders:      vi.fn(async (): Promise<GolfBooking[]> => []),
        listForAdmin:        vi.fn(async () => ({ bookings: [booking()], total: 1 })),
    };
    const payments = {
        create:   vi.fn(async (): Promise<{ id: string; clientSecret: string }> => ({ id: 'pi_new', clientSecret: 'secret_new' })),
        retrieve: vi.fn(async (): Promise<{ status: string; clientSecret: string | null }> => ({ status: 'requires_payment_method', clientSecret: 'secret_1' })),
        capture:  vi.fn(async () => undefined),
        release:  vi.fn(async (): Promise<'released' | 'captured' | 'failed'> => 'released'),
        refund:   vi.fn(async (_id: string, _amount: number, _key: string) => undefined),
    } satisfies GolfPayments;
    const rates = vi.fn(async () => ({ rates: { USD: 1, KRW: 0.00075, JPY: 0.0065 } }) as never);
    const alerts = {
        newRequest: vi.fn(async (_b: GolfBooking) => undefined),
        reminder:   vi.fn(async (_b: GolfBooking) => undefined),
        lapsed:     vi.fn(async (_b: GolfBooking) => undefined),
    };
    const svc = new GolfBookingsService(repo as never, payments, rates, alerts);
    return { repo, payments, rates, alerts, svc };
}

const INPUT = { teeTimeId: TEE, players: 2, leadName: 'Pat Golfer', currency: 'USD' };

let f: ReturnType<typeof fakes>;
beforeEach(() => { f = fakes(); });

describe('decideBy', () => {
    it('gives the team 48 hours when the tee time is far off', () => {
        expect(decideBy(NOW, new Date('2026-11-20T00:00:00Z')).toISOString()).toBe('2026-11-07T00:00:00.000Z');
    });

    it('never runs later than 2 hours before the tee time', () => {
        expect(decideBy(NOW, new Date('2026-11-06T00:00:00Z')).toISOString()).toBe('2026-11-05T22:00:00.000Z');
    });
});

describe('quote', () => {
    it('prices the party on the customer\'s currency, with the parts adding up to the total', async () => {
        const q = await f.svc.quote(TEE, { players: 2, currency: 'KRW' }, NOW);
        expect(q).toMatchObject({ currency: 'KRW', players: 2, date: '2026-11-10', localTime: '09:00', timezone: 'Asia/Tokyo' });
        expect(q!.greenFee + q!.serviceFee).toBe(q!.total);
        expect(q!.greenFee).toBeGreaterThan(200);
    });

    it('is null for a tee time that was never there', async () => {
        f.repo.findTeeTime.mockResolvedValueOnce(null);
        expect(await f.svc.quote(TEE, { players: 2 }, NOW)).toBeNull();
    });

    it.each([
        ['closed', teeTime({ status: 'closed' })],
        ['on an unpublished course', teeTime({ course: { ...teeTime().course, status: 'draft' } })],
        ['inside the lead time', teeTime({ startsAt: new Date(NOW.getTime() + 3_600_000) })],
        ['past the window', teeTime({ startsAt: new Date('2027-06-01T00:00:00Z') })],
    ])('refuses a tee time %s', async (_label, t) => {
        f.repo.findTeeTime.mockResolvedValueOnce(t);
        await expect(f.svc.quote(TEE, { players: 2 }, NOW)).rejects.toMatchObject({ code: 'TEE_TIME_UNAVAILABLE', statusCode: 409 });
    });

    it('says how many spots are left when there are too few', async () => {
        f.repo.findTeeTime.mockResolvedValueOnce(teeTime({ spotsLeft: 1 }));
        await expect(f.svc.quote(TEE, { players: 2 }, NOW)).rejects.toMatchObject({ code: 'NOT_ENOUGH_SPOTS', details: { spotsLeft: 1 } });
    });

    it('counts a customer\'s own hold as theirs, so stepping back does not lock them out', async () => {
        f.repo.findTeeTime.mockResolvedValueOnce(teeTime({ spotsLeft: 0 }));
        f.repo.findLiveHold.mockResolvedValueOnce(booking({ players: 2 }));
        const q = await f.svc.quote(TEE, { players: 2, currency: 'USD', userId: USER.id }, NOW);
        expect(q!.spotsLeft).toBe(2);
    });

    it('never guesses a price it cannot convert', async () => {
        f.rates.mockResolvedValueOnce(null as never);
        await expect(f.svc.quote(TEE, { players: 2, currency: 'KRW' }, NOW)).rejects.toMatchObject({ code: 'PRICE_UNAVAILABLE', statusCode: 503 });
    });
});

describe('start', () => {
    it('holds the spots, then opens a manual-capture payment for exactly the total', async () => {
        const out = await f.svc.start(USER, INPUT, NOW);

        const held = f.repo.hold.mock.calls[0][0];
        expect(held).toMatchObject({ userId: USER.id, teeTimeId: TEE, players: 2, contactEmail: USER.email, courseCurrency: 'USD', currency: 'USD', fxRate: 1, pricePerPlayer: 100 });
        expect(held.holdExpiresAt.getTime()).toBe(NOW.getTime() + HOLD_MINUTES * 60_000);
        expect(held.greenFee + held.serviceFee).toBe(held.total);

        const pi = (f.payments.create.mock.calls as unknown as Array<[Parameters<GolfPayments['create']>[0]]>)[0][0];
        expect(pi.amount).toBe(toStripeAmount(held.total, 'USD'));
        expect(pi.metadata).toMatchObject({ type: 'golf', bookingReference: held.reference, golfBookingId: 'b-1' });
        expect(pi.idempotencyKey).toBe('golf-pi-b-1');

        expect(f.repo.attachPaymentIntent).toHaveBeenCalledWith('b-1', 'pi_new');
        expect(out).toMatchObject({ clientSecret: 'secret_new', status: 'held', total: held.total });
    });

    it('takes no payment when there are not enough spots', async () => {
        f.repo.hold.mockResolvedValueOnce({ result: 'no_spots', spotsLeft: 1, released: [] });
        await expect(f.svc.start(USER, INPUT, NOW)).rejects.toMatchObject({ code: 'NOT_ENOUGH_SPOTS', details: { spotsLeft: 1 } });
        expect(f.payments.create).not.toHaveBeenCalled();
    });

    it('gives the spots straight back when the payment cannot be opened', async () => {
        f.payments.create.mockRejectedValueOnce(new Error('stripe down'));
        await expect(f.svc.start(USER, INPUT, NOW)).rejects.toMatchObject({ code: 'PAYMENT_UNAVAILABLE', statusCode: 502 });
        expect(f.repo.close).toHaveBeenCalledWith('b-1', 'held', 'expired', 'hold_expired', expect.any(Date));
    });

    it('releases the payments of the holds it replaced', async () => {
        f.repo.hold.mockResolvedValueOnce({
            result: 'held', booking: booking({ paymentIntentId: null }),
            released: [{ id: 'old-1', paymentIntentId: 'pi_old' }, { id: 'old-2', paymentIntentId: null }],
        });
        await f.svc.start(USER, INPUT, NOW);
        expect(f.payments.release.mock.calls).toEqual([['pi_old']]);
    });

    it('returns the same hold and payment when asked again for the same tee time and party', async () => {
        f.repo.findLiveHold.mockResolvedValueOnce(booking());
        const out = await f.svc.start(USER, INPUT, NOW);
        expect(out).toMatchObject({ reference: 'CG-ABC123', clientSecret: 'secret_1', total: 210 });
        expect(f.repo.hold).not.toHaveBeenCalled();
        expect(f.payments.create).not.toHaveBeenCalled();
    });

    it('makes a new hold when the party changed', async () => {
        f.repo.findLiveHold.mockResolvedValueOnce(booking({ players: 4 }));
        await f.svc.start(USER, INPUT, NOW);
        expect(f.repo.hold).toHaveBeenCalledOnce();
    });

    it('makes a new hold when the old one has run out', async () => {
        f.repo.findLiveHold.mockResolvedValueOnce(booking({ holdExpiresAt: new Date(NOW.getTime() - 1000).toISOString() }));
        await f.svc.start(USER, INPUT, NOW);
        expect(f.repo.hold).toHaveBeenCalledOnce();
    });

    it('has nothing left to pay when the card was already authorised', async () => {
        f.repo.findLiveHold.mockResolvedValueOnce(booking());
        f.payments.retrieve.mockResolvedValueOnce({ status: 'requires_capture', clientSecret: 'secret_1' });
        const out = await f.svc.start(USER, INPUT, NOW);
        expect(out).toMatchObject({ clientSecret: null, status: 'requested' });
        expect(f.payments.create).not.toHaveBeenCalled();
    });

    it('never asks for more than the customer was shown', async () => {
        await expect(f.svc.start(USER, { ...INPUT, shownTotal: 1 }, NOW))
            .rejects.toMatchObject({ code: 'PRICE_CHANGED', statusCode: 409, details: { currency: 'USD' } });
        expect(f.repo.hold).not.toHaveBeenCalled();
    });

    it('answers two requests at once with a clear refusal, not a database error', async () => {
        f.repo.hold.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "golf_bookings_one_live_hold"'));
        await expect(f.svc.start(USER, INPUT, NOW)).rejects.toMatchObject({ code: 'HOLD_IN_PROGRESS', statusCode: 409 });
    });
});

describe('getForUser', () => {
    it('hides someone else\'s booking', async () => {
        expect(await f.svc.getForUser('CG-ABC123', 'someone-else')).toBeNull();
    });

    it('moves a held booking on when the card is authorised', async () => {
        f.payments.retrieve.mockResolvedValueOnce({ status: 'requires_capture', clientSecret: null });
        expect((await f.svc.getForUser('CG-ABC123', USER.id))!.status).toBe('requested');
    });

    it('expires a held booking whose payment is gone', async () => {
        f.payments.retrieve.mockResolvedValueOnce({ status: 'canceled', clientSecret: null });
        expect((await f.svc.getForUser('CG-ABC123', USER.id))!.status).toBe('expired');
    });

    it('still answers when Stripe cannot be reached', async () => {
        f.payments.retrieve.mockRejectedValueOnce(new Error('down'));
        expect((await f.svc.getForUser('CG-ABC123', USER.id))!.status).toBe('held');
    });

    it('does not ask Stripe about a booking past the hold', async () => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status: 'confirmed' }));
        await f.svc.getForUser('CG-ABC123', USER.id);
        expect(f.payments.retrieve).not.toHaveBeenCalled();
    });
});

describe('onAuthorised', () => {
    it('turns the hold into a request with the team\'s deadline', async () => {
        f.payments.retrieve.mockResolvedValueOnce({ status: 'requires_capture', clientSecret: null });
        const out = await f.svc.onAuthorised('pi_1', NOW);
        expect(out!.status).toBe('requested');
        expect(f.repo.markRequested).toHaveBeenCalledWith('b-1', NOW, decideBy(NOW, STARTS));
    });

    it.each(['expired', 'declined'] as const)('releases a card authorised on a booking already %s', async (status) => {
        f.repo.findByPaymentIntent.mockResolvedValueOnce(booking({ status }));
        await f.svc.onAuthorised('pi_1', NOW);
        expect(f.payments.release).toHaveBeenCalledWith('pi_1');
    });

    it('ignores a payment it does not know', async () => {
        f.repo.findByPaymentIntent.mockResolvedValueOnce(null);
        expect(await f.svc.onAuthorised('pi_x', NOW)).toBeNull();
        expect(f.payments.release).not.toHaveBeenCalled();
    });
});

describe('confirm', () => {
    const requested = (over: Partial<GolfBooking> = {}) =>
        booking({ status: 'requested', decideBy: new Date(NOW.getTime() + 3_600_000).toISOString(), ...over });

    it('charges the card, then confirms', async () => {
        f.repo.findByReference.mockResolvedValueOnce(requested());
        const out = await f.svc.confirm('CG-ABC123', NOW);
        expect(f.payments.capture).toHaveBeenCalledWith('pi_1', 'golf-capture-b-1');
        expect(f.repo.markConfirmed).toHaveBeenCalledWith('b-1', NOW);
        expect(out!.status).toBe('confirmed');
    });

    it('leaves the booking as it was when the capture fails', async () => {
        f.repo.findByReference.mockResolvedValueOnce(requested());
        f.payments.capture.mockRejectedValueOnce(new Error('Your card was declined'));
        await expect(f.svc.confirm('CG-ABC123', NOW)).rejects.toMatchObject({ code: 'CAPTURE_FAILED', message: 'Your card was declined' });
        expect(f.repo.markConfirmed).not.toHaveBeenCalled();
    });

    it('will not charge after the deadline', async () => {
        f.repo.findByReference.mockResolvedValueOnce(requested({ decideBy: new Date(NOW.getTime() - 1000).toISOString() }));
        await expect(f.svc.confirm('CG-ABC123', NOW)).rejects.toMatchObject({ code: 'PAST_DEADLINE' });
        expect(f.payments.capture).not.toHaveBeenCalled();
    });

    it.each(['held', 'expired', 'declined'] as const)('will not charge a booking that is %s', async (status) => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status }));
        await expect(f.svc.confirm('CG-ABC123', NOW)).rejects.toMatchObject({ code: 'NOT_WAITING', statusCode: 409 });
        expect(f.payments.capture).not.toHaveBeenCalled();
    });

    it('does nothing twice', async () => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status: 'confirmed' }));
        expect((await f.svc.confirm('CG-ABC123', NOW))!.status).toBe('confirmed');
        expect(f.payments.capture).not.toHaveBeenCalled();
    });

    it('is null for no such booking', async () => {
        f.repo.findByReference.mockResolvedValueOnce(null);
        expect(await f.svc.confirm('CG-ABC123', NOW)).toBeNull();
    });
});

describe('decline', () => {
    const requested = () => booking({ status: 'requested' });

    it('releases the card, then closes the booking', async () => {
        f.repo.findByReference.mockResolvedValueOnce(requested());
        const out = await f.svc.decline('CG-ABC123', NOW);
        expect(f.payments.release).toHaveBeenCalledWith('pi_1');
        expect(f.repo.close).toHaveBeenCalledWith('b-1', 'requested', 'declined', 'declined_by_team', NOW);
        expect(out!.status).toBe('declined');
    });

    it('keeps the booking and its spots when the card cannot be released', async () => {
        f.repo.findByReference.mockResolvedValueOnce(requested());
        f.payments.release.mockResolvedValueOnce('failed');
        await expect(f.svc.decline('CG-ABC123', NOW)).rejects.toMatchObject({ code: 'RELEASE_FAILED', statusCode: 502 });
        expect(f.repo.close).not.toHaveBeenCalled();
    });

    it('refuses when the money has already moved', async () => {
        f.repo.findByReference.mockResolvedValueOnce(requested());
        f.payments.release.mockResolvedValueOnce('captured');
        await expect(f.svc.decline('CG-ABC123', NOW)).rejects.toMatchObject({ code: 'ALREADY_CAPTURED' });
        expect(f.repo.close).not.toHaveBeenCalled();
    });

    it('will not decline a confirmed booking', async () => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status: 'confirmed' }));
        await expect(f.svc.decline('CG-ABC123', NOW)).rejects.toMatchObject({ code: 'NOT_WAITING' });
        expect(f.payments.release).not.toHaveBeenCalled();
    });
});

describe('sweep', () => {
    it('expires a hold that ran out, releasing its payment', async () => {
        f.repo.dueForSweep.mockResolvedValueOnce({ holds: [booking()], overdue: [] });
        expect(await f.svc.sweep(NOW)).toEqual({ expired: 1, promoted: 0, declined: 0, reminded: 0, failed: 0 });
        expect(f.payments.release).toHaveBeenCalledWith('pi_1');
        expect(f.repo.close).toHaveBeenCalledWith('b-1', 'held', 'expired', 'hold_expired', NOW);
    });

    it('makes a request of a hold whose card was authorised at the last moment', async () => {
        f.repo.dueForSweep.mockResolvedValueOnce({ holds: [booking()], overdue: [] });
        f.payments.retrieve.mockResolvedValueOnce({ status: 'requires_capture', clientSecret: null });
        expect(await f.svc.sweep(NOW)).toEqual({ expired: 0, promoted: 1, declined: 0, reminded: 0, failed: 0 });
        expect(f.payments.release).not.toHaveBeenCalled();
        expect(f.repo.close).not.toHaveBeenCalled();
    });

    it('expires a hold that never got as far as a payment', async () => {
        f.repo.dueForSweep.mockResolvedValueOnce({ holds: [booking({ paymentIntentId: null })], overdue: [] });
        expect((await f.svc.sweep(NOW)).expired).toBe(1);
        expect(f.payments.retrieve).not.toHaveBeenCalled();
    });

    it('declines a request nobody answered, never charging it', async () => {
        f.repo.dueForSweep.mockResolvedValueOnce({ holds: [], overdue: [booking({ status: 'requested' })] });
        expect(await f.svc.sweep(NOW)).toEqual({ expired: 0, promoted: 0, declined: 1, reminded: 0, failed: 0 });
        expect(f.repo.close).toHaveBeenCalledWith('b-1', 'requested', 'declined', 'not_confirmed_in_time', NOW);
        expect(f.payments.capture).not.toHaveBeenCalled();
    });

    it('keeps the spots of a booking whose card it could not release, and tries again next run', async () => {
        f.repo.dueForSweep.mockResolvedValueOnce({ holds: [booking()], overdue: [booking({ id: 'b-2', status: 'requested' })] });
        f.payments.release.mockResolvedValue('failed');
        expect(await f.svc.sweep(NOW)).toEqual({ expired: 0, promoted: 0, declined: 0, reminded: 0, failed: 2 });
        expect(f.repo.close).not.toHaveBeenCalled();
    });

    it('carries on past a booking that throws', async () => {
        f.repo.dueForSweep.mockResolvedValueOnce({ holds: [booking({ id: 'bad' }), booking({ id: 'good' })], overdue: [] });
        f.payments.retrieve.mockRejectedValueOnce(new Error('down'));
        expect(await f.svc.sweep(NOW)).toEqual({ expired: 1, promoted: 0, declined: 0, reminded: 0, failed: 1 });
    });
});

describe('telling the team', () => {
    const authorised = () => f.payments.retrieve.mockResolvedValueOnce({ status: 'requires_capture', clientSecret: null });

    it('raises a new request when the webhook says the card is authorised', async () => {
        authorised();
        await f.svc.onAuthorised('pi_1', NOW);
        expect(f.alerts.newRequest).toHaveBeenCalledOnce();
        expect(f.alerts.newRequest.mock.calls[0][0].status).toBe('requested');
    });

    it("raises it when the customer's own page finds the card authorised", async () => {
        authorised();
        await f.svc.getForUser('CG-ABC123', USER.id);
        expect(f.alerts.newRequest).toHaveBeenCalledOnce();
    });

    it('raises it when the sweep finds a card authorised at the last moment', async () => {
        f.repo.dueForSweep.mockResolvedValueOnce({ holds: [booking()], overdue: [] });
        authorised();
        await f.svc.sweep(NOW);
        expect(f.alerts.newRequest).toHaveBeenCalledOnce();
    });

    it('raises it when checkout finds the card already authorised', async () => {
        f.repo.findLiveHold.mockResolvedValueOnce(booking());
        authorised();
        await f.svc.start(USER, INPUT, NOW);
        expect(f.alerts.newRequest).toHaveBeenCalledOnce();
    });

    it('stays quiet when another caller moved the booking first', async () => {
        authorised();
        f.repo.markRequested.mockResolvedValueOnce(null);
        await f.svc.onAuthorised('pi_1', NOW);
        expect(f.alerts.newRequest).not.toHaveBeenCalled();
    });

    it('never lets a failed alert cost the booking', async () => {
        authorised();
        f.alerts.newRequest.mockRejectedValueOnce(new Error('mail down'));
        const out = await f.svc.onAuthorised('pi_1', NOW);
        expect(out!.status).toBe('requested');
    });

    it('reminds the team about requests nearing their deadline', async () => {
        const nearing = booking({ status: 'requested' });
        f.repo.claimReminders.mockResolvedValueOnce([nearing]);
        const report = await f.svc.sweep(NOW);
        expect(f.alerts.reminder).toHaveBeenCalledWith(nearing);
        expect(report.reminded).toBe(1);
    });

    it('asks only for reminders inside the reminder window', async () => {
        await f.svc.sweep(NOW);
        expect(f.repo.claimReminders).toHaveBeenCalledWith(NOW, new Date(NOW.getTime() + 6 * 3_600_000), expect.any(Number));
    });

    it('tells the team when a request lapsed unanswered', async () => {
        f.repo.dueForSweep.mockResolvedValueOnce({ holds: [], overdue: [booking({ status: 'requested' })] });
        await f.svc.sweep(NOW);
        expect(f.alerts.lapsed).toHaveBeenCalledOnce();
        expect(f.alerts.lapsed.mock.calls[0][0].status).toBe('declined');
    });

    it('says nothing of a lapse someone else already closed', async () => {
        f.repo.dueForSweep.mockResolvedValueOnce({ holds: [], overdue: [booking({ status: 'requested' })] });
        f.repo.close.mockResolvedValueOnce(null);
        await f.svc.sweep(NOW);
        expect(f.alerts.lapsed).not.toHaveBeenCalled();
    });

    it("does not call the team's own decline a lapse", async () => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status: 'requested' }));
        await f.svc.decline('CG-ABC123', NOW);
        expect(f.alerts.lapsed).not.toHaveBeenCalled();
    });
});

describe('freeCancelUntil', () => {
    it('is the tee time less the course\'s free-cancellation hours', () => {
        expect(freeCancelUntil(STARTS, 48).toISOString()).toBe('2026-11-08T00:00:00.000Z');
        expect(freeCancelUntil(STARTS, 0).toISOString()).toBe(STARTS.toISOString());
    });
});

describe('cancellationFor', () => {
    const facts = (status: GolfBooking['status'], until = '2026-11-08T00:00:00Z') =>
        ({ status, total: 210, freeCancelUntil: new Date(until) });

    it('releases a request, which was never charged', () => {
        expect(cancellationFor(facts('requested'), NOW)).toEqual({ allowed: true, refund: 0, charged: false });
    });

    it('releases a request even past the free-cancellation time: nothing has been taken', () => {
        expect(cancellationFor(facts('requested', '2026-11-01T00:00:00Z'), NOW)).toEqual({ allowed: true, refund: 0, charged: false });
    });

    it('refunds a confirmed booking in full, fee included, before the free-cancellation time', () => {
        expect(cancellationFor(facts('confirmed'), NOW)).toEqual({ allowed: true, refund: 210, charged: true });
    });

    it('refuses a confirmed booking at the free-cancellation time and after', () => {
        expect(cancellationFor(facts('confirmed', NOW.toISOString()), NOW)).toEqual({ allowed: false, reason: 'free_cancellation_ended' });
        expect(cancellationFor(facts('confirmed', '2026-11-01T00:00:00Z'), NOW)).toEqual({ allowed: false, reason: 'free_cancellation_ended' });
    });

    it.each(['held', 'expired', 'declined', 'cancelled'] as const)('has nothing to cancel on a booking %s', (status) => {
        expect(cancellationFor(facts(status), NOW)).toEqual({ allowed: false, reason: 'not_cancellable' });
    });
});

describe('holding', () => {
    it('records when free cancellation ends, from the course\'s own hours', async () => {
        f.repo.findTeeTime.mockResolvedValueOnce(teeTime({ course: { ...teeTime().course, freeCancelHours: 72 } }));
        await f.svc.start(USER, INPUT, NOW);
        expect(f.repo.hold.mock.calls[0][0].freeCancelUntil.toISOString()).toBe('2026-11-07T00:00:00.000Z');
    });

    it('tells the checkout when free cancellation ends', async () => {
        const q = await f.svc.quote(TEE, { players: 2, currency: 'USD' }, NOW);
        expect(q!.freeCancelUntil).toBe('2026-11-08T00:00:00.000Z');
    });
});

describe('a customer cancelling', () => {
    const requested = () => booking({ status: 'requested' });
    const confirmed = () => booking({ status: 'confirmed' });

    it('releases the card on a request, charging and refunding nothing', async () => {
        f.repo.findByReference.mockResolvedValueOnce(requested());
        const out = await f.svc.cancelByCustomer('CG-ABC123', USER.id, NOW);
        expect(f.payments.release).toHaveBeenCalledWith('pi_1');
        expect(f.payments.refund).not.toHaveBeenCalled();
        expect(f.repo.close).toHaveBeenCalledWith('b-1', 'requested', 'cancelled', 'cancelled_by_customer', NOW);
        expect(out!.status).toBe('cancelled');
    });

    it('refunds a confirmed booking in full, then closes it', async () => {
        f.repo.findByReference.mockResolvedValueOnce(confirmed());
        const out = await f.svc.cancelByCustomer('CG-ABC123', USER.id, NOW);
        expect(f.payments.refund).toHaveBeenCalledWith('pi_1', toStripeAmount(210, 'USD'), 'golf-refund-b-1');
        expect(f.repo.close).toHaveBeenCalledWith('b-1', 'confirmed', 'cancelled', 'cancelled_by_customer', NOW, 210);
        expect(out).toMatchObject({ status: 'cancelled', refundAmount: 210 });
    });

    it('refunds in the charge currency, to the unit that currency has', async () => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status: 'confirmed', currency: 'KRW', total: 204124 }));
        await f.svc.cancelByCustomer('CG-ABC123', USER.id, NOW);
        expect(f.payments.refund).toHaveBeenCalledWith('pi_1', 204124, 'golf-refund-b-1');
    });

    it('keeps the booking and its spots when the refund fails', async () => {
        f.repo.findByReference.mockResolvedValueOnce(confirmed());
        f.payments.refund.mockRejectedValueOnce(new Error('stripe down'));
        await expect(f.svc.cancelByCustomer('CG-ABC123', USER.id, NOW)).rejects.toMatchObject({ code: 'REFUND_FAILED', statusCode: 502 });
        expect(f.repo.close).not.toHaveBeenCalled();
    });

    it('refuses after free cancellation has ended, moving no money', async () => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status: 'confirmed', freeCancelUntil: new Date(NOW.getTime() - 1000).toISOString() }));
        await expect(f.svc.cancelByCustomer('CG-ABC123', USER.id, NOW)).rejects.toMatchObject({ code: 'FREE_CANCELLATION_ENDED', statusCode: 409 });
        expect(f.payments.refund).not.toHaveBeenCalled();
        expect(f.repo.close).not.toHaveBeenCalled();
    });

    it.each(['held', 'expired', 'declined'] as const)('has nothing to cancel on a booking %s', async (status) => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status }));
        await expect(f.svc.cancelByCustomer('CG-ABC123', USER.id, NOW)).rejects.toMatchObject({ code: 'NOT_CANCELLABLE' });
        expect(f.payments.release).not.toHaveBeenCalled();
        expect(f.payments.refund).not.toHaveBeenCalled();
    });

    it('hides someone else\'s booking', async () => {
        expect(await f.svc.cancelByCustomer('CG-ABC123', 'someone-else', NOW)).toBeNull();
        expect(f.payments.release).not.toHaveBeenCalled();
    });

    it('does nothing twice', async () => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status: 'cancelled' }));
        expect((await f.svc.cancelByCustomer('CG-ABC123', USER.id, NOW))!.status).toBe('cancelled');
        expect(f.payments.refund).not.toHaveBeenCalled();
    });

    it('stops when the team has confirmed in the meantime, rather than cancelling a charged booking as if it were not', async () => {
        f.repo.findByReference.mockResolvedValueOnce(requested());
        f.payments.release.mockResolvedValueOnce('captured');
        await expect(f.svc.cancelByCustomer('CG-ABC123', USER.id, NOW)).rejects.toMatchObject({ code: 'BOOKING_CHANGED', statusCode: 409 });
        expect(f.repo.close).not.toHaveBeenCalled();
    });

    it('keeps a request whose card cannot be released', async () => {
        f.repo.findByReference.mockResolvedValueOnce(requested());
        f.payments.release.mockResolvedValueOnce('failed');
        await expect(f.svc.cancelByCustomer('CG-ABC123', USER.id, NOW)).rejects.toMatchObject({ code: 'RELEASE_FAILED', statusCode: 502 });
        expect(f.repo.close).not.toHaveBeenCalled();
    });
});

describe('the team cancelling', () => {
    it('refunds a confirmed booking in full, whatever the free-cancellation time', async () => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status: 'confirmed', freeCancelUntil: new Date(NOW.getTime() - 1000).toISOString() }));
        const out = await f.svc.cancelByTeam('CG-ABC123', NOW);
        expect(f.payments.refund).toHaveBeenCalledWith('pi_1', toStripeAmount(210, 'USD'), 'golf-refund-b-1');
        expect(f.repo.close).toHaveBeenCalledWith('b-1', 'confirmed', 'cancelled', 'cancelled_by_team', NOW, 210);
        expect(out).toMatchObject({ status: 'cancelled', refundAmount: 210 });
    });

    it('keeps the booking when the refund fails', async () => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status: 'confirmed' }));
        f.payments.refund.mockRejectedValueOnce(new Error('stripe down'));
        await expect(f.svc.cancelByTeam('CG-ABC123', NOW)).rejects.toMatchObject({ code: 'REFUND_FAILED' });
        expect(f.repo.close).not.toHaveBeenCalled();
    });

    it.each(['held', 'requested', 'expired', 'declined'] as const)('has no refund to give on a booking %s', async (status) => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status }));
        await expect(f.svc.cancelByTeam('CG-ABC123', NOW)).rejects.toMatchObject({ code: 'NOT_CANCELLABLE' });
        expect(f.payments.refund).not.toHaveBeenCalled();
    });

    it('does nothing twice', async () => {
        f.repo.findByReference.mockResolvedValueOnce(booking({ status: 'cancelled' }));
        expect((await f.svc.cancelByTeam('CG-ABC123', NOW))!.status).toBe('cancelled');
        expect(f.payments.refund).not.toHaveBeenCalled();
    });

    it('is null for no such booking', async () => {
        f.repo.findByReference.mockResolvedValueOnce(null);
        expect(await f.svc.cancelByTeam('CG-ABC123', NOW)).toBeNull();
    });
});

describe('after cancelling', () => {
    it('releases a card authorised on a booking already cancelled', async () => {
        f.repo.findByPaymentIntent.mockResolvedValueOnce(booking({ status: 'cancelled' }));
        await f.svc.onAuthorised('pi_1', NOW);
        expect(f.payments.release).toHaveBeenCalledWith('pi_1');
    });
});

describe('a tee time spaced for another party', () => {
    // 09:00 is on a solo player's list (06:30 + 2.5 hours), and on nobody else's.
    const FIRST = new Date('2026-11-09T21:30:00Z');
    const day = () => [
        { id: 'first', startsAt: FIRST },
        { id: TEE, startsAt: new Date(FIRST.getTime() + 150 * 60_000) },
    ];

    it('can be booked by the party it was listed for', async () => {
        f.repo.listDayTeeTimes.mockResolvedValueOnce(day());
        await expect(f.svc.quote(TEE, { players: 1, currency: 'USD' }, NOW)).resolves.toMatchObject({ players: 1 });
    });

    it('cannot be quoted for a bigger party', async () => {
        f.repo.listDayTeeTimes.mockResolvedValueOnce(day());
        await expect(f.svc.quote(TEE, { players: 4 }, NOW)).rejects.toMatchObject({ code: 'TEE_TIME_UNAVAILABLE', statusCode: 409 });
    });

    it('cannot be booked by a bigger party, taking no spots and no payment', async () => {
        f.repo.listDayTeeTimes.mockResolvedValueOnce(day());
        await expect(f.svc.start(USER, { ...INPUT, players: 4 }, NOW)).rejects.toMatchObject({ code: 'TEE_TIME_UNAVAILABLE' });
        expect(f.repo.hold).not.toHaveBeenCalled();
        expect(f.payments.create).not.toHaveBeenCalled();
    });
});

describe('extras', () => {
    const OFFERS: ExtraOffer[] = [{ code: 'caddie', price: 30 }, { code: 'cart', price: 20 }];
    const CADDIE_LINE = { code: 'caddie' as const, quantity: 1, unitPrice: 30, total: 30 };

    beforeEach(() => { f.repo.listCourseExtras.mockResolvedValue(OFFERS); });

    describe('quote', () => {
        it("lists what the course offers, each at its price per item in the customer's currency", async () => {
            const q = await f.svc.quote(TEE, { players: 2, currency: 'KRW' }, NOW);
            expect(q!.extraOffers).toEqual([{ code: 'caddie', price: 40000 }, { code: 'cart', price: 26667 }]);
            expect(q!.extras).toEqual([]);
            expect(q!.extrasTotal).toBe(0);
        });

        it('prices what was chosen, with the service fee on green fee and extras together', async () => {
            const q = await f.svc.quote(TEE, {
                players: 2, currency: 'USD', extras: [{ code: 'caddie', quantity: 2 }, { code: 'cart', quantity: 1 }],
            }, NOW);
            expect(q!.extras).toEqual([{ code: 'caddie', quantity: 2, total: 60 }, { code: 'cart', quantity: 1, total: 20 }]);
            expect(q!.extrasTotal).toBe(80);
            expect(q!.total).toBe(quoteGolf({ greenFeeTotal: 280, currency: 'USD', convert: makeStrictConverter(null) }).total);
            expect(q!.greenFee + q!.extrasTotal + q!.serviceFee).toBeCloseTo(q!.total, 10);
        });

        it('drops what is no longer offered and caps at the party, so an old link still opens', async () => {
            const q = await f.svc.quote(TEE, {
                players: 2, currency: 'USD', extras: [{ code: 'club_rental', quantity: 1 }, { code: 'caddie', quantity: 4 }],
            }, NOW);
            expect(q!.extras).toEqual([{ code: 'caddie', quantity: 2, total: 60 }]);
        });

        it('is the same as before for a course that offers none', async () => {
            f.repo.listCourseExtras.mockResolvedValue([]);
            const q = await f.svc.quote(TEE, { players: 2, currency: 'USD' }, NOW);
            expect(q).toMatchObject({ extraOffers: [], extras: [], extrasTotal: 0 });
            expect(q!.greenFee + q!.serviceFee).toBeCloseTo(q!.total, 10);
        });
    });

    describe('start', () => {
        it('charges for them and writes each line on the booking, in both currencies', async () => {
            const out = await f.svc.start(USER, { ...INPUT, currency: 'KRW', extras: [{ code: 'caddie', quantity: 2 }] }, NOW);

            const hold = f.repo.hold.mock.calls[0][0];
            expect(hold.extras).toEqual([{ code: 'caddie', quantity: 2, unitPrice: 30, total: 80000 }]);
            expect(hold.extrasTotal).toBe(80000);
            expect(hold.greenFee + hold.extrasTotal + hold.serviceFee).toBe(hold.total);

            const pay = (f.payments.create.mock.calls as unknown as Array<[{ amount: number; metadata: Record<string, string> }]>)[0][0];
            expect(pay.amount).toBe(toStripeAmount(hold.total, 'KRW'));
            expect(pay.metadata.extrasTotal).toBe('80000');

            // The customer's answer has their own figures, not what the course asks.
            expect(out.extras).toEqual([{ code: 'caddie', quantity: 2, total: 80000 }]);
            expect(out.extrasTotal).toBe(80000);
        });

        it('charges exactly what the quote for the same choices showed', async () => {
            const extras = [{ code: 'caddie' as const, quantity: 1 }, { code: 'cart' as const, quantity: 2 }];
            const q = await f.svc.quote(TEE, { players: 2, currency: 'KRW', extras }, NOW);
            const out = await f.svc.start(USER, { ...INPUT, currency: 'KRW', extras, shownTotal: q!.total }, NOW);
            expect(out.total).toBe(q!.total);
        });

        it('refuses an extra the course no longer offers, and takes nothing', async () => {
            await expect(f.svc.start(USER, { ...INPUT, extras: [{ code: 'club_rental', quantity: 1 }] }, NOW))
                .rejects.toMatchObject({ code: 'EXTRAS_UNAVAILABLE', statusCode: 409 });
            expect(f.repo.hold).not.toHaveBeenCalled();
            expect(f.payments.create).not.toHaveBeenCalled();
        });

        it('refuses more of an extra than there are players', async () => {
            await expect(f.svc.start(USER, { ...INPUT, players: 2, extras: [{ code: 'cart', quantity: 3 }] }, NOW))
                .rejects.toMatchObject({ code: 'EXTRAS_UNAVAILABLE' });
            expect(f.repo.hold).not.toHaveBeenCalled();
        });

        it('returns the same hold and payment for the same extras', async () => {
            f.repo.findLiveHold.mockResolvedValueOnce(booking({ extras: [CADDIE_LINE], extrasTotal: 30 }));
            const out = await f.svc.start(USER, { ...INPUT, extras: [{ code: 'caddie', quantity: 1 }] }, NOW);
            expect(out.clientSecret).toBe('secret_1');
            expect(f.repo.hold).not.toHaveBeenCalled();
        });

        it('makes a new hold when the extras changed, so the card is asked for the right amount', async () => {
            f.repo.findLiveHold.mockResolvedValueOnce(booking({ extras: [CADDIE_LINE], extrasTotal: 30 }));
            await f.svc.start(USER, { ...INPUT, extras: [{ code: 'caddie', quantity: 2 }] }, NOW);
            expect(f.repo.hold).toHaveBeenCalledTimes(1);
        });

        it('makes a new hold when the extras were taken off', async () => {
            f.repo.findLiveHold.mockResolvedValueOnce(booking({ extras: [CADDIE_LINE], extrasTotal: 30 }));
            await f.svc.start(USER, INPUT, NOW);
            expect(f.repo.hold.mock.calls[0][0].extras).toEqual([]);
        });

        it('keeps a live hold as it was made, even if the course has since stopped offering what it holds', async () => {
            f.repo.findLiveHold.mockResolvedValueOnce(booking({
                extras: [{ code: 'club_rental', quantity: 1, unitPrice: 45, total: 45 }], extrasTotal: 45,
            }));
            const out = await f.svc.start(USER, { ...INPUT, extras: [{ code: 'club_rental', quantity: 1 }] }, NOW);
            expect(out.clientSecret).toBe('secret_1');
            expect(f.repo.hold).not.toHaveBeenCalled();
        });

        it('tells a customer who was shown less the new figures, extras included', async () => {
            await expect(f.svc.start(USER, { ...INPUT, extras: [{ code: 'caddie', quantity: 2 }], shownTotal: 1 }, NOW))
                .rejects.toMatchObject({
                    code: 'PRICE_CHANGED',
                    details: { extrasTotal: 60, extras: [{ code: 'caddie', quantity: 2, total: 60 }] },
                });
        });
    });
});
