/**
 * Which brand this process is serving, and how its name is written (ported from v1, C4).
 *
 * v1 runs one container per brand and reads the name from its environment; api-v2 inherits that
 * shape until a cutover decides otherwise — see the note in docs/port-status.md. Anything that
 * addresses a customer by brand reads it from here rather than from a literal, because the
 * failure mode is quiet: an email signed by a company the recipient has never used reads as
 * phishing, and the Korean brand's customers are the ones who would receive it.
 */

/**
 * Brand names that have changed, mapped to what they are called now.
 *
 * The Korean brand was GeomeeGo until the 2026-09 rebrand to AirangGo, and a deployment started
 * with the old value keeps serving it until it is rebuilt. Remove an entry only once no running
 * deployment can still be serving that name.
 */
const RENAMED_BRANDS: Record<string, string> = {
    GeomeeGo: 'AirangGo',
};

/** The brand's current name, whatever historical name the process was started with. */
export function canonicalBrandName(brandName?: string | null): string {
    const raw = (brandName ?? '').trim() || 'CheapestGo';
    return RENAMED_BRANDS[raw] ?? raw;
}

/** The address customer email is sent from, named for the brand the recipient actually used. */
export function fromNoReply(): string {
    const name = canonicalBrandName(process.env.BRAND_NAME ?? process.env.NEXT_PUBLIC_BRAND_NAME);
    const email = process.env.BRAND_EMAIL
        ?? process.env.NEXT_PUBLIC_BRAND_EMAIL
        ?? 'no-reply@mail.cheapestgo.com';
    return `${name} <${email}>`;
}
