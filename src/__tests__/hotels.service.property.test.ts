import { describe, it, expect, vi, beforeEach } from 'vitest';

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
});
