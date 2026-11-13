import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: db.queryRaw } }));

import { saveEvidenceExport, findEvidenceExport } from '@/repositories/paymentEvidenceExport.repository';

const pdf = Buffer.from('%PDF-1.4 fake pack');
const at = new Date('2026-11-13T02:00:00.000Z');

beforeEach(() => db.queryRaw.mockReset());

describe('saveEvidenceExport', () => {
    it('inserts the bytes with their true length and reports what was stored', async () => {
        db.queryRaw.mockResolvedValue([{ id: 'aaaaaaaa-0000-4000-8000-000000000001', size_bytes: pdf.length }]);

        const saved = await saveEvidenceExport({
            paymentIntentId: 'pi_1', generatedAt: at, pdf, exportedBy: 'u1', exportedByEmail: 'a@example.test',
        });

        expect(saved).toEqual({
            id: 'aaaaaaaa-0000-4000-8000-000000000001',
            paymentIntentId: 'pi_1', generatedAt: at, sizeBytes: pdf.length,
        });
        const sql = db.queryRaw.mock.calls[0][0];
        expect(sql.sql).toMatch(/INSERT INTO payment_evidence_exports/);
        // Parameters, never interpolation: the payment id is caller-supplied.
        expect(sql.values).toContain('pi_1');
        expect(sql.values).toContain(pdf);
        expect(sql.values).toContain(pdf.length);
    });

    it('never updates or deletes: a pack is evidence of what was known when it was made', async () => {
        db.queryRaw.mockResolvedValue([{ id: 'x', size_bytes: 1 }]);
        await saveEvidenceExport({ paymentIntentId: 'pi_1', generatedAt: at, pdf });
        expect(db.queryRaw.mock.calls[0][0].sql).not.toMatch(/UPDATE|DELETE|ON CONFLICT/i);
    });
});

describe('findEvidenceExport', () => {
    it('matches the id and the payment together, so one payment\'s link cannot serve another\'s pack', async () => {
        db.queryRaw.mockResolvedValue([]);
        await findEvidenceExport('pi_1', 'aaaaaaaa-0000-4000-8000-000000000001');
        const sql = db.queryRaw.mock.calls[0][0];
        expect(sql.sql).toMatch(/id = .*AND payment_intent_id = /s);
        expect(sql.values).toEqual(['aaaaaaaa-0000-4000-8000-000000000001', 'pi_1']);
    });

    it('returns null when there is no such pack', async () => {
        db.queryRaw.mockResolvedValue([]);
        expect(await findEvidenceExport('pi_1', 'aaaaaaaa-0000-4000-8000-000000000001')).toBeNull();
    });

    it('returns the bytes unchanged as a Buffer', async () => {
        db.queryRaw.mockResolvedValue([{
            id: 'i', payment_intent_id: 'pi_1', generated_at: at,
            content_type: 'application/pdf', size_bytes: pdf.length, pdf: new Uint8Array(pdf),
        }]);
        const found = await findEvidenceExport('pi_1', 'i');
        expect(Buffer.isBuffer(found!.pdf)).toBe(true);
        expect(found!.pdf.equals(pdf)).toBe(true);
        expect(found!.contentType).toBe('application/pdf');
    });
});
