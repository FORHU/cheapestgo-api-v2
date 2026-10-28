// src/lib/hotels/providers/mock/pricing.ts
import { nightsBetween } from '@/lib/hotels/nights';
import type { MockHotel, MockRatePlan, MockRoomType } from './catalog';

/** Fixed, so a mock price never depends on today's exchange rates. */
const FX_PER_USD: Readonly<Record<string, number>> = { USD: 1, PHP: 56, KRW: 1380, EUR: 0.92 };
const ZERO_DECIMAL = new Set(['KRW']);

export const MOCK_DEFAULT_CURRENCY = 'USD';

export function mockSupportsCurrency(currency: string): boolean {
    return currency.toUpperCase() in FX_PER_USD;
}

export function roundMoney(amount: number, currency: string): number {
    return ZERO_DECIMAL.has(currency.toUpperCase())
        ? Math.round(amount)
        : Math.round(amount * 100) / 100;
}

/** YYYY-MM-DD plus whole days, in UTC so no timezone can move the date. */
export function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** The date of each night of the stay. A same-day or unreadable range is one night, as everywhere else. */
export function nightDates(checkIn: string, checkOut: string): string[] {
    const nights = nightsBetween(checkIn, checkOut);
    return Array.from({ length: nights }, (_, i) => addDays(checkIn, i));
}

/** Friday and Saturday nights cost more. */
function weekendFactor(date: string): number {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return day === 5 || day === 6 ? 1.15 : 1;
}

export function partyFactor(adults: number, children: number): number {
    return 1 + 0.2 * Math.max(0, adults - 2) + 0.1 * Math.max(0, children);
}

export interface PriceArgs {
    hotel:    MockHotel;
    room:     MockRoomType;
    plan:     MockRatePlan;
    checkIn:  string;
    checkOut: string;
    adults:   number;
    children: number;
    currency: string;
}

/** The whole-stay total in `currency`. A pure function of its arguments. */
export function stayTotal(a: PriceArgs): number {
    const perNightUsd = a.hotel.baseNightly * a.room.tier * a.plan.multiplier * partyFactor(a.adults, a.children);
    const usd  = nightDates(a.checkIn, a.checkOut).reduce((sum, d) => sum + perNightUsd * weekendFactor(d), 0);
    const rate = FX_PER_USD[a.currency.toUpperCase()] ?? 1;
    return roundMoney(usd * rate, a.currency);
}
