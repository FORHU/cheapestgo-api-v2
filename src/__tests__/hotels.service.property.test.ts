import { describe, it, expect, vi, beforeEach } from 'vitest';

// hotels.service reaches `@/config` (through the booking emails), which exits the
// process when the real environment is missing.
vi.mock('@/config', () => ({ config: { RESEND_API_KEY: '', SITE_URL: 'https://cheapestgo.com' } }));
vi.mock('@/lib/hotels/search', () => ({ runTgxSearch: vi.fn() }));
vi.mock('@/lib/hotels/travelgatex', () => ({
  quoteTgx: vi.fn(), bookTgx: vi.fn(), cancelTgx: vi.fn(), fetchAmenitiesByDestination: vi.fn(),
}));
vi.mock('@/lib/hotels/etgContent', () => ({ ensureEtgContent: vi.fn() }));
vi.mock('@/lib/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/redis', () => ({ redis: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
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
import { ensureEtgContent } from '@/lib/hotels/etgContent';
import { HotelsService } from '@/services/hotels.service';

let svc: HotelsService;
beforeEach(() => {
  vi.clearAllMocks();
  svc = new HotelsService();
  (svc as any).repo.findHotelContent.mockResolvedValue({
    hotel_id: 'H1', name: 'Grand', ratehawk_hid: 'slug_1', etg_content_seeded_at: null,
    important_information: null, metapolicy_extra_info: null,
  });
  (svc as any).repo.findHotelReviews.mockResolvedValue(null);
  (svc as any).repo.findHotelReviewItems.mockResolvedValue([]);
  vi.mocked(runTgxSearch).mockResolvedValue({
    data: [{ roomTypes: [{
      offerId: 'o1', roomName: 'Standard Double Room', boardCode: 'BB',
      price: 200, currency: 'USD', refundable: true, refundableTag: 'REFUNDABLE',
    }] }],
  } as any);
});

describe('HotelsService.getProperty() — ETG content', () => {
  it('attaches room.content and property extras when ETG content resolves', async () => {
    vi.mocked(ensureEtgContent).mockResolvedValue({
      roomGroups: [{ name: 'Standard Double Room', images: ['i1'], roomAmenities: ['tv', 'wi-fi'] }],
      amenityGroups: [{ groupName: 'General', amenities: ['Lift'], nonFree: [] }],
      metapolicy: { children: [{ age_start: 0, age_end: 5, inclusion: 'included', price: 0 }] },
      metapolicyExtraInfo: 'ID required.', importantInformation: null,
    } as any);

    const out = await svc.getProperty('H1', { checkIn: '2026-09-10', checkOut: '2026-09-12' });

    expect(out.rooms[0].content?.gallery).toEqual(['i1']);
    expect(out.rooms[0].content?.sections.some((s: any) => s.id === 'media-tech')).toBe(true);
    expect((out.content as any).amenityGroups[0].groupName).toBe('General');
    expect((out.content as any).roomPolicySections[0].id).toBe('child-policy');
    expect((out.content as any).additionalInfo).toContain('ID required.');
  });

  it('leaves rooms unchanged when ETG content is null', async () => {
    vi.mocked(ensureEtgContent).mockResolvedValue(null);
    const out = await svc.getProperty('H1', { checkIn: '2026-09-10', checkOut: '2026-09-12' });
    expect(out.rooms[0].content).toBeUndefined();
    expect((out.content as any).amenityGroups).toBeUndefined();
  });

  it('does not fail the request when ensureEtgContent rejects', async () => {
    vi.mocked(ensureEtgContent).mockRejectedValue(new Error('boom'));
    const out = await svc.getProperty('H1', { checkIn: '2026-09-10', checkOut: '2026-09-12' });
    expect(out.rooms[0].content).toBeUndefined();
  });

  it('leads each room gallery with the photos unique to it', async () => {
    vi.mocked(runTgxSearch).mockResolvedValue({
      data: [{ roomTypes: [
        { offerId: 'o1', roomName: 'Standard Double Room', boardCode: 'BB', price: 200, currency: 'USD' },
        { offerId: 'o2', roomName: 'Deluxe Double Room',   boardCode: 'BB', price: 300, currency: 'USD' },
      ] }],
    } as any);
    vi.mocked(ensureEtgContent).mockResolvedValue({
      roomGroups: [
        { name: 'Standard Double Room', images: ['shared', 's1'], roomAmenities: [] },
        { name: 'Deluxe Double Room',   images: ['shared', 'd1'], roomAmenities: [] },
      ],
      amenityGroups: [], metapolicy: {}, metapolicyExtraInfo: null, importantInformation: null,
    } as any);

    const out = await svc.getProperty('H1', { checkIn: '2026-09-10', checkOut: '2026-09-11' });
    const gallery = (name: string) => out.rooms.find((r: any) => r.name === name)?.content?.gallery;

    expect(gallery('Standard Double Room')).toEqual(['s1', 'shared']);
    expect(gallery('Deluxe Double Room')).toEqual(['d1', 'shared']);
  });
});

describe('HotelsService.getProperty() — prices and ratings', () => {
  it('prices each room per night, because TGX quotes the whole stay', async () => {
    vi.mocked(ensureEtgContent).mockResolvedValue(null);
    // Two nights at a stay total of 200: app-v2 multiplies by the nights again at checkout.
    const out = await svc.getProperty('H1', { checkIn: '2026-09-10', checkOut: '2026-09-12' });
    expect(out.rooms[0].price).toBe(100);
    expect(out.rooms[0].rates[0].price).toBe(100);
  });

  it('uses the stored Google rating when the hotel has no reviews of its own', async () => {
    vi.mocked(ensureEtgContent).mockResolvedValue(null);
    (svc as any).repo.findHotelContent.mockResolvedValue({
      hotel_id: 'H1', name: 'Grand', review_rating: 8.4, review_count: 120,
      google_enriched_at: new Date('2026-09-01'),
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const out = await svc.getProperty('H1', { checkIn: '2026-09-10', checkOut: '2026-09-11' });

    expect(out.reviews).toMatchObject({ rating: 8.4, reviews_count: 120 });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
