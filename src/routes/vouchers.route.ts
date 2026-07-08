/**
 * Voucher routes
 *
 * POST /api/vouchers/validate  — validate a voucher code against a booking price
 * GET  /api/vouchers/list      — list publicly visible active vouchers
 *
 * Both routes require authentication.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '@/middleware/auth.middleware';
import { AppError } from '@/middleware/error.middleware';
import { prisma } from '@/lib/prisma';

const router = Router();

// ── In-memory sliding-window rate limiter (validation endpoint only) ──────────
// 10 attempts per minute per user — prevents brute-forcing voucher codes.

const VALIDATE_WINDOW_MS    = 60_000;
const VALIDATE_MAX_ATTEMPTS = 10;
const validateAttempts      = new Map<string, number[]>();

function isValidateRateLimited(userId: string): boolean {
    const now        = Date.now();
    const timestamps = validateAttempts.get(userId) ?? [];
    const recent     = timestamps.filter(t => now - t < VALIDATE_WINDOW_MS);

    if (recent.length >= VALIDATE_MAX_ATTEMPTS) {
        validateAttempts.set(userId, recent);
        return true;
    }

    recent.push(now);
    validateAttempts.set(userId, recent);
    return false;
}

// Periodic cleanup (every 5 minutes)
const validateCleanupTimer = setInterval(() => {
    const now = Date.now();
    validateAttempts.forEach((timestamps, userId) => {
        const recent = timestamps.filter(t => now - t < VALIDATE_WINDOW_MS);
        if (recent.length === 0) validateAttempts.delete(userId);
        else validateAttempts.set(userId, recent);
    });
}, 5 * 60_000);
validateCleanupTimer.unref?.();

// ── POST /validate ────────────────────────────────────────────────────────────

router.post('/validate', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;

        if (isValidateRateLimited(userId)) {
            throw new AppError(429, 'Too many attempts. Please wait a minute before trying again.', 'RATE_LIMITED');
        }

        const { code, bookingPrice, currency, hotelId } = req.body as {
            code: string;
            bookingPrice: number;
            currency?: string;
            hotelId?: string;
        };

        if (!code || typeof code !== 'string') {
            throw new AppError(400, 'Missing required field: code', 'VALIDATION_ERROR');
        }
        if (typeof bookingPrice !== 'number' || bookingPrice <= 0) {
            throw new AppError(400, 'bookingPrice must be a positive number', 'VALIDATION_ERROR');
        }

        // Use $queryRaw in case the vouchers table isn't in the generated Prisma client
        const vouchers = await (prisma as any).vouchers.findFirst({
            where: { code: code.trim().toUpperCase(), active: true },
        }).catch(async () => {
            // Fallback: raw query if model not in schema
            const rows = await prisma.$queryRaw<any[]>`
                SELECT * FROM vouchers
                WHERE code = ${code.trim().toUpperCase()} AND active = true
                LIMIT 1
            `;
            return rows[0] ?? null;
        });

        if (!vouchers) {
            return res.json({ valid: false, reason: 'Voucher not found or inactive' });
        }

        const now = new Date();

        // Check expiry
        if (vouchers.expires_at && new Date(vouchers.expires_at) < now) {
            return res.json({ valid: false, reason: 'Voucher has expired' });
        }

        // Check usage cap
        if (vouchers.max_usage != null && vouchers.usage_count >= vouchers.max_usage) {
            return res.json({ valid: false, reason: 'Voucher usage limit reached' });
        }

        // Check hotel restriction
        if (hotelId && vouchers.hotel_id && vouchers.hotel_id !== hotelId) {
            return res.json({ valid: false, reason: 'Voucher is not valid for this hotel' });
        }

        // Check minimum spend
        if (vouchers.min_spend != null && bookingPrice < vouchers.min_spend) {
            return res.json({
                valid:  false,
                reason: `Minimum spend of ${vouchers.min_spend} required`,
            });
        }

        // Calculate discount
        const discountType: 'percent' | 'fixed' = vouchers.discount_type === 'percent' ? 'percent' : 'fixed';
        const discountValue: number = Number(vouchers.discount_value ?? 0);

        let discountAmount: number;
        if (discountType === 'percent') {
            discountAmount = (bookingPrice * discountValue) / 100;
            if (vouchers.max_discount != null) {
                discountAmount = Math.min(discountAmount, vouchers.max_discount);
            }
        } else {
            discountAmount = discountValue;
        }

        const finalPrice = Math.max(0, bookingPrice - discountAmount);

        return res.json({
            valid: true,
            discount: {
                type:  discountType,
                value: discountValue,
                amount: discountAmount,
            },
            finalPrice,
            voucherCode: vouchers.code,
        });
    } catch (err) {
        next(err);
    }
});

// ── POST /record ──────────────────────────────────────────────────────────────

router.post('/record', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.sub;
        const { voucherCode, bookingId, originalPrice, discountApplied, finalPrice, currency } = req.body as {
            voucherCode: string;
            bookingId: string;
            originalPrice: number;
            discountApplied: number;
            finalPrice: number;
            currency: string;
        };

        if (!voucherCode || !bookingId) {
            throw new AppError(400, 'voucherCode and bookingId are required', 'VALIDATION_ERROR');
        }

        await prisma.$executeRaw`
            INSERT INTO voucher_usage (voucher_code, user_id, booking_id, original_price, discount_applied, final_price, currency)
            VALUES (${voucherCode.trim().toUpperCase()}, ${userId}, ${bookingId}, ${originalPrice}, ${discountApplied}, ${finalPrice}, ${currency ?? 'USD'})
        `;

        return res.json({ success: true, data: { recorded: true } });
    } catch (err) {
        next(err);
    }
});

// ── GET /list ─────────────────────────────────────────────────────────────────

router.get('/list', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        // Returns active public vouchers; falls back to $queryRaw if model not in schema
        const vouchers = await (prisma as any).vouchers.findMany({
            where: { active: true, public: true },
            orderBy: { created_at: 'desc' },
        }).catch(async () => {
            return prisma.$queryRaw<any[]>`
                SELECT * FROM vouchers
                WHERE active = true AND public = true
                ORDER BY created_at DESC
            `;
        });

        return res.json({ vouchers });
    } catch (err) {
        next(err);
    }
});

export default router;
