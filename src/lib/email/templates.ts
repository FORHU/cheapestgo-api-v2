/**
 * The confirmation emails, as pure functions.
 *
 * No database, no network, and deliberately no `@/config` — importing that validates the
 * whole environment and exits the process when a database URL is missing, which would make
 * rendering a template in a test or a preview script impossible. A template takes what it is
 * told and returns HTML, so it can be eyeballed without sending anything to a real address.
 *
 * Every value that reaches the markup is escaped. These templates carry a guest's own name,
 * a property name straight from a supplier feed and free-text special requests, none of which
 * is ours to trust, and an email client renders HTML.
 */

import { escapeHtml } from '@/lib/html';
import { canonicalBrandName } from '@/lib/brand';

const BRAND = canonicalBrandName(process.env.BRAND_NAME ?? process.env.NEXT_PUBLIC_BRAND_NAME);

/**
 * Where the links in an email point.
 *
 * A localhost URL in a real email is a dead link, so a development SITE_URL falls back to the
 * public site: the mail is worth nothing to the recipient if "Manage my booking" does not open.
 */
function siteUrl(): string {
    const configured = process.env.SITE_URL ?? 'http://localhost:3000';
    return /localhost|127\.0\.0\.1/.test(configured) ? 'https://cheapestgo.com' : configured;
}

/**
 * Deliberately a hosted URL rather than an inlined `data:` URI: Gmail does not render base64
 * images in HTML mail at all, and a large inlined image pushes the message past Gmail's ~102KB
 * clipping threshold. (v1 learned both of these the hard way.)
 */
function brandIconUrl(): string {
    return `${siteUrl()}/cheapestgo-favico.png`;
}

function money(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'PHP' }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}

function longDate(value: string | Date): string {
    try {
        const d = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
        if (isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
        return String(value);
    }
}

/**
 * A departure or arrival, in the airport's own local time.
 *
 * Read in UTC on purpose. Airlines quote a flight in local wall-clock time with no zone —
 * "departs 22:11" — and `insertFlightSegments` stores exactly that string in a `timestamptz`
 * column, so Postgres tags it `+00`. Reading it back in UTC recovers the wall clock the
 * traveller was shown; reading it in whatever zone the process happens to run in shifts it by
 * that offset. The production container runs UTC, which made this right by accident there and
 * eight hours wrong everywhere else — including in every local test of this email.
 */
function dateTime(value: string | Date): string {
    try {
        const d = value instanceof Date ? value : new Date(value);
        if (isNaN(d.getTime())) return String(value);
        return d.toLocaleString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
        });
    } catch {
        return String(value);
    }
}

// ─── Shared chrome ────────────────────────────────────────────────────────────

/** The masthead, wordmark and outer table every email shares. */
function shell(p: { preheader: string; greetingName: string; panels: string; footerNote: string }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(BRAND)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .stack { display: block !important; width: 100% !important; }
    .stack-pad { padding: 0 0 18px 0 !important; }
    .col2 { display: block !important; width: 100% !important; padding: 0 0 18px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;">
<span style="display:none;font-size:1px;color:#eef2f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(p.preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eef2f7;">
<tr><td align="center" style="padding:20px 12px 32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;">

  <tr><td class="px" style="padding:8px 4px 14px 4px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td align="left">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:9px;line-height:0;"><img src="${brandIconUrl()}" width="26" height="26" alt="${escapeHtml(BRAND)}" style="display:block;width:26px;height:26px;border:0;border-radius:13px;"></td>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">${escapeHtml(BRAND)}</td>
          </tr></table>
        </td>
        <td align="right" style="font-size:15px;font-weight:bold;color:#0f172a;letter-spacing:-0.2px;">Hello, ${escapeHtml(p.greetingName)}</td>
      </tr>
    </table>
  </td></tr>

${p.panels}

  <tr><td class="px" style="padding:16px 8px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#94a3b8;">
    ${escapeHtml(p.footerNote)}<br>
    &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND)}. All rights reserved.<br>
    <a href="${siteUrl()}/account" style="color:#64748b;text-decoration:underline;">Email preferences</a>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function panel(inner: string): string {
    return `  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:18px;">
${inner}
    </table>
  </td></tr>`;
}

