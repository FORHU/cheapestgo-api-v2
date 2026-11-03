import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { hotel_content: { update: vi.fn().mockResolvedValue({}) } },
}));

import { prisma } from '@/lib/prisma';
import { ensureEtgContent } from '@/lib/hotels/etgContent';

const FRESH = new Date();
const STALE = new Date(Date.now() - 40 * 24 * 3600 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ensureEtgContent', () => {
  // hotel_content stores the RAW ETG blobs; ensureEtgContent parses on every read.
  it('parses the cached DB row without fetching when content is fresh', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const row = {
      hotel_id: 'H1', ratehawk_hid: 'slug_1', etg_content_seeded_at: FRESH,
      room_groups: [{ name: 'Std Room', images: [], room_amenities: ['wi-fi'],
                      name_struct: { bedding_type: 'double bed' } }],
      amenity_groups: [{ group_name: 'Internet', amenities: ['Free WiFi'] }],
      metapolicy_struct: null, metapolicy_extra_info: null, important_information: null,
    };
    const out = await ensureEtgContent('H1', row as any);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(out?.roomGroups[0]).toMatchObject({
      name: 'Std Room', roomAmenities: ['wi-fi'], beddingType: 'double bed',
    });
    expect(out?.amenityGroups[0].groupName).toBe('Internet');
  });

  it('re-fetches when the cache is fresh but room_groups was never seeded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: { room_groups: [], amenity_groups: [] } }),
    }));
    const row = {
      hotel_id: 'H1', ratehawk_hid: 'slug_1', etg_content_seeded_at: FRESH,
      room_groups: null, amenity_groups: null, metapolicy_struct: null,
    };
    await ensureEtgContent('H1', row as any);
    expect(fetch).toHaveBeenCalled();
  });

  it('returns null when there is no ratehawk_hid to fetch with', async () => {
    const row = { hotel_id: 'H1', ratehawk_hid: null, etg_content_seeded_at: null };
    expect(await ensureEtgContent('H1', row as any)).toBeNull();
  });

  it('fetches hotel/info when stale, then stores RAW blobs and returns parsed content', async () => {
    const update = vi.mocked(prisma.hotel_content.update);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {
        room_groups: [{ name: 'Deluxe', images: ['{size}/a.jpg'], room_amenities: ['tv'] }],
        amenity_groups: [{ group_name: 'General', amenities: ['Lift'] }],
        metapolicy_struct: { cot: [{ inclusion: 'paid', price: 10, currency: 'USD' }] },
        metapolicy_extra_info: 'ID required.',
      } }),
    }));
    const row = { hotel_id: 'H1', ratehawk_hid: 'slug_1', etg_content_seeded_at: STALE };
    const out = await ensureEtgContent('H1', row as any);
    expect(out?.roomGroups[0].images[0]).toBe('1024x768/a.jpg');
    expect(out?.roomGroups[0].roomAmenities).toEqual(['tv']);
    expect(out?.amenityGroups[0].groupName).toBe('General');
    expect(out?.metapolicy?.cot?.[0].price).toBe(10);
    const stored = update.mock.calls[0][0].data as any;
    expect(stored.room_groups[0].room_amenities).toEqual(['tv']);
    expect(stored.metapolicy_extra_info).toBe('ID required.');
  });

  it('returns null (no throw) when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const row = { hotel_id: 'H1', ratehawk_hid: 'slug_1', etg_content_seeded_at: STALE };
    expect(await ensureEtgContent('H1', row as any)).toBeNull();
  });

  /**
   * The bulk dump stamps `room_groups_seeded_at` and never `etg_content_seeded_at`, so reading
   * only the latter treated every dump-seeded hotel as unseeded — and when the refetch then
   * returned nothing, every room on the property page fell back to the hotel's exterior shot.
   */
  const dumpSeeded = (seededAt: Date) => ({
    hotel_id: 'H1', ratehawk_hid: 'slug_1',
    etg_content_seeded_at: null, room_groups_seeded_at: seededAt,
    room_groups: [{ name: 'Deluxe Twin', images: ['{size}/room.jpg'], room_amenities: ['tv'] }],
  });

  it('serves dump-seeded room groups without fetching', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const out = await ensureEtgContent('H1', dumpSeeded(FRESH) as any);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(out?.roomGroups[0].name).toBe('Deluxe Twin');
  });

  it('falls back to stale room groups when the refetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const out = await ensureEtgContent('H1', dumpSeeded(STALE) as any);
    expect(out?.roomGroups[0].images[0]).toBe('1024x768/room.jpg');
  });

  it('keeps stored room groups when ETG answers with an empty set', async () => {
    const update = vi.mocked(prisma.hotel_content.update);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: { room_groups: [], amenity_groups: [] } }),
    }));
    const out = await ensureEtgContent('H1', dumpSeeded(STALE) as any);
    expect(out?.roomGroups[0].name).toBe('Deluxe Twin');
    expect((update.mock.calls[0][0].data as any).room_groups).toHaveLength(1);
  });
});
