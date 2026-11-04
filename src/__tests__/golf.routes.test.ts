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
    create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), delete: vi.fn(),
}));
const audit = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/golf.service', () => ({ GolfService: vi.fn(function () { return svc; }) }));
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
    return { requireAuth, requireRole };
});

import golfRoutes from '@/routes/golf.route';
import adminGolfRoutes from '@/routes/admin-golf.route';
import { errorMiddleware } from '@/middleware/error.middleware';
import { SlugTakenError } from '@/repositories/golf.repository';

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
