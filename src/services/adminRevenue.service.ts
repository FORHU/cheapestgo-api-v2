import { prisma } from '@/lib/prisma';
import { enrichBookingFinances } from '@/lib/pricing';

/**
 * What each booking earned, and what it cost to take (C5, on C2's pricing rules).
 *
 * app-v2's revenue screen has been calling `GET /admin/revenue` since it was written; the
 * route did not exist, so the page has been showing its error state. The numbers it wants —
 * markup, Stripe's cut, what is left — are not stored anywhere: only the pieces are, and
 * `enrichBookingFinances` is what turns them into the three figures the screen shows.
 *
 * **A booking with no recorded rate reports zero markup, not an estimated one.** The pieces
 * are missing for real bookings — taken before the columns existed, or written by a path
 * that never filled them — and inventing a plausible margin there would be banked. See the
 * note on `enrichBookingFinances`.
 *
 * **The totals are in USD, at each booking's own locked rate.** Each row still shows the
 * amount in the currency it was charged in — that is what the customer paid and what the
 * card statement says — but a total has to be one unit, and summing PHP with KRW as bare
 * numbers produced a figure that meant nothing. Converting at today's rate instead would
 * restate a closed period every time the page is opened, which is the problem ADR-0008
 * exists to prevent: `usd_amount` is the rate in force when the payment was taken, written
 * once and never recalculated.
 *
 * A booking with no locked rate contributes nothing and is **counted** — `unconvertedCount`
 * says how much of the period is missing from the totals, rather than letting a partial sum
 * pass as a complete one. `npm run backfill-booking-fx` is what resolves those rows.
 */

const PAGE_SIZE = 50;

export class AdminRevenueService {
    async read(params: { page?: unknown; pageSize?: unknown }) {
        const page     = Math.max(1, Number.parseInt(String(params.page ?? '1'), 10) || 1);
        const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(params.pageSize ?? PAGE_SIZE), 10) || PAGE_SIZE));

        const [hotels, flights] = await Promise.all([
            prisma.bookings.findMany({
                orderBy: { created_at: 'desc' },
                take: 500,
                select: {
                    id: true, booking_id: true, status: true, currency: true, created_at: true,
                    total_price: true, supplier_cost: true, charged_price: true, markup_pct: true,
                    usd_amount: true, fx_rate: true,
                    holder_first_name: true, holder_last_name: true, holder_email: true,
                    property_name: true,
                },
            }).catch(() => []),
            prisma.flight_bookings.findMany({
                orderBy: { created_at: 'desc' },
                take: 500,
                select: {
                    id: true, pnr: true, status: true, currency: true, created_at: true,
                    total_price: true, supplier_cost: true, charged_price: true, markup_pct: true,
                    usd_amount: true, fx_rate: true,
                    provider: true, user_id: true,
                },
            }).catch(() => []),
        ]);

        const num = (v: unknown) => (v == null ? 0 : Number(v));

        const rows = [
            ...hotels.map((b: any) => ({
                id:           String(b.id),
                bookingRef:   b.booking_id ?? '',
                type:         'hotel',
                supplier:     'travelgatex',
                customerName: [b.holder_first_name, b.holder_last_name].filter(Boolean).join(' ') || '—',
                email:        b.holder_email ?? null,
                // `charged_price` is what the customer paid; `total_price` is the older
                // column that some rows have instead.
                totalAmount:  num(b.charged_price ?? b.total_price),
                supplierCost: num(b.supplier_cost),
                markupAmount: 0,
                profit:       0,
                markup_pct:   b.markup_pct == null ? null : Number(b.markup_pct),
                currency:     (b.currency ?? 'USD').toUpperCase(),
                usdAmount:    b.usd_amount == null ? null : Number(b.usd_amount),
                fxRate:       b.fx_rate == null ? null : Number(b.fx_rate),
                createdAt:    b.created_at?.toISOString?.() ?? String(b.created_at ?? ''),
            })),
            ...flights.map((f: any) => ({
                id:           String(f.id),
                bookingRef:   f.pnr ?? '',
                type:         'flight',
                supplier:     f.provider ?? 'duffel',
                // flight_bookings carries no contact of its own — the passengers are their own
                // table and the email lives there — so the screen shows the account id rather
                // than a name it would have to invent.
                customerName: f.user_id ? String(f.user_id) : '—',
                email:        null,
                totalAmount:  num(f.charged_price ?? f.total_price),
                supplierCost: num(f.supplier_cost),
                markupAmount: 0,
                profit:       0,
                markup_pct:   f.markup_pct == null ? null : Number(f.markup_pct),
                currency:     (f.currency ?? 'USD').toUpperCase(),
                usdAmount:    f.usd_amount == null ? null : Number(f.usd_amount),
                fxRate:       f.fx_rate == null ? null : Number(f.fx_rate),
                createdAt:    f.created_at?.toISOString?.() ?? String(f.created_at ?? ''),
            })),
        ]
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
            .map(enrichBookingFinances);

        // Everything restated at the booking's own locked rate. A row with no rate scales to
        // nothing rather than being counted at face value in whatever currency it happens to
        // be — a ₩1,200,000 booking added to a USD total as 1,200,000 swamps the period.
        const stats = rows.reduce(
            (acc, b) => {
                const rate = b.usdAmount != null && b.totalAmount > 0 ? b.usdAmount / b.totalAmount : null;
                if (rate === null) {
                    return { ...acc, unconvertedCount: acc.unconvertedCount + 1 };
                }
                return {
                    totalRevenue:     acc.totalRevenue     + b.usdAmount!,
                    totalMarkup:      acc.totalMarkup      + b.markupAmount * rate,
                    totalStripeFees:  acc.totalStripeFees  + b.stripeFee    * rate,
                    totalProfit:      acc.totalProfit      + b.profit       * rate,
                    unconvertedCount: acc.unconvertedCount,
                };
            },
            { totalRevenue: 0, totalMarkup: 0, totalStripeFees: 0, totalProfit: 0, unconvertedCount: 0 },
        );

        const round2 = (n: number) => Math.round(n * 100) / 100;
        const page1  = (page - 1) * pageSize;

        return {
            bookings: rows.slice(page1, page1 + pageSize).map(b => ({
                ...b,
                netProfit: b.profit,
            })),
            total:      rows.length,
            page,
            totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
            stats: {
                totalRevenue:    round2(stats.totalRevenue),
                totalProfit:     round2(stats.totalProfit),
                totalMarkup:     round2(stats.totalMarkup),
                totalStripeFees: round2(stats.totalStripeFees),
                // How many bookings are missing from the four figures above, because no
                // rate was ever locked against them. Shown rather than hidden: a total
                // that silently omits a tenth of the period is worse than one that says so.
                unconvertedCount: stats.unconvertedCount,
            },
            // The totals are in the reporting currency, always — each row still carries the
            // currency it was charged in.
            currency: 'USD',
        };
    }
}

export const adminRevenueService = new AdminRevenueService();
