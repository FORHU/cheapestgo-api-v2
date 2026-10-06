import { describe, it, expect } from 'vitest';
import {
    findReusablePreOrder,
    sessionOfferId,
    REUSE_WINDOW_MS,
    samePassengerIdentity,
    sameOrderTotal,
    type CandidateSession,
} from '@/lib/flights/preorderReuse';

const OFFER = 'off_0000B91Adm5sNiJ7CKd5k0';
const NOW = new Date('2026-08-04T04:36:44.000Z');

function session(patch: Partial<CandidateSession> = {}): CandidateSession {
    return {
        id: 'sess-previous',
        status: 'payment_initiated',
        duffel_pre_order_id: 'ord_0000B91Adm5sNiJ7CKd5k0',
        duffel_pre_order_pnr: 'BEV5AE',
        payment_intent_id: 'pi_3U0a51C6cOjdwOIC3H1vRpbW',
        flight: { _rawOffer: { id: OFFER } },
        created_at: '2026-08-04T04:35:43.236Z',
        ...patch,
    };
}

const opts = { offerId: OFFER, excludeSessionId: 'sess-current', now: NOW };

describe('sessionOfferId', () => {
    it('reads the Duffel offer id out of the stored flight', () => {
        expect(sessionOfferId(session())).toBe(OFFER);
    });

    it('returns null when the session kept no offer', () => {
        expect(sessionOfferId(session({ flight: {} }))).toBeNull();
        expect(sessionOfferId(session({ flight: undefined }))).toBeNull();
        expect(sessionOfferId(session({ flight: { _rawOffer: { id: '' } } }))).toBeNull();
    });
});

describe('findReusablePreOrder — the two-EVA-tickets case', () => {
    it('reuses the ticket a re-submit of the same offer already bought', () => {
        // BEV5AE at 04:35:43, re-submitted at 04:36:44 after a currency change.
        expect(findReusablePreOrder([session()], opts)?.id).toBe('sess-previous');
    });

    it('reuses across a currency change, because the offer id is unchanged', () => {
        // The display currency lives on our side; the Duffel offer is the same.
        const s = session({ flight: { _rawOffer: { id: OFFER }, currency: 'PHP' } });
        expect(findReusablePreOrder([s], opts)?.id).toBe('sess-previous');
    });

    it('picks the most recent when several attempts bought tickets', () => {
        const older = session({ id: 'older', created_at: '2026-08-04T04:20:00.000Z' });
        const newer = session({ id: 'newer', created_at: '2026-08-04T04:35:43.236Z' });
        expect(findReusablePreOrder([older, newer], opts)?.id).toBe('newer');
    });

    it('accepts every unpaid session status', () => {
        for (const status of ['initiated', 'payment_initiated', 'payment_authorized']) {
            expect(findReusablePreOrder([session({ status })], opts)).not.toBeNull();
        }
    });
});

describe('findReusablePreOrder — refuses anything it should not claim', () => {
    it('never matches the session created for this very attempt', () => {
        expect(findReusablePreOrder([session({ id: 'sess-current' })], opts)).toBeNull();
    });

    it('ignores a different offer — a new search is a new booking', () => {
        const other = session({ flight: { _rawOffer: { id: 'off_something_else' } } });
        expect(findReusablePreOrder([other], opts)).toBeNull();
    });

    it('ignores sessions that never created an order', () => {
        expect(findReusablePreOrder([session({ duffel_pre_order_id: null })], opts)).toBeNull();
    });

    it('ignores already-paid or finished sessions', () => {
        for (const status of ['booked', 'expired', 'cancelled']) {
            expect(findReusablePreOrder([session({ status })], opts)).toBeNull();
        }
    });

    it('ignores anything older than the session window', () => {
        const stale = session({ created_at: new Date(NOW.getTime() - REUSE_WINDOW_MS - 1000).toISOString() });
        expect(findReusablePreOrder([stale], opts)).toBeNull();
    });

    it('keeps a session right at the edge of the window', () => {
        const edge = session({ created_at: new Date(NOW.getTime() - REUSE_WINDOW_MS + 1000).toISOString() });
        expect(findReusablePreOrder([edge], opts)).not.toBeNull();
    });

    it('ignores future-dated rows (clock skew, not a real candidate)', () => {
        const future = session({ created_at: new Date(NOW.getTime() + 60_000).toISOString() });
        expect(findReusablePreOrder([future], opts)).toBeNull();
    });

    it('handles empty, malformed and missing input without throwing', () => {
        expect(findReusablePreOrder([], opts)).toBeNull();
        expect(findReusablePreOrder(undefined as any, opts)).toBeNull();
        expect(findReusablePreOrder([null as any], opts)).toBeNull();
        expect(findReusablePreOrder([session({ created_at: 'not-a-date' })], opts)).toBeNull();
    });

    it('refuses to match when no offer id is supplied', () => {
        expect(findReusablePreOrder([session()], { ...opts, offerId: '' })).toBeNull();
    });
});