/** A label/value table. Values are pre-escaped by the caller so a row can carry markup. */
function rows(pairs: Array<[string, string] | null>): string {
    const kept = pairs.filter((r): r is [string, string] => !!r && r[1] !== '');
    return kept.map(([label, value], i) => {
        const border = i === 0 ? '' : 'border-top:1px solid #eef2f7;';
        return `          <tr>
            <td style="padding:14px 0;${border}color:#64748b;">${escapeHtml(label)}</td>
            <td align="right" style="padding:14px 0;${border}color:#0f172a;font-weight:bold;">${value}</td>
          </tr>`;
    }).join('\n');
}

function firstNameOf(fullName: string): string {
    return (fullName || '').trim().split(/\s+/)[0] || 'there';
}

// ─── Hotel confirmation ───────────────────────────────────────────────────────

export interface HotelConfirmationParams {
    /** The customer-facing reference, e.g. `FORHU-…`. */
    bookingRef:   string;
    /** The row's UUID — what the self-service links address (ADR-0027). */
    bookingDbId?: string | null;
    guestName:    string;
    propertyName: string;
    propertyImage?: string | null;
    propertyAddress?: string | null;
    roomName:     string;
    checkIn:      string;
    checkOut:     string;
    nights:       number;
    adults?:      number;
    children?:    number;
    totalPrice:   number;
    currency:     string;
    /** Credit already netted out of `totalPrice`, shown as its own line. */
    discountAmount?: number;
    /** What the recorded terms say, in a sentence. */
    policyText:   string;
    specialRequests?: string | null;
}

