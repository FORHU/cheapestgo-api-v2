import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Exported evidence packs, stored in the database rather than a bucket.
 *
 * Insert-only by design: a pack is evidence of what was known when it was generated, so a later
 * export is a new row. There is no update and no delete here, and that absence is deliberate.
 *
 * Raw SQL, as the rest of the payment back office is: a bytea round-trips as a Buffer either
 * way, and this keeps the module independent of a regenerated Prisma client.
 */

export interface SavedEvidenceExport {
    id: string;
    paymentIntentId: string;
    generatedAt: Date;
    sizeBytes: number;
}

export interface StoredEvidenceExport extends SavedEvidenceExport {
    contentType: string;
    pdf: Buffer;
}

export async function saveEvidenceExport(input: {
    paymentIntentId: string;
    generatedAt: Date;
    pdf: Buffer;
    exportedBy?: string | null;
    exportedByEmail?: string | null;
}): Promise<SavedEvidenceExport> {
    const rows = await prisma.$queryRaw<Array<{ id: string; size_bytes: number }>>(Prisma.sql`
        INSERT INTO payment_evidence_exports
               (payment_intent_id, generated_at, size_bytes, pdf, exported_by, exported_by_email)
        VALUES (${input.paymentIntentId}, ${input.generatedAt}, ${input.pdf.length}, ${input.pdf},
                ${input.exportedBy ?? null}::uuid, ${input.exportedByEmail ?? null})
        RETURNING id::text AS id, size_bytes
    `);
    const row = rows[0];
    return {
        id:              row.id,
        paymentIntentId: input.paymentIntentId,
        generatedAt:     input.generatedAt,
        sizeBytes:       Number(row.size_bytes),
    };
}

/**
 * One stored pack. Looked up by id **and** payment, so a link for one payment cannot be made to
 * serve another's pack by editing the path.
 */
export async function findEvidenceExport(
    paymentIntentId: string,
    id: string,
): Promise<StoredEvidenceExport | null> {
    const rows = await prisma.$queryRaw<Array<{
        id: string; payment_intent_id: string; generated_at: Date;
        content_type: string; size_bytes: number; pdf: Buffer;
    }>>(Prisma.sql`
        SELECT id::text AS id, payment_intent_id, generated_at, content_type, size_bytes, pdf
          FROM payment_evidence_exports
         WHERE id = ${id}::uuid AND payment_intent_id = ${paymentIntentId}
    `);
    const r = rows[0];
    if (!r) return null;
    return {
        id:              r.id,
        paymentIntentId: r.payment_intent_id,
        generatedAt:     r.generated_at,
        contentType:     r.content_type,
        sizeBytes:       Number(r.size_bytes),
        pdf:             Buffer.from(r.pdf),
    };
}
