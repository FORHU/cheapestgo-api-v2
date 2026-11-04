import { describe, it, expect } from 'vitest';
import { golfCourseInputSchema, slugify } from '@/lib/golf/courseInput';

/**
 * What an admin may say about a golf course. The database repeats the hard limits as CHECKs; these
 * are the same limits, refused field by field so the form can say which one is wrong.
 */

const base = { name: 'Wack Wack Golf', country: 'Philippines', city: 'Mandaluyong', holes: 18 };

describe('slugify', () => {
    it('joins its parts and keeps a-z and digits', () => {
        expect(slugify('Wack Wack Golf', 'Mandaluyong')).toBe('wack-wack-golf-mandaluyong');
    });

    it('drops accents rather than the letters under them', () => {
        expect(slugify('Club de Golf Señorial', 'Bogotá')).toBe('club-de-golf-senorial-bogota');
    });

    it('collapses punctuation and trims hyphens', () => {
        expect(slugify('  --Sky72: Ocean & Lake--  ')).toBe('sky72-ocean-lake');
    });

    it('stops at 120 characters without ending on a hyphen', () => {
        const slug = slugify(`${'a'.repeat(119)} b`);
        expect(slug.length).toBeLessThanOrEqual(120);
        expect(slug.endsWith('-')).toBe(false);
    });

    it('has nothing to offer a name with no Latin letters', () => {
        expect(slugify('제주 골프', '서귀포')).toBe('');
    });
});

describe('golfCourseInputSchema', () => {
    it('accepts the least a course needs and fills in the rest', () => {
        expect(golfCourseInputSchema.parse(base)).toEqual({
            ...base, slug: null, address: null, description: '', par: null, greenFeeFrom: null,
            currency: 'USD', imageUrls: [], amenities: [], timezone: null, bookingWindowDays: 60, freeCancelHours: 48,
        });
    });

    it('reads empty form fields as not given', () => {
        const out = golfCourseInputSchema.parse({ ...base, slug: '', address: '  ', par: '', greenFeeFrom: '' });
        expect(out).toMatchObject({ slug: null, address: null, par: null, greenFeeFrom: null });
    });

    it('trims text and upper-cases the currency', () => {
        expect(golfCourseInputSchema.parse({ ...base, name: '  Wack Wack  ', currency: 'php' }))
            .toMatchObject({ name: 'Wack Wack', currency: 'PHP' });
    });

    it('refuses what the database would refuse, field by field', () => {
        const result = golfCourseInputSchema.safeParse({
            ...base, name: '', holes: 12, par: 20, greenFeeFrom: -1, currency: 'PESO', slug: 'Not A Slug',
        });
        expect(result.success).toBe(false);
        expect(Object.keys(result.error!.flatten().fieldErrors).sort())
            .toEqual(['currency', 'greenFeeFrom', 'holes', 'name', 'par', 'slug']);
    });

    it('takes images over https only', () => {
        expect(golfCourseInputSchema.safeParse({ ...base, imageUrls: ['http://example.com/a.jpg'] }).success).toBe(false);
        expect(golfCourseInputSchema.parse({ ...base, imageUrls: ['https://example.com/a.jpg'] }).imageUrls)
            .toEqual(['https://example.com/a.jpg']);
    });

    it('knows the amenity list, and lists each one once', () => {
        expect(golfCourseInputSchema.safeParse({ ...base, amenities: ['jacuzzi'] }).success).toBe(false);
        expect(golfCourseInputSchema.parse({ ...base, amenities: ['cart', 'caddie', 'cart'] }).amenities)
            .toEqual(['cart', 'caddie']);
    });
});
