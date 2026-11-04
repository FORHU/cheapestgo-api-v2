import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getProperty against the REAL ensureEtgContent.
 *
 * `hotels.service.property.test.ts` mocks that function away, so every case there asks what
 * happens *given* ETG content resolves — and none of them noticed that for a dump-seeded
 * hotel it never did. Production served 20 rooms whose photographs were all the hotel's
 * exterior shot while the room groups sat in the row, seeded 2026-08-20.
 *
 * So this file mocks the row and the network, and leaves the function under test alone.
 */
vi.mock('@/config', () => ({ config: { RESEND_API_KEY: '', SITE_URL: 'https://cheapestgo.com' } }));
vi.mock('@/lib/hotels/search', () => ({ runTgxSearch: vi.fn() }));
vi.mock('@/lib/hotels/travelgatex', () => ({
  quoteTgx: vi.fn(), bookTgx: vi.fn(), cancelTgx: vi.fn(), fetchAmenitiesByDestination: vi.fn(),
}));
vi.mock('@/lib/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: { hotel_content: { update: vi.fn().mockResolvedValue({}) } },
}));
vi.mock('@/repositories/hotels.repository', () => ({
  HotelsRepository: vi.fn(function (this: any) {
    this.findHotelContent     = vi.fn();
    this.findHotelReviews     = vi.fn();
    this.findHotelReviewItems = vi.fn();
  }),
}));
vi.mock('@/middleware/error.middleware', () => ({
  AppError: class extends Error { constructor(public status: number, m: string, public code: string) { super(m); } },
}));

import { runTgxSearch } from '@/lib/hotels/search';
import { HotelsService } from '@/services/hotels.service';

/** Older than FRESH_MS (30 days) — as every hotel is, with the content crons down. */
const STALE = new Date(Date.now() - 75 * 24 * 3600 * 1000);

/** What the bulk dump leaves behind: room_groups populated, etg_content_seeded_at untouched. */
const dumpSeededRow = {
  hotel_id: 'H1', name: 'Grand', ratehawk_hid: 'slug_1',
  etg_content_seeded_at: null,
  room_groups_seeded_at: STALE,
  room_groups: [
    { name: 'Standard Double Room', images: ['{size}/std.jpg'], room_amenities: ['tv'] },
    { name: 'Deluxe Double Room',   images: ['{size}/dlx.jpg'], room_amenities: ['tv'] },
  ],
  amenity_groups: [{ group_name: 'General', amenities: ['Lift'] }],
  metapolicy_struct: null, metapolicy_extra_info: null, important_information: null,
};

let svc: HotelsService;
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  svc = new HotelsService();
  (svc as any).repo.findHotelContent.mockResolvedValue(dumpSeededRow);
  (svc as any).repo.findHotelReviews.mockResolvedValue(null);
  (svc as any).repo.findHotelReviewItems.mockResolvedValue([]);
  vi.mocked(runTgxSearch).mockResolvedValue({
    data: [{ roomTypes: [
      { offerId: 'o1', roomName: 'Standard Double Room', boardCode: 'BB', price: 200, currency: 'USD' },
      { offerId: 'o2', roomName: 'Deluxe Double Room',   boardCode: 'BB', price: 300, currency: 'USD' },
    ] }],
  } as any);
});

const galleryOf = (out: any, name: string) =>
  out.rooms.find((r: any) => r.name === name)?.content?.gallery;

describe('getProperty() — dump-seeded rooms keep their own photographs', () => {
  it('serves stored room photos when ETG refuses the refetch', async () => {
    // Exactly production on 2026-11-03: stale row, supplier answering nothing useful.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));

    const out = await svc.getProperty('H1', { checkIn: '2026-11-25', checkOut: '2026-11-26' });

    expect(galleryOf(out, 'Standard Double Room')).toEqual(['1024x768/std.jpg']);
    expect(galleryOf(out, 'Deluxe Double Room')).toEqual(['1024x768/dlx.jpg']);
  });

  it('serves them when the fetch throws outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')));
    const out = await svc.getProperty('H1', { checkIn: '2026-11-25', checkOut: '2026-11-26' });
    expect(galleryOf(out, 'Standard Double Room')).toEqual(['1024x768/std.jpg']);
  });

  it('serves them when the hotel has no ratehawk_hid to refetch with', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    (svc as any).repo.findHotelContent.mockResolvedValue({ ...dumpSeededRow, ratehawk_hid: null });

    const out = await svc.getProperty('H1', { checkIn: '2026-11-25', checkOut: '2026-11-26' });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(galleryOf(out, 'Deluxe Double Room')).toEqual(['1024x768/dlx.jpg']);
  });

  it('still returns no content when the row genuinely holds nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    (svc as any).repo.findHotelContent.mockResolvedValue({ ...dumpSeededRow, room_groups: [] });

    const out = await svc.getProperty('H1', { checkIn: '2026-11-25', checkOut: '2026-11-26' });

    expect(out.rooms[0].content).toBeUndefined();
  });
});
