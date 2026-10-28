/**
 * Booking voucher PDF — the attachment guests hand over at the front desk.
 *
 * Carries the same sections as the email so the two never disagree, plus the
 * things a printed copy needs that a link cannot provide.
 *
 * PDFKit is required lazily: it reads its built-in font metrics from disk at
 * construction, so keeping it out of the module graph means an email send is
 * never blocked by PDF generation failing to initialise.
 */

import type PDFDocumentType from 'pdfkit';
import { formatDate, formatMoney, type BookingEmailView } from './booking-view';

type Doc = InstanceType<typeof PDFDocumentType>;

// ── Layout constants ─────────────────────────────────────────────────────────

const MARGIN     = 48;
const PAGE_WIDTH = 595.28;                        // A4 portrait, points
const CONTENT    = PAGE_WIDTH - MARGIN * 2;

const INK      = '#0f172a';
const BODY     = '#334155';
const MUTED    = '#64748b';
const HAIRLINE = '#e2e8f0';
const ACCENT   = '#2563eb';
const POSITIVE = '#16a34a';
const NEGATIVE = '#e11d48';

// ── Drawing helpers ──────────────────────────────────────────────────────────

/** Starts a new page when `needed` points would overflow the current one. */
function ensureSpace(doc: Doc, needed: number): void {
    if (doc.y + needed > doc.page.height - MARGIN) doc.addPage();
}

function heading(doc: Doc, title: string): void {
    ensureSpace(doc, 56);
    doc.moveDown(1.1);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED)
       .text(title.toUpperCase(), MARGIN, doc.y, { characterSpacing: 1.1 });
    doc.moveDown(0.35);
    const y = doc.y;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT, y).lineWidth(0.75).strokeColor(HAIRLINE).stroke();
    doc.moveDown(0.7);
}

