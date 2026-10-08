import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('@/config', () => ({ config: { GOOGLE_PLACES_API_KEY: 'test-key' } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/google/poi-details', () => ({
    lookupPoiDetails: vi.fn(async () => ({ name: 'x', photoReference: null })),
    fetchPlacePhoto:  vi.fn(),
    placeholderSvg:   vi.fn(() => '<svg/>'),
}));

import { isPoiPhotoRequest, defaultRateLimit } from '@/middleware/rate-limit.middleware';
import photosRouter from '@/routes/photos.route';

const req = (originalUrl: string) => ({ originalUrl });

describe('isPoiPhotoRequest', () => {
    it.each(['/api/v2/photos/poi?name=x', '/api/v2/photos/poi', '/api/v2/photos/poi/'])(
        'is true for %s', (url) => expect(isPoiPhotoRequest(req(url))).toBe(true),
    );

    it.each([
        '/api/v2/photos/place', '/api/v2/photos/destination?iata=SIN', '/api/v2/photos/poixyz',
        '/api/v2/hotels/nearby', '/api/v2/photosynthesis', '/api/v2/search',
        '/api/v2/search?next=/api/v2/photos/poi',
    ])('is false for %s', (url) => expect(isPoiPhotoRequest(req(url))).toBe(false));
});

describe('limiter wiring', () => {
    let server: Server;
    let base: string;

    beforeAll(async () => {
        const app = express();
        app.use(defaultRateLimit);
        app.use('/api/v2/photos', photosRouter);
        app.get('/api/v2/other', (_q, r) => { r.send('ok'); });
        server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise((resolve) => server.close(resolve)));

    it('counts /photos/poi against the photos limiter, not the global one', async () => {
        const res = await fetch(`${base}/api/v2/photos/poi?name=x&lat=1&lng=2&full=true`);
        const policy = res.headers.get('ratelimit-policy') ?? '';

        expect(res.status).toBe(200);
        expect(policy).toContain('w=60');
        expect(policy).not.toContain('w=900');
    });

    it('still counts other routes against the global limiter', async () => {
        const res = await fetch(`${base}/api/v2/other`);

        expect(res.headers.get('ratelimit-policy') ?? '').toContain('w=900');
    });

    it('lets other origins show the photos', async () => {
        const res = await fetch(`${base}/api/v2/photos/poi?name=x&lat=1&lng=2&full=true`);

        expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    });
});
