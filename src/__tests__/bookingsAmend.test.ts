import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config', () => ({ config: { RESEND_API_KEY: 'test-key' } }));

const repo = {
    findAmendable: vi.fn(),
    amendContact:  vi.fn().mockResolvedValue(undefined),
    notifyAdmins:  vi.fn().mockResolvedValue(undefined),
};
vi.mock('@/repositories/bookings.repository', () => ({
    BookingsRepository: vi.fn(function (this: any) { Object.assign(this, repo); }),
}));

import { BookingsService } from '@/services/bookings.service';
import { escapeHtml } from '@/lib/html';

/**
 * Amending a booking's contact details. The rules below are the ones the old route lacked —
 * each was a real way for a booking, or the brand's own email, to be misused.
 */

const USER = 'user-1';
const BOOKING = {
    id: 'db-1', user_id: USER, property_name: 'Hotel Naru', property_image: null, room_name: 'Deluxe',
    check_in: new Date('2026-10-01'), check_out: new Date('2026-10-03'), guests_adults: 2, guests_children: 0,
    holder_first_name: 'Ana', holder_last_name: 'Cruz', holder_email: 'ana@example.test', special_requests: null,
};

const valid = { bookingId: 'CG-7K2M9Q', firstName: 'Ana', lastName: 'Reyes', email: 'ana.reyes@example.test', remarks: 'High floor' };

let service: BookingsService;
let sent: any[];

beforeEach(() => {
    vi.clearAllMocks();
    repo.findAmendable.mockResolvedValue(BOOKING);
    sent = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
        sent.push(JSON.parse(init.body));
        return new Response('{}', { status: 200 });
    }));
    service = new BookingsService();
});

describe('BookingsService.amend', () => {
    it('changes the contact details and reports what they were before', async () => {
        const result = await service.amend(USER, valid);
        expect(repo.amendContact).toHaveBeenCalledWith('CG-7K2M9Q', {
            firstName: 'Ana', lastName: 'Reyes', email: 'ana.reyes@example.test', remarks: 'High floor',
        });
        expect(result.data.previous).toEqual({ firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.test', remarks: null });
    });

    it('refuses a blank name', async () => {
        await expect(service.amend(USER, { ...valid, firstName: '   ' })).rejects.toMatchObject({ statusCode: 400 });
        expect(repo.amendContact).not.toHaveBeenCalled();
    });

    it('refuses a name longer than the cap every other name field has', async () => {
        // The same kind of field as the profile name once saved at 13,708 characters.
        await expect(service.amend(USER, { ...valid, lastName: 'x'.repeat(31) })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('refuses an address that is not an email', async () => {
        // The booking's confirmation and cancellation emails go here; it must be real.
        await expect(service.amend(USER, { ...valid, email: 'not-an-email' })).rejects.toMatchObject({ statusCode: 400 });
    });

    it("refuses someone else's booking", async () => {
        repo.findAmendable.mockResolvedValue({ ...BOOKING, user_id: 'someone-else' });
        await expect(service.amend(USER, valid)).rejects.toMatchObject({ statusCode: 403 });
        expect(repo.amendContact).not.toHaveBeenCalled();
    });

    it('never sends what the customer typed as markup', async () => {
        // The attack: point the booking at a stranger's address and put a link in the name.
        // The email would arrive from the brand's own no-reply domain.
        const payload = '<a href="https://evil.test">Claim</a>';
        await service.amend(USER, { ...valid, firstName: payload.slice(0, 30), email: 'victim@example.test' });
        await vi.waitFor(() => expect(sent).toHaveLength(1));

        const html: string = sent[0].html;
        expect(html).not.toContain('<a href');
        expect(html).toContain(escapeHtml(payload.slice(0, 30)));
    });

    it('sends as the brand the booking was made on, not a literal CheapestGo', async () => {
        const original = process.env.BRAND_NAME;
        process.env.BRAND_NAME = 'GeomeeGo';
        try {
            await service.amend(USER, valid);
            await vi.waitFor(() => expect(sent).toHaveLength(1));
            expect(sent[0].from).toMatch(/^AirangGo </);
        } finally {
            if (original === undefined) delete process.env.BRAND_NAME; else process.env.BRAND_NAME = original;
        }
    });
});