/** Label/value row; the value wraps within its column and drives the row height. */
function row(doc: Doc, label: string, value: string | null | undefined): void {
    if (value == null || String(value).trim() === '') return;

    const labelWidth = 150;
    const valueWidth = CONTENT - labelWidth;
    const text       = String(value);

    doc.font('Helvetica').fontSize(10);
    const height = Math.max(doc.heightOfString(text, { width: valueWidth }), 13);

    ensureSpace(doc, height + 8);
    const y = doc.y;

    doc.font('Helvetica').fontSize(10).fillColor(MUTED)
       .text(label, MARGIN, y, { width: labelWidth - 10 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
       .text(text, MARGIN + labelWidth, y, { width: valueWidth });

    doc.y = y + height + 6;
}

/** Money row with the amount flush right. */
function amountRow(doc: Doc, label: string, amount: string, opts?: { bold?: boolean; color?: string }): void {
    ensureSpace(doc, 22);
    const y    = doc.y;
    const font = opts?.bold ? 'Helvetica-Bold' : 'Helvetica';

    doc.font(font).fontSize(10).fillColor(opts?.color ?? (opts?.bold ? INK : BODY))
       .text(label, MARGIN, y, { width: CONTENT - 130 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(opts?.color ?? INK)
       .text(amount, MARGIN + CONTENT - 130, y, { width: 130, align: 'right' });

    doc.y = y + 17;
}

function divider(doc: Doc): void {
    doc.moveDown(0.3);
    const y = doc.y;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT, y).lineWidth(0.75).strokeColor(HAIRLINE).stroke();
    doc.moveDown(0.5);
}

function paragraph(doc: Doc, text: string, color = BODY): void {
    doc.font('Helvetica').fontSize(10).fillColor(color);
    ensureSpace(doc, doc.heightOfString(text, { width: CONTENT }) + 8);
    doc.text(text, MARGIN, doc.y, { width: CONTENT });
    doc.moveDown(0.4);
}

// ── Document ─────────────────────────────────────────────────────────────────

/**
 * Renders the voucher and resolves with the finished PDF bytes.
 *
 * Buffers in memory rather than streaming: a voucher is a few pages, and the
 * caller needs the whole thing base64-encoded for the Resend attachment anyway.
 */
export async function renderBookingConfirmationPdf(view: BookingEmailView): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit') as typeof PDFDocumentType;

    const doc: Doc = new PDFDocument({
        size:   'A4',
        margin: MARGIN,
        info: {
            Title:   `CheapestGo booking ${view.reference}`,
            Author:  'CheapestGo',
            Subject: `${view.hotel.name} · ${view.stay.checkInLabel} – ${view.stay.checkOutLabel}`,
        },
    });

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on('data',  (chunk: Buffer) => chunks.push(chunk));
        doc.on('end',   () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

    const { guest, hotel, stay, reservation, payment, policy } = view;
    const money = (amount: number) => formatMoney(amount, payment.currency);

    // ── Masthead ─────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text('CheapestGo', MARGIN, MARGIN);
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('Booking voucher', { continued: false });

    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
       .text(`Reference ${view.reference}`, MARGIN, MARGIN + 4, { width: CONTENT, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
       .text(`Status: ${view.status}`, MARGIN, MARGIN + 20, { width: CONTENT, align: 'right' });
    doc.text(`Issued ${formatDate(new Date())}`, MARGIN, MARGIN + 33, { width: CONTENT, align: 'right' });

    doc.y = MARGIN + 58;
    divider(doc);

    doc.font('Helvetica-Bold').fontSize(15).fillColor(INK)
       .text(`${guest.fullName} — stay confirmed`, MARGIN, doc.y, { width: CONTENT });
    doc.moveDown(0.3);
    paragraph(doc, `${hotel.name} is holding your reservation. Present this voucher at check-in.`, MUTED);

    // ── Booking detail ───────────────────────────────────────────────────────
    heading(doc, 'Booking detail');
    row(doc, 'Hotel',      hotel.starRating > 0 ? `${hotel.name}  ${'*'.repeat(Math.min(hotel.starRating, 5))}` : hotel.name);
    row(doc, 'Star rating', hotel.starRating > 0 ? `${hotel.starRating}-star` : null);
    row(doc, 'Address',    [hotel.address, hotel.city, hotel.country].filter(Boolean).join(', ') || null);
    row(doc, 'Check in',   `${stay.checkInLabel}${hotel.checkInTime ? `  (from ${hotel.checkInTime})` : ''}`);
    row(doc, 'Check out',  `${stay.checkOutLabel}${hotel.checkOutTime ? `  (until ${hotel.checkOutTime})` : ''}`);
    row(doc, 'Nights',     String(stay.nights));
    row(doc, 'Property contact', [hotel.contact.phone, hotel.contact.email, hotel.contact.website]
        .filter(Boolean).join('  ·  ') || null);

    // ── Booking information ──────────────────────────────────────────────────
    heading(doc, 'Booking information');
    row(doc, 'Reservation',     view.reference);
    row(doc, 'Room type',       reservation.roomName);
    row(doc, 'Guest',           `${guest.fullName}\n${guest.email}`);
    row(doc, 'Occupancy',       `${reservation.occupancy} · ${reservation.rooms} room${reservation.rooms === 1 ? '' : 's'}`);
    row(doc, 'Special request', reservation.specialRequests);
    if (view.amenities.length > 0) row(doc, 'Hotel amenities', view.amenities.join(' · '));

    // ── Payment ──────────────────────────────────────────────────────────────
    heading(doc, 'Payment details');
    amountRow(
        doc,
        `${reservation.roomName} — ${reservation.rooms} room${reservation.rooms === 1 ? '' : 's'} x ${stay.nights} night${stay.nights === 1 ? '' : 's'} @ ${money(payment.ratePerNight)}`,
        money(payment.roomSubtotal),
    );
    amountRow(doc, 'Taxes and fees', payment.taxesAndFees != null ? money(payment.taxesAndFees) : 'Included');
    if (payment.discount > 0) {
        amountRow(doc, `Discount${payment.voucherCode ? ` (${payment.voucherCode})` : ''}`, `-${money(payment.discount)}`, { color: POSITIVE });
    }
    divider(doc);
    amountRow(doc, 'Total charge', money(payment.totalCharge), { bold: true });
    amountRow(doc, 'Total paid',   money(payment.totalPaid),   { bold: true, color: POSITIVE });

    // ── Cancellation policy ──────────────────────────────────────────────────
    heading(doc, 'Cancellation policy');
    doc.font('Helvetica-Bold').fontSize(11).fillColor(policy.refundable ? POSITIVE : NEGATIVE)
       .text(policy.label, MARGIN, doc.y, { width: CONTENT });
    doc.moveDown(0.4);

    if (policy.summary) paragraph(doc, policy.summary);
    if (policy.freeCancelDeadline) {
        paragraph(doc, `Free cancellation until ${formatDate(policy.freeCancelDeadline)}.`);
    }
    if (policy.currentFee != null) {
        paragraph(doc, `Cancelling on ${formatDate(new Date())} would cost ${money(policy.currentFee)} and refund ${money(policy.currentRefund ?? 0)}.`, MUTED);
    }
    for (const tier of policy.tiers) {
        paragraph(
            doc,
            `Cancel before ${formatDate(tier.deadline)} — ${tier.penalty === 0 ? 'no charge' : `${formatMoney(tier.penalty, tier.currency)} penalty`}`,
            MUTED,
        );
    }
    if (!policy.summary && policy.tiers.length === 0 && !policy.freeCancelDeadline) {
        paragraph(
            doc,
            policy.refundable
                ? 'This rate is refundable. See your booking online for the exact deadline.'
                : 'This rate is non-refundable. Changes and cancellations are not permitted.',
            MUTED,
        );
    }

    // ── Manage online ────────────────────────────────────────────────────────
    heading(doc, 'Manage this booking');
    doc.font('Helvetica').fontSize(10).fillColor(ACCENT)
       .text('View, modify or cancel online', MARGIN, doc.y, { width: CONTENT, link: view.links.view, underline: true });
    doc.moveDown(0.3);
    paragraph(doc, view.links.view, MUTED);

    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
       .text('CheapestGo · support@cheapestgo.com · Keep this voucher for your records.',
             MARGIN, doc.page.height - MARGIN - 12, { width: CONTENT, align: 'center' });

    doc.end();
    return done;
}
