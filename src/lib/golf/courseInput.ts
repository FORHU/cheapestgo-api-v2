/**
 * What an admin may say about a golf course, and how its URL key is made.
 *
 * Ported from v1's `src/lib/schemas/golf.ts` (feat/golf-courses @ 0cb892d6), catalogue fields only:
 * tee times, policies and course facts come with the slices that use them. The database repeats the
 * hard limits as CHECKs (db/migrations/20261104000001_golf_courses.sql); this is where they are
 * explained to the person typing.
 */

import { z } from 'zod';
import { isValidTimeZone } from '@/lib/golf/time';
import { DEFAULT_BOOKING_WINDOW_DAYS, DEFAULT_FREE_CANCEL_HOURS, MAX_BOOKING_WINDOW_DAYS, MAX_FREE_CANCEL_HOURS } from '@/lib/golf/rules';

/** What a course can list. Closed, because the storefront has a label for each in every language. */
export const GOLF_AMENITIES = [
    'caddie', 'cart', 'driving_range', 'putting_green', 'clubhouse',
    'restaurant', 'club_rental', 'pro_shop', 'lessons', 'night_golf',
] as const;
export type GolfAmenity = (typeof GOLF_AMENITIES)[number];

export const GOLF_COURSE_STATUSES = ['draft', 'published'] as const;
export type GolfCourseStatus = (typeof GOLF_COURSE_STATUSES)[number];

const HOLES = [9, 18, 27, 36];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A URL key from any text: accents dropped, every run of anything but a-z and 0-9 collapsed to one
 * hyphen, at most 120 characters, never starting or ending with a hyphen. Text with no Latin
 * letters or digits at all (a Hangul name) has no slug, and gives ''.
 */
export function slugify(...parts: string[]): string {
    return parts
        .join(' ')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120)
        .replace(/-+$/, '');
}

/** A form sends '' for a field left empty; that means "not given". */
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const required = (max: number) => z.string().trim().min(1, 'Required').max(max);
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blank, schema.nullable()).default(null);

export const golfCourseInputSchema = z.object({
    slug:         optional(z.string().trim().max(120).regex(SLUG, 'Lowercase letters, digits and single hyphens only')),
    name:         required(200),
    country:      required(100),
    city:         required(100),
    address:      optional(z.string().trim().max(300)),
    description:  z.string().trim().max(10_000).default(''),
    holes:        z.coerce.number().int().refine((n) => HOLES.includes(n), 'Must be 9, 18, 27 or 36'),
    par:          optional(z.coerce.number().int().min(27, 'At least 27').max(144, 'At most 144')),
    greenFeeFrom: optional(z.coerce.number().min(0, 'Cannot be negative').max(99_999_999.99)),
    currency:     z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Three letters, e.g. USD').default('USD'),
    imageUrls:    z.array(z.string().trim().url('Not a URL').startsWith('https://', 'Must start with https://')).max(20).default([]),
    amenities:    z.array(z.enum(GOLF_AMENITIES)).default([]).transform((a) => [...new Set(a)]),
    /** IANA name; tee times are set on this clock. None means the course cannot have schedules yet. */
    timezone:     optional(z.string().trim().refine(isValidTimeZone, 'Not a time zone')),
    bookingWindowDays: z.coerce.number().int()
        .min(1, 'At least 1 day').max(MAX_BOOKING_WINDOW_DAYS, `At most ${MAX_BOOKING_WINDOW_DAYS} days`)
        .default(DEFAULT_BOOKING_WINDOW_DAYS),
    /** How long before a tee time a customer may still cancel for free. */
    freeCancelHours: z.coerce.number().int()
        .min(0, 'Cannot be negative').max(MAX_FREE_CANCEL_HOURS, `At most ${MAX_FREE_CANCEL_HOURS} hours`)
        .default(DEFAULT_FREE_CANCEL_HOURS),
});

export type GolfCourseInput = z.infer<typeof golfCourseInputSchema>;
