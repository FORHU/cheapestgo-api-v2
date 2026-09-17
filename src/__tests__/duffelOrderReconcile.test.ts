import { describe, it, expect, vi } from 'vitest';
import {
    orderMatches,
    toReconciledOrder,
    findOrderFromTimedOutAttempt,
    type ReconcileCriteria,
} from '@/lib/flights/duffelOrderReconcile';

/**
 * Reconstructed from the real incident: a CRK→NRT order that Duffel created at
 * 04:36:54Z while the client had already aborted, leaving a paid PNR that the
 * app reported as a failure.
 */
const CRITERIA: ReconcileCriteria = {
    sinceIso: '2026-08-04T04:36:44.000Z',
    origin: 'CRK',
    destination: 'NRT',
    totalAmount: '929.00',
    currency: 'USD',
    familyName: 'Busilan',
};

const ORDER = {
    id: 'ord_0000B91AjGM2pCsesdCT1k',
    booking_reference: 'BEWEB3',
    created_at: '2026-08-04T04:36:54.280223Z',
    cancelled_at: null,
    total_amount: '929.00',
    total_currency: 'USD',
    passengers: [{ family_name: 'Busilan', given_name: 'Test' }],
    slices: [{ origin: { iata_code: 'CRK' }, destination: { iata_code: 'NRT' } }],
    documents: [{ type: 'electronic_ticket', unique_identifier: '695-1234567890' }],
};

const withOrder = (patch: Record<string, unknown>) => ({ ...ORDER, ...patch });

describe('orderMatches — claims the order the timeout lost', () => {
    it('matches the order created moments after the attempt started', () => {
        expect(orderMatches(ORDER, CRITERIA)).toBe(true);
    });

    it('tolerates trailing-zero differences in the amount', () => {
        expect(orderMatches(withOrder({ total_amount: '929' }), CRITERIA)).toBe(true);
        expect(orderMatches(withOrder({ total_amount: '929.0' }), CRITERIA)).toBe(true);
    });

    it('is case-insensitive on codes and names', () => {
        expect(orderMatches(ORDER, { ...CRITERIA, origin: 'crk', destination: 'nrt', currency: 'usd', familyName: 'BUSILAN' })).toBe(true);
    });

    it('allows 1s of clock slack on created_at', () => {
        // Duffel stamps created_at server-side; a slightly earlier stamp is still ours.
        expect(orderMatches(withOrder({ created_at: '2026-08-04T04:36:43.500Z' }), CRITERIA)).toBe(true);
    });
});

describe('orderMatches — refuses to claim anything uncertain', () => {
    it('rejects an order created before the attempt', () => {
        // The pre-existing NJ8JY4-style orphan: same shape, earlier booking.
        expect(orderMatches(withOrder({ created_at: '2026-08-04T03:50:15.594Z' }), CRITERIA)).toBe(false);
    });

    it('rejects a different passenger', () => {
        expect(orderMatches(withOrder({ passengers: [{ family_name: 'Someone-Else' }] }), CRITERIA)).toBe(false);
    });

    it('rejects a different price', () => {
        expect(orderMatches(withOrder({ total_amount: '1449.22' }), CRITERIA)).toBe(false);
    });

    it('rejects a different currency', () => {
        expect(orderMatches(withOrder({ total_currency: 'PHP' }), CRITERIA)).toBe(false);
    });

    it('rejects a different route', () => {
        expect(orderMatches(withOrder({ slices: [{ origin: { iata_code: 'CRK' }, destination: { iata_code: 'CJU' } }] }), CRITERIA)).toBe(false);
        expect(orderMatches(withOrder({ slices: [{ origin: { iata_code: 'MNL' }, destination: { iata_code: 'NRT' } }] }), CRITERIA)).toBe(false);
    });

    it('rejects a cancelled order', () => {
        expect(orderMatches(withOrder({ cancelled_at: '2026-08-04T05:00:00Z' }), CRITERIA)).toBe(false);
    });

    it('rejects malformed or empty orders', () => {
        expect(orderMatches(null, CRITERIA)).toBe(false);
        expect(orderMatches({}, CRITERIA)).toBe(false);
        expect(orderMatches(withOrder({ slices: [] }), CRITERIA)).toBe(false);
        expect(orderMatches(withOrder({ created_at: 'not-a-date' }), CRITERIA)).toBe(false);
    });

    it('uses the LAST slice destination on a round trip', () => {
        const roundTrip = withOrder({
            slices: [
                { origin: { iata_code: 'CRK' }, destination: { iata_code: 'NRT' } },
                { origin: { iata_code: 'NRT' }, destination: { iata_code: 'CRK' } },
            ],
        });
        expect(orderMatches(roundTrip, CRITERIA)).toBe(false);                          // outbound-only criteria
        expect(orderMatches(roundTrip, { ...CRITERIA, destination: 'CRK' })).toBe(true); // return leg lands home
    });
});

describe('toReconciledOrder', () => {
    it('extracts the ticket numbers and marks it ticketed', () => {
        expect(toReconciledOrder(ORDER)).toEqual({
            orderId: 'ord_0000B91AjGM2pCsesdCT1k',
            pnr: 'BEWEB3',
            tickets: ['695-1234567890'],
            isTicketed: true,
            orderTotal: '929.00',
            orderCurrency: 'USD',
        });
    });

    it('reports not-ticketed when no documents are present', () => {
        const r = toReconciledOrder(withOrder({ documents: [] }));
        expect(r.tickets).toEqual([]);
        expect(r.isTicketed).toBe(false);
    });
});

describe('findOrderFromTimedOutAttempt', () => {
    const okResponse = (orders: unknown[]) => ({
        ok: true,
        status: 200,
        json: async () => ({ data: orders }),
    }) as unknown as Response;

    it('returns the raw order so the caller can treat it like a normal 201', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(okResponse([ORDER]));
        const found = await findOrderFromTimedOutAttempt('tok', CRITERIA, fetchImpl as any);
        expect(found?.id).toBe('ord_0000B91AjGM2pCsesdCT1k');
        expect(found?.booking_reference).toBe('BEWEB3');
    });

    it('returns null when nothing matches, so the caller still reports the failure', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(okResponse([withOrder({ total_amount: '1.00' })]));
        expect(await findOrderFromTimedOutAttempt('tok', CRITERIA, fetchImpl as any)).toBeNull();
    });

    it('never throws when the lookup itself fails', async () => {
        const boom = vi.fn().mockRejectedValue(new Error('network down'));
        expect(await findOrderFromTimedOutAttempt('tok', CRITERIA, boom as any)).toBeNull();

        const notOk = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
        expect(await findOrderFromTimedOutAttempt('tok', CRITERIA, notOk as any)).toBeNull();
    });

    it('picks the matching order out of a list of unrelated ones', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(okResponse([
            withOrder({ id: 'ord_other', total_amount: '1449.42', booking_reference: 'NHSJME' }),
            ORDER,
        ]));
        const found = await findOrderFromTimedOutAttempt('tok', CRITERIA, fetchImpl as any);
        expect(found?.booking_reference).toBe('BEWEB3');
    });
});
