/**
 * Google Places photo proxy
 *
 * GET /api/photos/place?photo_reference=<ref>&maxwidth=400
 * GET /api/photos/poi?photo_reference=<ref>&maxwidth=400
 *
 * Proxies photos through the server to hide the Google Places API key.
 * Responses are cached at the CDN/browser level for 24 hours.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { config } from '@/config';
import { AppError } from '@/middleware/error.middleware';

const router = Router();

async function proxyGooglePhoto(req: Request, res: Response, next: NextFunction) {
    try {
        const photoReference = req.query.photo_reference as string;
        const maxWidth       = (req.query.maxwidth as string) || '400';

        if (!photoReference) {
            throw new AppError(400, 'Missing photo_reference', 'VALIDATION_ERROR');
        }

        if (!config.GOOGLE_PLACES_API_KEY) {
            throw new AppError(500, 'Google API key not configured', 'CONFIG_ERROR');
        }

        const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${encodeURIComponent(photoReference)}&key=${config.GOOGLE_PLACES_API_KEY}`;

        const upstream = await fetch(googleUrl, { signal: AbortSignal.timeout(8000) });

        if (!upstream.ok) {
            throw new AppError(upstream.status, 'Failed to fetch photo from Google', 'UPSTREAM_ERROR');
        }

        const buffer      = Buffer.from(await upstream.arrayBuffer());
        const contentType = upstream.headers.get('content-type') || 'image/jpeg';

        res.set({
            'Content-Type':  contentType,
            'Cache-Control': 'public, max-age=86400',
        });
        res.send(buffer);
    } catch (err) {
        next(err);
    }
}

router.get('/place', proxyGooglePhoto);
router.get('/poi',   proxyGooglePhoto);

export default router;
