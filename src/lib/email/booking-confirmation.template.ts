/**
 * Booking confirmation email body.
 *
 * Table-based layout with inline styles throughout: Gmail strips <style>
 * blocks, and Outlook's Word renderer supports neither flexbox nor grid. Every
 * section degrades to a single readable column when a client ignores widths.
 */

import { formatDate, formatMoney, type BookingEmailView } from './booking-view';

// ── Palette ──────────────────────────────────────────────────────────────────

const INK     = '#0f172a';
const BODY    = '#334155';
const MUTED   = '#64748b';
const HAIRLINE = '#e2e8f0';
const ACCENT  = '#2563eb';
const CANVAS  = '#f8fafc';
const POSITIVE = '#16a34a';
const NEGATIVE = '#e11d48';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ── Primitives ───────────────────────────────────────────────────────────────

/** Emails interpolate user-controlled strings; none of it may become markup. */
function esc(value: unknown): string {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function section(title: string, inner: string): string {
    return `
  <tr><td style="padding:0 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid ${HAIRLINE};border-radius:12px;margin-bottom:20px;">
      <tr><td style="padding:18px 20px 12px;border-bottom:1px solid ${HAIRLINE};">
        <span style="font:600 13px/1.2 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${esc(title)}</span>
      </td></tr>
      <tr><td style="padding:16px 20px 18px;">${inner}</td></tr>
    </table>
  </td></tr>`;
}

/** Label/value rows. Two columns on anything that honours widths, stacked otherwise. */
function rows(pairs: Array<[string, string | null | undefined]>): string {
    const visible = pairs.filter(([, value]) => value != null && String(value).trim() !== '');
    if (visible.length === 0) return '';

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${
        visible.map(([label, value], i) => `
      <tr>
        <td style="padding:${i === 0 ? '0' : '10px'} 12px 0 0;vertical-align:top;width:42%;">
          <span style="font:400 13px/1.5 ${FONT};color:${MUTED};">${esc(label)}</span>
        </td>
        <td style="padding:${i === 0 ? '0' : '10px'} 0 0 0;vertical-align:top;">
          <span style="font:600 14px/1.5 ${FONT};color:${INK};">${value}</span>
        </td>
      </tr>`).join('')
    }</table>`;
}

function button(label: string, href: string, variant: 'primary' | 'ghost'): string {
    const primary = variant === 'primary';
    return `<a href="${esc(href)}" style="display:inline-block;padding:11px 22px;border-radius:10px;
      font:600 14px/1 ${FONT};text-decoration:none;
      background:${primary ? ACCENT : '#ffffff'};color:${primary ? '#ffffff' : INK};
      border:1px solid ${primary ? ACCENT : HAIRLINE};">${esc(label)}</a>`;
}

function stars(rating: number): string {
    if (rating <= 0) return '';
    return `<span style="color:#f59e0b;letter-spacing:1px;">${'★'.repeat(Math.min(rating, 5))}</span>`;
}

// ── Template ─────────────────────────────────────────────────────────────────

export function renderBookingConfirmationHtml(view: BookingEmailView): string {
    const { guest, hotel, stay, reservation, payment, policy, links } = view;
    const money = (amount: number) => formatMoney(amount, payment.currency);

    // 1 ── Confirmation header, name, reference, and the three booking actions.
    const header = `
  <tr><td style="padding:36px 32px 24px;">
    <div style="font:700 24px/1.25 ${FONT};color:${INK};">Your stay is confirmed</div>
    <div style="font:400 15px/1.6 ${FONT};color:${BODY};padding-top:10px;">
      Thanks, ${esc(guest.fullName)} — ${esc(hotel.name)} has your reservation.
    </div>
    <div style="padding-top:16px;">
      <span style="display:inline-block;padding:8px 14px;border-radius:999px;background:${CANVAS};
                   border:1px solid ${HAIRLINE};font:600 13px/1 ${FONT};color:${INK};">
        Booking reference&nbsp;&nbsp;<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(view.reference)}</span>
      </span>
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="padding-top:22px;">
      <tr>
        <td style="padding-right:8px;">${button('View booking', links.view, 'primary')}</td>
        <td style="padding-right:8px;">${button('Modify', links.modify, 'ghost')}</td>
        <td>${button('Cancel', links.cancel, 'ghost')}</td>
      </tr>
    </table>
  </td></tr>`;

    // 2 ── Booking detail: the property itself.
    const location = [hotel.address, hotel.city, hotel.country].filter(Boolean).join(', ');
    const contactParts = [
        hotel.contact.phone   ? `<a href="tel:${esc(hotel.contact.phone)}" style="color:${ACCENT};text-decoration:none;">${esc(hotel.contact.phone)}</a>` : null,
        hotel.contact.email   ? `<a href="mailto:${esc(hotel.contact.email)}" style="color:${ACCENT};text-decoration:none;">${esc(hotel.contact.email)}</a>` : null,
        hotel.contact.website ? `<a href="${esc(hotel.contact.website)}" style="color:${ACCENT};text-decoration:none;">Website</a>` : null,
    ].filter(Boolean);

    const bookingDetail = section('Booking detail', rows([
        ['Hotel', `${esc(hotel.name)}${hotel.starRating > 0 ? ` &nbsp;${stars(hotel.starRating)}` : ''}`],
        ['Address', location ? esc(location) : null],
        ['Check in', `${esc(stay.checkInLabel)}${hotel.checkInTime ? ` <span style="font-weight:400;color:${MUTED};">from ${esc(hotel.checkInTime)}</span>` : ''}`],
        ['Check out', `${esc(stay.checkOutLabel)}${hotel.checkOutTime ? ` <span style="font-weight:400;color:${MUTED};">until ${esc(hotel.checkOutTime)}</span>` : ''}`],
        ['Property contact', contactParts.length > 0 ? contactParts.join(' &nbsp;·&nbsp; ') : null],
    ]));

    // 3 ── Booking information: what was reserved and for whom.
    const amenities = view.amenities.length > 0
        ? `<div style="padding-top:14px;">
             <div style="font:400 13px/1.5 ${FONT};color:${MUTED};padding-bottom:8px;">Hotel amenities</div>
             ${view.amenities.map(a => `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 11px;border-radius:999px;
                background:${CANVAS};border:1px solid ${HAIRLINE};font:500 12px/1 ${FONT};color:${BODY};">${esc(a)}</span>`).join('')}
           </div>`
        : '';

    const bookingInfo = section('Booking information', rows([
        ['Reservation', `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(view.reference)}</span> <span style="font-weight:400;color:${MUTED};">· ${esc(view.status)}</span>`],
        ['Room type', esc(reservation.roomName)],
        ['Guest', `${esc(guest.fullName)}<br><span style="font-weight:400;color:${MUTED};">${esc(guest.email)}</span>`],
        ['Occupancy', `${esc(reservation.occupancy)} · ${reservation.rooms} room${reservation.rooms === 1 ? '' : 's'}`],
        ['Special request', reservation.specialRequests ? esc(reservation.specialRequests) : null],
    ]) + amenities);

    // 4 ── Payment.
    const payLine = (label: string, value: string, opts?: { strong?: boolean; color?: string }) => `
      <tr>
        <td style="padding:7px 0;"><span style="font:${opts?.strong ? '600' : '400'} 14px/1.5 ${FONT};color:${opts?.color ?? (opts?.strong ? INK : BODY)};">${label}</span></td>
        <td style="padding:7px 0;text-align:right;"><span style="font:${opts?.strong ? '700' : '500'} 14px/1.5 ${FONT};color:${opts?.color ?? INK};">${value}</span></td>
      </tr>`;

    const payment_ = section('Payment details', `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${payLine(
          `${esc(reservation.roomName)}<br><span style="font-size:13px;color:${MUTED};">${reservation.rooms} room${reservation.rooms === 1 ? '' : 's'} × ${stay.nights} night${stay.nights === 1 ? '' : 's'} · ${money(payment.ratePerNight)}/night</span>`,
          money(payment.roomSubtotal),
      )}
      ${payment.taxesAndFees != null
          ? payLine('Taxes and fees', money(payment.taxesAndFees))
          : payLine('Taxes and fees', `<span style="font-weight:400;color:${MUTED};">Included</span>`)}
      ${payment.discount > 0
          ? payLine(`Discount${payment.voucherCode ? ` (${esc(payment.voucherCode)})` : ''}`, `−${money(payment.discount)}`, { color: POSITIVE })
          : ''}
      <tr><td colspan="2" style="padding:6px 0;"><div style="height:1px;background:${HAIRLINE};"></div></td></tr>
      ${payLine('Total charge', money(payment.totalCharge), { strong: true })}
      ${payLine('Total paid', money(payment.totalPaid), { strong: true, color: POSITIVE })}
    </table>`);

    // 5 ── Cancellation policy.
    const tierList = policy.tiers.length > 0
        ? `<div style="padding-top:12px;">${policy.tiers.map(t => `
            <div style="font:400 13px/1.7 ${FONT};color:${BODY};">
              Cancel before ${esc(formatDate(t.deadline))} —
              <strong style="color:${INK};">${t.penalty === 0 ? 'no charge' : `${formatMoney(t.penalty, t.currency)} penalty`}</strong>
            </div>`).join('')}</div>`
        : '';

    const policySection = section('Cancellation policy', `
    <div>
      <span style="display:inline-block;padding:6px 12px;border-radius:999px;
        background:${policy.refundable ? '#f0fdf4' : '#fff1f2'};
        border:1px solid ${policy.refundable ? '#bbf7d0' : '#fecdd3'};
        font:600 13px/1 ${FONT};color:${policy.refundable ? POSITIVE : NEGATIVE};">
        ${esc(policy.label)}
      </span>
    </div>
    ${policy.summary ? `<div style="font:400 14px/1.6 ${FONT};color:${BODY};padding-top:12px;">${esc(policy.summary)}</div>` : ''}
    ${policy.freeCancelDeadline
        ? `<div style="font:400 14px/1.6 ${FONT};color:${BODY};padding-top:10px;">
             Free cancellation until <strong style="color:${INK};">${esc(formatDate(policy.freeCancelDeadline))}</strong>.
           </div>`
        : ''}
    ${policy.currentFee != null
        ? `<div style="font:400 13px/1.6 ${FONT};color:${MUTED};padding-top:10px;">
             Cancelling today would cost ${formatMoney(policy.currentFee, payment.currency)} and refund ${formatMoney(policy.currentRefund ?? 0, payment.currency)}.
           </div>`
        : ''}
    ${tierList}`);

    // 6 ── Promotional: flights and things to do at the destination.
    const place = hotel.city ?? hotel.country ?? 'your destination';
    const promo = `
  <tr><td style="padding:4px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${INK};border-radius:12px;margin-bottom:20px;">
      <tr><td style="padding:24px 20px;">
        <div style="font:700 18px/1.3 ${FONT};color:#ffffff;">Make more of ${esc(place)}</div>
        <div style="font:400 14px/1.6 ${FONT};color:#94a3b8;padding-top:8px;">
          You have got the room. Now sort the flights and fill the days in between.
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding-top:18px;">
          <tr>
            <td width="50%" style="vertical-align:top;padding-right:8px;">
              <div style="font:600 15px/1.4 ${FONT};color:#ffffff;">Fly to ${esc(place)}</div>
              <div style="font:400 13px/1.6 ${FONT};color:#94a3b8;padding:6px 0 12px;">
                Compare every major airline at once. Taxes and fees included, no booking fee.
              </div>
              <a href="${esc(links.flights)}" style="font:600 13px/1 ${FONT};color:#ffffff;text-decoration:none;
                 display:inline-block;padding:9px 16px;border-radius:8px;background:${ACCENT};">Search flights</a>
            </td>
            <td width="50%" style="vertical-align:top;padding-left:8px;">
              <div style="font:600 15px/1.4 ${FONT};color:#ffffff;">Things to do nearby</div>
              <div style="font:400 13px/1.6 ${FONT};color:#94a3b8;padding:6px 0 12px;">
                See what is walkable from ${esc(hotel.name)} across your ${stay.nights}-night stay.
              </div>
              <a href="${esc(links.thingsToDo)}" style="font:600 13px/1 ${FONT};color:#ffffff;text-decoration:none;
                 display:inline-block;padding:9px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.25);">Explore the map</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>`;

    const footer = `
  <tr><td style="padding:8px 32px 36px;">
    <div style="height:1px;background:${HAIRLINE};margin-bottom:18px;"></div>
    <div style="font:400 13px/1.7 ${FONT};color:${MUTED};">
      Your full booking details are attached as a PDF — keep it for check-in.
    </div>
    <div style="font:400 12px/1.7 ${FONT};color:${MUTED};padding-top:10px;">
      Questions? Reply to this email or contact
      <a href="mailto:support@cheapestgo.com" style="color:${ACCENT};text-decoration:none;">support@cheapestgo.com</a>.
      If you did not make this booking, tell us immediately.
    </div>
    <div style="font:400 12px/1.7 ${FONT};color:${MUTED};padding-top:14px;">© ${new Date().getFullYear()} CheapestGo · Manila</div>
  </td></tr>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Booking confirmed — ${esc(view.reference)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${esc(hotel.name)} · ${esc(stay.checkInLabel)} – ${esc(stay.checkOutLabel)} · ${esc(view.reference)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;border:1px solid ${HAIRLINE};">
        ${header}
        ${bookingDetail}
        ${bookingInfo}
        ${payment_}
        ${policySection}
        ${promo}
        ${footer}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