export function buildHotelConfirmationHtml(p: HotelConfirmationParams): string {
    const site      = siteUrl();
    const manageUrl = p.bookingDbId ? `${site}/trips/${p.bookingDbId}` : null;
    const receiptUrl = p.bookingDbId ? `${site}/trips/invoice/${p.bookingDbId}?type=hotel` : null;
    const hasCredit = !!p.discountAmount && p.discountAmount > 0;
    const occupancy = p.adults
        ? `${p.adults} adult${p.adults === 1 ? '' : 's'}${p.children ? `, ${p.children} child${p.children === 1 ? '' : 'ren'}` : ''}`
        : '';
    const mapQuery = encodeURIComponent(p.propertyAddress || p.propertyName);

    const confirmationPanel = panel(`      <tr><td class="px" style="padding:28px 28px 26px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:20px;line-height:26px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">Your booking is now confirmed</div>
        <div style="height:12px;line-height:12px;">&nbsp;</div>
        <div style="font-size:14px;line-height:22px;color:#475569;">For reference, your booking ID is <span style="font-family:'Courier New',Courier,monospace;font-weight:bold;color:#0f172a;">${escapeHtml(p.bookingRef)}</span>. ${manageUrl ? 'To view, cancel, or change your booking, use our self-service.' : 'If you need to view, cancel, or change this booking, please contact support.'}</div>
        ${manageUrl ? `
        <div style="height:22px;line-height:22px;">&nbsp;</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
          <tr><td align="center" bgcolor="#2563eb" style="border-radius:14px;">
            <a href="${manageUrl}" style="display:block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:14px;mso-line-height-rule:exactly;line-height:18px;">Manage my booking</a>
          </td></tr>
        </table>` : ''}
      </td></tr>`);

    const propertyPanel = panel(`      <tr><td class="px" style="padding:20px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            ${p.propertyImage ? `<td width="150" class="stack stack-pad" style="width:150px;padding-right:20px;vertical-align:top;">
              <img src="${escapeHtml(p.propertyImage)}" width="150" height="104" alt="${escapeHtml(p.propertyName)}" style="display:block;width:150px;height:104px;border:0;border-radius:10px;object-fit:cover;background-color:#e2e8f0;">
            </td>` : ''}
            <td class="stack" style="font-family:Arial,Helvetica,sans-serif;vertical-align:top;">
              <div style="font-size:16px;font-weight:bold;color:#0f172a;line-height:21px;">${escapeHtml(p.propertyName)}</div>
              ${p.propertyAddress ? `<div style="height:6px;line-height:6px;">&nbsp;</div><div style="font-size:12px;line-height:18px;color:#94a3b8;">${escapeHtml(p.propertyAddress)}</div>` : ''}
              <div style="height:8px;line-height:8px;">&nbsp;</div>
              <a href="https://www.google.com/maps/search/?api=1&amp;query=${mapQuery}" style="font-size:13px;font-weight:bold;color:#2563eb;text-decoration:none;">Directions</a>
            </td>
          </tr>
        </table>
      </td></tr>`);

    const reservationPanel = panel(`      <tr><td class="px" style="padding:8px 28px 10px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
${rows([
    ['Reservation', `1 room, ${p.nights} night${p.nights === 1 ? '' : 's'}`],
    ['Room type',   escapeHtml(p.roomName)],
    ['Check in',    escapeHtml(longDate(p.checkIn))],
    ['Check out',   escapeHtml(longDate(p.checkOut))],
    ['Lead guest',  escapeHtml(p.guestName)],
    occupancy ? ['Occupancy', escapeHtml(occupancy)] : null,
    p.specialRequests ? ['Special requests', escapeHtml(p.specialRequests)] : null,
])}
        </table>
      </td></tr>`);

    const paymentPanel = panel(`      <tr><td class="px" style="padding:24px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#2563eb;">Your booking is paid and confirmed</td></tr>
      <tr><td class="px" style="padding:8px 28px 4px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
          ${hasCredit ? `
          <tr>
            <td style="padding:12px 0;color:#64748b;">Room total</td>
            <td align="right" style="padding:12px 0;font-family:'Courier New',Courier,monospace;color:#0f172a;">${escapeHtml(money(p.totalPrice + p.discountAmount!, p.currency))}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-top:1px solid #eef2f7;color:#64748b;">${escapeHtml(BRAND)} credit</td>
            <td align="right" style="padding:12px 0;border-top:1px solid #eef2f7;font-family:'Courier New',Courier,monospace;color:#16a34a;">&minus; ${escapeHtml(money(p.discountAmount!, p.currency))}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:14px 0;${hasCredit ? 'border-top:1px solid #e2e8f0;' : ''}font-size:15px;font-weight:bold;color:#0f172a;">You pay</td>
            <td align="right" style="padding:14px 0;${hasCredit ? 'border-top:1px solid #e2e8f0;' : ''}font-family:'Courier New',Courier,monospace;font-size:17px;font-weight:bold;color:#0f172a;">${escapeHtml(money(p.totalPrice, p.currency))}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td class="px" style="padding:8px 28px 24px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="height:1px;line-height:1px;background-color:#eef2f7;">&nbsp;</div>
        <div style="height:18px;line-height:18px;">&nbsp;</div>
        <div style="font-size:14px;font-weight:bold;color:#0f172a;">Cancellation and change policy</div>
        <div style="height:8px;line-height:8px;">&nbsp;</div>
        <div style="font-size:13px;line-height:21px;color:#64748b;">${escapeHtml(p.policyText)}</div>
      </td></tr>`);

    const selfServicePanel = manageUrl ? panel(`      <tr><td class="px" style="padding:24px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#0f172a;">Manage my booking</td></tr>
      <tr><td class="px" style="padding:22px 28px 26px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;">
          <tr>
            <td width="50%" class="col2" style="width:50%;padding-right:16px;vertical-align:top;">
              <a href="${receiptUrl}" style="font-size:13px;font-weight:bold;color:#2563eb;text-decoration:none;">Download a receipt</a>
              <div style="height:6px;line-height:6px;">&nbsp;</div>
              <div style="font-size:12px;line-height:18px;color:#94a3b8;">A receipt you can put on an expense claim.</div>
            </td>
            <td width="50%" class="col2" style="width:50%;vertical-align:top;">
              <a href="${site}/trips" style="font-size:13px;font-weight:bold;color:#e11d48;text-decoration:none;">Cancel booking</a>
              <div style="height:6px;line-height:6px;">&nbsp;</div>
              <div style="font-size:12px;line-height:18px;color:#94a3b8;">Cancel online, subject to the policy above.</div>
            </td>
          </tr>
        </table>
      </td></tr>`) : '';

    return shell({
        preheader:    `Booking ${p.bookingRef} is confirmed — ${p.propertyName}, ${p.nights} night${p.nights === 1 ? '' : 's'}.`,
        greetingName: firstNameOf(p.guestName),
        panels:       [confirmationPanel, propertyPanel, reservationPanel, paymentPanel, selfServicePanel].filter(Boolean).join('\n'),
        footerNote:   `This is a transactional message about booking ${p.bookingRef}.`,
    });
}

// ─── Flight confirmation / awaiting ticket ────────────────────────────────────

export interface FlightSegmentForEmail {
    airline:       string;
    flightNumber?: string | null;
    origin:        string;
    destination:   string;
    departure?:    string | Date | null;
    arrival?:      string | Date | null;
}

export interface FlightConfirmationParams {
    bookingId:  string;
    pnr:        string;
    passengerName: string;
    provider?:  string;
    segments:   FlightSegmentForEmail[];
    totalPrice: number;
    currency:   string;
    ticketNumbers?: string[];
    /**
     * The airline has the booking but has not issued the ticket yet. The email says so rather
     * than claiming a confirmed seat, because "ticketed" is the thing that actually flies.
     */
    awaitingTicket?: boolean;
}

export function buildFlightConfirmationHtml(p: FlightConfirmationParams): string {
    const site      = siteUrl();
    const manageUrl = `${site}/trips/${p.bookingId}`;
    const awaiting  = !!p.awaitingTicket;

    const headline = awaiting ? 'Your flight is booked — ticket on the way' : 'Your flight is confirmed';
    const blurb    = awaiting
        ? 'The airline has your booking and is issuing the ticket. You will get the ticket numbers by email as soon as it is done; no action is needed from you.'
        : 'Your ticket has been issued. Keep your booking reference handy at check-in.';

    const headerPanel = panel(`      <tr><td class="px" style="padding:28px 28px 26px 28px;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:20px;line-height:26px;font-weight:bold;color:#0f172a;letter-spacing:-0.4px;">${escapeHtml(headline)}</div>
        <div style="height:12px;line-height:12px;">&nbsp;</div>
        <div style="font-size:14px;line-height:22px;color:#475569;">Your booking reference is <span style="font-family:'Courier New',Courier,monospace;font-weight:bold;color:#0f172a;">${escapeHtml(p.pnr)}</span>. ${escapeHtml(blurb)}</div>
        <div style="height:22px;line-height:22px;">&nbsp;</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
          <tr><td align="center" bgcolor="#2563eb" style="border-radius:14px;">
            <a href="${manageUrl}" style="display:block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:14px;mso-line-height-rule:exactly;line-height:18px;">View my trip</a>
          </td></tr>
        </table>
      </td></tr>`);

    const segmentRows = p.segments.map((s, i) => {
        const border = i === 0 ? '' : 'border-top:1px solid #eef2f7;';
        const flight = [s.airline, s.flightNumber].filter(Boolean).join(' ');
        // A segment whose departure never made it into the booking row prints no time at all
        // rather than today's date — a wrong departure time in a confirmation is worse than a
        // missing one.
        const when   = s.departure ? dateTime(s.departure) : '';
        return `          <tr>
            <td style="padding:14px 0;${border}color:#64748b;">${escapeHtml(flight || 'Flight')}</td>
            <td align="right" style="padding:14px 0;${border}color:#0f172a;font-weight:bold;">${escapeHtml(`${s.origin} → ${s.destination}`)}${when ? `<div style="font-weight:normal;color:#64748b;font-size:13px;">${escapeHtml(when)}</div>` : ''}</td>
          </tr>`;
    }).join('\n');

    const itineraryPanel = panel(`      <tr><td class="px" style="padding:8px 28px 10px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
${segmentRows || rows([['Itinerary', 'Details are on your trip page']])}
        </table>
      </td></tr>`);

    const detailsPanel = panel(`      <tr><td class="px" style="padding:8px 28px 10px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;">
${rows([
    ['Passenger',   escapeHtml(p.passengerName)],
    ['Reference',   `<span style="font-family:'Courier New',Courier,monospace;">${escapeHtml(p.pnr)}</span>`],
    p.ticketNumbers?.length ? ['Ticket number' + (p.ticketNumbers.length === 1 ? '' : 's'), escapeHtml(p.ticketNumbers.join(', '))] : null,
    p.provider ? ['Issued by', escapeHtml(p.provider)] : null,
    ['Total paid',  escapeHtml(money(p.totalPrice, p.currency))],
])}
        </table>
      </td></tr>`);

    return shell({
        preheader:    awaiting
            ? `Booking ${p.pnr} is confirmed with the airline — ticket to follow.`
            : `Booking ${p.pnr} is ticketed.`,
        greetingName: firstNameOf(p.passengerName),
        panels:       [headerPanel, itineraryPanel, detailsPanel].join('\n'),
        footerNote:   `This is a transactional message about booking ${p.pnr}.`,
    });
}
