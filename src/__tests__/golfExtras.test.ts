import { describe, expect, it } from 'vitest';
import {
    EXTRA_NAMES_EN, courseExtrasSchema, extraChoicesSchema, extrasCourseTotal, parseExtrasParam, priceExtras, sameExtras,
    sanitizeExtras, type ExtraOffer,
} from '@/lib/golf/extras';

const OFFERS: ExtraOffer[] = [{ code: 'caddie', price: 30 }, { code: 'cart', price: 25.5 }];

describe('parseExtrasParam', () => {
    it('reads choices from the checkout address, in list order', () => {
        expect(parseExtrasParam('cart:1,club_rental:2')).toEqual([
            { code: 'club_rental', quantity: 2 }, { code: 'cart', quantity: 1 },
        ]);
    });

    it('drops unknown codes, bad numbers, zeros and repeats', () => {
        expect(parseExtrasParam('sauna:1,cart:x,caddie:0,cart:2,cart:3,caddie:1.5')).toEqual([{ code: 'cart', quantity: 2 }]);
    });

    it('reads nothing as nothing', () => {
        expect(parseExtrasParam(undefined)).toEqual([]);
        expect(parseExtrasParam('')).toEqual([]);
    });
});

describe('lessons and range balls', () => {
    it('read from the address like the others, in list order', () => {
        expect(parseExtrasParam('range_balls:2,lessons:1,caddie:1')).toEqual([
            { code: 'caddie', quantity: 1 }, { code: 'lessons', quantity: 1 }, { code: 'range_balls', quantity: 2 },
        ]);
    });

    it('are priced per item, up to one per player', () => {
        const offers: ExtraOffer[] = [{ code: 'lessons', price: 2000 }, { code: 'range_balls', price: 250 }];
        expect(priceExtras([{ code: 'range_balls', quantity: 2 }, { code: 'lessons', quantity: 1 }], offers, 2)).toEqual({
            ok: true,
            lines: [
                { code: 'lessons', quantity: 1, unitPrice: 2000, courseTotal: 2000 },
                { code: 'range_balls', quantity: 2, unitPrice: 250, courseTotal: 500 },
            ],
        });
        expect(priceExtras([{ code: 'lessons', quantity: 3 }], offers, 2)).toEqual({ ok: false, reason: 'too_many', code: 'lessons' });
    });

    it('have names for the emails', () => {
        expect(EXTRA_NAMES_EN.lessons).toBe('Golf lesson');
        expect(EXTRA_NAMES_EN.range_balls).toBe('Bucket of range balls');
    });

    it('can be sent with a hold and offered by a course', () => {
        expect(extraChoicesSchema.safeParse([{ code: 'lessons', quantity: 1 }, { code: 'range_balls', quantity: 2 }]).success).toBe(true);
        expect(courseExtrasSchema.safeParse({ extras: [{ code: 'lessons', price: 2000 }, { code: 'range_balls', price: 250 }] }).success).toBe(true);
    });
});

describe('sanitizeExtras', () => {
    it('keeps only what is on offer, at most one per player', () => {
        expect(sanitizeExtras(
            [{ code: 'club_rental', quantity: 1 }, { code: 'caddie', quantity: 4 }, { code: 'cart', quantity: 1 }],
            OFFERS, 2,
        )).toEqual([{ code: 'caddie', quantity: 2 }, { code: 'cart', quantity: 1 }]);
    });
});

describe('priceExtras', () => {
    it("prices each line in the course's currency and adds them up", () => {
        expect(priceExtras([{ code: 'cart', quantity: 2 }, { code: 'caddie', quantity: 1 }], OFFERS, 2)).toEqual({
            ok: true,
            lines: [
                { code: 'caddie', quantity: 1, unitPrice: 30, courseTotal: 30 },
                { code: 'cart', quantity: 2, unitPrice: 25.5, courseTotal: 51 },
            ],
        });
    });

    it('refuses an extra the course does not offer, rather than dropping it', () => {
        expect(priceExtras([{ code: 'club_rental', quantity: 1 }], OFFERS, 2))
            .toEqual({ ok: false, reason: 'not_offered', code: 'club_rental' });
    });

    it('refuses more of an extra than there are players', () => {
        expect(priceExtras([{ code: 'caddie', quantity: 3 }], OFFERS, 2))
            .toEqual({ ok: false, reason: 'too_many', code: 'caddie' });
    });

    it('prices no choices as nothing', () => {
        expect(priceExtras([], OFFERS, 2)).toEqual({ ok: true, lines: [] });
    });
});

describe('sameExtras', () => {
    it('compares what was asked for, in any order', () => {
        expect(sameExtras(
            [{ code: 'cart', quantity: 1 }, { code: 'caddie', quantity: 2 }],
            [{ code: 'caddie', quantity: 2 }, { code: 'cart', quantity: 1 }],
        )).toBe(true);
    });

    it('tells a different quantity and a missing extra apart', () => {
        expect(sameExtras([{ code: 'cart', quantity: 1 }], [{ code: 'cart', quantity: 2 }])).toBe(false);
        expect(sameExtras([{ code: 'cart', quantity: 1 }], [])).toBe(false);
    });
});

describe('extrasCourseTotal', () => {
    it("adds up what the course asks, in the course's currency, whatever the customer paid in theirs", () => {
        expect(extrasCourseTotal([
            { code: 'caddie', quantity: 2, unitPrice: 3000, total: 40 },
            { code: 'cart', quantity: 1, unitPrice: 1500, total: 10 },
        ])).toBe(7500);
    });
});

describe('extraChoicesSchema', () => {
    it('defaults to none', () => {
        expect(extraChoicesSchema.parse(undefined)).toEqual([]);
    });

    it('refuses the same extra twice, an unknown code and a bad quantity', () => {
        expect(extraChoicesSchema.safeParse([{ code: 'cart', quantity: 1 }, { code: 'cart', quantity: 2 }]).success).toBe(false);
        expect(extraChoicesSchema.safeParse([{ code: 'sauna', quantity: 1 }]).success).toBe(false);
        expect(extraChoicesSchema.safeParse([{ code: 'cart', quantity: 5 }]).success).toBe(false);
        expect(extraChoicesSchema.safeParse([{ code: 'cart', quantity: 0 }]).success).toBe(false);
    });
});

describe('courseExtrasSchema', () => {
    it('takes prices, free included', () => {
        expect(courseExtrasSchema.parse({ extras: [{ code: 'cart', price: 0 }, { code: 'caddie', price: 30 }] }).extras).toHaveLength(2);
    });

    it('refuses a negative price and the same extra twice', () => {
        expect(courseExtrasSchema.safeParse({ extras: [{ code: 'cart', price: -1 }] }).success).toBe(false);
        expect(courseExtrasSchema.safeParse({ extras: [{ code: 'cart', price: 1 }, { code: 'cart', price: 2 }] }).success).toBe(false);
    });
});
