/**
 * Escape text for an HTML body.
 *
 * Every email api-v2 builds by hand interpolates something a customer typed — a guest name, a
 * special request — and a booking's holder email can be changed to any address. Unescaped, that
 * made the amendment email a way to send arbitrary HTML, links included, to anyone, from the
 * brand's own no-reply domain: set the email to a stranger's, put `<a href=…>Claim your
 * refund</a>` in the name. Everything customer-supplied goes through this before it is placed.
 */
export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
