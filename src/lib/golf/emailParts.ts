/**
 * What every golf email is made of, to the customer and to the team alike: figures in the charge's own
 * units, times on the course's clock, and one plain card with a button. Inline styles and tables,
 * because that is what mail clients render.
 */

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

export function money(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

/** "Sat, 7 Nov 2026, 9:00 AM" on the course's clock, which is the one a tee time is played on. */
export function when(iso: string, timezone: string | null): string {
    const timeZone = timezone ?? 'UTC';
    const at = new Date(iso);
    const date = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(at);
    const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(at);
    // ICU puts a narrow no-break space before AM/PM, which not every mail client can draw.
    return `${date}, ${time.replace(/\u202f/g, ' ')}`;
}

export function renderGolfEmail({ heading, lead, note, rows, link, action }: {
    heading: string;
    lead:    string;
    note?:   string;
    rows:    Array<[string, string]>;
    link:    string;
    action:  string;
}): string {
    return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(heading)}</h1>
<p style="margin:0 0 ${note ? '8px' : '20px'};font-size:15px;line-height:1.5${note ? '' : ';color:#475569'}">${escapeHtml(lead)}</p>
${note ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#475569">${escapeHtml(note)}</p>` : ''}
</td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right">${escapeHtml(v)}</td></tr>`).join('\n')}
</table></td></tr>
<tr><td style="padding:24px 28px 28px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapeHtml(action)}</a></td></tr>
</table></td></tr></table>
</body></html>`;
}
