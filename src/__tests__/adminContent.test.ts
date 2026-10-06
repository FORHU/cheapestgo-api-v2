import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminContentService, readPage, readTargets } from '@/services/adminContent.service';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

/**
 * C5: the back office's list-and-edit screens.
 *
 * The rules worth testing are the refusals. A page size taken straight from a query string is a
 * way to ask for the whole table in one response; an action with no ids is a `deleteMany` with
 * an empty filter, which deletes everything the screen was showing.
 */

describe('readPage', () => {
    it('defaults to the first page of twenty', () => {
        expect(readPage({})).toEqual({ page: 1, pageSize: 20, query: undefined });
    });

    it('refuses a page below the first', () => {
        expect(readPage({ page: '0' }).page).toBe(1);
        expect(readPage({ page: '-4' }).page).toBe(1);
        expect(readPage({ page: 'not a number' }).page).toBe(1);
    });

    it('caps how much one request may ask for', () => {
        expect(readPage({ pageSize: '100000' }).pageSize).toBe(100);
        // Zero or unparseable reads as "unspecified", which is the default rather than a page
        // of one row — a screen asking for nothing wants the usual screenful.
        expect(readPage({ pageSize: '0' }).pageSize).toBe(20);
        expect(readPage({ pageSize: 'lots' }).pageSize).toBe(20);
    });

    it('treats a blank search as no search at all', () => {
        expect(readPage({ q: '   ' }).query).toBeUndefined();
        expect(readPage({ q: '  seoul ' }).query).toBe('seoul');
    });
});

describe('readTargets', () => {
    it('takes one id or many', () => {
        expect(readTargets({ id: 'a' })).toEqual(['a']);
        expect(readTargets({ ids: ['a', 'b'] })).toEqual(['a', 'b']);
    });

    it('refuses an action with nothing to act on', () => {
        // The alternative is a delete with an empty filter, which empties the table.
        expect(() => readTargets({})).toThrow(/id or ids required/);
        expect(() => readTargets({ ids: [] })).toThrow(/id or ids required/);
    });

    it('ignores ids that are not ids', () => {
        expect(() => readTargets({ ids: [null, 42] as never })).toThrow(/id or ids required/);
    });
});

describe('AdminContentService', () => {
    const repo = {
        listDestinations: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 1 })),
        createDestination: vi.fn(async (d: unknown) => d),
        updateDestination: vi.fn(async () => ({})),
        deleteDestinations: vi.fn(async () => ({ count: 2 })),
        listSavedTrips: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 1, counts: { flights: 0, hotels: 0, all: 0 } })),
        deleteSavedTrips: vi.fn(async () => ({ count: 1 })),
        listPriceAlerts: vi.fn(async () => ({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 1 })),
        setPriceAlertsActive: vi.fn(async () => ({ count: 1 })),
        deletePriceAlerts: vi.fn(async () => ({ count: 1 })),
        listNotifications: vi.fn(async () => []),
        markNotificationRead: vi.fn(async () => {}),
        markAllNotificationsRead: vi.fn(async () => {}),
    };
    const service = new AdminContentService(repo as never);

    beforeEach(() => vi.clearAllMocks());

    it('refuses a destination with no city or country', async () => {
        await expect(service.createDestination({ city: '  ', country: 'Korea' })).rejects.toThrow(/required/);
        expect(repo.createDestination).not.toHaveBeenCalled();
    });

    it('trims what it stores', async () => {
        await service.createDestination({ city: '  Seoul ', country: ' South Korea ' });
        expect(repo.createDestination).toHaveBeenCalledWith(
            expect.objectContaining({ city: 'Seoul', country: 'South Korea' }),
        );
    });

    it('only filters saved trips by a type that exists', async () => {
        await service.listSavedTrips({ type: 'spaceship' });
        expect(repo.listSavedTrips).toHaveBeenCalledWith(expect.objectContaining({ type: undefined }));
    });

    it('turns price alerts off without deleting them', async () => {
        await service.actOnPriceAlerts({ action: 'deactivate', ids: ['a', 'b'] });
        expect(repo.setPriceAlertsActive).toHaveBeenCalledWith(['a', 'b'], false);
        expect(repo.deletePriceAlerts).not.toHaveBeenCalled();
    });

    it('refuses an action it does not recognise rather than guessing', async () => {
        await expect(service.actOnPriceAlerts({ action: 'purge', ids: ['a'] })).rejects.toThrow(/Unknown action/);
        await expect(service.actOnNotifications({ action: 'markSomething' })).rejects.toThrow(/Unknown action/);
    });

    it('marks every notification read without needing an id', async () => {
        await service.actOnNotifications({ action: 'markAllRead' });
        expect(repo.markAllNotificationsRead).toHaveBeenCalled();
    });
});