// ─── Identity gates ───────────────────────────────────────────────────────────

describe('samePassengerIdentity', () => {
    const submitted = [
        { firstName: 'Maria', lastName: 'Santos', birthDate: '1991-04-02' },
        { firstName: 'Jose', lastName: 'Santos', birthDate: '2015-11-30' },
    ];
    const onOrder = [
        { given_name: 'Maria', family_name: 'Santos', born_on: '1991-04-02' },
        { given_name: 'Jose', family_name: 'Santos', born_on: '2015-11-30' },
    ];

    it('accepts an unchanged submission', () => {
        expect(samePassengerIdentity(onOrder, submitted)).toBe(true);
    });

    it('ignores case and stray whitespace, as an airline would', () => {
        expect(samePassengerIdentity(onOrder, [
            { firstName: '  maria ', lastName: 'SANTOS', birthDate: '1991-04-02' },
            { firstName: 'Jose', lastName: 'Santos', birthDate: '2015-11-30' },
        ])).toBe(true);
    });

    it('rejects a corrected spelling — the whole point of "Back to details"', () => {
        expect(samePassengerIdentity(onOrder, [
            { firstName: 'Mario', lastName: 'Santos', birthDate: '1991-04-02' },
            ...submitted.slice(1),
        ])).toBe(false);
    });

    it('rejects a corrected date of birth', () => {
        expect(samePassengerIdentity(onOrder, [
            { ...submitted[0], birthDate: '1991-04-20' },
            ...submitted.slice(1),
        ])).toBe(false);
    });

    it('rejects a changed passenger count', () => {
        expect(samePassengerIdentity(onOrder, submitted.slice(0, 1))).toBe(false);
    });

    it('rejects reordered passengers — Duffel binds each to an offer passenger id', () => {
        expect(samePassengerIdentity(onOrder, [submitted[1], submitted[0]])).toBe(false);
    });

    it('refuses to match when either side is empty', () => {
        expect(samePassengerIdentity([], submitted)).toBe(false);
        expect(samePassengerIdentity(onOrder, [])).toBe(false);
        expect(samePassengerIdentity(null, null)).toBe(false);
    });

    it('refuses to match blanks against blanks', () => {
        expect(samePassengerIdentity(
            [{ given_name: '', family_name: '', born_on: '' }],
            [{ firstName: '', lastName: '', birthDate: '' }],
        )).toBe(true);
    });
});

describe('sameOrderTotal', () => {
    it('treats trailing-zero variants as equal', () => {
        expect(sameOrderTotal('929.0', '929.00')).toBe(true);
        expect(sameOrderTotal(929, '929.00')).toBe(true);
    });

    it('rejects a total moved by an added bag', () => {
        expect(sameOrderTotal('929.00', '974.00')).toBe(false);
    });

    it('rejects unparseable input rather than guessing', () => {
        expect(sameOrderTotal('', '929.00')).toBe(false);
        expect(sameOrderTotal(undefined, undefined)).toBe(false);
    });
});
