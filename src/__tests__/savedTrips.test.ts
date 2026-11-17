import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookingsService } from '@/services/bookings.service';

/**
 * Shortlisting a hotel or a flight. See mobile ADR-0004 and #43.
 *
 * The write used to name three columns that do not exist — `hotel_id`, `hotel_name`,
 * `details` — compiling only because of an `as any`. Every call failed at the database, both
 * clients caught the failure and kept a local copy, and `saved_trips` never held a row. These
 * cases are the ones that would have caught it: what reaches the table, and what identifies
 * a row once it is there.
 */

const repo = {
    saveTrip: vi.fn(),
    findSavedTrip: vi.fn(),
    getSavedTrips: vi.fn(),
    deleteSavedTrip: vi.fn(),
};

const svc = new BookingsService();
// The service builds its own repository; this replaces it with one we can watch.
(svc as unknown as { repo: typeof repo }).repo = repo;

const stay = {
    type: 'hotel' as const,
    title: 'Bayside Grand Manila',
    deepLink: '/property/MOCK-MNL-001',
    snapshot: { hotelId: 'MOCK-MNL-001' },
};

beforeEach(() => {
    vi.clearAllMocks();
    repo.findSavedTrip.mockResolvedValue(null);
    repo.saveTrip.mockImplementation(async (data: unknown) => ({ id: 'row-1', ...(data as object) }));
});

describe('saving a trip', () => {
    it('writes the columns the table actually has', async () => {
        await svc.saveTrip('user-1', { ...stay, subtitle: 'Manila', price: 138, imageUrl: 'https://pic' });

        const written = repo.saveTrip.mock.calls[0][0];
        expect(written).toMatchObject({
            userId: 'user-1',
            type: 'hotel',
            title: 'Bayside Grand Manila',
            deepLink: '/property/MOCK-MNL-001',
            price: 138,
        });
        // The three that never existed. Naming any of them again is the original bug.
        expect(written).not.toHaveProperty('hotelId');
        expect(written).not.toHaveProperty('hotelName');
        expect(written).not.toHaveProperty('details');
    });

    // A heart tapped twice, or a client that lost the answer and retried, is one shortlist
    // entry — not the same hotel listed twice.
    it('returns the existing row instead of a duplicate', async () => {
        repo.findSavedTrip.mockResolvedValue({ id: 'already-there' });

        const result = await svc.saveTrip('user-1', stay);

        expect(result).toEqual({ id: 'already-there' });
        expect(repo.saveTrip).not.toHaveBeenCalled();
    });

    it('looks for a duplicate by what identifies the kind', async () => {
        await svc.saveTrip('user-1', stay);
        expect(repo.findSavedTrip).toHaveBeenCalledWith('user-1', {
            hotelId: 'MOCK-MNL-001', provider: undefined, offerId: undefined,
        });

        await svc.saveTrip('user-1', {
            type: 'flight', title: 'MNL → ICN', deepLink: '/flights?offer=abc',
            snapshot: { provider: 'duffel', offerId: 'off_123' },
        });
        expect(repo.findSavedTrip).toHaveBeenLastCalledWith('user-1', {
            hotelId: undefined, provider: 'duffel', offerId: 'off_123',
        });
    });

    // Without identity the row can never be matched again: the heart would not know it is
    // filled, and un-saving would have nothing to delete.
    it('refuses a stay with no hotelId', async () => {
        await expect(svc.saveTrip('user-1', { ...stay, snapshot: {} }))
            .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
        expect(repo.saveTrip).not.toHaveBeenCalled();
    });

    it('refuses a flight with no offerId', async () => {
        await expect(svc.saveTrip('user-1', {
            type: 'flight', title: 'MNL → ICN', deepLink: '/flights', snapshot: { provider: 'duffel' },
        })).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
        expect(repo.saveTrip).not.toHaveBeenCalled();
    });

    // Both kinds, because the table has always been able to hold both and only the API could
    // not. V2's flight button has been posting this shape and getting a 400.
    it('accepts a flight', async () => {
        await svc.saveTrip('user-1', {
            type: 'flight', title: 'MNL → ICN', price: 224, deepLink: '/flights?offer=abc',
            snapshot: { provider: 'duffel', offerId: 'off_123' },
        });
        expect(repo.saveTrip.mock.calls[0][0]).toMatchObject({ type: 'flight', price: 224 });
    });
});

describe('removing a saved trip', () => {
    it('is a 404 when it is not this traveller’s', async () => {
        repo.deleteSavedTrip.mockResolvedValue({ count: 0 });
        await expect(svc.deleteSavedTrip('row-1', 'user-1'))
            .rejects.toMatchObject({ statusCode: 404 });
    });
});
