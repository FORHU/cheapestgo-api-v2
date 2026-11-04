import { z } from 'zod';

/**
 * Golf extras (CONTEXT.md, "Golf Booking"): what a customer can add to a tee time, at a price per item
 * the course sets. Pure, so the quote and the hold price extras the same way and the total shown is
 * the total held.
 */

export const GOLF_EXTRAS = ['club_rental', 'caddie', 'cart', 'lessons', 'range_balls'] as const;
export type GolfExtraCode = (typeof GOLF_EXTRAS)[number];

/** English names, for the emails. */
export const EXTRA_NAMES_EN: Record<GolfExtraCode, string> = {
    club_rental: 'Club rental', caddie: 'Caddie', cart: 'Golf cart', lessons: 'Golf lesson', range_balls: 'Bucket of range balls',
};

/** What the customer asked for. */
export interface ExtraChoice {
    code:     GolfExtraCode;
    quantity: number;
}

/** What the course offers, at its price per item. */
export interface ExtraOffer {
    code:  GolfExtraCode;
    price: number;
}

/** A choice priced in the course's currency. */
export interface PricedExtra {
    code:        GolfExtraCode;
    quantity:    number;
    unitPrice:   number;
    courseTotal: number;
}

/** A line on a booking: `unitPrice` is what the course asks, `total` what the customer pays in theirs. */
export interface BookedExtra {
    code:      GolfExtraCode;
    quantity:  number;
    unitPrice: number;
    total:     number;
}

/** A line as the customer sees it: what the course asks is ours. */
export type CustomerExtra = Pick<BookedExtra, 'code' | 'quantity' | 'total'>;

export type PricedExtras =
    | { ok: true; lines: PricedExtra[] }
    | { ok: false; reason: 'not_offered' | 'too_many'; code: GolfExtraCode };

const round2 = (n: number) => Math.round(n * 100) / 100;
const isExtra = (code: string): code is GolfExtraCode => (GOLF_EXTRAS as readonly string[]).includes(code);
const hasNoRepeats = (list: Array<{ code: string }>) => new Set(list.map((e) => e.code)).size === list.length;

export const byExtraOrder = (a: { code: GolfExtraCode }, b: { code: GolfExtraCode }) =>
    GOLF_EXTRAS.indexOf(a.code) - GOLF_EXTRAS.indexOf(b.code);

/** What a customer sends with a hold. The rules of what can be chosen are `priceExtras`'s. */
export const extraChoicesSchema = z.array(z.object({
    code:     z.enum(GOLF_EXTRAS),
    quantity: z.number().int().min(1).max(4),
})).max(GOLF_EXTRAS.length).default([]).refine(hasNoRepeats, 'Each extra can be chosen once');

/** What an admin saves: the whole set a course offers, at a price per item in its currency. */
export const courseExtrasSchema = z.object({
    extras: z.array(z.object({
        code:  z.enum(GOLF_EXTRAS),
        price: z.coerce.number().min(0, 'Cannot be negative').max(99_999_999.99),
    })).max(GOLF_EXTRAS.length).refine(hasNoRepeats, 'Each extra can be offered once'),
});

/** `club_rental:2,cart:1`, as the checkout asks for a quote. Whatever cannot be read is dropped. */
export function parseExtrasParam(value: string | undefined): ExtraChoice[] {
    if (!value) return [];
    const seen = new Set<string>();
    const out: ExtraChoice[] = [];
    for (const part of value.split(',')) {
        const [code, count] = part.split(':');
        const quantity = Number(count);
        if (!isExtra(code) || seen.has(code) || !Number.isInteger(quantity) || quantity < 1) continue;
        seen.add(code);
        out.push({ code, quantity });
    }
    return out.sort(byExtraOrder);
}

/** Choices a page can show: only extras on offer, at most one per player. An old link still opens. */
export function sanitizeExtras(choices: ExtraChoice[], offers: ExtraOffer[], players: number): ExtraChoice[] {
    const offered = new Set(offers.map((o) => o.code));
    return choices
        .filter((c) => offered.has(c.code) && c.quantity > 0)
        .map((c) => ({ code: c.code, quantity: Math.min(c.quantity, players) }))
        .sort(byExtraOrder);
}

/** Prices choices against the course's offer. Refuses, rather than corrects: this is about to be charged. */
export function priceExtras(choices: ExtraChoice[], offers: ExtraOffer[], players: number): PricedExtras {
    const lines: PricedExtra[] = [];
    for (const choice of [...choices].sort(byExtraOrder)) {
        const offer = offers.find((o) => o.code === choice.code);
        if (!offer) return { ok: false, reason: 'not_offered', code: choice.code };
        if (choice.quantity > players) return { ok: false, reason: 'too_many', code: choice.code };
        lines.push({
            code:        choice.code,
            quantity:    choice.quantity,
            unitPrice:   offer.price,
            courseTotal: round2(offer.price * choice.quantity),
        });
    }
    return { ok: true, lines };
}

/** Whether two sets of choices ask for the same thing. */
export function sameExtras(a: ExtraChoice[], b: ExtraChoice[]): boolean {
    const key = (list: ExtraChoice[]) => [...list].sort(byExtraOrder).map((c) => `${c.code}:${c.quantity}`).join(',');
    return key(a) === key(b);
}

export const customerExtras = (lines: BookedExtra[]): CustomerExtra[] =>
    lines.map(({ code, quantity, total }) => ({ code, quantity, total }));

/** What the course asks for these lines, in its own currency: the figure the team quotes to it. */
export const extrasCourseTotal = (lines: BookedExtra[]): number =>
    round2(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
