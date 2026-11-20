/**
 * Every field name in a normalized result that belongs to a supplier rather than to us (#53).
 *
 * The assistant is never to see one: a `_tgxToken`, a `refundableTag`, a `FareSourceCode`. Field
 * *names* are checked, at every depth — the supplier's name as the value of `supplier` is ours.
 */
const SUPPLIER_WORDS = /tgx|travelgate|etg|ratehawk|worldota|onda|duffel|mystifly|refundabletag|faresource|token|^_|raw|otv/i;

export function supplierLeaks(value: unknown, path = ''): string[] {
    if (Array.isArray(value)) return value.flatMap((v, i) => supplierLeaks(v, `${path}[${i}]`));
    if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, v]) => [
            ...(SUPPLIER_WORDS.test(key) ? [`${path}.${key}`] : []),
            ...supplierLeaks(v, `${path}.${key}`),
        ]);
    }
    return [];
}
