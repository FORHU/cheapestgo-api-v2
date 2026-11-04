/**
 * A tee-time schedule as an admin enters it: a named weekly pattern of start times at one price per
 * player, in the course's currency. The database repeats these limits as CHECKs
 * (db/migrations/20261104000002_golf_tee_times.sql); here they are explained field by field.
 */

import { z } from 'zod';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = z.string().trim().regex(TIME, 'A time like 06:30');

export const scheduleInputSchema = z.object({
    name:            z.string().trim().min(1, 'Required').max(80),
    daysOfWeek:      z.array(z.coerce.number().int().min(0).max(6))
        .min(1, 'Pick at least one day')
        .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    firstTee:        time,
    lastTee:         time,
    intervalMinutes: z.coerce.number().int().min(5, 'At least 5 minutes').max(60, 'At most 60 minutes'),
    spots:           z.coerce.number().int().min(1).max(4, 'At most 4 players').default(4),
    pricePerPlayer:  z.coerce.number().min(0, 'Cannot be negative').max(99_999_999.99),
}).superRefine((s, ctx) => {
    // Only when both are times: a malformed one already has its own message.
    if (TIME.test(s.firstTee) && TIME.test(s.lastTee) && s.lastTee < s.firstTee) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lastTee'], message: 'Must not be before the first tee' });
    }
});

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
