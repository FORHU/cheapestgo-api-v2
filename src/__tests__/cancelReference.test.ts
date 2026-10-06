import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config', () => ({
    config: { TRAVELGATEX_API_KEY: 'test-key', TRAVELGATEX_CODE: 'AC1' },
}));
const { prismaMock } = vi.hoisted(() => ({ prismaMock: { $queryRaw: vi.fn(), $executeRaw: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { cancelTgx } from '@/lib/hotels/travelgatex';

/**
 * Which reference a cancellation is addressed by.
 *
 * OTV rejects a cancel addressed by supplier reference with "Request not accepted by supplier"
 * while accepting the identical booking by client reference — measured on CG-770AZS / supplier
 * 448577296. v1 only ever worked here by accident (its supplier reference read as undefined and
 * it fell through to the client branch), so this is pinned by a test rather than a comment.
 *
 * Driven through the real GraphQL client with `fetch` stubbed, so the request that would go to
 * OTV is what is asserted on. **No cancellation is sent to the live supplier.**
 */

const body = (over: any) => ({
    ok:   true,
    json: async () => ({ data: { hotelX: { cancel: over } } }),
});

const CANCELLED = body({
    cancellation: { status: 'CANCELLED', reference: { supplier: 'S1', client: 'CG-1' }, price: { net: 0, currency: 'PHP' } },
    errors: [],
});
const REJECTED = body({ cancellation: null, errors: [{ description: 'Request not accepted by supplier' }] });

/** The `input` each request carried, in order. */
const inputsUsed = () => (fetch as any).mock.calls.map((c: any[]) => JSON.parse(c[1].body).variables.input);

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'attempt-1' }]);
    prismaMock.$executeRaw.mockResolvedValue(1);
});

describe('cancelTgx', () => {
    it('addresses the booking by client reference first', async () => {
        (fetch as any).mockResolvedValue(CANCELLED);

        await cancelTgx({ clientReference: 'CG-1', supplierReference: 'S1', hotelCode: 'H1' });

        expect(fetch).toHaveBeenCalledOnce();
        expect(inputsUsed()[0].reference).toEqual({ client: 'CG-1' });
    });

    it('falls back to the supplier reference only when the client one is refused', async () => {
        (fetch as any).mockResolvedValueOnce(REJECTED).mockResolvedValueOnce(CANCELLED);

        const result = await cancelTgx({ clientReference: 'CG-1', supplierReference: 'S1' });

        expect(inputsUsed()).toHaveLength(2);
        expect(inputsUsed()[0].reference).toEqual({ client: 'CG-1' });
        expect(inputsUsed()[1].reference).toEqual({ supplier: 'S1' });
        expect(result.status).toBe('CANCELLED');
    });

    it('uses the TGX booking id alone when there is one', async () => {
        (fetch as any).mockResolvedValue(CANCELLED);

        await cancelTgx({ tgxBookingId: 'BK1', clientReference: 'CG-1', supplierReference: 'S1' });

        expect(fetch).toHaveBeenCalledOnce();
        expect(inputsUsed()[0]).toEqual({ bookingID: 'BK1' });
    });

    it('reports an already-cancelled booking as such rather than as a plain failure', async () => {
        // The caller treats this differently: there is nothing left to cancel, so the refund
        // should still proceed.
        (fetch as any).mockResolvedValue(body({ cancellation: null, errors: [{ description: 'Booking already cancelled' }] }));

        await expect(cancelTgx({ clientReference: 'CG-1' }))
            .rejects.toMatchObject({ alreadyCancelled: true });
    });

    it('refuses when it has nothing to address the booking by', async () => {
        await expect(cancelTgx({})).rejects.toThrow(/No reference/);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not report a cancellation the supplier did not confirm', async () => {
        (fetch as any).mockResolvedValue(body({
            cancellation: { status: 'PENDING', reference: {}, price: {} },
            errors: [],
        }));

        await expect(cancelTgx({ clientReference: 'CG-1' })).rejects.toThrow(/not confirmed/);
    });

    it('records the cancellation before asking the supplier, and closes it after', async () => {
        // A mutation that times out has still very likely reached OTV. CG-770AZS is what a
        // supplier booking with no row anywhere looks like from their side and from ours.
        (fetch as any).mockResolvedValue(CANCELLED);

        await cancelTgx({ clientReference: 'CG-1' });

        expect(prismaMock.$queryRaw).toHaveBeenCalledOnce();  // opened
        expect(prismaMock.$executeRaw).toHaveBeenCalledOnce(); // closed
    });

    it('closes the attempt as failed when the supplier refuses', async () => {
        (fetch as any).mockResolvedValue(REJECTED);

        await expect(cancelTgx({ clientReference: 'CG-1' })).rejects.toThrow();

        // Closed, not left open — an open row means "we asked and never found out".
        expect(prismaMock.$executeRaw).toHaveBeenCalledOnce();
    });

    it('still cancels when the attempt row cannot be written', async () => {
        // Refusing to proceed because the audit row failed would turn a logging outage into
        // a cancellation the guest was promised and did not get.
        prismaMock.$queryRaw.mockRejectedValue(new Error('db down'));
        (fetch as any).mockResolvedValue(CANCELLED);

        await expect(cancelTgx({ clientReference: 'CG-1' })).resolves.toMatchObject({ status: 'CANCELLED' });
    });
});
