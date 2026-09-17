/**
 * Record that we are about to ask a supplier to book or cancel something.
 *
 * Written *before* the call, not after. A supplier mutation that times out, throws, or is
 * killed mid-flight has still very likely reached the supplier — logging on success would
 * miss exactly the cases worth having, and logging afterwards would miss the ones that never
 * came back.
 *
 * The gap this closes: on 2026-09-06 a live OTV hotel booking (CG-770AZS) existed at the
 * supplier and nowhere in this database — no `bookings` row, no prebook quote, nothing in the
 * request logs. OTV raised it with us and we could neither confirm nor deny it. A `bookings`
 * row records a *sale*; this records a *supplier call*, which is a different fact and the one
 * that was missing. An attempt with no booking behind it is a reservation somebody is holding
 * that this platform cannot see; an OTV booking with no attempt here reached them from
 * outside this codebase entirely.
 *
 * Recorded at the supplier client rather than at a route, so the trace does not depend on
 * which caller took which path — which is precisely how v1 lost CG-770AZS.
 */

import { prisma } from '@/lib/prisma';
import { canonicalBrandName } from '@/lib/brand';

export type SupplierOperation = 'book' | 'cancel';

export interface AttemptStart {
    provider:  string;
    operation: SupplierOperation;
    clientReference?:   string | null;
    supplierReference?: string | null;
    hotelCode?:         string | null;
}

export interface AttemptOutcome {
    status: 'confirmed' | 'failed';
    supplierReference?: string | null;
    hotelCode?:  string | null;
    hotelName?:  string | null;
    priceGross?: number | null;
    currency?:   string | null;
    error?:      string | null;
}

/**
 * Opens an attempt row and returns its id, or null when it could not be written.
 *
 * Never throws. By the time a book call is made the customer has usually already been
 * charged, so refusing to proceed because the audit row failed would turn a logging outage
 * into lost bookings and stranded payments. A failure here is loud in the logs and leaves the
 * very gap this table exists to close — the lesser harm, but only just.
 */
export async function startSupplierAttempt(input: AttemptStart): Promise<string | null> {
    try {
        const rows = await prisma.$queryRaw<{ id: string }[]>`
            INSERT INTO supplier_booking_attempts (
                provider, operation, client_reference, supplier_reference,
                hotel_code, status, source_brand
            ) VALUES (
                ${input.provider}, ${input.operation},
                ${input.clientReference ?? null}, ${input.supplierReference ?? null},
                ${input.hotelCode ?? null}, 'attempted',
                ${canonicalBrandName(process.env.BRAND_NAME ?? process.env.NEXT_PUBLIC_BRAND_NAME)}
            )
            RETURNING id`;
        return rows[0]?.id ?? null;
    } catch (err: any) {
        console.error(
            `[supplier-attempt] COULD NOT RECORD ${input.operation} to ${input.provider} `
            + `(ref ${input.clientReference ?? '-'}): ${err?.message}. Proceeding untraced.`,
        );
        return null;
    }
}

/** Closes an attempt. A no-op when the open failed, so callers need no null handling. */
export async function finishSupplierAttempt(id: string | null, outcome: AttemptOutcome): Promise<void> {
    if (!id) return;
    try {
        await prisma.$executeRaw`
            UPDATE supplier_booking_attempts SET
                status             = ${outcome.status},
                supplier_reference = COALESCE(${outcome.supplierReference ?? null}, supplier_reference),
                hotel_code         = COALESCE(${outcome.hotelCode ?? null}, hotel_code),
                hotel_name         = ${outcome.hotelName ?? null},
                price_gross        = ${outcome.priceGross ?? null},
                currency           = ${outcome.currency ?? null},
                error              = ${outcome.error?.slice(0, 500) ?? null},
                completed_at       = now()
            WHERE id = ${id}::uuid`;
    } catch (err: any) {
        // The row survives with completed_at NULL, which reads as "we asked and do not know
        // the outcome" — the honest state, and the one the open-attempts index finds.
        console.error(`[supplier-attempt] Could not close attempt ${id}: ${err?.message}`);
    }
}
