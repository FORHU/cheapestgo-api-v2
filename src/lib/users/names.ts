/**
 * How long a person's own name may be (v1's QA BG-9, ported 2026-09-16).
 *
 * Nothing capped it in either system: a live profile was saved with a 13,708-character first
 * name, which then rendered as a wall of text wherever that account is shown. 30 characters per
 * field is the length QA asked for, and it holds the long real names already in the database.
 *
 * The rule lives here rather than in a route because three entry points enforce it — register,
 * profile update, and the Google sign-in that takes a name from someone else's system.
 */
export const NAME_MAX_LENGTH = 30;

export interface NameCheck {
    ok: boolean;
    /** The trimmed value to store. Only meaningful when ok. */
    value: string;
    /** Why it was refused, in the words the customer reads. */
    error?: string;
}

/**
 * A name as it may be stored: trimmed, present, and no longer than the cap.
 *
 * `label` names the field in the message, because "First name is required" and "Last name is
 * required" are different sentences to the person reading them.
 */
export function checkName(value: string, label: string): NameCheck {
    const trimmed = value.trim();
    if (trimmed.length === 0) return { ok: false, value: trimmed, error: `${label} is required` };
    if (trimmed.length > NAME_MAX_LENGTH) {
        return { ok: false, value: trimmed, error: `${label} must be ${NAME_MAX_LENGTH} characters or fewer` };
    }
    return { ok: true, value: trimmed };
}

/**
 * A name that arrived from somewhere we do not control — Google's `given_name`, a supplier's
 * booking holder — where refusing the sign-in would be the wrong answer.
 *
 * Truncated rather than rejected, because the alternative is turning someone away from an
 * account they are entitled to over the length of their own name.
 */
export function clampName(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    return trimmed.slice(0, NAME_MAX_LENGTH);
}
