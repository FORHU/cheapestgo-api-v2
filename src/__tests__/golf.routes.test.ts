/**
 * The golf endpoints over real HTTP: the storefront's two reads, and the admin's five actions behind
 * the admin role. The service is mocked; its rules have their own tests. What is checked here is the
 * translation — status codes, the envelope, where a refusal's details go.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

const svc = vi.hoisted(() => ({
    listPublished: vi.fn(), getPublished: vi.fn(), listForAdmin: vi.fn(),
    create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), delete: vi.fn(), listExtras: vi.fn(), setExtras: vi.fn(),
}));
const teeTimes = vi.hoisted(() => ({
    availability: vi.fn(), listSchedules: vi.fn(), addSchedule: vi.fn(), removeSchedule: vi.fn(),
}));
const bookings = vi.hoisted(() => ({
    quote: vi.fn(), start: vi.fn(), getForUser: vi.fn(), listForAdmin: vi.fn(), confirm: vi.fn(), decline: vi.fn(),
    cancelByCustomer: vi.fn(), cancelByTeam: vi.fn(),
}));
const audit = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/golf.service', () => ({ GolfService: vi.fn(function () { return svc; }) }));
vi.mock('@/services/golfTeeTimes.service', () => ({ GolfTeeTimesService: vi.fn(function () { return teeTimes; }) }));
vi.mock('@/services/golfBookings.service', () => ({ GolfBookingsService: vi.fn(function () { return bookings; }) }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: audit }));
// Who is calling comes from a header, so a test can be anyone.
vi.mock('@/middleware/auth.middleware', async () => {
    const { AppError } = await import('@/middleware/error.middleware');
    const requireAuth: RequestHandler = (req, _res, next) => {
        const role = req.header('x-test-role');
        if (!role) return next(new AppError(401, 'Unauthorized', 'AUTH_REQUIRED'));
        req.user = { sub: 'admin-1', email: 'admin@example.com', role: role as never };
        next();
    };
    const requireRole = (...roles: string[]): RequestHandler => (req, _res, next) =>
        (roles.includes(req.user?.role ?? '') ? next() : next(new AppError(403, 'Forbidden', 'FORBIDDEN')));
    const optionalAuth: RequestHandler = (req, _res, next) => {
        const role = req.header('x-test-role');
        if (role) req.user = { sub: 'admin-1', email: 'admin@example.com', role: role as never };
        next();
    };
    return { requireAuth, requireRole, optionalAuth };
});

import golfRoutes from '@/routes/golf.route';
import adminGolfRoutes from '@/routes/admin-golf.route';
import { errorMiddleware } from '@/middleware/error.middleware';
import { AppError } from '@/middleware/error.middleware';
import { CourseHasBookingsError, SlugTakenError } from '@/repositories/golf.repository';

let server: Server;
let base = '';

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/golf', golfRoutes);
    app.use('/admin/golf', adminGolfRoutes);
    app.use(errorMiddleware);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => vi.clearAllMocks());

type Body = { error?: string; details?: Record<string, string[]>; [key: string]: unknown };

const call = async (method: string, path: string, opts: { role?: string; body?: unknown } = {}) => {
    const res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', ...(opts.role ? { 'x-test-role': opts.role } : {}) },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Body };
};

const ID     = '0b6c7a2e-1111-4a5b-9c3d-000000000001';
const COURSE = { id: ID, slug: 'wack-wack', name: 'Wack Wack' };
const VALID  = { name: 'Wack Wack', country: 'Philippines', city: 'Mandaluyong', holes: 18 };

describe('storefront', () => {
    it('lists published courses, passing the country and currency down', async () => {
        svc.listPublished.mockResolvedValue({ courses: [COURSE], countries: ['Philippines'] });
        const res = await call('GET', '/golf/courses?country=Philippines&currency=KRW');
        expect(res).toEqual({ status: 200, body: { success: true, data: { courses: [COURSE], countries: ['Philippines'] } } });
        expect(svc.listPublished).toHaveBeenCalledWith({ country: 'Philippines', currency: 'KRW' });
    });

    it('answers 404 for a course a customer may not see', async () => {
        svc.getPublished.mockResolvedValue(null);
        const res = await call('GET', '/golf/courses/secret-draft');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('NOT_FOUND');
    });

    it('needs no session', async () => {
        svc.getPublished.mockResolvedValue(COURSE);
        expect(await call('GET', '/golf/courses/wack-wack?currency=PHP')).toEqual({ status: 200, body: { success: true, data: COURSE } });
        expect(svc.getPublished).toHaveBeenCalledWith('wack-wack', 'PHP');
    });
});

describe('admin', () => {
    it('refuses a visitor with no session, and a customer', async () => {
        expect((await call('GET', '/admin/golf/courses')).status).toBe(401);
        expect((await call('GET', '/admin/golf/courses', { role: 'user' })).status).toBe(403);
        expect(svc.listForAdmin).not.toHaveBeenCalled();
    });

    it('lists for an admin', async () => {
        svc.listForAdmin.mockResolvedValue({ data: [COURSE], total: 1, page: 1, pageSize: 20, totalPages: 1 });
        const res = await call('GET', '/admin/golf/courses?q=wack', { role: 'admin' });
        expect(res.body).toEqual({ success: true, data: [COURSE], total: 1, page: 1, pageSize: 20, totalPages: 1 });
    });

    it('names the fields that are wrong', async () => {
        const res = await call('POST', '/admin/golf/courses', { role: 'admin', body: { ...VALID, name: '', holes: 12 } });
        expect(res.status).toBe(422);
        expect(Object.keys(res.body.details ?? {}).sort()).toEqual(['holes', 'name']);
        expect(svc.create).not.toHaveBeenCalled();
    });

    it('reports a taken slug against the slug field', async () => {
        svc.create.mockRejectedValue(new SlugTakenError('wack-wack'));
        const res = await call('POST', '/admin/golf/courses', { role: 'admin', body: VALID });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ error: 'SLUG_TAKEN', details: { slug: [expect.stringContaining('wack-wack')] } });
    });

    it('creates, and writes it down', async () => {
        svc.create.mockResolvedValue(COURSE);
        const res = await call('POST', '/admin/golf/courses', { role: 'admin', body: VALID });
        expect(res).toEqual({ status: 201, body: { success: true, data: COURSE } });
        expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Wack Wack', slug: null, currency: 'USD' }));
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'golf_course_create', adminId: 'admin-1', targetId: ID }));
    });

    it('answers 404 for an update, a status change or a delete of nothing', async () => {
        svc.update.mockResolvedValue(null);
        svc.setStatus.mockResolvedValue(null);
        svc.delete.mockResolvedValue(false);
        expect((await call('PUT', `/admin/golf/courses/${ID}`, { role: 'admin', body: VALID })).status).toBe(404);
        expect((await call('PATCH', `/admin/golf/courses/${ID}/status`, { role: 'admin', body: { status: 'published' } })).status).toBe(404);
        expect((await call('DELETE', `/admin/golf/courses/${ID}`, { role: 'admin' })).status).toBe(404);
        expect(audit).not.toHaveBeenCalled();
    });

    it('publishes, and refuses a status that does not exist', async () => {
        svc.setStatus.mockResolvedValue({ ...COURSE, status: 'published' });
        expect((await call('PATCH', `/admin/golf/courses/${ID}/status`, { role: 'admin', body: { status: 'live' } })).status).toBe(422);
        const res = await call('PATCH', `/admin/golf/courses/${ID}/status`, { role: 'admin', body: { status: 'published' } });
        expect(res.status).toBe(200);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'golf_course_publish', targetId: ID }));
    });

    it('deletes with a body the app can read', async () => {
        svc.delete.mockResolvedValue(true);
        expect(await call('DELETE', `/admin/golf/courses/${ID}`, { role: 'admin' })).toEqual({ status: 200, body: { success: true } });
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'golf_course_delete', targetId: ID }));
    });
});

describe('tee times', () => {
    const SCHED = '0b6c7a2e-2222-4a5b-9c3d-000000000002';
    const SCHEDULE = { name: 'Weekday mornings', daysOfWeek: [1, 2, 3, 4, 5], firstTee: '06:30', lastTee: '11:00', intervalMinutes: 8, pricePerPlayer: 85 };

    it("answers a course's day, with players and currency passed down", async () => {
        teeTimes.availability.mockResolvedValue({ date: '2026-11-15', teeTimes: [] });
        const res = await call('GET', '/golf/courses/wack-wack/tee-times?date=2026-11-15&players=3&currency=KRW');
        expect(res).toEqual({ status: 200, body: { success: true, data: { date: '2026-11-15', teeTimes: [] } } });
        expect(teeTimes.availability).toHaveBeenCalledWith('wack-wack', { date: '2026-11-15', players: 3, currency: 'KRW' });
    });

    it('reads a missing or impossible party size as two players', async () => {
        teeTimes.availability.mockResolvedValue({ teeTimes: [] });
        await call('GET', '/golf/courses/wack-wack/tee-times?players=9');
        expect(teeTimes.availability).toHaveBeenCalledWith('wack-wack', { date: undefined, players: 2, currency: undefined });
    });

    it('refuses a date that is not a calendar date, against the date field', async () => {
        const res = await call('GET', '/golf/courses/wack-wack/tee-times?date=2026-02-30');
        expect(res.status).toBe(422);
        expect(res.body.details).toHaveProperty('date');
        expect(teeTimes.availability).not.toHaveBeenCalled();
    });

    it('answers 404 for a course that cannot have tee times', async () => {
        teeTimes.availability.mockResolvedValue(null);
        expect((await call('GET', '/golf/courses/draft/tee-times')).status).toBe(404);
    });

    it("lists, adds and deletes a course's schedules for an admin only", async () => {
        expect((await call('GET', `/admin/golf/courses/${ID}/schedules`, { role: 'user' })).status).toBe(403);

        teeTimes.listSchedules.mockResolvedValue([{ id: SCHED }]);
        expect(await call('GET', `/admin/golf/courses/${ID}/schedules`, { role: 'admin' }))
            .toEqual({ status: 200, body: { success: true, data: [{ id: SCHED }] } });

        teeTimes.addSchedule.mockResolvedValue({ schedule: { id: SCHED }, created: 120 });
        const added = await call('POST', `/admin/golf/courses/${ID}/schedules`, { role: 'admin', body: SCHEDULE });
        expect(added).toEqual({ status: 201, body: { success: true, data: { schedule: { id: SCHED }, created: 120 } } });
        expect(teeTimes.addSchedule).toHaveBeenCalledWith(ID, expect.objectContaining({ name: 'Weekday mornings', spots: 4 }));
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'golf_schedule_create', targetId: SCHED }));

        teeTimes.removeSchedule.mockResolvedValue(true);
        expect(await call('DELETE', `/admin/golf/courses/${ID}/schedules/${SCHED}`, { role: 'admin' }))
            .toEqual({ status: 200, body: { success: true } });
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'golf_schedule_delete', targetId: SCHED }));
    });

    it('names the schedule fields that are wrong, and 404s what is not there', async () => {
        const bad = await call('POST', `/admin/golf/courses/${ID}/schedules`, { role: 'admin', body: { ...SCHEDULE, daysOfWeek: [] } });
        expect(bad.status).toBe(422);
        expect(Object.keys(bad.body.details ?? {})).toEqual(['daysOfWeek']);

        teeTimes.listSchedules.mockResolvedValue(null);
        teeTimes.addSchedule.mockResolvedValue(null);
        teeTimes.removeSchedule.mockResolvedValue(false);
        expect((await call('GET', `/admin/golf/courses/${ID}/schedules`, { role: 'admin' })).status).toBe(404);
        expect((await call('POST', `/admin/golf/courses/${ID}/schedules`, { role: 'admin', body: SCHEDULE })).status).toBe(404);
        expect((await call('DELETE', `/admin/golf/courses/${ID}/schedules/${SCHED}`, { role: 'admin' })).status).toBe(404);
    });

    it('lets an admin read and replace what a course offers, and records who did', async () => {
        const extras = [{ code: 'caddie', price: 30 }];
        expect((await call('GET', `/admin/golf/courses/${ID}/extras`, { role: 'user' })).status).toBe(403);
        expect((await call('PUT', `/admin/golf/courses/${ID}/extras`, { role: 'user', body: { extras } })).status).toBe(403);

        svc.listExtras.mockResolvedValue(extras);
        expect(await call('GET', `/admin/golf/courses/${ID}/extras`, { role: 'admin' }))
            .toEqual({ status: 200, body: { success: true, data: extras } });

        svc.setExtras.mockResolvedValue(extras);
        expect(await call('PUT', `/admin/golf/courses/${ID}/extras`, { role: 'admin', body: { extras } }))
            .toEqual({ status: 200, body: { success: true, data: extras } });
        expect(svc.setExtras).toHaveBeenCalledWith(ID, extras);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'golf_extras_update', targetId: ID }));
    });

    it('refuses a bad price and 404s a course that is not there', async () => {
        svc.setExtras.mockClear();
        const bad = await call('PUT', `/admin/golf/courses/${ID}/extras`, { role: 'admin', body: { extras: [{ code: 'cart', price: -1 }] } });
        expect(bad.status).toBe(422);
        expect(svc.setExtras).not.toHaveBeenCalled();

        svc.listExtras.mockResolvedValue(null);
        svc.setExtras.mockResolvedValue(null);
        expect((await call('GET', `/admin/golf/courses/${ID}/extras`, { role: 'admin' })).status).toBe(404);
        expect((await call('PUT', `/admin/golf/courses/${ID}/extras`, { role: 'admin', body: { extras: [] } })).status).toBe(404);
    });
});

describe('golf bookings', () => {
    const TEE = '0b6c7a2e-2222-4a5b-9c3d-000000000002';
    const REF = 'CG-ABC123';
    const START = { teeTimeId: TEE, players: 2, leadName: '  Pat Golfer ', currency: 'KRW', shownTotal: 210000 };
    const BOOKING = {
        id: 'b-1', reference: REF, userId: 'admin-1', paymentIntentId: 'pi_secret', fxRate: 1, pricePerPlayer: 100, courseCurrency: 'USD',
        status: 'requested', closeReason: null, players: 2, leadName: 'Pat', contactEmail: 'a@b.c', currency: 'KRW',
        greenFee: 200000, extras: [], extrasTotal: 0, serviceFee: 10000, total: 210000, startsAt: 'x', holdExpiresAt: 'x', decideBy: 'x', confirmedAt: null, course: { slug: 'fuji' },
        freeCancelUntil: '2099-01-01T00:00:00.000Z', refundAmount: 0,
    };

    it("quotes anyone, counting a signed-in caller's own hold", async () => {
        bookings.quote.mockResolvedValue({ total: 210000 });
        expect(await call('GET', `/golf/tee-times/${TEE}/quote?players=3&currency=KRW`))
            .toEqual({ status: 200, body: { success: true, data: { total: 210000 } } });
        expect(bookings.quote).toHaveBeenCalledWith(TEE, { players: 3, currency: 'KRW', userId: undefined, extras: [] });

        await call('GET', `/golf/tee-times/${TEE}/quote`, { role: 'customer' });
        expect(bookings.quote).toHaveBeenLastCalledWith(TEE, { players: 2, currency: undefined, userId: 'admin-1', extras: [] });
    });

    it('reads the extras a quote asks for, ignoring what it cannot read', async () => {
        bookings.quote.mockResolvedValue({ total: 210000 });
        await call('GET', `/golf/tee-times/${TEE}/quote?extras=caddie:2,sauna:1,cart:1`);
        expect(bookings.quote).toHaveBeenLastCalledWith(TEE, expect.objectContaining({
            extras: [{ code: 'caddie', quantity: 2 }, { code: 'cart', quantity: 1 }],
        }));
    });

    it('answers 404 for a tee time that is not there, or not even an id', async () => {
        bookings.quote.mockResolvedValue(null);
        expect((await call('GET', `/golf/tee-times/${TEE}/quote`)).status).toBe(404);
        bookings.quote.mockClear();
        expect((await call('GET', '/golf/tee-times/not-an-id/quote')).status).toBe(404);
        expect(bookings.quote).not.toHaveBeenCalled();
    });

    it('needs a session to start a booking', async () => {
        expect((await call('POST', '/golf/bookings', { body: START })).status).toBe(401);
        expect(bookings.start).not.toHaveBeenCalled();
    });

    it('starts a booking for the caller, with the trimmed name', async () => {
        bookings.start.mockResolvedValue({ reference: REF, clientSecret: 'secret' });
        const res = await call('POST', '/golf/bookings', { role: 'customer', body: START });
        expect(res).toEqual({ status: 201, body: { success: true, data: { reference: REF, clientSecret: 'secret' } } });
        expect(bookings.start).toHaveBeenCalledWith(
            { id: 'admin-1', email: 'admin@example.com' },
            { ...START, leadName: 'Pat Golfer', extras: [] },
        );
    });

    it('passes the chosen extras on, and refuses a list that makes no sense', async () => {
        bookings.start.mockResolvedValue({ reference: REF, clientSecret: 'secret' });
        const extras = [{ code: 'caddie', quantity: 1 }];
        await call('POST', '/golf/bookings', { role: 'customer', body: { ...START, extras } });
        expect(bookings.start).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ extras }));

        bookings.start.mockClear();
        const bad = await call('POST', '/golf/bookings', { role: 'customer', body: { ...START, extras: [{ code: 'sauna', quantity: 1 }] } });
        expect(bad.status).toBe(422);
        expect(bookings.start).not.toHaveBeenCalled();
    });

    it('names what is wrong with a booking request', async () => {
        const res = await call('POST', '/golf/bookings', { role: 'customer', body: { ...START, players: 5, leadName: ' ' } });
        expect(res.status).toBe(422);
        expect(Object.keys(res.body.details ?? {}).sort()).toEqual(['leadName', 'players']);
        expect(bookings.start).not.toHaveBeenCalled();
    });

    it("puts a refusal's figures beside its code, so the page can act on them", async () => {
        bookings.start.mockRejectedValue(new AppError(409, 'Only 1 spot is left.', 'NOT_ENOUGH_SPOTS', { spotsLeft: 1 }));
        const res = await call('POST', '/golf/bookings', { role: 'customer', body: START });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ error: 'NOT_ENOUGH_SPOTS', spotsLeft: 1 });
    });

    it("shows a customer their booking, without the payment's id or the course's own prices", async () => {
        bookings.getForUser.mockResolvedValue(BOOKING);
        const res = await call('GET', `/golf/bookings/${REF}`, { role: 'customer' });
        expect(res.status).toBe(200);
        expect(bookings.getForUser).toHaveBeenCalledWith(REF, 'admin-1');
        const data = res.body.data as Record<string, unknown>;
        expect(data).toMatchObject({ reference: REF, status: 'requested', total: 210000 });
        for (const hidden of ['paymentIntentId', 'userId', 'fxRate', 'pricePerPlayer', 'courseCurrency', 'id']) {
            expect(data).not.toHaveProperty(hidden);
        }
    });

    it("shows a customer what they pay for each extra, never what the course asks", async () => {
        bookings.getForUser.mockResolvedValue({
            ...BOOKING, extrasTotal: 80000, extras: [{ code: 'caddie', quantity: 2, unitPrice: 30, total: 80000 }],
        });
        const res = await call('GET', `/golf/bookings/${REF}`, { role: 'customer' });
        expect(res.body.data).toMatchObject({ extrasTotal: 80000, extras: [{ code: 'caddie', quantity: 2, total: 80000 }] });
        expect((res.body.data as { extras: object[] }).extras[0]).not.toHaveProperty('unitPrice');
    });

    it("answers 404 for someone else's booking, and for what is not a reference", async () => {
        bookings.getForUser.mockResolvedValue(null);
        expect((await call('GET', `/golf/bookings/${REF}`, { role: 'customer' })).status).toBe(404);
        bookings.getForUser.mockClear();
        expect((await call('GET', '/golf/bookings/nope', { role: 'customer' })).status).toBe(404);
        expect(bookings.getForUser).not.toHaveBeenCalled();
    });

    it("keeps the team's answers behind the admin role", async () => {
        for (const path of ['confirm', 'decline']) {
            expect((await call('POST', `/admin/golf/bookings/${REF}/${path}`, { role: 'customer' })).status).toBe(403);
        }
        expect((await call('GET', '/admin/golf/bookings', { role: 'customer' })).status).toBe(403);
        expect(bookings.confirm).not.toHaveBeenCalled();
        expect(bookings.decline).not.toHaveBeenCalled();
    });

    it('lists bookings by view, defaulting to what is waiting', async () => {
        bookings.listForAdmin.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 25, totalPages: 1 });
        await call('GET', '/admin/golf/bookings', { role: 'admin' });
        expect(bookings.listForAdmin).toHaveBeenLastCalledWith('waiting', 1);
        await call('GET', '/admin/golf/bookings?view=closed&page=3', { role: 'admin' });
        expect(bookings.listForAdmin).toHaveBeenLastCalledWith('closed', 3);
    });

    it('confirms and declines, and audits each', async () => {
        bookings.confirm.mockResolvedValue({ ...BOOKING, status: 'confirmed' });
        expect((await call('POST', `/admin/golf/bookings/${REF}/confirm`, { role: 'admin' })).status).toBe(200);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'golf_booking_confirm', targetId: 'b-1' }));

        bookings.decline.mockResolvedValue({ ...BOOKING, status: 'declined' });
        expect((await call('POST', `/admin/golf/bookings/${REF}/decline`, { role: 'admin' })).status).toBe(200);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'golf_booking_decline', targetId: 'b-1' }));
    });

    it('answers 404 when the team answers a booking that is not there', async () => {
        bookings.confirm.mockResolvedValue(null);
        bookings.decline.mockResolvedValue(null);
        expect((await call('POST', `/admin/golf/bookings/${REF}/confirm`, { role: 'admin' })).status).toBe(404);
        expect((await call('POST', `/admin/golf/bookings/${REF}/decline`, { role: 'admin' })).status).toBe(404);
    });

    it('tells a customer when free cancellation ends and whether they can still cancel', async () => {
        bookings.getForUser.mockResolvedValue({ ...BOOKING, status: 'confirmed' });
        const data = (await call('GET', `/golf/bookings/${REF}`, { role: 'customer' })).body.data as Record<string, unknown>;
        expect(data).toMatchObject({ freeCancelUntil: '2099-01-01T00:00:00.000Z', refundAmount: 0, cancellable: true });

        bookings.getForUser.mockResolvedValue({ ...BOOKING, status: 'confirmed', freeCancelUntil: '2001-01-01T00:00:00.000Z' });
        const late = (await call('GET', `/golf/bookings/${REF}`, { role: 'customer' })).body.data as Record<string, unknown>;
        expect(late.cancellable).toBe(false);
    });

    it('lets a customer cancel their own booking', async () => {
        bookings.cancelByCustomer.mockResolvedValue({ ...BOOKING, status: 'cancelled', refundAmount: 210000 });
        const res = await call('POST', `/golf/bookings/${REF}/cancel`, { role: 'customer' });
        expect(res.status).toBe(200);
        expect(bookings.cancelByCustomer).toHaveBeenCalledWith(REF, 'admin-1');
        expect(res.body.data).toMatchObject({ status: 'cancelled', refundAmount: 210000 });
        expect(res.body.data).not.toHaveProperty('paymentIntentId');
    });

    it('needs a session to cancel, and answers 404 for what is not theirs', async () => {
        expect((await call('POST', `/golf/bookings/${REF}/cancel`)).status).toBe(401);
        bookings.cancelByCustomer.mockResolvedValue(null);
        expect((await call('POST', `/golf/bookings/${REF}/cancel`, { role: 'customer' })).status).toBe(404);
        bookings.cancelByCustomer.mockClear();
        expect((await call('POST', '/golf/bookings/nope/cancel', { role: 'customer' })).status).toBe(404);
        expect(bookings.cancelByCustomer).not.toHaveBeenCalled();
    });

    it("passes on why a cancellation was refused", async () => {
        bookings.cancelByCustomer.mockRejectedValue(new AppError(409, 'Free cancellation has ended.', 'FREE_CANCELLATION_ENDED'));
        const res = await call('POST', `/golf/bookings/${REF}/cancel`, { role: 'customer' });
        expect(res.status).toBe(409);
        expect(res.body.error).toBe('FREE_CANCELLATION_ENDED');
    });

    it('lets the team cancel and refund, behind the admin role, and audits it', async () => {
        expect((await call('POST', `/admin/golf/bookings/${REF}/cancel`, { role: 'customer' })).status).toBe(403);
        expect(bookings.cancelByTeam).not.toHaveBeenCalled();

        bookings.cancelByTeam.mockResolvedValue({ ...BOOKING, status: 'cancelled', refundAmount: 210000 });
        expect((await call('POST', `/admin/golf/bookings/${REF}/cancel`, { role: 'admin' })).status).toBe(200);
        expect(bookings.cancelByTeam).toHaveBeenCalledWith(REF);
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'golf_booking_cancel', targetId: 'b-1' }));

        bookings.cancelByTeam.mockResolvedValue(null);
        expect((await call('POST', `/admin/golf/bookings/${REF}/cancel`, { role: 'admin' })).status).toBe(404);
    });

    it('refuses to delete a course with bookings, in words the admin can act on', async () => {
        svc.delete.mockRejectedValue(new CourseHasBookingsError());
        const res = await call('DELETE', `/admin/golf/courses/${ID}`, { role: 'admin' });
        expect(res.status).toBe(409);
        expect(res.body.error).toBe('COURSE_HAS_BOOKINGS');
    });
});
