/**
 * `/bookings/:id` matches any single path segment, so where it is declared decides whether the
 * fixed paths beside it are reachable at all. Declared first, it answered `GET /saved-trips` and
 * `GET /price-alerts` as a booking lookup for an id of "saved-trips" — a 404 for every client.
 *
 * This drives the real router, with each handler answering with its own name, so a reordering
 * shows up as the wrong name rather than as a silent shadow.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

// Hoisted with the mocks below, which are lifted above ordinary declarations.
const { named } = vi.hoisted(() => ({
    named: (name: string): RequestHandler => (req, res) => { res.json({ handler: name, id: req.params.id ?? null }); },
}));

vi.mock('@/controllers/bookings.controller', () => ({
    BookingsController: class {
        list = named('list');
        details = named('details');
        amend = named('amend');
        share = named('share');
        getSavedTrips = named('getSavedTrips');
        saveTrip = named('saveTrip');
        deleteSavedTrip = named('deleteSavedTrip');
        getPriceAlerts = named('getPriceAlerts');
        createPriceAlert = named('createPriceAlert');
        deletePriceAlert = named('deletePriceAlert');
    },
}));
vi.mock('@/middleware/auth.middleware', () => ({ requireAuth: ((_q, _s, next) => next()) as RequestHandler }));

import router from '@/routes/bookings.route';

let server: Server;
let base = '';

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/bookings', router);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/bookings`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = async (method: string, path: string) => {
    const res = await fetch(base + path, { method });
    return res.json() as Promise<{ handler: string; id: string | null }>;
};

describe('bookings routes', () => {
    it('reaches the fixed paths, not the by-id lookup', async () => {
        expect((await call('GET', '/saved-trips')).handler).toBe('getSavedTrips');
        expect((await call('GET', '/price-alerts')).handler).toBe('getPriceAlerts');
    });

    it('still looks a booking up by id', async () => {
        expect(await call('GET', '/CG-ABC123')).toEqual({ handler: 'details', id: 'CG-ABC123' });
    });

    it('still lists', async () => {
        expect((await call('GET', '/')).handler).toBe('list');
    });

    it('keeps the writes where they were', async () => {
        expect((await call('POST', '/saved-trips')).handler).toBe('saveTrip');
        expect((await call('DELETE', '/saved-trips/abc')).handler).toBe('deleteSavedTrip');
        expect((await call('POST', '/amend')).handler).toBe('amend');
        expect(await call('POST', '/CG-ABC123/share')).toEqual({ handler: 'share', id: 'CG-ABC123' });
    });
});
