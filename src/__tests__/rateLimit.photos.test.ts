import { describe, it, expect } from 'vitest';
import { isPhotoRequest } from '@/middleware/rate-limit.middleware';

const req = (originalUrl: string) => ({ originalUrl, path: originalUrl.split('?')[0] });

describe('isPhotoRequest', () => {
    it.each(['/api/v2/photos/poi?name=x', '/api/v2/photos/place', '/api/v2/photos/destination?iata=SIN'])(
        'is true for %s', (url) => expect(isPhotoRequest(req(url))).toBe(true),
    );

    it.each(['/api/v2/hotels/nearby', '/api/v2/photosynthesis', '/api/v2/search', '/api/v2/search?next=/api/v2/photos/poi'])(
        'is false for %s', (url) => expect(isPhotoRequest(req(url))).toBe(false),
    );
});
