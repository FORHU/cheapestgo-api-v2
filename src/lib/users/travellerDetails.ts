/**
 * Birth date, phone and nationality as they may be stored against an account. See mobile #62.
 *
 * These three describe the account holder, and are deliberately not the per-passenger fields a
 * flight order carries: those say who is flying on one trip and are entered per booking. The
 * point of holding them here is that a later booking does not ask a second time.
 *
 * Checked here rather than in the route for the reason `names.ts` gives: more than one entry
 * point enforces the same rule, and a rule written in a route is a rule nobody finds twice.
 */

/** Shaped like `NameCheck` in `./names`, so every account field is checked the same way. */
export interface FieldCheck {
    ok: boolean;
    /** The normalised value to store. Only meaningful when ok. */
    value: string;
    /** Why it was refused, in the words the customer reads. */
    error?: string;
}

/** Nobody alive is older than this, and a typo in the year is the usual reason to see one. */
const MAX_AGE_YEARS = 120;

/**
 * A birth date as `YYYY-MM-DD`.
 *
 * The calendar is checked by round-tripping rather than by a regex over the parts: `2025-02-30`
 * matches any plausible pattern and is not a day, and `Date` rolls it forward to March instead
 * of refusing it. Comparing the formatted result back to the input catches that.
 */
export function checkBirthDate(value: string, now: Date = new Date()): FieldCheck {
    const trimmed = String(value ?? '').trim();
    if (trimmed.length === 0) return { ok: false, value: trimmed, error: 'Birth date is required' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { ok: false, value: trimmed, error: 'Birth date must be in YYYY-MM-DD format' };
    }

    const parsed = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
        return { ok: false, value: trimmed, error: 'Enter a real date' };
    }

    // Compared date to date, not instant to instant: somebody born today in a timezone ahead of
    // ours has a birth date that is legitimately "tomorrow" in UTC for a few hours.
    const today = now.toISOString().slice(0, 10);
    if (trimmed > today) {
        return { ok: false, value: trimmed, error: 'Birth date cannot be in the future' };
    }

    const oldest = new Date(parsed);
    oldest.setUTCFullYear(oldest.getUTCFullYear() + MAX_AGE_YEARS);
    if (oldest.toISOString().slice(0, 10) < today) {
        return { ok: false, value: trimmed, error: 'Check the year of birth' };
    }

    return { ok: true, value: trimmed };
}

/**
 * A phone number in E.164, which is what every supplier that will ever be handed it wants.
 *
 * The country code must be written: a national number is ambiguous without one, and guessing a
 * default country gets it wrong for exactly the travellers least able to notice. Spaces, dashes
 * and brackets are the way people write numbers and are dropped rather than refused.
 */
export function checkPhone(value: string): FieldCheck {
    const trimmed = String(value ?? '').trim();
    if (trimmed.length === 0) return { ok: false, value: trimmed, error: 'Phone number is required' };

    const cleaned = trimmed.replace(/[\s\-().]/g, '');
    if (!/^\+\d{7,15}$/.test(cleaned)) {
        return {
            ok: false,
            value: cleaned,
            error: 'Enter the number with its country code, for example +639171234567',
        };
    }
    return { ok: true, value: cleaned };
}

/**
 * A nationality as an ISO 3166-1 alpha-2 country code, upper-cased.
 *
 * Two letters is all that is checked: the list of valid codes changes, and refusing a real
 * country because our copy of the list is old is worse than storing one that no supplier
 * recognises. `duffelIdentityDocuments.ts` upper-cases the same way when it sends one on.
 */
export function checkNationality(value: string): FieldCheck {
    const trimmed = String(value ?? '').trim().toUpperCase();
    if (trimmed.length === 0) return { ok: false, value: trimmed, error: 'Nationality is required' };
    if (!/^[A-Z]{2}$/.test(trimmed)) {
        return { ok: false, value: trimmed, error: 'Nationality must be a two-letter country code' };
    }
    return { ok: true, value: trimmed };
}
