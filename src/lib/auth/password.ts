import { AppError } from '@/middleware/error.middleware';

/**
 * What a password must be, wherever one is *set* — register, reset, change.
 *
 * One rule, here. The storefront's form asked for eight characters, a capital and a digit while
 * the API asked only for eight, so the mobile app, or anyone calling the API directly, could set
 * `password1`. The form's checklist (`PASSWORD_RULES` in app-v2's register form) is a copy of
 * this and has to move with it.
 *
 * Never applied at sign-in: a password already stored under an older rule keeps working until it
 * is next changed.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt reads the first 72 bytes of a password and ignores the rest, so two passwords that
 * agree up to byte 72 are the same password to it. A longer passphrase is therefore weaker
 * than the person who chose it believes, and a non-ASCII one reaches the cut sooner, at two
 * to four bytes a character. Refusing it is the honest fix: accepting a password we will only
 * half read is the bug.
 */
export const PASSWORD_MAX_BYTES = 72;

/** The first rule a password breaks, in words for the person setting it, or null if none. */
export function passwordProblem(password: string, label = 'Password'): string | null {
    if (password.length < PASSWORD_MIN_LENGTH) return `${label} must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    if (!/[A-Z]/.test(password))               return `${label} must contain an uppercase letter.`;
    if (!/\d/.test(password))                  return `${label} must contain a number.`;
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
        return `${label} must be ${PASSWORD_MAX_BYTES} bytes or fewer. Characters outside the basic alphabet count as more than one.`;
    }
    return null;
}

/** Throws the same 422 `VALIDATION_ERROR` the request schemas answer with. */
export function assertPasswordAcceptable(password: unknown, label = 'Password'): asserts password is string {
    if (typeof password !== 'string') throw new AppError(422, `${label} is required.`, 'VALIDATION_ERROR');
    const problem = passwordProblem(password, label);
    if (problem) throw new AppError(422, problem, 'VALIDATION_ERROR');
}
