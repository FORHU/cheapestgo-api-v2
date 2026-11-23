import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
    bookings: { findUnique: vi.fn() },
    flight_bookings: { findUnique: vi.fn() },
}));
const pdf = vi.hoisted(() => ({
    renderToBuffer: vi.fn(),
    document: vi.fn((props: unknown) => ({ props })),
}));

vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: pdf.renderToBuffer }));
vi.mock('@/components/InvoicePdfDocument', () => ({ InvoicePdfDocument: pdf.document }));
vi.mock('@/lib/brand', () => ({ canonicalBrandName: () => 'CheapestGo' }));

import { createBookingInvoicePdf } from '@/services/invoicePdf.service';
import type { InvoicePdfProps } from '@/components/InvoicePdfDocument';

beforeEach(() => {
    vi.clearAllMocks();
    pdf.renderToBuffer.mockResolvedValue(Buffer.from('%PDF'));
});

describe('createBookingInvoicePdf', () => {
    it('renders the hotel reservation with the amount actually charged', async () => {
        db.bookings.findUnique.mockResolvedValue({
            id: '11111111-2222-3333-4444-555555555555',
            created_at: new Date('2026-11-18T12:00:00Z'),
            currency: 'PHP',
            charged_price: 12500,
            total_price: 13000,
            holder_first_name: 'Ana',
            holder_last_name: 'Cruz',
            holder_email: 'ana@example.test',
            property_name: 'Hotel Naru',
            room_name: 'Deluxe Twin',
            booking_id: 'FORHU-123-ABC',
            check_in: new Date('2026-12-01T00:00:00Z'),
            check_out: new Date('2026-12-04T00:00:00Z'),
            guests_adults: 2,
            guests_children: 0,
        });

        const result = await createBookingInvoicePdf('11111111-2222-3333-4444-555555555555', 'hotel');
        const props = pdf.document.mock.calls[0][0] as InvoicePdfProps;

        expect(result).toMatchObject({
            filename: 'CheapestGo-Receipt-INV-11111111.pdf',
            buffer: Buffer.from('%PDF'),
        });
        expect(props).toMatchObject({
            billedTo: { name: 'Ana Cruz', email: 'ana@example.test' },
            bookingRef: 'FORHU-123-ABC',
            hotelDetails: { propertyName: 'Hotel Naru', nights: 3 },
            formattedTotal: '₱12,500.00',
        });
    });

    it('renders the flight itinerary and passengers with the charged currency and contact', async () => {
        db.flight_bookings.findUnique.mockResolvedValue({
            id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            created_at: new Date('2026-11-18T12:00:00Z'),
            confirmed_currency: 'PHP',
            payment_currency: 'USD',
            currency: 'USD',
            charged_price: 41230.5,
            confirmed_price: 42000,
            total_price: 50000,
            provider: 'duffel',
            pnr: 'JZRWME',
            trip_type: 'round-trip',
            booking_sessions: { contact: { email: 'ana@example.test' } },
            flight_segments: [{
                airline: 'PAL',
                flight_number: 'PR 424',
                origin: 'MNL',
                destination: 'ICN',
                departure: new Date('2026-12-01T08:15:00Z'),
            }],
            passengers: [{
                first_name: 'Ana',
                last_name: 'Cruz',
                type: 'ADT',
                ticket_number: '0791234567890',
            }],
        });

        await createBookingInvoicePdf('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'flight');
        const props = pdf.document.mock.calls[0][0] as InvoicePdfProps;

        expect(props).toMatchObject({
            billedTo: { name: 'Ana Cruz', email: 'ana@example.test' },
            bookingRef: 'JZRWME',
            flightDetails: {
                segments: [{ airline: 'PAL PR 424', route: 'MNL → ICN' }],
                passengers: [{ name: 'Ana Cruz', ticketNumber: '0791234567890' }],
            },
            formattedTotal: '₱41,230.50',
        });
    });

    it('returns null when the requested booking does not exist', async () => {
        db.bookings.findUnique.mockResolvedValue(null);

        await expect(createBookingInvoicePdf('missing-id', 'hotel')).resolves.toBeNull();
        expect(pdf.renderToBuffer).not.toHaveBeenCalled();
    });
});
