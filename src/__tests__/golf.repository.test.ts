import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), $executeRaw: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));

import { GolfRepository, SlugTakenError, type GolfCourseRecord } from '@/repositories/golf.repository';

const sql    = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');
const values = (call: unknown[]) => call.slice(1);

const ROW = {
    id: '0b6c7a2e-1111-4a5b-9c3d-000000000001', slug: 'wack-wack', name: 'Wack Wack', country: 'Philippines',
    city: 'Mandaluyong', address: null, description: 'Two courses.', holes: 36, par: 72,
    green_fee_from: '85.50', currency: 'USD', image_urls: ['https://img.example/a.jpg'], amenities: ['caddie'],
    status: 'published', created_at: new Date('2026-11-01T00:00:00Z'), updated_at: new Date('2026-11-02T00:00:00Z'),
};

const RECORD: GolfCourseRecord = {
    slug: 'wack-wack', name: 'Wack Wack', country: 'Philippines', city: 'Mandaluyong', address: null,
    description: '', holes: 36, par: 72, greenFeeFrom: 85.5, currency: 'USD', imageUrls: [], amenities: [],
};

let repo: GolfRepository;

beforeEach(() => {
    vi.clearAllMocks();
    db.$queryRaw.mockResolvedValue([]);
    db.$executeRaw.mockResolvedValue(0);
    repo = new GolfRepository();
});

describe('mapping', () => {
    it('speaks camelCase and numbers, not rows and decimals', async () => {
        db.$queryRaw.mockResolvedValueOnce([ROW]);
        expect(await repo.findBySlug('wack-wack')).toEqual({
            id: ROW.id, slug: 'wack-wack', name: 'Wack Wack', country: 'Philippines', city: 'Mandaluyong',
            address: null, description: 'Two courses.', holes: 36, par: 72, greenFeeFrom: 85.5, currency: 'USD',
            imageUrls: ['https://img.example/a.jpg'], amenities: ['caddie'], status: 'published',
            createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
        });
    });

    it('keeps an unpriced course unpriced', async () => {
        db.$queryRaw.mockResolvedValueOnce([{ ...ROW, green_fee_from: null }]);
        expect((await repo.findBySlug('wack-wack'))!.greenFeeFrom).toBeNull();
    });
});

describe('listPublished', () => {
    it('asks for published courses only, in every country when none is named', async () => {
        await repo.listPublished();
        const call = db.$queryRaw.mock.calls[0];
        expect(sql(call)).toContain("status = 'published'");
        expect(values(call)).toEqual([null, null]);
    });

    it('narrows to the country it is given', async () => {
        await repo.listPublished('Philippines');
        expect(values(db.$queryRaw.mock.calls[0])).toEqual(['Philippines', 'Philippines']);
    });
});

describe('listForAdmin', () => {
    it('treats wildcards typed into the search as text', async () => {
        db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);
        await repo.listForAdmin({ query: '50%_off', page: 1, pageSize: 20 });
        expect(values(db.$queryRaw.mock.calls[0])).toContain('%50\\%\\_off%');
    });

    it('pages, and counts every match', async () => {
        db.$queryRaw.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([{ total: 41 }]);
        const out = await repo.listForAdmin({ page: 3, pageSize: 20 });
        expect(values(db.$queryRaw.mock.calls[0])).toEqual([null, null, null, null, 20, 40]);
        expect(out.total).toBe(41);
        expect(out.courses).toHaveLength(1);
    });
});

describe('writes', () => {
    it('reports a slug another course holds as SlugTakenError', async () => {
        db.$queryRaw.mockRejectedValueOnce(Object.assign(
            new Error('Raw query failed. Code: `23505`. Message: `duplicate key value violates unique constraint "golf_courses_slug_key"`'),
            { code: 'P2010', meta: { code: '23505' } },
        ));
        await expect(repo.create(RECORD)).rejects.toBeInstanceOf(SlugTakenError);
    });

    it('lets any other failure through as it was', async () => {
        const boom = new Error('connection reset');
        db.$queryRaw.mockRejectedValueOnce(boom);
        await expect(repo.create(RECORD)).rejects.toBe(boom);
    });

    it('answers null for an update to a course that is not there', async () => {
        expect(await repo.update(ROW.id, RECORD)).toBeNull();
        expect(await repo.setStatus(ROW.id, 'published')).toBeNull();
    });

    it('says whether a delete removed anything', async () => {
        db.$executeRaw.mockResolvedValueOnce(1);
        expect(await repo.delete(ROW.id)).toBe(true);
        expect(await repo.delete(ROW.id)).toBe(false);
    });
});
